import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { writable } from 'svelte/store';

// SettingsPanel pulls in config, db, discovery, notifications and the
// update checker just to mount. All mocked so this stays a component test
// of saveSettings()' decision logic — what it writes, and what it refuses
// to do when the secure-storage write fails.
let storedUrl = 'http://old.local:5984/offlog';
let storedCreds = { user: 'olduser', pass: 'oldpass' };

const setSyncUrl = vi.fn((u: string) => { storedUrl = u; });
const setSyncCredentials = vi.fn().mockResolvedValue(undefined);
const getSyncCredentials = vi.fn().mockImplementation(async () => storedCreds);

vi.mock('../src/config', () => ({
  getSyncUrl: () => storedUrl,
  setSyncUrl: (...a: unknown[]) => setSyncUrl(...(a as [string])),
  getSyncCredentials: (...a: unknown[]) => getSyncCredentials(...a),
  setSyncCredentials: (...a: unknown[]) => setSyncCredentials(...a),
  getDeviceName: () => 'PC', setDeviceName: vi.fn(),
  isSyncEnabled: () => true, setSyncEnabled: vi.fn(),
  getDefaultReminderTime: () => '09:00', setDefaultReminderTime: vi.fn(),
  getWeekStartsMonday: () => true, setWeekStartsMonday: vi.fn(),
  getTimeFormat24h: () => true, setTimeFormat24h: vi.fn(),
  getQuietHours: () => ({ enabled: false, from: '22:00', to: '07:00' }), setQuietHours: vi.fn(),
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
  otherHostsDetected: writable([]),
}));

vi.mock('../src/lib/db', () => ({
  default: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
  syncState: { status: 'idle', error: null, listeners: new Set() },
  syncNow: vi.fn(), startSync: vi.fn(), cancelSync: vi.fn(),
  importJSON: vi.fn(), analyzeImport: vi.fn(),
  exportProjectDocs: vi.fn().mockResolvedValue([]),
  exportTasksCSV: vi.fn().mockResolvedValue(''),
  getConflicts: vi.fn().mockResolvedValue([]), resolveConflict: vi.fn(),
  getStorageBreakdown: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockReturnValue({ cancel: vi.fn() }),
  getDeviceLastSeen: vi.fn().mockResolvedValue([]),
  runMaintenanceSteps: vi.fn(), wipeAndReseed: vi.fn(),
}));

const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  showError: (...a: unknown[]) => showError(...a),
  modalOpen: writable(false),
  projects: writable([]),
}));

vi.mock('../src/lib/discovery', () => ({
  discoveredHosts: writable([]), isScanning: writable(false),
  scanForHosts: vi.fn(), stopScan: vi.fn(), pairWithHost: vi.fn(),
}));

vi.mock('../src/lib/notifications', () => ({
  checkExactAlarmPermission: vi.fn().mockResolvedValue(undefined),
  rescheduleAll: vi.fn(),
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

vi.mock('../src/lib/updateChecker', () => ({
  updateState: writable({ status: 'idle' }),
  showUpdateModal: writable(false),
  checkForUpdate: vi.fn(),
}));

vi.mock('../src/lib/autoBackup', () => ({
  isAutoBackupEnabled: () => true, setAutoBackupEnabled: vi.fn(),
  getLastAutoBackupAt: () => null,
}));

vi.mock('../src/lib/theme', () => ({
  getThemeMode: () => 'system', setThemeMode: vi.fn(),
  getHighContrast: () => false, setHighContrast: vi.fn(),
  getReduceMotion: () => false, setReduceMotion: vi.fn(),
}));

import SettingsPanel from '../src/lib/SettingsPanel.svelte';

// saveSettings() calls location.reload() after a sync change; jsdom has no
// navigation, so it is stubbed and asserted on instead.
const reload = vi.fn();

// The sync URL/credential fields live in the Advanced tab; the Sync tab
// carries pairing and device name. saveSettings() serves both.
async function openAdvancedTab(container: HTMLElement) {
  const nav = [...container.querySelectorAll('.nav-item')]
    .find(b => /Advanced/i.test((b as HTMLElement).textContent!)) as HTMLButtonElement;
  await fireEvent.click(nav);
  return nav;
}

const saveButton = (container: HTMLElement) =>
  container.querySelector('.save-btn') as HTMLButtonElement;

const urlInput = (container: HTMLElement) =>
  container.querySelector('input[placeholder^="http://192.168"]') as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  storedUrl = 'http://old.local:5984/offlog';
  storedCreds = { user: 'olduser', pass: 'oldpass' };
  vi.stubGlobal('location', { reload, href: 'http://localhost/' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SettingsPanel sync save', () => {
  it('writes nothing and does not reload when nothing changed', async () => {
    const { container } = render(SettingsPanel, { initialCategory: 'advanced' });
    await openAdvancedTab(container);

    await fireEvent.click(saveButton(container));

    expect(setSyncUrl).not.toHaveBeenCalled();
    expect(setSyncCredentials).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('persists a changed sync URL and reloads to restart replication', async () => {
    const { container } = render(SettingsPanel, { initialCategory: 'advanced' });
    await openAdvancedTab(container);

    const input = urlInput(container);
    await fireEvent.input(input, { target: { value: 'http://new.local:5984/offlog' } });
    await fireEvent.click(saveButton(container));

    expect(setSyncUrl).toHaveBeenCalledWith('http://new.local:5984/offlog');
    expect(setSyncCredentials).toHaveBeenCalledWith('olduser', 'oldpass');
    expect(reload).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  // The credential write is the one step that can fail on a real device
  // (DPAPI/Keystore). Reloading anyway would drop the user into a sync
  // that cannot authenticate, with no indication why.
  it('surfaces an error and does NOT reload when the credential write fails', async () => {
    setSyncCredentials.mockRejectedValueOnce(new Error('keystore unavailable'));
    const { container } = render(SettingsPanel, { initialCategory: 'advanced' });
    await openAdvancedTab(container);

    const input = urlInput(container);
    await fireEvent.input(input, { target: { value: 'http://new.local:5984/offlog' } });
    await fireEvent.click(saveButton(container));

    expect(showError).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  // A secure-storage *read* failure must not wedge the panel: the save
  // falls through treating it as "nothing stored yet".
  it('still saves when the stored credentials cannot be read back', async () => {
    const { container } = render(SettingsPanel, { initialCategory: 'advanced' });
    await openAdvancedTab(container);
    // queued after mount, so it lands on saveSettings' read rather than the
    // one onMount performs
    getSyncCredentials.mockRejectedValueOnce(new Error('read failed'));

    await fireEvent.click(saveButton(container));

    expect(setSyncUrl).toHaveBeenCalled();
    expect(setSyncCredentials).toHaveBeenCalled();
  });
});
