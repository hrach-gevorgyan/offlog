import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import type { TaskDoc } from '../src/lib/types';

// TrashView is the only screen that can destroy a task for good, so these
// cover what it writes on restore/purge and that every one of those paths
// surfaces showError() instead of failing silently. db.ts is mocked —
// db.test.ts already covers the real undoDelete/deleteForever round-trip.
const getAllDeletedTasks = vi.fn().mockResolvedValue([]);
const undoDelete = vi.fn().mockResolvedValue(undefined);
const deleteForever = vi.fn().mockResolvedValue(undefined);
const emptyTrash = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/db', () => ({
  getAllDeletedTasks: (...a: unknown[]) => getAllDeletedTasks(...a),
  undoDelete: (...a: unknown[]) => undoDelete(...a),
  deleteForever: (...a: unknown[]) => deleteForever(...a),
  emptyTrash: (...a: unknown[]) => emptyTrash(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));

const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...a: unknown[]) => reloadTasks(...a),
  showError: (...a: unknown[]) => showError(...a),
}));

// The real confirmAction resolves via <ConfirmDialog/> mounted at
// App.svelte's root — absent here, so its promise would never settle.
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({
  confirmAction: (...a: unknown[]) => confirmAction(...a),
}));

// closeOnBack registers a browser history entry; in jsdom hand the
// component its callback straight back as requestClose.
vi.mock('../src/lib/modalStack', () => ({
  closeOnBack: (cb: () => void) => cb,
}));

import TrashView from '../src/lib/TrashView.svelte';

function mkTrashed(overrides: Partial<TaskDoc> & { project_name?: string } = {}) {
  return {
    _id: 'task:1', type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Deleted task', body: '', priority: 1,
    due_date: null, reminder_at: null, tags: [], position: 1024,
    deleted: true, created_at: '2026-03-01T09:00:00.000Z', updated_at: '2026-03-10T09:00:00.000Z',
    source: 'PC', project_name: 'Test Project',
    ...overrides,
  } as TaskDoc & { project_name?: string };
}

beforeEach(() => {
  getAllDeletedTasks.mockClear().mockResolvedValue([]);
  undoDelete.mockClear().mockResolvedValue(undefined);
  deleteForever.mockClear().mockResolvedValue(undefined);
  emptyTrash.mockClear().mockResolvedValue(undefined);
  reloadTasks.mockClear();
  showError.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
});

afterEach(() => cleanup());

async function renderWith(items: (TaskDoc & { project_name?: string })[]) {
  getAllDeletedTasks.mockResolvedValue(items);
  const utils = render(TrashView);
  if (items.length) await waitFor(() => utils.getByText(items[0].title));
  return utils;
}

describe('TrashView restore', () => {
  it('restores a single task by id and reloads the task list', async () => {
    const { getByLabelText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByLabelText('Restore'));

    await waitFor(() => expect(undoDelete).toHaveBeenCalledWith('task:1'));
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('restores without asking for confirmation — restore is not destructive', async () => {
    const { getByLabelText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByLabelText('Restore'));

    await waitFor(() => expect(undoDelete).toHaveBeenCalled());
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it('shows an error and does not reload when a restore fails', async () => {
    undoDelete.mockRejectedValueOnce(new Error('write conflict'));
    const { getByLabelText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByLabelText('Restore'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(reloadTasks).not.toHaveBeenCalled();
  });

  it('restore all confirms first, then restores every item', async () => {
    const { getByText } = await renderWith([
      mkTrashed({ _id: 'task:1', title: 'One' }),
      mkTrashed({ _id: 'task:2', title: 'Two' }),
    ]);

    await fireEvent.click(getByText('Restore all'));

    await waitFor(() => expect(undoDelete).toHaveBeenCalledTimes(2));
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(undoDelete.mock.calls.map(c => c[0])).toEqual(['task:1', 'task:2']);
  });

  it('restores nothing when restore all is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByText('Restore all'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(undoDelete).not.toHaveBeenCalled();
  });

  it('shows an error when restore all fails partway', async () => {
    undoDelete.mockRejectedValueOnce(new Error('offline'));
    const { getByText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByText('Restore all'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });
});

describe('TrashView permanent delete', () => {
  it('asks for confirmation naming the task before deleting forever', async () => {
    const { getByLabelText } = await renderWith([mkTrashed({ title: 'Nuke me' })]);

    await fireEvent.click(getByLabelText('Delete forever'));

    await waitFor(() => expect(deleteForever).toHaveBeenCalledWith('task:1'));
    const [message, opts] = confirmAction.mock.calls[0];
    expect(message).toContain('Nuke me');
    expect(opts.danger).toBe(true);
  });

  it('does not delete when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByLabelText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByLabelText('Delete forever'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(deleteForever).not.toHaveBeenCalled();
  });

  it('shows an error when a permanent delete fails', async () => {
    deleteForever.mockRejectedValueOnce(new Error('boom'));
    const { getByLabelText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByLabelText('Delete forever'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });

  it('empties the whole recycle bin only after a danger confirmation', async () => {
    const { getByText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByText('Empty'));

    await waitFor(() => expect(emptyTrash).toHaveBeenCalledTimes(1));
    expect(confirmAction.mock.calls[0][1].danger).toBe(true);
  });

  it('does not empty when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByText('Empty'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(emptyTrash).not.toHaveBeenCalled();
  });

  it('shows an error when emptying fails', async () => {
    emptyTrash.mockRejectedValueOnce(new Error('boom'));
    const { getByText } = await renderWith([mkTrashed()]);

    await fireEvent.click(getByText('Empty'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });

  it('offers no bulk controls when the bin is empty', async () => {
    const { queryByText } = await renderWith([]);

    await waitFor(() => expect(queryByText('Empty')).toBeNull());
    expect(queryByText('Restore all')).toBeNull();
  });
});
