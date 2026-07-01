import { writable } from 'svelte/store';
import { getAllActiveTasksWithReminders, updateTask } from './db';
import type { TaskDoc } from './types';

// Set by a notification click (native action or web Notification.onclick).
// App.svelte watches this to open the corresponding task.
export const pendingOpenTaskId = writable<string | null>(null);

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export const permissionState = writable<PermissionState>('default');

const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

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
  if (isNative()) return; // resolved lazily via requestPermissions() result instead
  if (typeof Notification === 'undefined') { permissionState.set('unsupported'); return; }
  permissionState.set(Notification.permission as PermissionState);
}

// ── Web scheduling (best-effort — see TECH.md for the "app must stay
// running" caveat; there's no push backend behind this local-first app) ──

const _webTimers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_TIMEOUT = 2_147_483_647; // setTimeout's 32-bit signed int limit (~24.8 days)

// Guards against firing the same reminder twice within one app session.
// rescheduleAll() can be triggered by overlapping/rapid-fire reload()
// calls (several doc writes in quick succession each trigger their own
// live-sync change event) — without this, catchUpWeb() and a live
// setTimeout can both fire for the same task before the DB write that
// clears reminder_at has round-tripped back through the reactive
// reload chain, producing 2-3 duplicate notifications for one reminder.
const _firedIds = new Set<string>();

function fireWebNotification(task: TaskDoc) {
  const id = task._id!;
  if (_firedIds.has(id)) return;
  _firedIds.add(id);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
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
  updateTask(id, { reminder_at: null }).catch(() => {});
}

function scheduleWeb(task: TaskDoc) {
  const id = task._id!;
  const existing = _webTimers.get(id);
  if (existing) clearTimeout(existing);
  if (!task.reminder_at) return;
  const delay = new Date(task.reminder_at).getTime() - Date.now();
  if (delay <= 0) return; // handled by the catch-up check instead
  if (delay > MAX_TIMEOUT) return; // too far out — will be re-scheduled on a later reload
  _webTimers.set(id, setTimeout(() => { fireWebNotification(task); _webTimers.delete(id); }, delay));
}

function cancelWeb(taskId: string) {
  const existing = _webTimers.get(taskId);
  if (existing) { clearTimeout(existing); _webTimers.delete(taskId); }
}

// Reminders due while the app/tab wasn't open can't fire on web (no push
// server behind this app) — fire them immediately on load instead, as
// long as they're not too stale to be useful.
function catchUpWeb(tasks: TaskDoc[]) {
  const now = Date.now();
  const CATCH_UP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  for (const t of tasks) {
    if (!t.reminder_at) continue;
    const at = new Date(t.reminder_at).getTime();
    if (at <= now && now - at < CATCH_UP_WINDOW_MS) fireWebNotification(t);
  }
}

// ── Native (Android) scheduling — genuinely fires while the app is fully
// closed, since it's handed off to the OS scheduler ──

async function scheduleNative(tasks: TaskDoc[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
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
    }));
  if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule });
}

export async function initNotificationListeners(): Promise<void> {
  if (!isNative()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const perm = await LocalNotifications.checkPermissions();
  permissionState.set(perm.display === 'granted' ? 'granted' : 'denied');
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const taskId = (action.notification.extra as any)?.taskId;
    if (taskId) pendingOpenTaskId.set(taskId);
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
  } else {
    for (const id of [..._webTimers.keys()]) cancelWeb(id);
    tasks.forEach(scheduleWeb);
    catchUpWeb(tasks);
  }
}
