import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const getOpenTasksForFocusPicker = vi.fn();
const getTaskById = vi.fn();
const updateTask = vi.fn();
vi.mock('../src/lib/db', () => ({
  getOpenTasksForFocusPicker: (...a: unknown[]) => getOpenTasksForFocusPicker(...a),
  getTaskById: (...a: unknown[]) => getTaskById(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
  subscribe: () => () => {},
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return { showError: vi.fn(), projects: w([]), spaces: w([]) };
});

import FocusScreen from '../src/lib/phone/FocusScreen.svelte';
import { rankPicker } from '../src/lib/phone/focus/rank';
import { projects, showError } from '../src/lib/store';
import { localDateStr } from '../src/lib/utils';
import type { Writable } from 'svelte/store';

const KEY = 'offlog_focus_lock';
const TODAY = localDateStr(new Date());
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); };
const project = {
  _id: 'project:p', type: 'project', space_id: 'space:s', name: 'House', position: 0, default_view: 'kanban',
  columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }], updated_at: '', source: '',
} as ProjectDoc;
const task = (id: string, over: Partial<TaskDoc> = {}) => ({
  _id: id, type: 'task', project_id: 'project:p', space_id: 'space:s', column_id: 'col:todo', title: id.slice(5),
  body: '', priority: 1, due_date: null, reminder_at: null, tags: [], position: 0, deleted: false,
  created_at: '', updated_at: '', source: '', project_name: 'House', ...over,
}) as TaskDoc & { project_name: string };

const pool = [
  task('task:Plants', { pinned: true }), task('task:Taxes', { due_date: day(-3) }),
  task('task:Dentist', { due_date: day(1) }), task('task:Report', { priority: 3 }), task('task:Socks'),
];
const byId = Object.fromEntries(pool.map(t => [t._id, t]));
const lockIds = () => JSON.parse(localStorage.getItem(KEY) ?? 'null')?.taskIds ?? null;

describe('phone Focus', () => {
  beforeEach(() => {
    localStorage.clear();
    (projects as Writable<ProjectDoc[]>).set([project]);
    getOpenTasksForFocusPicker.mockReset().mockResolvedValue(pool);
    getTaskById.mockReset().mockImplementation(async (id: string) => byId[id] ?? null);
    vi.mocked(showError).mockClear();
  });

  it('ranks pinned, late, due soon, then priority, one per reason', () => {
    const r = rankPicker(pool, TODAY, 3, () => 0);
    expect(r.suggested.map(s => [s.task.title, s.reason])).toEqual([['Plants', 'pinned'], ['Taxes', 'overdue'], ['Dentist', 'due_soon']]);
    expect(r.rest.map(t => t.title)).toEqual(['Report', 'Socks']);
  });

  it('no lock: suggests three with a why label, then commits the picked ones', async () => {
    const { findByText, getByText, getAllByText, queryByText, container } = render(FocusScreen);
    await findByText('3 to pick');
    expect(queryByText('Reset')).toBeNull();
    expect([...container.querySelectorAll('.why')].map(x => x.textContent)).toEqual(['Pinned', 'Late', 'Due soon']);
    expect(getByText('3 to pick')).toBeTruthy();
    await fireEvent.click(getByText('Taxes'));
    await fireEvent.click(getByText('Dentist'));
    expect(getByText('1 to pick')).toBeTruthy();
    await fireEvent.click(getByText("Let's focus on 2 tasks"));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ date: TODAY, taskIds: ['task:Taxes', 'task:Dentist'] });
    await findByText('0 of 2 done · the rest can wait');
    expect(getAllByText('Reset')).toHaveLength(1);
    expect(container.querySelectorAll('.bar i')).toHaveLength(2);
  });

  it('stops at three picks; the full list is one tap away', async () => {
    const { findByText, getByText, container } = render(FocusScreen);
    await findByText('Plants');
    await fireEvent.click(getByText('Show all 5 open tasks'));
    for (const t of ['Plants', 'Taxes', 'Dentist', 'Report']) await fireEvent.click(getByText(t));
    expect(container.querySelectorAll('.lrow.picked')).toHaveLength(3);
    await fireEvent.click(getByText("Let's focus on 3 tasks"));
    expect(lockIds()).toEqual(['task:Plants', 'task:Taxes', 'task:Dentist']);
  });

  it('a lock with room left can take more, appended', async () => {
    localStorage.setItem(KEY, JSON.stringify({ date: TODAY, taskIds: ['task:Report'] }));
    const { findByText, getByText } = render(FocusScreen);
    await findByText('0 of 1 done · the rest can wait');
    expect(getByText('2 to pick')).toBeTruthy();
    await fireEvent.click(getByText('Plants'));
    await fireEvent.click(getByText('Add 1 to focus'));
    expect(lockIds()).toEqual(['task:Report', 'task:Plants']);
  });

  it('removing a task updates the lock; removing the last clears it', async () => {
    localStorage.setItem(KEY, JSON.stringify({ date: TODAY, taskIds: ['task:Report', 'task:Socks'] }));
    const { findByLabelText, getByLabelText, findByText } = render(FocusScreen);
    await fireEvent.click(await findByLabelText('Remove from focus: Report'));
    await waitFor(() => expect(lockIds()).toEqual(['task:Socks']));
    await fireEvent.click(getByLabelText('Remove from focus: Socks'));
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
    await findByText('Pick up to three things for today');
  });

  it('Reset clears the lock', async () => {
    localStorage.setItem(KEY, JSON.stringify({ date: TODAY, taskIds: ['task:Report'] }));
    const { findByText } = render(FocusScreen);
    await fireEvent.click(await findByText('Reset'));
    expect(localStorage.getItem(KEY)).toBeNull();
    await findByText('Pick up to three things for today');
  });

  it('a lock whose tasks were all deleted or archived counts as no lock', async () => {
    getTaskById.mockImplementation(async (id: string) => (id === 'task:Gone' ? { ...task('task:Gone'), deleted: true } : id === 'task:Arch' ? { ...task('task:Arch'), archived: true } : null));
    localStorage.setItem(KEY, JSON.stringify({ date: TODAY, taskIds: ['task:Gone', 'task:Arch', 'task:Missing'] }));
    const { findByText, queryByText } = render(FocusScreen);
    await findByText('Pick up to three things for today');
    expect(queryByText(/of 0 done/)).toBeNull();
    expect(queryByText('Reset')).toBeNull();
    expect(await findByText('3 to pick')).toBeTruthy();
  });

  it('when every locked task is done it says so, and finishing works from the card', async () => {
    getTaskById.mockImplementation(async (id: string) => ({ ...byId[id], column_id: 'col:done' }));
    localStorage.setItem(KEY, JSON.stringify({ date: TODAY, taskIds: ['task:Report', 'task:Socks', 'task:Dentist'] }));
    const { findByText, queryByText, getByLabelText } = render(FocusScreen);
    await findByText('3 of 3 done · the rest can wait');
    expect(queryByText(/All 3 done/)).toBeTruthy();
    expect(queryByText(/d to pick/)).toBeNull();
    updateTask.mockReset().mockResolvedValue(undefined);
    await fireEvent.click(getByLabelText('Mark not done: Report'));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:Report', { column_id: 'col:todo' }));
  });

  it('a stale lock from another day is ignored', async () => {
    localStorage.setItem(KEY, JSON.stringify({ date: '2000-01-01', taskIds: ['task:Report'] }));
    const { findByText } = render(FocusScreen);
    await findByText('Pick up to three things for today');
  });

  it('failures surface errors', async () => {
    getOpenTasksForFocusPicker.mockRejectedValue(new Error('boom'));
    render(FocusScreen);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not load Focus. Please try again.'));
  });

  it('a failed save surfaces an error and keeps the selection', async () => {
    const { findByText, getByText, container } = render(FocusScreen);
    await fireEvent.click(await findByText('Plants'));
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    await fireEvent.click(getByText("Let's focus on 1 task"));
    spy.mockRestore();
    expect(showError).toHaveBeenCalledWith('Could not save your focus. Please try again.');
    expect(container.querySelectorAll('.lrow.picked')).toHaveLength(1);
  });
});
