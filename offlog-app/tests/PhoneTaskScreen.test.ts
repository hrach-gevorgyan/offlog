import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const db = vi.hoisted(() => ({
  getTaskById: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
  duplicateTask: vi.fn(),
  skipRecurrence: vi.fn(),
  getRelatedTasks: vi.fn(),
  getBlockingTasks: vi.fn(),
  searchTasksForLinking: vi.fn(),
  linkRelatedTask: vi.fn(),
  linkBlockedBy: vi.fn(),
  getCustomFieldDefs: vi.fn(),
}));
vi.mock('../src/lib/db', () => ({
  ...db,
  subscribe: vi.fn().mockReturnValue(() => {}),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
  ensureFreshTagColor: vi.fn().mockResolvedValue(undefined),
  getAllTags: vi.fn().mockResolvedValue([]),
  findTasksByTitleInProject: vi.fn().mockResolvedValue([]),
  findSimilarNotes: vi.fn().mockResolvedValue([]),
  isBlockerResolved: vi.fn().mockReturnValue(false),
  unlinkRelatedTask: vi.fn(),
  unlinkBlockedBy: vi.fn(),
  addAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  getAttachmentBlob: vi.fn(),
  getLogsForTask: vi.fn().mockResolvedValue([]),
  ATTACHMENT_MAX_PER_TASK: 10,
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(),
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    modalOpen: w(false),
    spaces: w([{ _id: 'space:s', name: 'Home', color: '#3b82f6', position: 0 }]),
    projects: w([]),
  };
});
vi.mock('../src/lib/notifications', async () => {
  const { writable: w } = await import('svelte/store');
  return { requestPermission: vi.fn(), permissionState: w('granted') };
});
const confirmAction = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/confirm', () => ({ confirmAction }));

import TaskScreen from '../src/lib/phone/TaskScreen.svelte';
import { projects, showError } from '../src/lib/store';
import { switchTab, push, stack, toast } from '../src/lib/phone/nav';
import { dateFromToday } from '../src/lib/carddetail/helpers';
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

// The stored doc: getTaskById reads it and updateTask writes into it, so a
// reload after a write sees the write, as the real database would.
let stored: TaskDoc | null = null;
async function open(t: TaskDoc | null = task()) {
  stored = t;
  db.getTaskById.mockImplementation(async () => stored && { ...stored });
  db.updateTask.mockImplementation(async (_id: string, c: Partial<TaskDoc>) => { stored = { ...stored!, ...c }; return stored; });
  const r = render(TaskScreen, { id: 'task:t' });
  if (t) await waitFor(() => r.getByLabelText('Title'));
  return r;
}
const sheetRow = (label: string) => {
  const dlg = document.querySelector('.psheet') as HTMLElement;
  const row = [...dlg.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(label));
  if (!row) throw new Error(`no sheet row "${label}"`);
  return row;
};

// Sheets finish closing only once their outro ends; with reduced motion
// transitions take no time, so the close lands at once.
window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

describe('phone TaskScreen', () => {
  beforeEach(async () => {
    // A closed sheet's history.back() lands as an async popstate; let it
    // settle so it cannot pop the next test's sheet.
    await new Promise(r => setTimeout(r, 20));
    switchTab('home');
    toast.set(null);
    for (const f of Object.values(db)) f.mockReset();
    db.getRelatedTasks.mockResolvedValue([]);
    db.getBlockingTasks.mockResolvedValue([]);
    db.searchTasksForLinking.mockResolvedValue([]);
    db.getCustomFieldDefs.mockResolvedValue([]);
    (projects as Writable<ProjectDoc[]>).set([project]);
    vi.mocked(showError).mockClear();
    confirmAction.mockReset();
  });
  afterEach(cleanup);

  it('shows the breadcrumb, title and field rows', async () => {
    const { getByText, getByLabelText } = await open(task({ tags: ['tiles'], priority: 3 }));
    expect((getByLabelText('Title') as HTMLTextAreaElement).value).toBe('Order tiles');
    expect(getByText(/Home ·/).textContent).toContain('House');
    expect(getByText('Doing')).toBeTruthy();
    expect(getByText('High')).toBeTruthy();
    expect(getByText('#tiles')).toBeTruthy();
  });

  it('says so when the task no longer exists', async () => {
    const { findByText } = await open(null);
    expect(await findByText('This task was deleted.')).toBeTruthy();
  });

  it('saves an edited title on blur, and refuses a blank one', async () => {
    const { getByLabelText } = await open();
    const ttl = getByLabelText('Title') as HTMLTextAreaElement;
    await fireEvent.focus(ttl);
    await fireEvent.input(ttl, { target: { value: 'Order floor tiles' } });
    await fireEvent.blur(ttl);
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { title: 'Order floor tiles' });

    db.updateTask.mockClear();
    await fireEvent.focus(ttl);
    await fireEvent.input(ttl, { target: { value: '   ' } });
    await fireEvent.blur(ttl);
    expect(db.updateTask).not.toHaveBeenCalled();
    expect(ttl.value).toBe('Order floor tiles');
  });

  it('finishing moves to the last status and Undo restores what it replaced', async () => {
    const { getByLabelText } = await open(task({ due_date: '2026-10-01' }));
    await fireEvent.click(getByLabelText('Finish'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { column_id: 'col:done' });
    await waitFor(() => expect(get(toast)?.text).toBe('Done: Order tiles'));
    await get(toast)!.undo!();
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { column_id: 'col:doing', due_date: '2026-10-01', reminder_at: null, checklist: undefined });
  });

  it('un-finishing a done task sends it back to the first status', async () => {
    const { getByLabelText } = await open(task({ column_id: 'col:done' }));
    await fireEvent.click(getByLabelText('Mark not done'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { column_id: 'col:todo' });
  });

  it('a status picked in its sheet is written', async () => {
    const { getByText } = await open();
    await fireEvent.click(getByText('Status'));
    await fireEvent.click(sheetRow('To do'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { column_id: 'col:todo' });
  });

  it('priority and due date sheets write their pick', async () => {
    const { getByText } = await open();
    await fireEvent.click(getByText('Priority'));
    await fireEvent.click(sheetRow('High'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { priority: 3 });

    await waitFor(() => expect(document.querySelector('.psheet')).toBeNull());
    await fireEvent.click(getByText('Due'));
    await fireEvent.click(sheetRow('Tomorrow'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { due_date: dateFromToday(1) });
  });

  it('clearing the due date of a repeating task also clears the repeat', async () => {
    const { getByText } = await open(task({ due_date: '2026-10-01', recurrence: 'weekly' }));
    await fireEvent.click(getByText('Due'));
    await fireEvent.click(sheetRow('No date'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { due_date: null, recurrence: null });
  });

  it('adds, toggles and removes steps', async () => {
    const steps = [{ text: 'Measure', done: false }, { text: 'Pick colour', done: true }];
    const { getByLabelText } = await open(task({ checklist: steps }));
    const add = getByLabelText('Add a step') as HTMLInputElement;
    await fireEvent.input(add, { target: { value: 'Call shop' } });
    await fireEvent.keyDown(add, { key: 'Enter' });
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { checklist: [...steps, { text: 'Call shop', done: false }] });

    await waitFor(() => getByLabelText('Remove step: Call shop'));
    await fireEvent.click(getByLabelText('Mark done: Measure'));
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { checklist: [{ text: 'Measure', done: true }, steps[1], { text: 'Call shop', done: false }] });

    await waitFor(() => getByLabelText('Mark not done: Measure'));
    await fireEvent.click(getByLabelText('Remove step: Pick colour'));
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { checklist: [{ text: 'Measure', done: true }, { text: 'Call shop', done: false }] });
    await waitFor(() => expect(get(toast)?.text).toBe('Step removed'));
  });

  it('pins from the top bar', async () => {
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('Pin'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { pinned: true });
  });

  it('deletes (soft) after confirming, then goes back', async () => {
    push({ k: 'task', id: 'task:t' });
    confirmAction.mockResolvedValue(true);
    db.deleteTask.mockResolvedValue(undefined);
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Delete'));
    await waitFor(() => expect(db.deleteTask).toHaveBeenCalledWith('task:t'));
    expect(confirmAction).toHaveBeenCalledWith('Delete this task?', { danger: true, confirmLabel: 'Delete' });
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home']));
  });

  it('a cancelled delete writes nothing', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Delete'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(db.deleteTask).not.toHaveBeenCalled();
  });

  it('opens a related task as a new screen', async () => {
    const other = task({ _id: 'task:o', title: 'Buy grout' });
    db.getRelatedTasks.mockResolvedValue([other]);
    const { getByText } = await open();
    await fireEvent.click(getByText('Related'));
    await fireEvent.click(sheetRow('Buy grout'));
    await waitFor(() => expect(get(stack).at(-1)).toMatchObject({ k: 'task', id: 'task:o' }));
  });

  it('links a blocker found by search', async () => {
    const other = task({ _id: 'task:b', title: 'Get quotes' });
    db.searchTasksForLinking.mockResolvedValue([other]);
    db.linkBlockedBy.mockResolvedValue(undefined);
    const { getByText } = await open();
    await fireEvent.click(getByText('Blocked by'));
    const find = document.querySelector('.psheet input') as HTMLInputElement;
    await fireEvent.input(find, { target: { value: 'quo' } });
    await waitFor(() => sheetRow('Get quotes'));
    expect(db.searchTasksForLinking).toHaveBeenCalledWith('quo', 'task:t', []);
    await fireEvent.click(sheetRow('Get quotes'));
    await waitFor(() => expect(db.linkBlockedBy).toHaveBeenCalledWith('task:t', 'task:b'));
  });

  it('a circular blocker gets its own message', async () => {
    db.searchTasksForLinking.mockResolvedValue([task({ _id: 'task:b', title: 'Get quotes' })]);
    db.linkBlockedBy.mockRejectedValue(new Error('circular dependency'));
    const { getByText } = await open();
    await fireEvent.click(getByText('Blocked by'));
    await fireEvent.input(document.querySelector('.psheet input')!, { target: { value: 'quo' } });
    await waitFor(() => sheetRow('Get quotes'));
    await fireEvent.click(sheetRow('Get quotes'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Can\'t be blocked by "Get quotes" — these two tasks already block each other.'));
  });

  it('a failed write surfaces an error', async () => {
    const { getByLabelText } = await open();
    db.updateTask.mockRejectedValue(new Error('boom'));
    await fireEvent.click(getByLabelText('Finish'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not update this task. Please try again.'));
    expect(get(toast)?.text ?? '').not.toBe('Done: Order tiles');
  });
});
