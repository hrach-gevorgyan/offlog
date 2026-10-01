import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import type { ProjectDoc } from '../src/lib/types';

const createTask = vi.fn();
const findTasksByTitleInProject = vi.fn();
const ensureFreshTagColor = vi.fn();
const deleteTask = vi.fn();
vi.mock('../src/lib/db', () => ({
  createTask: (...a: unknown[]) => createTask(...a),
  findTasksByTitleInProject: (...a: unknown[]) => findTasksByTitleInProject(...a),
  ensureFreshTagColor: (...a: unknown[]) => ensureFreshTagColor(...a),
  deleteTask: (...a: unknown[]) => deleteTask(...a),
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
import { get, type Writable } from 'svelte/store';
import { toast } from '../src/lib/phone/nav';

const proj = (id: string, name: string, space: string, cols: string[]) => ({
  _id: id, type: 'project', space_id: space, name, position: 0, default_view: 'kanban',
  columns: cols.map(c => ({ id: c, name: c })), updated_at: '', source: '',
}) as ProjectDoc;
const Q = proj('project:q', 'Q4 Sprint', 'space:w', ['col:q1', 'col:q2', 'col:q3']);
const F = proj('project:f', 'Fitness Tracker', 'space:h', ['col:f1', 'col:f2']);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localDateStr(d); };

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
    toast.set(null);
    vi.mocked(showError).mockClear();
    vi.mocked(reloadTasks).mockReset().mockResolvedValue(undefined);
  });

  it('parses date, priority, tags and @project, and creates in that project\'s first status', async () => {
    const created = vi.fn();
    const { getByLabelText, getByText } = render(QuickAddSheet, { events: { created } } as any);
    const input = await type(getByLabelText, 'Log workout tomorrow !high #gym #legs @fitness');
    expect(getByText('Adds to Fitness Tracker · due tomorrow · high')).toBeTruthy();
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

  it('confirms with a toast whose Undo soft-deletes the new task', async () => {
    const { getByLabelText } = render(QuickAddSheet);
    await type(getByLabelText, 'Undo me');
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(get(toast)?.text).toBe('Added to Q4 Sprint'));
    await get(toast)!.undo!();
    expect(deleteTask).toHaveBeenCalledWith('task:new');
    deleteTask.mockRejectedValue(new Error('x'));
    await get(toast)!.undo!();
    expect(showError).toHaveBeenCalledWith('Could not undo. Please try again.');
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

  it('a project picked by hand wins over @mention; chips set due and priority', async () => {
    const { getByLabelText, getByText } = render(QuickAddSheet);
    await type(getByLabelText, 'Squats @fitness');
    await fireEvent.click(getByLabelText('Project: Fitness Tracker'));
    await fireEvent.click(getByText('Q4 Sprint'));
    await fireEvent.click(getByLabelText('Due: No date'));
    await fireEvent.click(getByLabelText('Priority: not set'));
    await fireEvent.click(getByLabelText('Add'));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('project:q', 'space:w', 'col:q1', 'Squats', {
      priority: 3, due_date: localDateStr(new Date()), reminder_at: null, tags: undefined,
    }));
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
