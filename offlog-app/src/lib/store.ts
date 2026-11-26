import { writable, derived, get } from 'svelte/store';
import type { SpaceDoc, ProjectDoc, TaskDoc } from './types';
import {
  getSpaces, getProjects, getTasksForProject,
  seedIfEmpty, startSync, subscribe, initIndexes, maybePruneOldLogs, maybePruneOldDeletedTasks,
  scanConflicts, putSyncHostRecord, syncNow,
} from './db';
import { rescheduleAll, initNotificationListeners, checkPermission } from './notifications';
import { initTauriSyncDefaults, checkForOtherHosts, watchSyncDataSetAside, initDeviceName, isNativePlatform, isTauri, syncsWithOwnSidecar, getDeviceId, getDeviceName } from '../config';
import { watchForStaleHost } from './discovery';
import { runAutoBackupIfDue } from './autoBackup';

export const modalOpen = writable(false);
export const errorToast = writable<string>('');
let _errorTimer: ReturnType<typeof setTimeout> | undefined;
export function showError(msg: string) {
  clearTimeout(_errorTimer);
  errorToast.set(msg);
  _errorTimer = setTimeout(() => errorToast.set(''), 4000);
}

export const spaces = writable<SpaceDoc[]>([]);
export const projects = writable<ProjectDoc[]>([]);
const tasks = writable<TaskDoc[]>([]);

const storedSpaceId   = localStorage.getItem('activeSpaceId')   ?? 'space:unsorted';
const storedProjectId = localStorage.getItem('activeProjectId') ?? '';

export const activeSpaceId   = writable<string>(storedSpaceId);
export const activeProjectId = writable<string>(storedProjectId);

activeSpaceId.subscribe(id   => localStorage.setItem('activeSpaceId', id));
activeProjectId.subscribe(id => localStorage.setItem('activeProjectId', id));

export const activeProject = derived(
  [projects, activeProjectId],
  ([$projects, $id]) => $projects.find(p => p._id === $id) ?? null,
);

export const projectTasks = derived(
  [tasks, activeProjectId],
  ([$tasks, $id]) => $tasks.filter(t => t.project_id === $id),
);

// Guards against an older reload finishing *after* a newer one and
// overwriting fresh stores with stale data — with several reloads in
// flight at once there's no ordering guarantee between them, so the
// last one to be *started* wins rather than the last to resolve.
let _reloadSeq = 0;
// The task list has a second writer, reloadTasks(), so it gets its own
// counter: a reload started before a write must not overwrite the list a
// later reloadTasks() already fetched, or a project switch's list.
let _taskSeq = 0;

async function reload() {
  // None of these three reads depend on each other (tasks only needs the
  // already-known activeProjectId, not the freshly-loaded spaces/projects),
  // so fetching them in parallel instead of sequentially shaves a full
  // round-trip off every reload — this runs on init and on every incoming
  // sync change.
  const seq = ++_reloadSeq, taskSeq = ++_taskSeq;
  const $projectId = get(activeProjectId);
  const [sp, pr, tk] = await Promise.all([getSpaces(), getProjects(), getTasksForProject($projectId)]);
  if (seq !== _reloadSeq) return; // superseded while we were awaiting
  spaces.set(sp);
  projects.set(pr);
  if (taskSeq === _taskSeq) tasks.set(tk);
  // Not awaited — reminders don't need to block the UI becoming interactive.
  rescheduleAll().catch(() => {});
}

// PouchDB's change feed emits one event *per document*, so a device that was
// offline for a week pushing 300 changed docs would otherwise trigger 300
// full reloads back-to-back -- each one four queries plus a complete reminder
// reschedule, all on the main thread. Coalescing into a single reload per
// quiet period turns that into one. Kept short (120ms) so a *local* write
// still feels instant: local mutation paths call reloadTasks() directly
// anyway, this only backstops the change feed.
const RELOAD_DEBOUNCE_MS = 120;
let _reloadTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleReload() {
  clearTimeout(_reloadTimer);
  _reloadTimer = setTimeout(() => { reload().catch(() => {}); }, RELOAD_DEBOUNCE_MS);
}

// The Windows app hosting sync tells phones its Offlog name. Not something
// the user did, so a failed write shows nothing; the next start retries.
export function announceSyncHost() {
  if (syncsWithOwnSidecar()) putSyncHostRecord(getDeviceId(), getDeviceName()).catch(() => {});
}

export async function reloadTasks() {
  const taskSeq = ++_taskSeq;
  const tk = await getTasksForProject(get(activeProjectId));
  if (taskSeq === _taskSeq) tasks.set(tk);
}

export async function init() {
  // seedIfEmpty() doesn't depend on the Mango index existing (it only writes
  // docs), and getLogsForTask() awaits initIndexes() itself — so the two can
  // run concurrently here instead of the seed check waiting on index creation.
  await Promise.all([initIndexes(), seedIfEmpty()]);
  // Test builds only (`npm run build:demo`): fill a fresh install with the
  // demo workspace once. A normal build compiles this branch out.
  if (import.meta.env.VITE_DEMO_DATA === '1' && !localStorage.getItem('offlog_demo_seeded')) {
    // Marked only once it has run, so a first launch killed mid-seed tries again.
    try { await (await import('./demoSeed')).seedDemo(); localStorage.setItem('offlog_demo_seeded', '1'); }
    catch (e) { console.error('demo seed failed', (e as Error)?.message); }
  }
  // Must resolve before startSync() -- the Tauri app's own embedded
  // sidecar port is only knowable async (see config.ts's
  // initTauriSyncDefaults()), and startSync() needs the real URL in
  // localStorage already, not a stale/wrong default.
  await initTauriSyncDefaults();
  // Before sync starts, so the first synced edits carry the real name.
  await initDeviceName();
  announceSyncHost();
  await reload();
  startSync().catch(() => {});
  // Not just after the next sync settles (markSynced()/resolveConflict()
  // already call this) — a session that starts with sync paused, or
  // genuinely offline, should still surface conflicts left over from a
  // previous session instead of showing no badge until sync resumes.
  scanConflicts().catch(() => {});
  watchForStaleHost();
  // Desktop-only (see config.ts's own comment) -- the Rust-side scan
  // finishes a few seconds after NyxDB itself boots, so this is polled
  // rather than checked once immediately after startSync() above.
  setTimeout(() => { checkForOtherHosts().catch(() => {}); }, 4000);
  setTimeout(() => { checkForOtherHosts().catch(() => {}); }, 10000);
  watchSyncDataSetAside().catch(() => {});
  watchSyncHostRestart();
  subscribe(scheduleReload);
  checkPermission();
  // Listener setup failing (e.g. platform plugin unavailable) shouldn't
  // block the rest of startup -- notifications degrade, the rest of the
  // app still works.
  initNotificationListeners().catch(() => {});
  runHousekeeping();
  // Housekeeping must run on a timer, not only once per app start: the
  // desktop app is tray-resident, so a session can last weeks and "next
  // launch" may never come -- automatic backups would silently stop while
  // still *reporting* a real last-backup timestamp, and neither retention cap
  // would ever be enforced. Each of the three has its own internal "is it due
  // yet" check, so calling hourly is cheap.
  setInterval(runHousekeeping, HOUSEKEEPING_INTERVAL_MS);
  // Android's reminders are OS alarms; desktop and web ones are JS timers.
  // Phones resync on resume; the tray window gets no such event, and its
  // replication may sit in a long retry wait from before the sleep.
  if (!isNativePlatform()) watchForWake(() => { rescheduleAll().catch(() => {}); syncNow().catch(() => {}); });
}

// The desktop restarts NyxDB after a crash, sometimes after resting an hour;
// by then PouchDB's own retry wait has grown to minutes, so sync is restarted
// as soon as the server answers again. Exported for tests.
export function watchSyncHostRestart() {
  if (!isTauri()) return;
  import('@tauri-apps/api/event')
    .then(({ listen }) => listen('sync-host-restarted', () => { syncNow().catch(() => {}); }))
    .catch(() => { /* no event bridge (tests, a non-Tauri host) */ });
}

// Timers stall while a laptop sleeps, and the hidden tray window gets no
// visibilitychange, so a reminder due during sleep would wait for its
// stalled timer (up to the next hourly re-arm). A once-a-minute tick that
// arrives far later than a minute means the machine slept.
const WAKE_TICK_MS = 60_000;
export function watchForWake(onWake: () => void): () => void {
  let last = Date.now();
  const id = setInterval(() => {
    const t = Date.now();
    if (t - last > WAKE_TICK_MS * 2) onWake();
    last = t;
  }, WAKE_TICK_MS);
  return () => clearInterval(id);
}

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000; // hourly; each task self-checks whether it's actually due

// Exported for tests. rescheduleAll() is here because desktop reminders are
// setTimeouts that otherwise re-arm only after a database write: one more than
// 24.8 days out is skipped when scheduled, and a long-idle session never gets
// another chance to arm it.
export function runHousekeeping() {
  maybePruneOldLogs();
  maybePruneOldDeletedTasks();
  runAutoBackupIfDue().catch(() => {});
  rescheduleAll().catch(() => {});
}

// Switching the active project needs its own trigger (reload() only runs
// on init + live db changes, not on plain navigation) — reuses the same
// fetch as reload() instead of duplicating it inline.
let _initialized = false;
activeProjectId.subscribe(() => {
  if (!_initialized) { _initialized = true; return; } // skip the initial firing; init() already loads it
  reloadTasks().catch(() => showError('Could not load this project. Please try again.'));
});
