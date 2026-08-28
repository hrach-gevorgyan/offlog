import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

// CardDetail talks to db.ts/store.ts/notifications.ts for everything —
// mocked here so this is a true component test (save/diff logic, not a
// round-trip through the real database, which db.test.ts already covers).
const updateTask = vi.fn().mockResolvedValue(undefined);
const deleteTask = vi.fn().mockResolvedValue(undefined);
const archiveTask = vi.fn().mockResolvedValue(undefined);
const duplicateTask = vi.fn().mockResolvedValue(undefined);
const getRelatedTasks = vi.fn().mockResolvedValue([]);
const searchTasksForLinking = vi.fn().mockResolvedValue([]);
const linkRelatedTask = vi.fn().mockResolvedValue(undefined);
const unlinkRelatedTask = vi.fn().mockResolvedValue(undefined);
const getBlockingTasks = vi.fn().mockResolvedValue([]);
const linkBlockedBy = vi.fn().mockResolvedValue(undefined);
const unlinkBlockedBy = vi.fn().mockResolvedValue(undefined);
const deleteAttachment = vi.fn().mockResolvedValue({ attachments: [] });
vi.mock('../src/lib/db', () => ({
  updateTask: (...args: unknown[]) => updateTask(...args),
  deleteTask: (...args: unknown[]) => deleteTask(...args),
  archiveTask: (...args: unknown[]) => archiveTask(...args),
  duplicateTask: (...args: unknown[]) => duplicateTask(...args),
  getAllTags: vi.fn().mockResolvedValue([]),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
  ensureFreshTagColor: vi.fn().mockResolvedValue(undefined),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
  findTasksByTitleInProject: vi.fn().mockResolvedValue([]),
  findSimilarNotes: vi.fn().mockResolvedValue([]),
  getRelatedTasks: (...args: unknown[]) => getRelatedTasks(...args),
  searchTasksForLinking: (...args: unknown[]) => searchTasksForLinking(...args),
  linkRelatedTask: (...args: unknown[]) => linkRelatedTask(...args),
  unlinkRelatedTask: (...args: unknown[]) => unlinkRelatedTask(...args),
  getBlockingTasks: (...args: unknown[]) => getBlockingTasks(...args),
  linkBlockedBy: (...args: unknown[]) => linkBlockedBy(...args),
  unlinkBlockedBy: (...args: unknown[]) => unlinkBlockedBy(...args),
  isBlockerResolved: vi.fn().mockReturnValue(false),
  addAttachment: (...args: unknown[]) => addAttachment(...args),
  deleteAttachment: (...args: unknown[]) => deleteAttachment(...args),
  getAttachmentBlob: vi.fn().mockResolvedValue(null),
  skipRecurrence: vi.fn().mockResolvedValue(undefined),
  // Real value, not undefined: `attachments.length >= undefined` is always
  // false, so a mock without it silently disables the per-task cap.
  ATTACHMENT_MAX_PER_TASK: 10,
}));

// blobToBase64() reads through a real FileReader, which jsdom emulates with
// genuine (if usually fast) async I/O timing -- unreliable under this whole
// suite's full parallel load. Every other helper here is real; only the
// actual file read is swapped for a synchronous stand-in.
vi.mock('../src/lib/carddetail/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/carddetail/helpers')>();
  return { ...actual, blobToBase64: vi.fn().mockResolvedValue('eA==') }; // "x" in base64
});

const addAttachment = vi.fn().mockResolvedValue({ attachments: [{ key: 'att:1', filename: 'notes.txt', size: 12, content_type: 'text/plain', added_at: '2026-08-26T00:00:00.000Z' }] });
const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...args: unknown[]) => reloadTasks(...args),
  showError: (...args: unknown[]) => showError(...args),
  modalOpen: writable(false),
  projects: writable([]),
}));

vi.mock('../src/lib/notifications', () => ({
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

// The real confirmAction resolves via <ConfirmDialog/> mounted in
// App.svelte's root — not present here, so its promise would hang
// forever. Mocked per-test to simulate the user's confirm/cancel click.
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({
  confirmAction: (...args: unknown[]) => confirmAction(...args),
}));

import CardDetail from '../src/lib/CardDetail.svelte';

function mkProject(): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0,
    columns: [
      { id: 'col:idea', name: 'Idea' },
      { id: 'col:task', name: 'Task' },
      { id: 'col:done', name: 'Completed' },
    ],
    default_view: 'kanban', updated_at: new Date().toISOString(), source: 'pc',
  };
}

function mkTask(overrides: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: 'task:1', type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:idea', title: 'Original title', body: '', priority: 1,
    due_date: null, reminder_at: null, tags: [], position: 1024,
    deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    source: 'pc',
    ...overrides,
  };
}

beforeEach(() => {
  updateTask.mockClear();
  deleteTask.mockClear();
  archiveTask.mockClear();
  duplicateTask.mockClear();
  reloadTasks.mockClear();
  showError.mockClear();
  confirmAction.mockReset();
  getRelatedTasks.mockReset().mockResolvedValue([]);
  searchTasksForLinking.mockReset().mockResolvedValue([]);
  linkRelatedTask.mockReset().mockResolvedValue(undefined);
  unlinkRelatedTask.mockReset().mockResolvedValue(undefined);
  getBlockingTasks.mockReset().mockResolvedValue([]);
  linkBlockedBy.mockReset().mockResolvedValue(undefined);
  unlinkBlockedBy.mockReset().mockResolvedValue(undefined);
  deleteAttachment.mockReset().mockResolvedValue({ attachments: [] });
  addAttachment.mockReset().mockResolvedValue({ attachments: [{ key: 'att:1', filename: 'notes.txt', size: 12, content_type: 'text/plain', added_at: '2026-08-26T00:00:00.000Z' }] });
});

afterEach(() => cleanup());

describe('CardDetail save logic (A9)', () => {
  it('saves an edited title', async () => {
    const task = mkTask();
    const { getByPlaceholderText, getByText } = render(CardDetail, { props: { task, project: mkProject() } });

    const titleInput = getByPlaceholderText('Task title') as HTMLTextAreaElement;
    await fireEvent.input(titleInput, { target: { value: 'Updated title' } });
    await fireEvent.click(getByText('Save'));

    // save() now flushes attachments/related/blocked-by before the main
    // updateTask call (all batched into Save, not immediate-write anymore),
    // so a real Save takes a few more microtask hops than fireEvent.click's
    // own implicit tick() covers.
    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    const [id, changes] = updateTask.mock.calls[0];
    expect(id).toBe('task:1');
    expect(changes.title).toBe('Updated title');
  });

  it('reloads tasks after a successful save', async () => {
    const { getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });
    await fireEvent.click(getByText('Save'));
    await waitFor(() => expect(reloadTasks).toHaveBeenCalledTimes(1));
  });

  it('shows an error and keeps the card open if the save fails', async () => {
    updateTask.mockRejectedValueOnce(new Error('network down'));
    const { getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });
    await fireEvent.click(getByText('Save'));
    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    // Still mounted with its Save button -- a failed save (unlike a
    // successful one) must not requestClose(), so the user can retry
    // without losing whatever else they'd typed.
    expect(getByText('Save')).toBeTruthy();
  });

  it('sets due_date via the "Today" quick-shortcut and saves it as a bare date string', async () => {
    const task = mkTask();
    const { getByText, container } = render(CardDetail, { props: { task, project: mkProject() } });

    // option C: Due date is a mandatory, always-visible field now (no
    // toggle) -- no need to open anything first to reach the shortcut.
    const todayShortcut = container.querySelector('.due-shortcut') as HTMLButtonElement;
    expect(todayShortcut?.textContent).toBe('Today');
    await fireEvent.click(todayShortcut);
    await fireEvent.click(getByText('Save'));

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    const [, changes] = updateTask.mock.calls[0];
    const expected = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const expectedStr = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`;
    expect(changes.due_date).toBe(expectedStr);
  });

  it('reports every rejected file in a batch, not just the last one', async () => {
    // The rejection message used to live in one shared variable that each
    // file overwrote, so only the final file's outcome survived -- and a
    // success after a failure cleared it outright, attaching some files and
    // saying nothing. Both files here are rejected on extension alone, which
    // keeps the test off the FileReader and so deterministic under load.
    const task = mkTask();
    const { container } = render(CardDetail, { props: { task, project: mkProject() } });

    await fireEvent.click(container.querySelector('.extras-toggle') as HTMLButtonElement);
    const attachToggle = [...container.querySelectorAll('.extra-block-toggle')]
      .find(b => (b.textContent ?? '').includes('Attachments')) as HTMLButtonElement;
    expect(attachToggle).toBeTruthy();
    await fireEvent.click(attachToggle);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    Object.defineProperty(input, 'files', {
      value: [
        new File(['x'], 'holiday.heic', { type: 'image/heic' }),
        new File(['y'], 'clip.heif', { type: 'image/heif' }),
      ],
      configurable: true,
    });
    await fireEvent.change(input);

    await waitFor(() => {
      const text = container.textContent ?? '';
      // Both named, not just whichever came last.
      expect(text).toContain('holiday.heic');
      expect(text).toContain('clip.heif');
      // And the count makes a partial outcome impossible to misread.
      expect(text).toContain('0 of 2');
    });
  });

  it('toggling a checklist item\'s "done" state persists on save (Extras opened manually)', async () => {
    const task = mkTask({ checklist: [{ text: 'Step 1', done: false }] });
    const { getByText, container } = render(CardDetail, { props: { task, project: mkProject() } });

    // Owner feedback, 2026-07-30: neither Extras nor any of its five
    // nested blocks auto-open just because they already have content --
    // opening each is always a manual action now. Checklist is the
    // second .extra-block-toggle (Repeat & reminder is the first).
    await fireEvent.click(container.querySelector('.extras-toggle') as HTMLButtonElement);
    await fireEvent.click(container.querySelectorAll('.extra-block-toggle')[1] as HTMLButtonElement);

    const checkbox = container.querySelector('.checklist-check') as HTMLButtonElement;
    expect(checkbox).toBeTruthy();
    await fireEvent.click(checkbox);
    await fireEvent.click(getByText('Save'));

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    const [, changes] = updateTask.mock.calls[0];
    expect(changes.checklist?.[0].done).toBe(true);
  });
});

function openExtraBlock(container: HTMLElement, label: string) {
  return fireEvent.click(
    [...container.querySelectorAll('.extra-block-toggle')].find(b => (b.textContent ?? '').includes(label)) as HTMLButtonElement,
  );
}

describe('CardDetail batches related/blocked-by/attachments into Save (A2)', () => {
  it('does not link a related task until Save, then links it', async () => {
    const other = mkTask({ _id: 'task:2', title: 'Other task' });
    searchTasksForLinking.mockResolvedValue([other]);
    const { container, getByText, getByPlaceholderText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await fireEvent.click(container.querySelector('.extras-toggle') as HTMLButtonElement);
    await openExtraBlock(container, 'Related');
    await fireEvent.input(getByPlaceholderText('Link another task…'), { target: { value: 'Other' } });
    await waitFor(() => expect(getByText('Other task')).toBeTruthy());
    await fireEvent.mouseDown(getByText('Other task'));

    // Picking a suggestion only edits the local list -- no write yet.
    expect(linkRelatedTask).not.toHaveBeenCalled();

    await fireEvent.click(getByText('Save'));
    await waitFor(() => expect(linkRelatedTask).toHaveBeenCalledWith('task:1', 'task:2'));
  });

  it('does not unlink a related task until Save, then unlinks it', async () => {
    const other = mkTask({ _id: 'task:2', title: 'Other task' });
    getRelatedTasks.mockResolvedValue([other]);
    const { container, getByText, getByLabelText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await fireEvent.click(container.querySelector('.extras-toggle') as HTMLButtonElement);
    await openExtraBlock(container, 'Related');
    await waitFor(() => expect(getByText('Other task')).toBeTruthy());
    await fireEvent.click(getByLabelText('Remove link'));

    expect(unlinkRelatedTask).not.toHaveBeenCalled();

    await fireEvent.click(getByText('Save'));
    await waitFor(() => expect(unlinkRelatedTask).toHaveBeenCalledWith('task:1', 'task:2'));
  });

  it('rolls back a blocked-by link that turns out to be a cycle at Save time', async () => {
    const blocker = mkTask({ _id: 'task:2', title: 'Blocker task' });
    searchTasksForLinking.mockResolvedValue([blocker]);
    linkBlockedBy.mockRejectedValue(new Error('circular dependency'));
    const { container, getByText, getByPlaceholderText, queryByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await fireEvent.click(container.querySelector('.extras-toggle') as HTMLButtonElement);
    await openExtraBlock(container, 'Blocked by');
    await fireEvent.input(getByPlaceholderText("This task can't start until…"), { target: { value: 'Blocker' } });
    await waitFor(() => expect(getByText('Blocker task')).toBeTruthy());
    await fireEvent.mouseDown(getByText('Blocker task'));

    await fireEvent.click(getByText('Save'));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(String(showError.mock.calls[0][0])).toContain('already block each other');
    // The invalid link doesn't linger in the list looking like it worked.
    expect(queryByText('Blocker task')).toBeNull();
  });

  it('does not attach a picked file until Save, then attaches it', async () => {
    const { container, getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await fireEvent.click(container.querySelector('.extras-toggle') as HTMLButtonElement);
    await openExtraBlock(container, 'Attachments');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.txt', { type: 'text/plain' })], configurable: true });
    await fireEvent.change(input);

    await waitFor(() => expect(container.textContent).toContain('notes.txt'));
    expect(addAttachment).not.toHaveBeenCalled();

    await fireEvent.click(getByText('Save'));
    await waitFor(() => expect(addAttachment).toHaveBeenCalledWith('task:1', expect.objectContaining({ filename: 'notes.txt' })));
  });

  it('Cancel discards a picked-but-unsaved attachment, a related pick, and a removed link', async () => {
    const other = mkTask({ _id: 'task:2', title: 'Other task' });
    getRelatedTasks.mockResolvedValue([other]);
    searchTasksForLinking.mockResolvedValue([]);
    const { container, getByText, getByLabelText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await fireEvent.click(container.querySelector('.extras-toggle') as HTMLButtonElement);
    await openExtraBlock(container, 'Related');
    await waitFor(() => expect(getByText('Other task')).toBeTruthy());
    await fireEvent.click(getByLabelText('Remove link'));
    await openExtraBlock(container, 'Attachments');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.txt', { type: 'text/plain' })], configurable: true });
    await fireEvent.change(input);
    await waitFor(() => expect(container.textContent).toContain('notes.txt'));

    await fireEvent.click(getByText('Cancel'));

    expect(unlinkRelatedTask).not.toHaveBeenCalled();
    expect(addAttachment).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
  });
});

describe('CardDetail discard & delete (A32)', () => {
  it('Cancel discards edits — nothing is written', async () => {
    const { getByPlaceholderText, getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await fireEvent.input(getByPlaceholderText('Task title'), { target: { value: 'Edited but abandoned' } });
    await fireEvent.click(getByText('Cancel'));

    expect(updateTask).not.toHaveBeenCalled();
    expect(reloadTasks).not.toHaveBeenCalled();
  });

  it('Escape discards edits — nothing is written', async () => {
    const { getByPlaceholderText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    const input = getByPlaceholderText('Task title');
    await fireEvent.input(input, { target: { value: 'Edited but escaped' } });
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(updateTask).not.toHaveBeenCalled();
  });

  async function openActionsMenuAndClickDelete(utils: ReturnType<typeof render>) {
    await fireEvent.click(utils.getByLabelText('More actions'));
    await fireEvent.click(utils.getByText('Delete'));
  }

  it('Delete asks for confirmation, then soft-deletes and reloads', async () => {
    confirmAction.mockResolvedValue(true);
    const utils = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await openActionsMenuAndClickDelete(utils);

    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledWith('task:1');
    expect(reloadTasks).toHaveBeenCalledTimes(1);
  });

  it('declining the confirmation deletes nothing', async () => {
    confirmAction.mockResolvedValue(false);
    const utils = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await openActionsMenuAndClickDelete(utils);

    expect(deleteTask).not.toHaveBeenCalled();
    expect(reloadTasks).not.toHaveBeenCalled();
  });

  it('a failed delete surfaces an error (audited no-silent-failure invariant)', async () => {
    confirmAction.mockResolvedValue(true);
    deleteTask.mockRejectedValueOnce(new Error('storage error'));
    const utils = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });

    await openActionsMenuAndClickDelete(utils);

    expect(showError).toHaveBeenCalledTimes(1);
    expect(reloadTasks).not.toHaveBeenCalled();
  });
});
