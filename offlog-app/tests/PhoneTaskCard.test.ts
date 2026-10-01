import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const updateTask = vi.fn();
vi.mock('../src/lib/db', () => ({ updateTask: (...a: unknown[]) => updateTask(...a) }));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return { showError: vi.fn(), projects: w([]), spaces: w([]) };
});

import TaskCard from '../src/lib/phone/TaskCard.svelte';
import { toast } from '../src/lib/phone/nav';
import { get } from 'svelte/store';
import { projects, showError } from '../src/lib/store';
import type { Writable } from 'svelte/store';

const project = {
  _id: 'project:p', type: 'project', space_id: 'space:s', name: 'House', position: 0, default_view: 'kanban',
  columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:doing', name: 'Doing' }, { id: 'col:done', name: 'Done' }],
  updated_at: '', source: '',
} as ProjectDoc;
const task = (over: Partial<TaskDoc> = {}) => ({
  _id: 'task:t', type: 'task', project_id: 'project:p', space_id: 'space:s', column_id: 'col:doing', title: 'Order tiles',
  body: '', priority: 2, due_date: null, reminder_at: null, tags: [], position: 0, deleted: false,
  created_at: '', updated_at: '', source: '', ...over,
}) as TaskDoc;

describe('phone TaskCard', () => {
  beforeEach(() => {
    updateTask.mockReset().mockResolvedValue(undefined);
    (projects as Writable<ProjectDoc[]>).set([project]);
    vi.mocked(showError).mockClear();
  });

  it('finishing moves the task to the last status and reports the change', async () => {
    const changed = vi.fn();
    const { getByLabelText } = render(TaskCard, { props: { task: task() }, events: { changed } } as any);
    await fireEvent.click(getByLabelText('Finish: Order tiles'));
    expect(updateTask).toHaveBeenCalledWith('task:t', { column_id: 'col:done' });
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it('finishing offers Undo, which moves the task back to where it was', async () => {
    const { getByLabelText } = render(TaskCard, { task: task() });
    await fireEvent.click(getByLabelText('Finish: Order tiles'));
    await waitFor(() => expect(get(toast)?.text).toBe('Done: Order tiles'));
    await get(toast)!.undo!();
    // The whole snapshot comes back: a repeating task's date and steps too.
    expect(updateTask).toHaveBeenLastCalledWith('task:t', expect.objectContaining({ column_id: 'col:doing', due_date: null }));
  });

  it('un-finishing a done task sends it back to the first status', async () => {
    const { getByLabelText } = render(TaskCard, { task: task({ column_id: 'col:done' }) });
    await fireEvent.click(getByLabelText('Mark not done: Order tiles'));
    expect(updateTask).toHaveBeenCalledWith('task:t', { column_id: 'col:todo' });
  });

  it('a failed write surfaces an error', async () => {
    updateTask.mockRejectedValue(new Error('boom'));
    const { getByLabelText } = render(TaskCard, { task: task() });
    await fireEvent.click(getByLabelText('Finish: Order tiles'));
    await waitFor(() => expect(showError).toHaveBeenCalled());
  });

  it('tapping the body opens the task', async () => {
    const open = vi.fn();
    const { getByText } = render(TaskCard, { props: { task: task() }, events: { open } } as any);
    await fireEvent.click(getByText('Order tiles'));
    expect(open).toHaveBeenCalled();
  });

  it('shows a late pill for an overdue open task, and none once finished', () => {
    const { getByText, unmount } = render(TaskCard, { task: task({ due_date: '2000-01-01' }) });
    expect(getByText(/days late/)).toBeTruthy();
    unmount();
    const r = render(TaskCard, { task: task({ due_date: '2000-01-01', column_id: 'col:done' }) });
    expect(r.queryByText(/late/)).toBeNull();
  });
});
