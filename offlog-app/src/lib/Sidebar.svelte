<script lang="ts">
  import { spaces, projects, activeSpaceId, activeProjectId, showError, reloadTasks } from './store';
  import db, {
    createProject, deleteProject, syncState, syncNow, importJSON, checkIntegrity, repairDatabase, type IntegrityIssue,
    getConflicts, resolveConflict, type ConflictInfo,
    getStorageBreakdown, pruneOldLogs, pruneOldDeletedTasks, type StorageBreakdown, subscribe as subscribeDb,
  } from './db';
  import { getSyncUrl, setSyncUrl } from '../config';
  import { derived } from 'svelte/store';
  import { requestPermission, permissionState } from './notifications';
  import { confirmAction } from './confirm';

  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  const dispatch = createEventDispatcher();

  export let showDeadlines = false;
  export let showDashboard = false;
  export let open = false;

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (showSettings) showSettings = false;
    else if (open) open = false;
  }

  let showChangelog = false;
  let showSettings = false;
  let syncUrl = getSyncUrl();
  let syncStatus = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let lastErrorAt = syncState.lastErrorAt;
  let retryCount = syncState.retryCount;
  let conflictCount = syncState.conflictCount;
  let newProjectName = '';
  let addingProject = false;
  let storageInfo = '';
  let darkMode = typeof localStorage !== 'undefined' && !!localStorage.getItem('dark');
  const isAndroid = (window as any).Capacitor?.getPlatform?.() === 'android';

  // ChangelogView/TrashView are full separate screens only opened from these
  // buttons — loading them as dynamic imports keeps them out of the main bundle.
  let ChangelogViewComp: typeof import('./ChangelogView.svelte').default | null = null;
  async function openChangelog() {
    if (!ChangelogViewComp) ChangelogViewComp = (await import('./ChangelogView.svelte')).default;
    showChangelog = true;
  }

  let showTrash = false;
  let TrashViewComp: typeof import('./TrashView.svelte').default | null = null;
  async function openTrash() {
    if (!TrashViewComp) TrashViewComp = (await import('./TrashView.svelte')).default;
    showTrash = true;
  }

  // Sync conflicts (view both versions, pick a winner)
  let conflictList: ConflictInfo[] = [];
  let loadingConflicts = false;
  async function loadConflicts() {
    loadingConflicts = true;
    try { conflictList = await getConflicts(); } finally { loadingConflicts = false; }
  }
  async function resolve(c: ConflictInfo, keep: 'current' | 'other') {
    try {
      await resolveConflict(c.docId, keep, c.other.rev);
      await reloadTasks();
      await loadConflicts();
    } catch {
      showError('Failed to resolve conflict. Please try again.');
    }
  }

  // Storage breakdown — the raw MB figure from navigator.storage.estimate()
  // (loadStorage(), below) can't say *what's* using the space; this gives an
  // actual doc-count answer.
  let breakdown: StorageBreakdown | null = null;
  async function loadBreakdown() { breakdown = await getStorageBreakdown(); }
  // Kept live (not just loaded when Settings opens) so numbers shown
  // anywhere stay accurate as tasks get deleted/restored elsewhere in the app.
  onMount(() => {
    loadBreakdown();
    return subscribeDb(() => loadBreakdown());
  });

  function toggleDark() {
    darkMode = !darkMode;
    if (darkMode) { localStorage.setItem('dark', '1'); document.body.classList.add('dark'); }
    else { localStorage.removeItem('dark'); document.body.classList.remove('dark'); }
  }

  let importStatus = '';

  async function handleImport() {
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
        importStatus = 'Importing…';
        const { ok, skipped } = await importJSON(docs);
        importStatus = `Done — ${ok} imported, ${skipped} skipped`;
        setTimeout(() => { importStatus = ''; }, 4000);
      } catch (e: any) {
        importStatus = 'Error: ' + (e.message ?? 'invalid file');
        setTimeout(() => { importStatus = ''; }, 4000);
      }
    };
    input.click();
  }

  async function exportJSON() {
    try {
      const all = await db.allDocs({ include_docs: true });
      const docs = all.rows.map((r: any) => r.doc).filter((d: any) => !d._id.startsWith('_'));
      const blob = new Blob([JSON.stringify(docs, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `offlog-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
    } catch {
      showError('Failed to export backup. Please try again.');
    }
  }

  async function loadStorage() {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      storageInfo = `${(usage / 1048576).toFixed(1)} MB used / ${(quota / 1048576).toFixed(0)} MB quota`;
    } else { storageInfo = 'Not available'; }
  }

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

  // ── Maintenance ──────────────────────────────────────────────────────────
  // One combined, visible flow instead of three separate unexplained buttons
  // (Check Database / Repair Issues / Optimize Storage). Runs as an ordered
  // list of steps with live status, so "what does this actually do" has a
  // concrete on-screen answer instead of just a spinner.
  type MaintStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
  interface MaintStep { key: string; label: string; status: MaintStatus; note: string }

  let showMaintenance = false;
  let maintRunning = false;
  let maintSteps: MaintStep[] = [];
  let remainingIssues: IntegrityIssue[] = [];

  function freshMaintSteps(): MaintStep[] {
    return [
      { key: 'check',   label: 'Checking database for problems', status: 'pending', note: '' },
      { key: 'repair',  label: 'Repairing anything fixable',      status: 'pending', note: '' },
      { key: 'history', label: 'Clearing old activity history',   status: 'pending', note: '' },
      { key: 'trash',   label: 'Clearing old items from Recycle', status: 'pending', note: '' },
      { key: 'compact', label: 'Compacting the database',         status: 'pending', note: '' },
    ];
  }

  function openMaintenance() {
    showMaintenance = true;
    maintSteps = freshMaintSteps();
    remainingIssues = [];
  }

  function setStep(i: number, patch: Partial<MaintStep>) {
    maintSteps = maintSteps.map((s, idx) => idx === i ? { ...s, ...patch } : s);
  }

  async function runMaintenance() {
    maintRunning = true;
    maintSteps = freshMaintSteps();
    remainingIssues = [];
    try {
      setStep(0, { status: 'running' });
      const { issues, checked } = await checkIntegrity();
      setStep(0, { status: 'done', note: issues.length === 0 ? `No problems found (${checked} items checked)` : `${issues.length} issue${issues.length === 1 ? '' : 's'} found` });

      if (issues.length === 0) {
        setStep(1, { status: 'skipped', note: 'Nothing to repair' });
      } else {
        setStep(1, { status: 'running' });
        const { fixed, skipped } = await repairDatabase();
        setStep(1, { status: 'done', note: `Fixed ${fixed}${skipped ? `, ${skipped} need manual review` : ''}` });
        if (skipped > 0) {
          const after = await checkIntegrity();
          remainingIssues = after.issues;
        }
      }

      setStep(2, { status: 'running' });
      const prunedLogs = await pruneOldLogs();
      setStep(2, { status: 'done', note: prunedLogs > 0 ? `Removed ${prunedLogs} entr${prunedLogs === 1 ? 'y' : 'ies'} older than 6 months` : 'Nothing old enough to remove' });

      setStep(3, { status: 'running' });
      const prunedTasks = await pruneOldDeletedTasks();
      setStep(3, { status: 'done', note: prunedTasks > 0 ? `Removed ${prunedTasks} item${prunedTasks === 1 ? '' : 's'} older than 3 months` : 'Nothing old enough to remove' });

      setStep(4, { status: 'running' });
      await db.compact();
      setStep(4, { status: 'done', note: 'Reclaimed disk space' });

      await loadBreakdown();
    } catch {
      const runningIdx = maintSteps.findIndex(s => s.status === 'running');
      if (runningIdx >= 0) setStep(runningIdx, { status: 'error', note: 'Failed — please try again' });
      showError('Maintenance failed partway through. Please try again.');
    } finally {
      maintRunning = false;
    }
  }

  $: maintProgress = Math.round((maintSteps.filter(s => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length / (maintSteps.length || 1)) * 100);

  function fmtLastSynced(ts: string): string {
    const d = new Date(ts);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? d.toLocaleTimeString() : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString();
  }

  const spaceProjects = derived([projects, activeSpaceId], ([$p, $sid]) =>
    $p.filter(p => p.space_id === $sid)
  );

  async function doAddProject() {
    const name = newProjectName.trim();
    if (!name) { addingProject = false; return; }
    try {
      await createProject($activeSpaceId, name);
      newProjectName = '';
    } catch {
      showError('Failed to create project. Please try again.');
    }
    addingProject = false;
  }

  async function doDeleteProject(id: string, name: string) {
    if (!(await confirmAction(`Delete project "${name}" and all its tasks?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteProject(id);
      if ($activeProjectId === id) activeProjectId.set('');
    } catch {
      showError('Failed to delete project. Please try again.');
    }
  }

  function saveSettings() { setSyncUrl(syncUrl); showSettings = false; location.reload(); }
  function openSettings() { showSettings = true; loadStorage(); loadBreakdown(); if (conflictCount > 0) loadConflicts(); }

  const SPACE_ICON: Record<string, string> = {
    'space:unsorted': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><polyline points="2,9 20,9"/><polyline points="6,13 10,13 10,16 14,16"/></svg>`,
    'space:personal': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="4"/><path d="M2 18c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    'space:family':   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10L10 3l7 7"/><path d="M5 8v9h4v-5h2v5h4V8"/></svg>`,
    'space:work':     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="11" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`,
  };
  const DEFAULT_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>`;
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<aside class="sidebar" class:mobile-open={open}>
  <div class="logo">Offlog</div>

  <button
    class="agenda-btn"
    class:active={showDashboard}
    on:click={() => { showDashboard = true; showDeadlines = false; dispatch('navigate'); }}
  >
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
      <rect x="2" y="2" width="6" height="6" rx="1"/>
      <rect x="10" y="2" width="6" height="6" rx="1"/>
      <rect x="2" y="10" width="6" height="6" rx="1"/>
      <rect x="10" y="10" width="6" height="6" rx="1"/>
    </svg>
    Dashboard
  </button>

  <button
    class="agenda-btn"
    class:active={showDeadlines}
    on:click={() => { showDeadlines = true; showDashboard = false; dispatch('navigate'); }}
  >
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
      <rect x="2" y="3" width="14" height="12" rx="2"/>
      <line x1="2" y1="7" x2="16" y2="7"/>
      <line x1="6" y1="1.5" x2="6" y2="4.5"/>
      <line x1="12" y1="1.5" x2="12" y2="4.5"/>
      <line x1="6" y1="11" x2="12" y2="11"/>
    </svg>
    Agenda
  </button>
  <div class="spaces-divider"></div>

  <nav class="spaces">
    {#each $spaces as space (space._id)}
      <button
        class="space-btn"
        class:active={$activeSpaceId === space._id && !showDeadlines}
        on:click={() => {
          showDeadlines = false;
          showDashboard = false;
          activeSpaceId.set(space._id);
          const first = $projects.find(p => p.space_id === space._id);
          if (first) activeProjectId.set(first._id);
          else activeProjectId.set('');
          dispatch('navigate');
        }}
      >
        <span class="space-icon" style="color:{space.color}">
          {@html SPACE_ICON[space._id] ?? DEFAULT_ICON}
        </span>
        <span class="space-name">{space.name}</span>
        {#if $activeSpaceId === space._id}
          <span class="space-dot" style="background:{space.color}"></span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="projects-section">
    <div class="section-label">Projects</div>
    {#each $spaceProjects as project (project._id)}
      <div class="project-row" class:active={$activeProjectId === project._id}>
        <button class="project-btn" on:click={() => { showDeadlines = false; showDashboard = false; activeProjectId.set(project._id); dispatch('navigate'); }}>
          {project.name}
        </button>
        <button class="proj-delete-btn" title="Delete project" on:click={() => doDeleteProject(project._id, project.name)}>×</button>
      </div>
    {/each}

    {#if addingProject}
      <!-- svelte-ignore a11y-autofocus -->
      <input autofocus class="new-project-input" bind:value={newProjectName}
        placeholder="Project name…"
        enterkeyhint="done"
        on:keydown={(e) => { if (e.key === 'Enter') doAddProject(); if (e.key === 'Escape') addingProject = false; }}
        on:blur={doAddProject}
      />
    {:else}
      <button class="add-project-btn" on:click={() => { addingProject = true; newProjectName = ''; }}>+ New project</button>
    {/if}
  </div>

  <div class="bottom">
    <div class="sync-row" title={syncError ?? ''}>
      <span
        class="sync-indicator"
        class:active={syncStatus === 'syncing'}
        class:error={syncStatus === 'error'}
        class:offline={syncStatus === 'offline'}
      ></span>
      <span class="sync-label">
        {#if syncStatus === 'offline'}Offline — will retry when back online
        {:else if syncStatus === 'syncing'}Syncing…
        {:else if syncStatus === 'error'}{syncError ?? 'Sync error'}{retryCount > 1 ? ` (retry ${retryCount})` : ''}
        {:else if lastSynced}Synced {fmtLastSynced(lastSynced)}
        {:else}Not synced yet{/if}
      </span>
      <button class="sync-now-btn" on:click={syncNow} title="Sync now">↻</button>
    </div>
    {#if conflictCount > 0}
      <div class="conflict-warning" title="Documents with unresolved sync conflicts">
        ⚠ {conflictCount} sync conflict{conflictCount === 1 ? '' : 's'}
      </div>
    {/if}
    <div class="bottom-row">
      <button class="icon-btn" on:click={() => { openChangelog(); dispatch('navigate'); }}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 8a6 6 0 1 1 1.8 4.3"/><polyline points="2,4 2,8 6,8"/><polyline points="8,5 8,8.5 10.5,10"/>
        </svg>
        <span>Changelog</span>
      </button>
      <button class="icon-btn" on:click={() => { openTrash(); dispatch('navigate'); }}>
        <svg viewBox="0 0 14 14" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4h10M5.5 4V2.5h3V4M3 4l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L11 4"/>
        </svg>
        <span>Deleted{#if breakdown && breakdown.deletedTasks > 0}<span class="trash-count"> · {breakdown.deletedTasks}</span>{/if}</span>
      </button>
      <button class="icon-btn" on:click={() => { openSettings(); dispatch('navigate'); }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>Settings</span>
      </button>
    </div>
  </div>
</aside>

{#if showChangelog && ChangelogViewComp}
  <svelte:component this={ChangelogViewComp} on:close={() => showChangelog = false} />
{/if}

{#if showTrash && TrashViewComp}
  <svelte:component this={TrashViewComp} on:close={() => showTrash = false} />
{/if}

{#if showSettings}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="settings-overlay" on:click|self={() => showSettings = false}>
    <div class="settings-panel">
      <h3>Settings</h3>

      <div class="setting-row">
        <div class="setting-label">Dark mode</div>
        <button class="toggle-btn" class:on={darkMode} on:click={toggleDark} aria-label="Toggle dark mode" role="switch" aria-checked={darkMode}>
          <span class="toggle-knob"></span>
        </button>
      </div>

      <div class="setting-group">
        <div class="setting-section-title">Notifications</div>
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
          <p class="setting-hint">
            On Android, reminders still fire without any extra step, but the OS may deliver them a few minutes late unless you allow precise timing: <strong>Settings → Apps → Offlog → Alarms & reminders</strong>. This is an Android battery-saving restriction (since Android 12), not something the app can skip or auto-grant.
          </p>
        {/if}
      </div>

      <div class="setting-group">
        <div class="setting-section-title">Sync</div>
        <label>
          CouchDB URL
          <input bind:value={syncUrl} placeholder="http://192.168.27.200:5984/offlog" />
        </label>
        {#if syncError && lastErrorAt}
          <p class="setting-hint">Last error at {fmtLastSynced(lastErrorAt)}: {syncError}</p>
        {/if}
      </div>

      {#if conflictCount > 0 || conflictList.length > 0}
        <div class="setting-group">
          <div class="setting-section-title">Conflicts</div>
          <div class="setting-row">
            <span class="storage-info" style="color: var(--muted)">
              {#if loadingConflicts}Loading…
              {:else if conflictList.length}{conflictList.length} document{conflictList.length === 1 ? '' : 's'} with unresolved edits
              {:else}{conflictCount} conflict{conflictCount === 1 ? '' : 's'} detected{/if}
            </span>
            <button class="export-btn" on:click={loadConflicts} disabled={loadingConflicts}>Review</button>
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

      <div class="setting-group">
        <div class="setting-section-title">Data</div>
        <div class="setting-row">
          <span class="storage-info">{storageInfo || 'Calculating…'}</span>
          <button class="export-btn" on:click={exportJSON}>Export JSON</button>
        </div>
        {#if breakdown}
          <p class="setting-hint">
            {breakdown.activeTasks} active task{breakdown.activeTasks === 1 ? '' : 's'} ·
            {breakdown.archivedTasks} archived ·
            {breakdown.deletedTasks} in Recycle ·
            {breakdown.logEntries} history entries
          </p>
        {/if}
        <div class="setting-row">
          <span class="storage-info" style="color: var(--muted)">{importStatus || 'Restore from a backup file'}</span>
          <button class="export-btn" on:click={handleImport}>Import JSON</button>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-section-title">Maintenance</div>
        <div class="setting-row">
          <span class="storage-info" style="color: var(--muted)">Check for problems, repair what's fixable, and reclaim space</span>
          <button class="export-btn" on:click={() => { showSettings = false; openMaintenance(); }}>Open</button>
        </div>
      </div>

      <div class="settings-actions">
        <button on:click={() => showSettings = false}>Cancel</button>
        <button class="save-btn" on:click={saveSettings}>Save & restart sync</button>
      </div>
    </div>
  </div>
{/if}

{#if showMaintenance}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="settings-overlay" on:click|self={() => { if (!maintRunning) showMaintenance = false; }}>
    <div class="settings-panel maint-panel">
      <h3>Maintenance</h3>
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

      {#if remainingIssues.length > 0}
        <div class="integrity-list">
          {#each remainingIssues.slice(0, 8) as issue}
            <div class="integrity-row">{issue.description}</div>
          {/each}
        </div>
        <p class="setting-hint">These need manual review — not safe to fix automatically.</p>
      {/if}

      <div class="settings-actions">
        <button on:click={() => showMaintenance = false} disabled={maintRunning}>Close</button>
        <button class="save-btn" on:click={runMaintenance} disabled={maintRunning}>
          {maintRunning ? 'Running…' : maintSteps.some(s => s.status === 'done') ? 'Run Again' : 'Run Maintenance'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    width: 224px; flex-shrink: 0;
    background: var(--sidebar-bg); border-right: 1px solid rgba(255,255,255,.06);
    display: flex; flex-direction: column;
    padding: 1.1rem .75rem; gap: .35rem; overflow-y: auto;
    /* Sidebar is always dark regardless of the page's light/dark toggle,
       so its surface tones are pinned here rather than following
       --bg/--surface. */
    --text: #f3f4f6;
    --muted: #a3a9b7;
    --faint: #6b7280;
    --hover: rgba(255,255,255,.07);
    --surface: #242934;
    --border: rgba(255,255,255,.07);
    --border-strong: rgba(255,255,255,.13);
    --accent: #818cf8;
  }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed; top: 0; left: 0; bottom: 0; z-index: 200;
      width: 280px;
      padding-top: calc(1.1rem + env(safe-area-inset-top, 0px));
      transform: translateX(-100%);
      transition: transform .38s cubic-bezier(0.4, 0, 0.2, 1),
                  visibility .38s;
      will-change: transform;
      box-shadow: none;
      visibility: hidden;
    }
    .sidebar.mobile-open {
      transform: translateX(0);
      box-shadow: 8px 0 40px rgba(0,0,0,.45);
      visibility: visible;
    }
  }
  .logo {
    font-family: var(--mono); font-weight: 600; font-size: .68rem; text-transform: uppercase;
    letter-spacing: .14em; padding: .25rem .35rem .85rem; color: var(--faint);
  }

  /* Agenda nav */
  .agenda-btn {
    display: flex; align-items: center; gap: .55rem;
    width: 100%; border: none; cursor: pointer; text-align: left;
    padding: .55rem .75rem; border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
    font-weight: 700; font-size: .88rem; letter-spacing: -.01em;
    border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
    transition: background .12s, box-shadow .12s;
    margin-bottom: .2rem;
  }
  .agenda-btn:hover { background: color-mix(in srgb, var(--accent) 24%, transparent); }
  .agenda-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 45%, transparent); }
  .agenda-btn.active svg { stroke: #fff; }

  .trash-count { color: var(--faint); font-weight: 400; }

  .spaces-divider { height: 1px; background: var(--border); margin: .5rem 0; }

  /* Fronts */
  .spaces { display: flex; flex-direction: column; gap: .15rem; }
  .space-btn {
    display: flex; align-items: center; gap: .6rem;
    background: none; border: none; cursor: pointer;
    padding: .6rem .65rem; border-radius: var(--radius-sm);
    color: var(--text); text-align: left; width: 100%;
    transition: background var(--dur) var(--ease);
  }
  .space-btn:hover { background: var(--hover); }
  .space-btn.active {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .space-btn.active .space-name { color: var(--accent); }
  .space-icon { width: 18px; height: 18px; flex-shrink: 0; display: flex; }
  .space-icon :global(svg) { width: 18px; height: 18px; }
  .space-name { font-size: .92rem; font-weight: 600; flex: 1; letter-spacing: -.01em; }
  .space-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  /* Projects */
  .projects-section { display: flex; flex-direction: column; gap: .05rem; padding-top: .65rem; flex: 1; }
  .section-label {
    font-family: var(--mono); font-size: .62rem; text-transform: uppercase;
    letter-spacing: .09em; color: var(--faint); padding: .2rem .55rem .35rem;
  }

  .project-row {
    display: flex; align-items: center;
    border-radius: var(--radius-sm);
    padding-right: .3rem;
    transition: background .12s;
  }
  .project-row:hover { background: var(--hover); }
  .project-row.active { background: var(--surface); box-shadow: 0 1px 2px rgba(0,0,0,.05); }

  .project-btn {
    flex: 1; background: none; border: none; cursor: pointer;
    padding: .38rem .55rem; color: var(--muted); font-size: .85rem;
    text-align: left; transition: color .12s;
  }
  .project-row.active .project-btn { color: var(--text); font-weight: 600; }
  .project-row:hover .project-btn { color: var(--text); }

  .proj-delete-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; padding: .15rem .35rem;
    border-radius: 4px;
    opacity: .35; transition: opacity .12s, color .12s, background .12s;
    line-height: 1;
  }
  .project-row:hover .proj-delete-btn { opacity: 1; }
  .proj-delete-btn:hover { color: var(--danger); opacity: 1; background: color-mix(in srgb, var(--danger) 12%, transparent); }

  .new-project-input {
    padding: .35rem .55rem; font-size: .85rem;
    border: 1.5px solid var(--accent); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); width: 100%;
  }
  .new-project-input:focus { outline: none; }

  .add-project-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: .82rem; font-weight: 500; text-align: left;
    padding: .4rem .55rem; transition: color .12s;
  }
  .add-project-btn:hover { color: var(--text); }

  /* Bottom */
  .bottom { margin-top: auto; display: flex; flex-direction: column; gap: .4rem; padding-top: .75rem; }
  .sync-row {
    display: flex; align-items: center; gap: .5rem;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: .5rem .65rem;
  }
  .sync-indicator {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 16%, transparent);
    transition: background .3s, box-shadow .3s; flex-shrink: 0;
  }
  .sync-indicator.active { background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
  .sync-indicator.error  { background: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 16%, transparent); }
  .sync-indicator.offline { background: var(--faint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--faint) 16%, transparent); }
  .sync-label {
    font-size: .74rem; color: var(--muted); flex: 1; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .conflict-warning {
    font-size: .72rem; color: var(--due-soon-ink); background: var(--due-soon-bg);
    border-radius: var(--radius-sm); padding: .35rem .6rem; font-weight: 600;
  }
  .sync-now-btn { background: none; border: none; cursor: pointer; font-size: .95rem; color: var(--faint); padding: 0; transition: color .12s; }
  .sync-now-btn:hover { color: var(--text); }

  .bottom-row { display: flex; gap: .35rem; }
  .icon-btn {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; align-items: center; gap: .3rem;
    background: var(--hover); border: 1px solid var(--border);
    border-radius: var(--radius-sm); cursor: pointer;
    color: var(--muted); padding: .5rem .3rem;
    transition: background .12s, color .12s, border-color .12s;
  }
  .icon-btn svg { flex-shrink: 0; opacity: .85; }
  .icon-btn span {
    font-size: .62rem; font-weight: 500; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  }
  .icon-btn:hover { background: var(--surface); color: var(--text); border-color: var(--border-strong); }

  /* Settings overlay */
  .settings-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.35);
    display: flex; align-items: center; justify-content: center; z-index: 200;
  }
  .settings-panel {
    /* This panel is a sibling of <aside class="sidebar">, not a descendant —
       it already inherits the real global :root/body.dark variables
       directly. No local overrides needed (a previous hardcoded duplicate
       palette here had silently drifted out of sync with the real theme). */
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 1.5rem; width: min(400px, 90vw);
    display: flex; flex-direction: column; gap: 1rem;
    box-shadow: 0 20px 50px rgba(0,0,0,.18);
    /* Variable-length content (conflict list, integrity issues) can grow
       taller than the viewport — without a cap the panel just overflows off
       both the top and bottom of the screen with no way to reach the header
       or the Cancel/Save buttons. Scroll inside the panel instead. */
    max-height: min(85vh, 720px);
    overflow-y: auto;
  }
  .settings-panel h3 { margin: 0; font-size: 1rem; letter-spacing: -.01em; }
  .settings-panel label {
    display: flex; flex-direction: column; gap: .35rem;
    font-family: var(--mono); font-size: .68rem; letter-spacing: .06em;
    text-transform: uppercase; color: var(--faint);
  }
  .settings-panel input {
    padding: .5rem .6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .9rem;
  }
  .settings-panel input:focus { outline: none; border-color: var(--accent); }
  .settings-actions { display: flex; justify-content: flex-end; gap: .5rem; }
  .settings-actions button {
    padding: .45rem .95rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .85rem; font-weight: 500;
  }
  .save-btn { background: var(--text) !important; color: var(--bg) !important; border-color: var(--text) !important; }

  .setting-group { display: flex; flex-direction: column; gap: .5rem; }
  .setting-section-title {
    font-family: var(--mono); font-size: .62rem; text-transform: uppercase;
    letter-spacing: .08em; color: var(--faint); padding-bottom: .2rem;
    border-bottom: 1px solid var(--border);
  }
  .setting-row { display: flex; align-items: center; gap: .75rem; }
  .setting-hint { margin: 0; font-size: .74rem; color: var(--faint); line-height: 1.5; }
  .setting-label { font-size: .88rem; color: var(--text); flex: 1; }
  .storage-info { font-family: var(--mono); font-size: .72rem; color: var(--muted); flex: 1; }

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

  .integrity-list {
    display: flex; flex-direction: column; gap: 3px;
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .5rem .65rem; max-height: 140px; overflow-y: auto;
  }
  .integrity-row { font-size: .74rem; color: var(--muted); line-height: 1.4; }

  .conflict-item {
    display: flex; flex-direction: column; gap: .3rem;
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: .5rem .65rem;
  }
  .conflict-item-title { font-size: .8rem; font-weight: 600; color: var(--text); }
  .conflict-item-type { font-weight: 400; color: var(--faint); }
  .conflict-item-row { display: flex; align-items: center; gap: .75rem; }
  .conflict-item-meta { font-size: .72rem; color: var(--muted); flex: 1; }

  /* Maintenance modal */
  .maint-panel { gap: .85rem; }

  .progress-track {
    height: 6px; border-radius: 3px; background: var(--border); overflow: hidden;
  }
  .progress-fill {
    height: 100%; background: var(--accent); border-radius: 3px;
    transition: width .3s var(--ease);
  }

  .maint-steps { display: flex; flex-direction: column; gap: .5rem; }
  .maint-step {
    display: flex; align-items: center; gap: .6rem;
    padding: .4rem .1rem; border-radius: var(--radius-sm);
  }
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

  @media (max-width: 768px) {
    .proj-delete-btn { opacity: .7; }
  }
</style>
