import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const getAllTasksDue = vi.fn();
const updateTask = vi.fn();
let feed: (() => void) | null = null;
vi.mock('../src/lib/db', () => ({
  getAllTasksDue: (...a: unknown[]) => getAllTasksDue(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
  subscribe: (cb: () => void) => { feed = cb; return () => { feed = null; }; },
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return { showError: vi.fn(), projects: w([]), spaces: w([]) };
});
vi.mock('../src/config', async (orig) => ({ ...(await orig<object>()), getWeekStartsMonday: () => true }));

import AgendaScreen from '../src/lib/phone/AgendaScreen.svelte';
import { actions } from '../src/lib/phone/nav';
import { agendaDay } from '../src/lib/phone/agenda/month';
import { monthGrid, endOfWeek } from '../src/lib/phone/agenda/month';
import { shortDate } from '../src/lib/phone/format';
import { projects, showError } from '../src/lib/store';
import { localDateStr } from '../src/lib/utils';
import { get, type Writable } from 'svelte/store';

const project = {
  _id: 'project:p', type: 'project', space_id: 'space:s', name: 'House', position: 0, default_view: 'kanban',
  columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }], updated_at: '', source: '',
} as ProjectDoc;
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); };
const task = (id: string, due: string, over: Partial<TaskDoc> = {}) => ({
  _id: id, type: 'task', project_id: 'project:p', space_id: 'space:s', column_id: 'col:todo', title: id.slice(5),
  body: '', priority: 1, due_date: due, reminder_at: null, tags: [], position: 0, deleted: false,
  created_at: '', updated_at: '', source: '', project_name: 'House', ...over,
}) as TaskDoc & { project_name: string };

const rows = () => [
  task('task:Late', day(-2)), task('task:Now', day(0)), task('task:Next', day(1)), task('task:Far', day(40)),
];

describe('phone Agenda', () => {
  beforeEach(() => {
    localStorage.clear();
    (projects as Writable<ProjectDoc[]>).set([project]);
    getAllTasksDue.mockReset().mockResolvedValue(rows());
    updateTask.mockReset().mockResolvedValue(undefined);
    vi.mocked(showError).mockClear();
  });

  it('groups by Late / Today / Tomorrow / Later with counts', async () => {
    const { container, findByText } = render(AgendaScreen);
    await findByText('Now');
    const secs = [...container.querySelectorAll('.p-sec')].map(s => s.textContent!.replace(/\s+/g, ' ').trim());
    expect(secs).toEqual(['Late 1', 'Today 1', 'Tomorrow 1', 'Later 1']);
    expect(container.querySelector('.p-sec.late')?.textContent).toContain('Late');
    expect(get(agendaDay)).toBe(null); // the + button only takes a day from Month
  });

  it('puts a task due later this week under This week', async () => {
    const end = endOfWeek(true);
    const mid = day(2) <= end ? day(2) : null;
    getAllTasksDue.mockResolvedValue(mid ? [task('task:Mid', mid)] : [task('task:Mid', day(9))]);
    const { container, findByText } = render(AgendaScreen);
    await findByText('Mid');
    expect(container.querySelector('.p-sec')!.textContent).toContain(mid ? 'This week' : 'Later');
  });

  it('tapping a task opens it; finishing moves it to the last status', async () => {
    const open = vi.spyOn(actions, 'openTask').mockImplementation(() => {});
    const { findByText, getByLabelText } = render(AgendaScreen);
    await fireEvent.click(await findByText('Now'));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task:Now' }));
    await fireEvent.click(getByLabelText('Finish: Now'));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:Now', { column_id: 'col:done' }));
  });

  it('refreshes from the change feed', async () => {
    const { findByText } = render(AgendaScreen);
    await findByText('Now');
    getAllTasksDue.mockResolvedValue([task('task:Fresh', day(0))]);
    feed!();
    expect(await findByText('Fresh')).toBeTruthy();
  });

  it('Month: remembers the mode, Monday-first grid, today selected, picks a day, adds on that day', async () => {
    const add = vi.spyOn(actions, 'quickAdd').mockImplementation(() => {});
    const { getByText, getByLabelText, container, findByText } = render(AgendaScreen);
    await findByText('Now');
    await fireEvent.click(getByText('Month'));
    expect(localStorage.getItem('offlog_agenda_view')).toBe('month');
    expect([...container.querySelectorAll('.wd')].map(x => x.textContent).join('')).toBe('MTWTFSS');
    expect(container.querySelectorAll('.month button').length).toBe(monthGrid(0, true).days.length);
    expect(container.querySelector('.month button.today')?.classList.contains('sel')).toBe(true);
    expect(get(agendaDay)).toBe(day(0));
    expect(getByText('Now')).toBeTruthy();

    const lateCell = getByLabelText(`${shortDate(day(-2))}, 1 due`);
    expect(lateCell.querySelector('i.late')).toBeTruthy();

    await fireEvent.click(getByLabelText(`${shortDate(day(1))}, 1 due`));
    expect(getByText('Next')).toBeTruthy();
    expect(get(agendaDay)).toBe(day(1));
    await fireEvent.click(getByText(`Add a task on ${shortDate(day(1))}`));
    expect(add).toHaveBeenCalledWith(day(1));
  });

  it('Month: an empty day says so; next month selects its first day; Today returns', async () => {
    localStorage.setItem('offlog_agenda_view', 'month');
    getAllTasksDue.mockResolvedValue([]);
    const { getByText, getByLabelText, container } = render(AgendaScreen);
    await waitFor(() => getByText('Nothing due. Tap + to add a task on this day.'));
    await fireEvent.click(getByLabelText('Next month'));
    const d = new Date(); const first = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
    expect(container.querySelector('.month button.sel')?.getAttribute('aria-label')).toBe(`${shortDate(first)}, 0 due`);
    await fireEvent.click(getByText('Today'));
    expect(container.querySelector('.month button.sel.today')).toBeTruthy();
  });

  it('leaving Agenda clears the shared day', async () => {
    localStorage.setItem('offlog_agenda_view', 'month');
    const { unmount, findByText } = render(AgendaScreen);
    await findByText('Now');
    expect(get(agendaDay)).toBe(day(0));
    unmount();
    expect(get(agendaDay)).toBe(null);
  });

  it('a failed load surfaces an error', async () => {
    getAllTasksDue.mockRejectedValue(new Error('boom'));
    render(AgendaScreen);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not load the agenda. Please try again.'));
  });
});
