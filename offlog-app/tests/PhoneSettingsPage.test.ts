import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// The settings pages reuse the desktop children, so these check the wiring
// (the right child per page, and the handlers it is handed), not every
// setting — SettingsPanel.test.ts and the children's own paths cover those.
const m = vi.hoisted(() => ({
  storedUrl: 'http://old.local:5984/offlog',
  storedCreds: { user: 'olduser', pass: 'oldpass' },
  tauri: false,
  invokeTauri: vi.fn(),
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
    isTauri: () => m.tauri, invokeTauri: (...a: unknown[]) => m.invokeTauri(...a),
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

const runMaintenanceSteps = vi.fn();
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
  runMaintenanceSteps: (...a: unknown[]) => runMaintenanceSteps(...a), wipeAndReseed: vi.fn(),
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
import { showError, projects } from '../src/lib/store';
import * as cfg from '../src/config';
import * as nav from '../src/lib/phone/nav';
import { get, type Writable } from 'svelte/store';
import * as notif from '../src/lib/notifications';
import * as db from '../src/lib/db';
import { openLayers } from '../src/lib/modalStack';

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
  m.storedUrl = 'http://old.local:5984/offlog';
  m.storedCreds = { user: 'olduser', pass: 'oldpass' };
  m.syncState.conflictCount = 0;
  m.tauri = false;
  m.invokeTauri.mockResolvedValue(undefined);
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

  it('App lock: a jump away while the recovery code is up leaves no history layer behind', async () => {
    setAppLockPin.mockResolvedValue({ recoveryCode: 'WXYZ-0000-9999' });
    nav.push({ k: 'set', page: 'security' });
    const { getByText, container } = render(SettingsPage, { page: 'security' });
    await fireEvent.click(getByText('Set a PIN'));
    const [pin, again] = container.querySelectorAll('input[type="password"]');
    await fireEvent.input(pin, { target: { value: '1234' } });
    await fireEvent.input(again, { target: { value: '1234' } });
    await fireEvent.click(getByText('Save PIN'));
    await waitFor(() => getByText('WXYZ-0000-9999'));
    expect(get(openLayers)).toBe(2);
    // The page is still mounted (as during its exit animation) when the guard's
    // deferred re-arm runs.
    nav.navigate('agenda');
    await settle(60);
    expect(get(openLayers)).toBe(0);
  });

  describe('Notifications', () => {
    const perm = () => notif.permissionState as unknown as Writable<string>;
    const exact = () => notif.exactAlarmState as unknown as Writable<string>;
    beforeEach(() => { (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => 'android' }; });
    afterEach(() => { delete (window as { Capacitor?: unknown }).Capacitor; perm().set('granted'); exact().set('granted'); });

    it('everything granted: one Reminders switch and no warning or explainer', () => {
      const { getByRole, container } = render(SettingsPage, { page: 'notifications' });
      expect(getByRole('switch', { name: 'Reminders' })).toBeTruthy();
      expect(container.querySelector('.setting-hint-warn')).toBeNull();
      expect(container.textContent).not.toContain('Android 12');
      expect(container.textContent).toContain('Default reminder time');
    });

    it('exact alarms off: its row warns and the button opens the system setting', async () => {
      exact().set('denied');
      const { getByText, container } = render(SettingsPage, { page: 'notifications' });
      expect(container.querySelector('.perm-state.warn')?.textContent).toContain('May arrive a few minutes late');
      await fireEvent.click(getByText('Make exact'));
      expect(notif.requestExactAlarmPermission).toHaveBeenCalledTimes(1);
    });

    it('both grants missing: both rows show, each with its own button', async () => {
      perm().set('denied'); exact().set('denied');
      const { getByText, container } = render(SettingsPage, { page: 'notifications' });
      expect(container.querySelectorAll('.perm-state.warn')).toHaveLength(2);
      expect(getByText('Allow')).toBeTruthy();
      expect(getByText('Make exact')).toBeTruthy();
    });

    it('notifications blocked: the warning row asks again', async () => {
      perm().set('denied');
      const { getByText } = render(SettingsPage, { page: 'notifications' });
      expect(getByText('Blocked in Android settings')).toBeTruthy();
      await fireEvent.click(getByText('Allow'));
      expect(notif.requestPermission).toHaveBeenCalledTimes(1);
    });
  });

  it('Backup: the actions come first and the counts are one line', async () => {
    vi.mocked(db.getStorageBreakdown).mockResolvedValueOnce({ activeTasks: 48, archivedTasks: 2, deletedTasks: 4, logEntries: 95, attachmentCount: 0, attachmentBytes: 0 } as never);
    const { container, getByText } = render(SettingsPage, { page: 'data' });
    await waitFor(() => getByText('48 tasks · 4 in bin · 95 history'));
    const labels = [...container.querySelectorAll('.pset button')].map(b => b.textContent!.trim() || b.getAttribute('aria-label'));
    expect(labels.indexOf('Back up')).toBeLessThan(labels.indexOf('Restore'));
    expect(labels.indexOf('Back up')).toBe(1); // after the scope picker only
    expect(labels.indexOf('Restore')).toBe(2);
    expect(container.textContent).not.toContain('well within limits');
  });

  it('an unknown page says so', () => {
    const { getByText } = render(SettingsPage, { page: 'nope' });
    expect(getByText("This page doesn't exist.")).toBeTruthy();
  });

  // The run asks before repair inside the sheet, never through a dialog on top of it.
  describe('Advanced: maintenance', () => {
    const issues = [
      { type: 'orphaned_task', docId: 'task:x', description: 'x' },
      { type: 'no_columns', docId: 'project:y', description: 'Project Y has no statuses' },
    ];
    let answer: Promise<boolean> | null;
    beforeEach(() => {
      answer = null;
      runMaintenanceSteps.mockImplementation(async (onStep: (r: unknown) => void, opts: { confirmRepair: (i: unknown[]) => Promise<boolean> }) => {
        onStep({ key: 'check', status: 'running', note: '' });
        onStep({ key: 'check', status: 'done', note: '2 issues found' });
        answer = opts.confirmRepair(issues);
        const ok = await answer;
        onStep({ key: 'repair', status: ok ? 'done' : 'skipped', note: ok ? 'Fixed 1, 1 need manual review' : 'Skipped — not confirmed' });
        return { remainingIssues: ok ? [issues[1]] : issues, cancelled: false };
      });
    });
    async function openAndRun() {
      nav.push({ k: 'set', page: 'advanced' });
      const r = render(SettingsPage, { page: 'advanced' });
      await fireEvent.click(r.getByText('Run maintenance'));
      await fireEvent.click(r.getByText('Run'));
      await waitFor(() => r.getByText('Found 2 problems'));
      return r;
    }

    it('shows the problems in the sheet; Repair answers yes', async () => {
      const { getByText, queryByText, getByRole } = await openAndRun();
      expect(getByText('Check data')).toBeTruthy();
      expect(getByText('1 task in a missing project')).toBeTruthy();
      expect(getByText('1 project with no statuses · needs your review')).toBeTruthy();
      expect(confirmAction).not.toHaveBeenCalled();
      await fireEvent.click(getByRole('button', { name: 'Repair' }));
      await expect(answer).resolves.toBe(true);
      await waitFor(() => getByText('Fixed 1, 1 need manual review'));
      expect(queryByText('Found 2 problems')).toBeNull();
      expect(getByText('Project Y has no statuses')).toBeTruthy();
      expect(getByText('Run again')).toBeTruthy();
    });

    it('Skip answers no', async () => {
      const { getByText } = await openAndRun();
      await fireEvent.click(getByText('Skip'));
      await expect(answer).resolves.toBe(false);
      await waitFor(() => getByText('Skipped — not confirmed'));
    });

    it('closing the sheet mid-question skips the repair', async () => {
      await openAndRun();
      history.back();
      await expect(answer).resolves.toBe(false);
    });

    it('a failed run marks the step and surfaces showError', async () => {
      runMaintenanceSteps.mockImplementationOnce(async (onStep: (r: unknown) => void) => {
        onStep({ key: 'check', status: 'running', note: '' });
        throw new Error('x');
      });
      const { getByText } = render(SettingsPage, { page: 'advanced' });
      await fireEvent.click(getByText('Run maintenance'));
      await fireEvent.click(getByText('Run'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Maintenance failed partway through. Please try again.'));
      expect(getByText('Failed — please try again')).toBeTruthy();
    });
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

  it('App lock: a failed PIN save says so in the form and does not turn the lock on', async () => {
    setAppLockPin.mockRejectedValueOnce(new Error('keystore'));
    const { getByText, container } = render(SettingsPage, { page: 'security' });
    await fireEvent.click(getByText('Set a PIN'));
    const [pin, again] = container.querySelectorAll('input[type="password"]');
    await fireEvent.input(pin, { target: { value: '1234' } });
    await fireEvent.input(again, { target: { value: '1234' } });
    await fireEvent.click(getByText('Save PIN'));
    await waitFor(() => expect(getByText('Could not save PIN. Please try again.')).toBeTruthy());
    expect(setAppLockPin).toHaveBeenCalledWith('1234', '');
    expect(getByText('Save PIN')).toBeTruthy();
  });

  it('Backup: the scope opens a sheet, and picking a project backs up only that project', async () => {
    (projects as unknown as Writable<{ _id: string; name: string }[]>).set([{ _id: 'project:p1', name: 'Kitchen' }]);
    const { getByRole, findByText } = render(SettingsPage, { page: 'data' });
    await fireEvent.click(getByRole('button', { name: 'What to back up: Everything' }));
    await fireEvent.click(await findByText('Kitchen'));
    await waitFor(() => getByRole('button', { name: 'What to back up: Kitchen' }));
    await fireEvent.click(getByRole('button', { name: 'Back up' }));
    await waitFor(() => expect(db.exportProjectDocs).toHaveBeenCalledWith('project:p1'));
    (projects as unknown as Writable<unknown[]>).set([]);
  });

  it('Notifications: the default time row saves the time the system dialog returns', async () => {
    const { getByLabelText } = render(SettingsPage, { page: 'notifications' });
    await fireEvent.change(getByLabelText('Default reminder time'), { target: { value: '07:30' } });
    expect(cfg.setDefaultReminderTime).toHaveBeenCalledWith('07:30');
  });

  it('Backup: a failed back up surfaces showError', async () => {
    vi.mocked(db.default.allDocs).mockRejectedValueOnce(new Error('x'));
    const { getByRole } = render(SettingsPage, { page: 'data' });
    await fireEvent.click(getByRole('button', { name: 'Back up' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to back up. Please try again.'));
  });

  it('Backup: a failed CSV export surfaces showError', async () => {
    vi.mocked(db.exportTasksCSV).mockRejectedValueOnce(new Error('x'));
    const { getByRole } = render(SettingsPage, { page: 'data' });
    await fireEvent.click(getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to export CSV. Please try again.'));
  });

  it('Advanced (debug desktop build): a failed test-data reset surfaces showError and wipes no server', async () => {
    m.tauri = true;
    m.invokeTauri.mockImplementation(async (cmd: string) => (cmd === 'is_debug_build' ? true : undefined));
    confirmAction.mockResolvedValueOnce(true);
    vi.mocked(db.wipeAndReseed).mockRejectedValueOnce(new Error('x'));
    const { findByText } = render(SettingsPage, { page: 'advanced' });
    await fireEvent.click(await findByText('Reset test data'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to reset test data.'));
    expect(db.wipeAndReseed).toHaveBeenCalled();
    expect(m.invokeTauri).not.toHaveBeenCalledWith('reset_sync_data');
    expect((await findByText('Reset test data')).closest('button')!.disabled).toBe(false);
  });
});
