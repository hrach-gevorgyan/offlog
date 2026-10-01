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
    isAppLockEnabled: () => false, setAppLockPin: vi.fn(), clearAppLockPin: vi.fn(),
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
  syncNow: vi.fn(), startSync: vi.fn().mockResolvedValue(undefined), cancelSync: vi.fn(),
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
  return { discoveredHosts: w([]), isScanning: w(false), scanForHosts: vi.fn(), stopScan: vi.fn(), pairWithHost: vi.fn() };
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
  getHighContrast: () => false, setHighContrast: vi.fn(),
  getReduceMotion: () => false, setReduceMotion: vi.fn(),
  prefersReducedMotion: () => true,
}));
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({ confirmAction: (...a: unknown[]) => confirmAction(...a) }));

import SettingsPage from '../src/lib/phone/settings/SettingsPage.svelte';
import { showError } from '../src/lib/store';
import * as nav from '../src/lib/phone/nav';

const reload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
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

  it('Organize offers spaces, tags, custom fields and archived projects', () => {
    const { getByText } = render(SettingsPage, { page: 'organize' });
    for (const t of ['Spaces', 'Tags', 'Custom Fields', 'Archived Projects']) expect(getByText(t)).toBeTruthy();
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

  it('Advanced: Save & restart sync writes the changed server and reloads', async () => {
    const { container, getByText } = render(SettingsPage, { page: 'advanced' });
    const url = container.querySelector('input[placeholder^="http://192.168"]') as HTMLInputElement;
    await waitFor(() => expect(url.value).toBe('http://old.local:5984/offlog'));
    await fireEvent.input(url, { target: { value: 'http://new.local:5984/offlog' } });
    await fireEvent.click(getByText('Save & restart sync'));
    await waitFor(() => expect(reload).toHaveBeenCalled());
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
