<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import db, {
    syncState, syncNow, importJSON, analyzeImport, exportProjectDocs, exportTasksCSV,
    getConflicts, resolveConflict, type ConflictInfo,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    startSync, cancelSync, getDeviceLastSeen,
    checkIntegrity, repairDatabase, pruneOldLogs, pruneOldDeletedTasks, type IntegrityIssue,
  } from './db';
  import { projects as projectsStore } from './store';
  import { getSyncUrl, setSyncUrl, getDeviceName, setDeviceName, isSyncEnabled, setSyncEnabled, getDefaultReminderTime, setDefaultReminderTime } from '../config';
  import { timeAgo } from './utils';
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
  function saveDefaultReminderTime() { setDefaultReminderTime(defaultReminderTime); }

  // ── Sync ────────────────────────────────────────────────────────────────
  let syncUrl = getSyncUrl();
  let deviceName = getDeviceName();
  let syncEnabled = isSyncEnabled();

  function toggleSyncEnabled() {
    syncEnabled = !syncEnabled;
    setSyncEnabled(syncEnabled);
    if (syncEnabled) startSync(); else cancelSync();
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

  function fmtLastSynced(ts: string): string {
    const d = new Date(ts);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? d.toLocaleTimeString() : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString();
  }

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

  function downloadBlob(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  async function exportJSON() {
    try {
      const all = await db.allDocs({ include_docs: true });
      const docs = all.rows.map((r: any) => r.doc).filter((d: any) => !d._id.startsWith('_'));
      downloadBlob(JSON.stringify(docs, null, 2), 'application/json', `offlog-backup-${new Date().toISOString().slice(0,10)}.json`);
    } catch {
      showError('Failed to export backup. Please try again.');
    }
  }

  // B4 — export a single project's docs, and a spreadsheet-friendly CSV
  // of every task. Both one-way (CSV isn't re-importable); JSON export
  // above stays the round-trippable backup format.
  let exportProjectId = '';
  async function doExportProject() {
    if (!exportProjectId) return;
    try {
      const docs = await exportProjectDocs(exportProjectId);
      const name = $projectsStore.find(p => p._id === exportProjectId)?.name ?? 'project';
      downloadBlob(JSON.stringify(docs, null, 2), 'application/json', `offlog-${name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.json`);
    } catch {
      showError('Failed to export project. Please try again.');
    }
  }

  async function doExportCSV() {
    try {
      const csv = await exportTasksCSV();
      downloadBlob(csv, 'text/csv', `offlog-tasks-${new Date().toISOString().slice(0,10)}.csv`);
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

  function freshMaintSteps(): MaintStep[] {
    return [
      { key: 'check',   label: 'Checking database for problems', status: 'pending', note: '' },
      { key: 'repair',  label: 'Repairing anything fixable',      status: 'pending', note: '' },
      { key: 'history', label: 'Clearing old activity history',   status: 'pending', note: '' },
      { key: 'trash',   label: 'Clearing old items from Recycle', status: 'pending', note: '' },
      { key: 'compact', label: 'Compacting the database',         status: 'pending', note: '' },
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

  function saveSettings() { setSyncUrl(syncUrl); requestClose(); location.reload(); }
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

            {:else if activeCategory === 'notifications'}
              <div class="setting-row">
                <span class="setting-label">
                  {#if $permissionState === 'granted'}Enabled — task reminders will notify you
                  {:else if $permissionState === 'denied'}Blocked — allow notifications for this site in your browser settings
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
                <input type="time" bind:value={defaultReminderTime} on:blur={saveDefaultReminderTime} />
              </label>
              <p class="setting-hint">Used whenever a task's "Remind me on the due date" checkbox is on, instead of picking the exact time yourself.</p>

            {:else if activeCategory === 'sync'}
              <div class="setting-row">
                <span class="setting-label">{syncEnabled ? 'Sync enabled' : 'Sync paused'}</span>
                <button class="toggle-btn" class:on={syncEnabled} on:click={toggleSyncEnabled} aria-label="Toggle sync" role="switch" aria-checked={syncEnabled}>
                  <span class="toggle-knob"></span>
                </button>
              </div>
              <p class="setting-hint">Pausing stops replication without losing the URL below — turn it back on any time.</p>

              <label class="field-label">
                CouchDB URL
                <input bind:value={syncUrl} placeholder="http://192.168.27.200:5984/offlog" disabled={!syncEnabled} />
              </label>
              {#if syncError && lastErrorAt}
                <p class="setting-hint">Last error at {fmtLastSynced(lastErrorAt)}: {syncError}</p>
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
              <div class="setting-row">
                <span class="storage-info">{storageInfo || 'Calculating…'}</span>
                <button class="export-btn" on:click={exportJSON}>Export JSON</button>
              </div>
              <div class="setting-row">
                <span class="storage-info" style="color: var(--muted)">Every task, one row, for a spreadsheet</span>
                <button class="export-btn" on:click={doExportCSV}>Export CSV</button>
              </div>
              <div class="setting-row">
                <select class="project-export-select" bind:value={exportProjectId}>
                  <option value="">Choose a project…</option>
                  {#each $projectsStore as p (p._id)}<option value={p._id}>{p.name}</option>{/each}
                </select>
                <button class="export-btn" on:click={doExportProject} disabled={!exportProjectId}>Export Project</button>
              </div>
              {#if storageAvailable}
                {#if storagePercent >= STORAGE_WARN_THRESHOLD}
                  <p class="setting-hint setting-hint-warn">
                    {(storagePercent * 100).toFixed(0)}% of quota used — getting close. Try Maintenance's
                    cleanup tools (prune old history, empty Recycle) below, or free up device storage;
                    once truly full, new writes would start failing.
                  </p>
                {:else}
                  <p class="setting-hint">
                    "Quota" is a ceiling your browser sets based on free disk space — not a limit Offlog
                    imposes. A personal task list's data is tiny next to typical quotas, so this number is
                    informational; nothing to act on unless it climbs near 100%.
                  </p>
                {/if}
              {/if}
              {#if breakdown}
                <p class="setting-hint">
                  {breakdown.activeTasks} active task{breakdown.activeTasks === 1 ? '' : 's'} ·
                  {breakdown.archivedTasks} archived ·
                  {breakdown.deletedTasks} in Recycle ·
                  {breakdown.logEntries} history entries
                </p>
              {/if}
              {#if importPreview}
                <div class="import-preview">
                  <p class="setting-hint">
                    Will create <strong>{importPreview.byType.space}</strong> space{importPreview.byType.space === 1 ? '' : 's'},
                    <strong>{importPreview.byType.project}</strong> project{importPreview.byType.project === 1 ? '' : 's'},
                    <strong>{importPreview.byType.task}</strong> task{importPreview.byType.task === 1 ? '' : 's'}
                    {#if importPreview.toSkip > 0}— <strong>{importPreview.toSkip}</strong> unrecognized entr{importPreview.toSkip === 1 ? 'y' : 'ies'} will be skipped{/if}.
                    A doc whose id already exists merges instead of duplicating.
                  </p>
                  <div class="setting-row">
                    <button class="export-btn" on:click={cancelImport}>Cancel</button>
                    <button class="export-btn import-confirm-btn" on:click={confirmImport}>Import {importPreview.toCreate} item{importPreview.toCreate === 1 ? '' : 's'}</button>
                  </div>
                </div>
              {:else}
                <div class="setting-row">
                  <span class="storage-info" style="color: var(--muted)">{importStatus || 'Restore from a backup file'}</span>
                  <button class="export-btn" on:click={handleImport}>Import JSON</button>
                </div>
              {/if}

            {:else if activeCategory === 'maintenance'}
              <p class="setting-hint">
                Runs a full check in order: looks for database problems, repairs what it safely can,
                clears old activity history (6+ months) and old Recycle items (3+ months), then compacts
                the database to reclaim the space they were using.
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
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="settings-actions">
      <button on:click={() => requestClose()}>Cancel</button>
      <button class="save-btn" on:click={saveSettings}>Save & restart sync</button>
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

  .project-export-select {
    flex: 1; padding: .4rem .5rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .82rem;
  }
  .project-export-select:focus { outline: none; border-color: var(--accent); }

  .import-preview {
    display: flex; flex-direction: column; gap: .5rem;
    background: var(--col-bg); border-radius: var(--radius-sm); padding: .6rem .7rem;
  }
  .import-confirm-btn { background: var(--accent); color: #fff; border-color: var(--accent); }
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
  .theme-seg-btn.active { background: var(--accent); color: #fff; }

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

  /* B15 — Maintenance step list, folded in from the old standalone
     MaintenanceModal.svelte overlay; styles carried over as-is. */
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
