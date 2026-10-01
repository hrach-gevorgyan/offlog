import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// The settings pages reuse the desktop children, so these check the wiring
// (the right child per page, and the handlers it is handed), not every
// setting — SettingsPanel.test.ts and the children's own paths cover those.
const m = vi.hoisted(() => ({
  storedUrl: 'http://old.local:5984/offlog',
  storedCreds: { user: 'olduser', pass: 'oldpass' },
  syncState: { status: 'idle', lastSynced: null, error: null, lastErrorAt: null, conflictCount: 0, listeners: new Set<() => void>() },
}));
const setSyncUrl = vi.fn((u: string) => { m.storedUrl = u; });
const setSyncCredentials = vi.fn();
const setThemeMode = vi.fn();
const setHighContrast = vi.fn();
const setAppLockPin = vi.fn();
const syncNow = vi.fn();
vi.mock('../src/config', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    getSyncUrl: () => m.storedUrl,
    setSyncUrl: (...a: unknown[]) => setSyncUrl(...(a as [string])),
    getSyncCredentials: async () => m.storedCreds,
    setSyncCredentials: (...a: unknown[]) => setSyncCredentials(...a),
    getDeviceName: () => 'Pixel', setDeviceName: vi.fn(),
    isSyncEnabled: () => true, setSyncEnabled: vi.fn(),
    getDefaultReminderTime: () => '09:00', setDefaultReminderTime: vi.fn(),
    getWeekStartsMonday: () => true, setWeekStartsMonday: vi.fn(),
    getTimeFormat24h: () => true, setTimeFormat24h: vi.fn(),
    getQuietHours: () => ({ enabled: false, start: '22:00', end: '07:00' }), setQuietHours: vi.fn(),
    getNotificationsEnabled: () => true, setNotificationsEnabled: vi.fn(),
    getAutoUpdateCheckEnabled: () => true, setAutoUpdateCheckEnabled: vi.fn(),
    isTauri: () => false, invokeTauri: vi.fn(),
    isAppLockEnabled: () => false, setAppLockPin: (...a: unknown[]) => setAppLockPin(...a), clearAppLockPin: vi.fn(),
    getAppLockTimeoutMinutes: () => 5, setAppLockTimeoutMinutes: vi.fn(),
    getAppLockHint: () => '', isNativePlatform: () => false,
    isAppLockBiometricEnabled: () => false, setAppLockBiometricEnabled: vi.fn(),
    syncPrivacyScreen: vi.fn(),
    isHapticsEnabled: () => true, setHapticsEnabled: vi.fn(),
    isPrivacyScreenEnabled: () => false, setPrivacyScreenEnabled: vi.fn(),
    otherHostsDetected: w([]),
  };
});

const getConflicts = vi.fn();
const resolveConflict = vi.fn();
vi.mock('../src/lib/db', () => ({
  default: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
  syncState: m.syncState,
  syncNow: (...a: unknown[]) => syncNow(...a), startSync: vi.fn().mockResolvedValue(undefined), cancelSync: vi.fn(),
  importJSON: vi.fn(), analyzeImport: vi.fn(),
  exportProjectDocs: vi.fn(), exportTasksCSV: vi.fn(),
  getConflicts: (...a: unknown[]) => getConflicts(...a),
  resolveConflict: (...a: unknown[]) => resolveConflict(...a),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
  getStorageBreakdown: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockReturnValue(() => {}),
  getDeviceLastSeen: vi.fn().mockResolvedValue([]),
  runMaintenanceSteps: vi.fn(), wipeAndReseed: vi.fn(),
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return { showError: vi.fn(), modalOpen: w(false), projects: w([]) };
});
vi.mock('../src/lib/discovery', async () => {
  const { writable: w } = await import('svelte/store');
  return { discoveredHosts: w([]), isScanning: w(false), scanForHosts: vi.fn(), stopScan: vi.fn(), pairWithHost: vi.fn(), staleHostAlert: w(null) };
});
vi.mock('../src/lib/notifications', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    checkExactAlarmPermission: vi.fn(), rescheduleAll: vi.fn().mockResolvedValue(undefined), requestPermission: vi.fn(),
    permissionState: w('granted'), exactAlarmState: w('granted'), requestExactAlarmPermission: vi.fn(),
  };
});
vi.mock('../src/lib/updateChecker', async () => {
  const { writable: w } = await import('svelte/store');
  return { updateState: w({ phase: 'idle' }), showUpdateModal: w(false), checkForUpdate: vi.fn() };
});
vi.mock('../src/lib/autoBackup', () => ({
  isAutoBackupEnabled: () => true, setAutoBackupEnabled: vi.fn(),
  getLastAutoBackupAt: () => null, getAutoBackupUsage: vi.fn().mockResolvedValue(null),
}));
vi.mock('../src/lib/theme', () => ({
  getThemeMode: () => 'system', setThemeMode: (...a: unknown[]) => setThemeMode(...a),
  getHighContrast: () => false, setHighContrast: (...a: unknown[]) => setHighContrast(...a),
  getReduceMotion: () => false, setReduceMotion: vi.fn(),
  prefersReducedMotion: () => true,
}));
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({ confirmAction: (...a: unknown[]) => confirmAction(...a) }));

import SettingsPage from '../src/lib/phone/settings/SettingsPage.svelte';
import { showError } from '../src/lib/store';
import * as nav from '../src/lib/phone/nav';
import { staleHostAlert } from '../src/lib/discovery';
import { get, type Writable } from 'svelte/store';

const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));

const reload = vi.fn();

beforeEach(async () => {
  // A previous test's history.back() lands as an async popstate.
  await settle();
  nav.switchTab('home');
  await settle();
  vi.clearAllMocks();
  nav.toast.set(null);
  syncNow.mockResolvedValue(undefined);
  (staleHostAlert as Writable<{ uuid: string; name: string } | null>).set(null);
  m.storedUrl = 'http://old.local:5984/offlog';
  m.storedCreds = { user: 'olduser', pass: 'oldpass' };
  m.syncState.conflictCount = 0;
  setSyncCredentials.mockResolvedValue(undefined);
  getConflicts.mockResolvedValue([]);
  resolveConflict.mockResolvedValue(undefined);
  vi.stubGlobal('location', { reload, href: 'http://localhost/' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('phone settings pages', () => {
  it('Appearance renders the desktop child under the page title, wired to theme.ts', async () => {
    const { getByRole, getByText } = render(SettingsPage, { page: 'appearance' });
    expect(getByRole('heading', { name: 'Appearance' })).toBeTruthy();
    await fireEvent.click(getByText('Dark'));
    expect(setThemeMode).toHaveBeenCalledWith('dark');
    expect(getByText('Dark').getAttribute('aria-checked')).toBe('true');
  });

  it('App lock renders the PIN setup', () => {
    const { getByRole, getByText } = render(SettingsPage, { page: 'security' });
    expect(getByRole('heading', { name: 'App lock' })).toBeTruthy();
    expect(getByText('Set a PIN')).toBeTruthy();
  });

  it('a toggle row switches from anywhere on the row, once per tap', async () => {
    const { getByText, getByLabelText } = render(SettingsPage, { page: 'appearance' });
    await fireEvent.click(getByText('High contrast'));
    expect(setHighContrast).toHaveBeenCalledTimes(1);
    expect(setHighContrast).toHaveBeenLastCalledWith(true);
    expect(getByLabelText('Toggle high contrast').getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(getByLabelText('Toggle high contrast'));
    expect(setHighContrast).toHaveBeenCalledTimes(2);
    expect(setHighContrast).toHaveBeenLastCalledWith(false);
    // A hint below the row is not part of it.
    await fireEvent.click(getByText(/Raises border and text contrast/));
    expect(setHighContrast).toHaveBeenCalledTimes(2);
  });

  it('App lock: back cannot lose the one-time recovery code; Continue is the way out', async () => {
    setAppLockPin.mockResolvedValue({ recoveryCode: 'ABCD-EFGH-1234' });
    nav.push({ k: 'set', page: 'security' });
    const { getByText, container, queryByText, getByRole } = render(SettingsPage, { page: 'security' });
    await fireEvent.click(getByText('Set a PIN'));
    const [pin, again] = container.querySelectorAll('input[type="password"]');
    await fireEvent.input(pin, { target: { value: '1234' } });
    await fireEvent.input(again, { target: { value: '1234' } });
    await fireEvent.click(getByText('Save PIN'));
    await waitFor(() => getByText('ABCD-EFGH-1234'));
    expect(setAppLockPin).toHaveBeenCalledWith('1234', '');

    history.back();
    await settle(60);
    expect(getByText('ABCD-EFGH-1234')).toBeTruthy();
    expect(get(nav.stack)).toHaveLength(2);
    history.back();
    await settle(60);
    expect(getByText('ABCD-EFGH-1234')).toBeTruthy();
    expect(get(nav.stack)).toHaveLength(2);

    await fireEvent.click(getByRole('checkbox'));
    await fireEvent.click(getByText('Continue'));
    await waitFor(() => expect(queryByText('ABCD-EFGH-1234')).toBeNull());
    expect(get(nav.stack)).toHaveLength(2);
    // The next back is the page's own again.
    history.back();
    await waitFor(() => expect(get(nav.stack)).toHaveLength(1));
  });

  it('Sync: Sync now syncs and confirms, a failure surfaces showError; a stale paired host is shown', async () => {
    (staleHostAlert as Writable<{ uuid: string; name: string } | null>).set({ uuid: 'u', name: 'Old PC' });
    const { getByText } = render(SettingsPage, { page: 'sync' });
    expect(getByText(/“Old PC” is on this network/)).toBeTruthy();
    await fireEvent.click(getByText('Sync now'));
    await waitFor(() => expect(get(nav.toast)?.text).toBe('Synced'));
    expect(syncNow).toHaveBeenCalledWith();
    syncNow.mockRejectedValueOnce(new Error('x'));
    await fireEvent.click(getByText('Sync now'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not sync. Please try again.'));
  });

  it('an unknown page says so', () => {
    const { getByText } = render(SettingsPage, { page: 'nope' });
    expect(getByText("This page doesn't exist.")).toBeTruthy();
  });

  it('Sync: a conflict opens in a sheet and "Keep this" resolves it after confirming', async () => {
    m.syncState.conflictCount = 1;
    getConflicts.mockResolvedValue([{
      docId: 'task:a', label: 'Buy paint', type: 'task', differing: ['title'],
      versions: [
        { rev: '', isCurrent: true, isNewest: false, doc: { source: 'Pixel', title: 'Buy paint', updated_at: new Date().toISOString() } },
        { rev: '3-b', isCurrent: false, isNewest: true, doc: { source: 'PC', title: 'Buy paint now', updated_at: new Date().toISOString() } },
      ],
    }]);
    const { getByText, getAllByText } = render(SettingsPage, { page: 'sync' });
    await waitFor(() => getByText('Resolve conflicts'));
    await fireEvent.click(getByText('Resolve conflicts'));
    await waitFor(() => getByText('Buy paint now'));
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(getAllByText('Keep this')[1]);
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith('task:a', 'other', '3-b'));
  });

  it('Advanced: Save & restart sync writes the changed server, unwinds history, then reloads', async () => {
    nav.push({ k: 'settings' });
    nav.push({ k: 'set', page: 'advanced' });
    let depthAtReload = -1;
    reload.mockImplementationOnce(() => { depthAtReload = get(nav.stack).length; });
    const { container, getByText } = render(SettingsPage, { page: 'advanced' });
    const url = container.querySelector('input[placeholder^="http://192.168"]') as HTMLInputElement;
    await waitFor(() => expect(url.value).toBe('http://old.local:5984/offlog'));
    await fireEvent.input(url, { target: { value: 'http://new.local:5984/offlog' } });
    await fireEvent.click(getByText('Save & restart sync'));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(depthAtReload).toBe(1);
    expect(setSyncUrl).toHaveBeenCalledWith('http://new.local:5984/offlog');
    expect(setSyncCredentials).toHaveBeenCalledWith('olduser', 'oldpass');
  });

  it('Advanced: nothing changed goes back without writing or reloading', async () => {
    const spy = vi.spyOn(nav, 'back');
    const { getByText, container } = render(SettingsPage, { page: 'advanced' });
    const url = container.querySelector('input[placeholder^="http://192.168"]') as HTMLInputElement;
    await waitFor(() => expect(url.value).toBe('http://old.local:5984/offlog'));
    await fireEvent.click(getByText('Save & restart sync'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(setSyncUrl).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Advanced: a failed credential write surfaces showError and does not reload', async () => {
    setSyncCredentials.mockRejectedValueOnce(new Error('keystore'));
    const { container, getByText } = render(SettingsPage, { page: 'advanced' });
    const url = container.querySelector('input[placeholder^="http://192.168"]') as HTMLInputElement;
    await waitFor(() => expect(url.value).toBe('http://old.local:5984/offlog'));
    await fireEvent.input(url, { target: { value: 'http://new.local:5984/offlog' } });
    await fireEvent.click(getByText('Save & restart sync'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save sync credentials securely. Please try again.'));
    expect(reload).not.toHaveBeenCalled();
  });
});
