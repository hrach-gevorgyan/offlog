import { get } from 'svelte/store';
import { updateProject, updateTask } from '../../db';
import { projects, reloadTasks, showError } from '../../store';
import { hapticToggle } from '../../haptics';
import { showToast } from '../nav';
import type { ProjectDoc, TaskDoc } from '../../types';

// Project writes shown at once: the store is patched before the write
// and put back if the write fails.
export async function patchProject(id: string, changes: Partial<ProjectDoc>, fail: string): Promise<boolean> {
  const prev = get(projects).find(p => p._id === id);
  if (!prev) return false;
  projects.update(ps => ps.map(p => (p._id === id ? { ...p, ...changes } : p)));
  try {
    await updateProject(id, changes);
    return true;
  } catch {
    projects.update(ps => ps.map(p => (p._id === id ? prev : p)));
    showError(fail);
    return false;
  }
}

// 'table' is a legacy value read as List.
export const isList = (p: ProjectDoc) => p.default_view === 'list' || p.default_view === 'table';

export const toggleView = (p: ProjectDoc) =>
  patchProject(p._id, { default_view: isList(p) ? 'kanban' : 'list' }, 'Could not switch the view. Please try again.');

// Replaces the project in the store with what a column write returned.
export function adopt(doc: ProjectDoc) {
  projects.update(ps => ps.map(p => (p._id === doc._id ? doc : p)));
}

// What a status change can touch: reaching the last status advances a
// repeating task's date, reminder and checklist in the same write.
export const snapshot = (t: TaskDoc): Partial<TaskDoc> =>
  ({ column_id: t.column_id, position: t.position, due_date: t.due_date, reminder_at: t.reminder_at, checklist: t.checklist });

// Finishing moves a task to its project's last status, un-finishing to the
// first.
export async function toggleDone(task: TaskDoc, project: ProjectDoc): Promise<void> {
  const last = project.columns.at(-1)?.id;
  const done = task.column_id === last;
  const target = done ? project.columns[0]?.id : last;
  if (!target) return;
  const before = snapshot(task);
  try {
    await updateTask(task._id, { column_id: target });
    hapticToggle();
    await reloadTasks();
  } catch {
    showError('Could not update this task. Please try again.');
    return;
  }
  showToast(`${done ? 'Not done' : 'Done'}: ${task.title}`, () => restore([[task._id, before]]));
}

// Writes each task's earlier values back; the Undo behind every bulk or
// reversible task change.
export async function restore(entries: [string, Partial<TaskDoc>][]): Promise<void> {
  try {
    for (const [id, changes] of entries) await updateTask(id, changes);
    await reloadTasks();
  } catch {
    showError('Could not undo. Please try again.');
  }
}
