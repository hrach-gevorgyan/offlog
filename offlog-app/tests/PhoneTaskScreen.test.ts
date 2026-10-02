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
import { switchTab, push, stack, toast } from '../src/lib/phone/nav';
import { dateFromToday } from '../src/lib/carddetail/helpers';
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
    await fireEvent.click(getByText('Repeat'));
    await fireEvent.click(sheetRow('Skip to the next one'));
    await waitFor(() => expect(db.skipRecurrence).toHaveBeenCalledWith('task:t'));
    await waitFor(() => expect(get(toast)?.text).toMatch(/^Next: /));
    await get(toast)!.undo!();
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { due_date: '2026-10-01', reminder_at: null, checklist: undefined });
  });

  it('a failed skip surfaces an error', async () => {
    db.skipRecurrence.mockRejectedValue(new Error('boom'));
    const { getByText } = await open(task({ due_date: '2026-10-01', recurrence: 'weekly' }));
    await fireEvent.click(getByText('Repeat'));
    await fireEvent.click(sheetRow('Skip to the next one'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not skip to the next one. Please try again.'));
  });

  it('the Repeat sheet writes the picked rule', async () => {
    const { getByText } = await open(task({ due_date: '2026-10-01' }));
    await fireEvent.click(getByText('Repeat'));
    await fireEvent.click(sheetRow('Weekly'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { recurrence: 'weekly', recurrenceInterval: 1, recurrenceWeekdaysOnly: undefined });
    await waitFor(() => expect(getByText('Weekly', { selector: '.p-v' })).toBeTruthy());
  });

  it('adds a tag typed into the Tags sheet', async () => {
    const { getByText } = await open();
    await fireEvent.click(getByText('Tags'));
    const input = document.querySelector('.psheet input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Floor Plan' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { tags: ['floor-plan'] });
    await waitFor(() => expect(db.ensureFreshTagColor).toHaveBeenCalledWith('floor-plan', []));
  });

  it('a failed tag write surfaces an error and rolls the tag back', async () => {
    const { getByText, queryByText } = await open();
    db.updateTask.mockRejectedValue(new Error('boom'));
    // No reload arrives: the local rollback alone must undo the tag.
    db.getTaskById.mockReturnValue(new Promise(() => {}));
    await fireEvent.click(getByText('Tags'));
    const input = document.querySelector('.psheet input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'paint' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save the tags. Please try again.'));
    await waitFor(() => expect(queryByText('#paint')).toBeNull());
  });

  it('shows two tags on the row, then a count', async () => {
    const { getByText, queryByText } = await open(task({ tags: ['a', 'b', 'c', 'd'] }));
    expect(getByText('#a')).toBeTruthy();
    expect(getByText('#b')).toBeTruthy();
    expect(queryByText('#c')).toBeNull();
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

  it('shows unset optional fields as + chips, and a set one as its row', async () => {
    const { getByLabelText, queryByLabelText, getByText, container } = await open();
    for (const l of ['Add reminder', 'Add repeat', 'Add blocked by', 'Add related', 'Add attachment']) expect(getByLabelText(l)).toBeTruthy();
    // No custom fields defined: no Field chip.
    expect(queryByLabelText('Add field')).toBeNull();
    expect(container.querySelectorAll('.p-row').length).toBe(4);
    expect(getByText('Due').closest('button')!.querySelector('.p-v')!.textContent!.trim()).toBe('—');
    expect(getByText('Tags').closest('button')!.querySelector('.p-v')!.textContent!.trim()).toBe('—');
  });

  it('a cleared reminder turns its row back into a chip', async () => {
    const { getByText, queryByLabelText, findByLabelText } = await open(task({ reminder_at: new Date(2030, 0, 2, 9, 0).toISOString() }));
    expect(queryByLabelText('Add reminder')).toBeNull();
    await fireEvent.click(getByText('Reminder'));
    await fireEvent.click(sheetRow('No reminder'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { reminder_at: null, remindOnDue: false });
    expect(await findByLabelText('Add reminder')).toBeTruthy();
  });

  it('a chip opens the same sheet as its row', async () => {
    const { getByLabelText } = await open(task({ due_date: '2026-10-01' }));
    await fireEvent.click(getByLabelText('Add repeat'));
    await fireEvent.click(sheetRow('Weekly'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { recurrence: 'weekly', recurrenceInterval: 1, recurrenceWeekdaysOnly: undefined });
  });

  it('the note sits between the title and the field rows', async () => {
    const { getByLabelText, getByText } = await open();
    const note = getByLabelText('Note');
    expect(getByLabelText('Title').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(getByText('Status')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('the Due sheet ticks a date none of its shortcuts covers, in the app format', async () => {
    const { getByText } = await open(task({ due_date: '2030-03-04' }));
    await fireEvent.click(getByText('Due'));
    expect(sheetRow('Mon 4 Mar 2030').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.psheet .cal-trigger')!.textContent!.trim()).toBe('Mon 4 Mar 2030');
  });

  it('Weekdays is a top-level repeat: daily, weekdays only', async () => {
    const { getByText } = await open(task({ due_date: '2026-10-01', recurrence: 'daily', recurrenceInterval: 1 }));
    await fireEvent.click(getByText('Repeat'));
    await fireEvent.click(sheetRow('Weekdays'));
    expect(db.updateTask).toHaveBeenCalledWith('task:t', { recurrence: 'daily', recurrenceInterval: 1, recurrenceWeekdaysOnly: true });
    await waitFor(() => expect(sheetRow('Weekdays').getAttribute('aria-pressed')).toBe('true'));
    expect(getByText('Weekdays', { selector: '.p-v' })).toBeTruthy();
    await fireEvent.click(sheetRow('Daily'));
    expect(db.updateTask).toHaveBeenLastCalledWith('task:t', { recurrence: 'daily', recurrenceInterval: 1, recurrenceWeekdaysOnly: false });
  });

  it('offers "Later today" three hours out, rounded up to the hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 9, 35));
    try {
      const { getByLabelText } = await open();
      await fireEvent.click(getByLabelText('Add reminder'));
      await fireEvent.click(sheetRow('Later today'));
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { reminder_at: new Date(2026, 9, 1, 13, 0).toISOString() });
    } finally { vi.useRealTimers(); }
  });

  it('the Tags field says it finds as well as adds', async () => {
    const { getByText } = await open();
    await fireEvent.click(getByText('Tags'));
    expect((document.querySelector('.psheet input') as HTMLInputElement).placeholder).toBe('Find or add a tag');
  });

  describe('Fields', () => {
    const defs = [
      { _id: 'f1', id: 'f1', name: 'Vendor', type: 'select', options: ['Acme', 'Bolt'] },
      { _id: 'f2', id: 'f2', name: 'Budget', type: 'number' },
    ];

    it('a select field picks from a list instead of a native dropdown', async () => {
      db.getCustomFieldDefs.mockResolvedValue(defs);
      const { findByLabelText } = await open();
      await fireEvent.click(await findByLabelText('Add field'));
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
      await fireEvent.click(await findByLabelText('Add field'));
      const input = document.querySelector('.psheet input.val') as HTMLInputElement;
      expect(input.placeholder).toBe('—');
      await fireEvent.change(input, { target: { value: '120' } });
      expect(db.updateTask).toHaveBeenCalledWith('task:t', { custom_values: { f2: 120 } });
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
