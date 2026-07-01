import { writable, derived, get } from 'svelte/store';
import type { SpaceDoc, ProjectDoc, TaskDoc } from './types';
import {
  getSpaces, getProjects, getTasksForProject,
  seedIfEmpty, startSync, subscribe,
} from './db';

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
  spaces.set(await getSpaces());
  projects.set(await getProjects());
  const $projectId = get(activeProjectId);
  tasks.set(await getTasksForProject($projectId));
}

export async function reloadTasks() {
  const $projectId = get(activeProjectId);
  tasks.set(await getTasksForProject($projectId));
}

export async function init() {
  await seedIfEmpty();
  await reload();
  startSync();
  subscribe(() => reload());
}

activeProjectId.subscribe(async (id) => {
  tasks.set(await getTasksForProject(id));
});
