import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// The settings pages reuse the desktop children, so these check the wiring
// (the right child per page, and the handlers it is handed), not every
// setting — SettingsPanel.test.ts and the children's own paths cover those.
const m = vi.hoisted(() => ({
  storedUrl: 'http://old.local:5984/offlog',
  storedCreds: { user: 'olduser', pass: 'oldpass' },
  tauri: false,
  uuid: null as string | null,
  hubName: null as string | null,
  lockOn: false,
  native: false,
  share: vi.fn(),
  invokeTauri: vi.fn(),
  syncState: { status: 'idle', lastSynced: null, error: null, lastErrorAt: null, conflictCount: 0, listeners: new Set<() => void>() },
}));
const setSyncUrl = vi.fn((u: string) => { m.storedUrl = u; });
const setSyncCredentials = vi.fn();
const setSyncEnabled = vi.fn();
const clearPairedHost = vi.fn();
const setThemeMode = vi.fn();
const setHighContrast = vi.fn();
const setAppLockPin = vi.fn();
const syncNow = vi.fn();
vi.mock('@capacitor/share', () => ({ Share: { share: (...a: unknown[]) => m.share(...a) } }));
vi.mock('../src/config', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    getSyncUrl: () => m.storedUrl,
    setSyncUrl: (...a: unknown[]) => setSyncUrl(...(a as [string])),
    getSyncCredentials: async () => m.storedCreds,
    setSyncCredentials: (...a: unknown[]) => setSyncCredentials(...a),
    getDeviceName: () => 'Pixel', setDeviceName: vi.fn(),
    isSyncEnabled: () => true, setSyncEnabled: (...a: unknown[]) => setSyncEnabled(...a),
    getPairedHostUuid: () => m.uuid, getPairedHostName: () => m.hubName, clearPairedHost: () => clearPairedHost(),
    getDefaultReminderTime: () => '09:00', setDefaultReminderTime: vi.fn(),
    getWeekStartsMonday: () => true, setWeekStartsMonday: vi.fn(),
    getTimeFormat24h: () => true, setTimeFormat24h: vi.fn(),
    getQuietHours: () => ({ enabled: false, start: '22:00', end: '07:00' }), setQuietHours: vi.fn(),
    getNotificationsEnabled: () => true, setNotificationsEnabled: vi.fn(),
    getAutoUpdateCheckEnabled: () => true, setAutoUpdateCheckEnabled: vi.fn(),
    isTauri: () => m.tauri, invokeTauri: (...a: unknown[]) => m.invokeTauri(...a),
    isAppLockEnabled: () => m.lockOn, verifyAppLockPin: async (p: string) => p === '2580', setAppLockPin: (...a: unknown[]) => setAppLockPin(...a), clearAppLockPin: vi.fn(),
    getAppLockTimeoutMinutes: () => 5, setAppLockTimeoutMinutes: vi.fn(),
    getAppLockHint: () => '', isNativePlatform: () => m.native,
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
vi.mock('../src/lib/desktop/updateChecker', async () => {
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
  m.uuid = null;
  m.hubName = null;
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

  it('App lock: back cannot lose the one-time recovery code; the saved button is the way out', async () => {
    setAppLockPin.mockResolvedValue({ recoveryCode: 'ABCD-EFGH-1234' });
    nav.push({ k: 'set', page: 'security' });
    const { getByText, container, queryByText } = render(SettingsPage, { page: 'security' });
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

    expect(queryByText('Share')).toBeNull();
    await fireEvent.click(getByText("I've saved it"));
    await waitFor(() => expect(queryByText('ABCD-EFGH-1234')).toBeNull());
    expect(get(nav.stack)).toHaveLength(2);
    // The next back is the page's own again.
    history.back();
    await waitFor(() => expect(get(nav.stack)).toHaveLength(1));
  });

  it('App lock: on the phone, Share hands the recovery code to the share sheet', async () => {
    m.native = true;
    m.share.mockReset().mockResolvedValue(undefined);
    setAppLockPin.mockResolvedValue({ recoveryCode: 'SHAR-E000-1111' });
    try {
      const { getByText, container, findByRole } = render(SettingsPage, { page: 'security' });
      await fireEvent.click(getByText('Set a PIN'));
      const [pin, again] = container.querySelectorAll('input[type="password"]');
      await fireEvent.input(pin, { target: { value: '1234' } });
      await fireEvent.input(again, { target: { value: '1234' } });
      await fireEvent.click(getByText('Save PIN'));
      await fireEvent.click(await findByRole('button', { name: 'Share' }));
      await waitFor(() => expect(m.share).toHaveBeenCalledWith({ title: 'Offlog recovery code', text: 'SHAR-E000-1111' }));
      expect(getByText('SHAR-E000-1111')).toBeTruthy();
    } finally { m.native = false; }
  });

  describe('App lock is on', () => {
    beforeEach(() => { m.lockOn = true; });
    afterEach(() => { m.lockOn = false; });

    it('Lock again after opens a sheet, and picking a time saves it', async () => {
      const { getByText, findByText } = render(SettingsPage, { page: 'security' });
      await fireEvent.click(getByText('Lock again after'));
      await fireEvent.click(await findByText('15 minutes'));
      expect(cfg.setAppLockTimeoutMinutes).toHaveBeenCalledWith(15);
    });

    it('Turn off asks for the current PIN; a wrong one says so and keeps the lock', async () => {
      const { getByText, getByLabelText, findByText } = render(SettingsPage, { page: 'security' });
      await fireEvent.click(getByText('Turn off PIN lock'));
      await fireEvent.input(getByLabelText('Current PIN'), { target: { value: '1111' } });
      await fireEvent.click(getByText('Turn off'));
      expect(await findByText("That isn't your PIN.")).toBeTruthy();
      expect(cfg.clearAppLockPin).not.toHaveBeenCalled();
    });

    it('Turn off with the right PIN clears the lock', async () => {
      const { getByText, getByLabelText, findByText } = render(SettingsPage, { page: 'security' });
      await fireEvent.click(getByText('Turn off PIN lock'));
      await fireEvent.input(getByLabelText('Current PIN'), { target: { value: '2580' } });
      await fireEvent.click(getByText('Turn off'));
      await waitFor(() => expect(cfg.clearAppLockPin).toHaveBeenCalled());
      expect(await findByText('Set a PIN')).toBeTruthy();
    });
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
    await waitFor(() => expect(get(openLayers)).toBe(2));
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

    it('everything allowed: no fix-it row, the settings people use first, the off switch last', () => {
      const { getByRole, container } = render(SettingsPage, { page: 'notifications' });
      expect(container.querySelector('.perm-state')).toBeNull();
      const labels = [...container.querySelectorAll('.setting-label')].map(l => l.textContent!.trim());
      expect(labels[0]).toBe('Default time');
      expect(labels.at(-1)).toBe('Remind me about tasks');
      expect(getByRole('switch', { name: 'Remind me about tasks' }).getAttribute('aria-checked')).toBe('true');
    });

    it('not asked yet: the set-up card shows both steps, step 1 offers Allow', async () => {
      perm().set('default');
      const { getByText, container } = render(SettingsPage, { page: 'notifications' });
      expect(getByText('Set up reminders')).toBeTruthy();
      expect(container.querySelectorAll('.step')).toHaveLength(2);
      expect(container.querySelectorAll('.step.done')).toHaveLength(1);
      await fireEvent.click(getByText('Allow'));
      expect(notif.requestPermission).toHaveBeenCalledTimes(1);
    });

    it('blocked: step 1 says so and asks again', async () => {
      perm().set('denied');
      const { getByText } = render(SettingsPage, { page: 'notifications' });
      expect(getByText(/Android is blocking them right now/)).toBeTruthy();
      await fireEvent.click(getByText('Allow'));
      expect(notif.requestPermission).toHaveBeenCalledTimes(1);
    });

    it('allowed but not exact: step 1 is ticked, step 2 offers Turn on', async () => {
      exact().set('denied');
      const { getByText, container } = render(SettingsPage, { page: 'notifications' });
      expect(container.querySelector('.step.done')?.textContent).toContain('Let reminders pop up');
      await fireEvent.click(getByText('Turn on'));
      expect(notif.requestExactAlarmPermission).toHaveBeenCalledTimes(1);
    });

    it('both missing: both steps show with their own buttons, in one card', () => {
      perm().set('denied'); exact().set('denied');
      const { getByText, container } = render(SettingsPage, { page: 'notifications' });
      expect(container.querySelectorAll('.setup')).toHaveLength(1);
      expect(getByText('Allow')).toBeTruthy();
      expect(getByText('Turn on')).toBeTruthy();
    });
  });

  it('Backup: back up, restore and export are rows in that order, with no counts line', () => {
    const { container } = render(SettingsPage, { page: 'data' });
    const labels = [...container.querySelectorAll('.bk .p-row')].map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Back up now', 'What to include: Everything', 'Restore from a file', 'Export as spreadsheet']);
    expect(container.textContent).not.toContain('in history');
  });

  it('Backup: Restore from a file asks for a file, and a wrong one says so on the row', async () => {
    let picker: HTMLInputElement | null = null;
    const make = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = make(tag);
      if (tag === 'input') { picker = el as HTMLInputElement; picker.click = () => {}; }
      return el;
    }) as typeof document.createElement);
    try {
      const { getByRole } = render(SettingsPage, { page: 'data' });
      await fireEvent.click(getByRole('button', { name: 'Restore from a file' }));
      expect(picker!.accept).toBe('.json,application/json');
      Object.defineProperty(picker!, 'files', { value: [new File(['not json'], 'x.json')] });
      await picker!.onchange!(new Event('change'));
      await waitFor(() => expect(getByRole('button', { name: 'Restore from a file' }).textContent).toContain("That doesn't look like an Offlog backup file."));
    } finally { spy.mockRestore(); }
  });

  it('Backup on the phone: the daily safety copy switch says when the last one was made', async () => {
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    m.native = true;
    try {
      const { getByRole } = render(SettingsPage, { page: 'data' });
      const sw = getByRole('switch', { name: 'Daily safety copy' });
      expect(sw.textContent).toContain('Keeps the last 7 on this phone');
    } finally { m.native = false; delete (window as { Capacitor?: unknown }).Capacitor; }
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
      await fireEvent.click(r.getByText('Check and repair'));
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
      await fireEvent.click(getByText('Check and repair'));
      await fireEvent.click(getByText('Run'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Maintenance failed partway through. Please try again.'));
      expect(getByText('Failed — please try again')).toBeTruthy();
    });
  });

  describe('Own server', () => {
    const field = (c: HTMLElement, label: string) => [...c.querySelectorAll('label.fld')].find(l => l.textContent!.startsWith(label))!.querySelector('input') as HTMLInputElement;

    it('in use: shows it filled in; Save writes the change, forgets the computer, unwinds history, then reloads', async () => {
      nav.push({ k: 'settings' });
      nav.push({ k: 'set', page: 'server' });
      let depthAtReload = -1;
      reload.mockImplementationOnce(() => { depthAtReload = get(nav.stack).length; });
      const { container, getByText } = render(SettingsPage, { page: 'server' });
      await waitFor(() => expect(field(container, 'Username').value).toBe('olduser'));
      expect(field(container, 'Address').value).toBe('http://old.local:5984/offlog');
      expect(getByText('Stop using it')).toBeTruthy();
      await fireEvent.input(field(container, 'Address'), { target: { value: ' http://new.local:5984/offlog ' } });
      await fireEvent.click(getByText('Save and connect'));
      await waitFor(() => expect(reload).toHaveBeenCalled());
      expect(depthAtReload).toBe(1);
      expect(setSyncUrl).toHaveBeenCalledWith('http://new.local:5984/offlog');
      expect(setSyncCredentials).toHaveBeenCalledWith('olduser', 'oldpass');
      expect(clearPairedHost).toHaveBeenCalled();
      expect(setSyncEnabled).toHaveBeenCalledWith(true);
    });

    it('nothing changed goes back without writing or reloading', async () => {
      const spy = vi.spyOn(nav, 'back');
      const { getByText, container } = render(SettingsPage, { page: 'server' });
      await waitFor(() => expect(field(container, 'Username').value).toBe('olduser'));
      await fireEvent.click(getByText('Save and connect'));
      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(setSyncUrl).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('an address without http:// is refused with a reason', async () => {
      const { getByText, container, getByRole } = render(SettingsPage, { page: 'server' });
      await fireEvent.input(field(container, 'Address'), { target: { value: 'my-server:5984' } });
      await fireEvent.click(getByText('Save and connect'));
      expect(getByRole('alert').textContent).toBe('Enter the full address, starting with http:// or https://');
      expect(setSyncUrl).not.toHaveBeenCalled();
    });

    it('a failed credential write surfaces showError and does not reload', async () => {
      setSyncCredentials.mockRejectedValueOnce(new Error('keystore'));
      const { container, getByText } = render(SettingsPage, { page: 'server' });
      await waitFor(() => expect(field(container, 'Username').value).toBe('olduser'));
      await fireEvent.input(field(container, 'Address'), { target: { value: 'http://new.local:5984/offlog' } });
      await fireEvent.click(getByText('Save and connect'));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not save sync credentials securely. Please try again.'));
      expect(setSyncUrl).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('paired with a computer: not in use, empty, and says what saving would replace', () => {
      m.uuid = 'u1'; m.hubName = 'Office PC';
      const { container, getByText, queryByText } = render(SettingsPage, { page: 'server' });
      expect(getByText('Not in use')).toBeTruthy();
      expect(getByText('This phone syncs with Office PC. Saving a server here replaces it.')).toBeTruthy();
      expect(field(container, 'Address').value).toBe('');
      expect(queryByText('Stop using it')).toBeNull();
    });

    it('Stop using it asks first, then clears the server and reloads', async () => {
      confirmAction.mockResolvedValueOnce(false);
      const { getByText } = render(SettingsPage, { page: 'server' });
      await fireEvent.click(getByText('Stop using it'));
      await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
      expect(setSyncUrl).not.toHaveBeenCalled();
      confirmAction.mockResolvedValueOnce(true);
      await fireEvent.click(getByText('Stop using it'));
      await waitFor(() => expect(reload).toHaveBeenCalled());
      expect(setSyncCredentials).toHaveBeenCalledWith('', '');
      expect(setSyncUrl).toHaveBeenCalledWith('');
    });
  });

  describe('Advanced', () => {
    it('Own server and Privacy open their pages', async () => {
      nav.push({ k: 'set', page: 'advanced' });
      const { getByText } = render(SettingsPage, { page: 'advanced' });
      expect(getByText('In use')).toBeTruthy();
      await fireEvent.click(getByText('Own server'));
      expect(get(nav.stack).at(-1)).toMatchObject({ k: 'set', page: 'server' });
      await fireEvent.click(getByText('Privacy'));
      expect(get(nav.stack).at(-1)).toMatchObject({ k: 'set', page: 'privacy' });
    });

    it('a paired phone shows Own server as not used, naming the computer', () => {
      m.uuid = 'u1'; m.hubName = 'Office PC';
      const { getByText } = render(SettingsPage, { page: 'advanced' });
      expect(getByText('Not used · syncing with Office PC')).toBeTruthy();
    });

    it('Storage used counts every task and attachment', async () => {
      vi.mocked(db.getStorageBreakdown).mockResolvedValueOnce({ activeTasks: 1200, archivedTasks: 30, deletedTasks: 10, logEntries: 9, attachmentCount: 1, attachmentBytes: 5 } as never);
      const { findByText } = render(SettingsPage, { page: 'advanced' });
      expect(await findByText(/^1.?240 tasks · 1 attachment$/)).toBeTruthy();
    });

    it('Source code opens the repository in a new tab', async () => {
      const open = vi.fn();
      vi.stubGlobal('open', open);
      const { getByText } = render(SettingsPage, { page: 'advanced' });
      await fireEvent.click(getByText('Source code'));
      await waitFor(() => expect(open).toHaveBeenCalledWith('https://github.com/hrach-gevorgyan/offlog', '_blank', 'noopener'));
    });

    it('Privacy lists the short version and links the full policy', async () => {
      const open = vi.fn();
      vi.stubGlobal('open', open);
      const { getByText } = render(SettingsPage, { page: 'privacy' });
      expect(getByText('Nothing is collected')).toBeTruthy();
      await fireEvent.click(getByText('Full privacy policy'));
      await waitFor(() => expect(open).toHaveBeenCalledWith('https://github.com/hrach-gevorgyan/offlog/blob/main/docs/privacy.md', '_blank', 'noopener'));
    });
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
    await fireEvent.click(getByRole('button', { name: 'What to include: Everything' }));
    await fireEvent.click(await findByText('Kitchen'));
    await waitFor(() => getByRole('button', { name: 'What to include: Kitchen' }));
    await fireEvent.click(getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(db.exportProjectDocs).toHaveBeenCalledWith('project:p1'));
    (projects as unknown as Writable<unknown[]>).set([]);
  });

  it('Reminders: the default time opens the time sheet, and Done saves the picked time', async () => {
    const { getByText, findByRole } = render(SettingsPage, { page: 'notifications' });
    await fireEvent.click(getByText('Default time'));
    const hours = await findByRole('spinbutton', { name: 'Hour' });
    await fireEvent.keyDown(hours, { key: 'ArrowUp' });
    await fireEvent.keyDown(hours, { key: 'ArrowUp' });
    const mins = await findByRole('spinbutton', { name: 'Minute' });
    await fireEvent.click([...mins.querySelectorAll('button')].find(b => b.textContent === '30')!);
    await fireEvent.click(getByText('Done'));
    expect(cfg.setDefaultReminderTime).toHaveBeenCalledWith('07:30');
  });

  it('Backup: a failed back up surfaces showError', async () => {
    vi.mocked(db.default.allDocs).mockRejectedValueOnce(new Error('x'));
    const { getByRole } = render(SettingsPage, { page: 'data' });
    await fireEvent.click(getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not back up. Please try again.'));
  });

  it('Backup: a failed CSV export surfaces showError', async () => {
    vi.mocked(db.exportTasksCSV).mockRejectedValueOnce(new Error('x'));
    const { getByRole } = render(SettingsPage, { page: 'data' });
    await fireEvent.click(getByRole('button', { name: 'Export as spreadsheet' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not export CSV. Please try again.'));
  });

});
