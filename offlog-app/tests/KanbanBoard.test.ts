import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

// KanbanBoard reaches db.ts/store.ts for every mutation — mocked so this
// stays a component test (menu wiring and the move's arguments), not a
// round-trip through the real database, which db.test.ts already covers.
const updateTask = vi.fn().mockResolvedValue(undefined);
// The real one returns a fractional position between two neighbours; a
// board with no cards in the target column appends, so a constant is
// enough to assert the value is threaded through unchanged.
const computeDropPosition = vi.fn().mockReturnValue(4242);
vi.mock('../src/lib/db', () => ({
  updateTask: (...args: unknown[]) => updateTask(...args),
  computeDropPosition: (...args: unknown[]) => computeDropPosition(...args),
  createTask: vi.fn().mockResolvedValue(undefined),
  addColumn: vi.fn().mockResolvedValue(undefined),
  renameColumn: vi.fn().mockResolvedValue(undefined),
  reorderColumns: vi.fn().mockResolvedValue(undefined),
  removeColumn: vi.fn().mockResolvedValue(undefined),
  archiveColumnTasks: vi.fn().mockResolvedValue(undefined),
  archiveTask: vi.fn().mockResolvedValue(undefined),
  duplicateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  getTaskById: vi.fn().mockResolvedValue(null),
  // both resolve to a Set, not an array — the board calls .has() on them
  getTaskIdsWithRelatedLinks: vi.fn().mockResolvedValue(new Set<string>()),
  getTaskIdsBlocked: vi.fn().mockResolvedValue(new Set<string>()),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
  subscribe: vi.fn().mockReturnValue({ cancel: vi.fn() }),
  // reached only when a card is opened into CardDetail
  getAllTags: vi.fn().mockResolvedValue([]),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
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
}));

const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...args: unknown[]) => reloadTasks(...args),
  showError: (...args: unknown[]) => showError(...args),
  modalOpen: writable(false),
  projects: writable([]),
}));

vi.mock('../src/lib/notifications', () => ({
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

vi.mock('../src/lib/confirm', () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));

import KanbanBoard from '../src/lib/KanbanBoard.svelte';

const COLUMNS = [
  { id: 'col:idea', name: 'Idea' },
  { id: 'col:doing', name: 'In Process' },
  { id: 'col:done', name: 'Completed' },
];

function mkProject(columns = COLUMNS): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0, columns, default_view: 'kanban',
    updated_at: '2026-01-01T00:00:00.000Z', source: 'PC',
  };
}

function mkTask(): TaskDoc {
  return {
    _id: 'task:1', type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:idea', title: 'Movable task', body: '', priority: 2,
    due_date: null, reminder_at: null, tags: [], position: 100, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', source: 'PC',
  };
}

async function openCardMenu(container: HTMLElement) {
  const trigger = container.querySelector('.card-menu-trigger') as HTMLButtonElement;
  await fireEvent.click(trigger);
  return container.querySelector('.card-menu') as HTMLElement;
}

const itemsIn = (menu: HTMLElement) =>
  [...menu.querySelectorAll('.card-menu-item')].map(b => (b as HTMLElement).textContent!.trim());

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

// The card menu is the only keyboard/touch route to a column change —
// drag-and-drop cannot be driven without a pointer.
describe('KanbanBoard "Move to" status', () => {
  it('offers every status except the one the task is already in', async () => {
    const { container } = render(KanbanBoard, { project: mkProject(), tasks: [mkTask()] });
    const menu = await openCardMenu(container);

    const labels = itemsIn(menu);
    expect(labels).toContain('In Process');
    expect(labels).toContain('Completed');
    expect(labels).not.toContain('Idea'); // the task's current status
  });

  it('moves the task to the chosen status and reloads', async () => {
    const { container } = render(KanbanBoard, { project: mkProject(), tasks: [mkTask()] });
    const menu = await openCardMenu(container);

    const target = [...menu.querySelectorAll('.card-menu-item')]
      .find(b => b.textContent!.trim() === 'Completed') as HTMLButtonElement;
    await fireEvent.click(target);

    expect(updateTask).toHaveBeenCalledWith('task:1', {
      column_id: 'col:done',
      position: 4242,
    });
    expect(reloadTasks).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('surfaces an error and does not swallow a failed move', async () => {
    updateTask.mockRejectedValueOnce(new Error('write failed'));
    const { container } = render(KanbanBoard, { project: mkProject(), tasks: [mkTask()] });
    const menu = await openCardMenu(container);

    const target = [...menu.querySelectorAll('.card-menu-item')]
      .find(b => b.textContent!.trim() === 'In Process') as HTMLButtonElement;
    await fireEvent.click(target);

    expect(showError).toHaveBeenCalled();
  });

  it('omits the move section when the project has a single status', async () => {
    const oneCol = mkProject([{ id: 'col:only', name: 'Only' }]);
    // the task has to live in that column: a card whose column_id matches
    // no column renders nowhere, so the board would come up empty
    const task = { ...mkTask(), column_id: 'col:only' };
    const { container } = render(KanbanBoard, { project: oneCol, tasks: [task] });
    const menu = await openCardMenu(container);

    expect(menu.querySelector('.card-menu-label')).toBeNull();
    expect(itemsIn(menu)).toEqual(['Pin', 'Archive', 'Duplicate', 'Delete']);
  });
});
