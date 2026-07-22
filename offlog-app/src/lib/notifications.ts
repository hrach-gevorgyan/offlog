import { writable } from 'svelte/store';
import db, { getAllActiveTasksWithReminders, updateTask, getTaskById } from './db';
import { invokeTauri, isTauri as isTauriPlatform } from '../config';
import type { TaskDoc, ProjectDoc } from './types';

// Set by a notification click (native action or web Notification.onclick).
// App.svelte watches this to open the corresponding task.
export const pendingOpenTaskId = writable<string | null>(null);

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

export async function checkExactAlarmPermission(): Promise<void> {
  if (!isNative()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const res = await LocalNotifications.checkExactNotificationSetting();
  exactAlarmState.set(res.exact_alarm === 'granted' ? 'granted' : 'denied');
}

// Deep-links to the OS "Alarms & reminders" settings screen for this app —
// there's no runtime permission dialog for this one, unlike requestPermission().
export async function requestExactAlarmPermission(): Promise<void> {
  if (!isNative()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const res = await LocalNotifications.changeExactNotificationSetting();
  exactAlarmState.set(res.exact_alarm === 'granted' ? 'granted' : 'denied');
}

const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();
// Desktop (Tauri) is neither Capacitor-native nor a plain browser — it
// embeds a real WebView2, but that WebView has no default handler for the
// browser Notification permission-prompt flow, so Notification.
// requestPermission() silently resolved to "denied" with no real OS
// prompt ever shown (owner-reported, 2026-07-16). tauri-plugin-
// notification talks to real Windows toast notifications instead,
// sidestepping WebView2's permission model entirely — same reasoning as
// why Android needed @capacitor/local-notifications instead of the web API.
// Deterministic 32-bit integer id from a task's string id — Capacitor's
// local-notifications plugin requires numeric ids.
function numericId(taskId: string): number {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) {
    h = (h * 31 + taskId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

export async function requestPermission(): Promise<PermissionState> {
  if (isNative()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.requestPermissions();
    const state: PermissionState = res.display === 'granted' ? 'granted' : 'denied';
    permissionState.set(state);
    return state;
  }
  if (isTauriPlatform()) {
    // No real desktop permission model to request against (see
    // initNotificationListeners' comment) -- 'granted' is just the truth.
    permissionState.set('granted');
    return 'granted';
  }
  if (typeof Notification === 'undefined') {
    permissionState.set('unsupported');
    return 'unsupported';
  }
  const res = await Notification.requestPermission();
  const state = res as PermissionState;
  permissionState.set(state);
  return state;
}

export function checkPermission(): void {
  if (isNative() || isTauriPlatform()) return; // resolved lazily via initNotificationListeners() instead
  if (typeof Notification === 'undefined') { permissionState.set('unsupported'); return; }
  permissionState.set(Notification.permission as PermissionState);
}

// ── Web scheduling (best-effort — see TECH.md for the "app must stay
// running" caveat; there's no push backend behind this local-first app) ──
//
// A12 audit note on DST/timezone: reminder_at is stored as an absolute
// ISO instant (UTC epoch under the hood). Every delay computed below is
// `new Date(reminder_at).getTime() - Date.now()` — plain epoch-ms
// arithmetic, which is DST-safe by construction; there's no local-time
// component in this math for a DST transition to corrupt. The native
// path (scheduleNative below) hands Android's AlarmManager an absolute
// Date for the same reason. The one real gap this audit found wasn't a
// DST bug — it was catchUpWeb() below leaving very-stale reminders
// dangling forever instead of ever resolving them one way or the other;
// see its own comment.

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
// Keyed by `${id}:${reminder_at}`, not just the task id -- a task id
// alone meant that once ANY reminder on a task fired, _firedIds (never
// cleared) would permanently block every future reminder ever set on
// that same task again for the rest of the session, silently, since the
// guard couldn't tell a brand-new reminder_at apart from the one that
// already fired (2026-07-18 audit finding). Keying by the exact instant
// still blocks the original race (both paths would compute the identical
// key for the same still-pending reminder_at) while correctly treating a
// later, different reminder_at on the same task as fireable again.
const _firedIds = new Set<string>();
function firedKey(task: TaskDoc): string { return `${task._id}:${task.reminder_at}`; }

// Returns the clearing write's promise (rather than firing it detached) so
// catchUpWeb() can actually wait for it to land -- production callers are
// free to ignore the returned promise same as before, but tests no longer
// need to pad with an arbitrary setTimeout "give it a tick" that isn't
// guaranteed long enough under load (real flakiness found 2026-07-22: the
// padding was too short whenever other test files added enough parallel
// load to slow PouchDB's actual write down past one macrotask tick).
function fireWebNotification(task: TaskDoc): Promise<void> {
  const id = task._id!;
  const key = firedKey(task);
  if (_firedIds.has(key)) return Promise.resolve();
  _firedIds.add(key);
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
  // long as reminder_at stays inside the catch-up window).
  return updateTask(id, { reminder_at: null }).then(() => {}, () => {});
}

function scheduleWeb(task: TaskDoc) {
  const id = task._id!;
  const existing = _webTimers.get(id);
  if (existing) clearTimeout(existing);
  if (!task.reminder_at) return;
  const delay = new Date(task.reminder_at).getTime() - Date.now();
  if (delay <= 0) return; // handled by the catch-up check instead
  // Too far out to schedule now — picked up on a later reload() once it's
  // within range instead (every app open + every live sync change calls
  // rescheduleAll()). A12 audit: the only way this actually drops a
  // reminder is a reminder >24.8 days out AND the web app never being
  // opened again until after it's already due — accepted as a residual,
  // low-probability edge case rather than adding a background re-check
  // timer for it; the native path has no such limit at all.
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
// A12 audit finding: a reminder past this window used to just sit there
// forever — never fired (too stale), never cleared (nothing here touched
// it), so it silently stayed "active" indefinitely and would keep
// re-entering this same dead-end check on every future reload. Fixed by
// explicitly clearing reminder_at once something is too stale to be a
// useful notification, same as fireWebNotification() already does for the
// reminders that DO fire — a stale reminder is closed out one way or the
// other, never left dangling.
// Exported for tests/notifications.test.ts (A12) — the stale-reminder
// cleanup fix above is worth a real regression test.
// Returns a promise resolving once every fire/clear write below has landed
// -- production callers still don't need to await this (same fire-and-
// forget usage as always), but tests can, instead of racing an arbitrary
// setTimeout against real (occasionally slow-under-load) PouchDB writes.
export function catchUpWeb(tasks: TaskDoc[]): Promise<void> {
  const now = Date.now();
  const CATCH_UP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  const pending: Promise<void>[] = [];
  for (const t of tasks) {
    if (!t.reminder_at) continue;
    const at = new Date(t.reminder_at).getTime();
    if (at > now) continue; // still in the future — scheduleWeb() owns this one
    if (now - at < CATCH_UP_WINDOW_MS) pending.push(fireWebNotification(t));
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

// A33 (owner-reported, 2026-07-13): reminders fired but "silent, not fully
// functional." Root cause — nothing here ever created an Android
// notification channel, and every scheduled notification also omitted
// channelId. Android 8+ requires a channel per notification; without an
// explicit one, the OS/plugin falls back to an auto-created "Default"
// channel at IMPORTANCE_DEFAULT-or-lower — no guaranteed sound, no
// heads-up popup, and (worse) its importance is fixed forever at whatever
// it was on first auto-creation, since apps can't alter a channel's
// importance after creation, only the user can via system settings. An
// explicit high-importance channel, created once up front, is the only
// way to guarantee sound + heads-up on every install.
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
    .map(t => ({
      id: numericId(t._id!),
      title: t.title,
      body: t.due_date ? `Due ${t.due_date}` : 'Reminder',
      schedule: { at: new Date(t.reminder_at!) },
      extra: { taskId: t._id },
      actionTypeId: REMINDER_ACTION_TYPE,
      channelId: REMINDER_CHANNEL_ID,
    }));
  if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule });
}

// ── Native (Tauri desktop) scheduling — real Windows toast notifications,
// but on a JS timer, same mechanism as scheduleWeb() above ──
//
// Owner-reported, 2026-07-16: reminders never fired after enabling
// notification permission. Root cause, confirmed by reading
// tauri-plugin-notification's own source (desktop.rs): the desktop
// backend's show()/notify() never reads the `schedule` field at all —
// scheduling is only implemented on mobile (mobile.rs), where the OS
// itself owns the wakeup. Desktop has no equivalent, so a "scheduled"
// notification either silently did nothing or fired immediately,
// completely ignoring the requested future time. There's no fix on the
// plugin side to reach for — the correct desktop equivalent is exactly
// what scheduleWeb() above already does (a JS setTimeout, since the app
// stays running), just displaying a real native toast at fire time
// instead of the browser Notification API. Reuses _webTimers/_firedIds
// — mutually exclusive with the web path at runtime (one platform per
// session), so sharing that state is safe.

// Owner-reported, 2026-07-16: clicking a fired notification didn't open
// the task. Root cause, confirmed by reading tauri-plugin-notification's
// own source: its desktop backend never wires up any click/action
// callback at all -- there's no event it could ever emit back to us, on
// a bare click or an action button. isPermissionGranted()/
// requestPermission() are also both hardcoded to always return granted
// on desktop, unconditionally -- the plugin has no real desktop
// permission model, so the channel/actionType concepts it offers are
// meaningless for our purposes here. Bypassing it for reminders
// entirely: a custom Rust command (send_task_notification, lib.rs)
// builds the toast directly with tauri-winrt-notification, whose
// on_activated callback genuinely works, and emits a real Tauri event
// we can listen for below.
async function fireTauriNotification(task: TaskDoc) {
  const id = task._id!;
  const key = firedKey(task);
  if (_firedIds.has(key)) return;
  _firedIds.add(key);
  invokeTauri('send_task_notification', {
    title: task.title,
    body: task.due_date ? `Due ${task.due_date}` : 'Reminder',
    taskId: id,
  }).catch(() => {});
  updateTask(id, { reminder_at: null }).catch(() => {});
}

function scheduleTauriTimer(task: TaskDoc) {
  const id = task._id!;
  const existing = _webTimers.get(id);
  if (existing) clearTimeout(existing);
  if (!task.reminder_at) return;
  const delay = new Date(task.reminder_at).getTime() - Date.now();
  if (delay <= 0 || delay > MAX_TIMEOUT) return; // handled by catchUpTauri, or too far out for this session
  _webTimers.set(id, setTimeout(() => { fireTauriNotification(task); _webTimers.delete(id); }, delay));
}

// Same reasoning as catchUpWeb() — a reminder due while the app wasn't
// running has no OS-level catch-up on desktop either (see this section's
// header comment), so fire it on load instead if it's not too stale.
function catchUpTauri(tasks: TaskDoc[]) {
  const now = Date.now();
  const CATCH_UP_WINDOW_MS = 60 * 60 * 1000;
  for (const t of tasks) {
    if (!t.reminder_at) continue;
    const at = new Date(t.reminder_at).getTime();
    if (at > now) continue;
    if (now - at < CATCH_UP_WINDOW_MS) fireTauriNotification(t);
    else updateTask(t._id!, { reminder_at: null }).catch(() => {});
  }
}

async function scheduleTauri(tasks: TaskDoc[]) {
  for (const id of [..._webTimers.keys()]) cancelWeb(id);
  tasks.forEach(scheduleTauriTimer);
  catchUpTauri(tasks);
}

// Moves a task to its project's last column — the same "done" rule used
// everywhere else in the app (see db.ts / CLAUDE.md: "Done" is positional,
// column_id === columns.at(-1), there's no separate done boolean).
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
    // tauri-plugin-notification's isPermissionGranted()/requestPermission()
    // are hardcoded to always return granted on desktop (confirmed by
    // reading its source) -- there's no real desktop permission model
    // behind them at all, so checking it here would be theater. Desktop
    // notification display isn't actually gated on anything we can
    // observe; 'granted' is the honest answer.
    permissionState.set('granted');
    const { listen } = await import('@tauri-apps/api/event');
    await listen<[string, string]>('notification-action', (event) => {
      const [actionId, taskId] = event.payload;
      if (!taskId) return;
      if (actionId === 'done') completeTaskFromNotification(taskId).catch(() => {});
      else if (actionId === 'snooze') snoozeTaskFromNotification(taskId).catch(() => {});
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
    const taskId = (action.notification.extra as any)?.taskId;
    if (!taskId) return;
    if (action.actionId === 'done') completeTaskFromNotification(taskId).catch(() => {});
    else if (action.actionId === 'snooze') snoozeTaskFromNotification(taskId).catch(() => {});
    else pendingOpenTaskId.set(taskId); // 'tap' (default open) — anything else falls through to opening the task
  });
}

// Cancel-all-then-reschedule-from-scratch, called after every store reload
// (init + every live sync change). Simple, self-healing, and cheap at the
// scale of a personal task manager — no need to track every individual
// create/update/delete/complete site separately.
export async function rescheduleAll(): Promise<void> {
  const tasks = await getAllActiveTasksWithReminders();
  if (isNative()) {
    await scheduleNative(tasks);
  } else if (isTauriPlatform()) {
    await scheduleTauri(tasks);
  } else {
    for (const id of [..._webTimers.keys()]) cancelWeb(id);
    tasks.forEach(scheduleWeb);
    catchUpWeb(tasks);
  }
}
