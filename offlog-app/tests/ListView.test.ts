import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

// ListView writes through db.ts/store.ts — mocked so this tests the
// mark-done/undo decision logic and the arguments it writes, not a real
// database round-trip (db.test.ts covers that).
const updateTask = vi.fn().mockResolvedValue(undefined);
const getCustomFieldDefs = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/db', () => ({
  updateTask: (...args: unknown[]) => updateTask(...args),
  unarchiveTask: vi.fn().mockResolvedValue(undefined),
  getArchivedTasksForProject: vi.fn().mockResolvedValue([]),
  getCustomFieldDefs: (...args: unknown[]) => getCustomFieldDefs(...args),
  getTaskById: vi.fn().mockResolvedValue(null),
  // reached only when a row is opened into CardDetail
  getAllTags: vi.fn().mockResolvedValue([]),
  findTasksByTitleInProject: vi.fn().mockResolvedValue([]),
  findSimilarNotes: vi.fn().mockResolvedValue([]),
  getRelatedTasks: vi.fn().mockResolvedValue([]),
  searchTasksForLinking: vi.fn().mockResolvedValue([]),
  linkRelatedTask: vi.fn().mockResolvedValue(undefined),
  unlinkRelatedTask: vi.fn().mockResolvedValue(undefined),
  getBlockingTasks: vi.fn().mockResolvedValue([]),
  linkBlockedBy: vi.fn().mockResolvedValue(undefined),
  unlinkBlockedBy: vi.fn().mockResolvedValue(undefined),
  isBlockerResolved: vi.fn().mockReturnValue(false),
  archiveTask: vi.fn().mockResolvedValue(undefined),
  duplicateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
}));

const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...args: unknown[]) => reloadTasks(...args),
  showError: (...args: unknown[]) => showError(...args),
  projects: writable([]),
  modalOpen: writable(false),
}));

vi.mock('../src/lib/notifications', () => ({
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

vi.mock('../src/lib/confirm', () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));

import ListView from '../src/lib/ListView.svelte';

const COLUMNS = [
  { id: 'col:todo', name: 'To do' },
  { id: 'col:doing', name: 'Doing' },
  { id: 'col:done', name: 'Done' },
];

function mkProject(columns = COLUMNS): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0, columns, default_view: 'list',
    updated_at: '2026-01-01T00:00:00.000Z', source: 'PC',
  };
}

// A recurring task: completing it rewrites due_date/reminder_at/checklist
// in the same write, which is what makes undo more than a column revert.
function mkTask(extra: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: 'task:1', type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Water the plants', body: '', priority: 2,
    due_date: '2026-03-01', reminder_at: '2026-03-01T09:00:00.000Z',
    checklist: [{ text: 'fill can', done: true }],
    recurrence: 'weekly',
    tags: [], position: 100, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'PC', ...extra,
  };
}

const doneCircle = (container: HTMLElement) =>
  container.querySelector('button.circle') as HTMLButtonElement;

const undoButton = (container: HTMLElement) =>
  container.querySelector('.undo-btn') as HTMLButtonElement | null;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ListView mark done', () => {
  it('moves the task into the project\'s last status', async () => {
    const { container } = render(ListView, { project: mkProject(), tasks: [mkTask()] });

    await fireEvent.click(doneCircle(container));

    expect(updateTask).toHaveBeenCalledWith('task:1', { column_id: 'col:done' });
    expect(reloadTasks).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  // Writing lastColId()'s '' fallback would orphan the task into a column
  // that does not exist, which checkIntegrity later flags as invalid_column.
  it('refuses to mark done when the project has no statuses', async () => {
    const noCols = mkProject([]);
    const { container } = render(ListView, { project: noCols, tasks: [mkTask()] });

    await fireEvent.click(doneCircle(container));

    expect(updateTask).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalled();
  });

  it('surfaces an error and offers no undo when the write fails', async () => {
    updateTask.mockRejectedValueOnce(new Error('write failed'));
    const { container } = render(ListView, { project: mkProject(), tasks: [mkTask()] });

    await fireEvent.click(doneCircle(container));

    expect(showError).toHaveBeenCalled();
    expect(undoButton(container)).toBeNull();
  });
});

describe('ListView mount', () => {
  it('shows an error instead of crashing if loading custom fields fails', async () => {
    getCustomFieldDefs.mockRejectedValueOnce(new Error('db unreachable'));
    render(ListView, { project: mkProject(), tasks: [mkTask()] });

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(String(showError.mock.calls[0][0])).toMatch(/custom fields/i);
  });
});

describe('ListView mark-done undo', () => {
  it('restores due_date, reminder_at and checklist, not just the status', async () => {
    const task = mkTask();
    const { container } = render(ListView, { project: mkProject(), tasks: [task] });

    await fireEvent.click(doneCircle(container));
    const undo = await waitFor(() => {
      const b = undoButton(container);
      if (!b) throw new Error('undo toast did not appear');
      return b;
    });

    updateTask.mockClear();
    await fireEvent.click(undo);

    // A recurring completion rewrites all four fields in one write, so an
    // undo that only reverted column_id would leave the rest stuck.
    expect(updateTask).toHaveBeenCalledWith('task:1', {
      column_id: 'col:todo',
      due_date: '2026-03-01',
      reminder_at: '2026-03-01T09:00:00.000Z',
      checklist: [{ text: 'fill can', done: true }],
    });
  });

  it('reports a failed undo instead of silently dropping it', async () => {
    const { container } = render(ListView, { project: mkProject(), tasks: [mkTask()] });

    await fireEvent.click(doneCircle(container));
    const undo = await waitFor(() => {
      const b = undoButton(container);
      if (!b) throw new Error('undo toast did not appear');
      return b;
    });

    updateTask.mockRejectedValueOnce(new Error('undo failed'));
    showError.mockClear();
    await fireEvent.click(undo);

    expect(showError).toHaveBeenCalled();
  });
});
