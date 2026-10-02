import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

const getAllDeletedTasks = vi.fn();
const undoDelete = vi.fn();
const deleteForever = vi.fn();
const emptyTrash = vi.fn();
vi.mock('../src/lib/db', () => ({
  getAllDeletedTasks: (...a: unknown[]) => getAllDeletedTasks(...a),
  undoDelete: (...a: unknown[]) => undoDelete(...a),
  deleteForever: (...a: unknown[]) => deleteForever(...a),
  emptyTrash: (...a: unknown[]) => emptyTrash(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));
const reloadTasks = vi.fn();
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...a: unknown[]) => reloadTasks(...a),
  showError: (...a: unknown[]) => showError(...a),
}));
// The real one resolves through <ConfirmDialog/> at App's root, absent here.
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({ confirmAction: (...a: unknown[]) => confirmAction(...a) }));

import SettingsPage from '../src/lib/phone/settings/SettingsPage.svelte';
import { toast } from '../src/lib/phone/nav';

const items = [
  { _id: 'task:a', title: 'Buy paint', project_name: 'House', priority: 2, updated_at: new Date().toISOString() },
  { _id: 'task:b', title: 'Call Ann', project_name: 'Family', priority: 1, updated_at: new Date().toISOString() },
];

beforeEach(() => {
  vi.clearAllMocks();
  getAllDeletedTasks.mockResolvedValue(items);
  undoDelete.mockResolvedValue(undefined);
  deleteForever.mockResolvedValue(undefined);
  emptyTrash.mockResolvedValue(2);
  reloadTasks.mockResolvedValue(undefined);
  toast.set(null);
});
afterEach(cleanup);

describe('phone Recycle bin', () => {
  it('lists deleted tasks with their project', async () => {
    const { getByText, getByLabelText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    expect(getByText(/House ·/)).toBeTruthy();
    expect(getByText(/items? · kept for 3 months/)).toBeTruthy();
    expect(getByLabelText('Restore Buy paint')).toBeTruthy();
  });

  it('Restore undeletes that task, reloads, and confirms with a toast', async () => {
    const { getByText, getAllByText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    await fireEvent.click(getAllByText('Restore')[0]);
    await waitFor(() => expect(undoDelete).toHaveBeenCalledWith('task:a'));
    expect(reloadTasks).toHaveBeenCalled();
    expect(confirmAction).not.toHaveBeenCalled();
    await waitFor(() => expect(get(toast)?.text).toBe('Restored: Buy paint'));
  });

  it('a failed restore surfaces showError', async () => {
    undoDelete.mockRejectedValueOnce(new Error('x'));
    const { getByText, getAllByText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    await fireEvent.click(getAllByText('Restore')[0]);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to restore task. Please try again.'));
  });

  it('a restore of a task removed for good says so, without "try again", and reloads the list', async () => {
    undoDelete.mockRejectedValueOnce({ status: 404, name: 'not_found' });
    const { getByText, getAllByText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    expect(getAllDeletedTasks).toHaveBeenCalledTimes(1);
    await fireEvent.click(getAllByText('Restore')[0]);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('That task no longer exists — it was removed permanently.'));
    expect(showError).not.toHaveBeenCalledWith('Failed to restore task. Please try again.');
    await waitFor(() => expect(getAllDeletedTasks).toHaveBeenCalledTimes(2));
  });

  it('Delete for good asks first and only deletes on yes', async () => {
    const { getByText, getByLabelText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(getByLabelText('Delete “Buy paint” for good'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(deleteForever).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(getByLabelText('Delete “Buy paint” for good'));
    await waitFor(() => expect(deleteForever).toHaveBeenCalledWith('task:a'));
    expect(confirmAction.mock.calls[1][1]).toMatchObject({ danger: true });
  });

  it('a failed delete for good surfaces showError', async () => {
    confirmAction.mockResolvedValue(true);
    deleteForever.mockRejectedValueOnce(new Error('x'));
    const { getByText, getByLabelText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    await fireEvent.click(getByLabelText('Delete “Buy paint” for good'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to delete task. Please try again.'));
  });

  it('Empty asks first, then empties the bin; a failure surfaces showError', async () => {
    const { getByText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(getByText('Empty'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(emptyTrash).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(getByText('Empty'));
    await waitFor(() => expect(emptyTrash).toHaveBeenCalledTimes(1));
    confirmAction.mockResolvedValueOnce(true);
    emptyTrash.mockRejectedValueOnce(new Error('x'));
    await fireEvent.click(getByText('Empty'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to empty the Recycle bin. Please try again.'));
  });

  it('Restore all restores each task and reports partial failures', async () => {
    confirmAction.mockResolvedValue(true);
    undoDelete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x'));
    const { getByText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    await fireEvent.click(getByText('Restore all'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Restored 1 of 2. 1 could not be restored.'));
    expect(undoDelete.mock.calls).toEqual([['task:a'], ['task:b']]);
  });

  it('Restore all surfaces showError when the reload after restoring fails', async () => {
    confirmAction.mockResolvedValue(true);
    reloadTasks.mockRejectedValueOnce(new Error('x'));
    const { getByText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Buy paint'));
    await fireEvent.click(getByText('Restore all'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to restore some tasks. Please try again.'));
    expect(undoDelete.mock.calls).toEqual([['task:a'], ['task:b']]);
    expect(get(toast)).toBeNull();
  });

  it('shows the empty state', async () => {
    getAllDeletedTasks.mockResolvedValue([]);
    const { getByText, queryByText } = render(SettingsPage, { page: 'trash' });
    await waitFor(() => getByText('Deleted tasks stay here for 3 months.'));
    expect(queryByText('Empty')).toBeNull();
  });
});
