import { writable, derived, get } from 'svelte/store';
import type { SpaceDoc, ProjectDoc, TaskDoc } from './types';
import {
  getSpaces, getProjects, getTasksForProject,
  seedIfEmpty, startSync, subscribe, initIndexes, maybePruneOldLogs, maybePruneOldDeletedTasks,
  scanConflicts,
} from './db';
import { rescheduleAll, initNotificationListeners, checkPermission } from './notifications';
import { initTauriSyncDefaults, checkForOtherHosts } from '../config';
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

async function reload() {
  // None of these three reads depend on each other (tasks only needs the
  // already-known activeProjectId, not the freshly-loaded spaces/projects),
  // so fetching them in parallel instead of sequentially shaves a full
  // round-trip off every reload — this runs on init and on every incoming
  // sync change.
  const seq = ++_reloadSeq;
  const $projectId = get(activeProjectId);
  const [sp, pr, tk] = await Promise.all([getSpaces(), getProjects(), getTasksForProject($projectId)]);
  if (seq !== _reloadSeq) return; // superseded while we were awaiting
  spaces.set(sp);
  projects.set(pr);
  tasks.set(tk);
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

export async function reloadTasks() {
  const $projectId = get(activeProjectId);
  tasks.set(await getTasksForProject($projectId));
}

export async function init() {
  // seedIfEmpty() doesn't depend on the Mango indexes existing (it only
  // writes docs), and reload()'s own call to getTasksForProject() already
  // awaits initIndexes() internally — so the two can run concurrently here
  // instead of the seed check waiting on index creation first.
  await Promise.all([initIndexes(), seedIfEmpty()]);
  // Must resolve before startSync() -- the Tauri app's own embedded
  // sidecar port is only knowable async (see config.ts's
  // initTauriSyncDefaults()), and startSync() needs the real URL in
  // localStorage already, not a stale/wrong default.
  await initTauriSyncDefaults();
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
}

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000; // hourly; each task self-checks whether it's actually due

function runHousekeeping() {
  maybePruneOldLogs();
  maybePruneOldDeletedTasks();
  runAutoBackupIfDue().catch(() => {});
}

// Switching the active project needs its own trigger (reload() only runs
// on init + live db changes, not on plain navigation) — reuses the same
// fetch as reload() instead of duplicating it inline.
let _initialized = false;
activeProjectId.subscribe(() => {
  if (!_initialized) { _initialized = true; return; } // skip the initial firing; init() already loads it
  reloadTasks();
});
