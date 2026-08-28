import { writable } from 'svelte/store';
import db, { getAllActiveTasksWithReminders, updateTask, getTaskById } from './db';
import { invokeTauri, isTauri as isTauriPlatform, getQuietHours, getNotificationsEnabled } from '../config';
import type { TaskDoc, ProjectDoc } from './types';

// Spread queued reminders out instead of letting them all land on the
// window's end instant: a dozen reminders firing in the same tick present to
// Android's notification manager (or the Windows toast queue) as a burst,
// which some OSes throttle or collapse rather than showing individually.
// 15s * a reminder's position in the current scheduling pass keeps a
// realistic queue spread over seconds-to-minutes without meaningfully
// delaying anyone.
const QUIET_HOURS_STAGGER_STEP_MS = 15_000;

// Quiet hours: if `at` falls inside the configured local wall-clock
// window, returns the Date for the window's end instead (the next
// occurrence of the end time after `at`, plus `staggerIndex` *
// QUIET_HOURS_STAGGER_STEP_MS so a batch of queued reminders doesn't all
// land on the same instant) — the reminder queues rather than firing.
// Returns `at` unchanged when quiet hours are off or `at` isn't inside
// the window (stagger never applies to an on-time reminder). Exported
// for tests/notifications.test.ts.
export function applyQuietHours(at: Date, staggerIndex = 0): Date {
  const q = getQuietHours();
  if (!q.enabled) return at;
  const [sh, sm] = q.start.split(':').map(Number);
  const [eh, em] = q.end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const atMin = at.getHours() * 60 + at.getMinutes();
  const wraps = startMin > endMin; // e.g. 22:00 -> 07:00
  const inWindow = wraps ? (atMin >= startMin || atMin < endMin) : (atMin >= startMin && atMin < endMin);
  if (!inWindow) return at;
  const end = new Date(at);
  end.setHours(eh, em, 0, 0);
  // Only push to the next day when `at` is on the pre-midnight side of a
  // wrapping window (e.g. 23:00 with 22:00->07:00 ends 07:00 tomorrow);
  // the post-midnight side (e.g. 02:00) already ends later the same day.
  if (wraps && atMin >= startMin) end.setDate(end.getDate() + 1);
  return new Date(end.getTime() + staggerIndex * QUIET_HOURS_STAGGER_STEP_MS);
}

// Set by a notification click (native action or web Notification.onclick).
// App.svelte watches this to open the corresponding task.
export const pendingOpenTaskId = writable<string | null>(null);

// A notification action ("Done"/"Snooze 1h" straight from the toast) that
// failed its underlying updateTask() write. Same store-and-let-App-react
// pattern as pendingOpenTaskId above, deliberately NOT a direct
// showError() import: store.ts already imports this module, so importing it
// back would be a circular import and would break the one-directional layer
// rule. These handlers can't be awaited by their caller (they run inside a
// plain OS callback), and swallowing the rejection outright would mean the
// user taps "Done" on a reminder, nothing happens, and nothing says so.
export const notificationActionError = writable<string>('');

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export const permissionState = writable<PermissionState>('default');

// Android 12+ splits notification scheduling into two separate grants:
// POST_NOTIFICATIONS (can this app show a notification at all — the
// `permissionState` above) and the "Alarms & reminders" special access
// (can this app fire one at an *exact* time via AlarmManager). The second
// one has no in-app runtime prompt dialog — it's a system settings toggle
// — so a reminder can look "scheduled" while actually being silently
// delivered late (batched into the OS's next inexact wakeup window,
// sometimes minutes off) with nothing in the UI explaining why. Only
// meaningful on native; stays 'unsupported' on web (reminders there are
// setTimeout-based and don't go through AlarmManager at all).
export type ExactAlarmState = 'granted' | 'denied' | 'unsupported';
export const exactAlarmState = writable<ExactAlarmState>('unsupported');

// Bare-called from onMount and button handlers with no local error handling
// at any call site, so a plugin-call rejection is caught here instead of
// becoming an unhandled rejection -- 'denied' is the safe fallback state.
export async function checkExactAlarmPermission(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.checkExactNotificationSetting();
    exactAlarmState.set(res.exact_alarm === 'granted' ? 'granted' : 'denied');
  } catch {
    exactAlarmState.set('denied');
  }
}

// Deep-links to the OS "Alarms & reminders" settings screen for this app —
// there's no runtime permission dialog for this one, unlike requestPermission().
export async function requestExactAlarmPermission(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.changeExactNotificationSetting();
    exactAlarmState.set(res.exact_alarm === 'granted' ? 'granted' : 'denied');
  } catch {
    exactAlarmState.set('denied');
  }
}

const isNative = () => !!window.Capacitor?.isNativePlatform?.();
// Desktop (Tauri) is neither Capacitor-native nor a plain browser — it
// embeds a real WebView2, but that WebView has no default handler for the
// browser Notification permission-prompt flow: Notification.requestPermission()
// silently resolves to "denied" with no OS prompt ever shown. tauri-plugin-
// notification talks to real Windows toast notifications instead,
// sidestepping WebView2's permission model entirely — same reasoning as
// why Android needs @capacitor/local-notifications instead of the web API.
// Deterministic 32-bit integer id from a task's string id — Capacitor's
// local-notifications plugin requires numeric ids.
function numericId(taskId: string): number {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) {
    h = (h * 31 + taskId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

// Bare-called from Enable buttons with no local error handling, so a
// plugin-call rejection is caught here instead of becoming an unhandled
// rejection -- 'denied' is the safe fallback state.
export async function requestPermission(): Promise<PermissionState> {
  try {
    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const res = await LocalNotifications.requestPermissions();
      const state: PermissionState = res.display === 'granted' ? 'granted' : 'denied';
      permissionState.set(state);
      return state;
    }
    if (isTauriPlatform()) {
      // tauri-plugin-notification has no real permission model to request
      // against, but Windows does -- query it directly (see
      // check_desktop_notification_setting's own comment).
      const enabled = await invokeTauri<boolean>('check_desktop_notification_setting');
      const state: PermissionState = enabled ? 'granted' : 'denied';
      permissionState.set(state);
      return state;
    }
    if (typeof Notification === 'undefined') {
      permissionState.set('unsupported');
      return 'unsupported';
    }
    const res = await Notification.requestPermission();
    const state = res as PermissionState;
    permissionState.set(state);
    return state;
  } catch {
    permissionState.set('denied');
    return 'denied';
  }
}

export function checkPermission(): void {
  if (isNative() || isTauriPlatform()) return; // resolved lazily via initNotificationListeners() instead
  if (typeof Notification === 'undefined') { permissionState.set('unsupported'); return; }
  permissionState.set(Notification.permission as PermissionState);
}

// ── Web scheduling (best-effort — see docs/tech.md for the "app must stay
// running" caveat; there's no push backend behind this local-first app) ──
//
// DST/timezone: reminder_at is stored as an absolute ISO instant (UTC epoch
// under the hood). Every delay computed below is
// `new Date(reminder_at).getTime() - Date.now()` — plain epoch-ms
// arithmetic, DST-safe by construction, with no local-time component for a
// DST transition to corrupt. Keep it that way. The native path
// (scheduleNative below) hands Android's AlarmManager an absolute Date for
// the same reason.

const _webTimers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_TIMEOUT = 2_147_483_647; // setTimeout's 32-bit signed int limit (~24.8 days)

// Guards against firing the same reminder twice within one app session.
// rescheduleAll() can be triggered by overlapping/rapid-fire reload()
// calls (several doc writes in quick succession each trigger their own
// live-sync change event) — without this, catchUpWeb() and a live
// setTimeout can both fire for the same task before the DB write that
// clears reminder_at has round-tripped back through the reactive
// reload chain, producing 2-3 duplicate notifications for one reminder.
//
// Must be keyed by `${id}:${reminder_at}`, not by task id alone: a task id
// on its own means that once ANY reminder on a task fires, this set (never
// cleared) silently blocks every future reminder on that task for the rest of
// the session. Keying by the exact instant still blocks the race above (both
// paths compute the identical key for the same pending reminder_at) while
// treating a later, different reminder_at on the same task as fireable.
const _firedIds = new Set<string>();
function firedKey(task: TaskDoc): string { return `${task._id}:${task.reminder_at}`; }

// The set is only a short-lived duplicate-suppression guard -- once a
// reminder has fired and its write has settled, the key has no further job.
// Left unbounded it grows by one string per fired reminder for the life of
// the process, which for the tray-resident desktop app can be weeks. Trim
// oldest-first, well above any plausible same-session backlog, so the dedupe
// behaviour is unchanged in practice.
const FIRED_IDS_MAX = 500;
function rememberFired(key: string) {
  _firedIds.add(key);
  if (_firedIds.size > FIRED_IDS_MAX) {
    const oldest = _firedIds.values().next().value as string | undefined;
    if (oldest !== undefined) _firedIds.delete(oldest);
  }
}

// Returns the clearing write's promise (rather than firing it detached) so
// catchUpWeb() can wait for it to land. Production callers may ignore the
// returned promise; tests must await it rather than padding with an arbitrary
// setTimeout, which isn't reliably long enough under parallel load.
function fireWebNotification(task: TaskDoc): Promise<void> {
  const id = task._id!;
  const key = firedKey(task);
  if (_firedIds.has(key)) return Promise.resolve();
  rememberFired(key);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return Promise.resolve();
  const n = new Notification(task.title, {
    body: task.due_date ? `Due ${task.due_date}` : 'Reminder',
    tag: id,
  });
  n.onclick = () => {
    window.focus();
    pendingOpenTaskId.set(id);
    n.close();
  };
  // Reminders are one-shot, not recurring — clear it once shown so an
  // unrelated later save/reload doesn't re-trigger the same notification
  // via the catch-up check (it would otherwise keep re-firing for as
  // long as reminder_at stays inside the catch-up window). A failed clear
  // isn't user-initiated and isn't worth a toast — the notification already
  // fired, and the next catch-up pass retries the same clear.
  return updateTask(id, { reminder_at: null }).then(() => {}, () => {});
}

function scheduleWeb(task: TaskDoc, staggerIndex = 0) {
  const id = task._id!;
  const existing = _webTimers.get(id);
  if (existing) clearTimeout(existing);
  if (!task.reminder_at) return;
  const delay = applyQuietHours(new Date(task.reminder_at), staggerIndex).getTime() - Date.now();
  if (delay <= 0) return; // handled by the catch-up check instead
  // Too far out to schedule now — picked up on a later reload() once it's
  // within range instead (every app open + every live sync change calls
  // rescheduleAll()). This only drops a reminder if it is >24.8 days out AND
  // the web app is never opened again until after it is due — an accepted
  // residual edge case rather than a background re-check timer. The native
  // path has no such limit.
  if (delay > MAX_TIMEOUT) return;
  _webTimers.set(id, setTimeout(() => { fireWebNotification(task); _webTimers.delete(id); }, delay));
}

function cancelWeb(taskId: string) {
  const existing = _webTimers.get(taskId);
  if (existing) { clearTimeout(existing); _webTimers.delete(taskId); }
}

// Reminders due while the app/tab wasn't open can't fire on web (no push
// server behind this app) — fire them immediately on load instead, as
// long as they're not too stale to be useful.
//
// A reminder past this window must be explicitly cleared, not just skipped:
// otherwise it is never fired (too stale) and never cleared, stays "active"
// indefinitely, and re-enters this same dead-end check on every reload. Every
// stale reminder gets closed out one way or the other, never left dangling.
// Exported for tests/notifications.test.ts. Returns a promise resolving once
// every fire/clear write below has landed -- production callers need not
// await it, but tests must, rather than racing a setTimeout against real
// PouchDB writes.
//
// The 24h window is deliberately generous: a reminder that came due while the
// app wasn't running is fired late rather than dropped. Anything past the
// window has its reminder_at cleared, so too short a window silently destroys
// the user's setting without it ever firing -- easy to hit on desktop, where
// scheduling is setTimeout-based and needs the app running (e.g. a 23:00
// reminder deferred to 07:00 by quiet hours on a machine that's off
// overnight). 24h covers a normal overnight or workday gap.
const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function catchUpWeb(tasks: TaskDoc[]): Promise<void> {
  const now = Date.now();
  const pending: Promise<void>[] = [];
  let queuedCount = 0;
  for (const t of tasks) {
    if (!t.reminder_at) continue;
    const at = new Date(t.reminder_at).getTime();
    if (at > now) continue; // still in the future — scheduleWeb() owns this one
    if (now - at < CATCH_UP_WINDOW_MS) {
      // Firing "now" — if quiet hours are currently active, queue until
      // they end instead of firing immediately, same as a future
      // reminder would via scheduleWeb()'s applyQuietHours() call.
      // Staggered by queue position so a whole backlog doesn't land on
      // the OS notification queue in the same instant.
      const fireAt = applyQuietHours(new Date(now), queuedCount).getTime();
      if (fireAt > now) {
        queuedCount++;
        const id = t._id!;
        const existing = _webTimers.get(id);
        if (existing) clearTimeout(existing);
        _webTimers.set(id, setTimeout(() => { fireWebNotification(t); _webTimers.delete(id); }, fireAt - now));
      } else {
        pending.push(fireWebNotification(t));
      }
    }
    else pending.push(updateTask(t._id!, { reminder_at: null }).then(() => {}, () => {}));
  }
  return Promise.all(pending).then(() => {});
}

// ── Native (Android) scheduling — genuinely fires while the app is fully
// closed, since it's handed off to the OS scheduler ──

// "Done" and "Snooze 1h" action buttons on the notification itself — lets a
// reminder be handled from the lock screen without opening the app. Must be
// registered before any notification using this actionTypeId is scheduled
// (Android reads the action type at schedule time, not at display time).
const REMINDER_ACTION_TYPE = 'REMINDER_ACTIONS';

// Android 8+ requires a notification channel per notification, and every
// scheduled notification must carry a matching channelId. Without an explicit
// one, the OS/plugin falls back to an auto-created "Default" channel at
// IMPORTANCE_DEFAULT or lower: no guaranteed sound, no heads-up popup, and
// its importance is then fixed forever at whatever it was on first
// auto-creation (apps cannot change a channel's importance afterwards, only
// the user can, via system settings). An explicit high-importance channel,
// created once up front, is the only way to guarantee sound + heads-up.
const REMINDER_CHANNEL_ID = 'reminders';

async function ensureReminderChannel() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.createChannel({
    id: REMINDER_CHANNEL_ID,
    name: 'Task reminders',
    description: 'Reminders for tasks with a due date or reminder time',
    importance: 5, // IMPORTANCE_HIGH — sound + heads-up popup
    visibility: 1, // VISIBILITY_PUBLIC — full content on lock screen
    vibration: true,
  });
}

async function scheduleNative(tasks: TaskDoc[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await ensureReminderChannel();
  await LocalNotifications.registerActionTypes({
    types: [{
      id: REMINDER_ACTION_TYPE,
      actions: [
        { id: 'done', title: 'Done' },
        { id: 'snooze', title: 'Snooze 1h' },
      ],
    }],
  });
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  }
  const toSchedule = tasks
    .filter(t => t.reminder_at && new Date(t.reminder_at).getTime() > Date.now())
    .map((t, i) => ({
      id: numericId(t._id!),
      title: t.title,
      body: t.due_date ? `Due ${t.due_date}` : 'Reminder',
      schedule: { at: applyQuietHours(new Date(t.reminder_at!), i) },
      extra: { taskId: t._id },
      actionTypeId: REMINDER_ACTION_TYPE,
      channelId: REMINDER_CHANNEL_ID,
    }));
  if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule });
}

// ── Native (Tauri desktop) scheduling — real Windows toast notifications,
// but on a JS timer, same mechanism as scheduleWeb() above ──
//
// tauri-plugin-notification's desktop backend never reads the `schedule`
// field — scheduling is only implemented on mobile, where the OS owns the
// wakeup. A "scheduled" notification on desktop therefore either does nothing
// or fires immediately, ignoring the requested time. So the desktop path must
// do what scheduleWeb() does (a JS setTimeout, since the app stays running)
// and display a real native toast at fire time instead of using the browser
// Notification API. Reuses _webTimers/_firedIds — mutually exclusive with the
// web path at runtime (one platform per session), so sharing that is safe.

// tauri-plugin-notification's desktop backend wires up no click or action
// callback at all, so a clicked toast can never reach the app. Its
// isPermissionGranted()/requestPermission() are also hardcoded to return
// granted on desktop, and its channel/actionType concepts are meaningless
// there. Reminders therefore bypass the plugin entirely: a custom Rust
// command (send_task_notification) builds the toast with
// tauri-winrt-notification, whose on_activated callback works, and emits a
// real Tauri event listened for below.
function fireTauriNotification(task: TaskDoc): Promise<void> {
  const id = task._id!;
  const key = firedKey(task);
  if (_firedIds.has(key)) return Promise.resolve();
  rememberFired(key);
  invokeTauri('send_task_notification', {
    title: task.title,
    body: task.due_date ? `Due ${task.due_date}` : 'Reminder',
    taskId: id,
  }).catch(() => {});
  // Return the updateTask promise rather than swallowing it silently, same
  // as fireWebNotification() above.
  return updateTask(id, { reminder_at: null }).then(() => {}, () => {});
}

function scheduleTauriTimer(task: TaskDoc, staggerIndex = 0) {
  const id = task._id!;
  const existing = _webTimers.get(id);
  if (existing) clearTimeout(existing);
  if (!task.reminder_at) return;
  const delay = applyQuietHours(new Date(task.reminder_at), staggerIndex).getTime() - Date.now();
  if (delay <= 0 || delay > MAX_TIMEOUT) return; // handled by catchUpTauri, or too far out for this session
  _webTimers.set(id, setTimeout(() => { fireTauriNotification(task); _webTimers.delete(id); }, delay));
}

// Same reasoning as catchUpWeb() — a reminder due while the app wasn't
// running has no OS-level catch-up on desktop either (see this section's
// header comment), so fire it on load instead if it's not too stale.
function catchUpTauri(tasks: TaskDoc[]) {
  const now = Date.now();
  // Shares catchUpWeb()'s 24h window — desktop scheduling is setTimeout-based,
  // so this is the path where an overnight gap would otherwise wipe a
  // reminder. See that constant's comment.
  let queuedCount = 0;
  for (const t of tasks) {
    if (!t.reminder_at) continue;
    const at = new Date(t.reminder_at).getTime();
    if (at > now) continue;
    if (now - at < CATCH_UP_WINDOW_MS) {
      const fireAt = applyQuietHours(new Date(now), queuedCount).getTime();
      if (fireAt > now) {
        queuedCount++;
        const id = t._id!;
        const existing = _webTimers.get(id);
        if (existing) clearTimeout(existing);
        _webTimers.set(id, setTimeout(() => { fireTauriNotification(t); _webTimers.delete(id); }, fireAt - now));
      } else {
        fireTauriNotification(t);
      }
    }
    else updateTask(t._id!, { reminder_at: null }).then(() => {}, () => {}); // see fireWebNotification()'s comment on this pattern
  }
}

async function scheduleTauri(tasks: TaskDoc[]) {
  for (const id of [..._webTimers.keys()]) cancelWeb(id);
  tasks.forEach((t, i) => scheduleTauriTimer(t, i));
  catchUpTauri(tasks);
}

// Moves a task to its project's last column — the same "done" rule used
// everywhere else in the app: "done" is positional, column_id ===
// columns.at(-1), and there is no separate done boolean.
async function completeTaskFromNotification(taskId: string): Promise<void> {
  const task = await getTaskById(taskId);
  if (!task) return;
  const project = await db.get(task.project_id) as ProjectDoc;
  const lastCol = project.columns.at(-1);
  if (!lastCol) return;
  await updateTask(taskId, { column_id: lastCol.id, reminder_at: null });
}

async function snoozeTaskFromNotification(taskId: string): Promise<void> {
  const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await updateTask(taskId, { reminder_at: at });
  // rescheduleAll() runs on the next store reload (triggered by the write
  // above via the live change feed) and will pick up the new reminder_at —
  // no need to reschedule this one notification directly here.
}

export async function initNotificationListeners(): Promise<void> {
  if (isTauriPlatform()) {
    // tauri-plugin-notification's own isPermissionGranted()/requestPermission()
    // are hardcoded to return granted on desktop, but Windows' real per-app
    // toggle is queryable directly -- see requestPermission()'s Tauri branch
    // and check_desktop_notification_setting's own comment.
    await requestPermission();
    const { listen } = await import('@tauri-apps/api/event');
    await listen<[string, string]>('notification-action', (event) => {
      const [actionId, taskId] = event.payload;
      if (!taskId) return;
      if (actionId === 'done') completeTaskFromNotification(taskId).catch(() => notificationActionError.set('Could not mark that task done. Please try again.'));
      else if (actionId === 'snooze') snoozeTaskFromNotification(taskId).catch(() => notificationActionError.set('Could not snooze that reminder. Please try again.'));
      else {
        // bare click (no action button) -- lib.rs emits '' for this case.
        // Windows brings no window forward on a toast click by itself, so
        // the app can stay behind other windows even though the card opens.
        invokeTauri('show_main_window').catch(() => {});
        pendingOpenTaskId.set(taskId);
      }
    });
    return;
  }
  if (!isNative()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const perm = await LocalNotifications.checkPermissions();
  permissionState.set(perm.display === 'granted' ? 'granted' : 'denied');
  await checkExactAlarmPermission();
  await ensureReminderChannel();
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const taskId = (action.notification.extra as { taskId?: string } | undefined)?.taskId;
    if (!taskId) return;
    if (action.actionId === 'done') completeTaskFromNotification(taskId).catch(() => notificationActionError.set('Could not mark that task done. Please try again.'));
    else if (action.actionId === 'snooze') snoozeTaskFromNotification(taskId).catch(() => notificationActionError.set('Could not snooze that reminder. Please try again.'));
    else pendingOpenTaskId.set(taskId); // 'tap' (default open) — anything else falls through to opening the task
  });
}

// Cancel-all-then-reschedule-from-scratch, called after every store reload
// (init + every live sync change). Simple, self-healing, and cheap at the
// scale of a personal task manager — no need to track every individual
// create/update/delete/complete site separately.
export async function rescheduleAll(): Promise<void> {
  // Master in-app toggle (config.ts's getNotificationsEnabled) -- an empty
  // task list here means every scheduling path below cancels whatever it
  // already had pending instead of re-arming it, same effect as "disabled"
  // should have, without a separate cancel-everything code path per platform.
  const tasks = getNotificationsEnabled() ? await getAllActiveTasksWithReminders() : [];
  if (isNative()) {
    await scheduleNative(tasks);
  } else if (isTauriPlatform()) {
    await scheduleTauri(tasks);
  } else {
    for (const id of [..._webTimers.keys()]) cancelWeb(id);
    tasks.forEach((t, i) => scheduleWeb(t, i));
    catchUpWeb(tasks);
  }
}
