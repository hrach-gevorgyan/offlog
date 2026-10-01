import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const getRecentLogs = vi.fn();
const getTaskById = vi.fn();
const clearLogs = vi.fn();
let feed: (() => void) | null = null;
vi.mock('../src/lib/db', () => ({
  getRecentLogs: (...a: unknown[]) => getRecentLogs(...a),
  getTaskById: (...a: unknown[]) => getTaskById(...a),
  clearLogs: (...a: unknown[]) => clearLogs(...a),
  subscribe: (cb: () => void) => { feed = cb; return () => { feed = null; }; },
}));
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({ showError: (...a: unknown[]) => showError(...a) }));
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({ confirmAction: (...a: unknown[]) => confirmAction(...a) }));

import SettingsPage from '../src/lib/phone/settings/SettingsPage.svelte';
import { actions } from '../src/lib/phone/nav';

const now = new Date();
const yesterday = new Date(now.getTime() - 86_400_000);
const logs = [
  { _id: 'log:2', type: 'log', ts: now.toISOString(), source: 'Pixel', ref: 'task:a', action: 'create', task_title: 'Buy paint', project_name: 'House' },
  { _id: 'log:1', type: 'log', ts: yesterday.toISOString(), source: 'PC', ref: 'project:h', action: 'create', project_name: 'House' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getRecentLogs.mockResolvedValue(logs);
  clearLogs.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('phone History', () => {
  it('groups changes by day with their device', async () => {
    const { getByText, getAllByText } = render(SettingsPage, { page: 'history' });
    await waitFor(() => getByText('Today'));
    expect(getByText('Yesterday')).toBeTruthy();
    expect(getByText('Pixel')).toBeTruthy();
    expect(getAllByText('PC')).toHaveLength(1);
    expect(getRecentLogs).toHaveBeenCalledWith(150);
  });

  it('one device only: no device chip', async () => {
    getRecentLogs.mockResolvedValue(logs.map(l => ({ ...l, source: 'Pixel' })));
    const { getByText, container } = render(SettingsPage, { page: 'history' });
    await waitFor(() => getByText('Today'));
    expect(container.querySelector('.src')).toBeNull();
  });

  it('a change that lands mid-load queues exactly one follow-up load', async () => {
    let release!: (v: unknown) => void;
    getRecentLogs.mockReturnValueOnce(new Promise(r => { release = r; }));
    const { getByText, container } = render(SettingsPage, { page: 'history' });
    feed!(); feed!();
    expect(getRecentLogs).toHaveBeenCalledTimes(1);
    release([logs[1]]);
    await waitFor(() => getByText('Today'));
    expect(getRecentLogs).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll('.p-sec')).toHaveLength(2);
  });

  it('a task entry opens the task; a project entry is not a button', async () => {
    const task = { _id: 'task:a', title: 'Buy paint' };
    getTaskById.mockResolvedValue(task);
    const spy = vi.spyOn(actions, 'openTask').mockImplementation(() => {});
    const { getByText, container } = render(SettingsPage, { page: 'history' });
    await waitFor(() => getByText('Today'));
    expect(container.querySelectorAll('button.entry')).toHaveLength(1);
    await fireEvent.click(container.querySelector('button.entry')!);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(task));
    expect(getTaskById).toHaveBeenCalledWith('task:a');
    spy.mockRestore();
  });

  it('a task that no longer exists says so', async () => {
    getTaskById.mockResolvedValue(null);
    const { getByText, container } = render(SettingsPage, { page: 'history' });
    await waitFor(() => getByText('Today'));
    await fireEvent.click(container.querySelector('button.entry')!);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('This task no longer exists.'));
  });

  it('Clear all asks first, clears, and shows the empty state', async () => {
    const { getByText, findByText } = render(SettingsPage, { page: 'history' });
    await waitFor(() => getByText('Today'));
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(getByText('Clear all'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(clearLogs).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(getByText('Clear all'));
    await waitFor(() => expect(clearLogs).toHaveBeenCalledTimes(1));
    expect(confirmAction.mock.calls[1][1]).toMatchObject({ danger: true });
    expect(await findByText(/Nothing logged yet/)).toBeTruthy();
  });

  it('a failed clear surfaces showError', async () => {
    confirmAction.mockResolvedValue(true);
    clearLogs.mockRejectedValueOnce(new Error('x'));
    const { getByText } = render(SettingsPage, { page: 'history' });
    await waitFor(() => getByText('Today'));
    await fireEvent.click(getByText('Clear all'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to clear history.'));
  });
});
