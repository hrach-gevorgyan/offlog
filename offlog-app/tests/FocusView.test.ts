import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

// The picker's suggestion ranking is relative to "today", and the
// commitment lock is keyed by today's date — both would drift with the day
// the suite happens to run without a pinned clock.
const NOW = new Date('2026-03-11T10:00:00');
const TODAY = '2026-03-11';
const LOCK_KEY = 'offlog_focus_lock';

const updateTask = vi.fn().mockResolvedValue(undefined);
const getTaskById = vi.fn().mockResolvedValue(null);
const getOpenTasksForFocusPicker = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/db', () => ({
  getOpenTasksForFocusPicker: (...a: unknown[]) => getOpenTasksForFocusPicker(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
  getTaskById: (...a: unknown[]) => getTaskById(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
  // reached only when a note is opened into CardDetail
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
  archiveTask: vi.fn().mockResolvedValue(undefined),
  duplicateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
}));

// The factory is hoisted above every const in this file, so the store is
// created inside it and imported back below rather than closed over.
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(),
    projects: w([]),
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    modalOpen: w(false),
  };
});

vi.mock('../src/config', () => ({
  getWeekStartsMonday: () => true,
  getDefaultReminderTime: () => '09:00',
  getTimeFormat24h: () => true,
  isNativePlatform: () => false,
  isTauri: () => false,
  isHapticsEnabled: () => false,
}));

vi.mock('../src/lib/notifications', () => ({
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

vi.mock('../src/lib/confirm', () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));

import { projects as projectsStore, showError } from '../src/lib/store';
import FocusView from '../src/lib/FocusView.svelte';

const COLUMNS = [
  { id: 'col:todo', name: 'To do' },
  { id: 'col:doing', name: 'Doing' },
  { id: 'col:done', name: 'Done' },
];

function mkProject(extra: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0, columns: COLUMNS, default_view: 'list',
    updated_at: '2026-01-01T00:00:00.000Z', source: 'PC', ...extra,
  };
}

function mkTask(id: string, extra: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: id, type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Task ' + id, body: '', priority: 1,
    due_date: null, reminder_at: null, tags: [], position: 100, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'PC', ...extra,
  };
}

const notes = (c: HTMLElement) => [...c.querySelectorAll('.note')] as HTMLElement[];
const noteFor = (c: HTMLElement, title: string) =>
  notes(c).find(n => n.querySelector('.note-title')!.textContent === title)!;
const chipOf = (n: HTMLElement) => n.querySelector('.suggest-chip')?.textContent ?? null;
const rowTitles = (c: HTMLElement) =>
  [...c.querySelectorAll('.task-row .task-title')].map(e => e.textContent);
const commitBtn = (c: HTMLElement) => c.querySelector('.commit-btn') as HTMLButtonElement;

const readLock = () => JSON.parse(localStorage.getItem(LOCK_KEY)!);

async function renderPicker(tasks: TaskDoc[]) {
  getOpenTasksForFocusPicker.mockResolvedValueOnce(tasks);
  const r = render(FocusView);
  await waitFor(() => { if (notes(r.container).length === 0) throw new Error('picker empty'); });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  (projectsStore as any).set([mkProject()]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('FocusView picker', () => {
  // The chip is the "why this made the cut" label, so the wrong reason on
  // the right task is still a wrong suggestion.
  it('labels suggestions pinned / overdue / due-soon, one per bucket', async () => {
    const { container } = await renderPicker([
      mkTask('task:pin', { title: 'Pinned one', pinned: true }),
      mkTask('task:late', { title: 'Late one', due_date: '2026-03-01' }),
      mkTask('task:soon', { title: 'Soon one', due_date: TODAY }),
      mkTask('task:plain', { title: 'Plain one', priority: 3 }),
    ]);

    expect(chipOf(noteFor(container, 'Pinned one'))).toBe('Pinned');
    expect(chipOf(noteFor(container, 'Late one'))).toBe('Overdue');
    expect(chipOf(noteFor(container, 'Soon one'))).toBe('Due soon');
    // Only 3 may be suggested — the round robin fills pinned/overdue/due-soon first.
    expect(chipOf(noteFor(container, 'Plain one'))).toBeNull();
    expect(container.querySelectorAll('.suggest-chip')).toHaveLength(3);
  });

  it('falls back to priority order when no task is pinned, overdue or due soon', async () => {
    const { container } = await renderPicker([
      mkTask('task:lo', { title: 'Low', priority: 1 }),
      mkTask('task:hi', { title: 'High', priority: 3 }),
      mkTask('task:mid', { title: 'Mid', priority: 2 }),
    ]);

    expect(notes(container).map(n => n.querySelector('.note-title')!.textContent))
      .toEqual(['High', 'Mid', 'Low']);
    expect(chipOf(noteFor(container, 'High'))).toBe('High priority');
  });

  it('ranks a more-overdue task above a less-overdue one', async () => {
    const { container } = await renderPicker([
      mkTask('task:a', { title: 'Slightly late', due_date: '2026-03-10' }),
      mkTask('task:b', { title: 'Very late', due_date: '2026-02-01' }),
    ]);

    const suggested = notes(container)
      .filter(n => n.classList.contains('suggested'))
      .map(n => n.querySelector('.note-title')!.textContent);
    expect(suggested[0]).toBe('Very late');
  });

  it('selects at most three tasks', async () => {
    const { container } = await renderPicker([
      mkTask('task:1'), mkTask('task:2'), mkTask('task:3'), mkTask('task:4'),
    ]);

    for (const n of notes(container)) await fireEvent.click(n);

    expect(container.querySelectorAll('.note.selected')).toHaveLength(3);
    expect(commitBtn(container).textContent).toContain("Let's focus on 3 tasks");
  });

  it('deselects a task that is clicked twice', async () => {
    const { container } = await renderPicker([mkTask('task:1'), mkTask('task:2')]);

    await fireEvent.click(notes(container)[0]);
    await fireEvent.click(notes(container)[0]);

    expect(container.querySelectorAll('.note.selected')).toHaveLength(0);
    expect(commitBtn(container).disabled).toBe(true);
  });

  it('cannot commit with nothing selected', async () => {
    const { container } = await renderPicker([mkTask('task:1')]);

    expect(commitBtn(container).disabled).toBe(true);
    await fireEvent.click(commitBtn(container));
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
  });
});

describe('FocusView commitment lock', () => {
  it('writes the picked ids under today\'s date and switches to the locked list', async () => {
    const { container } = await renderPicker([
      mkTask('task:a', { title: 'Alpha' }), mkTask('task:b', { title: 'Beta' }),
    ]);
    getTaskById.mockImplementation(async (id: string) =>
      mkTask(id, { title: id === 'task:a' ? 'Alpha' : 'Beta' }));

    await fireEvent.click(noteFor(container, 'Alpha'));
    await fireEvent.click(noteFor(container, 'Beta'));
    await fireEvent.click(commitBtn(container));

    expect(readLock()).toEqual({ date: TODAY, taskIds: ['task:a', 'task:b'] });
    await waitFor(() => expect(rowTitles(container)).toEqual(['Alpha', 'Beta']));
    expect(container.querySelector('.board')).toBeNull();
  });

  it('ignores a lock left over from a previous day', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ date: '2026-03-10', taskIds: ['task:a'] }));
    const { container } = await renderPicker([mkTask('task:x', { title: 'Fresh' })]);

    expect(rowTitles(container)).toEqual([]);
    expect(noteFor(container, 'Fresh')).toBeTruthy();
    expect(getTaskById).not.toHaveBeenCalled();
  });

  it('drops locked tasks that were deleted or archived elsewhere', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({
      date: TODAY, taskIds: ['task:a', 'task:b', 'task:c'],
    }));
    getTaskById.mockImplementation(async (id: string) => ({
      'task:a': mkTask('task:a', { title: 'Alive' }),
      'task:b': mkTask('task:b', { title: 'Gone', deleted: true }),
      'task:c': mkTask('task:c', { title: 'Filed', archived: true }),
    }[id] ?? null));
    const { container } = render(FocusView);

    await waitFor(() => expect(rowTitles(container)).toEqual(['Alive']));
  });

  it('clears the lock on reset and returns to the picker', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ date: TODAY, taskIds: ['task:a'] }));
    getTaskById.mockResolvedValue(mkTask('task:a', { title: 'Alive' }));
    getOpenTasksForFocusPicker.mockResolvedValue([mkTask('task:z', { title: 'Back in picker' })]);
    const { container } = render(FocusView);
    await waitFor(() => expect(rowTitles(container)).toEqual(['Alive']));

    await fireEvent.click(container.querySelector('.reset-btn') as HTMLButtonElement);

    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    await waitFor(() => expect(noteFor(container, 'Back in picker')).toBeTruthy());
  });
});

describe('FocusView mark done', () => {
  async function renderLocked(task: TaskDoc) {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ date: TODAY, taskIds: [task._id!] }));
    let current = task;
    getTaskById.mockImplementation(async () => current);
    updateTask.mockImplementation(async (_id: string, patch: Partial<TaskDoc>) => {
      current = { ...current, ...patch };
    });
    const r = render(FocusView);
    await waitFor(() => { if (!r.container.querySelector('button.circle')) throw new Error('not loaded'); });
    return r;
  }
  const circle = (c: HTMLElement) => c.querySelector('button.circle') as HTMLButtonElement;

  it('moves the task into its project\'s last status', async () => {
    const { container } = await renderLocked(mkTask('task:a', { column_id: 'col:doing' }));

    await fireEvent.click(circle(container));

    expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:done' });
    expect(vi.mocked(showError)).not.toHaveBeenCalled();
  });

  it('undoes a done-mark back to the status the task came from', async () => {
    const { container } = await renderLocked(mkTask('task:a', { column_id: 'col:doing' }));

    await fireEvent.click(circle(container));
    await waitFor(() => expect(circle(container).classList.contains('done')).toBe(true));
    await fireEvent.click(circle(container));

    expect(updateTask).toHaveBeenLastCalledWith('task:a', { column_id: 'col:doing' });
  });

  // Without a remembered origin (a task already done at mount), undo has to
  // land somewhere sane rather than no-op.
  it('undoes to the first status when the previous one is not remembered', async () => {
    const { container } = await renderLocked(mkTask('task:a', { column_id: 'col:done' }));

    await fireEvent.click(circle(container));

    expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:todo' });
  });

  it('writes nothing when the task\'s project is unknown', async () => {
    (projectsStore as any).set([]);
    const { container } = await renderLocked(mkTask('task:a'));

    await fireEvent.click(circle(container));

    expect(updateTask).not.toHaveBeenCalled();
  });

  it('writes nothing when the project has a single status', async () => {
    (projectsStore as any).set([mkProject({ columns: [{ id: 'col:only', name: 'Only' }] })]);
    const { container } = await renderLocked(mkTask('task:a', { column_id: 'col:only' }));

    await fireEvent.click(circle(container));

    expect(updateTask).not.toHaveBeenCalled();
  });

  it('surfaces an error when the write fails', async () => {
    const { container } = await renderLocked(mkTask('task:a'));
    updateTask.mockRejectedValueOnce(new Error('write failed'));

    await fireEvent.click(circle(container));

    await waitFor(() => expect(vi.mocked(showError)).toHaveBeenCalled());
  });

  it('celebrates only once every locked task sits in its last status', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ date: TODAY, taskIds: ['task:a', 'task:b'] }));
    const tasks: Record<string, TaskDoc> = {
      'task:a': mkTask('task:a', { column_id: 'col:done' }),
      'task:b': mkTask('task:b', { column_id: 'col:todo' }),
    };
    getTaskById.mockImplementation(async (id: string) => tasks[id]);
    updateTask.mockImplementation(async (id: string, patch: Partial<TaskDoc>) => {
      tasks[id] = { ...tasks[id], ...patch };
    });
    const { container } = render(FocusView);
    await waitFor(() => expect(rowTitles(container)).toHaveLength(2));

    expect(container.querySelector('.empty')).toBeNull();

    const bCircle = [...container.querySelectorAll('button.circle')][1] as HTMLButtonElement;
    await fireEvent.click(bCircle);

    await waitFor(() =>
      expect(container.querySelector('.empty')!.textContent).toContain('All 2 committed today'));
  });
});
