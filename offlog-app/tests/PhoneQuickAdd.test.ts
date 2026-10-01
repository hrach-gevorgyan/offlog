import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import type { ProjectDoc } from '../src/lib/types';

const createTask = vi.fn();
const findTasksByTitleInProject = vi.fn();
const ensureFreshTagColor = vi.fn();
const deleteTask = vi.fn();
const getAllTags = vi.fn();
const getTagColorOverrides = vi.fn();
vi.mock('../src/lib/db', () => ({
  createTask: (...a: unknown[]) => createTask(...a),
  findTasksByTitleInProject: (...a: unknown[]) => findTasksByTitleInProject(...a),
  ensureFreshTagColor: (...a: unknown[]) => ensureFreshTagColor(...a),
  deleteTask: (...a: unknown[]) => deleteTask(...a),
  getAllTags: (...a: unknown[]) => getAllTags(...a),
  getTagColorOverrides: (...a: unknown[]) => getTagColorOverrides(...a),
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(), reloadTasks: vi.fn(), modalOpen: w(false),
    spaces: w([{ _id: 'space:w', name: 'Work', color: '#3b82f6', position: 0 }, { _id: 'space:h', name: 'Home', color: '#22c55e', position: 1 }]),
    projects: w([]),
  };
});

import QuickAddSheet from '../src/lib/phone/QuickAddSheet.svelte';
import { projects, showError, reloadTasks } from '../src/lib/store';
import { localDateStr } from '../src/lib/utils';
import { dateFromToday } from '../src/lib/carddetail/helpers';
import { shortDate } from '../src/lib/phone/format';
import { get, type Writable } from 'svelte/store';
import { toast } from '../src/lib/phone/nav';

const proj = (id: string, name: string, space: string, cols: string[]) => ({
  _id: id, type: 'project', space_id: space, name, position: 0, default_view: 'kanban',
  columns: cols.map(c => ({ id: c, name: c })), updated_at: '', source: '',
}) as ProjectDoc;
const Q = proj('project:q', 'Q4 Sprint', 'space:w', ['col:q1', 'col:q2', 'col:q3']);
const F = proj('project:f', 'Fitness Tracker', 'space:h', ['col:f1', 'col:f2']);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localDateStr(d); };

// The sheet's outro never finishes in jsdom; Svelte sets `inert` on an outroing element.
const sheetClosing = () => (document.querySelector('.psheet') as HTMLElement | null)?.inert === true;

async function type(getByLabelText: (s: string) => HTMLElement, text: string) {
  const input = getByLabelText('Task title') as HTMLInputElement;
  await fireEvent.input(input, { target: { value: text } });
  return input;
}

describe('phone Quick add', () => {
  beforeEach(async () => {
    // A closed sheet's history.back() lands as an async popstate; let it
    // settle so it cannot pop the next test's sheet.
    await new Promise(r => setTimeout(r, 20));
    (projects as Writable<ProjectDoc[]>).set([Q, F]);
    createTask.mockReset().mockResolvedValue({ _id: 'task:new', title: 'x' });
    findTasksByTitleInProject.mockReset().mockResolvedValue([]);
    ensureFreshTagColor.mockReset().mockResolvedValue(undefined);
    deleteTask.mockReset().mockResolvedValue(undefined);
    getAllTags.mockReset().mockResolvedValue(['errand', 'gym']);
    getTagColorOverrides.mockReset().mockResolvedValue({});
    toast.set(null);
    vi.mocked(showError).mockClear();
    vi.mocked(reloadTasks).mockReset().mockResolvedValue(undefined);
  });

  it('parses date, priority, tags and @project, and creates in that project\'s first status', async () => {
    const created = vi.fn();
    const { getByLabelText, queryByText } = render(QuickAddSheet, { events: { created } } as any);
    const input = await type(getByLabelText, 'Log workout tomorrow !high #gym #legs @fitness');
    expect(getByLabelText('Project: Fitness Tracker').classList.contains('on')).toBe(true);
    expect(getByLabelText('Due: Tomorrow').classList.contains('on')).toBe(true);
    expect(getByLabelText('Priority: High').classList.contains('on')).toBe(true);
    expect(queryByText(/Adds to/)).toBeNull();
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(ensureFreshTagColor.mock.calls).toEqual([['gym', ['legs']], ['legs', ['gym']]]);
    expect(createTask).toHaveBeenCalledWith('project:f', 'space:h', 'col:f1', 'Log workout', {
      priority: 3, due_date: tomorrow(), reminder_at: null, tags: ['gym', 'legs'],
    });
    await waitFor(() => expect(created).toHaveBeenCalled());
    expect(created.mock.calls[0][0].detail).toEqual({ _id: 'task:new', title: 'x' });
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('confirms with a plain toast: no Undo, never a delete', async () => {
    const { getByLabelText } = render(QuickAddSheet);
    expect(getByLabelText('Project: Q4 Sprint').classList.contains('on')).toBe(false);
    await type(getByLabelText, 'Undo me');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(get(toast)?.text).toBe('Added to Q4 Sprint'));
    expect(get(toast)!.undo).toBeUndefined();
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('defaults to the first project with createTask\'s own defaults', async () => {
    const { getByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Plain task');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Plain task', {
      priority: undefined, due_date: null, reminder_at: null, tags: undefined,
    }));
  });

  it('opened from a project status adds there, with a prefilled due date', async () => {
    const { getByLabelText } = render(QuickAddSheet, { props: { projectId: 'project:f', columnId: 'col:f2', dueDate: '2026-10-05' } });
    await type(getByLabelText, 'Stretch');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:f', 'space:h', 'col:f2', 'Stretch', {
      priority: undefined, due_date: '2026-10-05', reminder_at: null, tags: undefined,
    }));
  });

  it('a time sets a reminder; a typed date beats the prefilled one', async () => {
    const { getByLabelText } = render(QuickAddSheet, { props: { dueDate: '2026-10-05' } });
    await type(getByLabelText, 'Call mum tomorrow at 6pm');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    const [, , , title, o] = createTask.mock.calls[0];
    expect(title).toBe('Call mum');
    expect(o.due_date).toBe(tomorrow());
    const r = new Date(o.reminder_at);
    expect([localDateStr(r), r.getHours(), r.getMinutes()]).toEqual([tomorrow(), 18, 0]);
  });

  it('a project picked in its panel wins over @mention; the list is grouped by space', async () => {
    const { getByLabelText, getByRole, getByText, findByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Squats @fitness');
    await fireEvent.click(getByLabelText('Project: Fitness Tracker'));
    expect(getByText('Work')).toBeTruthy();
    expect(getByText('Home')).toBeTruthy();
    expect(getByRole('button', { name: 'Fitness Tracker' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(getByRole('button', { name: 'Q4 Sprint' }));
    expect((await findByLabelText('Project: Q4 Sprint')).classList.contains('on')).toBe(true);
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Squats', {
      priority: undefined, due_date: null, reminder_at: null, tags: undefined,
    }));
  });

  it('a date picked in its panel beats the typed one', async () => {
    const { getByLabelText, getByRole, findByLabelText } = render(QuickAddSheet, { props: { dueDate: '2026-10-05' } });
    await type(getByLabelText, 'Pay rent tomorrow');
    await fireEvent.click(getByLabelText('Due: Tomorrow'));
    await fireEvent.click(getByRole('button', { name: /^In a week/ }));
    await findByLabelText(`Due: ${shortDate(dateFromToday(7))}`);
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Pay rent', {
      priority: undefined, due_date: dateFromToday(7), reminder_at: null, tags: undefined,
    }));
  });

  it('"No date" beats a prefilled date', async () => {
    const { getByLabelText, getByRole, findByLabelText } = render(QuickAddSheet, { props: { dueDate: '2026-10-05' } });
    await type(getByLabelText, 'Someday');
    await fireEvent.click(getByLabelText(/^Due: /));
    await fireEvent.click(getByRole('button', { name: 'No date' }));
    await findByLabelText('Due: No date');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Someday', {
      priority: undefined, due_date: null, reminder_at: null, tags: undefined,
    }));
  });

  it('the date panel offers Next Monday and a calendar', async () => {
    const { getByLabelText, getByRole, getByText, findByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Plan');
    await fireEvent.click(getByLabelText('Due: No date'));
    const dow = new Date().getDay();
    if (dow !== 0 && dow !== 1) expect(getByRole('button', { name: /^Next Monday/ })).toBeTruthy();
    await fireEvent.click(getByText('Select date…'));
    const d = new Date(); d.setDate(28);
    await fireEvent.click(getByRole('button', { name: '28' }));
    await findByLabelText(/^Due: (?!No date)/);
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][4].due_date).toBe(localDateStr(d));
  });

  it('a priority picked in its panel beats the typed one', async () => {
    const { getByLabelText, getByRole, findByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Taxes !low');
    await fireEvent.click(getByLabelText('Priority: Low'));
    expect(getByRole('button', { name: 'Low' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(getByRole('button', { name: 'High' }));
    await findByLabelText('Priority: High');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Taxes', {
      priority: 3, due_date: null, reminder_at: null, tags: undefined,
    }));
  });

  it('None in the priority panel overrides a typed priority', async () => {
    const { getByLabelText, getByRole, findByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Taxes !high');
    await fireEvent.click(getByLabelText('Priority: High'));
    await fireEvent.click(getByRole('button', { name: 'None' }));
    await findByLabelText('Priority: not set');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][4].priority).toBeUndefined();
  });

  it('tags toggle in their panel alongside typed ones; a new tag is normalised', async () => {
    const { getByLabelText, getByRole, findByRole, findByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Buy milk #gym');
    await fireEvent.click(getByLabelText('Tags: gym'));
    expect(getByRole('button', { name: '#gym' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(getByRole('button', { name: '#gym' }));
    await fireEvent.click(await findByRole('button', { name: '#errand' }));
    const nt = getByLabelText('New tag') as HTMLInputElement;
    await fireEvent.input(nt, { target: { value: ' Big Shop ' } });
    await fireEvent.keyDown(nt, { key: 'Enter' });
    expect(nt.value).toBe('');
    expect(getByRole('button', { name: '#big-shop' }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: '#gym' }).getAttribute('aria-pressed')).toBe('false');
    expect(createTask).not.toHaveBeenCalled();
    await fireEvent.click(getByRole('button', { name: 'Done' }));
    await findByLabelText('Tags: errand, big-shop');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Buy milk', {
      priority: undefined, due_date: null, reminder_at: null, tags: ['errand', 'big-shop'],
    }));
    expect(ensureFreshTagColor.mock.calls).toEqual([['errand', ['big-shop']], ['big-shop', ['errand']]]);
  });

  it('a reminder preset is sent as reminder_at', async () => {
    const { getByLabelText, getByRole, findByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Call bank');
    await fireEvent.click(getByLabelText('Reminder: none'));
    await fireEvent.click(getByRole('button', { name: /^Tomorrow at/ }));
    await findByLabelText(/^Reminder: Tomorrow /);
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Call bank', {
      priority: undefined, due_date: null, reminder_at: new Date(`${tomorrow()}T09:00`).toISOString(), tags: undefined,
    }));
  });

  it('"No reminder" beats a typed time', async () => {
    const { getByLabelText, getByRole, findByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Call mum tomorrow at 6pm');
    await fireEvent.click(getByLabelText(/^Reminder: Tomorrow /));
    await fireEvent.click(getByRole('button', { name: 'No reminder' }));
    await findByLabelText('Reminder: none');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][4]).toEqual({ priority: undefined, due_date: tomorrow(), reminder_at: null, tags: undefined });
  });

  it('back and Escape close an open panel before the sheet', async () => {
    const { getByLabelText, queryByLabelText, findByLabelText } = render(QuickAddSheet);
    const input = await type(getByLabelText, 'Stay');
    await fireEvent.click(getByLabelText('Priority: not set'));
    expect(queryByLabelText('Priority: not set')).toBeNull();
    history.back();
    await findByLabelText('Priority: not set');
    expect(sheetClosing()).toBe(false);
    await fireEvent.click(getByLabelText('Due: No date'));
    await fireEvent.keyDown(input, { key: 'Escape' });
    await findByLabelText('Due: No date');
    await new Promise(r => setTimeout(r, 30));
    expect(sheetClosing()).toBe(false);
    history.back();
    await waitFor(() => expect(sheetClosing()).toBe(true));
  });

  it('the scrim closes the panel, then the sheet', async () => {
    const { getByLabelText, queryByLabelText } = render(QuickAddSheet);
    await fireEvent.click(getByLabelText('Tags: none'));
    await fireEvent.click(document.querySelector('.psheet-scrim')!);
    // Through history, not the sheet's 400ms no-popstate fallback.
    await waitFor(() => expect(sheetClosing()).toBe(true), { timeout: 250 });
    expect(queryByLabelText('Tags')).toBeNull();
  });

  it('Enter adds with a panel still open, then closes the panel and the sheet', async () => {
    const { getByLabelText, getByRole, findByLabelText } = render(QuickAddSheet);
    const input = await type(getByLabelText, 'Quick one');
    await fireEvent.click(getByLabelText('Priority: not set'));
    await fireEvent.click(getByRole('button', { name: 'Medium' }));
    await fireEvent.click(await findByLabelText('Priority: Medium'));
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Quick one', {
      priority: 2, due_date: null, reminder_at: null, tags: undefined,
    }));
    await waitFor(() => expect(sheetClosing()).toBe(true));
  });

  it('a quoted title turns parsing off', async () => {
    const { getByLabelText, getByText } = render(QuickAddSheet);
    await type(getByLabelText, '"Tomorrow Land #1 !high"');
    expect(getByText('Quoted, parsing off')).toBeTruthy();
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Tomorrow Land #1 !high', {
      priority: undefined, due_date: null, reminder_at: null, tags: undefined,
    }));
  });

  it('warns about a duplicate title in the target project without blocking', async () => {
    findTasksByTitleInProject.mockResolvedValue([{ _id: 'task:old' }]);
    const { getByLabelText, findByText } = render(QuickAddSheet);
    await type(getByLabelText, 'Standup notes');
    await waitFor(() => expect(findTasksByTitleInProject).toHaveBeenCalled());
    expect(await findByText('Q4 Sprint already has a task with this name.')).toBeTruthy();
    expect(findTasksByTitleInProject).toHaveBeenLastCalledWith('project:q', 'Standup notes');
    expect((getByLabelText('Add') as HTMLButtonElement).disabled).toBe(false);
  });

  it('an empty title cannot be added; the ? shows the syntax help', async () => {
    const { getByLabelText, getByText } = render(QuickAddSheet);
    expect((getByLabelText('Add') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(getByLabelText('Quick add syntax help'));
    expect(getByText(/turn parsing off/)).toBeTruthy();
  });

  it('a failed create surfaces an error and keeps the text', async () => {
    createTask.mockRejectedValue(new Error('boom'));
    const created = vi.fn();
    const { getByLabelText } = render(QuickAddSheet, { events: { created } } as any);
    const input = await type(getByLabelText, 'Will fail');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to create task. Please try again.'));
    expect(created).not.toHaveBeenCalled();
    expect(input.value).toBe('Will fail');
  });
});
