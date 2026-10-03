import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/svelte';
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
  getTasksForProject: vi.fn(),
  getAllTags: vi.fn(),
  ensureFreshTagColor: vi.fn(),
}));
vi.mock('../src/lib/db', () => ({
  ...db,
  subscribe: vi.fn().mockReturnValue(() => {}),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
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
  computeDropPosition: (col: { position: number }[], i: number | null) => {
    if (i === null) { const l = col.at(-1); return l ? l.position + 1024 : 1024; }
    const before = i > 0 ? col[i - 1]?.position ?? null : null, after = col[i]?.position ?? null;
    return before === null ? (after === null ? 1024 : after / 2) : after === null ? before + 1024 : (before + after) / 2;
  },
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

import TaskScreen from '../src/lib/phone/TaskScreen.svelte';
import { projects, showError } from '../src/lib/store';
import { unlinkRelatedTask, unlinkBlockedBy, deleteAttachment } from '../src/lib/db';
import { switchTab, push, stack, toast } from '../src/lib/phone/nav';
import { dateFromToday } from '../src/lib/shared/taskHelpers';
import { shortDate } from '../src/lib/phone/format';
import type { Writable } from 'svelte/store';
import { EditorView } from '@codemirror/view';

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
// Rows show values, not labels; each names itself "Due: …", "Tags: …".
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}:`) });
// Unset details wait behind one "Add …" row that opens a list.
async function addDetail(label: string) {
  await fireEvent.click(document.querySelector('[data-kind="add"]') as HTMLElement);
  await fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(document.querySelector('.psheet h2')?.textContent).not.toBe('Add'));
}
const ADD: Record<string, string> = { Reminder: 'reminder', Repeat: 'repeat', 'Blocked by': 'blocked by', Related: 'related', Attachments: 'attachment', Fields: 'field' };
// A set detail opens from its row, an unset one through Add.
async function detail(name: string) {
  const r = screen.queryByRole('button', { name: new RegExp(`^${name}:`) });
  if (r) await fireEvent.click(r);
  else await addDetail(`Add ${ADD[name]}`);
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
    // Times are asserted as "13:00". Unset, the format follows the machine's
    // locale, so an en-US CI runner would render "1:00 PM".
    localStorage.setItem('offlog_time_format_24h', 'true');
    switchTab('home');
    toast.set(null);
    for (const f of Object.values(db)) f.mockReset();
    db.getRelatedTasks.mockResolvedValue([]);
    db.getBlockingTasks.mockResolvedValue([]);
    db.searchTasksForLinking.mockResolvedValue([]);
    db.getCustomFieldDefs.mockResolvedValue([]);
    db.getTasksForProject.mockResolvedValue([]);
    db.getAllTags.mockResolvedValue([]);
    db.ensureFreshTagColor.mockResolvedValue(undefined);
    (projects as Writable<ProjectDoc[]>).set([project]);
    vi.mocked(showError).mockClear();
  });
  afterEach(cleanup);

  it('shows the breadcrumb, title and field rows', async () => {
    const { getByText, getByLabelText } = await open(task({ tags: ['tiles'], priority: 3 }));
    expect((getByLabelText('Title') as HTMLTextAreaElement).value).toBe('Order tiles');
    expect(getByText(/Home ·/).textContent).toContain('House');
    expect(getByText('Doing')).toBeTruthy();
    expect(getByText('High priority')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Doing', pressed: true })).toBeTruthy();
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

  it('a failed Undo of finishing surfaces an error', async () => {
    const { getByLabelText } = await open(task({ due_date: '2026-10-01' }));
    await fireEvent.click(getByLabelText('Finish'));
    await waitFor(() => expect(get(toast)?.text).toBe('Done: Order tiles'));
    db.updateTask.mockRejectedValue(new Error('boom'));
    await get(toast)!.undo!();
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { column_id: 'col:doing', due_date: '2026-10-01', reminder_at: null, checklist: undefined });
    expect(showError).toHaveBeenCalledWith('Could not undo. Please try again.');
  });

  it('un-finishing a done task sends it back to the first status', async () => {
    const { getByLabelText } = await open(task({ column_id: 'col:done' }));
    await fireEvent.click(getByLabelText('Mark not done'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { column_id: 'col:todo' });
  });

  it('a status picked on the bar is written', async () => {
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'To do' }));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { column_id: 'col:todo' });
  });

  it('priority and due date sheets write their pick', async () => {
    const { getByText } = await open();
    await detail('Priority');
    await fireEvent.click(sheetRow('High'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { priority: 3 });

    await waitFor(() => expect(document.querySelector('.psheet')).toBeNull());
    await detail('Due');
    await fireEvent.click(sheetRow('Tomorrow'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { due_date: dateFromToday(1) });
  });

  it('the due row names the weekday once: "Wed 7 Oct", but "Tomorrow · Thu 4 Oct"', async () => {
    const soon = dateFromToday(4);
    await open(task({ due_date: soon }));
    expect(row('Due').getAttribute('aria-label')).toBe(`Due: ${shortDate(soon)}`);
    cleanup();
    const tmr = dateFromToday(1);
    await open(task({ due_date: tmr }));
    expect(row('Due').getAttribute('aria-label')).toBe(`Due: Tomorrow · ${shortDate(tmr)}`);
  });

  it('clearing the due date of a repeating task also clears the repeat', async () => {
    const { getByText } = await open(task({ due_date: '2026-10-01', recurrence: 'weekly' }));
    await detail('Due');
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

  it('deletes (soft) without asking, then goes back', async () => {
    push({ k: 'task', id: 'task:t' });
    db.deleteTask.mockResolvedValue(undefined);
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Delete'));
    await waitFor(() => expect(db.deleteTask).toHaveBeenCalledWith('task:t'));
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home']));
  });

  it('a failed delete says so and stays put', async () => {
    push({ k: 'task', id: 'task:t' });
    db.deleteTask.mockRejectedValue(new Error('boom'));
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Delete'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not delete this task. Please try again.'));
    expect(get(stack).at(-1)).toMatchObject({ k: 'task', id: 'task:t' });
  });

  it('archives, goes back, and Undo unarchives', async () => {
    push({ k: 'task', id: 'task:t' });
    db.archiveTask.mockResolvedValue(undefined);
    db.unarchiveTask.mockResolvedValue(undefined);
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Archive'));
    await waitFor(() => expect(db.archiveTask).toHaveBeenCalledWith('task:t'));
    await waitFor(() => expect(get(toast)?.text).toBe('Archived'));
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home']));
    await get(toast)!.undo!();
    expect(db.unarchiveTask).toHaveBeenCalledWith('task:t');
  });

  it('a failed archive Undo surfaces an error', async () => {
    push({ k: 'task', id: 'task:t' });
    db.archiveTask.mockResolvedValue(undefined);
    db.unarchiveTask.mockRejectedValue(new Error('boom'));
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Archive'));
    await waitFor(() => expect(get(toast)?.text).toBe('Archived'));
    await get(toast)!.undo!();
    expect(db.unarchiveTask).toHaveBeenCalledWith('task:t');
    expect(showError).toHaveBeenCalledWith('Could not undo. Please try again.');
  });

  it('a failed archive surfaces an error', async () => {
    db.archiveTask.mockRejectedValue(new Error('boom'));
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Archive'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not archive this task. Please try again.'));
  });

  it('duplicates and opens the copy', async () => {
    db.duplicateTask.mockResolvedValue(task({ _id: 'task:c' }));
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Duplicate'));
    await waitFor(() => expect(db.duplicateTask).toHaveBeenCalledWith('task:t'));
    await waitFor(() => expect(get(stack).at(-1)).toMatchObject({ k: 'task', id: 'task:c' }));
  });

  it('a failed duplicate surfaces an error', async () => {
    db.duplicateTask.mockRejectedValue(new Error('boom'));
    const { getByLabelText } = await open();
    await fireEvent.click(getByLabelText('More'));
    await fireEvent.click(sheetRow('Duplicate'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not duplicate this task. Please try again.'));
  });

  it('moves up and down within its status, among its pinned group', async () => {
    const sib = (id: string, position: number, over: Partial<TaskDoc> = {}) => task({ _id: id, position, ...over });
    db.getTasksForProject.mockResolvedValue([
      sib('task:pin', 0, { pinned: true }), sib('task:a', 100), sib('task:t', 200), sib('task:b', 300), sib('task:x', 50, { column_id: 'col:todo' }),
    ]);
    const { getByLabelText } = await open(task({ position: 200 }));
    await fireEvent.click(getByLabelText('More'));
    await waitFor(() => sheetRow('Move up'));
    await fireEvent.click(sheetRow('Move up'));
    // Between the pinned card and task:a would cross groups; it lands before task:a only.
    await waitFor(() => expect(db.updateTask).toHaveBeenCalledWith('task:t', { position: 50 }));

    await waitFor(() => expect(document.querySelector('.psheet')).toBeNull());
    await fireEvent.click(getByLabelText('More'));
    await waitFor(() => sheetRow('Move down'));
    expect(() => sheetRow('Move up')).toThrow();
    await fireEvent.click(sheetRow('Move down'));
    await waitFor(() => expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { position: 200 }));
  });

  it('skips a repeating task to its next date, with Undo', async () => {
    db.skipRecurrence.mockResolvedValue(task({ due_date: '2026-10-08' }));
    const { getByText } = await open(task({ due_date: '2026-10-01', recurrence: 'weekly' }));
    await detail('Repeat');
    await fireEvent.click(sheetRow('Skip to the next one'));
    await waitFor(() => expect(db.skipRecurrence).toHaveBeenCalledWith('task:t'));
    await waitFor(() => expect(get(toast)?.text).toMatch(/^Next: /));
    await get(toast)!.undo!();
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { due_date: '2026-10-01', reminder_at: null, checklist: undefined });
  });

  it('a failed skip surfaces an error', async () => {
    db.skipRecurrence.mockRejectedValue(new Error('boom'));
    const { getByText } = await open(task({ due_date: '2026-10-01', recurrence: 'weekly' }));
    await detail('Repeat');
    await fireEvent.click(sheetRow('Skip to the next one'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not skip to the next one. Please try again.'));
  });

  it('the Repeat sheet writes the picked rule', async () => {
    const { getByText } = await open(task({ due_date: '2026-10-01' }));
    await detail('Repeat');
    await fireEvent.click(sheetRow('Weekly'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { recurrence: 'weekly', recurrenceInterval: 1, recurrenceWeekdaysOnly: undefined });
    await waitFor(() => expect(row('Repeat')).toBeTruthy());
  });

  it('adds a tag typed into the Tags sheet', async () => {
    const { getByText } = await open();
    await detail('Tags');
    const input = document.querySelector('.psheet input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Floor Plan' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(db.updateTask).toHaveBeenCalledWith('task:t', { tags: ['floor-plan'] }));
    expect(db.ensureFreshTagColor).toHaveBeenCalledWith('floor-plan', []);
    // The colour is picked before the save: once the tag is persisted on a
    // task, ensureFreshTagColor treats it as existing and does nothing.
    expect(db.ensureFreshTagColor.mock.invocationCallOrder[0]).toBeLessThan(db.updateTask.mock.invocationCallOrder[0]);
  });

  it('a failed tag write surfaces an error and rolls the tag back', async () => {
    const { getByText, queryByText } = await open();
    db.updateTask.mockRejectedValue(new Error('boom'));
    // No reload arrives: the local rollback alone must undo the tag.
    db.getTaskById.mockReturnValue(new Promise(() => {}));
    await detail('Tags');
    const input = document.querySelector('.psheet input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'paint' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the tags. Please try again.'));
    await waitFor(() => expect(queryByText('#paint')).toBeNull());
  });

  it('shows three tags on the row, then a count', async () => {
    const { getByText, queryByText } = await open(task({ tags: ['a', 'b', 'c', 'd', 'e'] }));
    expect(getByText('#a')).toBeTruthy();
    expect(getByText('#c')).toBeTruthy();
    expect(queryByText('#d')).toBeNull();
    expect(getByText('+2')).toBeTruthy();
  });

  it('two fast step toggles are both saved', async () => {
    const steps = [{ text: 'Measure', done: false }, { text: 'Cut', done: false }];
    const gates: (() => void)[] = [];
    const { getByLabelText } = await open(task({ checklist: steps }));
    db.updateTask.mockImplementation((_id: string, c: Partial<TaskDoc>) => new Promise(res => {
      gates.push(() => { stored = { ...stored!, ...c }; res(stored); });
    }));
    await fireEvent.click(getByLabelText('Mark done: Measure'));
    await fireEvent.click(getByLabelText('Mark done: Cut'));
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { checklist: [{ text: 'Measure', done: true }, { text: 'Cut', done: true }] });
    gates.forEach(g => g());
    await waitFor(() => expect(stored!.checklist).toEqual([{ text: 'Measure', done: true }, { text: 'Cut', done: true }]));
    expect(getByLabelText('Mark not done: Measure')).toBeTruthy();
    expect(getByLabelText('Mark not done: Cut')).toBeTruthy();
  });

  it('a note typed and left before the idle save is saved on leaving', async () => {
    const r = await open();
    const ttl = r.getByLabelText('Title') as HTMLTextAreaElement;
    await fireEvent.focus(ttl);
    await fireEvent.input(ttl, { target: { value: 'Order grey tiles' } });
    const cm = await waitFor(() => { const el = document.querySelector('.cm-editor'); if (!el) throw new Error('no editor'); return el as HTMLElement; });
    const view = EditorView.findFromDOM(cm)!;
    view.dispatch({ changes: { from: 0, insert: 'Grey, matte' } });
    await new Promise(res => setTimeout(res, 50));
    expect(db.updateTask).not.toHaveBeenCalled();
    r.unmount();
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { body: 'Grey, matte' });
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { title: 'Order grey tiles' });
  });

  it('a project with one status has no finish checkbox', async () => {
    (projects as Writable<ProjectDoc[]>).set([{ ...project, columns: [{ id: 'col:doing', name: 'Doing' }] }]);
    const { queryByLabelText, getByLabelText } = await open();
    expect(getByLabelText('Title')).toBeTruthy();
    expect(queryByLabelText('Finish')).toBeNull();
    expect(queryByLabelText('Mark not done')).toBeNull();
  });

  it('opens a related task as a new screen', async () => {
    const other = task({ _id: 'task:o', title: 'Buy grout' });
    db.getRelatedTasks.mockResolvedValue([other]);
    const { getByText } = await open();
    await detail('Related');
    await fireEvent.click(sheetRow('Buy grout'));
    await waitFor(() => expect(get(stack).at(-1)).toMatchObject({ k: 'task', id: 'task:o' }));
  });

  it('links a blocker found by search', async () => {
    const other = task({ _id: 'task:b', title: 'Get quotes' });
    db.searchTasksForLinking.mockResolvedValue([other]);
    db.linkBlockedBy.mockResolvedValue(undefined);
    const { getByText } = await open();
    await detail('Blocked by');
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
    await detail('Blocked by');
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

  it('unset details wait behind one Add row; empty Due and Tags invite adding', async () => {
    const { container } = await open();
    expect(document.querySelector('[data-kind="add"]')!.textContent!.trim()).toBe('Add reminder, repeat, links…');
    expect(row('Due').textContent).toContain('Add due date');
    expect(row('Tags').textContent).toContain('Add tags');
    expect(container.querySelectorAll('.vals .p-row').length).toBe(4);
    await fireEvent.click(document.querySelector('[data-kind="add"]') as HTMLElement);
    const listed = [...document.querySelectorAll('.psheet .p-row')].map(r => r.getAttribute('aria-label'));
    // No custom fields defined: no Field entry.
    expect(listed).toEqual(['Add reminder', 'Add repeat', 'Add blocked by', 'Add related', 'Add attachment']);
  });

  it('the Add row names only what is still unset', async () => {
    await open(task({ due_date: '2026-10-01', recurrence: 'weekly', reminder_at: new Date(2030, 0, 2, 9, 0).toISOString() }));
    expect(document.querySelector('[data-kind="add"]')!.textContent!.trim()).toBe('Add links, attachment');
  });

  it('a cleared reminder leaves its row and goes back under Add', async () => {
    await open(task({ reminder_at: new Date(2030, 0, 2, 9, 0).toISOString() }));
    expect(document.querySelector('[data-kind="add"]')!.textContent).not.toContain('reminder');
    await detail('Reminder');
    await fireEvent.click(sheetRow('No reminder'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { reminder_at: null, remindOnDue: false });
    await waitFor(() => expect(document.querySelector('[data-kind="add"]')!.textContent).toContain('reminder'));
    expect(screen.queryByRole('button', { name: /^Reminder:/ })).toBeNull();
  });

  it('an Add entry opens the same sheet as its row', async () => {
    await open(task({ due_date: '2026-10-01' }));
    await addDetail('Add repeat');
    await fireEvent.click(sheetRow('Weekly'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { recurrence: 'weekly', recurrenceInterval: 1, recurrenceWeekdaysOnly: undefined });
  });

  it('the note sits between the title and the field rows', async () => {
    const { getByLabelText, getByText } = await open();
    const note = getByLabelText('Note');
    expect(getByLabelText('Title').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(screen.getByRole('group', { name: 'Status' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the bar fills in and shows the title once the title scrolls under it', async () => {
    let fire: (hidden: boolean) => void = () => {};
    // The editor observes too; only the title field drives the bar.
    const IO = vi.fn(function (cb: (e: { isIntersecting: boolean }[]) => void) {
      return {
        observe(n: Element) { if (n.classList.contains('ttl')) fire = hidden => cb([{ isIntersecting: !hidden }]); },
        unobserve() {}, disconnect() {}, takeRecords: () => [],
      };
    });
    vi.stubGlobal('IntersectionObserver', IO);
    try {
      const { container, getByRole } = await open();
      const bar = container.querySelector('.tbar')!;
      expect(getByRole('heading', { level: 1 }).textContent).toBe('Order tiles');
      expect(bar.classList.contains('stuck')).toBe(false);
      fire(true);
      await waitFor(() => expect(bar.classList.contains('stuck')).toBe(true));
      fire(false);
      await waitFor(() => expect(bar.classList.contains('stuck')).toBe(false));
    } finally { vi.unstubAllGlobals(); }
  });

  it('the Due sheet opens its month on a date none of its shortcuts covers, with that day picked', async () => {
    await open(task({ due_date: '2030-03-04' }));
    await detail('Due');
    expect(screen.getByRole('button', { name: 'Mon 4 Mar 2030' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.psheet .p-chip[aria-pressed="true"]')).toHaveLength(0);
    await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Tue 2 Apr 2030' }));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { due_date: '2030-04-02' });
  });

  it('a reminder is picked on the month and the wheels, and saved only by the button', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 9, 35));
    try {
      await open();
      await addDetail('Add reminder');
      await fireEvent.click(screen.getByRole('button', { name: 'Mon 5 Oct' }));
      await fireEvent.click(sheetRow('Time'));
      const hours = await screen.findByRole('spinbutton', { name: 'Hour' });
      await fireEvent.keyDown(hours, { key: 'ArrowDown' });
      expect(db.updateTask).not.toHaveBeenCalled();
      await fireEvent.click(screen.getByRole('button', { name: /^Remind me Mon 5 Oct, 11:00/ }));
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { reminder_at: new Date(2026, 9, 5, 11, 0).toISOString() });
    } finally { vi.useRealTimers(); }
  });

  it('a reminder time already past cannot be saved', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 9, 35));
    try {
      await open();
      await addDetail('Add reminder');
      await fireEvent.click(screen.getByRole('button', { name: 'Wed 30 Sep' }));
      const go = screen.getByRole('button', { name: 'That time has passed' }) as HTMLButtonElement;
      expect(go.disabled).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('Weekdays is a top-level repeat: daily, weekdays only', async () => {
    const { getByText } = await open(task({ due_date: '2026-10-01', recurrence: 'daily', recurrenceInterval: 1 }));
    await detail('Repeat');
    await fireEvent.click(sheetRow('Weekdays'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { recurrence: 'daily', recurrenceInterval: 1, recurrenceWeekdaysOnly: true });
    await waitFor(() => expect(sheetRow('Weekdays').getAttribute('aria-pressed')).toBe('true'));
    expect(getByText('Weekdays', { selector: '.vals .p-k span' })).toBeTruthy();
    await fireEvent.click(sheetRow('Daily'));
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { recurrence: 'daily', recurrenceInterval: 1, recurrenceWeekdaysOnly: false });
  });

  it('offers "Later today" three hours out, rounded up to the hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 9, 35));
    try {
      const { getByLabelText } = await open();
      await addDetail('Add reminder');
      await fireEvent.click(sheetRow('Later today'));
      await fireEvent.click(screen.getByRole('button', { name: /^Remind me today, 13:00/ }));
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { reminder_at: new Date(2026, 9, 1, 13, 0).toISOString() });
    } finally { vi.useRealTimers(); }
  });

  it('the Tags field says it finds as well as adds', async () => {
    const { getByText } = await open();
    await detail('Tags');
    expect((document.querySelector('.psheet input') as HTMLInputElement).placeholder).toBe('Find or add a tag');
  });

  describe('a failed write names what was not saved', () => {
    it('title', async () => {
      const { getByLabelText } = await open();
      db.updateTask.mockRejectedValue(new Error('boom'));
      const ttl = getByLabelText('Title') as HTMLTextAreaElement;
      await fireEvent.focus(ttl);
      await fireEvent.input(ttl, { target: { value: 'Order floor tiles' } });
      await fireEvent.blur(ttl);
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the title. Please try again.'));
    });

    it('due date, rolled back on the row', async () => {
      const { getByText } = await open();
      db.updateTask.mockRejectedValue(new Error('boom'));
      await detail('Due');
      await fireEvent.click(sheetRow('Tomorrow'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the due date. Please try again.'));
      await waitFor(() => expect(row('Due').textContent).toContain('Add due date'));
    });

    it('priority', async () => {
      const { getByText } = await open();
      db.updateTask.mockRejectedValue(new Error('boom'));
      await detail('Priority');
      await fireEvent.click(sheetRow('High'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the priority. Please try again.'));
    });

    it('steps', async () => {
      const { getByLabelText, queryByLabelText } = await open();
      db.updateTask.mockRejectedValue(new Error('boom'));
      const add = getByLabelText('Add a step') as HTMLInputElement;
      await fireEvent.input(add, { target: { value: 'Call shop' } });
      await fireEvent.keyDown(add, { key: 'Enter' });
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the steps. Please try again.'));
      await waitFor(() => expect(queryByLabelText('Remove step: Call shop')).toBeNull());
    });

    it('note', async () => {
      const r = await open();
      db.updateTask.mockRejectedValue(new Error('boom'));
      const cm = await waitFor(() => { const el = document.querySelector('.cm-editor'); if (!el) throw new Error('no editor'); return el as HTMLElement; });
      EditorView.findFromDOM(cm)!.dispatch({ changes: { from: 0, insert: 'Grey, matte' } });
      r.unmount();
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { body: 'Grey, matte' });
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the note. Please try again.'));
    });

    it('reminder', async () => {
      const { getByText } = await open(task({ reminder_at: new Date(2030, 0, 2, 9, 0).toISOString() }));
      db.updateTask.mockRejectedValue(new Error('boom'));
      await detail('Reminder');
      await fireEvent.click(sheetRow('No reminder'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the reminder. Please try again.'));
    });

    it('repeat', async () => {
      const { getByLabelText } = await open(task({ due_date: '2026-10-01' }));
      db.updateTask.mockRejectedValue(new Error('boom'));
      await addDetail('Add repeat');
      await fireEvent.click(sheetRow('Weekly'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the repeat. Please try again.'));
    });

    it('any other change (pin), with no Undo offered', async () => {
      const { getByLabelText } = await open();
      db.updateTask.mockRejectedValue(new Error('boom'));
      await fireEvent.click(getByLabelText('Pin'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save this change. Please try again.'));
      expect(get(toast)).toBeNull();
    });
  });

  describe('links and attachments surface failed writes', () => {
    const other = task({ _id: 'task:o', title: 'Get quotes' });

    it('a failed related link', async () => {
      db.searchTasksForLinking.mockResolvedValue([other]);
      db.linkRelatedTask.mockRejectedValue(new Error('boom'));
      const { getByLabelText } = await open();
      await addDetail('Add related');
      await fireEvent.input(document.querySelector('.psheet input')!, { target: { value: 'quo' } });
      await waitFor(() => sheetRow('Get quotes'));
      await fireEvent.click(sheetRow('Get quotes'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not link a related task. Please try again.'));
    });

    it('a failed blocker link that is not circular', async () => {
      db.searchTasksForLinking.mockResolvedValue([other]);
      db.linkBlockedBy.mockRejectedValue(new Error('boom'));
      const { getByLabelText } = await open();
      await addDetail('Add blocked by');
      await fireEvent.input(document.querySelector('.psheet input')!, { target: { value: 'quo' } });
      await waitFor(() => sheetRow('Get quotes'));
      await fireEvent.click(sheetRow('Get quotes'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not link "Get quotes" as a blocker. Please try again.'));
    });

    it('a failed related unlink', async () => {
      db.getRelatedTasks.mockResolvedValue([other]);
      vi.mocked(unlinkRelatedTask).mockRejectedValueOnce(new Error('boom'));
      const { findByText, getByLabelText } = await open();
      await fireEvent.click(await screen.findByRole('button', { name: /^Related:/ }));
      await fireEvent.click(getByLabelText('Unlink Get quotes'));
      expect(unlinkRelatedTask).toHaveBeenCalledWith('task:t', 'task:o');
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not remove a related-task link. Please try again.'));
    });

    it('a failed dependency removal', async () => {
      db.getBlockingTasks.mockResolvedValue([other]);
      vi.mocked(unlinkBlockedBy).mockRejectedValueOnce(new Error('boom'));
      const { findByText, getByLabelText } = await open();
      await fireEvent.click(await screen.findByRole('button', { name: /^Blocked by:/ }));
      await fireEvent.click(getByLabelText('Remove dependency on Get quotes'));
      expect(unlinkBlockedBy).toHaveBeenCalledWith('task:t', 'task:o');
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not remove a dependency. Please try again.'));
    });

    it('a failed attachment removal, after the confirming second tap', async () => {
      vi.mocked(deleteAttachment).mockRejectedValueOnce(new Error('boom'));
      const { getByText, getByLabelText } = await open(task({ attachments: [{ key: 'k1', filename: 'quote.pdf', size: 100 }] } as Partial<TaskDoc>));
      await detail('Attachments');
      await fireEvent.click(getByLabelText('Remove quote.pdf'));
      expect(deleteAttachment).not.toHaveBeenCalled();
      await fireEvent.click(getByLabelText('Remove quote.pdf'));
      expect(deleteAttachment).toHaveBeenCalledWith('task:t', 'k1');
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not remove the attachment. Please try again.'));
      expect(getByLabelText('Open quote.pdf')).toBeTruthy();
    });
  });

  describe('Fields', () => {
    const defs = [
      { _id: 'f1', id: 'f1', name: 'Vendor', type: 'select', options: ['Acme', 'Bolt'] },
      { _id: 'f2', id: 'f2', name: 'Budget', type: 'number' },
      { _id: 'f3', id: 'f3', name: 'Deadline', type: 'date' },
    ];

    it('a date field opens a month under its row and saves the picked day', async () => {
      db.getCustomFieldDefs.mockResolvedValue(defs);
      await open(task({ custom_values: { f3: '2030-03-04' } } as Partial<TaskDoc>));
      await fireEvent.click(screen.getByRole('button', { name: /^Fields:/ }));
      const row = sheetRow('Deadline');
      expect(row.textContent).toContain('Mon 4 Mar 2030');
      await fireEvent.click(row);
      await fireEvent.click(screen.getByRole('button', { name: 'Fri 8 Mar 2030' }));
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { custom_values: { f3: '2030-03-08' } });
    });

    it('a select field picks from a list instead of a native dropdown', async () => {
      db.getCustomFieldDefs.mockResolvedValue(defs);
      const { findByLabelText } = await open();
      await addDetail('Add field');
      expect(document.querySelector('.psheet select')).toBeNull();
      const vendor = sheetRow('Vendor');
      expect(vendor.textContent).toContain('—');
      await fireEvent.click(vendor);
      expect(vendor.getAttribute('aria-expanded')).toBe('true');
      await fireEvent.click(sheetRow('Bolt'));
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { custom_values: { f1: 'Bolt' } });
      await waitFor(() => expect(sheetRow('Vendor').textContent).toContain('Bolt'));
      await fireEvent.click(sheetRow('Vendor'));
      await fireEvent.click(sheetRow('Clear'));
      expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { custom_values: { f1: null } });
    });

    it('a number field edits inline with the same empty dash', async () => {
      db.getCustomFieldDefs.mockResolvedValue(defs);
      const { findByLabelText } = await open();
      await addDetail('Add field');
      const input = document.querySelector('.psheet input.val') as HTMLInputElement;
      expect(input.placeholder).toBe('—');
      await fireEvent.change(input, { target: { value: '120' } });
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { custom_values: { f2: 120 } });
    });

    it('a failed field write surfaces an error', async () => {
      db.getCustomFieldDefs.mockResolvedValue(defs);
      const { findByLabelText } = await open();
      db.updateTask.mockRejectedValue(new Error('boom'));
      await addDetail('Add field');
      await fireEvent.change(document.querySelector('.psheet input.val') as HTMLInputElement, { target: { value: '120' } });
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the field. Please try again.'));
    });
  });
});

describe('phone task dates', () => {
  it('laterToday rounds three hours ahead up to the hour, and stops after 21:00', async () => {
    const { laterToday } = await import('../src/lib/phone/task/when');
    const { shortDate } = await import('../src/lib/phone/format');
    expect(laterToday(new Date(2026, 9, 1, 9, 35))).toBe('2026-10-01T13:00');
    expect(laterToday(new Date(2026, 9, 1, 10, 0))).toBe('2026-10-01T13:00');
    expect(laterToday(new Date(2026, 9, 1, 18, 0))).toBe('2026-10-01T21:00');
    expect(laterToday(new Date(2026, 9, 1, 18, 1))).toBeNull();
    expect(laterToday(new Date(2026, 9, 1, 23, 0))).toBeNull();
    expect(shortDate('2026-10-04', new Date(2026, 9, 1))).toBe('Sun 4 Oct');
    expect(shortDate('2027-10-04', new Date(2026, 9, 1))).toBe('Mon 4 Oct 2027');
  });
});
