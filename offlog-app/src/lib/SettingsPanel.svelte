<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';
  import TimePicker from './TimePicker.svelte';
  import db, {
    syncState, syncNow, importJSON, analyzeImport, exportProjectDocs, exportTasksCSV,
    getConflicts, resolveConflict, type ConflictInfo,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    startSync, cancelSync, getDeviceLastSeen,
    checkIntegrity, repairDatabase, pruneOldLogs, pruneOldDeletedTasks, type IntegrityIssue,
    wipeAndReseed,
  } from './db';
  import { projects as projectsStore } from './store';
  import { getSyncUrl, setSyncUrl, getSyncCredentials, setSyncCredentials, getDeviceName, setDeviceName, isSyncEnabled, setSyncEnabled, getDefaultReminderTime, setDefaultReminderTime, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h, isTauri as isTauriCheck, invokeTauri, isAppLockEnabled, setAppLockPin, clearAppLockPin, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes, getAppLockHint, isNativePlatform, isAppLockBiometricEnabled, setAppLockBiometricEnabled, syncPrivacyScreen, isHapticsEnabled, setHapticsEnabled, isPrivacyScreenEnabled, setPrivacyScreenEnabled, otherHostsDetected } from '../config';
  import { timeAgo, fmtLastSynced } from './utils';
  import { discoveredHosts, isScanning, scanForHosts, stopScan, pairWithHost, type DiscoveredHost } from './discovery';
  import { requestPermission, permissionState, exactAlarmState, checkExactAlarmPermission, requestExactAlarmPermission } from './notifications';
  import { showError, modalOpen } from './store';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import { getThemeMode, setThemeMode, getHighContrast, setHighContrast, getReduceMotion, setReduceMotion, type ThemeMode } from './theme';
  import { fade } from 'svelte/transition';
  import { dialogPop, scrimFade } from './motion';

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
  let isNarrow = false;
  let activeCategory: Category | null = null;
  let popDetailLayer: (() => void) | null = null;
  let panelEl: HTMLDivElement;

  onMount(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isNarrow = mq.matches;
    activeCategory = isNarrow ? null : 'appearance';
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
  // B12: default time-of-day used when a task's "remind me on the due
  // date" toggle derives reminder_at — per-device, same reasoning as B36's
  // localStorage choices (see config.ts's getDefaultReminderTime()).
  let defaultReminderTime = getDefaultReminderTime();
  function saveDefaultReminderTime(e: CustomEvent<string>) {
    defaultReminderTime = e.detail;
    setDefaultReminderTime(defaultReminderTime);
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

  async function removePin() {
    const ok = await confirmAction(
      'Turn off the PIN lock? Offlog will no longer require a PIN to open.',
      { confirmLabel: 'Turn off', danger: true },
    );
    if (!ok) return;
    clearAppLockPin();
    appLockEnabled = false;
    biometricEnabled = false;
    privacyScreenEnabled = false;
    syncPrivacyScreen();
  }

  function onLockTimeoutChange(v: string) {
    appLockTimeout = Number(v);
    setAppLockTimeoutMinutes(appLockTimeout);
  }

  // ── Sync ────────────────────────────────────────────────────────────────
  let syncUrl = getSyncUrl();
  let { user: credentialUser, pass: credentialPass } = getSyncCredentials();
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
  $: connectionStatus =
    !syncEnabled ? { text: 'Sync is paused.', tone: 'muted' } :
    !syncUrl ? (isAndroid
      ? { text: 'Not connected to another device yet — tap "Find my computer" below to connect.', tone: 'muted' }
      : { text: 'Not connected to another device yet — open the Advanced tab to connect one.', tone: 'muted' }) :
    syncStatus === 'syncing' ? { text: 'Syncing…', tone: 'muted' } :
    syncStatus === 'offline' ? { text: 'Offline — will resume automatically when back on your network.', tone: 'muted' } :
    syncStatus === 'error' ? { text: syncError || 'Sync error.', tone: 'warn' } :
    lastSynced ? { text: `Connected — last synced ${fmtLastSynced(lastSynced)}`, tone: 'ok' } :
    { text: 'Connected — waiting for first sync…', tone: 'muted' };

  function toggleSyncEnabled() {
    syncEnabled = !syncEnabled;
    setSyncEnabled(syncEnabled);
    if (syncEnabled) startSync(); else cancelSync();
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
      ({ user: credentialUser, pass: credentialPass } = getSyncCredentials());
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
  $: if (!showConnectModal) { stopPcPairPoll(); pcPairedDeviceName = null; pairSuccessName = null; }
  onDestroy(stopPcPairPoll);

  // Dev-only: wipes this PC's CouchDB data and restarts, so testing "what
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
      // completely separate local database from the embedded CouchDB
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
  $: if (activeCategory === 'sync' && conflictCount > 0 && conflictList.length === 0 && !loadingConflicts) loadConflicts();
  $: if (activeCategory === 'sync' && !deviceLastSeenLoaded) loadDeviceLastSeen();

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
      showError('Could not open Spaces — ' + (e instanceof Error ? e.message : String(e)));
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
      showError('Could not open Tags — ' + (e instanceof Error ? e.message : String(e)));
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
      showError('Could not open Custom Fields — ' + (e instanceof Error ? e.message : String(e)));
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
      showError('Could not open Archived Projects — ' + (e instanceof Error ? e.message : String(e)));
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
  let backupScope = ''; // '' = everything
  $: backupScopeOptions = [{ value: '', label: 'Everything' }, ...$projectsStore.map(p => ({ value: p._id!, label: p.name }))];
  async function doBackup() {
    try {
      const docs = backupScope
        ? await exportProjectDocs(backupScope)
        : (await db.allDocs({ include_docs: true })).rows.map((r: any) => r.doc).filter((d: any) => !d._id.startsWith('_'));
      const name = backupScope ? ($projectsStore.find(p => p._id === backupScope)?.name.toLowerCase().replace(/\s+/g, '-') ?? 'project') : 'backup';
      await downloadBlob(JSON.stringify(docs, null, 2), 'application/json', `offlog-${name}-${new Date().toISOString().slice(0,10)}.json`);
    } catch {
      showError('Failed to back up. Please try again.');
    }
  }

  async function doExportCSV() {
    try {
      const csv = await exportTasksCSV();
      await downloadBlob(csv, 'text/csv', `offlog-tasks-${new Date().toISOString().slice(0,10)}.csv`);
    } catch {
      showError('Failed to export CSV. Please try again.');
    }
  }

  // ── Maintenance (owner request 2026-07-16: folded into Advanced as a
  // "Run maintenance" modal, rather than its own always-visible tab —
  // the step list/progress bar is the one genuinely multi-step flow in
  // this file, so it's the clearest case for the modal pattern) ──
  type MaintStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
  interface MaintStep { key: string; label: string; status: MaintStatus; note: string }
  let maintRunning = false;
  let maintSteps: MaintStep[] = [];
  let maintRemainingIssues: IntegrityIssue[] = [];

  // Scaffolding ahead of C1 (open-sourcing the repo) — tauri.conf.json's
  // plugins.updater block exists but points at a placeholder endpoint
  // (https://example.invalid/...) and pubkey, not real hosting, so
  // check() below always fails until C1 provides a real update feed and
  // the owner generates a real signing key. Wired up now anyway (owner
  // request, 2026-07-16) so the UI/flow is ready the moment that lands.
  let updateChecking = false;
  let updateStatus = '';
  async function checkForUpdate() {
    updateChecking = true;
    updateStatus = '';
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        updateStatus = "You're on the latest version.";
        return;
      }
      updateStatus = `Downloading v${update.version}…`;
      await update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e: any) {
      updateStatus = 'Could not check for updates right now.';
    } finally {
      updateChecking = false;
    }
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

  function setMaintStep(i: number, patch: Partial<MaintStep>) {
    maintSteps = maintSteps.map((s, idx) => idx === i ? { ...s, ...patch } : s);
  }

  async function runMaintenance() {
    maintRunning = true;
    maintSteps = freshMaintSteps();
    maintRemainingIssues = [];
    try {
      setMaintStep(0, { status: 'running' });
      const { issues, checked } = await checkIntegrity();
      setMaintStep(0, { status: 'done', note: issues.length === 0 ? `No problems found (${checked} items checked)` : `${issues.length} issue${issues.length === 1 ? '' : 's'} found` });

      if (issues.length === 0) {
        setMaintStep(1, { status: 'skipped', note: 'Nothing to repair' });
      } else {
        setMaintStep(1, { status: 'running' });
        const { fixed, skipped } = await repairDatabase();
        setMaintStep(1, { status: 'done', note: `Fixed ${fixed}${skipped ? `, ${skipped} need manual review` : ''}` });
        if (skipped > 0) {
          const after = await checkIntegrity();
          maintRemainingIssues = after.issues;
        }
      }

      setMaintStep(2, { status: 'running' });
      const prunedLogs = await pruneOldLogs();
      setMaintStep(2, { status: 'done', note: prunedLogs > 0 ? `Removed ${prunedLogs} entr${prunedLogs === 1 ? 'y' : 'ies'} older than 6 months` : 'Nothing old enough to remove' });

      setMaintStep(3, { status: 'running' });
      const prunedTasks = await pruneOldDeletedTasks();
      setMaintStep(3, { status: 'done', note: prunedTasks > 0 ? `Removed ${prunedTasks} item${prunedTasks === 1 ? '' : 's'} older than 3 months` : 'Nothing old enough to remove' });

      setMaintStep(4, { status: 'running' });
      await db.compact();
      setMaintStep(4, { status: 'done', note: 'Reclaimed disk space' });

      await loadBreakdown();
    } catch {
      const runningIdx = maintSteps.findIndex(s => s.status === 'running');
      if (runningIdx >= 0) setMaintStep(runningIdx, { status: 'error', note: 'Failed — please try again' });
      showError('Maintenance failed partway through. Please try again.');
    } finally {
      maintRunning = false;
    }
  }

  $: maintProgress = Math.round((maintSteps.filter(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length / (maintSteps.length || 1)) * 100);

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
  function saveSettings() {
    const { user: storedUser, pass: storedPass } = getSyncCredentials();
    const syncChanged = syncUrl !== getSyncUrl() || credentialUser !== storedUser || credentialPass !== storedPass;
    if (syncChanged) {
      setSyncUrl(syncUrl);
      setSyncCredentials(credentialUser, credentialPass);
      requestClose();
      location.reload();
      return;
    }
    requestClose();
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="settings-overlay" on:click|self={() => requestClose()}>
  <div class="settings-panel" bind:this={panelEl} use:trapFocus>
    <div class="settings-body" class:detail-open={activeCategory !== null}>
      <nav class="settings-nav">
        <h3 class="nav-title">Settings</h3>
        {#each CATEGORIES as cat (cat.key)}
          <button class="nav-item" class:active={activeCategory === cat.key} on:click={() => selectCategory(cat.key)}>
            <svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{@html cat.icon}</svg>
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
            <div class="detail-fade" in:fade={{ duration: 140 }}>
            {#if activeCategory === 'appearance'}
              <div class="setting-group">
                <div class="setting-section-title">Display</div>
                <div class="setting-row">
                  <div class="setting-label">Theme</div>
                  <div class="theme-segment" role="radiogroup" aria-label="Theme">
                    {#each (['light', 'dark', 'system'] as ThemeMode[]) as mode}
                      <button
                        class="theme-seg-btn"
                        class:active={themeMode === mode}
                        role="radio"
                        aria-checked={themeMode === mode}
                        on:click={() => selectThemeMode(mode)}
                      >
                        {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'}
                      </button>
                    {/each}
                  </div>
                </div>
                <p class="setting-hint">"System" follows your device's light/dark setting automatically.</p>

                <div class="setting-row">
                  <div class="setting-label">Week starts on</div>
                  <div class="theme-segment" role="radiogroup" aria-label="Week starts on">
                    <button
                      class="theme-seg-btn"
                      class:active={!weekStartsMonday}
                      role="radio"
                      aria-checked={!weekStartsMonday}
                      on:click={() => setWeekStart(false)}
                    >Sunday</button>
                    <button
                      class="theme-seg-btn"
                      class:active={weekStartsMonday}
                      role="radio"
                      aria-checked={weekStartsMonday}
                      on:click={() => setWeekStart(true)}
                    >Monday</button>
                  </div>
                </div>
                <p class="setting-hint">Controls Agenda's week view and "this week" grouping.</p>

                <div class="setting-row">
                  <div class="setting-label">Time format</div>
                  <div class="theme-segment" role="radiogroup" aria-label="Time format">
                    <button
                      class="theme-seg-btn"
                      class:active={timeFormat24h}
                      role="radio"
                      aria-checked={timeFormat24h}
                      on:click={() => setTimeFormat(true)}
                    >24h</button>
                    <button
                      class="theme-seg-btn"
                      class:active={!timeFormat24h}
                      role="radio"
                      aria-checked={!timeFormat24h}
                      on:click={() => setTimeFormat(false)}
                    >12h</button>
                  </div>
                </div>
                <p class="setting-hint">Controls every clock time shown in the app (Time Travel, reminders, task history, last synced).</p>
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Accessibility</div>
                <div class="setting-row">
                  <div class="setting-label">High contrast</div>
                  <button class="toggle-btn" class:on={highContrast} on:click={toggleHighContrast} aria-label="Toggle high contrast" role="switch" aria-checked={highContrast}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint">Raises border and text contrast throughout, on top of Light or Dark.</p>

                <div class="setting-row">
                  <div class="setting-label">Reduce motion</div>
                  <button class="toggle-btn" class:on={reduceMotion} on:click={toggleReduceMotion} aria-label="Toggle reduce motion" role="switch" aria-checked={reduceMotion}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint">Turns off panel/dialog slide and fade animations throughout the app.</p>

                {#if isNativePlatform()}
                  <div class="setting-row">
                    <div class="setting-label">Haptic feedback</div>
                    <button class="toggle-btn" class:on={hapticsEnabled} on:click={toggleHaptics} aria-label="Toggle haptic feedback" role="switch" aria-checked={hapticsEnabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  <p class="setting-hint">A small vibration on checkbox toggles and drag-and-drop.</p>
                {/if}
              </div>

            {:else if activeCategory === 'notifications'}
              <div class="setting-group">
                <div class="setting-section-title">Permission</div>
                <div class="setting-row">
                  <span class="setting-label">
                    {#if $permissionState === 'granted'}Enabled — task reminders will notify you
                    {:else if $permissionState === 'denied'}Blocked — {isTauri ? 'allow notifications for Offlog in Windows Settings → Notifications' : 'allow notifications for this site in your browser settings'}
                    {:else if $permissionState === 'unsupported'}Not supported in this browser
                    {:else}Not enabled yet{/if}
                  </span>
                  {#if $permissionState !== 'granted' && $permissionState !== 'unsupported'}
                    <button class="export-btn" on:click={() => requestPermission()}>Enable</button>
                  {/if}
                </div>
                {#if isAndroid}
                  <div class="setting-row">
                    <span class="setting-label">
                      {#if $exactAlarmState === 'granted'}Precise timing enabled — reminders fire exactly on time
                      {:else if $exactAlarmState === 'denied'}Not enabled — reminders may arrive a few minutes late
                      {:else}Checking…{/if}
                    </span>
                    {#if $exactAlarmState === 'denied'}
                      <button class="export-btn" on:click={() => requestExactAlarmPermission()}>Enable</button>
                    {/if}
                  </div>
                  <p class="setting-hint">
                    This is a separate Android permission from notifications themselves ("Alarms & reminders", since Android 12) — it's a system settings toggle with no in-app prompt, so it's easy to miss. Without it, reminders still arrive, just batched into the OS's next low-power wakeup window instead of at the exact minute you set.
                  </p>
                {/if}
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Reminder timing</div>
                <label class="field-label">
                  Default "remind me on the due date" time
                  <TimePicker value={defaultReminderTime} on:change={saveDefaultReminderTime} />
                </label>
                <p class="setting-hint">Used whenever a task's "Remind me on the due date" checkbox is on, instead of picking the exact time yourself.</p>
              </div>

            {:else if activeCategory === 'sync'}
              <div class="setting-group">
                <div class="setting-section-title">Status</div>
                <div class="setting-row">
                  <span class="setting-label">{syncEnabled ? 'Sync enabled' : 'Sync paused'}</span>
                  <button class="toggle-btn" class:on={syncEnabled} on:click={toggleSyncEnabled} aria-label="Toggle sync" role="switch" aria-checked={syncEnabled}>
                    <span class="toggle-knob"></span>
                  </button>
                </div>
                <p class="setting-hint" class:setting-hint-warn={connectionStatus.tone === 'warn'}>{connectionStatus.text}</p>
                {#if isTauri && $otherHostsDetected.length}
                  <p class="setting-hint setting-hint-warn">
                    Another Offlog host ("{$otherHostsDetected[0].name}") was found on this
                    network. Running two hosts on the same network means they won't share
                    data — make sure every device pairs with only one.
                  </p>
                {/if}
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Connect a device</div>
                {#if isAndroid || isTauri}
                  <button class="link-row link-row-compact" on:click={() => showConnectModal = true}>
                    <span class="link-row-title">Connect a device</span>
                    <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                  </button>
                {:else}
                  <p class="setting-hint">Happens from the Android app (Settings → Sync → "Find my computer") or the PC app (Settings → Sync → "Generate a code") — not from a plain web browser.</p>
                {/if}
              </div>

              <div class="setting-group">
                <div class="setting-section-title">This device</div>
                <label class="field-label">
                  Name
                  <input bind:value={deviceName} placeholder="PC" on:blur={saveDeviceName} enterkeyhint="done"
                    on:keydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
                </label>
                <p class="setting-hint">Shown on this device's own edits from now on — changelog entries, task history, and the list below.</p>
              </div>

              {#if deviceLastSeen.length}
                <div class="setting-group">
                  <div class="setting-section-title">Devices seen recently</div>
                  {#each deviceLastSeen as d (d.device)}
                    <div class="setting-row">
                      <span class="storage-info">{d.device}</span>
                      <span class="storage-info" style="color: var(--faint)">{timeAgo(d.lastSeen)}</span>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if conflictCount > 0 || conflictList.length > 0}
                <div class="setting-group">
                  <div class="setting-section-title">Conflicts</div>
                  <button class="link-row link-row-compact" on:click={() => showConflictsModal = true}>
                    <span class="link-row-title">Resolve conflicts</span>
                    <span class="nav-badge">{conflictList.length || conflictCount}</span>
                  </button>
                </div>
              {/if}

            {:else if activeCategory === 'organize'}
              <div class="setting-group">
                <div class="setting-section-title">Manage</div>
                <button class="link-row link-row-compact" on:click={openSpaceManager}>
                  <span class="link-row-title">Spaces</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <button class="link-row link-row-compact" on:click={openTagManager}>
                  <span class="link-row-title">Tags</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <button class="link-row link-row-compact" on:click={openCustomFieldManager}>
                  <span class="link-row-title">Custom Fields</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <button class="link-row link-row-compact" on:click={openArchivedProjectsManager}>
                  <span class="link-row-title">Archived Projects</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
              </div>

            {:else if activeCategory === 'data'}
              <div class="setting-group">
                <div class="setting-section-title">Storage</div>
                <!-- B44: plain-language headline first, raw MB/quota numbers
                     demoted to a small secondary line — "quota" is browser
                     jargon nobody asked to learn, and at personal-task-list
                     scale there's essentially never anything to act on. -->
                <div class="storage-summary">
                  {#if !storageAvailable}
                    <span class="storage-headline">Storage info not available in this browser</span>
                  {:else if storagePercent >= STORAGE_WARN_THRESHOLD}
                    <span class="storage-headline storage-headline-warn">Storage is getting full ({(storagePercent * 100).toFixed(0)}%)</span>
                    <span class="storage-detail">{storageInfo}</span>
                  {:else}
                    <span class="storage-headline">Your data is tiny — nothing to worry about</span>
                    <span class="storage-detail">{storageInfo || 'Calculating…'}</span>
                  {/if}
                </div>
                {#if storageAvailable && storagePercent >= STORAGE_WARN_THRESHOLD}
                  <p class="setting-hint setting-hint-warn">
                    Try the maintenance tools in Advanced (prune old history, empty Recycle), or free up
                    space on this device — once storage is truly full, new changes would stop saving.
                  </p>
                {/if}
                {#if breakdown}
                  <p class="setting-hint">
                    {breakdown.activeTasks} active task{breakdown.activeTasks === 1 ? '' : 's'} ·
                    {breakdown.archivedTasks} archived ·
                    {breakdown.deletedTasks} in Recycle ·
                    {breakdown.logEntries} history entries
                  </p>
                {/if}
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Back up</div>
                <p class="setting-hint">Everything, or just one project — either can be restored later.</p>
                <div class="setting-row">
                  <div class="project-export-select">
                    <CustomSelect options={backupScopeOptions} bind:value={backupScope} />
                  </div>
                  <button class="export-btn" on:click={doBackup}>Back up</button>
                </div>
                <div class="setting-row">
                  <span class="storage-info" style="color: var(--muted)">Every task, one row, for a spreadsheet (one-way, can't be restored)</span>
                  <button class="export-btn" on:click={doExportCSV}>Export CSV</button>
                </div>
              </div>

              <div class="setting-group">
                <div class="setting-section-title">Restore</div>
                <div class="setting-row">
                  <span class="storage-info" style="color: var(--muted)">{importStatus || 'Restore from a backup file'}</span>
                  <button class="export-btn" on:click={handleImport}>Choose backup file</button>
                </div>
              </div>

            {:else if activeCategory === 'security'}
              <div class="setting-group">
                <div class="setting-section-title">PIN lock</div>
                <p class="setting-hint">Require a PIN to open Offlog. This is a screen lock, not encryption — it keeps a passer-by from casually opening the app, not a substitute for your device's own lock.</p>

                {#if !appLockEnabled}
                  {#if !showPinForm}
                    <button class="export-btn" on:click={openPinForm}>Set a PIN</button>
                  {:else}
                    <label class="field-label">
                      New PIN
                      <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" bind:value={newPin} placeholder="4–8 digits" />
                    </label>
                    <label class="field-label">
                      Confirm PIN
                      <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" bind:value={confirmPin} placeholder="4–8 digits" />
                    </label>
                    <label class="field-label">
                      Hint (optional)
                      <input type="text" maxlength="60" bind:value={pinHint} placeholder="A reminder only you'd understand" />
                    </label>
                    {#if pinError}<p class="setting-hint setting-hint-warn">{pinError}</p>{/if}
                    <div class="setting-row">
                      <button class="export-btn" on:click={() => showPinForm = false}>Cancel</button>
                      <button class="export-btn" on:click={savePin} disabled={pinSaving}>{pinSaving ? 'Saving…' : 'Save PIN'}</button>
                    </div>
                  {/if}
                {:else if !showPinForm}
                  <div class="setting-row">
                    <span class="setting-label">PIN is set</span>
                    <div class="setting-row">
                      <button class="export-btn" on:click={openPinForm}>Change PIN</button>
                      <button class="export-btn" on:click={removePin}>Remove PIN</button>
                    </div>
                  </div>
                {:else}
                  <label class="field-label">
                    New PIN
                    <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" bind:value={newPin} placeholder="4–8 digits" />
                  </label>
                  <label class="field-label">
                    Confirm PIN
                    <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" bind:value={confirmPin} placeholder="4–8 digits" />
                  </label>
                  <label class="field-label">
                    Hint (optional)
                    <input type="text" maxlength="60" bind:value={pinHint} placeholder="A reminder only you'd understand" />
                  </label>
                  {#if pinError}<p class="setting-hint setting-hint-warn">{pinError}</p>{/if}
                  <div class="setting-row">
                    <button class="export-btn" on:click={() => showPinForm = false}>Cancel</button>
                    <button class="export-btn" on:click={savePin} disabled={pinSaving}>{pinSaving ? 'Saving…' : 'Save PIN'}</button>
                  </div>
                {/if}
              </div>

              {#if appLockEnabled}
                <div class="setting-group">
                  <div class="setting-section-title">Lock after</div>
                  <label class="field-label">
                    Lock after this much idle/background time
                    <CustomSelect options={LOCK_TIMEOUT_OPTIONS} bind:value={lockTimeoutStr} on:change={(e) => onLockTimeoutChange(e.detail)} />
                  </label>
                  <p class="setting-hint">Also locks whenever Offlog is closed and reopened, regardless of this setting.</p>
                </div>
              {/if}

              {#if isNativePlatform() && appLockEnabled}
                <div class="setting-group">
                  <div class="setting-section-title">Biometric unlock</div>
                  <div class="setting-row">
                    <div class="setting-label">Unlock with fingerprint/face</div>
                    <button class="toggle-btn" class:on={biometricEnabled} on:click={toggleBiometric} disabled={biometricBusy} aria-label="Toggle biometric unlock" role="switch" aria-checked={biometricEnabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  <p class="setting-hint">A faster path on top of your PIN, not a replacement — the PIN still works, and is still the only way to change or recover the lock.</p>
                  {#if biometricError}<p class="setting-hint setting-hint-error">{biometricError}</p>{/if}
                  {#if biometricNoneEnrolled}
                    <button class="export-btn" on:click={openBiometricEnrollment}>Open enrollment settings</button>
                  {/if}
                </div>

                <div class="setting-group">
                  <div class="setting-section-title">Privacy screen</div>
                  <div class="setting-row">
                    <div class="setting-label">Hide preview when backgrounded</div>
                    <button class="toggle-btn" class:on={privacyScreenEnabled} on:click={togglePrivacyScreen} aria-label="Toggle privacy screen" role="switch" aria-checked={privacyScreenEnabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  <p class="setting-hint">Dims Offlog's preview in the recent-apps switcher — off by default because it also blocks taking screenshots of the app while this is on.</p>
                </div>
              {/if}

            {:else if activeCategory === 'advanced'}
              <div class="setting-group">
                <div class="setting-section-title">Maintenance</div>
                <button class="link-row link-row-compact" on:click={() => showMaintenanceModal = true}>
                  <span class="link-row-title">Run maintenance</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <p class="setting-hint">Checks your data for problems, repairs what it safely can, and clears old history.</p>
              </div>

              {#if isTauri}
                <div class="setting-group">
                  <div class="setting-section-title">Software updates</div>
                  <div class="setting-row">
                    <span class="setting-label">{updateStatus || 'Check for a newer version of Offlog'}</span>
                    <button class="export-btn" on:click={checkForUpdate} disabled={updateChecking}>
                      {updateChecking ? 'Checking…' : 'Check for updates'}
                    </button>
                  </div>
                </div>
              {/if}

              <div class="setting-group">
                <div class="setting-section-title">Self-hosted CouchDB connection</div>
                <p class="setting-hint">Most people never need to touch this — it's for connecting directly to a self-hosted CouchDB server instead of pairing through the Sync tab.</p>
                <label class="field-label">
                  CouchDB URL
                  <input bind:value={syncUrl} placeholder="http://192.168.1.100:5984/offlog" disabled={!syncEnabled} />
                </label>
                <label class="field-label">
                  Username
                  <input bind:value={credentialUser} placeholder="offlog" disabled={!syncEnabled} />
                </label>
                <label class="field-label">
                  Password
                  <input type="password" bind:value={credentialPass} disabled={!syncEnabled} />
                </label>
                {#if syncError && lastErrorAt}
                  <p class="setting-hint setting-hint-warn">Last error at {fmtLastSynced(lastErrorAt)}: {syncError}</p>
                {/if}
              </div>

              {#if isTauriDebug}
                <div class="setting-group">
                  <div class="setting-section-title">Debug build only</div>
                  <p class="setting-hint">Wipes every task/project on this PC and restarts — for testing what a real first-run install looks like, never shown in a release build.</p>
                  <button class="export-btn" on:click={resetPcTestData} disabled={resetBusy}>
                    {resetBusy ? 'Resetting…' : 'Reset test data'}
                  </button>
                </div>
              {/if}
            {/if}
            </div>
            {/key}
          </div>
        {/if}
      </div>
    </div>

    <div class="settings-actions">
      <button on:click={() => requestClose()}>Cancel</button>
      <button class="save-btn" on:click={saveSettings}>{activeCategory === 'sync' || activeCategory === 'advanced' ? 'Save & restart sync' : 'Save'}</button>
    </div>
  </div>
</div>

{#if showConnectModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="mini-modal-scrim" on:click|self={() => showConnectModal = false} transition:fade={scrimFade}>
    <div class="mini-modal" transition:dialogPop>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Connect a device</span>
        <button class="mini-modal-close" on:click={() => showConnectModal = false} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        {#if isAndroid}
          {#if pairSuccessName}
            <p class="setting-hint success-hint">✓ Connected to "{pairSuccessName}" — syncing now.</p>
            <div class="setting-row-end">
              <button class="btn-primary" on:click={() => showConnectModal = false}>Done</button>
            </div>
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
          {:else}
            <p class="setting-hint">Enter the code shown on the "{selectedHost.name}" screen.</p>
            <label class="field-label">
              Pairing code
              <input bind:value={pairingCode} placeholder="123456" inputmode="numeric" maxlength="6" disabled={pairingBusy} />
            </label>
            {#if pairingError}<p class="setting-hint setting-hint-warn">{pairingError}</p>{/if}
            <div class="setting-row-end">
              <button class="export-btn" on:click={() => { selectedHost = null; pairingCode = ''; pairingError = ''; }} disabled={pairingBusy}>Cancel</button>
              <button class="btn-primary" on:click={submitPairingCode} disabled={pairingBusy || pairingCode.trim().length !== 6}>
                {pairingBusy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          {/if}
        {:else if isTauri}
          {#if pcPairedDeviceName}
            <p class="setting-hint success-hint">✓ Connected to "{pcPairedDeviceName}" — syncing now.</p>
          {:else if pcPairingCode}
            <p class="setting-hint">Enter this code on your phone (Settings → Sync → Find my computer):</p>
            <p class="storage-info" style="font-size: 1.5rem; letter-spacing: 0.2em; text-align: center;">{pcPairingCode}</p>
            <p class="setting-hint">Valid for 5 minutes, one-time use — this updates automatically once your phone connects.</p>
          {/if}
          <button class="export-btn" on:click={generatePcPairingCode} disabled={pcPairingBusy}>
            {pcPairingBusy ? 'Generating…' : pcPairingCode ? 'Generate a new code' : 'Generate a code'}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if showConflictsModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="mini-modal-scrim" on:click|self={() => showConflictsModal = false} transition:fade={scrimFade}>
    <div class="mini-modal" transition:dialogPop>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Resolve conflicts</span>
        <button class="mini-modal-close" on:click={() => showConflictsModal = false} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        <div class="setting-row">
          <span class="storage-info" style="color: var(--muted)">
            {#if loadingConflicts}Loading…
            {:else if conflictList.length}{conflictList.length} document{conflictList.length === 1 ? '' : 's'} with unresolved edits
            {:else}{conflictCount} conflict{conflictCount === 1 ? '' : 's'} detected{/if}
          </span>
          <button class="export-btn" on:click={loadConflicts} disabled={loadingConflicts}>Refresh</button>
        </div>
        {#each conflictList as c (c.docId)}
          <div class="conflict-item">
            <div class="conflict-item-title">{c.label} <span class="conflict-item-type">({c.type})</span></div>
            <div class="conflict-item-row">
              <span class="conflict-item-meta">Current — {c.current.source ? `${c.current.source}, ` : ''}updated {fmtLastSynced(c.current.updated_at ?? c.current.created_at ?? '')}</span>
              <button class="export-btn" on:click={() => resolve(c, 'current')}>Keep this</button>
            </div>
            <div class="conflict-item-row">
              <span class="conflict-item-meta">Other — {c.other.doc.source ? `${c.other.doc.source}, ` : ''}updated {fmtLastSynced(c.other.doc.updated_at ?? c.other.doc.created_at ?? '')}</span>
              <button class="export-btn" on:click={() => resolve(c, 'other')}>Keep this</button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if showMaintenanceModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="mini-modal-scrim" on:click|self={() => showMaintenanceModal = false} transition:fade={scrimFade}>
    <div class="mini-modal" transition:dialogPop>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Maintenance</span>
        <button class="mini-modal-close" on:click={() => showMaintenanceModal = false} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        <p class="setting-hint">
          Runs a full check in order: looks for problems with your data, repairs what it safely can,
          clears old activity history (6+ months) and old Recycle items (3+ months), then frees up
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
        <button class="btn-primary" on:click={runMaintenance} disabled={maintRunning}>
          {maintRunning ? 'Running…' : maintSteps.some(s => s.status === 'done') ? 'Run Again' : 'Run Maintenance'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if importPreview}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="mini-modal-scrim" on:click|self={cancelImport} transition:fade={scrimFade}>
    <div class="mini-modal" transition:dialogPop>
      <div class="mini-modal-head">
        <span class="mini-modal-title">Restore from backup</span>
        <button class="mini-modal-close" on:click={cancelImport} aria-label="Close">✕</button>
      </div>
      <div class="mini-modal-body">
        <p class="setting-hint">
          Will create <strong>{importPreview.byType.space}</strong> space{importPreview.byType.space === 1 ? '' : 's'},
          <strong>{importPreview.byType.project}</strong> project{importPreview.byType.project === 1 ? '' : 's'},
          <strong>{importPreview.byType.task}</strong> task{importPreview.byType.task === 1 ? '' : 's'}
          {#if importPreview.toSkip > 0}— <strong>{importPreview.toSkip}</strong> unrecognized entr{importPreview.toSkip === 1 ? 'y' : 'ies'} will be skipped{/if}.
          Anything matching something you already have will be updated in place, not duplicated.
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
  <div class="mini-modal-scrim" transition:fade={scrimFade}>
    <div class="mini-modal recovery-modal" transition:dialogPop>
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
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    width: min(640px, 92vw);
    display: flex; flex-direction: column;
    box-shadow: 0 20px 50px rgba(0,0,0,.18);
    /* Height fits content (not fixed) — a short tab like Organize or the
       mobile category list shouldn't leave a wall of empty space just to
       match a longer tab's height. Capped so a tab that outgrows this
       (future settings) scrolls inside .detail-content instead of the
       whole modal growing past a sane size. The actual tab-to-tab resize
       is animated from script.ts's selectCategory() (owner feedback,
       2026-07-17: switching tabs "jumping" from one size to another read
       as broken) — a plain CSS `transition: height` can't animate an
       otherwise-auto-sized element, so it's done as a measured FLIP
       (capture old height, let Svelte re-render, measure new height,
       animate between the two pixel values, then release back to auto).
       This keeps the "fits content" behavior; it just makes the jump
       smooth instead of instant. */
    max-height: min(85vh, 640px);
    overflow: hidden;
  }

  .settings-body { display: flex; flex: 1; min-height: 0; }

  .settings-nav {
    width: 190px; flex-shrink: 0; display: flex; flex-direction: column; gap: .1rem;
    border-right: 1px solid var(--border); padding: 1.1rem .6rem; overflow-y: auto;
  }
  .nav-title { margin: 0 0 .5rem; padding: 0 .5rem; font-size: 1rem; letter-spacing: -.01em; }
  .nav-item {
    display: flex; align-items: center; gap: .55rem;
    background: none; border: none; cursor: pointer; text-align: left;
    padding: .55rem .55rem; border-radius: var(--radius-sm);
    color: var(--muted); font-size: .84rem; font-weight: 500;
    transition: background .12s, color .12s;
  }
  .nav-item svg { flex-shrink: 0; opacity: .8; }
  .nav-item span { flex: 1; }
  .nav-item:hover { background: var(--hover); }
  .nav-item.active { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .nav-item.active svg { opacity: 1; }
  .nav-badge {
    font-family: var(--mono); font-size: .62rem; font-weight: 700;
    background: var(--due-soon-bg); color: var(--due-soon-ink);
    padding: 1px 6px; border-radius: 8px; flex-shrink: 0;
  }
  .chevron { display: none; flex-shrink: 0; opacity: .5; }

  .settings-detail { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .detail-head { display: none; align-items: center; gap: .5rem; padding: 1rem 1.25rem .5rem; flex-shrink: 0; }
  .detail-title { font-weight: 700; font-size: .95rem; }
  .back-btn {
    display: none; align-items: center; gap: .2rem;
    background: none; border: none; cursor: pointer; color: var(--accent);
    font-size: .85rem; font-weight: 600; padding: .2rem;
  }
  .detail-content {
    flex: 1; overflow-y: auto; padding: 1.25rem 1.4rem;
    display: flex; flex-direction: column;
  }
  /* Wraps each tab's content so switching tabs fades it in (owner
     feedback, 2026-07-17: the outer panel resize was smooth but the
     content itself popped instantly, reading as disjointed) — same
     flex/gap the content used to have directly on .detail-content,
     since this wrapper is now the thing actually holding it. */
  .detail-fade {
    display: flex; flex-direction: column; gap: 1rem;
  }

  /* Narrow: category list OR full-width detail, never both — see script
     comment (A14) for why this avoids a two-column squeeze on phones. */
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

  /* Every group of related rows is a card — gives each tab real visual
     structure instead of loose rows floating directly on the panel
     background (owner feedback 2026-07-16: "too plain/bland"). A flat
     var(--bg) fill looked right in light mode but reads as a heavy dark
     block in dark mode, since --bg (#181a20) is *darker* than the panel's
     own --surface (#242934) there — a subtle tint off --text stays a
     gentle, barely-there card in both themes instead of a hole. */
  .setting-group {
    display: flex; flex-direction: column; gap: .6rem;
    background: color-mix(in srgb, var(--text) 4%, transparent);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .85rem .9rem;
  }
  .setting-section-title {
    display: flex; align-items: center; gap: .4rem;
    font-family: var(--mono); font-size: .62rem; text-transform: uppercase;
    letter-spacing: .08em; color: var(--muted); font-weight: 600;
  }
  .setting-section-title::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent); flex-shrink: 0;
  }
  .setting-row { display: flex; align-items: center; gap: .75rem; }
  .setting-hint { margin: 0; font-size: .74rem; color: var(--faint); line-height: 1.5; }
  .setting-hint-error { color: var(--danger); }
  .setting-hint-warn {
    color: var(--due-soon-ink); background: var(--due-soon-bg);
    padding: .5rem .65rem; border-radius: var(--radius-sm); font-weight: 500;
  }
  .success-hint {
    color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent);
    padding: .5rem .65rem; border-radius: var(--radius-sm); font-weight: 600;
  }
  .setting-label { font-size: .88rem; color: var(--text); flex: 1; }
  .storage-info { font-family: var(--mono); font-size: .72rem; color: var(--muted); flex: 1; }

  /* B44 — headline reads as a plain sentence; the raw MB/quota numbers are
     demoted to a small mono detail line underneath, not the first thing
     a non-technical person sees. */
  .storage-summary { display: flex; flex-direction: column; gap: 2px; }
  .storage-headline { font-size: .9rem; color: var(--text); font-weight: 500; }
  .storage-headline-warn { color: var(--danger); }
  .storage-detail { font-family: var(--mono); font-size: .7rem; color: var(--faint); }

  .project-export-select { flex: 1; min-width: 0; }

  /* Shared primary-action style for the main CTA inside a modal (Connect,
     Import, Run Maintenance) — consistent accent treatment instead of
     each modal inventing its own "important button" look. */
  .btn-primary {
    padding: .35rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--accent); cursor: pointer;
    background: var(--accent); color: var(--on-accent); font-size: .8rem; font-weight: 600;
    white-space: nowrap;
  }
  .btn-primary:hover { opacity: .9; }
  .btn-primary:disabled { opacity: .5; cursor: default; }

  .setting-row-end { display: flex; align-items: center; justify-content: flex-end; gap: .5rem; }

  .field-label {
    display: flex; flex-direction: column; gap: .35rem;
    font-family: var(--mono); font-size: .68rem; letter-spacing: .06em;
    text-transform: uppercase; color: var(--faint);
  }
  .field-label input {
    padding: .5rem .6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .9rem;
  }
  .field-label input:focus { outline: none; border-color: var(--accent); }
  .field-label input:disabled { opacity: .5; cursor: default; }

  .theme-segment {
    display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    overflow: hidden; flex-shrink: 0;
  }
  .theme-seg-btn {
    padding: .35rem .75rem; border: none; background: var(--surface); color: var(--muted);
    font-size: .8rem; font-weight: 500; cursor: pointer; transition: background .15s, color .15s;
  }
  .theme-seg-btn + .theme-seg-btn { border-left: 1px solid var(--border-strong); }
  .theme-seg-btn:hover { background: var(--hover); }
  .theme-seg-btn.active { background: var(--accent); color: var(--on-accent); }

  .toggle-btn {
    width: 42px; height: 24px; border-radius: 12px; border: none; cursor: pointer;
    background: var(--border-strong); position: relative; transition: background .2s;
    flex-shrink: 0; padding: 0;
  }
  .toggle-btn.on { background: var(--accent); }
  .toggle-knob {
    position: absolute; top: 3px; left: 3px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--toggle-knob); transition: left .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2);
  }
  .toggle-btn.on .toggle-knob { left: 21px; }

  .export-btn {
    padding: .35rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .8rem; font-weight: 500;
    white-space: nowrap;
  }
  .export-btn:hover { background: var(--hover); }
  .export-btn:disabled { opacity: .5; cursor: default; }

  .link-row {
    display: flex; align-items: center; gap: .75rem;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .75rem .9rem; cursor: pointer; text-align: left; width: 100%;
    transition: background .12s, border-color .12s;
  }
  .link-row:hover { background: var(--hover); border-color: var(--border-strong); }
  .link-row-title { flex: 1; font-size: .88rem; font-weight: 600; color: var(--text); }
  .link-row-compact { padding: .5rem .9rem; }
  .link-row-compact .link-row-title { font-weight: 500; }
  .link-row svg { flex-shrink: 0; opacity: .5; }
  .link-row .nav-badge { flex-shrink: 0; }

  .conflict-item {
    display: flex; flex-direction: column; gap: .3rem;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .5rem .65rem;
  }
  .conflict-item-title { font-size: .8rem; font-weight: 600; color: var(--text); }
  .conflict-item-type { font-weight: 400; color: var(--faint); }
  .conflict-item-row { display: flex; align-items: center; gap: .75rem; }
  .conflict-item-meta { font-size: .72rem; color: var(--muted); flex: 1; }

  /* B15 — Maintenance step list, folded in from the deleted standalone
     modal overlay it used to live in; styles carried over as-is. */
  .progress-track { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width .3s var(--ease); }

  .maint-steps { display: flex; flex-direction: column; gap: .5rem; }
  .maint-step { display: flex; align-items: center; gap: .6rem; padding: .4rem .1rem; border-radius: var(--radius-sm); }
  .maint-step.running { background: color-mix(in srgb, var(--accent) 8%, transparent); }

  .maint-step-icon {
    width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: .7rem; font-weight: 700; color: var(--faint);
    border: 1.5px solid var(--border-strong);
  }
  .maint-step-icon.done    { color: var(--success); border-color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .maint-step-icon.skipped { color: var(--faint); }
  .maint-step-icon.error   { color: var(--danger); border-color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
  .maint-step-icon.running { border-color: var(--accent); }

  .spinner {
    width: 9px; height: 9px; border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-top-color: var(--accent);
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .maint-step-label { font-size: .84rem; color: var(--text); flex: 1; }
  .maint-step-note { font-size: .72rem; color: var(--faint); text-align: right; white-space: nowrap; }

  .integrity-list {
    display: flex; flex-direction: column; gap: 3px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .5rem .65rem; max-height: 140px; overflow-y: auto;
  }
  .integrity-row { font-size: .74rem; color: var(--muted); line-height: 1.4; }

  .settings-actions {
    display: flex; justify-content: flex-end; gap: .5rem;
    padding: .9rem 1.25rem; border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .settings-actions button {
    padding: .45rem .95rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .85rem; font-weight: 500;
  }
  .save-btn { background: var(--text) !important; color: var(--bg) !important; border-color: var(--text) !important; }

  /* Multi-step flows (device pairing, conflicts, maintenance run, import
     preview) open here instead of living permanently in a tab — .mini-modal
     is `position: fixed` itself (not flex-centered by its scrim parent) so
     dialogPop's `translate(-50%,-50%)` positions it correctly, same
     convention as ConfirmDialog/NamePrompt's sibling scrim+panel pattern. */
  .mini-modal-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300; }
  .mini-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 301; width: min(420px, 90vw); max-height: min(80vh, 560px);
    display: flex; flex-direction: column;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0,0,0,.3);
  }
  .mini-modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .mini-modal-title { font-weight: 700; font-size: .95rem; }
  .mini-modal-close {
    background: none; border: none; cursor: pointer; color: var(--faint);
    font-size: .85rem; padding: .2rem .4rem; border-radius: var(--radius-sm);
  }
  .mini-modal-close:hover { background: var(--hover); color: var(--text); }
  .mini-modal-body {
    flex: 1; overflow-y: auto; padding: 1.1rem;
    display: flex; flex-direction: column; gap: .75rem;
  }
  .mini-modal-actions {
    display: flex; justify-content: flex-end; gap: .5rem;
    padding: .85rem 1.1rem; border-top: 1px solid var(--border); flex-shrink: 0;
  }

  .recovery-modal { max-width: 420px; }
  .recovery-code {
    font-family: var(--mono); font-size: 1.3rem; font-weight: 700; letter-spacing: .08em;
    text-align: center; color: var(--accent); background: var(--col-bg);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    padding: .8rem; margin: .6rem 0;
  }
  .recovery-copy-btn { display: block; margin: 0 auto .8rem; }
  .recovery-ack-row {
    display: flex !important; flex-direction: row !important; align-items: center; gap: .5rem;
    font-size: .82rem; color: var(--text); text-transform: none; letter-spacing: normal;
    font-family: 'Hanken Grotesk', sans-serif; cursor: pointer;
  }
  .recovery-ack-row input[type=checkbox] { accent-color: var(--accent); cursor: pointer; width: 15px; height: 15px; margin: 0; }
</style>
