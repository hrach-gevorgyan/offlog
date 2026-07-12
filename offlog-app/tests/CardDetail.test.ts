import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

// CardDetail talks to db.ts/store.ts/notifications.ts for everything —
// mocked here so this is a true component test (save/diff logic, not a
// round-trip through the real database, which db.test.ts already covers).
const updateTask = vi.fn().mockResolvedValue(undefined);
const deleteTask = vi.fn().mockResolvedValue(undefined);
const archiveTask = vi.fn().mockResolvedValue(undefined);
const duplicateTask = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/db', () => ({
  updateTask: (...args: unknown[]) => updateTask(...args),
  deleteTask: (...args: unknown[]) => deleteTask(...args),
  archiveTask: (...args: unknown[]) => archiveTask(...args),
  duplicateTask: (...args: unknown[]) => duplicateTask(...args),
  getAllTags: vi.fn().mockResolvedValue([]),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
}));

const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...args: unknown[]) => reloadTasks(...args),
  showError: (...args: unknown[]) => showError(...args),
  modalOpen: writable(false),
}));

vi.mock('../src/lib/notifications', () => ({
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

import CardDetail from '../src/lib/CardDetail.svelte';

function mkProject(): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0,
    columns: [
      { id: 'col:idea', name: 'Idea' },
      { id: 'col:task', name: 'Task' },
      { id: 'col:done', name: 'Completed' },
    ],
    default_view: 'kanban', updated_at: new Date().toISOString(), source: 'pc',
  };
}

function mkTask(overrides: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: 'task:1', type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:idea', title: 'Original title', body: '', priority: 1,
    due_date: null, reminder_at: null, tags: [], position: 1024,
    deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    source: 'pc',
    ...overrides,
  };
}

beforeEach(() => {
  updateTask.mockClear();
  deleteTask.mockClear();
  archiveTask.mockClear();
  duplicateTask.mockClear();
  reloadTasks.mockClear();
  showError.mockClear();
});

afterEach(() => cleanup());

describe('CardDetail save logic (A9)', () => {
  it('saves an edited title', async () => {
    const task = mkTask();
    const { getByPlaceholderText, getByText } = render(CardDetail, { props: { task, project: mkProject() } });

    const titleInput = getByPlaceholderText('Task title') as HTMLTextAreaElement;
    await fireEvent.input(titleInput, { target: { value: 'Updated title' } });
    await fireEvent.click(getByText('Save'));

    expect(updateTask).toHaveBeenCalledTimes(1);
    const [id, changes] = updateTask.mock.calls[0];
    expect(id).toBe('task:1');
    expect(changes.title).toBe('Updated title');
  });

  it('reloads tasks after a successful save', async () => {
    const { getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });
    await fireEvent.click(getByText('Save'));
    expect(reloadTasks).toHaveBeenCalledTimes(1);
  });

  it('shows an error and does not reload if the save fails', async () => {
    updateTask.mockRejectedValueOnce(new Error('network down'));
    const { getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });
    await fireEvent.click(getByText('Save'));
    expect(showError).toHaveBeenCalledTimes(1);
    expect(reloadTasks).not.toHaveBeenCalled();
  });

  it('sets due_date via the "Today" quick-shortcut and saves it as a bare date string', async () => {
    const task = mkTask();
    const { getByText, container } = render(CardDetail, { props: { task, project: mkProject() } });

    const todayShortcut = container.querySelector('.due-shortcut') as HTMLButtonElement;
    expect(todayShortcut?.textContent).toBe('Today');
    await fireEvent.click(todayShortcut);
    await fireEvent.click(getByText('Save'));

    const [, changes] = updateTask.mock.calls[0];
    const expected = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const expectedStr = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`;
    expect(changes.due_date).toBe(expectedStr);
  });

  it('toggling a checklist item\'s "done" state persists on save (section is auto-expanded when non-empty)', async () => {
    const task = mkTask({ checklist: [{ text: 'Step 1', done: false }] });
    const { getByText, container } = render(CardDetail, { props: { task, project: mkProject() } });

    const checkbox = container.querySelector('.checklist-check') as HTMLButtonElement;
    expect(checkbox).toBeTruthy();
    await fireEvent.click(checkbox);
    await fireEvent.click(getByText('Save'));

    const [, changes] = updateTask.mock.calls[0];
    expect(changes.checklist?.[0].done).toBe(true);
  });
});
