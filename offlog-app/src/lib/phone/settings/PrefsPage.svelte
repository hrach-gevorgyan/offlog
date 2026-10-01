<script lang="ts">
  // The phone host for the desktop settings children (src/lib/settings/*).
  // It carries SettingsPanel's state and handlers for one category at a time,
  // so every setting keeps its exact behaviour; only the chrome is phone.
  // Multi-step flows (pairing, conflicts, maintenance, restore preview) open
  // as bottom sheets instead of SettingsPanel's mini-modals.
  import { onMount, onDestroy } from 'svelte';
  import AppearanceSettings from '../../settings/AppearanceSettings.svelte';
  import NotificationSettings from '../../settings/NotificationSettings.svelte';
  import SyncSettings from '../../settings/SyncSettings.svelte';
  import OrganizeSettings from '../../settings/OrganizeSettings.svelte';
  import DataSettings from '../../settings/DataSettings.svelte';
  import SecuritySettings from '../../settings/SecuritySettings.svelte';
  import AdvancedSettings from '../../settings/AdvancedSettings.svelte';
  import { downloadBlob, freshMaintSteps, formatStorageEstimate, summarizeIssues, type MaintStep } from '../../settings/helpers';
  import { isAutoBackupEnabled, setAutoBackupEnabled, getLastAutoBackupAt, getAutoBackupUsage } from '../../autoBackup';
  import db, {
    syncState, syncNow, importJSON, analyzeImport, exportProjectDocs, exportTasksCSV,
    getConflicts, resolveConflict, type ConflictInfo, type ConflictVersion,
    getCustomFieldDefs,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    startSync, cancelSync, getDeviceLastSeen,
    runMaintenanceSteps, type IntegrityIssue, type MaintStepResult,
    wipeAndReseed, type ImportedDoc,
  } from '../../db';
  import { confirmAction } from '../../confirm';
  import { projects as projectsStore, showError } from '../../store';
  import { getSyncUrl, setSyncUrl, getSyncCredentials, setSyncCredentials, getDeviceName, setDeviceName, isSyncEnabled, setSyncEnabled, getDefaultReminderTime, setDefaultReminderTime, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h, getQuietHours, setQuietHours, getNotificationsEnabled, setNotificationsEnabled, getAutoUpdateCheckEnabled, setAutoUpdateCheckEnabled, isTauri as isTauriCheck, invokeTauri, isAppLockEnabled, setAppLockPin, clearAppLockPin, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes, getAppLockHint, isNativePlatform, isAppLockBiometricEnabled, setAppLockBiometricEnabled, syncPrivacyScreen, isHapticsEnabled, setHapticsEnabled, isPrivacyScreenEnabled, setPrivacyScreenEnabled } from '../../../config';
  import { fmtLastSynced, localDateStr } from '../../utils';
  import { discoveredHosts, isScanning, scanForHosts, stopScan, pairWithHost, staleHostAlert, type DiscoveredHost } from '../../discovery';
  import { checkExactAlarmPermission, rescheduleAll } from '../../notifications';
  import { updateState, showUpdateModal, checkForUpdate } from '../../updateChecker';
  import { getThemeMode, setThemeMode, getHighContrast, setHighContrast, getReduceMotion, setReduceMotion, type ThemeMode } from '../../theme';
  import { trapFocus } from '../../focusTrap';
  import { fade } from 'svelte/transition';
  import { scrimIn, scrimOut, dialogIn, dialogOut } from '../../motion';
  import TopBar from '../TopBar.svelte';
  import Sheet from '../Sheet.svelte';
  import { back, push } from '../nav';
  import { closeOnBack, closeAll } from '../../modalStack';
  import { runSyncNow, syncing } from './syncNow';
  import { rowTaps } from './rowTaps';

  export let page: string;

  const TITLE: Record<string, string> = {
    appearance: 'Appearance', notifications: 'Notifications', sync: 'Sync & devices',
    organize: 'Organize', data: 'Backup & restore', security: 'App lock', advanced: 'Advanced',
  };

  // ── Appearance ──
  let themeMode: ThemeMode = getThemeMode();
  function selectThemeMode(mode: ThemeMode) { themeMode = mode; setThemeMode(mode); }
  let highContrast = getHighContrast();
  function toggleHighContrast() { highContrast = !highContrast; setHighContrast(highContrast); }
  let reduceMotion = getReduceMotion();
  function toggleReduceMotion() { reduceMotion = !reduceMotion; setReduceMotion(reduceMotion); }
  let hapticsEnabled = isHapticsEnabled();
  function toggleHaptics() { hapticsEnabled = !hapticsEnabled; setHapticsEnabled(hapticsEnabled); }
  let weekStartsMonday = getWeekStartsMonday();
  function setWeekStart(monday: boolean) { weekStartsMonday = monday; setWeekStartsMonday(monday); }
  let timeFormat24h = getTimeFormat24h();
  function setTimeFormat(is24h: boolean) { timeFormat24h = is24h; setTimeFormat24h(is24h); }

  // ── Notifications ──
  const isAndroid = window.Capacitor?.getPlatform?.() === 'android';
  let notificationsEnabled = getNotificationsEnabled();
  function toggleNotificationsEnabled() {
    notificationsEnabled = !notificationsEnabled;
    setNotificationsEnabled(notificationsEnabled);
    rescheduleAll().catch(() => {});
  }
  let defaultReminderTime = getDefaultReminderTime();
  function saveDefaultReminderTime(e: CustomEvent<string>) {
    defaultReminderTime = e.detail;
    setDefaultReminderTime(defaultReminderTime);
  }
  let quietHours = getQuietHours();
  // rescheduleAll() re-applies quiet hours to reminders already pending.
  function saveQuietHours(patch: Partial<typeof quietHours>) {
    quietHours = { ...quietHours, ...patch };
    setQuietHours(quietHours);
    rescheduleAll().catch(() => {});
  }
  // Re-checked on every open: the user may have just come back from the OS
  // "Alarms & reminders" screen.
  onMount(() => { if (isAndroid && page === 'notifications') checkExactAlarmPermission(); });

  // ── App lock ──
  let appLockEnabled = isAppLockEnabled();
  let lockTimeoutStr = String(getAppLockTimeoutMinutes());
  let showPinForm = false;
  let newPin = '';
  let confirmPin = '';
  let pinHint = '';
  let pinError = '';
  let pinSaving = false;
  // The plaintext recovery code is never stored: this is the only time it
  // can be shown.
  let newRecoveryCode: string | null = null;
  let recoveryCodeSavedAck = false;
  let recoveryCopied = false;

  async function copyRecoveryCode() {
    if (!newRecoveryCode) return;
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: newRecoveryCode });
      recoveryCopied = true;
      setTimeout(() => { recoveryCopied = false; }, 2000);
    } catch { /* the code is still on screen */ }
  }

  // Back must not take the page (and the one-time code) away: while the code
  // is up, a back press only re-arms this entry. Continue is the one way out.
  let recoveryClose: (() => void) | null = null;
  let recoveryDone = false, destroyed = false;
  function guardRecovery() {
    recoveryDone = false;
    recoveryClose = closeOnBack(() => {
      recoveryClose = null;
      if (recoveryDone) { newRecoveryCode = null; return; }
      // Deferred: closeAll() (a widget jump) also lands here, and pushing
      // before its history.go() resolves would desync history.
      setTimeout(() => { if (!destroyed && newRecoveryCode) guardRecovery(); }, 0);
    });
  }
  function finishRecovery() {
    recoveryDone = true;
    if (recoveryClose) recoveryClose(); else newRecoveryCode = null;
  }
  onDestroy(() => { destroyed = true; });

  let privacyScreenEnabled = isPrivacyScreenEnabled();
  function togglePrivacyScreen() {
    privacyScreenEnabled = !privacyScreenEnabled;
    setPrivacyScreenEnabled(privacyScreenEnabled);
    syncPrivacyScreen();
  }

  let biometricEnabled = isAppLockBiometricEnabled();
  let biometricError = '';
  let biometricBusy = false;
  let biometricNoneEnrolled = false;
  // Enabling needs a real successful prompt, so a device with nothing
  // enrolled never ends up "enabled" with no way to unlock.
  async function toggleBiometric() {
    biometricError = '';
    biometricNoneEnrolled = false;
    if (biometricEnabled) {
      setAppLockBiometricEnabled(false);
      biometricEnabled = false;
      return;
    }
    biometricBusy = true;
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const available = await NativeBiometric.isAvailable();
      if (!available.isAvailable) {
        biometricError = 'No fingerprint or face is enrolled on this device yet — add one in your phone\'s system settings first.';
        biometricNoneEnrolled = true;
        return;
      }
      await NativeBiometric.verifyIdentity({ reason: 'Enable biometric unlock for Offlog', title: 'Confirm it\'s you' });
      setAppLockBiometricEnabled(true);
      biometricEnabled = true;
    } catch {
      biometricError = 'Could not confirm your fingerprint/face. Try again.';
    } finally {
      biometricBusy = false;
    }
  }

  // BIOMETRIC_ENROLL needs API 30+; older devices fall back to Security.
  async function openBiometricEnrollment() {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const result = await AppLauncher.openUrl({ url: 'android.settings.BIOMETRIC_ENROLL' });
      if (!result.completed) await AppLauncher.openUrl({ url: 'android.settings.SECURITY_SETTINGS' });
    } catch { /* the inline message already says what to do */ }
  }

  function openPinForm() {
    newPin = ''; confirmPin = ''; pinError = '';
    pinHint = getAppLockHint() ?? '';
    showPinForm = true;
  }

  async function savePin() {
    if (newPin.length < 4) { pinError = 'PIN must be at least 4 digits.'; return; }
    if (!/^\d+$/.test(newPin)) { pinError = 'PIN can only contain digits.'; return; }
    if (newPin !== confirmPin) { pinError = "PINs don't match."; return; }
    if (pinHint.trim() && pinHint.includes(newPin)) { pinError = "The hint can't contain the PIN itself."; return; }
    pinSaving = true;
    try {
      const result = await setAppLockPin(newPin, pinHint);
      appLockEnabled = true;
      showPinForm = false;
      syncPrivacyScreen();
      if (result.recoveryCode) { newRecoveryCode = result.recoveryCode; recoveryCodeSavedAck = false; recoveryCopied = false; guardRecovery(); }
    } catch {
      pinError = 'Could not save PIN. Please try again.';
    } finally {
      pinSaving = false;
    }
  }

  // Change and Remove both go through ConfirmPinGate; entering the current
  // PIN is the confirmation.
  let pinGateMode: 'change' | 'remove' | null = null;
  function onPinGateVerified() {
    const mode = pinGateMode;
    pinGateMode = null;
    if (mode === 'change') openPinForm();
    else if (mode === 'remove') {
      clearAppLockPin();
      appLockEnabled = false;
      biometricEnabled = false;
      privacyScreenEnabled = false;
      syncPrivacyScreen();
    }
  }
  function onLockTimeoutChange(v: string) { setAppLockTimeoutMinutes(Number(v)); }

  // ── Sync ──
  let syncUrl = getSyncUrl();
  let credentialUser = '';
  let credentialPass = '';
  onMount(async () => {
    try {
      ({ user: credentialUser, pass: credentialPass } = await getSyncCredentials());
    } catch { /* left empty */ }
  });
  let deviceName = getDeviceName();
  let syncEnabled = isSyncEnabled();

  $: connectionStatus =
    !syncEnabled ? { text: 'Sync is paused.', tone: 'muted' } :
    !syncUrl ? (isAndroid
      ? { text: 'Not connected to another device yet — tap "Connect a device" below.', tone: 'muted' }
      : { text: 'Not connected to another device yet — open Advanced to connect one.', tone: 'muted' }) :
    syncStatus === 'syncing' ? { text: 'Syncing…', tone: 'muted' } :
    syncStatus === 'offline' ? { text: 'Offline — will resume automatically when back on your network.', tone: 'muted' } :
    syncStatus === 'error' ? { text: syncError || 'Sync error.', tone: 'warn' } :
    lastSynced ? { text: `Connected — last synced ${fmtLastSynced(lastSynced)}`, tone: 'ok' } :
    { text: 'Connected — waiting for first sync…', tone: 'muted' };

  function toggleSyncEnabled() {
    syncEnabled = !syncEnabled;
    setSyncEnabled(syncEnabled);
    if (syncEnabled) startSync().catch(() => {}); else cancelSync();
  }

  const isTauri = isTauriCheck();
  let isTauriDebug = false;
  if (isTauri) invokeTauri<boolean>('is_debug_build').then((v) => { isTauriDebug = v; }).catch(() => {});

  // SyncSettings / AdvancedSettings only ever set these to true; the sheets
  // below clear them once their outro has played.
  let showConnectModal = false;
  let showConflictsModal = false;
  let showMaintenanceModal = false;
  // Sheet calls closeOnBack() at setup, so each real open needs a fresh {#key}.
  let connectSession = 0, conflictsSession = 0, maintSession = 0, importSession = 0;
  let wasConnect = false, wasConflicts = false, wasMaint = false, wasImport = false;
  $: { if (showConnectModal && !wasConnect) connectSession++; wasConnect = showConnectModal; }
  $: { if (showConflictsModal && !wasConflicts) conflictsSession++; wasConflicts = showConflictsModal; }
  $: { if (showMaintenanceModal && !wasMaint) maintSession++; wasMaint = showMaintenanceModal; }
  $: { if (importPreview && !wasImport) importSession++; wasImport = !!importPreview; }

  let selectedHost: DiscoveredHost | null = null;
  let pairingCode = '';
  let pairingBusy = false;
  let pairingError = '';
  // "Incorrect or expired code" never says which, so repeated failures nudge
  // toward the fix generically.
  let pairingFailCount = 0;
  let pairSuccessName: string | null = null;
  let scanAttempted = false;
  function startDeviceScan() {
    selectedHost = null;
    pairingError = '';
    pairSuccessName = null;
    scanAttempted = true;
    scanForHosts();
  }
  $: scanFoundNothing = scanAttempted && !$isScanning && $discoveredHosts.length === 0;

  async function submitPairingCode() {
    if (!selectedHost) return;
    pairingBusy = true;
    pairingError = '';
    try {
      const pairedName = selectedHost.name;
      await pairWithHost(selectedHost, pairingCode);
      syncUrl = getSyncUrl();
      // Without this the Advanced form keeps its old credentials, and a later
      // "Save & restart sync" overwrites the just-paired ones.
      ({ user: credentialUser, pass: credentialPass } = await getSyncCredentials());
      selectedHost = null;
      pairingCode = '';
      pairSuccessName = pairedName;
      pairingFailCount = 0;
    } catch (e) {
      pairingFailCount++;
      pairingError = e instanceof Error ? e.message : 'Failed to pair.';
      if (pairingFailCount >= 3) pairingError += ' Double-check the code on the PC screen, or generate a new one there.';
    } finally {
      pairingBusy = false;
    }
  }

  // PC side: the phone drives the handshake, so the PC learns of success from
  // the "pairing-succeeded" event and, for the name, by polling for a device
  // that wasn't seen before the code was generated.
  let pcPairingCode = '';
  let pcPairingBusy = false;
  let pcPairedDeviceName: string | null = null;
  let pcJustPaired = false;
  let pcPollTimer: ReturnType<typeof setInterval> | null = null;
  function stopPcPairPoll() { if (pcPollTimer) { clearInterval(pcPollTimer); pcPollTimer = null; } }
  // Mirrors pairing.rs's CODE_TTL (5 min) so a dead code is shown as expired.
  let pcPairingExpired = false;
  let pcPairingExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  function clearPcPairingExpiryTimer() { if (pcPairingExpiryTimer) { clearTimeout(pcPairingExpiryTimer); pcPairingExpiryTimer = null; } }
  async function startPcPairPoll() {
    stopPcPairPoll();
    let before: Set<string>;
    try {
      before = new Set((await getDeviceLastSeen()).map(d => d.device));
    } catch {
      showError('Failed to check for a connected device.');
      return;
    }
    pcPollTimer = setInterval(async () => {
      try {
        const now = await getDeviceLastSeen();
        const found = now.find(d => !before.has(d.device));
        if (found) { pcPairedDeviceName = found.device; stopPcPairPoll(); clearPcPairingExpiryTimer(); }
      } catch { /* next tick retries */ }
    }, 3000);
  }
  async function generatePcPairingCode() {
    pcPairingBusy = true;
    pcPairedDeviceName = null;
    pcJustPaired = false;
    pcPairingExpired = false;
    clearPcPairingExpiryTimer();
    try {
      pcPairingCode = await invokeTauri<string>('generate_pairing_code');
      pcPairingExpiryTimer = setTimeout(() => { pcPairingExpired = true; stopPcPairPoll(); }, 5 * 60 * 1000);
      startPcPairPoll();
    } catch {
      showError('Failed to generate a pairing code.');
    } finally {
      pcPairingBusy = false;
    }
  }
  let unlistenPairing: (() => void) | null = null;
  if (isTauri) {
    import('@tauri-apps/api/event').then(({ listen }) => listen('pairing-succeeded', () => {
      pcJustPaired = true;
      clearPcPairingExpiryTimer();
    })).then(u => { unlistenPairing = u; }).catch(() => {});
  }
  $: if (!showConnectModal) { stopPcPairPoll(); clearPcPairingExpiryTimer(); pcPairedDeviceName = null; pcJustPaired = false; pairSuccessName = null; scanAttempted = false; }
  onDestroy(() => { stopPcPairPoll(); clearPcPairingExpiryTimer(); unlistenPairing?.(); });

  // Debug builds only (the Rust command refuses otherwise). wipeAndReseed()
  // clears the local PouchDB and the sync pushes its tombstones out before
  // the server itself is wiped, so a paired phone is cleared too.
  let resetBusy = false;
  async function resetPcTestData() {
    const ok = await confirmAction('Delete all tasks/projects on this PC and restart the app?', { confirmLabel: 'Delete everything', danger: true });
    if (!ok) return;
    resetBusy = true;
    try {
      await wipeAndReseed();
      await syncNow().catch(() => {});
      await invokeTauri('reset_sync_data');
    } catch {
      showError('Failed to reset test data.');
      resetBusy = false;
    }
  }

  function saveDeviceName() { setDeviceName(deviceName); deviceName = getDeviceName(); }

  let deviceLastSeen: { device: string; lastSeen: string }[] = [];
  let deviceLastSeenLoaded = false;
  async function loadDeviceLastSeen() {
    deviceLastSeenLoaded = true; // before the await: an empty result must not retrigger this
    try {
      deviceLastSeen = await getDeviceLastSeen();
    } catch {
      showError('Failed to load recent devices.');
    }
  }

  let syncStatus = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let lastErrorAt = syncState.lastErrorAt;
  let conflictCount = syncState.conflictCount;
  function onSyncChange() {
    syncStatus = syncState.status;
    lastSynced = syncState.lastSynced;
    syncError = syncState.error;
    lastErrorAt = syncState.lastErrorAt;
    conflictCount = syncState.conflictCount;
  }
  syncState.listeners.add(onSyncChange);
  onDestroy(() => syncState.listeners.delete(onSyncChange));
  onDestroy(() => stopScan());

  let conflictList: ConflictInfo[] = [];
  let loadingConflicts = false;
  // Remembers which count was last attempted: without it a failing
  // getConflicts() re-fires the reactive load forever.
  let conflictsAttemptedFor = -1;
  let conflictFieldNames: Record<string, string> = {};
  async function loadConflicts() {
    loadingConflicts = true;
    try {
      conflictList = await getConflicts();
      const defs = await getCustomFieldDefs();
      conflictFieldNames = Object.fromEntries(defs.map(d => [d.id, d.name]));
    } catch {
      showError('Failed to load sync conflicts.');
    } finally { loadingConflicts = false; }
  }
  async function resolve(c: ConflictInfo, v: ConflictVersion) {
    const losing = c.versions.length - 1;
    const ok = await confirmAction(
      `Keep this version of "${c.label}"? The other ${losing === 1 ? 'version' : `${losing} versions`} will be discarded permanently.`,
      { confirmLabel: 'Keep this one', danger: true },
    );
    if (!ok) return;
    try {
      await resolveConflict(c.docId, v.isCurrent ? 'current' : 'other', v.rev);
      await loadConflicts();
    } catch {
      showError('Failed to resolve conflict. Please try again.');
    }
  }

  function fmtConflictValue(field: string, v: unknown): string {
    if (v === undefined || v === null || v === '') return '—';
    if (field === 'columns' && Array.isArray(v)) return v.map(c => (c as { name?: string })?.name ?? '?').join(' → ') || '—';
    if (field === 'checklist' && Array.isArray(v)) {
      if (!v.length) return '—';
      const done = v.filter(i => (i as { done?: boolean })?.done).length;
      const texts = v.map(i => (i as { text?: string })?.text ?? '').filter(Boolean);
      return `${v.length} item${v.length === 1 ? '' : 's'}, ${done} done — ${texts.join(', ')}`;
    }
    if (field === 'custom_values' && typeof v === 'object') {
      const pairs = Object.entries(v as Record<string, unknown>).map(([id, val]) => `${conflictFieldNames[id] ?? 'deleted field'}: ${val ?? '—'}`);
      return pairs.length ? pairs.join(', ') : '—';
    }
    if ((field === 'related' || field === 'blocked_by') && Array.isArray(v)) return v.length ? `${v.length} task${v.length === 1 ? '' : 's'}` : '—';
    if (Array.isArray(v)) return v.length ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ') : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    const str = String(v);
    return str.length > 120 ? str.slice(0, 120) + '…' : str;
  }
  const CONFLICT_FIELD_LABELS: Record<string, string> = {
    title: 'Title', name: 'Name', body: 'Notes', priority: 'Priority',
    due_date: 'Due date', reminder_at: 'Reminder', tags: 'Tags',
    column_id: 'Status', checklist: 'Checklist', custom_values: 'Custom fields',
    related: 'Related', blocked_by: 'Blocked by', pinned: 'Pinned',
    archived: 'Archived', deleted: 'In trash', position: 'Order',
    columns: 'Statuses', color: 'Colour', icon: 'Icon', default_view: 'Default view',
  };
  const conflictFieldLabel = (f: string) => CONFLICT_FIELD_LABELS[f] ?? f;
  $: if (page === 'sync' && conflictCount > 0 && conflictCount !== conflictsAttemptedFor && !loadingConflicts) {
    conflictsAttemptedFor = conflictCount;
    loadConflicts();
  }
  $: if (page === 'sync' && !deviceLastSeenLoaded) loadDeviceLastSeen();

  // ── Organize ──
  // Each manager calls closeOnBack(), so it mounts behind a {#key} bumped per
  // open, and its lazy import is guarded against re-entry and failure.
  let SpaceManagerComp: typeof import('../../SpaceManager.svelte').default | null = null;
  let showSpaceManager = false, spaceManagerActive = false, spaceManagerSession = 0;
  async function openSpaceManager() {
    if (spaceManagerActive) return;
    spaceManagerActive = true;
    try {
      if (!SpaceManagerComp) SpaceManagerComp = (await import('../../SpaceManager.svelte')).default;
      spaceManagerSession++;
      showSpaceManager = true;
    } catch {
      spaceManagerActive = false;
      showError('Failed to open Spaces. Please try again.');
    }
  }
  function onSpaceManagerClosed() { showSpaceManager = false; spaceManagerActive = false; }

  let TagManagerComp: typeof import('../../TagManager.svelte').default | null = null;
  let showTagManager = false, tagManagerActive = false, tagManagerSession = 0;
  async function openTagManager() {
    if (tagManagerActive) return;
    tagManagerActive = true;
    try {
      if (!TagManagerComp) TagManagerComp = (await import('../../TagManager.svelte')).default;
      tagManagerSession++;
      showTagManager = true;
    } catch {
      tagManagerActive = false;
      showError('Failed to open Tags. Please try again.');
    }
  }
  function onTagManagerClosed() { showTagManager = false; tagManagerActive = false; }

  let CustomFieldManagerComp: typeof import('../../CustomFieldManager.svelte').default | null = null;
  let showCustomFieldManager = false, customFieldManagerActive = false, customFieldManagerSession = 0;
  async function openCustomFieldManager() {
    if (customFieldManagerActive) return;
    customFieldManagerActive = true;
    try {
      if (!CustomFieldManagerComp) CustomFieldManagerComp = (await import('../../CustomFieldManager.svelte')).default;
      customFieldManagerSession++;
      showCustomFieldManager = true;
    } catch {
      customFieldManagerActive = false;
      showError('Failed to open Custom Fields. Please try again.');
    }
  }
  function onCustomFieldManagerClosed() { showCustomFieldManager = false; customFieldManagerActive = false; }

  const openArchivedProjectsManager = () => push({ k: 'set', page: 'archived' });

  // ── Backup & storage ──
  let breakdown: StorageBreakdown | null = null;
  // Kept backups live outside IndexedDB, so the storage estimate misses them.
  let backupUsage: { count: number; bytes: number } | null = null;
  async function loadBreakdown() {
    try {
      breakdown = await getStorageBreakdown();
      backupUsage = await getAutoBackupUsage();
    } catch {
      showError('Failed to load storage usage.');
    }
  }
  let storageInfo = '';
  let storagePercent = 0;
  let storageAvailable = true;
  async function loadStorage() {
    try {
      if (navigator.storage?.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        ({ info: storageInfo, percent: storagePercent } = formatStorageEstimate(usage, quota));
        storageAvailable = true;
      } else { storageInfo = 'Not available'; storageAvailable = false; }
    } catch {
      storageInfo = 'Not available'; storageAvailable = false;
    }
  }
  onMount(() => {
    if (page !== 'data') return;
    loadBreakdown();
    loadStorage();
    return subscribeDb(() => loadBreakdown());
  });

  // Restore parses and previews counts before anything is written.
  let importStatus = '';
  let pendingImportDocs: ImportedDoc[] | null = null;
  let importPreview: { toCreate: number; toSkip: number; byType: Record<string, number> } | null = null;
  let importFileName = '';
  let importFileModified = '';
  // Blocks a second restore from starting while one is still writing.
  let importBusy = false;

  function handleImport() {
    if (importBusy) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        let docs: unknown;
        try { docs = JSON.parse(text); } catch { throw new Error("That doesn't look like an Offlog backup file."); }
        if (!Array.isArray(docs)) throw new Error("That doesn't look like an Offlog backup file.");
        pendingImportDocs = docs as ImportedDoc[];
        importPreview = analyzeImport(docs as ImportedDoc[]);
        importFileName = file.name;
        importFileModified = file.lastModified ? fmtLastSynced(new Date(file.lastModified).toISOString()) : '';
      } catch (e) {
        importStatus = e instanceof Error ? e.message : "That doesn't look like an Offlog backup file.";
        setTimeout(() => { importStatus = ''; }, 4000);
      }
    };
    input.click();
  }
  function cancelImport() { pendingImportDocs = null; importPreview = null; importFileName = ''; importFileModified = ''; }

  // Takes the docs before the sheet closes: closing clears the preview state.
  async function confirmImport(close: () => void) {
    const docs = pendingImportDocs;
    if (!docs) return;
    close();
    importBusy = true;
    try {
      importStatus = 'Importing…';
      const { ok, skipped } = await importJSON(docs);
      importStatus = `Done — ${ok} imported, ${skipped} skipped`;
    } catch {
      importStatus = 'Import failed. Please try again.';
    }
    importBusy = false;
    setTimeout(() => { importStatus = ''; }, 4000);
  }

  let autoBackupEnabled = isAutoBackupEnabled();
  let lastAutoBackupAt = getLastAutoBackupAt();
  function toggleAutoBackup() { autoBackupEnabled = !autoBackupEnabled; setAutoBackupEnabled(autoBackupEnabled); }

  let backupScope = ''; // '' = everything
  $: backupScopeOptions = [{ value: '', label: 'Everything' }, ...$projectsStore.map(p => ({ value: p._id!, label: p.name }))];
  async function doBackup() {
    try {
      const docs = backupScope
        ? await exportProjectDocs(backupScope)
        // Attachments inlined, not stubs: a stub makes the whole restore fail.
        : (await db.allDocs({ include_docs: true, attachments: true, binary: false })).rows.map(r => r.doc).filter(d => !!d && !d._id.startsWith('_'));
      const name = backupScope ? ($projectsStore.find(p => p._id === backupScope)?.name.toLowerCase().replace(/\s+/g, '-') ?? 'project') : 'backup';
      await downloadBlob(JSON.stringify(docs, null, 2), 'application/json', `offlog-${name}-${localDateStr(new Date())}.json`);
    } catch {
      showError('Failed to back up. Please try again.');
    }
  }
  async function doExportCSV() {
    try {
      const csv = await exportTasksCSV();
      await downloadBlob(csv, 'text/csv', `offlog-tasks-${localDateStr(new Date())}.csv`);
    } catch {
      showError('Failed to export CSV. Please try again.');
    }
  }

  // ── Advanced ──
  let updateChecking = false;
  let updateStatus = '';
  let appVersion = '';
  if (isTauri) {
    import('@tauri-apps/api/app').then(({ getVersion }) => getVersion()).then(v => { appVersion = v; }).catch(() => {});
  } else if (isNativePlatform()) {
    import('@capacitor/app').then(({ App }) => App.getInfo()).then(info => { appVersion = info.version; }).catch(() => {});
  }
  async function onCheckForUpdate() {
    if ($updateState.phase === 'ready') { showUpdateModal.set(true); return; }
    updateChecking = true;
    updateStatus = '';
    await checkForUpdate();
    updateChecking = false;
    if ($updateState.phase === 'available') showUpdateModal.set(true);
    else if ($updateState.phase === 'idle') updateStatus = "You're on the latest version.";
    else if ($updateState.phase === 'error') updateStatus = $updateState.error ?? 'Could not check for updates right now.';
  }
  let autoUpdateCheckEnabled = getAutoUpdateCheckEnabled();
  function toggleAutoUpdateCheck() { autoUpdateCheckEnabled = !autoUpdateCheckEnabled; setAutoUpdateCheckEnabled(autoUpdateCheckEnabled); }

  let maintRunning = false;
  let maintSteps: MaintStep[] = freshMaintSteps();
  let maintRemainingIssues: IntegrityIssue[] = [];
  // Cooperative: the step already running still finishes.
  let maintCancelled = false;
  let maintFoundIssues: IntegrityIssue[] = [];
  function setMaintStep(key: MaintStepResult['key'], patch: Partial<MaintStep>) {
    maintSteps = maintSteps.map(s => s.key === key ? { ...s, ...patch } : s);
  }
  async function runMaintenance() {
    maintRunning = true;
    maintCancelled = false;
    maintSteps = freshMaintSteps();
    maintRemainingIssues = [];
    maintFoundIssues = [];
    try {
      const { remainingIssues } = await runMaintenanceSteps(
        (step) => setMaintStep(step.key, { status: step.status, note: step.note }),
        {
          // Repair rewrites docs with no undo, so it asks first and names what it found.
          confirmRepair: (issues) => {
            maintFoundIssues = issues;
            const lines = summarizeIssues(issues)
              .map(g => `• ${g.text}${g.manual ? ' (needs your review — not fixed automatically)' : ''}`)
              .join('\n');
            return confirmAction(
              `Found ${issues.length} problem${issues.length === 1 ? '' : 's'}:\n\n${lines}\n\nRepair the ones that can be fixed safely? This rewrites those items and cannot be undone.`,
              { confirmLabel: 'Repair', cancelLabel: 'Skip' },
            );
          },
          isCancelled: () => maintCancelled,
        },
      );
      maintRemainingIssues = remainingIssues;
    } catch {
      const running = maintSteps.find(s => s.status === 'running');
      if (running) setMaintStep(running.key, { status: 'error', note: 'Failed — please try again' });
      showError('Maintenance failed partway through. Please try again.');
    } finally {
      maintRunning = false;
      maintCancelled = false;
    }
  }
  $: maintProgress = Math.round((maintSteps.filter(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length / (maintSteps.length || 1)) * 100);

  // Only the server address and credentials are buffered; everything else
  // applies on tap. Reload only when they actually changed — with App Lock on,
  // a reload re-runs the cold-start lock.
  async function saveServer() {
    let storedUser = '', storedPass = '';
    try {
      ({ user: storedUser, pass: storedPass } = await getSyncCredentials());
    } catch { /* treated as nothing stored */ }
    const changed = syncUrl !== getSyncUrl() || credentialUser !== storedUser || credentialPass !== storedPass;
    if (!changed) { back(); return; }
    setSyncUrl(syncUrl);
    try {
      await setSyncCredentials(credentialUser, credentialPass);
    } catch {
      showError('Could not save sync credentials securely. Please try again.');
      return;
    }
    // Unwind the pushed screens first, or the first back after the reload
    // lands on a stale history entry and does nothing.
    if (closeAll()) {
      await new Promise<void>(r => {
        const done = () => { window.removeEventListener('popstate', done); r(); };
        window.addEventListener('popstate', done);
        setTimeout(done, 300);
      });
    }
    location.reload();
  }
</script>

<TopBar title={TITLE[page] ?? 'Settings'} />

<div class="pset" use:rowTaps>
  {#if page === 'appearance'}
    <AppearanceSettings
      {themeMode} {selectThemeMode} {weekStartsMonday} {setWeekStart}
      {timeFormat24h} {setTimeFormat} {highContrast} {toggleHighContrast}
      {reduceMotion} {toggleReduceMotion} {hapticsEnabled} {toggleHaptics}
    />
  {:else if page === 'notifications'}
    <NotificationSettings
      {isAndroid} {isTauri} {notificationsEnabled} {toggleNotificationsEnabled}
      {defaultReminderTime} {saveDefaultReminderTime} {quietHours} {saveQuietHours}
    />
  {:else if page === 'sync'}
    <SyncSettings
      {isAndroid} {isTauri} {syncEnabled} {toggleSyncEnabled} {connectionStatus}
      bind:showConnectModal bind:showConflictsModal
      bind:deviceName {saveDeviceName} {deviceLastSeen} {conflictCount} {conflictList}
    />
    {#if $staleHostAlert}
      <p class="warn" role="status">Paired computer not found — “{$staleHostAlert.name}” is on this network. Pair again under Connect a device.</p>
    {/if}
    {#if syncEnabled && syncUrl}
      <button class="export-btn" on:click={runSyncNow} disabled={$syncing}>{$syncing ? 'Syncing…' : 'Sync now'}</button>
    {/if}
  {:else if page === 'organize'}
    <OrganizeSettings {openSpaceManager} {openTagManager} {openCustomFieldManager} {openArchivedProjectsManager} />
  {:else if page === 'data'}
    <DataSettings {backupUsage}
      {storageAvailable} {storagePercent} {storageInfo} {breakdown}
      {autoBackupEnabled} {toggleAutoBackup} {lastAutoBackupAt}
      bind:backupScope {backupScopeOptions} {doBackup} {doExportCSV}
      {importStatus} {handleImport} {importBusy}
    />
  {:else if page === 'security'}
    <SecuritySettings
      {appLockEnabled} bind:showPinForm {openPinForm}
      bind:newPin bind:confirmPin bind:pinHint {pinError} {pinSaving} {savePin}
      bind:pinGateMode {onPinGateVerified}
      bind:lockTimeoutStr {onLockTimeoutChange}
      {biometricEnabled} {biometricBusy} {biometricError} {biometricNoneEnrolled}
      {toggleBiometric} {openBiometricEnrollment}
      {privacyScreenEnabled} {togglePrivacyScreen}
    />
  {:else if page === 'advanced'}
    <AdvancedSettings
      {isTauri} {isTauriDebug} bind:showMaintenanceModal
      {autoUpdateCheckEnabled} {toggleAutoUpdateCheck} {appVersion}
      {updateChecking} {updateStatus} {onCheckForUpdate}
      {syncEnabled} bind:syncUrl bind:credentialUser bind:credentialPass
      {syncError} {lastErrorAt} {resetBusy} {resetPcTestData}
    />
    {#if syncEnabled}<button class="p-go save" on:click={saveServer}>Save &amp; restart sync</button>{/if}
  {:else}
    <p class="p-empty">This page doesn't exist.</p>
  {/if}
</div>

<!-- Sheets sit below ConfirmDialog (z 700) so a confirm raised from inside
     one (Keep this version, Repair) shows on top of it. -->
<div class="under">
  {#if showConnectModal}
    {#key connectSession}
      <Sheet title="Connect a device" on:close={() => showConnectModal = false} let:close>
        <div class="sh">
          {#if isAndroid}
            {#if pairSuccessName}
              <p class="ok">✓ Connected to "{pairSuccessName}" — syncing now.</p>
              <button class="p-go" on:click={close}>Done</button>
            {:else if !selectedHost}
              <button class="p-go" on:click={startDeviceScan} disabled={$isScanning}>
                {$isScanning ? 'Looking for your computer…' : 'Find my computer'}
              </button>
              {#if $discoveredHosts.length}
                <div class="p-group">
                  {#each $discoveredHosts as host (host.uuid)}
                    <button class="p-row" on:click={() => { selectedHost = host; stopScan(); }}>
                      <span class="p-k"><span>{host.name}</span></span><span class="p-v set">Connect</span>
                    </button>
                  {/each}
                </div>
              {/if}
              {#if scanFoundNothing}
                <p class="warn">No computer found. Make sure Sync is turned on there and both devices are on the same Wi-Fi network, then try again.</p>
              {/if}
            {:else}
              <p class="p-say">Enter the code shown on the "{selectedHost.name}" screen.</p>
              <input class="p-fld" bind:value={pairingCode} placeholder="123456" inputmode="numeric" maxlength="6" disabled={pairingBusy} aria-label="Pairing code" />
              {#if pairingError}<p class="warn">{pairingError}</p>{/if}
              <button class="p-go" on:click={submitPairingCode} disabled={pairingBusy || pairingCode.trim().length !== 6}>
                {pairingBusy ? 'Connecting…' : 'Connect'}
              </button>
              <button class="p-tbtn wide" on:click={() => { selectedHost = null; pairingCode = ''; pairingError = ''; pairingFailCount = 0; }} disabled={pairingBusy}>Cancel</button>
            {/if}
          {:else if isTauri}
            {#if pcPairedDeviceName}
              <p class="ok">✓ Connected to "{pcPairedDeviceName}" — syncing now.</p>
              <button class="p-go" on:click={close}>Done</button>
            {:else if pcJustPaired}
              <p class="ok">✓ A device just connected — syncing now.</p>
              <button class="p-go" on:click={close}>Done</button>
            {:else}
              {#if pcPairingCode && pcPairingExpired}
                <p class="warn">This code has expired. Generate a new one below.</p>
              {:else if pcPairingCode}
                <p class="p-say">Enter this code on your phone (Settings → Sync → Find my computer):</p>
                <p class="code">{pcPairingCode}</p>
                <p class="p-say">Valid for 5 minutes, one-time use — this updates automatically once your phone connects.</p>
              {:else}
                <p class="p-say">Generates a one-time code to enter on your phone (Settings → Sync → "Find my computer"), so it can connect to this PC.</p>
              {/if}
              <button class="p-go" on:click={generatePcPairingCode} disabled={pcPairingBusy}>
                {pcPairingBusy ? 'Generating…' : pcPairingCode ? 'Generate a new code' : 'Generate a code'}
              </button>
            {/if}
          {/if}
        </div>
      </Sheet>
    {/key}
  {/if}

  {#if showConflictsModal}
    {#key conflictsSession}
      <Sheet title="Resolve conflicts" on:close={() => showConflictsModal = false}>
        <div class="sh">
          <div class="crow">
            <span class="cmeta">
              {#if loadingConflicts}Loading…
              {:else if conflictList.length}{conflictList.length} item{conflictList.length === 1 ? '' : 's'} with unresolved edits
              {:else}{conflictCount} conflict{conflictCount === 1 ? '' : 's'} detected{/if}
            </span>
            <button class="p-tbtn" on:click={loadConflicts} disabled={loadingConflicts}>Refresh</button>
          </div>
          {#each conflictList as c (c.docId)}
            <div class="p-group conflict">
              <div class="ctitle">{c.label} <span class="ctype">({c.type})</span></div>
              <div class="cnote">
                {#if c.differing.length}
                  Differs in {c.differing.map(conflictFieldLabel).join(', ')} — keeping one discards the other{c.versions.length > 2 ? 's' : ''}.
                {:else}
                  Same content on every device — keep either.
                {/if}
              </div>
              {#each c.versions as v (v.rev || 'current')}
                <div class="cver">
                  <div class="crow">
                    <span class="cmeta">
                      {v.doc.source ?? 'Unknown device'}{v.doc.source === deviceName ? ' (this device)' : ''}{v.isCurrent ? ' · shown now' : ''}{v.isNewest ? ' · newest' : ''}
                      — updated {fmtLastSynced(String(v.doc.updated_at ?? v.doc.created_at ?? ''))}
                    </span>
                    <button class="p-tbtn" on:click={() => resolve(c, v)}>Keep this</button>
                  </div>
                  {#each c.differing as f}
                    <div class="cfield"><span class="cfname">{conflictFieldLabel(f)}</span><span>{fmtConflictValue(f, v.doc[f])}</span></div>
                  {/each}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </Sheet>
    {/key}
  {/if}

  {#if showMaintenanceModal}
    {#key maintSession}
      <Sheet title="Maintenance" on:close={() => showMaintenanceModal = false}>
        <div class="sh">
          <p class="p-say">
            Runs a full check in order: looks for problems with your data, repairs what it safely can,
            clears old activity history (6+ months) and old Recycle items (3+ months), then frees up
            the space they were using.
          </p>
          <div class="track"><div class="fill" style:width="{maintProgress}%"></div></div>
          <div class="p-group">
            {#each maintSteps as step (step.key)}
              <div class="p-row step" class:running={step.status === 'running'}>
                <span class="sicon {step.status}">
                  {#if step.status === 'done'}✓{:else if step.status === 'skipped'}–{:else if step.status === 'error'}✕{:else if step.status === 'running'}•{/if}
                </span>
                <span class="p-k"><span>{step.label}</span>{#if step.note}<span class="p-sub">{step.note}</span>{/if}</span>
              </div>
            {/each}
          </div>
          {#if maintFoundIssues.length > 0}
            <p class="p-lab">What the check found</p>
            <div class="issues">
              {#each summarizeIssues(maintFoundIssues) as group}
                <div>{group.text}{group.manual ? ' — needs your review' : ''}</div>
              {/each}
            </div>
          {/if}
          {#if maintRemainingIssues.length > 0}
            <p class="p-lab">Needs manual review — not safe to fix automatically</p>
            <div class="issues">
              {#each maintRemainingIssues.slice(0, 8) as issue}<div>{issue.description}</div>{/each}
            </div>
          {/if}
          <button class="p-go" on:click={runMaintenance} disabled={maintRunning}>
            {maintRunning ? 'Running…' : maintSteps.some(s => s.status === 'done') ? 'Run again' : 'Run maintenance'}
          </button>
          {#if maintRunning}
            <button class="p-tbtn wide" on:click={() => maintCancelled = true} disabled={maintCancelled}>
              {maintCancelled ? 'Stopping after this step…' : 'Cancel'}
            </button>
          {/if}
        </div>
      </Sheet>
    {/key}
  {/if}

  {#if importPreview}
    {#key importSession}
      <Sheet title="Restore from backup" on:close={cancelImport} let:close>
        <div class="sh">
          {#if importFileName}
            <p class="fname"><strong>{importFileName}</strong>{#if importFileModified}&nbsp;— modified {importFileModified}{/if}</p>
          {/if}
          <p class="p-say">
            Will create <strong>{importPreview.byType.space}</strong> space{importPreview.byType.space === 1 ? '' : 's'},
            <strong>{importPreview.byType.project}</strong> project{importPreview.byType.project === 1 ? '' : 's'},
            <strong>{importPreview.byType.task}</strong> task{importPreview.byType.task === 1 ? '' : 's'}
            {#if importPreview.toSkip > 0}— <strong>{importPreview.toSkip}</strong> unrecognized entr{importPreview.toSkip === 1 ? 'y' : 'ies'} will be skipped{/if}.
            Anything matching something you already have will be updated in place, not duplicated.
            This isn't a full revert — anything you've created, changed or deleted since this backup was taken stays exactly as it is now.
          </p>
          <button class="p-go" on:click={() => confirmImport(close)}>Import {importPreview.toCreate} item{importPreview.toCreate === 1 ? '' : 's'}</button>
          <button class="p-tbtn wide" on:click={close}>Cancel</button>
        </div>
      </Sheet>
    {/key}
  {/if}
</div>

{#if newRecoveryCode}
  <!-- Dismissable only through the acknowledgement below: no scrim click,
       no Escape. The code is shown exactly once. -->
  <div class="rscrim" in:fade={scrimIn} out:fade={scrimOut}></div>
  <div class="rmodal" use:trapFocus role="dialog" aria-modal="true" aria-label="Save your recovery code" in:dialogIn out:dialogOut>
    <h3>Save your recovery code</h3>
    <p class="p-say">
      If you forget your PIN, this code is the only way back into Offlog — there's no
      account to reset it through. Save it somewhere safe now (a password manager, a note,
      written down). It will not be shown again.
    </p>
    <div class="rcode">{newRecoveryCode}</div>
    <button class="p-tbtn wide" on:click={copyRecoveryCode}>{recoveryCopied ? 'Copied' : 'Copy'}</button>
    <label class="ack"><input type="checkbox" bind:checked={recoveryCodeSavedAck} /> I've saved this code somewhere safe</label>
    <button class="p-go" on:click={finishRecovery} disabled={!recoveryCodeSavedAck}>Continue</button>
  </div>
{/if}

{#if showSpaceManager && SpaceManagerComp}
  {#key spaceManagerSession}<svelte:component this={SpaceManagerComp} on:close={onSpaceManagerClosed} />{/key}
{/if}
{#if showTagManager && TagManagerComp}
  {#key tagManagerSession}<svelte:component this={TagManagerComp} on:close={onTagManagerClosed} />{/key}
{/if}
{#if showCustomFieldManager && CustomFieldManagerComp}
  {#key customFieldManagerSession}<svelte:component this={CustomFieldManagerComp} on:close={onCustomFieldManagerClosed} />{/key}
{/if}

<style>
  /* The settings children are styled from here (they carry no styles of
     their own). Class rules only: a bare element rule under :global() would
     also restyle CustomSelect's and TimePicker's internals. */
  .pset { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
  .pset :global(.setting-group) {
    display: flex; flex-direction: column; gap: 10px;
    background: var(--surface); border-radius: 14px; padding: 14px 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.06);
  }
  .pset :global(.reveal-wrap) { display: flex; flex-direction: column; gap: 14px; }
  .pset :global(.setting-section-title) { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
  .pset :global(.setting-row) { display: flex; align-items: center; gap: 12px; min-height: 44px; flex-wrap: wrap; }
  .pset :global(.setting-row:has(> .toggle-btn)) { cursor: pointer; margin: 0 -16px; padding: 0 16px; min-height: 52px; transition: background var(--dur-hover) var(--ease-hover); }
  .pset :global(.setting-row:has(> .toggle-btn):active) { background: var(--col-bg); }
  .pset :global(.setting-label) { flex: 1; min-width: 0; font-size: 16px; color: var(--text); }
  .pset :global(.setting-value) { font-size: 15px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .pset :global(.setting-hint) { margin: 0; font-size: 13.5px; color: var(--faint); line-height: 1.5; }
  .pset :global(.setting-hint.compact-hint) { margin-top: -6px; }
  .pset :global(.setting-hint-error) { color: var(--danger); }
  .pset :global(.setting-hint-warn) { color: var(--due-soon-ink); background: var(--due-soon-bg); padding: 10px 12px; border-radius: 10px; font-weight: 500; }
  .pset :global(.success-hint) { color: var(--text); background: color-mix(in srgb, var(--success) 14%, transparent); padding: 10px 12px; border-radius: 10px; font-weight: 600; }
  .pset :global(.storage-info) { flex: 1; min-width: 0; font-size: 14px; color: var(--muted); }
  .pset :global(.device-name-row) { display: inline-flex; align-items: center; gap: 6px; }
  .pset :global(.this-device-tag) { font-size: 12px; font-weight: 600; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); padding: 3px 7px; border-radius: 999px; }
  .pset :global(.storage-summary) { display: flex; flex-direction: column; gap: 2px; }
  .pset :global(.storage-headline) { font-size: 16px; color: var(--text); font-weight: 500; }
  .pset :global(.storage-headline-warn) { color: var(--danger); }
  .pset :global(.storage-detail) { font-size: 13px; color: var(--faint); }
  .pset :global(.project-export-select) { flex: 1; min-width: 0; }
  .pset :global(.field-label) { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
  .pset :global(.field-label input) {
    font: inherit; font-size: 16px; text-transform: none; letter-spacing: 0; font-weight: 400;
    padding: 12px 14px; border: 0; border-radius: 12px; background: var(--bg); color: var(--text);
    box-shadow: 0 0 0 1px var(--border);
  }
  .pset :global(.field-label input:focus) { outline: none; box-shadow: 0 0 0 2px var(--accent); }
  .pset :global(.field-label input:disabled) { opacity: .5; }

  .pset :global(.theme-segment) { display: flex; background: var(--col-bg); border-radius: 12px; padding: 3px; gap: 2px; flex-shrink: 0; }
  .pset :global(.theme-seg-btn) { min-height: 44px; padding: 0 14px; border-radius: 9px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .pset :global(.theme-seg-btn.active) { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.1); }

  .pset :global(.toggle-btn) {
    width: 42px; height: 26px; border-radius: 13px; border: 0; padding: 0; cursor: pointer; flex-shrink: 0;
    background: var(--border-strong); position: relative; transition: background var(--dur-small) var(--ease-standard);
  }
  .pset :global(.toggle-btn.on) { background: var(--accent); }
  .pset :global(.toggle-btn:disabled) { opacity: .5; }
  .pset :global(.toggle-knob) {
    position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
    background: var(--toggle-knob); box-shadow: 0 1px 2px rgba(0,0,0,.25);
    transition: transform var(--dur-small) var(--ease-standard);
  }
  .pset :global(.toggle-btn.on .toggle-knob) { transform: translateX(16px); }

  .pset :global(.export-btn) {
    min-height: 44px; padding: 0 16px; border-radius: 12px; border: 0; cursor: pointer;
    background: var(--col-bg); color: var(--text); font: inherit; font-size: 15px; font-weight: 600; white-space: nowrap;
  }
  .pset :global(.export-btn:active) { background: var(--border); }
  .pset :global(.export-btn:disabled) { opacity: .5; cursor: default; }
  .pset :global(.export-btn-danger) { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }

  .pset :global(.link-row) {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 0 14px;
    background: var(--bg); border: 0; border-radius: 12px; cursor: pointer; text-align: left; font: inherit; color: var(--text);
  }
  .pset :global(.link-row:active) { background: var(--col-bg); }
  .pset :global(.link-row-title) { flex: 1; font-size: 16px; font-weight: 600; }
  .pset :global(.link-row svg) { flex-shrink: 0; opacity: .5; }
  .pset :global(.nav-badge) {
    font-size: 12px; font-weight: 700; background: var(--due-soon-bg); color: var(--due-soon-ink);
    display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
  }
  .save { margin-top: 4px; }

  .under :global(.psheet-scrim) { z-index: 650; }
  .under :global(div.psheet) { z-index: 651; }
  .sh { display: flex; flex-direction: column; gap: 10px; padding-bottom: 4px; }
  .sh .p-say, .sh .p-fld, .sh .p-group { margin-bottom: 0; }
  .wide { width: 100%; min-height: 44px; }
  .ok { margin: 0; color: var(--text); background: color-mix(in srgb, var(--success) 14%, transparent); padding: 12px 14px; border-radius: 12px; font-weight: 600; }
  .warn { margin: 0; color: var(--due-soon-ink); background: var(--due-soon-bg); padding: 12px 14px; border-radius: 12px; font-size: 14.5px; }
  .code { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: .2em; text-align: center; color: var(--text); }
  .crow { display: flex; align-items: center; gap: 10px; }
  .cmeta { flex: 1; min-width: 0; font-size: 13.5px; color: var(--muted); }
  .conflict { padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .ctitle { font-weight: 600; font-size: 15px; }
  .ctype { font-weight: 400; color: var(--faint); }
  .cnote { font-size: 13px; color: var(--muted); }
  .cver { border-top: 1px solid var(--border); padding-top: 6px; display: flex; flex-direction: column; gap: 3px; }
  .cfield { display: flex; gap: 8px; font-size: 13px; line-height: 1.45; }
  .cfname { color: var(--faint); min-width: 6rem; flex-shrink: 0; }
  .cfield span:last-child { word-break: break-word; }
  .track { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
  .fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width var(--dur-small) var(--ease-standard); }
  .step { cursor: default; }
  .step.running { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .sicon {
    width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--faint); border: 1.5px solid var(--border-strong);
  }
  .sicon.done { color: var(--success); border-color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .sicon.error { color: var(--danger); border-color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
  .sicon.running { color: var(--accent); border-color: var(--accent); }
  .issues { display: flex; flex-direction: column; gap: 4px; background: var(--surface); border-radius: 12px; padding: 10px 12px; max-height: 160px; overflow-y: auto; font-size: 13px; color: var(--muted); }
  .fname { margin: 0; background: var(--col-bg); padding: 10px 12px; border-radius: 10px; font-size: 13.5px; word-break: break-all; }

  .rscrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 660; }
  .rmodal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 661;
    width: min(400px, calc(100vw - 32px)); max-height: 85dvh; overflow-y: auto;
    background: var(--bg); color: var(--text); border-radius: 22px; padding: 20px 18px;
    display: flex; flex-direction: column; gap: 10px; box-shadow: 0 20px 50px rgba(0,0,0,.3);
  }
  .rmodal h3 { margin: 0; font-size: 18px; }
  .rmodal .p-say { margin: 0; }
  .rcode { font-size: 22px; font-weight: 700; letter-spacing: .08em; text-align: center; color: var(--accent); background: var(--col-bg); border-radius: 12px; padding: 14px; word-break: break-all; }
  .ack { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 15px; cursor: pointer; }
  .ack input { accent-color: var(--accent); width: 20px; height: 20px; margin: 0; }
</style>
