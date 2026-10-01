import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

const getAllDeletedTasks = vi.fn();
const getArchivedProjects = vi.fn();
const syncState = vi.hoisted(() => ({ status: 'idle', lastSynced: null as string | null, error: null as string | null, conflictCount: 0, listeners: new Set<() => void>() }));
vi.mock('../src/lib/db', () => ({
  syncState,
  getAllDeletedTasks: (...a: unknown[]) => getAllDeletedTasks(...a),
  getArchivedProjects: (...a: unknown[]) => getArchivedProjects(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('../src/lib/store', () => ({ showError: vi.fn() }));
let syncOn = true;
vi.mock('../src/config', () => ({
  getSyncUrl: () => 'http://pc.local:5984/offlog',
  isSyncEnabled: () => syncOn,
  getNotificationsEnabled: () => true,
  isAppLockEnabled: () => false,
  isTauri: () => false,
  isNativePlatform: () => false,
  getTimeFormat24h: () => true,
}));
vi.mock('../src/lib/theme', () => ({ getThemeMode: () => 'dark' }));

import SettingsScreen from '../src/lib/phone/settings/SettingsScreen.svelte';
import { stack, switchTab } from '../src/lib/phone/nav';
import { showError } from '../src/lib/store';

const rowValue = (label: HTMLElement) => label.closest('button')!.querySelector('.p-v')?.textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  switchTab('home');
  syncOn = true;
  Object.assign(syncState, { status: 'idle', lastSynced: null, error: null, conflictCount: 0 });
  getAllDeletedTasks.mockResolvedValue([{ _id: 'task:a' }, { _id: 'task:b' }, { _id: 'task:c' }]);
  getArchivedProjects.mockResolvedValue([{ _id: 'project:o' }]);
});
afterEach(cleanup);

describe('phone Settings home', () => {
  it('shows each row with its current value', async () => {
    const { getByText } = render(SettingsScreen);
    expect(rowValue(getByText('Appearance'))).toBe('Dark');
    expect(rowValue(getByText('Notifications'))).toBe('On');
    expect(rowValue(getByText('App lock'))).toBe('Off');
    await waitFor(() => expect(rowValue(getByText('Recycle bin'))).toBe('3'));
    expect(rowValue(getByText('Archived projects'))).toBe('1');
    expect(getByText('Offlog · local-first, no account')).toBeTruthy();
  });

  it('every row pushes its settings page', async () => {
    const { getByText } = render(SettingsScreen);
    const expected: [string, string][] = [
      ['Appearance', 'appearance'], ['Notifications', 'notifications'], ['Sync & devices', 'sync'],
      ['App lock', 'security'], ['Spaces, tags & fields', 'organize'], ['Archived projects', 'archived'],
      ['Backup & restore', 'data'], ['Recycle bin', 'trash'], ['History', 'history'], ['Advanced', 'advanced'],
    ];
    for (const [label, page] of expected) {
      await fireEvent.click(getByText(label));
      expect(get(stack).at(-1)).toMatchObject({ k: 'set', page });
    }
  });

  it('the sync card shows real status and conflicts, and opens Sync', async () => {
    syncState.conflictCount = 2;
    syncState.lastSynced = new Date().toISOString();
    const { getByText } = render(SettingsScreen);
    expect(getByText('Sync is on')).toBeTruthy();
    expect(getByText(/Last synced/)).toBeTruthy();
    expect(getByText('2 conflicts')).toBeTruthy();
    // A live status change reaches the card.
    syncState.status = 'error'; syncState.error = 'Server unreachable';
    syncState.listeners.forEach(fn => fn());
    await waitFor(() => getByText('Sync error'));
    expect(getByText(/Server unreachable/)).toBeTruthy();
    await fireEvent.click(getByText('Sync error'));
    expect(get(stack).at(-1)).toMatchObject({ k: 'set', page: 'sync' });
  });

  it('says when sync is off', () => {
    syncOn = false;
    const { getByText } = render(SettingsScreen);
    expect(getByText('Sync is off')).toBeTruthy();
    expect(getByText('Everything stays on this device')).toBeTruthy();
  });

  it('a failed count load surfaces showError', async () => {
    getAllDeletedTasks.mockRejectedValue(new Error('x'));
    render(SettingsScreen);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to load settings.'));
  });
});
