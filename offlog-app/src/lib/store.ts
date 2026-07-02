import { writable, derived, get } from 'svelte/store';
import type { SpaceDoc, ProjectDoc, TaskDoc } from './types';
import {
  getSpaces, getProjects, getTasksForProject,
  seedIfEmpty, startSync, subscribe, initIndexes, maybePruneOldLogs,
} from './db';
import { rescheduleAll, initNotificationListeners, checkPermission } from './notifications';

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
export const tasks = writable<TaskDoc[]>([]);

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

async function reload() {
  // None of these three reads depend on each other (tasks only needs the
  // already-known activeProjectId, not the freshly-loaded spaces/projects),
  // so fetching them in parallel instead of sequentially shaves a full
  // round-trip off every reload — this runs on init and on every incoming
  // sync change.
  const $projectId = get(activeProjectId);
  const [sp, pr, tk] = await Promise.all([getSpaces(), getProjects(), getTasksForProject($projectId)]);
  spaces.set(sp);
  projects.set(pr);
  tasks.set(tk);
  // Not awaited — reminders don't need to block the UI becoming interactive.
  rescheduleAll().catch(() => {});
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
  await reload();
  startSync();
  subscribe(() => reload());
  checkPermission();
  initNotificationListeners().catch(() => {});
  maybePruneOldLogs();
}

// Switching the active project needs its own trigger (reload() only runs
// on init + live db changes, not on plain navigation) — reuses the same
// fetch as reload() instead of duplicating it inline.
let _initialized = false;
activeProjectId.subscribe(() => {
  if (!_initialized) { _initialized = true; return; } // skip the initial firing; init() already loads it
  reloadTasks();
});
