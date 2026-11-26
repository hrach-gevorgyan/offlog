<script lang="ts">
  import { keepVersionPrompt } from '../shared/conflictPrompt';
  import { ICON } from '../shared/iconPaths';
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import AppearanceSettings from '../shared/AppearanceSettings.svelte';
  import NotificationSettings from './settings/NotificationSettings.svelte';
  import SyncSettings from './settings/SyncSettings.svelte';
  import OrganizeSettings from './settings/OrganizeSettings.svelte';
  import DataSettings from './settings/DataSettings.svelte';
  import SecuritySettings from './settings/SecuritySettings.svelte';
  import AdvancedSettings from './settings/AdvancedSettings.svelte';
  import PrivacySettings from './settings/PrivacySettings.svelte';
  import { downloadBlob, freshMaintSteps, formatStorageEstimate, summarizeIssues, parseBackup, type MaintStep } from '../shared/settingsHelpers';
  import { isAutoBackupEnabled, setAutoBackupEnabled, getLastAutoBackupAt, getAutoBackupUsage, listAutoBackups, readAutoBackup, type AutoBackupFile } from '../autoBackup';
  import db, {
    syncState, syncNow, importJSON, analyzeImport, exportProjectDocs, exportTasksCSV,
    getConflicts, resolveConflict, type ConflictInfo, type ConflictVersion,
    getCustomFieldDefs,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    startSync, cancelSync, getDeviceLastSeen,
    runMaintenanceSteps, type IntegrityIssue, type MaintStepResult,
    wipeAndReseed, type ImportedDoc,
  } from '../db';
  import { confirmAction } from '../confirm';
  import { projects as projectsStore } from '../store';
  import { getSyncUrl, setSyncUrl, clearPairedHost, getSyncCredentials, setSyncCredentials, getDeviceName, setDeviceName, isSyncEnabled, setSyncEnabled, getDefaultReminderTime, setDefaultReminderTime, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h, getQuietHours, setQuietHours, getNotificationsEnabled, setNotificationsEnabled, getAutoUpdateCheckEnabled, setAutoUpdateCheckEnabled, isTauri as isTauriCheck, invokeTauri, isAppLockEnabled, setAppLockPin, clearAppLockPin, APP_LOCK_CHANGED, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes, getAppLockHint, isNativePlatform, isAppLockBiometricEnabled, setAppLockBiometricEnabled, syncPrivacyScreen, isHapticsEnabled, setHapticsEnabled, isPrivacyScreenEnabled, setPrivacyScreenEnabled } from '../../config';
  import { fmtLastSynced, localDateStr } from '../utils';
  import { discoveredHosts, isScanning, scanForHosts, stopScan, pairWithHost, type DiscoveredHost } from '../discovery';
  import { checkExactAlarmPermission, rescheduleAll } from '../notifications';
  import { updateState, showUpdateModal, checkForUpdate } from './updateChecker';
  import { showError, modalOpen, announceSyncHost } from '../store';
  import { closeOnBack, isTopLayer } from '../modalStack';
  import { trapFocus } from '../focusTrap';
  import { getThemeMode, setThemeMode, getHighContrast, setHighContrast, getReduceMotion, setReduceMotion, getReduceTransparency, setReduceTransparency, type ThemeMode } from '../theme';
  import { fade, scale } from 'svelte/transition';
  import { scrimIn, scrimOut, dialogIn, dialogOut, centredIn, centredOut, viewIn, exitMs } from '../motion';
  import { fmtConflictValue, conflictFieldLabel, statusNamesOf } from '../shared/conflictFormat';
  // Svelte does not run intro transitions on a component's own root elements
  // when the component itself is being created -- and every panel here is
  // created by a parent's {#if}. Without the gate below no modal animates,
  // however carefully its preset is tuned. Gating the
  // markup on a flag set in onMount() makes the elements the product of an
  // UPDATE inside this component, which is what Svelte animates.
  // See docs/motion.md.
  let __introReady = false;
  onMount(() => { __introReady = true; });

  const dispatch = createEventDispatcher<{ close: void }>();
    // Closing hides the markup first and only tells the parent once the outro
  // has played -- the parent's {#if} destroys this component the instant it
  // hears, which would cut the exit off before its first frame.
  //
  // modalStack is deliberately untouched: closeOnBack() still runs
  // history.back() immediately and unwinds its own entry, so back-button
  // behaviour is identical. Only the parent notification waits.
  //
  // The duration is read HERE, at close time, so Reduce Motion is honoured
  // even if it was switched on after this modal opened.
  const requestClose = closeOnBack(() => {
    __introReady = false;
    setTimeout(() => dispatch('close'), exitMs.medium);
  });

  // Every tab follows one visual language: a plain-language intro line
  // (optional), rows of .setting-row (a label + a toggle/value/button),
  // and .link-row for anything that opens a modal. Anything genuinely
  // multi-step (device pairing, conflict resolution, the maintenance
  // run, import preview) opens as a small modal instead of living
  // permanently in the tab — keeps every tab's default view the same
  // shape regardless of how much a feature actually needs underneath.
  // Exactly one tab (Advanced) is allowed to be technical.
  type Category = 'appearance' | 'notifications' | 'sync' | 'organize' | 'data' | 'security' | 'privacy' | 'advanced';
  const CATEGORIES: { key: Category; label: string; icon: string; vb?: string }[] = [
    { key: 'appearance',    label: 'Appearance',           icon: ICON.sun, vb: '0 0 24 24' },
    { key: 'notifications', label: 'Notifications',        icon: ICON.bell, vb: '0 0 24 24' },
    { key: 'sync',          label: 'Sync',                 icon: ICON.sync, vb: '0 0 24 24' },
    { key: 'organize',      label: 'Organize',             icon: ICON.organize, vb: '0 0 24 24' },
    { key: 'data',          label: 'Backup & restore',     icon: ICON.backup, vb: '0 0 24 24' },
    { key: 'security',      label: 'App lock',             icon: ICON.lock, vb: '0 0 24 24' },
    { key: 'privacy',       label: 'Privacy',              icon: ICON.shield, vb: '0 0 24 24' },
    { key: 'advanced',      label: 'Advanced',             icon: ICON.sliders, vb: '0 0 24 24' },
  ];

  // Multi-step flows open as a modal instead of living inline in a tab.
  let showConnectModal = false;
  let showConflictsModal = false;
  let showMaintenanceModal = false;

  // Mobile (narrow viewport): show the category list first, then a
  // full-width detail view on selection, with an on-screen Back button —
  // there's no room for a real two-column layout on a ~360-400px phone
  // screen. Desktop: both panes visible at once, category just changes
  // which content shows.
  //
  // Entering a detail view on mobile pushes a *second* history layer via
  // closeOnBack (on top of the one this component's own requestClose
  // already pushed for the whole panel) — so hardware/gesture back and
  // Escape both step from detail back to the category list first, and
  // only close Settings entirely on a second press. See modalStack.ts.
  // Lets a caller (e.g. the post-first-run sync invite) open Settings
  // straight into a specific tab instead of always landing on Appearance.
  export let initialCategory: Category | null = null;

  let isNarrow = false;
  let activeCategory: Category | null = null;
  let popDetailLayer: (() => void) | null = null;
  let panelEl: HTMLDivElement;

  onMount(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isNarrow = mq.matches;
    activeCategory = isNarrow ? null : (initialCategory ?? 'appearance');
    const onChange = (e: MediaQueryListEvent) => { isNarrow = e.matches; };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  async function selectCategory(key: Category) {
    if (key === activeCategory) return;
    // Measured FLIP, not a CSS `transition: height` — the panel's height
    // is otherwise auto (content-fit, capped by max-height), and auto
    // can't be transitioned directly. See the .settings-panel CSS comment.
    const fromHeight = panelEl?.getBoundingClientRect().height;
    activeCategory = key;
    if (isNarrow && !popDetailLayer) {
      popDetailLayer = closeOnBack(() => { activeCategory = null; popDetailLayer = null; });
    }
    if (!panelEl || !fromHeight) return;
    await tick();
    const toHeight = panelEl.getBoundingClientRect().height;
    if (Math.abs(toHeight - fromHeight) < 1) return;
    panelEl.style.transition = 'none';
    panelEl.style.height = fromHeight + 'px';
    panelEl.getBoundingClientRect(); // force reflow before re-enabling the transition
    panelEl.style.transition = 'height .28s var(--ease)';
    requestAnimationFrame(() => { panelEl.style.height = toHeight + 'px'; });
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'height') return;
      panelEl.style.height = '';
      panelEl.style.transition = '';
      panelEl.removeEventListener('transitionend', onEnd);
    };
    panelEl.addEventListener('transitionend', onEnd);
  }
  function backToList() {
    if (popDetailLayer) popDetailLayer();
    else activeCategory = null;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // A manager opened from here is a layer of its own and takes this Escape.
    if (spaceManagerActive || tagManagerActive || customFieldManagerActive || archivedProjectsManagerActive) return;
    if (!isTopLayer(requestClose) && !isTopLayer(popDetailLayer)) return;
    // No Escape-to-dismiss while the one-time recovery code is showing —
    // it must be acknowledged via the explicit button below, or someone
    // reflexively hitting Escape loses their only chance to see it.
    if (newRecoveryCode) return;
    if (showConnectModal) { showConnectModal = false; return; }
    if (showConflictsModal) { showConflictsModal = false; return; }
    if (showMaintenanceModal) { showMaintenanceModal = false; return; }
    if (pendingImportDocs) { cancelImport(); return; }
    // PIN sub-flows: back out of just this step, the same as every other
    // modal-within-Settings above. Without these, Escape falls through to
    // the final else and closes the whole panel mid-PIN-entry, or while
    // ConfirmPinGate is asking for the current PIN to change/remove it.
    if (pinGateMode) { pinGateMode = null; return; }
    if (showPinForm) { showPinForm = false; return; }
    if (isNarrow && activeCategory) backToList();
    else requestClose();
  }

  // ── Appearance ──────────────────────────────────────────────────────────
  // Three-way Light/Dark/System, not a boolean toggle — System is the
  // default for anyone who's never touched this setting (see theme.ts's
  // migration). High contrast is a separate toggle, layered on top of
  // whichever of Light/Dark is currently effective.
  let themeMode: ThemeMode = getThemeMode();
  function selectThemeMode(mode: ThemeMode) {
    themeMode = mode;
    setThemeMode(mode);
  }
  let highContrast = getHighContrast();
  function toggleHighContrast() {
    highContrast = !highContrast;
    setHighContrast(highContrast);
  }

  // Manual override on top of OS-level prefers-reduced-motion (see
  // theme.ts's prefersReducedMotion(), read live by motion.ts) — for
  // anyone who finds motion distracting but hasn't touched that system
  // setting. Takes effect on the next transition trigger, no reload needed.
  let reduceTransparency = getReduceTransparency();
  function toggleReduceTransparency() {
    reduceTransparency = !reduceTransparency;
    setReduceTransparency(reduceTransparency);
  }
  let reduceMotion = getReduceMotion();
  function toggleReduceMotion() {
    reduceMotion = !reduceMotion;
    setReduceMotion(reduceMotion);
  }

  // Android only (haptics.ts also checks isNativePlatform(); this toggle
  // just decides whether to show the control at all). Defaults on — see
  // config.ts.
  let hapticsEnabled = isHapticsEnabled();
  function toggleHaptics() {
    hapticsEnabled = !hapticsEnabled;
    setHapticsEnabled(hapticsEnabled);
  }

  // ── Notifications ───────────────────────────────────────────────────────
  const isAndroid = window.Capacitor?.getPlatform?.() === 'android';
  // Master in-app toggle -- same pattern as the Sync tab's own
  // enabled/disabled switch gating its sub-settings.
  // Independent of the OS permission below: that one can only ever be
  // *granted* from in-app (no platform lets you revoke it programmatically,
  // hence no "Disable" button next to "Enable" there) — this is the real
  // on/off switch, config.ts's getNotificationsEnabled().
  let notificationsEnabled = getNotificationsEnabled();
  function toggleNotificationsEnabled() {
    notificationsEnabled = !notificationsEnabled;
    setNotificationsEnabled(notificationsEnabled);
    rescheduleAll().catch(() => {});
  }
  // Default time-of-day used when a task's "remind me on the due date"
  // toggle derives reminder_at — per-device, like the app's other
  // localStorage preferences (see config.ts's getDefaultReminderTime()).
  let defaultReminderTime = getDefaultReminderTime();
  function saveDefaultReminderTime(e: CustomEvent<string>) {
    defaultReminderTime = e.detail;
    setDefaultReminderTime(defaultReminderTime);
  }

  // Quiet hours: reminders due inside this window queue until it ends
  // instead of firing (notifications.ts's applyQuietHours). rescheduleAll()
  // re-applies immediately to any already-pending reminder, same
  // cancel-then-reschedule-from-scratch pattern used after every task
  // write — cheap at this scale, avoids a separate "does this change
  // affect already-scheduled timers" special case.
  let quietHours = getQuietHours();
  function saveQuietHours(patch: Partial<typeof quietHours>) {
    quietHours = { ...quietHours, ...patch };
    setQuietHours(quietHours);
    rescheduleAll().catch(() => {});
  }

  let weekStartsMonday = getWeekStartsMonday();
  function setWeekStart(monday: boolean) {
    weekStartsMonday = monday;
    setWeekStartsMonday(monday);
  }

  // Every clock-time display reads getTimeFormat24h() fresh via utils.ts's
  // fmtTime(), so views already open pick it up on their next render.
  let timeFormat24h = getTimeFormat24h();
  function setTimeFormat(is24h: boolean) {
    timeFormat24h = is24h;
    setTimeFormat24h(is24h);
  }

  // ── App Lock ───────────────────────────────────────────────────────────
  // Immediate-write buttons (like "Reset test data"/"Check for updates"
  // above), not batched into the tab's Save button — PIN entry has its
  // own inline validation/error state that doesn't fit the generic
  // "collect every field, write them all on Save" flow the rest of this
  // panel uses.
  let appLockEnabled = isAppLockEnabled();
  // The lock screen's "Forgot PIN?" clears the PIN while this page may be open.
  function onAppLockChanged() {
    appLockEnabled = isAppLockEnabled();
    biometricEnabled = isAppLockBiometricEnabled();
  }
  onMount(() => {
    window.addEventListener(APP_LOCK_CHANGED, onAppLockChanged);
    return () => window.removeEventListener(APP_LOCK_CHANGED, onAppLockChanged);
  });
  let appLockTimeout = getAppLockTimeoutMinutes();
  let lockTimeoutStr = String(appLockTimeout);
  let showPinForm = false;
  let newPin = '';
  let confirmPin = '';
  let pinHint = '';
  let pinError = '';
  let pinSaving = false;
  // Shown once, right after setAppLockPin() actually generates a new one
  // (only the very first time a PIN is set — see config.ts) — the
  // plaintext code is never persisted anywhere, so this is the only
  // chance the user gets to see and save it.
  let newRecoveryCode: string | null = null;
  let recoveryCodeSavedAck = false;
  let recoveryCopied = false;

  // The code is dense and easy to mistype when re-copied by hand, so it
  // is copied via Clipboard. Falls back to
  // navigator.clipboard on web/desktop, where @capacitor/clipboard's web
  // implementation already wraps it.
  async function copyRecoveryCode() {
    if (!newRecoveryCode) return;
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: newRecoveryCode });
      recoveryCopied = true;
      setTimeout(() => { recoveryCopied = false; }, 2000);
    } catch {
      // Best-effort — the code is still visible on screen either way.
    }
  }

  // Its own control, deliberately not tied to isAppLockEnabled() (see
  // config.ts). OFF by default: Android's FLAG_SECURE (what this sets)
  // blocks ALL screenshots while the app is foregrounded, not just the
  // recents-switcher preview it's meant to hide — too big a side effect
  // to bundle into turning on a PIN.
  let privacyScreenEnabled = isPrivacyScreenEnabled();
  function togglePrivacyScreen() {
    privacyScreenEnabled = !privacyScreenEnabled;
    setPrivacyScreenEnabled(privacyScreenEnabled);
    syncPrivacyScreen();
  }

  let biometricEnabled = isAppLockBiometricEnabled();
  let biometricError = '';
  let biometricBusy = false;
  // Distinguishes "nothing enrolled" from any other failure so the
  // "Open Settings" deep-link only shows when it'd
  // actually help — a wrong-fingerprint or cancelled prompt isn't fixed
  // by visiting enrollment settings.
  let biometricNoneEnrolled = false;

  // Enabling requires a live device check + a real successful prompt —
  // not just flipping a flag — so a device with no fingerprint/face
  // enrolled never silently ends up "enabled" with no way to actually
  // unlock. Biometric sits alongside the PIN: opt-in, Android only.
  // Disabling never needs the device, it just
  // turns the faster path back off; the PIN keeps working either way.
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
      biometricError = 'Could not confirm your fingerprint/face. Please try again.';
    } finally {
      biometricBusy = false;
    }
  }

  // Android's Settings.ACTION_BIOMETRIC_ENROLL needs API 30+; a device
  // between this app's minSdk (24) and 30 doesn't have that action at
  // all, so falls back to the generic (API-1-old) Security settings
  // screen instead of silently doing nothing. @capacitor/app-launcher's
  // openUrl() falls through to `new Intent(url)` when the string isn't a
  // URL or package name, which Android's Intent(String action)
  // constructor treats as a genuine intent action — undocumented plugin
  // behavior, verified in its Android source (AppLauncherPlugin.java).
  async function openBiometricEnrollment() {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const result = await AppLauncher.openUrl({ url: 'android.settings.BIOMETRIC_ENROLL' });
      if (!result.completed) await AppLauncher.openUrl({ url: 'android.settings.SECURITY_SETTINGS' });
    } catch {
      // Best-effort — the inline error message already explains what to do manually.
    }
  }

  function openPinForm() {
    newPin = ''; confirmPin = ''; pinError = '';
    pinHint = getAppLockHint() ?? ''; // pre-fill so changing the PIN doesn't silently drop an existing hint
    showPinForm = true;
  }

  async function savePin() {
    if (!/^\d*$/.test(newPin)) { pinError = 'A PIN is digits only.'; return; }
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
      if (result.recoveryCode) { newRecoveryCode = result.recoveryCode; recoveryCodeSavedAck = false; recoveryCopied = false; }
    } catch {
      pinError = 'Could not save PIN. Please try again.';
    } finally {
      pinSaving = false;
    }
  }

  // Change/Remove both pass through ConfirmPinGate first, proving
  // knowledge of the *current* PIN like any password change. Entering the
  // PIN IS the confirmation — don't add an "are you sure" on top. Initial
  // setup (no PIN exists yet) never gates.
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

  function onLockTimeoutChange(v: string) {
    appLockTimeout = Number(v);
    setAppLockTimeoutMinutes(appLockTimeout);
  }

  // ── Sync ────────────────────────────────────────────────────────────────
  let syncUrl = getSyncUrl();
  // getSyncCredentials() is async (platform-appropriate secure storage,
  // not a synchronous localStorage read) -- seeded empty here, populated
  // in the onMount below rather than blocking component init.
  let credentialUser = '';
  let credentialPass = '';
  onMount(async () => {
    // A secure-storage read can fail on a platform quirk; leave the fields
    // empty rather than letting the rejection escape unhandled.
    try {
      ({ user: credentialUser, pass: credentialPass } = await getSyncCredentials());
    } catch { /* seeded empty above */ }
  });
  let deviceName = getDeviceName();
  let syncEnabled = isSyncEnabled();

  // Plain-language connection status for the main pane — everything below
  // already exists as syncState.status/lastSynced/error, just not
  // surfaced as one human sentence before this.
  //
  // Android is pointed at the "Find my computer" pairing section above,
  // not at "Developer options" — a scary label for a first-time
  // non-technical user. Plain desktop web has no pairing flow, so there
  // the Advanced tab genuinely is the only path and is named as such.
  $: connectionStatus =
    !syncEnabled ? { text: 'Sync is paused.', tone: 'muted' } :
    !syncUrl ? (isAndroid
      ? { text: 'Not connected to another device yet — click "Find my computer" below to connect.', tone: 'muted' }
      : { text: 'Not connected to another device yet — open the Advanced tab to connect one.', tone: 'muted' }) :
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

  // ── Device discovery/pairing ──────────────────────────────────────────────
  // Android: find the PC via mDNS, then exchange a code shown on the PC's
  // own screen for real credentials (discovery.ts's pairWithHost()).
  // Desktop/Tauri: generate that code in the first place.
  const isTauri = isTauriCheck();
  let isTauriDebug = false;
  if (isTauri) {
    invokeTauri<boolean>('is_debug_build').then((v) => { isTauriDebug = v; }).catch(() => {});
  }

  // Ctrl+Alt+O from anywhere. The off state lives on the Rust side, which
  // registers the shortcut before this panel (or any frontend) loads.
  let globalShortcutEnabled = true;
  if (isTauri) {
    invokeTauri<boolean>('get_global_shortcut_enabled').then((v) => { globalShortcutEnabled = v; }).catch(() => {});
  }
  async function toggleGlobalShortcut() {
    const next = !globalShortcutEnabled;
    try {
      await invokeTauri('set_global_shortcut_enabled', { enabled: next });
      globalShortcutEnabled = next;
    } catch {
      showError(next ? 'Could not turn the shortcut on. Another app may be using Ctrl+Alt+O. Please try again.' : 'Could not turn the shortcut off. Please try again.');
    }
  }

  let selectedHost: DiscoveredHost | null = null;
  let pairingCode = '';
  let pairingBusy = false;
  let pairingError = '';
  // "Incorrect or expired code." deliberately never distinguishes a typo
  // from a dead/locked-out code (see discovery.ts's own comment on why),
  // so a repeated failure has to nudge toward the fix generically rather
  // than naming the cause.
  let pairingFailCount = 0;
  // A distinct success state, rather than resetting to the initial "Find
  // my computer" screen: with nothing acknowledging that pairing worked,
  // the modal reads as stuck.
  let pairSuccessName: string | null = null;

  let scanAttempted = false;
  function startDeviceScan() {
    selectedHost = null;
    pairingError = '';
    pairSuccessName = null;
    scanAttempted = true;
    scanForHosts();
  }
  // scanForHosts() runs for a fixed 10s then flips isScanning back to
  // false on its own -- with nothing found, the button reverting to
  // "Find my computer" would be the only signal, indistinguishable from "still
  // running" or "silently failed." True only once a scan has actually
  // completed with zero hosts, so it's not shown before any scan ran.
  $: scanFoundNothing = scanAttempted && !$isScanning && $discoveredHosts.length === 0;

  async function submitPairingCode() {
    if (!selectedHost) return;
    pairingBusy = true;
    pairingError = '';
    try {
      const pairedName = selectedHost.name;
      await pairWithHost(selectedHost, pairingCode);
      syncUrl = getSyncUrl();
      // Required: without it the Advanced tab's form keeps whatever
      // username/password it was mounted with — invisible in the masked
      // password field — so a later "Save & restart sync" overwrites the
      // just-paired credentials with the old ones.
      ({ user: credentialUser, pass: credentialPass } = await getSyncCredentials());
      selectedHost = null;
      pairingCode = '';
      pairSuccessName = pairedName;
      pairingFailCount = 0;
    } catch (e) {
      pairingFailCount++;
      pairingError = e instanceof Error ? e.message : 'Could not pair.';
      if (pairingFailCount >= 3) pairingError += ' Double-check the code on the PC screen, or generate a new one there.';
    } finally {
      pairingBusy = false;
    }
  }

  let pcPairingCode = '';
  let pcPairingBusy = false;
  // Same confirmation need as the phone side above, but the PC has no
  // direct signal that pairing finished — the phone drives that
  // handshake entirely. Polling
  // getDeviceLastSeen() for a name that wasn't there when the code was
  // generated is the only way this side can tell; 3s is frequent enough
  // to feel live without hammering the local DB read.
  let pcPairedDeviceName: string | null = null;
  // Set the instant the "pairing-succeeded" Tauri event arrives (see
  // pairing.rs's own comment) -- true well before pcPairedDeviceName can
  // resolve a real name, since that still depends on the phone's first
  // sync write reaching getDeviceLastSeen(). Success is shown off this
  // flag; the name upgrades in place once the poll below finds it.
  let pcJustPaired = false;
  // An Offlog too old for encrypted sync tried this code (pairing.rs turns
  // it away; that phone can only say "Incorrect or expired code").
  let pcOldAppRefused = false;
  let pcPollTimer: ReturnType<typeof setInterval> | null = null;
  function stopPcPairPoll() {
    if (pcPollTimer) { clearInterval(pcPollTimer); pcPollTimer = null; }
  }
  // Mirrors pairing.rs's own CODE_TTL (5 min) purely for display: the code
  // dies server-side silently, and without this the PC screen kept showing
  // the same digits indefinitely with no cue they'd stopped working, so a
  // user re-reading the (unchanged) code and retyping it correctly on the
  // phone just got "Incorrect or expired code." with no way to tell why.
  let pcPairingExpired = false;
  let pcPairingExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  function clearPcPairingExpiryTimer() {
    if (pcPairingExpiryTimer) { clearTimeout(pcPairingExpiryTimer); pcPairingExpiryTimer = null; }
  }
  async function startPcPairPoll() {
    stopPcPairPoll();
    let before: Set<string>;
    try {
      before = new Set((await getDeviceLastSeen()).map(d => d.device));
    } catch {
      showError('Could not check for a connected device. Please try again.');
      return;
    }
    // Settings can close during the read above; onDestroy has already run.
    if (settingsGone) return;
    pcPollTimer = setInterval(async () => {
      try {
        const now = await getDeviceLastSeen();
        const found = now.find(d => !before.has(d.device));
        if (found) { pcPairedDeviceName = found.device; stopPcPairPoll(); clearPcPairingExpiryTimer(); }
      } catch {
        // Transient read failure -- next tick tries again rather than
        // surfacing an error for every missed 3s poll.
      }
    }, 3000);
  }
  async function generatePcPairingCode() {
    pcPairingBusy = true;
    pcPairedDeviceName = null;
    pcJustPaired = false;
    pcOldAppRefused = false;
    pcPairingExpired = false;
    clearPcPairingExpiryTimer();
    try {
      pcPairingCode = await invokeTauri<string>('generate_pairing_code');
      pcPairingExpiryTimer = setTimeout(() => { pcPairingExpired = true; stopPcPairPoll(); }, 5 * 60 * 1000);
      startPcPairPoll();
    } catch {
      showError('Could not generate a pairing code. Please try again.');
    } finally {
      pcPairingBusy = false;
    }
  }
  // The Rust side emits this the instant the handshake itself succeeds --
  // see pairing.rs's own comment. One listener per Settings mount, removed
  // on close: Settings remounts on every open and the app stays in the tray.
  // Harmless to receive while no code is showing (nothing reads
  // pcJustPaired outside the pcPairingCode-shown states below).
  let unlistenPairing: (() => void) | null = null, unlistenOldApp: (() => void) | null = null, settingsGone = false;
  if (isTauri) {
    import('@tauri-apps/api/event').then(({ listen }) => listen('pairing-succeeded', () => {
      pcJustPaired = true;
      clearPcPairingExpiryTimer();
    })).then(un => { if (settingsGone) un(); else unlistenPairing = un; }).catch(() => {});
    import('@tauri-apps/api/event').then(({ listen }) => listen('pairing-refused-old-app', () => { pcOldAppRefused = true; }))
      .then(un => { if (settingsGone) un(); else unlistenOldApp = un; }).catch(() => {});
  }
  onDestroy(() => { settingsGone = true; unlistenPairing?.(); unlistenOldApp?.(); });
  // Stop polling (and clear any stale success message on either side)
  // once the modal closes, so it doesn't keep running in the background
  // or show last time's result if it's reopened.
  $: if (!showConnectModal) { stopPcPairPoll(); clearPcPairingExpiryTimer(); pcPairedDeviceName = null; pcJustPaired = false; pcOldAppRefused = false; pairSuccessName = null; scanAttempted = false; }
  onDestroy(() => { stopPcPairPoll(); clearPcPairingExpiryTimer(); });

  // Dev-only: wipes this PC's NyxDB data and restarts, so testing "what
  // does a real first-run user see" on a freshly-reinstalled phone
  // doesn't immediately sync down leftover dev/test tasks. The Rust
  // command itself refuses outside a debug build (belt-and-suspenders —
  // this button is also never rendered in a release build, see below).
  let resetBusy = false;
  async function resetPcTestData() {
    const ok = await confirmAction('Delete all tasks/projects on this PC and restart the app?', { confirmLabel: 'Delete everything', danger: true });
    if (!ok) return;
    resetBusy = true;
    try {
      // Two halves, both needed: wipeAndReseed() clears this PC's own
      // local PouchDB (the WebView's IndexedDB), which the Rust-only
      // reset below never touches — it's a completely separate database
      // from the embedded NyxDB server, the same local-first split every
      // device in this app has.
      // Letting sync push the resulting deletion tombstones out first
      // (before the server itself gets wiped) is what actually clears
      // an already-paired phone's copy too, not just this PC's view.
      await wipeAndReseed();
      await syncNow().catch(() => {});
      await invokeTauri('reset_sync_data');
    } catch {
      showError('Could not reset test data. Please try again.');
      resetBusy = false;
    }
  }

  // Renaming this device only affects new writes' `source` field, from the
  // next write on — no reload needed the way changing the sync URL needs one.
  function saveDeviceName() { setDeviceName(deviceName); deviceName = getDeviceName(); announceSyncHost(); }

  let deviceLastSeen: { device: string; lastSeen: string }[] = [];
  let deviceLastSeenLoaded = false;
  async function loadDeviceLastSeen() {
    deviceLastSeenLoaded = true; // set before the await — a genuinely-empty result must not retrigger this every reactive tick
    try {
      deviceLastSeen = await getDeviceLastSeen();
    } catch {
      // Fired from a reactive statement with nothing awaiting it -- an
      // uncaught rejection here becomes the generic crash-net toast
      // (main.ts's unhandledrejection listener) instead of a message that
      // says what actually failed.
      showError('Could not load recent devices. Please try again.');
    }
  }

  let syncStatus = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let lastErrorAt = syncState.lastErrorAt;
  let conflictCount = syncState.conflictCount;
  let syncRejected = syncState.rejected;

  function onSyncChange() {
    syncStatus = syncState.status;
    lastSynced = syncState.lastSynced;
    syncError = syncState.error;
    lastErrorAt = syncState.lastErrorAt;
    conflictCount = syncState.conflictCount;
    syncRejected = syncState.rejected;
  }
  syncState.listeners.add(onSyncChange);
  onDestroy(() => syncState.listeners.delete(onSyncChange));
  onDestroy(() => stopScan());

  let conflictList: ConflictInfo[] = [];
  let loadingConflicts = false;
  // Tracks which conflictCount the last load attempt was for -- not just
  // whether one is in flight. Without this, a failed getConflicts() left
  // conflictList empty and loadingConflicts false, and the reactive
  // trigger below re-fired on every tick forever: a real query failure
  // here span an infinite retry loop that pegs the main thread solid
  // (reproduced: a single rejection OOM'd the whole process under test).
  let conflictsAttemptedFor = -1;
  async function loadConflicts() {
    loadingConflicts = true;
    try {
      conflictList = await getConflicts();
      const defs = await getCustomFieldDefs();
      conflictFieldNames = Object.fromEntries(defs.map(d => [d.id, d.name]));
    } catch {
      // Same reasoning as loadDeviceLastSeen() -- this also fires from a
      // reactive statement with nothing awaiting it.
      showError('Could not load sync conflicts. Please try again.');
    } finally { loadingConflicts = false; }
  }
  async function resolve(c: ConflictInfo, v: ConflictVersion) {
    const ok = await confirmAction(
      keepVersionPrompt(c, v),
      { confirmLabel: 'Keep this one', danger: true },
    );
    if (!ok) return;
    try {
      await resolveConflict(c.docId, v.isCurrent ? 'current' : 'other', v.rev, c.versions.map(x => x.doc._rev));
      await loadConflicts();
      if (!conflictList.length) showConflictsModal = false;
    } catch (e) {
      if ((e as Error)?.name !== 'ConflictChangedError') { showError('Could not resolve conflict. Please try again.'); return; }
      showError((e as Error).message);
      await loadConflicts();
    }
  }

  // Custom values are keyed by field id, so the ids have to be resolved to
  // names or the diff reads as gibberish. Loaded alongside the conflicts.
  let conflictFieldNames: Record<string, string> = {};

  $: if (activeCategory === 'sync' && conflictCount > 0 && conflictCount !== conflictsAttemptedFor && !loadingConflicts) {
    conflictsAttemptedFor = conflictCount;
    loadConflicts();
  }
  $: if (activeCategory === 'sync' && !deviceLastSeenLoaded) loadDeviceLastSeen();

  // ── Organize (Manage Spaces / Manage Tags) ─────────────────────────────
  // All four managers below need the same two things: an error-handled,
  // reentrancy-guarded lazy import (an unguarded import that rejects
  // leaves showX stuck false with no feedback), and an *Session counter
  // folded into their {#key} in the template below — all four call
  // closeOnBack(), so a fast reopen would otherwise revive an instance
  // whose requestClose is already spent and can never close again.
  let SpaceManagerComp: typeof import('./SpaceManager.svelte').default | null = null;
  let showSpaceManager = false;
  let spaceManagerActive = false;
  let spaceManagerSession = 0;
  async function openSpaceManager() {
    if (spaceManagerActive) return;
    spaceManagerActive = true;
    try {
      if (!SpaceManagerComp) SpaceManagerComp = (await import('./SpaceManager.svelte')).default;
      spaceManagerSession++;
      showSpaceManager = true;
    } catch (e) {
      spaceManagerActive = false;
      showError('Could not open Spaces. Please try again.');
    }
  }
  function onSpaceManagerClosed() { showSpaceManager = false; spaceManagerActive = false; }

  let TagManagerComp: typeof import('./TagManager.svelte').default | null = null;
  let showTagManager = false;
  let tagManagerActive = false;
  let tagManagerSession = 0;
  async function openTagManager() {
    if (tagManagerActive) return;
    tagManagerActive = true;
    try {
      if (!TagManagerComp) TagManagerComp = (await import('./TagManager.svelte')).default;
      tagManagerSession++;
      showTagManager = true;
    } catch (e) {
      tagManagerActive = false;
      showError('Could not open Tags. Please try again.');
    }
  }
  function onTagManagerClosed() { showTagManager = false; tagManagerActive = false; }

  let CustomFieldManagerComp: typeof import('./CustomFieldManager.svelte').default | null = null;
  let showCustomFieldManager = false;
  let customFieldManagerActive = false;
  let customFieldManagerSession = 0;
  async function openCustomFieldManager() {
    if (customFieldManagerActive) return;
    customFieldManagerActive = true;
    try {
      if (!CustomFieldManagerComp) CustomFieldManagerComp = (await import('./CustomFieldManager.svelte')).default;
      customFieldManagerSession++;
      showCustomFieldManager = true;
    } catch (e) {
      customFieldManagerActive = false;
      showError('Could not open Fields. Please try again.');
    }
  }
  function onCustomFieldManagerClosed() { showCustomFieldManager = false; customFieldManagerActive = false; }

  // Same lazy-modal pattern as Spaces/Tags/Fields above
  let ArchivedProjectsManagerComp: typeof import('./ArchivedProjectsManager.svelte').default | null = null;
  let showArchivedProjectsManager = false;
  let archivedProjectsManagerActive = false;
  let archivedProjectsManagerSession = 0;
  async function openArchivedProjectsManager() {
    if (archivedProjectsManagerActive) return;
    archivedProjectsManagerActive = true;
    try {
      if (!ArchivedProjectsManagerComp) ArchivedProjectsManagerComp = (await import('./ArchivedProjectsManager.svelte')).default;
      archivedProjectsManagerSession++;
      showArchivedProjectsManager = true;
    } catch (e) {
      archivedProjectsManagerActive = false;
      showError('Could not open Archived projects. Please try again.');
    }
  }
  function onArchivedProjectsManagerClosed() { showArchivedProjectsManager = false; archivedProjectsManagerActive = false; }

  // ── Data ────────────────────────────────────────────────────────────────
  let breakdown: StorageBreakdown | null = null;
  // Kept backups are not in navigator.storage's estimate -- they live outside
  // IndexedDB -- so without this the storage section can call the data "tiny"
  // while several times that sits in the backup folder.
  let backupUsage: { count: number; bytes: number } | null = null;
  async function loadBreakdown() {
    // Fires unawaited from onMount and on every single subscribeDb()
    // change event below -- during active sync that can be rapid-fire, so
    // a real query failure here must not become an unhandled rejection
    // (main.ts's crash-net toast) on every one of them.
    try {
      breakdown = await getStorageBreakdown();
      backupUsage = await getAutoBackupUsage();
    } catch {
      showError('Could not load storage usage. Please try again.');
    }
  }
  onMount(() => {
    loadBreakdown();
    return subscribeDb(() => loadBreakdown());
  });

  // Explain what the quota number actually means (a browser-assigned ceiling based
  // on free disk space, not an Offlog-imposed limit — most users have never
  // seen this number before), and only actually warn once usage is close
  // enough to it to matter. At personal-task-list scale this essentially
  // never fires — PouchDB/IndexedDB storage for one person's tasks is tiny
  // relative to typical quotas — so the default state stays a plain, quiet
  // fact rather than a constant nag.
  let storageInfo = '';
  let storagePercent = 0;
  let storageAvailable = true;
  async function loadStorage() {
    // Fires unawaited from onMount below -- a rejecting estimate() (some
    // WebView/sandboxed contexts refuse it) must not become an unhandled
    // rejection, same reasoning as loadBreakdown() above.
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
  onMount(loadStorage);
  // Re-check on every open, not just at app-start init — the user may have
  // just come back from the OS "Alarms & reminders" settings screen.
  onMount(() => { if (isAndroid) checkExactAlarmPermission(); });

  // The floating Quick Add button hides on the modalOpen store, so every
  // full-screen overlay must set it or the FAB stays visible and
  // clickable on top. Same on/off pattern as CardDetail.
  onMount(() => modalOpen.set(true));
  onDestroy(() => modalOpen.set(false));

  // Guided import: parse + preview counts before writing anything,
  // instead of importing the instant a file is picked. `pendingImportDocs`
  // holds the parsed array between "file chosen" and "user confirms."
  let importStatus = '';
  let pendingImportDocs: ImportedDoc[] | null = null;
  let importPreview: { toCreate: number; toSkip: number; byType: Record<string, number> } | null = null;
  // Backup filenames already carry the scope/date by convention (doBackup()
  // below writes `offlog-<name>-<date>.json`) -- showing the picked file's
  // own name and last-modified time is the only way this preview screen
  // can confirm "yes, this is the file you meant," given the app happily
  // produces several similarly-named backups on the same device (today's
  // auto-backup vs. last week's manual export).
  let importFileName = '';
  let importFileModified = '';

  function handleImport() {
    if (importBusy) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        previewBackup(parseBackup(await file.text()), file.name, file.lastModified ? new Date(file.lastModified).toISOString() : '');
      } catch (e) {
        importStatus = e instanceof Error ? e.message : "That doesn't look like an Offlog backup file.";
        setTimeout(() => { importStatus = ''; }, 4000);
      }
    };
    input.click();
  }


  function previewBackup(docs: ImportedDoc[], name: string, modifiedIso: string) {
    pendingImportDocs = docs;
    importPreview = analyzeImport(docs);
    importFileName = name;
    importFileModified = modifiedIso ? fmtLastSynced(modifiedIso) : '';
  }

  // The daily safety copies kept on this device, newest first; one opens in
  // the same preview as a picked file.
  let autoBackups: AutoBackupFile[] = [];
  listAutoBackups().then(l => (autoBackups = l), () => {});
  async function openAutoBackup(b: AutoBackupFile) {
    if (importBusy) return;
    try {
      previewBackup(parseBackup(await readAutoBackup(b.name)), 'Daily safety copy', b.at);
    } catch (e) {
      importStatus = e instanceof Error && e.message.startsWith('That') ? e.message : 'Could not open that backup. Please try again.';
      setTimeout(() => { importStatus = ''; }, 4000);
    }
  }

  function cancelImport() { pendingImportDocs = null; importPreview = null; importFileName = ''; importFileModified = ''; }

  // Closing the preview modal doesn't wait on importJSON() -- it's fire-
  // and-forget from here so the UI doesn't hang on a big restore. Without
  // this flag, "Choose backup file" stayed clickable underneath while that
  // import was still running, letting a second one start concurrently.
  let importBusy = false;
  async function confirmImport() {
    if (!pendingImportDocs) return;
    const docs = pendingImportDocs;
    pendingImportDocs = null; importPreview = null; importFileName = ''; importFileModified = '';
    importBusy = true;
    try {
      importStatus = 'Importing…';
      const { ok, skipped } = await importJSON(docs);
      importStatus = `Restored ${ok} item${ok === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}`;
    } catch {
      importStatus = 'Could not import. Please try again.';
      showError('Could not import. Please try again.');
    }
    // The outcome stays until the next restore: a timed-out line was easy to miss.
    importBusy = false;
  }

  // Two groups: "Back up" (scope — everything vs one project — is a
  // single control, not implied by which button you tap) and "Restore".
  // CSV stays a separate, clearly-labeled one-way export: it isn't
  // round-trippable, so it doesn't belong in the Back up / Restore pair.
  let autoBackupEnabled = isAutoBackupEnabled();
  let lastAutoBackupAt = getLastAutoBackupAt();
  function toggleAutoBackup() {
    autoBackupEnabled = !autoBackupEnabled;
    setAutoBackupEnabled(autoBackupEnabled);
  }

  let backupScope = ''; // '' = everything
  $: backupScopeOptions = [{ value: '', label: 'Everything' }, ...$projectsStore.map(p => ({ value: p._id!, label: p.name }))];
  async function doBackup() {
    try {
      const docs = backupScope
        ? await exportProjectDocs(backupScope)
        // attachments inlined as base64 rather than left as stubs -- see
        // autoBackup.ts's collectBackupJson() for why a stub makes the
        // whole restore fail, not just lose the file.
        : (await db.allDocs({ include_docs: true, attachments: true, binary: false })).rows.map(r => r.doc).filter(d => !!d && !d._id.startsWith('_'));
      const name = backupScope ? ($projectsStore.find(p => p._id === backupScope)?.name.toLowerCase().replace(/\s+/g, '-') ?? 'project') : 'backup';
      await downloadBlob(JSON.stringify(docs, null, 2), 'application/json', `offlog-${name}-${localDateStr(new Date())}.json`);
    } catch {
      showError('Could not back up. Please try again.');
    }
  }

  async function doExportCSV() {
    try {
      const csv = await exportTasksCSV();
      await downloadBlob(csv, 'text/csv', `offlog-tasks-${localDateStr(new Date())}.csv`);
    } catch {
      showError('Could not export CSV. Please try again.');
    }
  }

  // ── Maintenance: lives in Advanced as a "Run maintenance" modal rather
  // than its own tab — the step list/progress bar is the clearest case
  // for this file's multi-step-flows-open-as-a-modal rule ──
  let maintRunning = false;
  let maintSteps: MaintStep[] = [];
  let maintRemainingIssues: IntegrityIssue[] = [];

  // tauri.conf.json's plugins.updater block points at a signed endpoint
  // (GitHub Releases' "latest" download URL) with a pubkey from
  // `cargo tauri signer generate`. The check/download/install state
  // machine lives in updateChecker.ts (shared with App.svelte's
  // background check + banner); this panel just drives it and shows its
  // own status line for the "you're on the latest version" / error cases
  // the shared UpdateModal doesn't cover (it only appears once an update
  // exists).
  let updateChecking = false;
  let updateStatus = '';
  let appVersion = '';
  if (isTauri) {
    import('@tauri-apps/api/app').then(({ getVersion }) => getVersion()).then(v => { appVersion = v; }).catch(() => {});
  } else if (isNativePlatform()) {
    import('@capacitor/app').then(({ App }) => App.getInfo()).then(info => { appVersion = info.version; }).catch(() => {});
  }
  async function onCheckForUpdate() {
    if ($updateState.phase === 'ready' || $updateState.phase === 'downloading') { showUpdateModal.set(true); return; }
    updateChecking = true;
    updateStatus = '';
    await checkForUpdate();
    updateChecking = false;
    if ($updateState.phase === 'available') { showUpdateModal.set(true); }
    else if ($updateState.phase === 'idle') { updateStatus = "You're on the latest version."; }
    else if ($updateState.phase === 'error') { updateStatus = $updateState.error ?? 'Could not check for updates right now.'; }
  }
  let autoUpdateCheckEnabled = getAutoUpdateCheckEnabled();
  function toggleAutoUpdateCheck() {
    autoUpdateCheckEnabled = !autoUpdateCheckEnabled;
    setAutoUpdateCheckEnabled(autoUpdateCheckEnabled);
  }

  maintSteps = freshMaintSteps();

  function setMaintStep(key: MaintStepResult['key'], patch: Partial<MaintStep>) {
    maintSteps = maintSteps.map(s => s.key === key ? { ...s, ...patch } : s);
  }

  // Step sequencing/message-formatting lives in db.ts's
  // runMaintenanceSteps() — testable directly against a
  // mocked db.ts, without mounting this whole file. This is just the thin
  // UI wiring: forward each emitted step into the reactive step list, and
  // handle the one thing that's genuinely this component's job (marking
  // whichever step was running when something threw).
  // Cancellation is cooperative: runMaintenanceSteps polls this between
  // steps, so whichever step is already in flight still finishes.
  let maintCancelled = false;
  // What the check step found, kept so the modal can show it after the run
  // rather than only inside the confirm dialog the user already dismissed.
  let maintFoundIssues: IntegrityIssue[] = [];

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
          // Repair rewrites documents and drops conflicting revisions with
          // no undo, so it asks first rather than doing it on the way past --
          // and names what it found, since "12 problems" tells nobody what
          // is about to change.
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
      await loadBreakdown();
    } catch {
      const runningIdx = maintSteps.findIndex(s => s.status === 'running');
      if (runningIdx >= 0) setMaintStep(maintSteps[runningIdx].key, { status: 'error', note: 'Could not finish. Please try again.' });
      showError('Could not finish maintenance. Please try again.');
    } finally {
      maintRunning = false;
      maintCancelled = false;
    }
  }

  $: maintProgress = Math.round((maintSteps.filter(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length / (maintSteps.length || 1)) * 100);

  // Reload only when the sync URL/credentials actually changed. Every tab
  // shares one footer Save button, but every OTHER tab's settings apply
  // live on interaction (theme, reminders, App Lock all call their
  // setters directly); only syncUrl/credentialUser/credentialPass are
  // buffered waiting for Save. Reloading unconditionally forces a full
  // page reload for nothing — and with App Lock on it re-triggers the
  // cold-start lock check, which reads as "Save opens the PIN screen".
  async function saveSettings() {
    let storedUser = '', storedPass = '';
    try {
      ({ user: storedUser, pass: storedPass } = await getSyncCredentials());
    } catch {
      // Secure-storage read failed (e.g. a Tauri/Android platform quirk)
      // -- fall through treating it as "nothing stored yet" so a save
      // still goes through rather than getting stuck.
    }
    const syncChanged = syncUrl !== getSyncUrl() || credentialUser !== storedUser || credentialPass !== storedPass;
    if (syncChanged) {
      // A server typed in by hand syncs readable; initTauriSyncDefaults gives
      // the key back on reload if this is still the built-in one.
      if (syncUrl !== getSyncUrl()) clearPairedHost();
      setSyncUrl(syncUrl);
      try {
        await setSyncCredentials(credentialUser, credentialPass);
      } catch {
        showError('Could not save sync credentials securely. Please try again.');
        return;
      }
      requestClose();
      location.reload();
      return;
    }
    requestClose();
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
{#if __introReady}
<div class="settings-overlay" on:click|self={() => requestClose()} in:fade={scrimIn} out:fade={scrimOut}>
  <div class="settings-panel" role="dialog" aria-modal="true" aria-label="Settings" bind:this={panelEl} use:trapFocus in:scale={centredIn} out:scale={centredOut}>
    <div class="settings-body" class:detail-open={activeCategory !== null}>
      <nav class="settings-nav" aria-label="Settings sections">
        <h3 class="nav-title">Settings</h3>
        {#each CATEGORIES as cat (cat.key)}
          <button class="nav-item" class:active={activeCategory === cat.key} aria-current={activeCategory === cat.key ? 'page' : undefined} on:click={() => selectCategory(cat.key)}>
            <svg viewBox={cat.vb ?? '0 0 18 18'} width="16" height="16" fill="none" stroke="currentColor" stroke-width={cat.vb ? 1.8 : 1.5} stroke-linecap="round" stroke-linejoin="round">{@html cat.icon}</svg>
            <span>{cat.label}</span>
            {#if cat.key === 'sync' && conflictCount > 0}<span class="nav-badge">{conflictCount}</span>{/if}
            <svg class="chevron" viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
          </button>
        {/each}
      </nav>

      <div class="settings-detail">
        {#if activeCategory}
          <div class="detail-head">
            <button class="back-btn" on:click={backToList} aria-label="Back to categories">
              <svg viewBox="0 0 8 14" width="9" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="7,1 1,7 7,13"/></svg>
              Back
            </button>
            <span class="detail-title">{CATEGORIES.find(c => c.key === activeCategory)?.label}</span>
          </div>

          <div class="detail-content">
            {#key activeCategory}
            <div class="detail-fade" in:fade={viewIn}>
            {#if activeCategory === 'appearance'}
              <AppearanceSettings
                {themeMode} {selectThemeMode} {weekStartsMonday} {setWeekStart}
                {timeFormat24h} {setTimeFormat} {highContrast} {toggleHighContrast}
                {reduceMotion} {toggleReduceMotion} {reduceTransparency} {toggleReduceTransparency} {hapticsEnabled} {toggleHaptics}
              />

            {:else if activeCategory === 'notifications'}
              <NotificationSettings
                {isAndroid} {isTauri} {notificationsEnabled} {toggleNotificationsEnabled}
                {defaultReminderTime} {saveDefaultReminderTime} {quietHours} {saveQuietHours}
              />

            {:else if activeCategory === 'sync'}
              <SyncSettings
                {isAndroid} {isTauri} {syncEnabled} {toggleSyncEnabled} {connectionStatus}
                bind:showConnectModal bind:showConflictsModal
                bind:deviceName {saveDeviceName} {deviceLastSeen} {conflictCount} {conflictList} rejected={syncRejected}
              />

            {:else if activeCategory === 'organize'}
              <OrganizeSettings
                {openSpaceManager} {openTagManager}
                {openCustomFieldManager} {openArchivedProjectsManager}
              />

            {:else if activeCategory === 'data'}
              <DataSettings {backupUsage}
                {storageAvailable} {storagePercent} {storageInfo} {breakdown}
                {autoBackupEnabled} {toggleAutoBackup} {lastAutoBackupAt}
                bind:backupScope {backupScopeOptions} {doBackup} {doExportCSV}
                {importStatus} {handleImport} {importBusy} {autoBackups} {openAutoBackup}
              />

            {:else if activeCategory === 'security'}
              <SecuritySettings
                {appLockEnabled} bind:showPinForm {openPinForm}
                bind:newPin bind:confirmPin bind:pinHint {pinError} {pinSaving} {savePin}
                bind:pinGateMode {onPinGateVerified}
                bind:lockTimeoutStr {onLockTimeoutChange}
                {biometricEnabled} {biometricBusy} {biometricError} {biometricNoneEnrolled}
                {toggleBiometric} {openBiometricEnrollment}
                {privacyScreenEnabled} {togglePrivacyScreen}
              />

            {:else if activeCategory === 'privacy'}
              <PrivacySettings />
            {:else if activeCategory === 'advanced'}
              <AdvancedSettings
                {isTauri} {isTauriDebug} bind:showMaintenanceModal
                {autoUpdateCheckEnabled} {toggleAutoUpdateCheck} {appVersion}
                {globalShortcutEnabled} {toggleGlobalShortcut}
                {updateChecking} {updateStatus} {onCheckForUpdate}
                {syncEnabled} bind:syncUrl bind:credentialUser bind:credentialPass
                {syncError} {lastErrorAt} {resetBusy} {resetPcTestData}
              />
            {/if}
            </div>
            {/key}
          </div>
        {/if}
      </div>
    </div>

    <div class="settings-actions">
      {#if activeCategory === 'advanced' && syncEnabled}
        <!-- The only tab with anything actually buffered -- see
             saveSettings()'s comment below. -->
        <button on:click={() => requestClose()}>Cancel</button>
        <button class="save-btn" on:click={saveSettings}>Save &amp; restart sync</button>
      {:else}
        <!-- Every other tab applies and persists on click, so this says
             "Done", not "Save": a Save here reads as "changes don't count
             until pressed". saveSettings() stays the handler (not a bare
             requestClose()): it's a no-op when nothing's buffered, so this
             stays correct if that ever changes. -->
        <button class="save-btn" on:click={saveSettings}>Done</button>
      {/if}
    </div>
  </div>
</div>

{#if showConnectModal}
  <div class="mini-modal-scrim" on:click|self={() => showConnectModal = false} in:fade={scrimIn} out:fade={scrimOut}>
    <div class="mini-modal" use:trapFocus role="dialog" aria-modal="true" aria-label="Connect a device" in:dialogIn out:dialogOut>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Connect a device</span>
        <button class="mini-modal-close" on:click={() => showConnectModal = false} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        {#if isAndroid}
          {#if pairSuccessName}
            <p class="setting-hint success-hint">✓ Connected to "{pairSuccessName}" — syncing now.</p>
          {:else if !selectedHost}
            <button class="export-btn" on:click={startDeviceScan} disabled={$isScanning}>
              {$isScanning ? 'Looking for your computer…' : 'Find my computer'}
            </button>
            {#each $discoveredHosts as host (host.uuid)}
              <div class="setting-row">
                <span class="storage-info">Found "{host.name}"</span>
                <button class="export-btn" on:click={() => { selectedHost = host; stopScan(); }}>Connect</button>
              </div>
            {/each}
            {#if scanFoundNothing}
              <p class="setting-hint setting-hint-warn">No computer found. Make sure Sync is turned on there and both devices are on the same Wi-Fi network, then try again.</p>
            {/if}
          {:else}
            <p class="setting-hint">Enter the code shown on the "{selectedHost.name}" screen.</p>
            <label class="field-label">
              Pairing code
              <input bind:value={pairingCode} placeholder="123456" inputmode="numeric" maxlength="6" disabled={pairingBusy} />
            </label>
            {#if pairingError}<p class="setting-hint setting-hint-warn">{pairingError}</p>{/if}
          {/if}
        {:else if isTauri}
          {#if pcPairedDeviceName}
            <p class="setting-hint success-hint">✓ Connected to "{pcPairedDeviceName}" — syncing now.</p>
          {:else if pcJustPaired}
            <!-- The name isn't known yet -- pairing-succeeded fires before
                 the phone's first sync write ever reaches
                 getDeviceLastSeen(), which is the only way this side
                 learns a device's chosen name. The poll above keeps
                 running and upgrades this to the named message once it
                 resolves. -->
            <p class="setting-hint success-hint">✓ A device just connected — syncing now.</p>
          {:else if pcPairingCode && pcPairingExpired}
            <p class="setting-hint setting-hint-warn">This code has expired. Generate a new one below.</p>
          {:else if pcPairingCode}
            <p class="setting-hint">Enter this code on your phone (Settings → Sync → Find my computer):</p>
            <p class="storage-info pairing-code">{pcPairingCode}</p>
            <p class="setting-hint">Valid for 5 minutes, one-time use — this updates automatically once your phone connects.</p>
            {#if pcOldAppRefused}<p class="setting-hint setting-hint-warn">A phone with an older Offlog tried this code. Update Offlog on the phone, then enter the code again.</p>{/if}
          {:else}
            <p class="setting-hint">Generates a one-time code to enter on your phone (Settings → Sync → "Find my computer"), so it can connect to this PC.</p>
          {/if}
        {/if}
      </div>
      <!-- Every other mini-modal in Settings pins its primary action(s) to
           a footer, separated from the scrolling body; this one does too. The scan list's "Find
           my computer"/per-host "Connect" and desktop's "Generate a code"
           stay in the body: those build/refresh a list rather than close
           the dialog, the same distinction that keeps Conflicts' Refresh
           and per-item "Keep this" inline too. -->
      {#if isAndroid && pairSuccessName}
        <div class="mini-modal-actions">
          <button class="btn-primary" on:click={() => showConnectModal = false}>Done</button>
        </div>
      {:else if isAndroid && selectedHost}
        <div class="mini-modal-actions">
          <button class="export-btn" on:click={() => { selectedHost = null; pairingCode = ''; pairingError = ''; pairingFailCount = 0; }} disabled={pairingBusy}>Cancel</button>
          <button class="btn-primary" on:click={submitPairingCode} disabled={pairingBusy || pairingCode.trim().length !== 6}>
            {pairingBusy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      {:else if isTauri && (pcPairedDeviceName || pcJustPaired)}
        <!-- Matches Android's own success state: an explicit close now
             that pairing actually finished, instead of leaving "Generate
             a new code" as the only visible control and making someone
             reach for the modal's own ✕ to confirm they're done. -->
        <div class="mini-modal-actions">
          <button class="btn-primary" on:click={() => showConnectModal = false}>Done</button>
        </div>
      {:else if isTauri}
        <div class="mini-modal-actions">
          <button class="export-btn" on:click={generatePcPairingCode} disabled={pcPairingBusy}>
            {pcPairingBusy ? 'Generating…' : pcPairingCode ? 'Generate a new code' : 'Generate a code'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showConflictsModal}
  <div class="mini-modal-scrim" on:click|self={() => showConflictsModal = false} in:fade={scrimIn} out:fade={scrimOut}>
    <div class="mini-modal" use:trapFocus role="dialog" aria-modal="true" aria-label="Resolve conflicts" in:dialogIn out:dialogOut>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Resolve conflicts</span>
        <button class="mini-modal-close" on:click={() => showConflictsModal = false} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        <div class="setting-row">
          <span class="storage-info">
            {#if loadingConflicts}Loading…
            {:else if conflictList.length}{conflictList.length} item{conflictList.length === 1 ? '' : 's'} edited on two devices
            {:else if conflictCount}{conflictCount} conflict{conflictCount === 1 ? '' : 's'}
            {:else}No conflicts left{/if}
          </span>
          <button class="export-btn" on:click={loadConflicts} disabled={loadingConflicts}>Refresh</button>
        </div>
        {#each conflictList as c (c.docId)}
          <div class="conflict-item">
            <div class="conflict-item-title">{c.label} <span class="conflict-item-type">({c.type})</span></div>
            {#if c.differing.length}
              <div class="conflict-diff-note">
                Differs in {c.differing.map(conflictFieldLabel).join(', ')} — keeping one discards the other{c.versions.length > 2 ? 's' : ''}.
              </div>
            {:else}
              <div class="conflict-diff-note">Same content on every device — keep either.</div>
            {/if}
            {#each c.versions as v (v.rev || 'current')}
              <div class="conflict-version">
                <div class="conflict-item-row">
                  <span class="conflict-item-meta"
                        title={v.isNewest ? "Latest by this device's own clock — a device set to the wrong time can claim this wrongly, so check the values below" : ''}>
                    {v.doc.source ?? 'Unknown device'}{v.doc.source === deviceName ? ' (this device)' : ''}{v.isCurrent ? ' · shown now' : ''}{v.isNewest ? ' · newest' : ''}
                    — updated {fmtLastSynced(String(v.doc.updated_at ?? v.doc.created_at ?? ''))}
                  </span>
                  <button class="export-btn" on:click={() => resolve(c, v)}>Keep this</button>
                </div>
                {#each c.differing as f}
                  <div class="conflict-field">
                    <span class="conflict-field-name">{conflictFieldLabel(f)}</span>
                    <span class="conflict-field-value">{fmtConflictValue(f, v.doc[f], conflictFieldNames, statusNamesOf($projectsStore))}</span>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if showMaintenanceModal}
  <div class="mini-modal-scrim" on:click|self={() => showMaintenanceModal = false} in:fade={scrimIn} out:fade={scrimOut}>
    <div class="mini-modal" use:trapFocus role="dialog" aria-modal="true" aria-label="Maintenance" in:dialogIn out:dialogOut>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Maintenance</span>
        <button class="mini-modal-close" on:click={() => showMaintenanceModal = false} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        <p class="setting-hint">
          Runs a full check in order: looks for problems with your data, repairs what it safely can,
          clears old activity history (6+ months) and old Recycle bin items (3+ months), then frees up
          the space they were using.
        </p>

        <div class="progress-track"><div class="progress-fill" style="width:{maintProgress}%"></div></div>

        <div class="maint-steps">
          {#each maintSteps as step (step.key)}
            <div class="maint-step" class:running={step.status === 'running'}>
              <span class="maint-step-icon" class:done={step.status === 'done'} class:skipped={step.status === 'skipped'} class:error={step.status === 'error'} class:running={step.status === 'running'}>
                {#if step.status === 'done'}✓
                {:else if step.status === 'skipped'}–
                {:else if step.status === 'error'}✕
                {:else if step.status === 'running'}<span class="spinner"></span>
                {/if}
              </span>
              <span class="maint-step-label">{step.label}</span>
              {#if step.note}<span class="maint-step-note">{step.note}</span>{/if}
            </div>
          {/each}
        </div>

        {#if maintFoundIssues.length > 0}
          <div class="integrity-list">
            {#each summarizeIssues(maintFoundIssues) as group}
              <div class="integrity-row">{group.text}{group.manual ? ' — needs your review' : ''}</div>
            {/each}
          </div>
          <p class="setting-hint">What the check found.</p>
        {/if}

        {#if maintRemainingIssues.length > 0}
          <div class="integrity-list">
            {#each maintRemainingIssues.slice(0, 8) as issue}
              <div class="integrity-row">{issue.description}</div>
            {/each}
          </div>
          <p class="setting-hint">These need manual review — not safe to fix automatically.</p>
        {/if}
      </div>
      <div class="mini-modal-actions">
        {#if maintRunning}
          <button class="export-btn" on:click={() => maintCancelled = true} disabled={maintCancelled}
                  title={maintCancelled ? 'The step already running has to finish first' : 'Stop after the current step'}>
            {maintCancelled ? 'Stopping after this step…' : 'Cancel'}
          </button>
        {/if}
        <button class="btn-primary" on:click={runMaintenance} disabled={maintRunning}>
          {maintRunning ? 'Running…' : maintSteps.some(s => s.status === 'done') ? 'Run Again' : 'Run Maintenance'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if importPreview}
  <div class="mini-modal-scrim" on:click|self={cancelImport} in:fade={scrimIn} out:fade={scrimOut}>
    <div class="mini-modal" use:trapFocus role="dialog" aria-modal="true" aria-label="Restore from backup" in:dialogIn out:dialogOut>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Restore from backup</span>
        <button class="mini-modal-close" on:click={cancelImport} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        {#if importFileName}
          <p class="setting-hint import-filename">
            <strong>{importFileName}</strong>{#if importFileModified}&nbsp;— modified {importFileModified}{/if}
          </p>
        {/if}
        <p class="setting-hint">
          Will restore <strong>{importPreview.byType.space}</strong> space{importPreview.byType.space === 1 ? '' : 's'},
          <strong>{importPreview.byType.project}</strong> project{importPreview.byType.project === 1 ? '' : 's'},
          <strong>{importPreview.byType.task}</strong> task{importPreview.byType.task === 1 ? '' : 's'}{#if importPreview.toSkip > 0} — <strong>{importPreview.toSkip}</strong> unrecognized entr{importPreview.toSkip === 1 ? 'y' : 'ies'} will be skipped{/if}.
          Anything you already have that is also in this backup goes back to the backup's version, not a copy, so changes made to it since are replaced.
          Anything created after the backup stays as it is.
        </p>
      </div>
      <div class="mini-modal-actions">
        <button class="export-btn" on:click={cancelImport}>Cancel</button>
        <button class="btn-primary" on:click={confirmImport}>Import {importPreview.toCreate} item{importPreview.toCreate === 1 ? '' : 's'}</button>
      </div>
    </div>
  </div>
{/if}

{#if newRecoveryCode}
  <!-- No click-outside-to-close (no on:click|self here) and Escape is
       blocked in onWindowKeydown above — this can ONLY be dismissed via
       the explicit checkbox + button below. The code is shown exactly
       once; there's no "view it again later" since only its hash is
       ever stored (config.ts). -->
  <div class="mini-modal-scrim" in:fade={scrimIn} out:fade={scrimOut}>
    <div class="mini-modal recovery-modal" use:trapFocus role="dialog" aria-modal="true" aria-label="Save your recovery code" in:dialogIn out:dialogOut>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Save your recovery code</span>
      </div>
      <div class="mini-modal-body">
        <p class="setting-hint">
          If you forget your PIN, this code is the only way back into Offlog — there's no
          account to reset it through. Save it somewhere safe now (a password manager, a note,
          written down). It will not be shown again.
        </p>
        <div class="recovery-code">{newRecoveryCode}</div>
        <button class="export-btn recovery-copy-btn" on:click={copyRecoveryCode}>{recoveryCopied ? 'Copied' : 'Copy'}</button>
        <label class="recovery-ack-row">
          <input type="checkbox" bind:checked={recoveryCodeSavedAck} />
          I've saved this code somewhere safe
        </label>
      </div>
      <div class="mini-modal-actions">
        <button class="btn-primary" on:click={() => newRecoveryCode = null} disabled={!recoveryCodeSavedAck}>Continue</button>
      </div>
    </div>
  </div>
{/if}

{#if showSpaceManager && SpaceManagerComp}
  {#key spaceManagerSession}
    <svelte:component this={SpaceManagerComp} on:close={onSpaceManagerClosed} />
  {/key}
{/if}

{#if showTagManager && TagManagerComp}
  {#key tagManagerSession}
    <svelte:component this={TagManagerComp} on:close={onTagManagerClosed} />
  {/key}
{/if}
{#if showCustomFieldManager && CustomFieldManagerComp}
  {#key customFieldManagerSession}
    <svelte:component this={CustomFieldManagerComp} on:close={onCustomFieldManagerClosed} />
  {/key}
{/if}
{#if showArchivedProjectsManager && ArchivedProjectsManagerComp}
  {#key archivedProjectsManagerSession}
    <svelte:component this={ArchivedProjectsManagerComp} on:close={onArchivedProjectsManagerClosed} />
  {/key}
{/if}
{/if}

<style>
  .settings-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    display: flex; align-items: center; justify-content: center; z-index: 200;
    padding: env(safe-area-inset-top, 0px) 1rem env(safe-area-inset-bottom, 0px);
  }
  .settings-panel {
    /* This panel is a sibling of <aside class="sidebar">, not a descendant —
       it already inherits the real global :root/body.dark variables
       directly. No local overrides needed. */
    background: var(--surface); border: 1px solid var(--glass-edge); border-radius: var(--radius);
    width: min(640px, 92vw);
    display: flex; flex-direction: column;
    box-shadow: var(--elev-3);
    /* Height fits content (not fixed) — a short tab like Organize or the
       mobile category list shouldn't leave a wall of empty space just to
       match a longer tab's height. Capped so a tab that outgrows this
       (future settings) scrolls inside .detail-content instead of the
       whole modal growing past a sane size. The actual tab-to-tab resize
       is animated from selectCategory() in the script above — a plain
       CSS `transition: height` can't animate an
       otherwise-auto-sized element, so it's done as a measured FLIP
       (capture old height, let Svelte re-render, measure new height,
       animate between the two pixel values, then release back to auto).
       This keeps the "fits content" behavior; it just makes the jump
       smooth instead of instant. */
    max-height: min(85vh, 640px);
    overflow: hidden;
  }
  /* One steady size on desktop: tabs switch inside it instead of the panel
     jumping to each tab's height. */
  @media (min-width: 641px) { .settings-panel { height: min(85vh, 640px); } }

  .settings-body { display: flex; flex: 1; min-height: 0; }
  /* The phone's grouped look: a tinted page under the tab, white cards on it. */
  .settings-detail { background: var(--bg); }

  .settings-nav {
    width: 190px; flex-shrink: 0; display: flex; flex-direction: column; gap: .1rem;
    border-right: 1px solid var(--border); padding: 1.1rem .6rem; overflow-y: auto;
  }
  .nav-title { margin: 0 0 .5rem; padding: 0 .5rem; font-size: var(--fs-xl); letter-spacing: -.01em; }
  .nav-item {
    display: flex; align-items: center; gap: .55rem;
    background: none; border: none; cursor: pointer; text-align: left;
    padding: .55rem .55rem; border-radius: var(--radius-sm);
    color: var(--muted); font-size: var(--fs-m); font-weight: 500;
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .nav-item svg { flex-shrink: 0; opacity: .8; }
  .nav-item span { flex: 1; }
  .nav-item:hover { background: var(--hover); }
  .nav-item.active { background: var(--sel-fill); color: var(--text); box-shadow: var(--sel-ring); }
  .nav-item.active svg { opacity: 1; color: var(--accent); }
  .nav-badge, .detail-content :global(.nav-badge) {
    font-family: var(--mono); font-size: var(--fs-2xs); font-weight: 700;
    background: var(--due-soon-bg); color: var(--due-soon-ink);
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
    line-height: 1;
  }
  /* `.nav-item span{flex:1}` above (class+element, specificity 11) beats
     plain `.nav-badge` (specificity 10) regardless of source order, so
     this badge stretched to fill the row instead of sizing to its own
     content -- needs the extra class in the selector to actually win. */
  .nav-item .nav-badge {
    flex: 0 0 auto;
  }
  .chevron { display: none; flex-shrink: 0; opacity: .5; }

  .settings-detail { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .detail-head { display: none; align-items: center; gap: .5rem; padding: 1rem 1.25rem .5rem; flex-shrink: 0; }
  .detail-title { font-weight: 700; font-size: var(--fs-l); }
  .back-btn {
    display: none; align-items: center; gap: .2rem;
    background: none; border: none; cursor: pointer; color: var(--accent);
    font-size: var(--fs-m); font-weight: 600; padding: .2rem;
  }
  .detail-content {
    flex: 1; overflow-y: auto; padding: 1.25rem 1.4rem;
    display: flex; flex-direction: column;
  }
  /* Wraps each tab's content so switching tabs fades it in — without it
     the outer panel resize animates while the content pops instantly.
     Carries the flex/gap, since this wrapper holds the content. */
  .detail-fade {
    display: flex; flex-direction: column; gap: 1rem;
  }

  /* Narrow: category list OR full-width detail, never both — see the
     script comment for why a two-column squeeze fails on phones. */
  @media (max-width: 640px) {
    .settings-panel { width: 94vw; max-height: min(88vh, 640px); }
    .settings-nav { width: 100%; border-right: none; }
    .settings-detail { display: none; }
    .settings-body.detail-open .settings-nav { display: none; }
    .settings-body.detail-open .settings-detail { display: flex; width: 100%; }
    .detail-head { display: flex; }
    .back-btn { display: inline-flex; }
    .chevron { display: block; }
  }

  /* Every group of related rows is a card, giving each tab visual
     structure instead of loose rows on the panel background. The fill is
     a subtle tint off --text, not a flat var(--bg): --bg is *darker* than
     the panel's own --surface in dark mode, so a flat fill reads as a
     hole there even though it looks right in light mode. */
  .detail-content :global(.setting-group) {
    display: flex; flex-direction: column; gap: .6rem;
    background: var(--glass-solid); border: 1px solid var(--glass-edge); border-radius: var(--r-l);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--glass-shadow);
    padding: .95rem 1.05rem;
  }
  /* A setting reads as one unit: its description sits tight under the label,
     kept clear of the control on the right; an inset line starts the next. */
  .detail-content :global(.setting-row + .setting-hint:not(.setting-hint-warn):not(.success-hint):not(.setting-hint-error)) {
    margin-top: -.45rem; padding-right: 5.5rem;
  }
  .detail-content :global(.setting-hint + .setting-row),
  .detail-content :global(.setting-row + .setting-row) {
    border-top: 1px solid var(--line); padding-top: .6rem;
  }
  /* A slide/fade reveal wrapper (NotificationSettings' Permission/Reminder
     timing/Quiet hours groups, mounted only once notificationsEnabled) has
     to carry .detail-fade's own gap itself -- nesting the groups one level
     deeper removes them from .detail-fade's direct flex children, which is
     where that gap normally comes from. */
  .detail-content :global(.reveal-wrap) {
    display: flex; flex-direction: column; gap: 1rem;
  }
  .detail-content :global(.setting-section-title) {
    font-size: var(--fs-m); font-weight: 700; color: var(--text); margin-bottom: .05rem;
  }
  .setting-row, .detail-content :global(.setting-row) { display: flex; align-items: center; gap: .75rem; }
  .setting-hint, .detail-content :global(.setting-hint) { margin: 0; font-size: var(--fs-xs); color: var(--faint); line-height: 1.5; }
  /* Pulls a status line up against the row it reports on, instead of
     sitting a full group-gap away as if it were a separate setting. */
  .detail-content :global(.setting-hint.compact-hint) { margin-top: -.3rem; }
  .detail-content :global(.setting-hint-error) { color: var(--danger); }
  .setting-hint-warn, .detail-content :global(.setting-hint-warn) {
    color: var(--due-soon-ink); background: var(--due-soon-bg);
    padding: .5rem .65rem; border-radius: var(--radius-sm); font-weight: 500;
  }
  .success-hint, .detail-content :global(.success-hint) {
    color: var(--success-ink); background: color-mix(in srgb, var(--success) 14%, transparent);
    padding: .5rem .65rem; border-radius: var(--radius-sm); font-weight: 600;
  }
  .detail-content :global(.setting-label) { font-size: var(--fs-m); color: var(--text); flex: 1; }
  .detail-content :global(.setting-value) { font-size: var(--fs-m); color: var(--muted); font-variant-numeric: tabular-nums; }
  .storage-info, .detail-content :global(.storage-info) { font-family: var(--mono); font-size: var(--fs-xs); color: var(--muted); flex: 1; }
  /* "Devices seen recently" always includes this device's own writes
     (they're logged like any other edit) mixed in with remote ones --
     nothing else says which entry that is, so matching it against
     this device's own name (already known, right above in the same tab)
     is the only way to tell without remembering what you typed there. */
  .detail-content :global(.device-name-row) { display: inline-flex; align-items: center; gap: 6px; }

  .detail-content :global(.this-device-tag) {
    font-family: 'Hanken Grotesk', sans-serif; font-size: var(--fs-xs); font-weight: 600;
    line-height: 1; display: inline-flex; align-items: center;
    color: var(--accent-ink); background: color-mix(in srgb, var(--accent) 10%, transparent);
    padding: 3px 6px; border-radius: 999px;
  }

  /* Headline reads as a plain sentence; the raw MB/quota numbers are
     demoted to a small mono detail line underneath, not the first thing
     a non-technical person sees. */
  .detail-content :global(.storage-summary) { display: flex; flex-direction: column; gap: 2px; }
  .detail-content :global(.storage-headline) { font-size: var(--fs-l); color: var(--text); font-weight: 500; }
  .detail-content :global(.storage-headline-warn) { color: var(--danger); }
  .detail-content :global(.storage-detail) { font-family: var(--mono); font-size: var(--fs-xs); color: var(--muted); }

  .detail-content :global(.project-export-select) { flex: 1; min-width: 0; }

  /* Shared primary-action style for the main CTA inside a modal (Connect,
     Import, Run Maintenance) — consistent accent treatment instead of
     each modal inventing its own "important button" look. */
  .btn-primary {
    height: 32px; padding: 0 14px; border-radius: 999px;
    border: 1px solid var(--text); cursor: pointer;
    background: var(--text); color: var(--bg); font-size: var(--fs-s); font-weight: 600;
    white-space: nowrap;
  }
  .btn-primary:hover { opacity: .9; }
  .btn-primary:disabled { opacity: .5; cursor: default; }

  .field-label, .detail-content :global(.field-label) {
    display: flex; flex-direction: column; gap: .35rem;
    font-size: var(--fs-s); font-weight: 600; color: var(--muted);
  }
  .field-label input, .detail-content :global(.field-label input) {
    height: 36px; padding: 0 14px; border: 1px solid var(--glass-edge); border-radius: 999px;
    background: none; color: var(--text); font-size: var(--fs-m);
  }
  .field-label input:focus, .detail-content :global(.field-label input:focus) { outline: none; border-color: var(--accent); }
  .field-label input:disabled, .detail-content :global(.field-label input:disabled) { opacity: .5; cursor: default; }

  /* The task window's pills: no track, the chosen one lifted with the ring. */
  .detail-content :global(.theme-segment) { display: flex; gap: 4px; flex-shrink: 0; }
  .detail-content :global(.theme-seg-btn) {
    height: 28px; padding: 0 10px; border: none; border-radius: 999px; background: transparent; color: var(--muted);
    font-size: var(--fs-s); font-weight: 600; cursor: pointer; transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .detail-content :global(.theme-seg-btn:hover) { background: var(--rail-hover); color: var(--text); }
  .detail-content :global(.theme-seg-btn.active) { background: var(--surface); color: var(--text); box-shadow: var(--sel-ring); }

  .detail-content :global(.toggle-btn) {
    width: 42px; height: 24px; border-radius: var(--r-l); border: none; cursor: pointer;
    background: var(--switch-off); position: relative; transition: background var(--dur-hover) var(--ease-hover);
    flex-shrink: 0; padding: 0;
  }
  .detail-content :global(.toggle-btn.on) { background: var(--accent); }
  .detail-content :global(.toggle-knob) {
    position: absolute; top: 3px; left: 3px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--toggle-knob); transition: left var(--dur-small) var(--ease-standard); box-shadow: 0 1px 3px rgba(0,0,0,.2);
  }
  .detail-content :global(.toggle-btn.on .toggle-knob) { left: 21px; }

  .export-btn, .detail-content :global(.export-btn) {
    height: 32px; padding: 0 14px; border-radius: 999px;
    border: 1px solid var(--glass-edge); cursor: pointer;
    background: none; color: var(--text); font-size: var(--fs-s); font-weight: 600;
    white-space: nowrap; transition: border-color var(--dur-hover) var(--ease-hover);
  }
  .export-btn:hover, .detail-content :global(.export-btn:hover) { border-color: var(--glass-edge-hover); }
  .export-btn:disabled, .detail-content :global(.export-btn:disabled) { opacity: .5; cursor: default; }
  /* Matches TrashView's forever-delete button -- an irreversible action
     needs the same visual weight wherever it appears, not just where it
     happened to be built first. */
  .detail-content :global(.export-btn-danger) {
    border-color: color-mix(in srgb, var(--danger) 35%, transparent); color: color-mix(in srgb, var(--danger) 82%, var(--text));
  }
  .detail-content :global(.export-btn-danger:hover) {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  /* A row that opens a page: plain, like the group's other rows; the hover
     fill reaches a little past the text on both sides. */
  .detail-content :global(.link-row) {
    display: flex; align-items: center; gap: .75rem;
    background: none; border: none; border-radius: var(--r-m);
    min-height: 40px; padding: 0 .5rem; margin: 0 -.5rem; width: calc(100% + 1rem);
    cursor: pointer; text-align: left;
    transition: background var(--dur-hover) var(--ease-hover);
  }
  .detail-content :global(.link-row:hover) { background: var(--hover); }
  /* Its description sits tight under it; a line starts the next one. */
  .detail-content :global(.link-row + .setting-hint) { margin-top: -.55rem; }
  .detail-content :global(.setting-hint:has(+ .link-row)) { border-bottom: 1px solid var(--line); padding-bottom: .6rem; }
  /* Drop-downs: the same round outline as the fields. */
  .detail-content :global(.custom-select .cs-trigger) { background: none; border-color: var(--glass-edge); border-radius: 999px; min-height: 36px; padding: 0 14px; }
  .detail-content :global(.custom-select .cs-trigger:hover) { border-color: var(--glass-edge-hover); }
  .detail-content :global(.link-row-title) { flex: 1; font-size: var(--fs-m); font-weight: 500; color: var(--text); }
  .detail-content :global(.link-row-compact .link-row-title) { font-weight: 500; }
  .detail-content :global(.link-row svg) { flex-shrink: 0; opacity: .5; }
  .detail-content :global(.link-row .nav-badge) { flex-shrink: 0; }

  .conflict-item {
    display: flex; flex-direction: column; gap: .3rem;
    background: var(--surface); border: 1px solid transparent; border-radius: var(--radius-sm);
    padding: .5rem .65rem; box-shadow: var(--elev-1);
  }
  .conflict-item-title { font-size: var(--fs-s); font-weight: 600; color: var(--text); }
  .conflict-item-type { font-weight: 400; color: var(--faint); }
  .conflict-item-row { display: flex; align-items: center; gap: .75rem; }
  .conflict-item-meta { font-size: var(--fs-xs); color: var(--muted); flex: 1; }

  /* What actually differs. Without this the screen asks a person to choose
     between two device names and two timestamps, with no way to see what
     either choice costs. */
  .conflict-diff-note { font-size: var(--fs-xs); color: var(--muted); }
  .conflict-version {
    display: flex; flex-direction: column; gap: .2rem;
    padding-top: .4rem; margin-top: .2rem;
  }
  .conflict-field { display: flex; gap: .5rem; font-size: var(--fs-s); line-height: 1.45; }
  .conflict-field-name { color: var(--faint); min-width: 5.5rem; flex-shrink: 0; }
  .conflict-field-value { color: var(--text); word-break: break-word; }

  /* Maintenance step list */
  .progress-track { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width var(--dur-small) var(--ease-standard); }

  .maint-steps { display: flex; flex-direction: column; gap: .5rem; }
  .maint-step { display: flex; align-items: center; gap: .6rem; padding: .4rem .1rem; border-radius: var(--radius-sm); }
  .maint-step.running { background: color-mix(in srgb, var(--accent) 8%, transparent); }

  .maint-step-icon {
    width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: var(--fs-xs); font-weight: 700; color: var(--faint);
    border: 1.5px solid var(--border-strong);
  }
  .maint-step-icon.done    { color: var(--success-ink); border-color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .maint-step-icon.skipped { color: var(--faint); }
  .maint-step-icon.error   { color: color-mix(in srgb, var(--danger) 82%, var(--text)); border-color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
  .maint-step-icon.running { border-color: var(--accent); }

  .spinner {
    width: 9px; height: 9px; border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-top-color: var(--accent);
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .maint-step-label { font-size: var(--fs-m); color: var(--text); flex: 1; }
  .maint-step-note { font-size: var(--fs-xs); color: var(--faint); text-align: right; white-space: nowrap; }

  .integrity-list {
    display: flex; flex-direction: column; gap: 3px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .5rem .65rem; max-height: 140px; overflow-y: auto;
  }
  .integrity-row { font-size: var(--fs-s); color: var(--muted); line-height: 1.4; }

  .settings-actions {
    display: flex; justify-content: flex-end; gap: .5rem;
    padding: .9rem 1.25rem; flex-shrink: 0;
  }
  .settings-actions button {
    height: 34px; padding: 0 16px; border-radius: 999px;
    border: 1px solid var(--glass-edge); cursor: pointer;
    background: none; color: var(--text); font-size: var(--fs-m); font-weight: 600;
  }
  .save-btn { background: var(--text) !important; color: var(--bg) !important; border-color: var(--text) !important; }

  /* Multi-step flows (device pairing, conflicts, maintenance run, import
     preview) open here instead of living permanently in a tab — .mini-modal
     is `position: fixed` itself (not flex-centered by its scrim parent) so
     dialogIn/dialogOut's baked-in `translate(-50%,-50%)` positions it
     correctly, same
     convention as ConfirmDialog/NamePrompt's sibling scrim+panel pattern. */
  .mini-modal-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300; }
  .mini-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 301; width: min(420px, 90vw); max-height: min(80vh, 560px);
    display: flex; flex-direction: column;
    background: var(--surface); border: 1px solid var(--glass-edge); border-radius: var(--radius);
    box-shadow: var(--elev-3);
  }
  .mini-modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.1rem; flex-shrink: 0;
  }
  .mini-modal-title { font-weight: 700; font-size: var(--fs-l); }
  .mini-modal-close {
    background: none; border: none; cursor: pointer; color: var(--faint);
    font-size: var(--fs-m); padding: .2rem .4rem; border-radius: var(--radius-sm);
  }
  .mini-modal-close:hover { background: var(--hover); color: var(--text); }
  .mini-modal-body {
    flex: 1; overflow-y: auto; padding: 1.1rem;
    display: flex; flex-direction: column; gap: .75rem;
  }
  /* The app deliberately produces several similarly-named backups on the
     same device (daily auto-backups, manual full/per-project exports) --
     this is the only line confirming which actual file got picked, not
     just what importing it would do. */
  .import-filename {
    font-family: var(--mono); background: var(--col-bg);
    padding: .5rem .65rem; border-radius: var(--radius-sm);
  }
  .mini-modal-actions {
    display: flex; justify-content: flex-end; gap: .5rem;
    padding: .85rem 1.1rem; flex-shrink: 0;
  }

  .recovery-modal { max-width: 420px; }
  .recovery-code {
    font-family: var(--mono); font-size: var(--fs-t); font-weight: 700; letter-spacing: .08em;
    text-align: center; color: var(--accent); background: var(--col-bg);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    padding: .8rem; margin: .6rem 0;
  }
  .recovery-copy-btn { display: block; margin: 0 auto .8rem; }
  .recovery-ack-row {
    display: flex !important; flex-direction: row !important; align-items: center; gap: .5rem;
    font-size: var(--fs-m); color: var(--text); text-transform: none; letter-spacing: normal;
    font-family: 'Hanken Grotesk', sans-serif; cursor: pointer;
  }
  .recovery-ack-row input[type=checkbox] { accent-color: var(--accent); cursor: pointer; width: 15px; height: 15px; margin: 0; }
  .pairing-code { font-size: 1.5rem; letter-spacing: 0.2em; text-align: center; }
</style>
