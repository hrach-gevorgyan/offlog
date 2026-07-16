<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
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
  import { getSyncUrl, setSyncUrl, getSyncCredentials, setSyncCredentials, getDeviceName, setDeviceName, isSyncEnabled, setSyncEnabled, getDefaultReminderTime, setDefaultReminderTime, getWeekStartsMonday, setWeekStartsMonday, isTauri as isTauriCheck, invokeTauri } from '../config';
  import { timeAgo, fmtLastSynced } from './utils';
  import { discoveredHosts, isScanning, scanForHosts, stopScan, pairWithHost, type DiscoveredHost } from './discovery';
  import { requestPermission, permissionState, exactAlarmState, checkExactAlarmPermission, requestExactAlarmPermission } from './notifications';
  import { showError } from './store';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import { getThemeMode, setThemeMode, getHighContrast, setHighContrast, type ThemeMode } from './theme';

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  type Category = 'appearance' | 'notifications' | 'sync' | 'organize' | 'data' | 'maintenance';
  const CATEGORIES: { key: Category; label: string; icon: string }[] = [
    { key: 'appearance',    label: 'Appearance',    icon: '<circle cx="9" cy="9" r="4"/><path d="M9 1v2M9 15v2M17 9h-2M3 9H1M14.7 3.3l-1.4 1.4M4.7 13.3l-1.4 1.4M14.7 14.7l-1.4-1.4M4.7 4.7 3.3 3.3"/>' },
    { key: 'notifications', label: 'Notifications', icon: '<path d="M9 2a4 4 0 0 0-4 4v3l-1.5 3h11L13 9V6a4 4 0 0 0-4-4z"/><path d="M7 15a2 2 0 0 0 4 0"/>' },
    { key: 'sync',          label: 'Sync',           icon: '<path d="M3 9a6 6 0 0 1 10.2-4.2M15 9a6 6 0 0 1-10.2 4.2"/><polyline points="13,1.5 13.2,4.8 9.9,5"/><polyline points="5,16.5 4.8,13.2 8.1,13"/>' },
    { key: 'organize',      label: 'Organize',       icon: '<rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/>' },
    { key: 'data',          label: 'Data',           icon: '<path d="M2 4c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2z"/><path d="M2 4v10c0 1.1 3.1 2 7 2s7-.9 7-2V4"/><path d="M2 9c0 1.1 3.1 2 7 2s7-.9 7-2"/>' },
    { key: 'maintenance',   label: 'Maintenance',    icon: '<path d="M11.5 2.5a3 3 0 0 1 4 4l-8 8-4.5 1 1-4.5 7.5-7.5z"/>' },
  ];

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

  onMount(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isNarrow = mq.matches;
    activeCategory = isNarrow ? null : 'appearance';
    const onChange = (e: MediaQueryListEvent) => { isNarrow = e.matches; };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  function selectCategory(key: Category) {
    activeCategory = key;
    if (isNarrow && !popDetailLayer) {
      popDetailLayer = closeOnBack(() => { activeCategory = null; popDetailLayer = null; });
    }
  }
  function backToList() {
    if (popDetailLayer) popDetailLayer();
    else activeCategory = null;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
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

  // ── Sync ────────────────────────────────────────────────────────────────
  let syncUrl = getSyncUrl();
  let { user: credentialUser, pass: credentialPass } = getSyncCredentials();
  let deviceName = getDeviceName();
  let syncEnabled = isSyncEnabled();
  // B43: the CouchDB URL field and anything else with a footgun moved into
  // a collapsed-by-default "Developer options" section — the main pane
  // should read as "connect to your home computer," not "configure a
  // database connection." Auto-opens if a URL is already set (someone
  // editing an existing connection shouldn't have to hunt for it), stays
  // closed on a fresh/never-configured install.
  let showDevOptions = !!syncUrl;

  // Plain-language connection status for the main pane — everything below
  // already exists as syncState.status/lastSynced/error, just not
  // surfaced as one human sentence before this.
  //
  // C2 finding (2026-07-19): this used to point everyone at "Developer
  // options" to connect -- a scary label for a first-time non-technical
  // user, and no longer even the easy path once Track E's pairing flow
  // (isAndroid's "Find my computer" section, above this in the template)
  // shipped. Android gets pointed at that instead; anyone else (plain
  // desktop web, no PC-app pairing available there) keeps the old
  // wording, since Developer options really is the only path for them.
  $: connectionStatus =
    !syncEnabled ? { text: 'Sync is paused.', tone: 'muted' } :
    !syncUrl ? (isAndroid
      ? { text: 'Not connected to another device yet — tap "Find my computer" below to connect.', tone: 'muted' }
      : { text: 'Not connected to another device yet — open Developer options below to connect one.', tone: 'muted' }) :
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

  function startDeviceScan() {
    selectedHost = null;
    pairingError = '';
    scanForHosts();
  }

  async function submitPairingCode() {
    if (!selectedHost) return;
    pairingBusy = true;
    pairingError = '';
    try {
      await pairWithHost(selectedHost, pairingCode);
      syncUrl = getSyncUrl();
      // Real bug found live: without this, the Developer options form
      // still held whatever stale username/password it was mounted
      // with -- invisible for the URL (which did refresh) but silent
      // for the masked password field, so tapping "Save & restart
      // sync" afterward would overwrite the just-paired credentials
      // right back to the old ones.
      ({ user: credentialUser, pass: credentialPass } = getSyncCredentials());
      showDevOptions = true;
      selectedHost = null;
      pairingCode = '';
    } catch (e) {
      pairingError = e instanceof Error ? e.message : 'Failed to pair.';
    } finally {
      pairingBusy = false;
    }
  }

  let pcPairingCode = '';
  let pcPairingBusy = false;
  async function generatePcPairingCode() {
    pcPairingBusy = true;
    try {
      pcPairingCode = await invokeTauri<string>('generate_pairing_code');
    } catch {
      showError('Failed to generate a pairing code.');
    } finally {
      pcPairingBusy = false;
    }
  }

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
      // local PouchDB (the WebView's IndexedDB) -- discovered live that
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
  let SpaceManagerComp: typeof import('./SpaceManager.svelte').default | null = null;
  let showSpaceManager = false;
  async function openSpaceManager() {
    if (!SpaceManagerComp) SpaceManagerComp = (await import('./SpaceManager.svelte')).default;
    showSpaceManager = true;
  }

  let TagManagerComp: typeof import('./TagManager.svelte').default | null = null;
  let showTagManager = false;
  async function openTagManager() {
    if (!TagManagerComp) TagManagerComp = (await import('./TagManager.svelte')).default;
    showTagManager = true;
  }

  let CustomFieldManagerComp: typeof import('./CustomFieldManager.svelte').default | null = null;
  let showCustomFieldManager = false;
  async function openCustomFieldManager() {
    if (!CustomFieldManagerComp) CustomFieldManagerComp = (await import('./CustomFieldManager.svelte')).default;
    showCustomFieldManager = true;
  }

  // B32 — same lazy-modal pattern as Spaces/Tags/Custom Fields above
  let ArchivedProjectsManagerComp: typeof import('./ArchivedProjectsManager.svelte').default | null = null;
  let showArchivedProjectsManager = false;
  async function openArchivedProjectsManager() {
    if (!ArchivedProjectsManagerComp) ArchivedProjectsManagerComp = (await import('./ArchivedProjectsManager.svelte')).default;
    showArchivedProjectsManager = true;
  }

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
    // Same gap A34 found on Android's WebView -- Tauri's embedded WebView2
    // has no download manager for the blob-URL + <a download> trick either
    // (owner-reported, 2026-07-16). A native "Save As" dialog + a real
    // file write is the desktop equivalent of Android's Filesystem+Share
    // fix -- lets the user pick where it actually goes, same as any other
    // desktop app's export/save flow.
    if (isTauri) {
      // Owner-reported, 2026-07-16: defaultPath as a bare filename (no
      // directory) didn't reliably pre-fill the dialog's filename field --
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

  // ── Maintenance (B15 — folded into this detail pane, no longer its own
  // modal-on-top-of-a-modal; step list/progress bar/Run button render
  // directly under the Maintenance category like every other category) ──
  type MaintStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
  interface MaintStep { key: string; label: string; status: MaintStatus; note: string }
  let maintRunning = false;
  let maintSteps: MaintStep[] = [];
  let maintRemainingIssues: IntegrityIssue[] = [];

  // Scaffolding ahead of C1 (open-sourcing the repo) -- the updater plugin
  // has no endpoint/pubkey configured yet (tauri.conf.json deliberately
  // has no plugins.updater block, see its own comment and lib.rs's), so
  // check() below always fails with a real "not configured"-shaped error
  // until real hosting exists. Wired up now anyway (owner request,
  // 2026-07-16) so the UI/flow is ready the moment that config lands.
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

  function saveSettings() {
    setSyncUrl(syncUrl);
    setSyncCredentials(credentialUser, credentialPass);
    requestClose();
    location.reload();
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="settings-overlay" on:click|self={() => requestClose()}>
  <div class="settings-panel" use:trapFocus>
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
            {#if activeCategory === 'appearance'}
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
                <div class="setting-label">High contrast</div>
                <button class="toggle-btn" class:on={highContrast} on:click={toggleHighContrast} aria-label="Toggle high contrast" role="switch" aria-checked={highContrast}>
                  <span class="toggle-knob"></span>
                </button>
              </div>
              <p class="setting-hint">Raises border and text contrast throughout, on top of Light or Dark.</p>

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

            {:else if activeCategory === 'notifications'}
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

              <label class="field-label">
                Default "remind me on the due date" time
                <TimePicker value={defaultReminderTime} on:change={saveDefaultReminderTime} />
              </label>
              <p class="setting-hint">Used whenever a task's "Remind me on the due date" checkbox is on, instead of picking the exact time yourself.</p>

            {:else if activeCategory === 'sync'}
              <div class="setting-row">
                <span class="setting-label">{syncEnabled ? 'Sync enabled' : 'Sync paused'}</span>
                <button class="toggle-btn" class:on={syncEnabled} on:click={toggleSyncEnabled} aria-label="Toggle sync" role="switch" aria-checked={syncEnabled}>
                  <span class="toggle-knob"></span>
                </button>
              </div>
              <p class="setting-hint" class:setting-hint-warn={connectionStatus.tone === 'warn'}>{connectionStatus.text}</p>

              {#if isAndroid}
                <div class="setting-group">
                  <div class="setting-section-title">Connect to your computer</div>
                  {#if !selectedHost}
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
                    <div class="setting-row">
                      <button class="export-btn" on:click={() => { selectedHost = null; pairingCode = ''; pairingError = ''; }} disabled={pairingBusy}>Cancel</button>
                      <button class="export-btn" on:click={submitPairingCode} disabled={pairingBusy || pairingCode.trim().length !== 6}>
                        {pairingBusy ? 'Connecting…' : 'Connect'}
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if isTauri}
                <div class="setting-group">
                  <div class="setting-section-title">Pair a device</div>
                  {#if pcPairingCode}
                    <p class="setting-hint">Enter this code on your phone (Settings → Sync → Find my computer):</p>
                    <p class="storage-info" style="font-size: 1.5rem; letter-spacing: 0.2em; text-align: center;">{pcPairingCode}</p>
                    <p class="setting-hint">Valid for 5 minutes, one-time use.</p>
                  {/if}
                  <button class="export-btn" on:click={generatePcPairingCode} disabled={pcPairingBusy}>
                    {pcPairingBusy ? 'Generating…' : pcPairingCode ? 'Generate a new code' : 'Generate a code'}
                  </button>
                </div>
              {/if}

              {#if isTauriDebug}
                <div class="setting-group">
                  <div class="setting-section-title">Developer (debug build only)</div>
                  <p class="setting-hint">Wipes every task/project on this PC and restarts — for testing what a real first-run install looks like, never shown in a release build.</p>
                  <button class="export-btn" on:click={resetPcTestData} disabled={resetBusy}>
                    {resetBusy ? 'Resetting…' : 'Reset test data'}
                  </button>
                </div>
              {/if}

              <label class="field-label">
                This device's name
                <input bind:value={deviceName} placeholder="PC" on:blur={saveDeviceName} enterkeyhint="done"
                  on:keydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
              </label>
              <p class="setting-hint">Shown on this device's own edits from now on — changelog entries, task history, and the list below.</p>

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
                        <span class="conflict-item-meta">Current — updated {fmtLastSynced(c.current.updated_at ?? c.current.created_at ?? '')}</span>
                        <button class="export-btn" on:click={() => resolve(c, 'current')}>Keep this</button>
                      </div>
                      <div class="conflict-item-row">
                        <span class="conflict-item-meta">Other — updated {fmtLastSynced(c.other.doc.updated_at ?? c.other.doc.created_at ?? '')}</span>
                        <button class="export-btn" on:click={() => resolve(c, 'other')}>Keep this</button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              <div class="section-divider"></div>

              <div class="collapsible-section">
                <button type="button" class="section-toggle" on:click={() => showDevOptions = !showDevOptions}>
                  <svg class="section-chevron" class:open={showDevOptions} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
                  <span class="field-label">Developer options</span>
                </button>
                {#if showDevOptions}
                  <p class="setting-hint">
                    For connecting directly to a self-hosted CouchDB server — most people never need
                    to touch this.
                  </p>
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
                    <p class="setting-hint">Last error at {fmtLastSynced(lastErrorAt)}: {syncError}</p>
                  {/if}
                {/if}
              </div>

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
                  Try Maintenance's cleanup tools below (prune old history, empty Recycle), or free up
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

              <div class="section-divider"></div>

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

              <div class="section-divider"></div>

              <div class="setting-group">
                <div class="setting-section-title">Restore</div>
                {#if importPreview}
                  <div class="import-preview">
                    <p class="setting-hint">
                      Will create <strong>{importPreview.byType.space}</strong> space{importPreview.byType.space === 1 ? '' : 's'},
                      <strong>{importPreview.byType.project}</strong> project{importPreview.byType.project === 1 ? '' : 's'},
                      <strong>{importPreview.byType.task}</strong> task{importPreview.byType.task === 1 ? '' : 's'}
                      {#if importPreview.toSkip > 0}— <strong>{importPreview.toSkip}</strong> unrecognized entr{importPreview.toSkip === 1 ? 'y' : 'ies'} will be skipped{/if}.
                      Anything matching something you already have will be updated in place, not duplicated.
                    </p>
                    <div class="setting-row">
                      <button class="export-btn" on:click={cancelImport}>Cancel</button>
                      <button class="export-btn import-confirm-btn" on:click={confirmImport}>Import {importPreview.toCreate} item{importPreview.toCreate === 1 ? '' : 's'}</button>
                    </div>
                  </div>
                {:else}
                <div class="setting-row">
                  <span class="storage-info" style="color: var(--muted)">{importStatus || 'Restore from a backup file'}</span>
                  <button class="export-btn" on:click={handleImport}>Choose backup file</button>
                </div>
                {/if}
              </div>

            {:else if activeCategory === 'maintenance'}
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

              <div class="setting-row">
                <span></span>
                <button class="export-btn" on:click={runMaintenance} disabled={maintRunning}>
                  {maintRunning ? 'Running…' : maintSteps.some(s => s.status === 'done') ? 'Run Again' : 'Run Maintenance'}
                </button>
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
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="settings-actions">
      <button on:click={() => requestClose()}>Cancel</button>
      <button class="save-btn" on:click={saveSettings}>{activeCategory === 'sync' ? 'Save & restart sync' : 'Save'}</button>
    </div>
  </div>
</div>

{#if showSpaceManager && SpaceManagerComp}
  <svelte:component this={SpaceManagerComp} on:close={() => showSpaceManager = false} />
{/if}

{#if showTagManager && TagManagerComp}
  <svelte:component this={TagManagerComp} on:close={() => showTagManager = false} />
{/if}
{#if showCustomFieldManager && CustomFieldManagerComp}
  <svelte:component this={CustomFieldManagerComp} on:close={() => showCustomFieldManager = false} />
{/if}
{#if showArchivedProjectsManager && ArchivedProjectsManagerComp}
  <svelte:component this={ArchivedProjectsManagerComp} on:close={() => showArchivedProjectsManager = false} />
{/if}

<style>
  .settings-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.35);
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

  .setting-group { display: flex; flex-direction: column; gap: .5rem; }
  .setting-section-title {
    font-family: var(--mono); font-size: .62rem; text-transform: uppercase;
    letter-spacing: .08em; color: var(--faint); padding-bottom: .2rem;
    border-bottom: 1px solid var(--border);
  }
  .setting-row { display: flex; align-items: center; gap: .75rem; }
  .setting-hint { margin: 0; font-size: .74rem; color: var(--faint); line-height: 1.5; }
  .setting-hint-warn {
    color: var(--due-soon-ink); background: var(--due-soon-bg);
    padding: .5rem .65rem; border-radius: var(--radius-sm); font-weight: 500;
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

  .import-preview {
    display: flex; flex-direction: column; gap: .5rem;
    background: var(--col-bg); border-radius: var(--radius-sm); padding: .6rem .7rem;
  }
  .import-confirm-btn { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .import-confirm-btn:hover { opacity: .9; }

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

  /* B43 — Developer options, same collapsible pattern as CardDetail's
     Checklist/Notes sections (duplicated here since Svelte scopes styles
     per component, not shared via the class name alone). */
  .section-divider { height: 1px; background: var(--border); margin: .3rem 0; }
  .collapsible-section { display: flex; flex-direction: column; gap: .5rem; }
  .section-toggle {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
    cursor: pointer; padding: .5rem .65rem; width: 100%; text-align: left;
    transition: background .12s, border-color .12s;
  }
  .section-toggle:hover { background: var(--hover); border-color: var(--border-strong); }
  .section-toggle .field-label { flex: 1; }
  .section-chevron { color: var(--faint); flex-shrink: 0; transition: transform .12s ease, color .12s; }
  .section-chevron.open { transform: rotate(90deg); }
  .section-toggle:hover .section-chevron { color: var(--text); }

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
    background: #ffffff; transition: left .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2);
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
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .75rem .9rem; cursor: pointer; text-align: left; width: 100%;
    transition: background .12s, border-color .12s;
  }
  .link-row:hover { background: var(--hover); border-color: var(--border-strong); }
  .link-row-title { font-size: .88rem; font-weight: 600; color: var(--text); }
  .link-row-compact { padding: .5rem .9rem; }
  .link-row-compact .link-row-title { flex: 1; font-weight: 500; }
  .link-row svg { flex-shrink: 0; opacity: .5; }

  .conflict-item {
    display: flex; flex-direction: column; gap: .3rem;
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
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
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
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
</style>
