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
  return { showError: vi.fn(), reloadTasks: vi.fn(), projects: w([]), spaces: w([]) };
});
vi.mock('../src/config', async (orig) => ({ ...(await orig<object>()), getWeekStartsMonday: () => true }));

import AgendaScreen from '../src/lib/phone/AgendaScreen.svelte';
import { actions, stack, toast } from '../src/lib/phone/nav';
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
    stack.set([{ k: 'agenda' }]);
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

  it('a finished task collapses out of its group, and Undo brings the same row back', async () => {
    const { getByLabelText, findByText } = render(AgendaScreen);
    await findByText('Now');
    const row = getByLabelText('Finish: Now').closest('.card')!.parentElement!;
    getAllTasksDue.mockResolvedValue(rows().filter(t => t._id !== 'task:Now'));
    await fireEvent.click(getByLabelText('Finish: Now'));
    // The check fills before the write is back.
    expect(getByLabelText('Finish: Now').classList.contains('on')).toBe(true);
    // Gone from the data, but collapsing rather than cut: Svelte holds an
    // outroing element inert until its transition ends. Today had only this
    // task, so the whole group (heading too) is what collapses.
    const leaving = (n: HTMLElement | null) => { for (; n; n = n.parentElement) if (n.inert) return true; return false; };
    await waitFor(() => expect(leaving(row)).toBe(true));
    expect(row.isConnected).toBe(true);
    getAllTasksDue.mockResolvedValue(rows());
    await get(toast)!.undo!();
    expect(updateTask).toHaveBeenLastCalledWith('task:Now', expect.objectContaining({ column_id: 'col:todo' }));
    feed!(); // the Undo write comes back through the change feed
    await waitFor(() => expect(leaving(row)).toBe(false));
    expect(getByLabelText('Finish: Now').closest('.card')!.parentElement).toBe(row);
    expect(getByLabelText('Finish: Now').classList.contains('on')).toBe(false);
  });

  it('a group for one day drops that pill from its rows; Late and Later keep theirs', async () => {
    const { findByText, container } = render(AgendaScreen);
    await findByText('Now');
    const pills = [...container.querySelectorAll('.pill')].map(p => p.textContent);
    expect(pills).toEqual(['2 days late', shortDate(day(40))]);
  });

  it('Month: up to three dots for a day, a count past that', async () => {
    localStorage.setItem('offlog_agenda_view', 'month');
    getAllTasksDue.mockResolvedValue([
      ...['a', 'b', 'c'].map(x => task(`task:${x}`, day(1))),
      ...['d', 'e', 'f', 'g', 'h'].map(x => task(`task:${x}`, day(2))),
    ]);
    const { findByLabelText } = render(AgendaScreen);
    const three = await findByLabelText(`${shortDate(day(1))}, 3 due`);
    expect(three.querySelectorAll('.dots i').length).toBe(3);
    const five = await findByLabelText(`${shortDate(day(2))}, 5 due`);
    expect(five.querySelectorAll('.dots i').length).toBe(0);
    expect(five.querySelector('.dots b')?.textContent).toBe('5');
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
    expect(lateCell.querySelector('.dots.late i')).toBeTruthy();

    await fireEvent.click(getByLabelText(`${shortDate(day(1))}, 1 due`));
    expect(getByText('Next')).toBeTruthy();
    expect(get(agendaDay)).toBe(day(1));
    expect(container.querySelector('.none')).toBeNull();
    const empty = [...container.querySelectorAll('.month button')].find(b => b.getAttribute('aria-label')!.endsWith(', 0 due'))!;
    await fireEvent.click(empty);
    expect(getByText('Nothing due.')).toBeTruthy();
    await fireEvent.click(getByText('Add a task'));
    expect(add).toHaveBeenCalledWith(get(agendaDay));
    expect(get(agendaDay)).not.toBe(day(1));
  });

  it('Month: an empty day says so; next month selects its first day; Today returns', async () => {
    localStorage.setItem('offlog_agenda_view', 'month');
    getAllTasksDue.mockResolvedValue([]);
    const { getByText, getByLabelText, container } = render(AgendaScreen);
    await waitFor(() => getByText('Nothing due.'));
    await fireEvent.click(getByLabelText('Next month'));
    const d = new Date(); const first = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
    expect(container.querySelector('.month button.sel')?.getAttribute('aria-label')).toBe(`${shortDate(first)}, 0 due`);
    await fireEvent.click(getByText('Today'));
    expect(container.querySelector('.month button.sel.today')).toBeTruthy();
  });

  it('Month: the month and day survive the screen being rebuilt', async () => {
    localStorage.setItem('offlog_agenda_view', 'month');
    const first = render(AgendaScreen);
    await first.findByText('Now');
    await fireEvent.click(first.getByLabelText('Next month'));
    await fireEvent.click(first.getByLabelText('Next month'));
    const d = new Date();
    const pick = localDateStr(new Date(d.getFullYear(), d.getMonth() + 2, 10, 12));
    await fireEvent.click(first.getByLabelText(`${shortDate(pick)}, 0 due`));
    first.unmount();
    const again = render(AgendaScreen);
    await waitFor(() => expect(getAllTasksDue).toHaveBeenCalledTimes(2));
    expect(again.container.querySelector('.month button.sel')?.getAttribute('aria-label')).toBe(`${shortDate(pick)}, 0 due`);
    expect(again.container.querySelector('.ml')?.textContent).toBe(new Date(d.getFullYear(), d.getMonth() + 2, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
    expect(get(agendaDay)).toBe(pick);
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
