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

const getConflicts = vi.fn().mockResolvedValue([]);
const getDeviceLastSeen = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/db', () => ({
  default: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
  __esModule: true,
  syncState: { status: 'idle', error: null, listeners: new Set() },
  syncNow: vi.fn(), startSync: vi.fn(), cancelSync: vi.fn(),
  importJSON: vi.fn(), analyzeImport: vi.fn(),
  exportProjectDocs: vi.fn().mockResolvedValue([]),
  exportTasksCSV: vi.fn().mockResolvedValue(''),
  getConflicts: (...a: unknown[]) => getConflicts(...a), resolveConflict: vi.fn(),
  // loadConflicts() resolves custom-field ids to names for the diff.
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
  getStorageBreakdown: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockReturnValue({ cancel: vi.fn() }),
  getDeviceLastSeen: (...a: unknown[]) => getDeviceLastSeen(...a),
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
  // loadBreakdown() reads this for the storage section. Omitting it left an
  // unhandled rejection that every test still "passed" through -- the exact
  // shape CLAUDE.md warns about: judge the run by its exit code.
  getAutoBackupUsage: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/lib/theme', () => ({
  getThemeMode: () => 'system', setThemeMode: vi.fn(),
  getHighContrast: () => false, setHighContrast: vi.fn(),
  getReduceMotion: () => false, setReduceMotion: vi.fn(),
  // motion.ts reads this to decide whether to zero every duration, and the
  // panel now animates on mount -- so it is called as soon as this component
  // renders, not only when a transition happens to run.
  prefersReducedMotion: () => false,
}));

import dbDefault from '../src/lib/db';
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

// Escape has a growing list of in-panel sub-flows it must back out of
// instead of closing the whole modal (the connect/conflicts/maintenance
// modals, the import preview) -- the PIN entry form was missing from that
// list, so Escape fell through to the final `else requestClose()` and
// closed all of Settings mid-PIN-entry instead of just dismissing the form.
describe('SettingsPanel Escape key', () => {
  it('backs out of the PIN entry form without closing the whole panel', async () => {
    const { container, getByText, queryByText, getByLabelText } =
      render(SettingsPanel, { initialCategory: 'security' });

    await fireEvent.click(getByText('Set a PIN'));
    expect(getByLabelText(/New PIN/i)).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(queryByText(/New PIN/i)).toBeNull();
    // Settings itself is still open -- its nav (e.g. the Security tab
    // button) is still in the document, not torn down by a close.
    expect(container.querySelector('.nav-item')).toBeTruthy();
  });
});

// doBackup() is the Back up button's handler. Its options are the whole
// reason a backup is restorable: without `attachments: true, binary: false`
// each attachment serialises as a {stub:true} placeholder with no bytes, and
// PouchDB then rejects the entire restore batch on missing_stub — taking
// every unrelated space, project and task down with one attached file.
describe('SettingsPanel backup export', () => {
  it('exports with attachment bytes inlined, not as stubs', async () => {
    const { container } = render(SettingsPanel, { initialCategory: 'data' });
    const nav = [...container.querySelectorAll('.nav-item')]
      .find(b => /Backup/i.test((b as HTMLElement).textContent!)) as HTMLButtonElement;
    await fireEvent.click(nav);

    const backup = [...container.querySelectorAll('button')]
      .find(b => b.textContent!.trim() === 'Back up') as HTMLButtonElement;
    expect(backup).toBeTruthy();
    await fireEvent.click(backup);

    expect(vi.mocked(dbDefault.allDocs)).toHaveBeenCalledWith(
      expect.objectContaining({ include_docs: true, attachments: true, binary: false }),
    );
  });
});

// allDocs rows are not guaranteed to carry a doc — a deletion tombstone
// arrives as a row with none. Reading _id off it threw mid-backup, so one
// tombstone could take the whole Back up action down.
describe('SettingsPanel backup with a docless row', () => {
  it('skips a row that carries no doc instead of failing the backup', async () => {
    vi.mocked(dbDefault.allDocs).mockResolvedValueOnce({
      rows: [
        { id: 'task:1', key: 'task:1', value: { rev: '1-a' }, doc: { _id: 'task:1', type: 'task' } },
        { id: 'task:gone', key: 'task:gone', value: { rev: '2-b', deleted: true } }, // no doc
        { id: '_design/x', key: '_design/x', value: { rev: '1-c' }, doc: { _id: '_design/x' } },
      ],
    } as never);

    const { container } = render(SettingsPanel, { initialCategory: 'data' });
    const nav = [...container.querySelectorAll('.nav-item')]
      .find(b => /Backup/i.test((b as HTMLElement).textContent!)) as HTMLButtonElement;
    await fireEvent.click(nav);
    const backup = [...container.querySelectorAll('button')]
      .find(b => b.textContent!.trim() === 'Back up') as HTMLButtonElement;

    await fireEvent.click(backup);

    // the failure mode was a thrown TypeError surfacing as this toast
    expect(showError).not.toHaveBeenCalled();
  });
});

// handleImport() builds its own <input type=file> and reads the picked file.
// The catch has to report a parse failure rather than let it escape — a
// thrown rejection here would leave the panel silently stuck.
describe('SettingsPanel restore file errors', () => {
  it('reports an unparseable file instead of throwing', async () => {
    const real = document.createElement.bind(document);
    let picked: HTMLInputElement | null = null;
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = real(tag) as HTMLElement;
      if (tag === 'input') { picked = el as HTMLInputElement; (el as HTMLInputElement).click = () => {}; }
      return el;
    }) as never);

    const { container } = render(SettingsPanel, { initialCategory: 'data' });
    const nav = [...container.querySelectorAll('.nav-item')]
      .find(b => /Backup/i.test((b as HTMLElement).textContent!)) as HTMLButtonElement;
    await fireEvent.click(nav);
    const choose = [...container.querySelectorAll('button')]
      .find(b => /Choose backup file/i.test(b.textContent!)) as HTMLButtonElement;
    await fireEvent.click(choose);
    spy.mockRestore();

    expect(picked).toBeTruthy();
    const file = new File(['not json at all'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(picked!, 'files', { value: [file], configurable: true });

    await (picked!.onchange as () => Promise<void>)();
    await new Promise(r => setTimeout(r, 0));

    // Plain language, not a raw JSON.parse SyntaxError -- "Unexpected token"
    // means nothing to someone who just picked the wrong file.
    expect(container.textContent).toContain("doesn't look like an Offlog backup file");
  });
});

// Both loadDeviceLastSeen() and loadConflicts() fire from a bare reactive
// statement the moment the Sync tab is shown, with nothing awaiting or
// catching them -- a real query failure there became an unhandled
// rejection (main.ts's crash net: a generic "Something went wrong" toast,
// with no specific error and no path back to a working state).
describe('SettingsPanel sync tab load failures', () => {
  it('surfaces a specific error instead of an unhandled rejection when the device list fails to load', async () => {
    getDeviceLastSeen.mockRejectedValueOnce(new Error('IDB transaction failed'));
    render(SettingsPanel, { initialCategory: 'sync' });

    await new Promise(r => setTimeout(r, 0));

    expect(showError).toHaveBeenCalledWith('Failed to load recent devices.');
  });

  it('surfaces a specific error instead of an unhandled rejection when conflicts fail to load', async () => {
    getConflicts.mockRejectedValueOnce(new Error('IDB transaction failed'));
    // loadConflicts() only fires when conflictCount > 0 -- syncState is a
    // plain mutable object read at component init, not a store, so it has
    // to be set before render.
    const { syncState } = await import('../src/lib/db');
    (syncState as { conflictCount: number }).conflictCount = 1;
    render(SettingsPanel, { initialCategory: 'sync' });

    await new Promise(r => setTimeout(r, 0));

    expect(showError).toHaveBeenCalledWith('Failed to load sync conflicts.');
    (syncState as { conflictCount: number }).conflictCount = 0;
  });
});
