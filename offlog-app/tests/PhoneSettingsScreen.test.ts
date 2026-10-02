import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

const getAllDeletedTasks = vi.fn();
const getArchivedProjects = vi.fn();
const syncNow = vi.fn();
const syncState = vi.hoisted(() => ({ status: 'idle', lastSynced: null as string | null, error: null as string | null, conflictCount: 0, listeners: new Set<() => void>() }));
vi.mock('../src/lib/db', () => ({
  syncState,
  getAllDeletedTasks: (...a: unknown[]) => getAllDeletedTasks(...a),
  getArchivedProjects: (...a: unknown[]) => getArchivedProjects(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
  syncNow: (...a: unknown[]) => syncNow(...a),
}));
vi.mock('../src/lib/discovery', async () => {
  const { writable: w } = await import('svelte/store');
  return { staleHostAlert: w(null) };
});
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
import { stack, switchTab, toast } from '../src/lib/phone/nav';
import { staleHostAlert } from '../src/lib/discovery';
import type { Writable } from 'svelte/store';
import { showError } from '../src/lib/store';
import { permissionState } from '../src/lib/notifications';

// Rows only: the glance tiles above repeat some of the same words.
const row = (c: HTMLElement, label: string) => [...c.querySelectorAll('.p-row')].find(r => r.querySelector('.p-k')?.textContent?.trim() === label) as HTMLElement;
const rowValue = (c: HTMLElement, label: string) => row(c, label).querySelector('.p-v')?.textContent ?? '';
const tile = (c: HTMLElement, label: string) => [...c.querySelectorAll('.tile')].find(t => t.querySelector('small')?.textContent === label) as HTMLElement;
const tileValue = (c: HTMLElement, label: string) => tile(c, label).querySelector('strong')!.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  switchTab('home');
  syncOn = true;
  Object.assign(syncState, { status: 'idle', lastSynced: null, error: null, conflictCount: 0 });
  getAllDeletedTasks.mockResolvedValue([{ _id: 'task:a' }, { _id: 'task:b' }, { _id: 'task:c' }]);
  getArchivedProjects.mockResolvedValue([{ _id: 'project:o' }]);
  syncNow.mockResolvedValue(undefined);
  toast.set(null);
  (staleHostAlert as Writable<{ uuid: string; name: string } | null>).set(null);
});
afterEach(cleanup);

describe('phone Settings home', () => {
  it('shows each row with its current value', async () => {
    const { container, getByText } = render(SettingsScreen);
    expect(rowValue(container, 'Appearance')).toBe('Dark');
    expect(rowValue(container, 'Reminders')).toBe('Not yet');
    expect(rowValue(container, 'App lock')).toBe('Off');
    await waitFor(() => expect(rowValue(container, 'Recycle bin')).toBe('3'));
    expect(rowValue(container, 'Archived projects')).toBe('1');
    expect(getByText('On this phone · no account')).toBeTruthy();
  });

  it('every row pushes its settings page', async () => {
    const { container } = render(SettingsScreen);
    const expected: [string, string][] = [
      ['Appearance', 'appearance'], ['Reminders', 'notifications'],
      ['App lock', 'security'], ['Spaces, tags & fields', 'organize'], ['Archived projects', 'archived'],
      ['Backup & restore', 'data'], ['Recycle bin', 'trash'], ['History', 'history'], ['Advanced', 'advanced'],
    ];
    for (const [label, page] of expected) {
      await fireEvent.click(row(container, label));
      expect(get(stack).at(-1)).toMatchObject({ k: 'set', page });
    }
  });

  it('Reminders says Not yet until Android has been asked', () => {
    permissionState.set('default');
    const { container } = render(SettingsScreen);
    expect(tileValue(container, 'Reminders')).toBe('Not yet');
  });

  it('the glance tiles show Sync, Reminders and App lock, and open their pages', async () => {
    permissionState.set('granted');
    const { container } = render(SettingsScreen);
    expect(tileValue(container, 'Reminders')).toBe('On');
    expect(tileValue(container, 'App lock')).toBe('Off');
    for (const [label, page] of [['Sync', 'sync'], ['Reminders', 'notifications'], ['App lock', 'security']]) {
      await fireEvent.click(tile(container, label));
      expect(get(stack).at(-1)).toMatchObject({ k: 'set', page });
    }
  });

  it('the Sync tile shows when it last synced; errors and conflicts show below', async () => {
    syncState.conflictCount = 2;
    syncState.lastSynced = new Date().toISOString();
    const { container, getByText } = render(SettingsScreen);
    expect(tileValue(container, 'Sync')).not.toBe('Waiting');
    expect(tile(container, 'Sync').querySelector('strong.ok')).toBeTruthy();
    expect(getByText('2 sync conflicts to resolve')).toBeTruthy();
    // A live status change reaches the card.
    syncState.status = 'error'; syncState.error = 'Server unreachable';
    syncState.listeners.forEach(fn => fn());
    await waitFor(() => expect(tileValue(container, 'Sync')).toBe('Error'));
    expect(getByText('Server unreachable')).toBeTruthy();
    await fireEvent.click(getByText('Server unreachable'));
    expect(get(stack).at(-1)).toMatchObject({ k: 'set', page: 'sync' });
  });

  it('says when sync is off, with no Sync now', () => {
    syncOn = false;
    const { container, queryByText } = render(SettingsScreen);
    expect(tileValue(container, 'Sync')).toBe('Off');
    expect(queryByText('Sync now')).toBeNull();
  });

  it('Sync now runs a sync and confirms; a failure surfaces showError', async () => {
    const { getByText } = render(SettingsScreen);
    await fireEvent.click(getByText('Sync now'));
    await waitFor(() => expect(get(toast)?.text).toBe('Synced'));
    expect(syncNow).toHaveBeenCalledWith();
    expect(get(stack)).toHaveLength(1);
    syncNow.mockRejectedValueOnce(new Error('x'));
    await fireEvent.click(getByText('Sync now'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not sync. Please try again.'));
  });

  it('a stale paired host shows on the card', async () => {
    (staleHostAlert as Writable<{ uuid: string; name: string } | null>).set({ uuid: 'u', name: 'Old PC' });
    const { getByText } = render(SettingsScreen);
    expect(getByText('Paired computer not found. Pair again')).toBeTruthy();
  });

  it('a failed count load surfaces showError', async () => {
    getAllDeletedTasks.mockRejectedValue(new Error('x'));
    render(SettingsScreen);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to load settings.'));
  });
});
