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
vi.mock('../src/lib/db', () => ({
  updateTask: (...args: unknown[]) => updateTask(...args),
  deleteTask: (...args: unknown[]) => deleteTask(...args),
  archiveTask: (...args: unknown[]) => archiveTask(...args),
  duplicateTask: (...args: unknown[]) => duplicateTask(...args),
  getAllTags: vi.fn().mockResolvedValue([]),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
  findTasksByTitleInProject: vi.fn().mockResolvedValue([]),
  findSimilarNotes: vi.fn().mockResolvedValue([]),
  getRelatedTasks: vi.fn().mockResolvedValue([]),
  searchTasksForLinking: vi.fn().mockResolvedValue([]),
  linkRelatedTask: vi.fn().mockResolvedValue(undefined),
  unlinkRelatedTask: vi.fn().mockResolvedValue(undefined),
  getBlockingTasks: vi.fn().mockResolvedValue([]),
  linkBlockedBy: vi.fn().mockResolvedValue(undefined),
  unlinkBlockedBy: vi.fn().mockResolvedValue(undefined),
  isBlockerResolved: vi.fn().mockReturnValue(false),
  addAttachment: (...args: unknown[]) => addAttachment(...args),
  deleteAttachment: vi.fn().mockResolvedValue({ attachments: [] }),
  getAttachmentBlob: vi.fn().mockResolvedValue(null),
  skipRecurrence: vi.fn().mockResolvedValue(undefined),
  // Real value, not undefined: `attachments.length >= undefined` is always
  // false, so a mock without it silently disables the per-task cap.
  ATTACHMENT_MAX_PER_TASK: 10,
}));

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
});

afterEach(() => cleanup());

describe('CardDetail save logic (A9)', () => {
  it('saves an edited title', async () => {
    const task = mkTask();
    const { getByPlaceholderText, getByText } = render(CardDetail, { props: { task, project: mkProject() } });

    const titleInput = getByPlaceholderText('Task title') as HTMLTextAreaElement;
    await fireEvent.input(titleInput, { target: { value: 'Updated title' } });
    await fireEvent.click(getByText('Save'));

    expect(updateTask).toHaveBeenCalledTimes(1);
    const [id, changes] = updateTask.mock.calls[0];
    expect(id).toBe('task:1');
    expect(changes.title).toBe('Updated title');
  });

  it('reloads tasks after a successful save', async () => {
    const { getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });
    await fireEvent.click(getByText('Save'));
    expect(reloadTasks).toHaveBeenCalledTimes(1);
  });

  it('shows an error and does not reload if the save fails', async () => {
    updateTask.mockRejectedValueOnce(new Error('network down'));
    const { getByText } = render(CardDetail, { props: { task: mkTask(), project: mkProject() } });
    await fireEvent.click(getByText('Save'));
    expect(showError).toHaveBeenCalledTimes(1);
    expect(reloadTasks).not.toHaveBeenCalled();
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

    const [, changes] = updateTask.mock.calls[0];
    expect(changes.checklist?.[0].done).toBe(true);
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
