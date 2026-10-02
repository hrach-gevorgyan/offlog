import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get, type Writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const getAllTasksDue = vi.fn();
const getDashboardData = vi.fn();
const getTasksForProject = vi.fn();
const updateTask = vi.fn();
vi.mock('../src/lib/db', () => ({
  getAllTasksDue: (...a: unknown[]) => getAllTasksDue(...a),
  getDashboardData: (...a: unknown[]) => getDashboardData(...a),
  getTasksForProject: (...a: unknown[]) => getTasksForProject(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
  duplicateTask: vi.fn(), archiveTask: vi.fn(), deleteTask: vi.fn(),
  computeDropPosition: () => 1024,
  subscribe: () => () => {},
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return { showError: vi.fn(), reloadTasks: vi.fn().mockResolvedValue(undefined), modalOpen: w(false), projects: w([]), spaces: w([]) };
});
vi.mock('../src/lib/haptics', () => ({ hapticToggle: vi.fn(), hapticDragStart: vi.fn() }));

import TaskListScreen from '../src/lib/phone/TaskListScreen.svelte';
import { projects, showError } from '../src/lib/store';
import { stack, toast } from '../src/lib/phone/nav';
import { localDateStr } from '../src/lib/utils';

const project = {
  _id: 'project:p', type: 'project', space_id: 'space:s', name: 'House', position: 0, default_view: 'kanban',
  columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }], updated_at: '', source: '',
} as ProjectDoc;
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); };
const task = (id: string, due: string | null, over: Partial<TaskDoc> = {}) => ({
  _id: id, type: 'task', project_id: 'project:p', space_id: 'space:s', column_id: 'col:todo', title: id.slice(5),
  body: '', priority: 1, due_date: due, reminder_at: null, tags: [], position: 0, deleted: false,
  created_at: '', updated_at: '', source: '', project_name: 'House', ...over,
}) as TaskDoc & { project_name: string };

describe('phone task lists', () => {
  beforeEach(() => {
    stack.set([{ k: 'today' }]);
    (projects as Writable<ProjectDoc[]>).set([project]);
    getAllTasksDue.mockReset().mockResolvedValue([task('task:Now', day(0)), task('task:Old', day(-3)), task('task:Older', day(-9))]);
    getTasksForProject.mockReset().mockResolvedValue([task('task:Now', day(0))]);
    updateTask.mockReset().mockResolvedValue(undefined);
    vi.mocked(showError).mockClear();
    toast.set(null);
  });

  it('Today: late tasks are one row at the top that opens Late; today rows drop the Today pill', async () => {
    const { findByText, getByLabelText, queryByText, container } = render(TaskListScreen, { kind: 'today' });
    await findByText('Now');
    expect(queryByText('Old')).toBeNull();
    expect(container.querySelector('.p-sec.late')).toBeNull();
    const row = getByLabelText('Open Overdue: 2 overdue tasks');
    expect(row.compareDocumentPosition(container.querySelector('.card')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.pill')).toBeNull();
    await fireEvent.click(row);
    expect(get(stack).at(-1)?.k).toBe('late');
  });

  it('Late: All to today moves every late task to today; Undo puts each date back', async () => {
    const { findByText, getByRole } = render(TaskListScreen, { kind: 'late' });
    await findByText('Old');
    await fireEvent.click(getByRole('button', { name: 'All to today' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenCalledWith('task:Old', { due_date: day(0) });
    expect(updateTask).toHaveBeenCalledWith('task:Older', { due_date: day(0) });
    const t = get(toast);
    expect(t?.text).toBe('Moved 2 to today');
    updateTask.mockClear();
    await t!.undo!();
    expect(updateTask).toHaveBeenCalledWith('task:Old', { due_date: day(-3), reminder_at: null });
    expect(updateTask).toHaveBeenCalledWith('task:Older', { due_date: day(-9), reminder_at: null });
  });

  it('Late: repeating tasks stay where they are; with only those left there is no button', async () => {
    getAllTasksDue.mockResolvedValue([task('task:Old', day(-3)), task('task:Rep', day(-2), { recurrence: 'weekly' } as Partial<TaskDoc>)]);
    const { findByText, getByRole, unmount } = render(TaskListScreen, { kind: 'late' });
    await findByText('Rep');
    await fireEvent.click(getByRole('button', { name: 'All to today' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask).toHaveBeenCalledWith('task:Old', { due_date: day(0) });
    unmount();
    getAllTasksDue.mockResolvedValue([task('task:Rep', day(-2), { recurrence: 'weekly' } as Partial<TaskDoc>)]);
    const r2 = render(TaskListScreen, { kind: 'late' });
    await r2.findAllByText('Rep');
    expect(r2.queryByRole('button', { name: 'All to today' })).toBeNull();
  });

  it('Late: a reminder that follows the due date moves with it; a failure surfaces an error', async () => {
    getAllTasksDue.mockResolvedValue([task('task:Old', day(-3), { remindOnDue: true } as Partial<TaskDoc>)]);
    const { findByText, getByRole } = render(TaskListScreen, { kind: 'late' });
    await findByText('Old');
    await fireEvent.click(getByRole('button', { name: 'All to today' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    expect(updateTask.mock.calls[0][1]).toMatchObject({ due_date: day(0), reminder_at: expect.any(String) });
    updateTask.mockRejectedValueOnce(new Error('x'));
    await fireEvent.click(getByRole('button', { name: 'All to today' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not move every task. Please try again.'));
  });

  it('Late: a move that fails part-way offers Undo for the moved ones; a failed Undo surfaces an error', async () => {
    updateTask.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x'));
    const { findByText, getByRole } = render(TaskListScreen, { kind: 'late' });
    await findByText('Old');
    await fireEvent.click(getByRole('button', { name: 'All to today' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not move every task. Please try again.'));
    const t = get(toast);
    expect(t?.text).toBe('Moved 1 of 2 to today');
    updateTask.mockReset().mockRejectedValue(new Error('y'));
    await t!.undo!();
    expect(showError).toHaveBeenCalledWith('Could not undo the move. Please try again.');
  });

  it('Today: no late row when nothing is late', async () => {
    getAllTasksDue.mockResolvedValue([task('task:Now', day(0))]);
    const { findByText, queryByLabelText } = render(TaskListScreen, { kind: 'today' });
    await findByText('Now');
    expect(queryByLabelText(/Open Late/)).toBeNull();
  });

  it('Late keeps its late pills', async () => {
    const { findByText, getByText } = render(TaskListScreen, { kind: 'late' });
    await findByText('Old');
    expect(getByText('3 days overdue')).toBeTruthy();
  });

  it('Today regroups at local midnight with no write and no wake', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(2026, 9, 2, 23, 59));
      getAllTasksDue.mockResolvedValue([task('task:Now', '2026-10-02'), task('task:Next', '2026-10-03')]);
      const { findByText, queryByText, findByLabelText, queryByLabelText } = render(TaskListScreen, { kind: 'today' });
      await findByText('Now');
      expect(queryByText('Next')).toBeNull();
      expect(queryByLabelText(/Open Overdue/)).toBeNull();

      await vi.advanceTimersByTimeAsync(61_000);
      await findByText('Next');
      expect(await findByLabelText('Open Overdue: 1 overdue task')).toBeTruthy();
      expect(queryByText('Now')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('Pinned, when empty, says how to pin', async () => {
    getDashboardData.mockResolvedValue({ pinnedAll: [], projCache: {} });
    const { findByText } = render(TaskListScreen, { kind: 'pinned' });
    expect(await findByText(/tap the pin on its page/)).toBeTruthy();
  });

  it('holding a row opens the card menu for it; Pin writes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { findByText, getByText } = render(TaskListScreen, { kind: 'today' });
      const body = (await findByText('Now')).closest('button')!;
      await fireEvent.pointerDown(body);
      vi.advanceTimersByTime(500);
      vi.useRealTimers();
      await waitFor(() => expect(getByText('Pin')).toBeTruthy());
      expect(getTasksForProject).toHaveBeenCalledWith('project:p');
      await fireEvent.click(getByText('Pin'));
      await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:Now', { pinned: true }));
    } finally { vi.useRealTimers(); }
  });

  it('a menu that cannot load its project tasks surfaces an error', async () => {
    getTasksForProject.mockRejectedValue(new Error('boom'));
    const { findByText } = render(TaskListScreen, { kind: 'today' });
    const body = (await findByText('Now')).closest('button')!;
    await fireEvent.contextMenu(body);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not load this task. Please try again.'));
  });
});
