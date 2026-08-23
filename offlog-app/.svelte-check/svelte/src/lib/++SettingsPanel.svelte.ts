///<reference types="svelte" />
;
import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
import CustomSelect from './CustomSelect.svelte';
import TimePicker from './TimePicker.svelte';
import ConfirmPinGate from './ConfirmPinGate.svelte';
import { isAutoBackupEnabled, setAutoBackupEnabled, getLastAutoBackupAt } from './autoBackup';
import db, {
    syncState, syncNow, importJSON, analyzeImport, exportProjectDocs, exportTasksCSV,
    getConflicts, resolveConflict, type ConflictInfo,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    startSync, cancelSync, getDeviceLastSeen,
    runMaintenanceSteps, type IntegrityIssue, type MaintStepResult,
    wipeAndReseed,
  } from './db';
import { formatAttachmentSize } from './attachments';
import { projects as projectsStore } from './store';
import { getSyncUrl, setSyncUrl, getSyncCredentials, setSyncCredentials, getDeviceName, setDeviceName, isSyncEnabled, setSyncEnabled, getDefaultReminderTime, setDefaultReminderTime, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h, getQuietHours, setQuietHours, getNotificationsEnabled, setNotificationsEnabled, getAutoUpdateCheckEnabled, setAutoUpdateCheckEnabled, isTauri as isTauriCheck, invokeTauri, isAppLockEnabled, setAppLockPin, clearAppLockPin, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes, getAppLockHint, isNativePlatform, isAppLockBiometricEnabled, setAppLockBiometricEnabled, syncPrivacyScreen, isHapticsEnabled, setHapticsEnabled, isPrivacyScreenEnabled, setPrivacyScreenEnabled, otherHostsDetected } from '../config';
import { timeAgo, fmtLastSynced, localDateStr } from './utils';
import { discoveredHosts, isScanning, scanForHosts, stopScan, pairWithHost, type DiscoveredHost } from './discovery';
import { requestPermission, permissionState, exactAlarmState, checkExactAlarmPermission, requestExactAlarmPermission, rescheduleAll } from './notifications';
import { updateState, showUpdateModal, checkForUpdate } from './updateChecker';
import { showError, modalOpen } from './store';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import { getThemeMode, setThemeMode, getHighContrast, setHighContrast, getReduceMotion, setReduceMotion, type ThemeMode } from './theme';
import { fade } from 'svelte/transition';
import { dialogPop, scrimFade } from './motion';
function $$render() {
/*Ωignore_startΩ*/;let $projectsStore = __sveltets_2_store_get(projectsStore);;let $otherHostsDetected = __sveltets_2_store_get(otherHostsDetected);;let $discoveredHosts = __sveltets_2_store_get(discoveredHosts);;let $isScanning = __sveltets_2_store_get(isScanning);;let $permissionState = __sveltets_2_store_get(permissionState);;let $exactAlarmState = __sveltets_2_store_get(exactAlarmState);;let $updateState = __sveltets_2_store_get(updateState);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  // Every tab follows one visual language: a plain-language intro line
  // (optional), rows of .setting-row (a label + a toggle/value/button),
  // and .link-row for anything that opens a modal. Anything genuinely
  // multi-step (device pairing, conflict resolution, the maintenance
  // run, import preview) opens as a small modal instead of living
  // permanently in the tab — keeps every tab's default view the same
  // shape regardless of how much a feature actually needs underneath.
  // Exactly one tab (Advanced) is allowed to be technical.
  type Category = 'appearance' | 'notifications' | 'sync' | 'organize' | 'data' | 'security' | 'advanced';
  const CATEGORIES: { key: Category; label: string; icon: string }[] = [
    { key: 'appearance',    label: 'View & Accessibility', icon: '<circle cx="9" cy="9" r="4"/><path d="M9 1v2M9 15v2M17 9h-2M3 9H1M14.7 3.3l-1.4 1.4M4.7 13.3l-1.4 1.4M14.7 14.7l-1.4-1.4M4.7 4.7 3.3 3.3"/>' },
    { key: 'notifications', label: 'Notifications',        icon: '<path d="M9 2a4 4 0 0 0-4 4v3l-1.5 3h11L13 9V6a4 4 0 0 0-4-4z"/><path d="M7 15a2 2 0 0 0 4 0"/>' },
    { key: 'sync',          label: 'Sync',                 icon: '<path d="M3 9a6 6 0 0 1 10.2-4.2M15 9a6 6 0 0 1-10.2 4.2"/><polyline points="13,1.5 13.2,4.8 9.9,5"/><polyline points="5,16.5 4.8,13.2 8.1,13"/>' },
    { key: 'organize',      label: 'Organize',             icon: '<rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/>' },
    { key: 'data',          label: 'Backup & Storage',     icon: '<path d="M2 4c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2z"/><path d="M2 4v10c0 1.1 3.1 2 7 2s7-.9 7-2V4"/><path d="M2 9c0 1.1 3.1 2 7 2s7-.9 7-2"/>' },
    { key: 'security',      label: 'App Lock',             icon: '<rect x="3" y="8" width="12" height="8" rx="1.5"/><path d="M6 8V5.5a3 3 0 0 1 6 0V8"/>' },
    { key: 'advanced',      label: 'Advanced',             icon: '<path d="M2 5h6M11 5h5M2 13h9M14 13h2"/><circle cx="9" cy="5" r="2"/><circle cx="12" cy="13" r="2"/>' },
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
  // only close Settings entirely on a second press. See modalStack.ts and
  // ROADMAP.md A14.
  // Lets a caller (e.g. the post-first-run sync invite) open Settings
  // straight into a specific tab instead of always landing on Appearance.
   let initialCategory: Category | null = null/*Ωignore_startΩ*/;initialCategory = __sveltets_2_any(initialCategory);/*Ωignore_endΩ*/;

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
    if (e.key !== 'Escape') return;
    // No Escape-to-dismiss while the one-time recovery code is showing —
    // it must be acknowledged via the explicit button below, or someone
    // reflexively hitting Escape loses their only chance to see it.
    if (newRecoveryCode) return;
    if (showConnectModal) { showConnectModal = false; return; }
    if (showConflictsModal) { showConflictsModal = false; return; }
    if (showMaintenanceModal) { showMaintenanceModal = false; return; }
    if (pendingImportDocs) { cancelImport(); return; }
    if (isNarrow && activeCategory) backToList();
    else requestClose();
  }

  // ── Appearance ──────────────────────────────────────────────────────────
  // B21: three-way Light/Dark/System instead of a boolean toggle — System
  // is the default for anyone who's never touched this setting (see
  // theme.ts's migration). B11: a separate high-contrast toggle, layered
  // on top of whichever of Light/Dark is currently effective.
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
  let reduceMotion = getReduceMotion();
  function toggleReduceMotion() {
    reduceMotion = !reduceMotion;
    setReduceMotion(reduceMotion);
  }

  // B58 — Android only (haptics.ts itself also checks isNativePlatform(),
  // this toggle just decides whether to show the control at all). Defaults
  // on, see config.ts's own comment for why.
  let hapticsEnabled = isHapticsEnabled();
  function toggleHaptics() {
    hapticsEnabled = !hapticsEnabled;
    setHapticsEnabled(hapticsEnabled);
  }

  // ── Notifications ───────────────────────────────────────────────────────
  const isAndroid = (window as any).Capacitor?.getPlatform?.() === 'android';
  // Master in-app toggle (owner feedback, 2026-07-30) -- same pattern as
  // the Sync tab's own enabled/disabled switch gating its sub-settings.
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
  // B12: default time-of-day used when a task's "remind me on the due
  // date" toggle derives reminder_at — per-device, same reasoning as B36's
  // localStorage choices (see config.ts's getDefaultReminderTime()).
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

  // B47 — reactively re-derives Agenda's week math on toggle; DeadlinesView
  // itself reads getWeekStartsMonday() once at mount, so it needs a reload
  // (route re-entry) or a live subscribe to see the new setting take
  // effect immediately. Simplest correct fix: it's a rarely-changed
  // display preference, not something that needs a live-reactive bridge —
  // same tradeoff as the theme mode toggle's own page-level effect.
  let weekStartsMonday = getWeekStartsMonday();
  function setWeekStart(monday: boolean) {
    weekStartsMonday = monday;
    setWeekStartsMonday(monday);
  }

  // Same rarely-changed-display-preference tradeoff as weekStartsMonday
  // above — every clock-time display in the app reads getTimeFormat24h()
  // fresh via utils.ts's fmtTime(), so a reactive bridge isn't needed for
  // already-open views; a reopen/reload picks it up.
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
  let appLockTimeout = getAppLockTimeoutMinutes();
  // A dropdown, not the segmented control Theme/Week-starts-on use —
  // those read fine at 2-3 short options, but 4 numeric ones ("1m 5m 15m
  // 30m") in a row felt cramped (owner feedback, 2026-07-19). Same
  // CustomSelect pattern as CardDetail's Repeat picker.
  const LOCK_TIMEOUT_OPTIONS = [
    { value: '1', label: '1 minute' },
    { value: '5', label: '5 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
  ];
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

  // B56 (ROADMAP.md): the code is dense and easy to mistype re-copying by
  // hand — Clipboard removes that risk entirely. Falls back to
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

  // v5.4.2 correction — was auto-tied to isAppLockEnabled() with no
  // separate control (see config.ts's own comment). OFF by default:
  // Android's FLAG_SECURE (what this actually sets) blocks ALL
  // screenshots while the app is foregrounded, not just the recents-
  // switcher preview it was meant to hide — too big a side effect to
  // silently bundle into turning on a PIN.
  let privacyScreenEnabled = isPrivacyScreenEnabled();
  function togglePrivacyScreen() {
    privacyScreenEnabled = !privacyScreenEnabled;
    setPrivacyScreenEnabled(privacyScreenEnabled);
    syncPrivacyScreen();
  }

  let biometricEnabled = isAppLockBiometricEnabled();
  let biometricError = '';
  let biometricBusy = false;
  // B57 (ROADMAP.md): distinguishes "nothing enrolled" from any other
  // failure so the "Open Settings" deep-link only shows when it'd
  // actually help — a wrong-fingerprint or cancelled prompt isn't fixed
  // by visiting enrollment settings.
  let biometricNoneEnrolled = false;

  // Enabling requires a live device check + a real successful prompt —
  // not just flipping a flag — so a device with no fingerprint/face
  // enrolled never silently ends up "enabled" with no way to actually
  // unlock (owner scope, 2026-07-20: biometric sits alongside the PIN,
  // opt-in, Android only). Disabling never needs the device, it just
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
      biometricError = 'Could not confirm your fingerprint/face. Try again.';
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
  // constructor treats as a genuine intent action — not documented
  // behavior of the plugin, but confirmed by reading its Android source
  // (AppLauncherPlugin.java) rather than assumed.
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

  // B61: Change/Remove both pass through ConfirmPinGate first — proving
  // knowledge of the *current* PIN, like any password change. The gate
  // replaces removePin()'s old confirmAction() dialog entirely: entering
  // the PIN IS the confirmation, a second "are you sure" on top would be
  // pure friction. Initial setup (no PIN exists yet) never gates.
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
  // C8: getSyncCredentials() is async now (platform-appropriate secure
  // storage, not a synchronous localStorage read) -- seeded empty here,
  // populated in the onMount below rather than blocking component init.
  let credentialUser = '';
  let credentialPass = '';
  onMount(async () => {
    ({ user: credentialUser, pass: credentialPass } = await getSyncCredentials());
  });
  let deviceName = getDeviceName();
  let syncEnabled = isSyncEnabled();

  // Plain-language connection status for the main pane — everything below
  // already exists as syncState.status/lastSynced/error, just not
  // surfaced as one human sentence before this.
  //
  // C2 finding (2026-07-19): this used to point everyone at "Developer
  // options" to connect — a scary label for a first-time non-technical
  // user, and no longer even the easy path once Track E's pairing flow
  // (isAndroid's "Find my computer" section, above this in the template)
  // shipped. Android gets pointed at that instead; anyone else (plain
  // desktop web, no PC-app pairing available there) keeps the old
  // wording, since the Advanced tab really is the only path for them.
  let  connectionStatus =
    __sveltets_2_invalidate(() => !syncEnabled ? { text: 'Sync is paused.', tone: 'muted' } :
    !syncUrl ? (isAndroid
      ? { text: 'Not connected to another device yet — tap "Find my computer" below to connect.', tone: 'muted' }
      : { text: 'Not connected to another device yet — open the Advanced tab to connect one.', tone: 'muted' }) :
    syncStatus === 'syncing' ? { text: 'Syncing…', tone: 'muted' } :
    syncStatus === 'offline' ? { text: 'Offline — will resume automatically when back on your network.', tone: 'muted' } :
    syncStatus === 'error' ? { text: syncError || 'Sync error.', tone: 'warn' } :
    lastSynced ? { text: `Connected — last synced ${fmtLastSynced(lastSynced)}`, tone: 'ok' } :
    { text: 'Connected — waiting for first sync…', tone: 'muted' });

  function toggleSyncEnabled() {
    syncEnabled = !syncEnabled;
    setSyncEnabled(syncEnabled);
    if (syncEnabled) startSync().catch(() => {}); else cancelSync();
  }

  // ── Track E discovery/pairing (ROADMAP.md E1) ─────────────────────────────
  // Android: find the PC via mDNS, then exchange a code shown on the PC's
  // own screen for real credentials (discovery.ts's pairWithHost()).
  // Desktop/Tauri: generate that code in the first place.
  const isTauri = isTauriCheck();
  let isTauriDebug = false;
  if (isTauri) {
    invokeTauri<boolean>('is_debug_build').then((v) => { isTauriDebug = v; }).catch(() => {});
  }

  let selectedHost: DiscoveredHost | null = null;
  let pairingCode = '';
  let pairingBusy = false;
  let pairingError = '';
  // Owner-reported, 2026-07-17: on success the modal just reset back to
  // its initial "Find my computer" screen with no confirmation at all —
  // read as "stuck," since nothing visibly acknowledged the pairing had
  // actually worked. A distinct success state instead of silently
  // reverting to the scan screen.
  let pairSuccessName: string | null = null;

  function startDeviceScan() {
    selectedHost = null;
    pairingError = '';
    pairSuccessName = null;
    scanForHosts();
  }

  async function submitPairingCode() {
    if (!selectedHost) return;
    pairingBusy = true;
    pairingError = '';
    try {
      const pairedName = selectedHost.name;
      await pairWithHost(selectedHost, pairingCode);
      syncUrl = getSyncUrl();
      // Real bug found live: without this, the Advanced tab's form still
      // held whatever stale username/password it was mounted with —
      // invisible for the URL (which did refresh) but silent for the
      // masked password field, so tapping "Save & restart sync"
      // afterward would overwrite the just-paired credentials right
      // back to the old ones.
      ({ user: credentialUser, pass: credentialPass } = await getSyncCredentials());
      selectedHost = null;
      pairingCode = '';
      pairSuccessName = pairedName;
    } catch (e) {
      pairingError = e instanceof Error ? e.message : 'Failed to pair.';
    } finally {
      pairingBusy = false;
    }
  }

  let pcPairingCode = '';
  let pcPairingBusy = false;
  // Owner-reported, 2026-07-17: same "stuck, no confirmation" gap as the
  // phone side above, but the PC has no direct signal that pairing
  // finished — the phone drives that handshake entirely. Polling
  // getDeviceLastSeen() for a name that wasn't there when the code was
  // generated is the only way this side can tell; 3s is frequent enough
  // to feel live without hammering the local DB read.
  let pcPairedDeviceName: string | null = null;
  let pcPollTimer: ReturnType<typeof setInterval> | null = null;
  function stopPcPairPoll() {
    if (pcPollTimer) { clearInterval(pcPollTimer); pcPollTimer = null; }
  }
  async function startPcPairPoll() {
    stopPcPairPoll();
    const before = new Set((await getDeviceLastSeen()).map(d => d.device));
    pcPollTimer = setInterval(async () => {
      const now = await getDeviceLastSeen();
      const found = now.find(d => !before.has(d.device));
      if (found) { pcPairedDeviceName = found.device; stopPcPairPoll(); }
    }, 3000);
  }
  async function generatePcPairingCode() {
    pcPairingBusy = true;
    pcPairedDeviceName = null;
    try {
      pcPairingCode = await invokeTauri<string>('generate_pairing_code');
      startPcPairPoll();
    } catch {
      showError('Failed to generate a pairing code.');
    } finally {
      pcPairingBusy = false;
    }
  }
  // Stop polling (and clear any stale success message on either side)
  // once the modal closes, so it doesn't keep running in the background
  // or show last time's result if it's reopened.
  ;() => {$: if (!showConnectModal) { stopPcPairPoll(); pcPairedDeviceName = null; pairSuccessName = null; }}
  onDestroy(stopPcPairPoll);

  // Dev-only: wipes this PC's NyxDB data and restarts, so testing "what
  // does a real first-run user see" on a freshly-reinstalled phone
  // doesn't immediately sync down leftover dev/test tasks. The Rust
  // command itself refuses outside a debug build (belt-and-suspenders —
  // this button is also never rendered in a release build, see below).
  let resetBusy = false;
  async function resetPcTestData() {
    if (!confirm('Delete all tasks/projects on this PC and restart the app?')) return;
    resetBusy = true;
    try {
      // Two halves, both needed: wipeAndReseed() clears this PC's own
      // local PouchDB (the WebView's IndexedDB) — discovered live that
      // the Rust-only reset below never touched this, since it's a
      // completely separate local database from the embedded NyxDB
      // server, same local-first split every device in this app has.
      // Letting sync push the resulting deletion tombstones out first
      // (before the server itself gets wiped) is what actually clears
      // an already-paired phone's copy too, not just this PC's view.
      await wipeAndReseed();
      await syncNow().catch(() => {});
      await invokeTauri('reset_sync_data');
    } catch {
      showError('Failed to reset test data.');
      resetBusy = false;
    }
  }

  // Renaming this device only affects new writes' `source` field — no
  // reload needed the way changing the sync URL needs one (db.ts's
  // module-level SOURCE constant is a separate concern from this saved
  // string; the *next* app launch is what actually picks up a rename).
  function saveDeviceName() { setDeviceName(deviceName); deviceName = getDeviceName(); }

  let deviceLastSeen: { device: string; lastSeen: string }[] = [];
  let deviceLastSeenLoaded = false;
  async function loadDeviceLastSeen() {
    deviceLastSeenLoaded = true; // set before the await — a genuinely-empty result must not retrigger this every reactive tick
    deviceLastSeen = await getDeviceLastSeen();
  }

  let syncStatus = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let lastErrorAt = syncState.lastErrorAt;
  let retryCount = syncState.retryCount;
  let conflictCount = syncState.conflictCount;

  function onSyncChange() {
    syncStatus = syncState.status;
    lastSynced = syncState.lastSynced;
    syncError = syncState.error;
    lastErrorAt = syncState.lastErrorAt;
    retryCount = syncState.retryCount;
    conflictCount = syncState.conflictCount;
  }
  syncState.listeners.add(onSyncChange);
  onDestroy(() => syncState.listeners.delete(onSyncChange));
  onDestroy(() => stopScan());

  let conflictList: ConflictInfo[] = [];
  let loadingConflicts = false;
  async function loadConflicts() {
    loadingConflicts = true;
    try { conflictList = await getConflicts(); } finally { loadingConflicts = false; }
  }
  async function resolve(c: ConflictInfo, keep: 'current' | 'other') {
    try {
      await resolveConflict(c.docId, keep, c.other.rev);
      await loadConflicts();
    } catch {
      showError('Failed to resolve conflict. Please try again.');
    }
  }
  ;() => {$: if (activeCategory === 'sync' && conflictCount > 0 && conflictList.length === 0 && !loadingConflicts) loadConflicts();}
  ;() => {$: if (activeCategory === 'sync' && !deviceLastSeenLoaded) loadDeviceLastSeen();}

  // ── Organize (Manage Spaces / Manage Tags) ─────────────────────────────
  // All four managers below get the same two fixes (2026-07-18 audit):
  // an error-handled, reentrancy-guarded lazy import (matching Sidebar.
  // svelte's openTimeTravel/openTrash/openSettings — an unguarded import
  // that rejects used to leave showX stuck false with no feedback), and
  // an *Session counter folded into their {#key} in the template below
  // (matching CardDetail/Time Travel/Trash/Settings/QuickAdd/GlobalSearch
  // — all four call closeOnBack(), so all four were exposed to the same
  // stuck-panel bug a fast reopen could trigger).
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
      showError('Failed to open Spaces. Please try again.');
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
      showError('Failed to open Tags. Please try again.');
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
      showError('Failed to open Custom Fields. Please try again.');
    }
  }
  function onCustomFieldManagerClosed() { showCustomFieldManager = false; customFieldManagerActive = false; }

  // B32 — same lazy-modal pattern as Spaces/Tags/Custom Fields above
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
      showError('Failed to open Archived Projects. Please try again.');
    }
  }
  function onArchivedProjectsManagerClosed() { showArchivedProjectsManager = false; archivedProjectsManagerActive = false; }

  // ── Data ────────────────────────────────────────────────────────────────
  let breakdown: StorageBreakdown | null = null;
  async function loadBreakdown() { breakdown = await getStorageBreakdown(); }
  onMount(() => {
    loadBreakdown();
    return subscribeDb(() => loadBreakdown());
  });

  // A17/B14 — same screen, same navigator.storage.estimate() call: explain
  // what the quota number actually means (a browser-assigned ceiling based
  // on free disk space, not an Offlog-imposed limit — most users have never
  // seen this number before), and only actually warn once usage is close
  // enough to it to matter. At personal-task-list scale this essentially
  // never fires — PouchDB/IndexedDB storage for one person's tasks is tiny
  // relative to typical quotas — so the default state stays a plain, quiet
  // fact rather than a constant nag.
  let storageInfo = '';
  let storagePercent = 0;
  let storageAvailable = true;
  const STORAGE_WARN_THRESHOLD = 0.8;
  async function loadStorage() {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      storageInfo = `${(usage / 1048576).toFixed(1)} MB used / ${(quota / 1048576).toFixed(0)} MB quota`;
      storagePercent = quota > 0 ? usage / quota : 0;
      storageAvailable = true;
    } else { storageInfo = 'Not available'; storageAvailable = false; }
  }
  onMount(loadStorage);
  // Re-check on every open, not just at app-start init — the user may have
  // just come back from the OS "Alarms & reminders" settings screen.
  onMount(() => { if (isAndroid) checkExactAlarmPermission(); });

  // v5.4.1 bug (owner-reported live testing, 2026-07-20): the floating
  // Quick Add button only hides for CardDetail's modalOpen store (see
  // CardDetail.svelte) — Settings never set it, so the FAB stayed
  // visible and clickable on top of the Settings overlay on every
  // platform. Same on/off pattern as CardDetail.
  onMount(() => modalOpen.set(true));
  onDestroy(() => modalOpen.set(false));

  // B4 — guided import: parse + preview counts before writing anything,
  // instead of importing the instant a file is picked. `pendingImportDocs`
  // holds the parsed array between "file chosen" and "user confirms."
  let importStatus = '';
  let pendingImportDocs: any[] | null = null;
  let importPreview: { toCreate: number; toSkip: number; byType: Record<string, number> } | null = null;

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const docs = JSON.parse(text);
        if (!Array.isArray(docs)) throw new Error('Invalid format');
        pendingImportDocs = docs;
        importPreview = analyzeImport(docs);
      } catch (e: any) {
        importStatus = 'Error: ' + (e.message ?? 'invalid file');
        setTimeout(() => { importStatus = ''; }, 4000);
      }
    };
    input.click();
  }

  function cancelImport() { pendingImportDocs = null; importPreview = null; }

  async function confirmImport() {
    if (!pendingImportDocs) return;
    const docs = pendingImportDocs;
    pendingImportDocs = null; importPreview = null;
    try {
      importStatus = 'Importing…';
      const { ok, skipped } = await importJSON(docs);
      importStatus = `Done — ${ok} imported, ${skipped} skipped`;
    } catch {
      importStatus = 'Import failed. Please try again.';
    }
    setTimeout(() => { importStatus = ''; }, 4000);
  }

  // A34 (owner-reported, 2026-07-13): the blob-URL + <a download> trick
  // below is a no-op inside a Capacitor Android WebView — there's no
  // browser download manager to hand it to. On native, write the file to
  // app storage via @capacitor/filesystem and hand it to the OS share
  // sheet via @capacitor/share instead, so the user picks where it ends
  // up (Files, Drive, email, etc.) same as any other Android share flow.
  async function downloadBlob(content: string, mime: string, filename: string) {
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const written = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: filename, url: written.uri });
      return;
    }
    // Same gap A34 found on Android's WebView — Tauri's embedded WebView2
    // has no download manager for the blob-URL + <a download> trick either
    // (owner-reported, 2026-07-16). A native "Save As" dialog + a real
    // file write is the desktop equivalent of Android's Filesystem+Share
    // fix — lets the user pick where it actually goes, same as any other
    // desktop app's export/save flow.
    if (isTauri) {
      // Owner-reported, 2026-07-16: defaultPath as a bare filename (no
      // directory) didn't reliably pre-fill the dialog's filename field —
      // the plugin's own docs note a non-existing-directory path only
      // populates the filename input when it's actually resolvable as
      // "some directory + a name," which a directory-less relative string
      // isn't guaranteed to satisfy. An absolute path (Documents + name)
      // works correctly. `filters` also gets the right extension
      // pre-selected instead of the user having to type it themselves.
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const { documentDir, join } = await import('@tauri-apps/api/path');
      const ext = filename.split('.').pop() ?? 'txt';
      const defaultPath = await join(await documentDir(), filename).catch(() => filename);
      const path = await save({
        defaultPath,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (!path) return; // user cancelled the dialog
      await writeTextFile(path, content);
      return;
    }
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  // B45 — was four flat, loosely-related buttons (Export JSON, Export CSV,
  // Export Project, Import JSON), reading as bolted-on rather than one
  // backup/restore story. Redesigned into two groups: "Back up" (scope —
  // everything vs one project — is a single control, not implied by which
  // button you tap) and "Restore". CSV stays a separate, clearly-labeled
  // one-way export (it isn't round-trippable, so it doesn't belong in the
  // Back up / Restore pair conceptually, just alongside it).
  let autoBackupEnabled = isAutoBackupEnabled();
  let lastAutoBackupAt = getLastAutoBackupAt();
  function toggleAutoBackup() {
    autoBackupEnabled = !autoBackupEnabled;
    setAutoBackupEnabled(autoBackupEnabled);
  }

  let backupScope = ''; // '' = everything
  let  backupScopeOptions = __sveltets_2_invalidate(() => [{ value: '', label: 'Everything' }, ...$projectsStore.map(p => ({ value: p._id!, label: p.name }))]);
  async function doBackup() {
    try {
      const docs = backupScope
        ? await exportProjectDocs(backupScope)
        // attachments inlined as base64 rather than left as stubs -- see
        // autoBackup.ts's collectBackupJson() for why a stub makes the
        // whole restore fail, not just lose the file.
        : (await db.allDocs({ include_docs: true, attachments: true, binary: false })).rows.map((r: any) => r.doc).filter((d: any) => !d._id.startsWith('_'));
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

  // ── Maintenance (owner request 2026-07-16: folded into Advanced as a
  // "Run maintenance" modal, rather than its own always-visible tab —
  // the step list/progress bar is the one genuinely multi-step flow in
  // this file, so it's the clearest case for the modal pattern) ──
  type MaintStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
  // key is the same narrow union db.ts's MaintStepResult uses, not a bare
  // string -- setMaintStep() requires that union, so a plain `string` here
  // meant every call site was one typo away from silently matching nothing.
  interface MaintStep { key: MaintStepResult['key']; label: string; status: MaintStatus; note: string }
  let maintRunning = false;
  let maintSteps: MaintStep[] = [];
  let maintRemainingIssues: IntegrityIssue[] = [];

  // E3 (ROADMAP.md, done 2026-07-23): tauri.conf.json's plugins.updater
  // block points at a real signed endpoint (GitHub Releases' "latest"
  // download URL) with a real pubkey from `cargo tauri signer generate`.
  // v5.7.6 follow-up: the actual check/download/install state machine now
  // lives in updateChecker.ts (shared with App.svelte's background check
  // + banner) — this panel just drives it and shows its own status line
  // for the "you're on the latest version" / error cases the shared
  // UpdateModal doesn't cover (it only appears once an update exists).
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
    if ($updateState.phase === 'available') { showUpdateModal.set(true); }
    else if ($updateState.phase === 'idle') { updateStatus = "You're on the latest version."; }
    else if ($updateState.phase === 'error') { updateStatus = $updateState.error ?? 'Could not check for updates right now.'; }
  }
  let autoUpdateCheckEnabled = getAutoUpdateCheckEnabled();
  function toggleAutoUpdateCheck() {
    autoUpdateCheckEnabled = !autoUpdateCheckEnabled;
    setAutoUpdateCheckEnabled(autoUpdateCheckEnabled);
  }

  function freshMaintSteps(): MaintStep[] {
    return [
      { key: 'check',   label: 'Checking your data for problems', status: 'pending', note: '' },
      { key: 'repair',  label: 'Repairing anything fixable',      status: 'pending', note: '' },
      { key: 'history', label: 'Clearing old activity history',   status: 'pending', note: '' },
      { key: 'trash',   label: 'Clearing old items from Recycle', status: 'pending', note: '' },
      { key: 'compact', label: 'Freeing up unused space',         status: 'pending', note: '' },
    ];
  }
  maintSteps = freshMaintSteps();

  function setMaintStep(key: MaintStepResult['key'], patch: Partial<MaintStep>) {
    maintSteps = maintSteps.map(s => s.key === key ? { ...s, ...patch } : s);
  }

  // A9 (ROADMAP.md): the actual step sequencing/message-formatting now
  // lives in db.ts's runMaintenanceSteps() — testable directly against a
  // mocked db.ts, without mounting this whole file. This is just the thin
  // UI wiring: forward each emitted step into the reactive step list, and
  // handle the one thing that's genuinely this component's job (marking
  // whichever step was running when something threw).
  async function runMaintenance() {
    maintRunning = true;
    maintSteps = freshMaintSteps();
    maintRemainingIssues = [];
    try {
      const { remainingIssues } = await runMaintenanceSteps((step) => setMaintStep(step.key, { status: step.status, note: step.note }));
      maintRemainingIssues = remainingIssues;
      await loadBreakdown();
    } catch {
      const runningIdx = maintSteps.findIndex(s => s.status === 'running');
      if (runningIdx >= 0) setMaintStep(maintSteps[runningIdx].key, { status: 'error', note: 'Failed — please try again' });
      showError('Maintenance failed partway through. Please try again.');
    } finally {
      maintRunning = false;
    }
  }

  let  maintProgress = __sveltets_2_invalidate(() => Math.round((maintSteps.filter(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length / (maintSteps.length || 1)) * 100));

  // v5.4.1 bug (owner-reported live testing, 2026-07-20): this was
  // unconditional — every tab shares one footer Save button, but every
  // OTHER tab's settings already apply live on interaction (theme,
  // reminders, App Lock, etc. all call their own setters directly, no
  // buffering). Only syncUrl/credentialUser/credentialPass are buffered
  // in local state waiting for Save. Reloading unconditionally meant
  // clicking Save on e.g. Appearance forced a full page reload for no
  // reason — and with App Lock on, a reload re-triggers the cold-start
  // lock check, which read as "Save opens the PIN screen" even though
  // nothing PIN-related was touched. Now only reloads if the sync
  // URL/credentials actually changed.
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
;
async () => {

  { svelteHTML.createElement("svelte:window", {  "on:keydown":onWindowKeydown,});}


 { svelteHTML.createElement("div", {   "class":`settings-overlay`,"on:click":() => requestClose(),});
   {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ const $$_div1 = svelteHTML.createElement("div", __sveltets_2_union($$action_0), {   "class":`settings-panel`,});panelEl = $$_div1;
     { svelteHTML.createElement("div", {  "class":`settings-body`,});activeCategory !== null;
       { svelteHTML.createElement("nav", { "class":`settings-nav`,});
         { svelteHTML.createElement("h3", { "class":`nav-title`,});  }
           for(let cat of __sveltets_2_ensureArray(CATEGORIES)){cat.key;
           { svelteHTML.createElement("button", {    "class":`nav-item`,"on:click":() => selectCategory(cat.key),});activeCategory === cat.key;
             { svelteHTML.createElement("svg", {               "viewBox":`0 0 18 18`,"width":`16`,"height":`16`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,}); cat.icon; }
             { svelteHTML.createElement("span", {});cat.label; }
            if(cat.key === 'sync' && conflictCount > 0){ { svelteHTML.createElement("span", { "class":`nav-badge`,});conflictCount; }}
             { svelteHTML.createElement("svg", {                 "class":`chevron`,"viewBox":`0 0 8 14`,"width":`7`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`1,1 7,7 1,13`,});} }
           }
        }
       }

       { svelteHTML.createElement("div", { "class":`settings-detail`,});
        if(activeCategory){
           { svelteHTML.createElement("div", { "class":`detail-head`,});
             { svelteHTML.createElement("button", {     "class":`back-btn`,"on:click":backToList,"aria-label":`Back to categories`,});
               { svelteHTML.createElement("svg", {               "viewBox":`0 0 8 14`,"width":`9`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`7,1 1,7 7,13`,});} }
              
             }
             { svelteHTML.createElement("span", { "class":`detail-title`,});CATEGORIES.find(c => c.key === activeCategory)?.label; }
           }

           { svelteHTML.createElement("div", { "class":`detail-content`,});
            activeCategory; {
             { svelteHTML.createElement("div", {   "class":`detail-fade`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),({ duration: 140 })));
            if(activeCategory === 'appearance'){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("div", { "class":`setting-label`,});  }
                   { svelteHTML.createElement("div", {     "class":`theme-segment`,"role":`radiogroup`,"aria-label":`Theme`,});
                      for(let mode of __sveltets_2_ensureArray((['light', 'dark', 'system'] as ThemeMode[]))){
                       { svelteHTML.createElement("button", {          "class":`theme-seg-btn`,"role":`radio`,"aria-checked":themeMode === mode,"on:click":() => selectThemeMode(mode),});themeMode === mode;
                        mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System';
                       }
                    }
                   }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});       }

                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("div", { "class":`setting-label`,});   }
                   { svelteHTML.createElement("div", {     "class":`theme-segment`,"role":`radiogroup`,"aria-label":`Week starts on`,});
                     { svelteHTML.createElement("button", {          "class":`theme-seg-btn`,"role":`radio`,"aria-checked":!weekStartsMonday,"on:click":() => setWeekStart(false),});!weekStartsMonday;  }
                     { svelteHTML.createElement("button", {          "class":`theme-seg-btn`,"role":`radio`,"aria-checked":weekStartsMonday,"on:click":() => setWeekStart(true),});weekStartsMonday;  }
                   }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});        }

                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("div", { "class":`setting-label`,});  }
                   { svelteHTML.createElement("div", {     "class":`theme-segment`,"role":`radiogroup`,"aria-label":`Time format`,});
                     { svelteHTML.createElement("button", {          "class":`theme-seg-btn`,"role":`radio`,"aria-checked":!timeFormat24h,"on:click":() => setTimeFormat(false),});!timeFormat24h;  }
                     { svelteHTML.createElement("button", {          "class":`theme-seg-btn`,"role":`radio`,"aria-checked":timeFormat24h,"on:click":() => setTimeFormat(true),});timeFormat24h;  }
                   }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});               }
               }

               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("div", { "class":`setting-label`,});  }
                   { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":toggleHighContrast,"aria-label":`Toggle high contrast`,"role":`switch`,"aria-checked":highContrast,});highContrast;
                     { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                   }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});            }

                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("div", { "class":`setting-label`,});  }
                   { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":toggleReduceMotion,"aria-label":`Toggle reduce motion`,"role":`switch`,"aria-checked":reduceMotion,});reduceMotion;
                     { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                   }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});          }

                if(isNativePlatform()){
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("div", { "class":`setting-label`,});  }
                     { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":toggleHaptics,"aria-label":`Toggle haptic feedback`,"role":`switch`,"aria-checked":hapticsEnabled,});hapticsEnabled;
                       { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                     }
                   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});        }
                }
               }

            } else if (activeCategory === 'notifications'){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("span", { "class":`setting-label`,});notificationsEnabled ? 'Task reminders enabled' : 'Task reminders off'; }
                   { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":toggleNotificationsEnabled,"aria-label":`Toggle task reminders`,"role":`switch`,"aria-checked":notificationsEnabled,});notificationsEnabled;
                     { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                   }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});              }
               }

              if(notificationsEnabled){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("span", { "class":`setting-label`,});
                    if($permissionState === 'granted'){      } else if ($permissionState === 'denied'){  isTauri ? 'allow notifications for Offlog in Windows Settings → Notifications' : 'allow notifications for this site in your browser settings';
                    } else if ($permissionState === 'unsupported'){    }else{  }
                   }
                  if($permissionState !== 'granted' && $permissionState !== 'unsupported'){
                     { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => requestPermission(),});  }
                  }
                 }
                if(isAndroid){
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("span", { "class":`setting-label`,});
                      if($exactAlarmState === 'granted'){        } else if ($exactAlarmState === 'denied'){         }else{ }
                     }
                    if($exactAlarmState === 'denied'){
                       { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => requestExactAlarmPermission(),});  }
                    }
                   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});
                                                                       
                   }
                }
               }

               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("label", { "class":`field-label`,});
                         
                   { const $$_rekciPemiT8C = __sveltets_2_ensureComponent(TimePicker); const $$_rekciPemiT8 = new $$_rekciPemiT8C({ target: __sveltets_2_any(), props: {    "value":defaultReminderTime,}});$$_rekciPemiT8.$on("change", saveDefaultReminderTime);}
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});                    }
               }

               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("span", { "class":`setting-label`,});     }
                   { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":() => saveQuietHours({ enabled: !quietHours.enabled }),"aria-label":`Toggle quiet hours`,"role":`switch`,"aria-checked":quietHours.enabled,});quietHours.enabled;
                     { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                   }
                 }
                if(quietHours.enabled){
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("span", { "class":`setting-label`,});  }
                     { const $$_rekciPemiT8C = __sveltets_2_ensureComponent(TimePicker); const $$_rekciPemiT8 = new $$_rekciPemiT8C({ target: __sveltets_2_any(), props: {      "value":quietHours.start,"placement":`up`,}});$$_rekciPemiT8.$on("change", (e) => saveQuietHours({ start: e.detail }));}
                     { svelteHTML.createElement("span", { "class":`setting-label`,});  }
                     { const $$_rekciPemiT8C = __sveltets_2_ensureComponent(TimePicker); const $$_rekciPemiT8 = new $$_rekciPemiT8C({ target: __sveltets_2_any(), props: {      "value":quietHours.end,"placement":`up`,}});$$_rekciPemiT8.$on("change", (e) => saveQuietHours({ end: e.detail }));}
                   }
                }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});                }
               }
              }

            } else if (activeCategory === 'sync'){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("span", { "class":`setting-label`,});syncEnabled ? 'Sync enabled' : 'Sync paused'; }
                   { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":toggleSyncEnabled,"aria-label":`Toggle sync`,"role":`switch`,"aria-checked":syncEnabled,});syncEnabled;
                     { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                   }
                 }
                 { svelteHTML.createElement("p", {  "class":`setting-hint`,});connectionStatus.tone === 'warn';connectionStatus.text; }
                if(syncEnabled && isTauri && $otherHostsDetected.length){
                   { svelteHTML.createElement("p", { "class":`setting-hint setting-hint-warn`,});
                       $otherHostsDetected[0].name;    
                               
                             
                   }
                }
               }

              if(syncEnabled){
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});   }
                  if(isAndroid || isTauri){
                     { svelteHTML.createElement("button", {   "class":`link-row link-row-compact`,"on:click":() => showConnectModal = true,});
                       { svelteHTML.createElement("span", { "class":`link-row-title`,});   }
                       { svelteHTML.createElement("svg", {               "viewBox":`0 0 8 14`,"width":`7`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`1,1 7,7 1,13`,});} }
                     }
                  }else{
                     { svelteHTML.createElement("p", { "class":`setting-hint`,});                              }
                  }
                 }

                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                    
                     { svelteHTML.createElement("input", {          "bind:value":deviceName,"placeholder":`PC`,"on:blur":saveDeviceName,"enterkeyhint":`done`,"on:keydown":(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); },});/*Ωignore_startΩ*/() => deviceName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});                  }
                 }

                if(deviceLastSeen.length){
                   { svelteHTML.createElement("div", { "class":`setting-group`,});
                     { svelteHTML.createElement("div", { "class":`setting-section-title`,});   }
                       for(let d of __sveltets_2_ensureArray(deviceLastSeen)){d.device;
                       { svelteHTML.createElement("div", { "class":`setting-row`,});
                         { svelteHTML.createElement("span", { "class":`storage-info`,});d.device; }
                         { svelteHTML.createElement("span", {   "class":`storage-info`,"style":`color: var(--faint)`,});timeAgo(d.lastSeen); }
                       }
                    }
                   }
                }

                if(conflictCount > 0 || conflictList.length > 0){
                   { svelteHTML.createElement("div", { "class":`setting-group`,});
                     { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                     { svelteHTML.createElement("button", {   "class":`link-row link-row-compact`,"on:click":() => showConflictsModal = true,});
                       { svelteHTML.createElement("span", { "class":`link-row-title`,});  }
                       { svelteHTML.createElement("span", { "class":`nav-badge`,});conflictList.length || conflictCount; }
                     }
                   }
                }
              }

            } else if (activeCategory === 'organize'){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("button", {   "class":`link-row link-row-compact`,"on:click":openSpaceManager,});
                   { svelteHTML.createElement("span", { "class":`link-row-title`,});  }
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 8 14`,"width":`7`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`1,1 7,7 1,13`,});} }
                 }
                 { svelteHTML.createElement("button", {   "class":`link-row link-row-compact`,"on:click":openTagManager,});
                   { svelteHTML.createElement("span", { "class":`link-row-title`,});  }
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 8 14`,"width":`7`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`1,1 7,7 1,13`,});} }
                 }
                 { svelteHTML.createElement("button", {   "class":`link-row link-row-compact`,"on:click":openCustomFieldManager,});
                   { svelteHTML.createElement("span", { "class":`link-row-title`,});  }
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 8 14`,"width":`7`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`1,1 7,7 1,13`,});} }
                 }
                 { svelteHTML.createElement("button", {   "class":`link-row link-row-compact`,"on:click":openArchivedProjectsManager,});
                   { svelteHTML.createElement("span", { "class":`link-row-title`,});  }
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 8 14`,"width":`7`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`1,1 7,7 1,13`,});} }
                 }
               }

            } else if (activeCategory === 'data'){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                
                 { svelteHTML.createElement("div", { "class":`storage-summary`,});
                  if(!storageAvailable){
                     { svelteHTML.createElement("span", { "class":`storage-headline`,});       }
                  } else if (storagePercent >= STORAGE_WARN_THRESHOLD){
                     { svelteHTML.createElement("span", { "class":`storage-headline storage-headline-warn`,});    (storagePercent * 100).toFixed(0);  }
                     { svelteHTML.createElement("span", { "class":`storage-detail`,});storageInfo; }
                  }else{
                     { svelteHTML.createElement("span", { "class":`storage-headline`,});         }
                     { svelteHTML.createElement("span", { "class":`storage-detail`,});storageInfo || 'Calculating…'; }
                  }
                 }
                if(storageAvailable && storagePercent >= STORAGE_WARN_THRESHOLD){
                   { svelteHTML.createElement("p", { "class":`setting-hint setting-hint-warn`,});
                                 
                                  
                   }
                }
                if(breakdown){
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});
                    breakdown.activeTasks;  breakdown.activeTasks === 1 ? '' : 's'; 
                    breakdown.archivedTasks;  
                    breakdown.deletedTasks;   
                    breakdown.logEntries;  
                    if(breakdown.attachmentCount){ breakdown.attachmentCount; breakdown.attachmentCount === 1 ? '' : 's'; formatAttachmentSize(breakdown.attachmentBytes); }
                   }
                }
               }

              if(isNativePlatform() || isTauriCheck()){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("span", { "class":`setting-label`,});   }
                   { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":toggleAutoBackup,"aria-label":`Toggle automatic backups`,"role":`switch`,"aria-checked":autoBackupEnabled,});autoBackupEnabled;
                     { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                   }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});
                  if(lastAutoBackupAt){  fmtLastSynced(lastAutoBackupAt);        
                                      
                      }else{              
                                      }
                 }
               }
              }

               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});           }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("div", { "class":`project-export-select`,});
                     { const $$_tceleSmotsuC9C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC9 = new $$_tceleSmotsuC9C({ target: __sveltets_2_any(), props: {    "options":backupScopeOptions,value:backupScope,}});/*Ωignore_startΩ*/() => backupScope = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC9.$$bindings = 'value';}
                   }
                   { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":doBackup,});  }
                 }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("span", {   "class":`storage-info`,"style":`color: var(--muted)`,});           }
                   { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":doExportCSV,});  }
                 }
               }

               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("div", { "class":`setting-row`,});
                   { svelteHTML.createElement("span", {   "class":`storage-info`,"style":`color: var(--muted)`,});importStatus || 'Restore from a backup file'; }
                   { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":handleImport,});   }
                 }
               }

            } else if (activeCategory === 'security'){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});                               }

                if(!appLockEnabled){
                  if(!showPinForm){
                     { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":openPinForm,});   }
                  }else{
                     { svelteHTML.createElement("label", { "class":`field-label`,});
                       
                       { svelteHTML.createElement("input", {            "type":`password`,"inputmode":`numeric`,"autocomplete":`off`,"maxlength":8,"bind:value":newPin,"placeholder":`4–8 digits`,});/*Ωignore_startΩ*/() => newPin = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                     }
                     { svelteHTML.createElement("label", { "class":`field-label`,});
                       
                       { svelteHTML.createElement("input", {            "type":`password`,"inputmode":`numeric`,"autocomplete":`off`,"maxlength":8,"bind:value":confirmPin,"placeholder":`4–8 digits`,});/*Ωignore_startΩ*/() => confirmPin = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                     }
                     { svelteHTML.createElement("label", { "class":`field-label`,});
                       
                       { svelteHTML.createElement("input", {        "type":`text`,"maxlength":60,"bind:value":pinHint,"placeholder":`A reminder only you'd understand`,});/*Ωignore_startΩ*/() => pinHint = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                     }
                    if(pinError){ { svelteHTML.createElement("p", { "class":`setting-hint setting-hint-warn`,});pinError; }}
                     { svelteHTML.createElement("div", { "class":`setting-row`,});
                       { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => showPinForm = false,});  }
                       { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":savePin,"disabled":pinSaving,});pinSaving ? 'Saving…' : 'Save PIN'; }
                     }
                  }
                } else if (pinGateMode){
                   { const $$_etaGniPmrifnoC7C = __sveltets_2_ensureComponent(ConfirmPinGate); const $$_etaGniPmrifnoC7 = new $$_etaGniPmrifnoC7C({ target: __sveltets_2_any(), props: {           "message":pinGateMode === 'remove'
                      ? 'Turn off the PIN lock? Offlog will no longer require a PIN to open. Enter your current PIN to confirm.'
                      : 'Enter your current PIN to change it.',"confirmLabel":pinGateMode === 'remove' ? 'Turn off' : 'Continue',"danger":pinGateMode === 'remove',}});$$_etaGniPmrifnoC7.$on("verified", onPinGateVerified);$$_etaGniPmrifnoC7.$on("cancel", () => pinGateMode = null);}
                } else if (!showPinForm){
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("span", { "class":`setting-label`,});   }
                     { svelteHTML.createElement("div", { "class":`setting-row`,});
                       { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => pinGateMode = 'change',});  }
                       { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => pinGateMode = 'remove',});  }
                     }
                   }
                }else{
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                     
                     { svelteHTML.createElement("input", {            "type":`password`,"inputmode":`numeric`,"autocomplete":`off`,"maxlength":8,"bind:value":newPin,"placeholder":`4–8 digits`,});/*Ωignore_startΩ*/() => newPin = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                   }
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                     
                     { svelteHTML.createElement("input", {            "type":`password`,"inputmode":`numeric`,"autocomplete":`off`,"maxlength":8,"bind:value":confirmPin,"placeholder":`4–8 digits`,});/*Ωignore_startΩ*/() => confirmPin = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                   }
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                     
                     { svelteHTML.createElement("input", {        "type":`text`,"maxlength":60,"bind:value":pinHint,"placeholder":`A reminder only you'd understand`,});/*Ωignore_startΩ*/() => pinHint = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                   }
                  if(pinError){ { svelteHTML.createElement("p", { "class":`setting-hint setting-hint-warn`,});pinError; }}
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => showPinForm = false,});  }
                     { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":savePin,"disabled":pinSaving,});pinSaving ? 'Saving…' : 'Save PIN'; }
                   }
                }
               }

              if(appLockEnabled){
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                         
                     { const $$_tceleSmotsuC8C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC8 = new $$_tceleSmotsuC8C({ target: __sveltets_2_any(), props: {      "options":LOCK_TIMEOUT_OPTIONS,value:lockTimeoutStr,}});/*Ωignore_startΩ*/() => lockTimeoutStr = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC8.$$bindings = 'value';$$_tceleSmotsuC8.$on("change", (e) => onLockTimeoutChange(e.detail));}
                   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});            }
                 }
              }

              if(isNativePlatform() && appLockEnabled){
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("div", { "class":`setting-label`,});   }
                     { svelteHTML.createElement("button", {            "class":`toggle-btn`,"on:click":toggleBiometric,"disabled":biometricBusy,"aria-label":`Toggle biometric unlock`,"role":`switch`,"aria-checked":biometricEnabled,});biometricEnabled;
                       { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                     }
                   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});                            }
                  if(biometricError){ { svelteHTML.createElement("p", { "class":`setting-hint setting-hint-error`,});biometricError; }}
                  if(biometricNoneEnrolled){
                     { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":openBiometricEnrollment,});   }
                  }
                 }

                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("div", { "class":`setting-label`,});    }
                     { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":togglePrivacyScreen,"aria-label":`Toggle privacy screen`,"role":`switch`,"aria-checked":privacyScreenEnabled,});privacyScreenEnabled;
                       { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                     }
                   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});                                                            }
                 }
              }

            } else if (activeCategory === 'advanced'){
               { svelteHTML.createElement("div", { "class":`setting-group`,});
                 { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                 { svelteHTML.createElement("button", {   "class":`link-row link-row-compact`,"on:click":() => showMaintenanceModal = true,});
                   { svelteHTML.createElement("span", { "class":`link-row-title`,});  }
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 8 14`,"width":`7`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`1,1 7,7 1,13`,});} }
                 }
                 { svelteHTML.createElement("p", { "class":`setting-hint`,});              }
               }

              if(isTauri){
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("span", { "class":`setting-label`,});     }
                     { svelteHTML.createElement("button", {          "class":`toggle-btn`,"on:click":toggleAutoUpdateCheck,"aria-label":`Toggle automatic update checks`,"role":`switch`,"aria-checked":autoUpdateCheckEnabled,});autoUpdateCheckEnabled;
                       { svelteHTML.createElement("span", { "class":`toggle-knob`,}); }
                     }
                   }
                   { svelteHTML.createElement("div", { "class":`setting-row compact-row`,});
                     { svelteHTML.createElement("span", { "class":`setting-label`,}); appVersion || '—'; }
                     { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":onCheckForUpdate,"disabled":updateChecking,});
                      updateChecking ? 'Checking…' : 'Check for updates';
                     }
                   }
                  if(updateStatus){ { svelteHTML.createElement("p", { "class":`setting-hint compact-hint`,});updateStatus; }}
                 }
              } else if (isNativePlatform()){
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});  }
                   { svelteHTML.createElement("div", { "class":`setting-row`,});
                     { svelteHTML.createElement("span", { "class":`setting-label`,});  }
                     { svelteHTML.createElement("span", { "class":`setting-value`,});appVersion || '—'; }
                   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});         }
                 }
              }

              if(syncEnabled){
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});    }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});                                   }
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                          
                     { svelteHTML.createElement("input", {    "bind:value":syncUrl,"placeholder":`http://192.168.1.100:5984/offlog`,});/*Ωignore_startΩ*/() => syncUrl = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                   }
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                    
                     { svelteHTML.createElement("input", {    "bind:value":credentialUser,"placeholder":`offlog`,});/*Ωignore_startΩ*/() => credentialUser = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                   }
                   { svelteHTML.createElement("label", { "class":`field-label`,});
                    
                     { svelteHTML.createElement("input", {    "type":`password`,"bind:value":credentialPass,});/*Ωignore_startΩ*/() => credentialPass = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                   }
                  if(syncError && lastErrorAt){
                     { svelteHTML.createElement("p", { "class":`setting-hint setting-hint-warn`,});   fmtLastSynced(lastErrorAt); syncError; }
                  }
                 }
              }else{
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});    }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});          }
                 }
              }

              if(isTauriDebug){
                 { svelteHTML.createElement("div", { "class":`setting-group`,});
                   { svelteHTML.createElement("div", { "class":`setting-section-title`,});   }
                   { svelteHTML.createElement("p", { "class":`setting-hint`,});                        }
                   { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":resetPcTestData,"disabled":resetBusy,});
                    resetBusy ? 'Resetting…' : 'Reset test data';
                   }
                 }
              }
            }
             }
            }
           }
        }
       }
     }

     { svelteHTML.createElement("div", { "class":`settings-actions`,});
       { svelteHTML.createElement("button", {  "on:click":() => requestClose(),});  }
       { svelteHTML.createElement("button", {   "class":`save-btn`,"on:click":saveSettings,});(activeCategory === 'sync' || activeCategory === 'advanced') && syncEnabled ? 'Save & restart sync' : 'Save'; }
     }
   }}
 }

if(showConnectModal){
  
   { svelteHTML.createElement("div", {     "class":`mini-modal-scrim`,"on:click":() => showConnectModal = false,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
     { svelteHTML.createElement("div", {  "class":`mini-modal`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
       { svelteHTML.createElement("div", { "class":`mini-modal-head`,});
         { svelteHTML.createElement("span", { "class":`mini-modal-title`,});   }
         { svelteHTML.createElement("button", {     "class":`mini-modal-close`,"on:click":() => showConnectModal = false,"aria-label":`Close`,});  }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-body`,});
        if(isAndroid){
          if(pairSuccessName){
             { svelteHTML.createElement("p", { "class":`setting-hint success-hint`,});   pairSuccessName;    }
             { svelteHTML.createElement("div", { "class":`setting-row-end`,});
               { svelteHTML.createElement("button", {   "class":`btn-primary`,"on:click":() => showConnectModal = false,});  }
             }
          } else if (!selectedHost){
             { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":startDeviceScan,"disabled":$isScanning,});
              $isScanning ? 'Looking for your computer…' : 'Find my computer';
             }
               for(let host of __sveltets_2_ensureArray($discoveredHosts)){host.uuid;
               { svelteHTML.createElement("div", { "class":`setting-row`,});
                 { svelteHTML.createElement("span", { "class":`storage-info`,}); host.name;  }
                 { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => { selectedHost = host; stopScan(); },});  }
               }
            }
          }else{
             { svelteHTML.createElement("p", { "class":`setting-hint`,});      selectedHost.name;  }
             { svelteHTML.createElement("label", { "class":`field-label`,});
               
               { svelteHTML.createElement("input", {          "bind:value":pairingCode,"placeholder":`123456`,"inputmode":`numeric`,"maxlength":6,"disabled":pairingBusy,});/*Ωignore_startΩ*/() => pairingCode = __sveltets_2_any(null);/*Ωignore_endΩ*/}
             }
            if(pairingError){ { svelteHTML.createElement("p", { "class":`setting-hint setting-hint-warn`,});pairingError; }}
             { svelteHTML.createElement("div", { "class":`setting-row-end`,});
               { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":() => { selectedHost = null; pairingCode = ''; pairingError = ''; },"disabled":pairingBusy,});  }
               { svelteHTML.createElement("button", {     "class":`btn-primary`,"on:click":submitPairingCode,"disabled":pairingBusy || pairingCode.trim().length !== 6,});
                pairingBusy ? 'Connecting…' : 'Connect';
               }
             }
          }
        } else if (isTauri){
          if(pcPairedDeviceName){
             { svelteHTML.createElement("p", { "class":`setting-hint success-hint`,});   pcPairedDeviceName;    }
          } else if (pcPairingCode){
             { svelteHTML.createElement("p", { "class":`setting-hint`,});             }
             { svelteHTML.createElement("p", {   "class":`storage-info`,"style":`font-size: 1.5rem; letter-spacing: 0.2em; text-align: center;`,});pcPairingCode; }
             { svelteHTML.createElement("p", { "class":`setting-hint`,});              }
          }else{
             { svelteHTML.createElement("p", { "class":`setting-hint`,});                       }
          }
           { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":generatePcPairingCode,"disabled":pcPairingBusy,});
            pcPairingBusy ? 'Generating…' : pcPairingCode ? 'Generate a new code' : 'Generate a code';
           }
        }
       }
     }
   }
}

if(showConflictsModal){
  
   { svelteHTML.createElement("div", {     "class":`mini-modal-scrim`,"on:click":() => showConflictsModal = false,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
     { svelteHTML.createElement("div", {  "class":`mini-modal`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
       { svelteHTML.createElement("div", { "class":`mini-modal-head`,});
         { svelteHTML.createElement("span", { "class":`mini-modal-title`,});  }
         { svelteHTML.createElement("button", {     "class":`mini-modal-close`,"on:click":() => showConflictsModal = false,"aria-label":`Close`,});  }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-body`,});
         { svelteHTML.createElement("div", { "class":`setting-row`,});
           { svelteHTML.createElement("span", {   "class":`storage-info`,"style":`color: var(--muted)`,});
            if(loadingConflicts){ } else if (conflictList.length){conflictList.length; conflictList.length === 1 ? '' : 's';   }else{conflictCount; conflictCount === 1 ? '' : 's'; }
           }
           { svelteHTML.createElement("button", {     "class":`export-btn`,"on:click":loadConflicts,"disabled":loadingConflicts,});  }
         }
           for(let c of __sveltets_2_ensureArray(conflictList)){c.docId;
           { svelteHTML.createElement("div", { "class":`conflict-item`,});
             { svelteHTML.createElement("div", { "class":`conflict-item-title`,});c.label;  { svelteHTML.createElement("span", { "class":`conflict-item-type`,}); c.type;  } }
             { svelteHTML.createElement("div", { "class":`conflict-item-row`,});
               { svelteHTML.createElement("span", { "class":`conflict-item-meta`,});  c.current.source ? `${c.current.source}, ` : ''; fmtLastSynced(c.current.updated_at ?? c.current.created_at ?? ''); }
               { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => resolve(c, 'current'),});  }
             }
             { svelteHTML.createElement("div", { "class":`conflict-item-row`,});
               { svelteHTML.createElement("span", { "class":`conflict-item-meta`,});  c.other.doc.source ? `${c.other.doc.source}, ` : ''; fmtLastSynced(c.other.doc.updated_at ?? c.other.doc.created_at ?? ''); }
               { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":() => resolve(c, 'other'),});  }
             }
           }
        }
       }
     }
   }
}

if(showMaintenanceModal){
  
   { svelteHTML.createElement("div", {     "class":`mini-modal-scrim`,"on:click":() => showMaintenanceModal = false,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
     { svelteHTML.createElement("div", {  "class":`mini-modal`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
       { svelteHTML.createElement("div", { "class":`mini-modal-head`,});
         { svelteHTML.createElement("span", { "class":`mini-modal-title`,});  }
         { svelteHTML.createElement("button", {     "class":`mini-modal-close`,"on:click":() => showMaintenanceModal = false,"aria-label":`Close`,});  }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-body`,});
         { svelteHTML.createElement("p", { "class":`setting-hint`,});
                          
                        
              
         }

         { svelteHTML.createElement("div", { "class":`progress-track`,}); { svelteHTML.createElement("div", {   "class":`progress-fill`,"style":`width:${maintProgress}%`,}); } }

         { svelteHTML.createElement("div", { "class":`maint-steps`,});
             for(let step of __sveltets_2_ensureArray(maintSteps)){step.key;
             { svelteHTML.createElement("div", {  "class":`maint-step`,});step.status === 'running';
               { svelteHTML.createElement("span", {     "class":`maint-step-icon`,});step.status === 'done';step.status === 'skipped';step.status === 'error';step.status === 'running';
                if(step.status === 'done'){ } else if (step.status === 'skipped'){ } else if (step.status === 'error'){ } else if (step.status === 'running'){ { svelteHTML.createElement("span", { "class":`spinner`,}); }
                }
               }
               { svelteHTML.createElement("span", { "class":`maint-step-label`,});step.label; }
              if(step.note){ { svelteHTML.createElement("span", { "class":`maint-step-note`,});step.note; }}
             }
          }
         }

        if(maintRemainingIssues.length > 0){
           { svelteHTML.createElement("div", { "class":`integrity-list`,});
              for(let issue of __sveltets_2_ensureArray((maintRemainingIssues.slice(0, 8)))){
               { svelteHTML.createElement("div", { "class":`integrity-row`,});issue.description; }
            }
           }
           { svelteHTML.createElement("p", { "class":`setting-hint`,});          }
        }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-actions`,});
         { svelteHTML.createElement("button", {     "class":`btn-primary`,"on:click":runMaintenance,"disabled":maintRunning,});
          maintRunning ? 'Running…' : maintSteps.some(s => s.status === 'done') ? 'Run Again' : 'Run Maintenance';
         }
       }
     }
   }
}

if(importPreview){
  
   { svelteHTML.createElement("div", {     "class":`mini-modal-scrim`,"on:click":cancelImport,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
     { svelteHTML.createElement("div", {  "class":`mini-modal`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
       { svelteHTML.createElement("div", { "class":`mini-modal-head`,});
         { svelteHTML.createElement("span", { "class":`mini-modal-title`,});   }
         { svelteHTML.createElement("button", {     "class":`mini-modal-close`,"on:click":cancelImport,"aria-label":`Close`,});  }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-body`,});
         { svelteHTML.createElement("p", { "class":`setting-hint`,});
             { svelteHTML.createElement("strong", {});importPreview.byType.space; } importPreview.byType.space === 1 ? '' : 's';
           { svelteHTML.createElement("strong", {});importPreview.byType.project; } importPreview.byType.project === 1 ? '' : 's';
           { svelteHTML.createElement("strong", {});importPreview.byType.task; } importPreview.byType.task === 1 ? '' : 's';
          if(importPreview.toSkip > 0){  { svelteHTML.createElement("strong", {});importPreview.toSkip; }  importPreview.toSkip === 1 ? 'y' : 'ies';   }
                      
         }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-actions`,});
         { svelteHTML.createElement("button", {   "class":`export-btn`,"on:click":cancelImport,});  }
         { svelteHTML.createElement("button", {   "class":`btn-primary`,"on:click":confirmImport,}); importPreview.toCreate; importPreview.toCreate === 1 ? '' : 's'; }
       }
     }
   }
}

if(newRecoveryCode){
  
   { svelteHTML.createElement("div", {   "class":`mini-modal-scrim`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
     { svelteHTML.createElement("div", {  "class":`mini-modal recovery-modal`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
       { svelteHTML.createElement("div", { "class":`mini-modal-head`,});
         { svelteHTML.createElement("span", { "class":`mini-modal-title`,});    }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-body`,});
         { svelteHTML.createElement("p", { "class":`setting-hint`,});
                          
                        
                 
         }
         { svelteHTML.createElement("div", { "class":`recovery-code`,});newRecoveryCode; }
         { svelteHTML.createElement("button", {   "class":`export-btn recovery-copy-btn`,"on:click":copyRecoveryCode,});recoveryCopied ? 'Copied' : 'Copy'; }
         { svelteHTML.createElement("label", { "class":`recovery-ack-row`,});
           { svelteHTML.createElement("input", {    "type":`checkbox`,"bind:checked":recoveryCodeSavedAck,});/*Ωignore_startΩ*/() => recoveryCodeSavedAck = __sveltets_2_any(null);/*Ωignore_endΩ*/}
               
         }
       }
       { svelteHTML.createElement("div", { "class":`mini-modal-actions`,});
         { svelteHTML.createElement("button", {     "class":`btn-primary`,"on:click":() => newRecoveryCode = null,"disabled":!recoveryCodeSavedAck,});  }
       }
     }
   }
}

if(showSpaceManager && SpaceManagerComp){
  spaceManagerSession; {
     { const $$_tnenopmoc_etlevs0C = __sveltets_2_ensureComponent(SpaceManagerComp); const $$_tnenopmoc_etlevs0 = new $$_tnenopmoc_etlevs0C({ target: __sveltets_2_any(), props: {    }});$$_tnenopmoc_etlevs0.$on("close", onSpaceManagerClosed);}
  }
}

if(showTagManager && TagManagerComp){
  tagManagerSession; {
     { const $$_tnenopmoc_etlevs0C = __sveltets_2_ensureComponent(TagManagerComp); const $$_tnenopmoc_etlevs0 = new $$_tnenopmoc_etlevs0C({ target: __sveltets_2_any(), props: {    }});$$_tnenopmoc_etlevs0.$on("close", onTagManagerClosed);}
  }
}
if(showCustomFieldManager && CustomFieldManagerComp){
  customFieldManagerSession; {
     { const $$_tnenopmoc_etlevs0C = __sveltets_2_ensureComponent(CustomFieldManagerComp); const $$_tnenopmoc_etlevs0 = new $$_tnenopmoc_etlevs0C({ target: __sveltets_2_any(), props: {    }});$$_tnenopmoc_etlevs0.$on("close", onCustomFieldManagerClosed);}
  }
}
if(showArchivedProjectsManager && ArchivedProjectsManagerComp){
  archivedProjectsManagerSession; {
     { const $$_tnenopmoc_etlevs0C = __sveltets_2_ensureComponent(ArchivedProjectsManagerComp); const $$_tnenopmoc_etlevs0 = new $$_tnenopmoc_etlevs0C({ target: __sveltets_2_any(), props: {    }});$$_tnenopmoc_etlevs0.$on("close", onArchivedProjectsManagerClosed);}
  }
}


};
return { props: {initialCategory: initialCategory} as {initialCategory?: Category | null}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void }>()} }}
const SettingsPanel__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type SettingsPanel__SvelteComponent_ = InstanceType<typeof SettingsPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default SettingsPanel__SvelteComponent_;