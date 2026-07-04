<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import db, {
    syncState, syncNow, importJSON,
    getConflicts, resolveConflict, type ConflictInfo,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
  } from './db';
  import { getSyncUrl, setSyncUrl } from '../config';
  import { requestPermission, permissionState, exactAlarmState, checkExactAlarmPermission, requestExactAlarmPermission } from './notifications';
  import { showError } from './store';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';

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
  let darkMode = typeof localStorage !== 'undefined' && !!localStorage.getItem('dark');
  function toggleDark() {
    darkMode = !darkMode;
    if (darkMode) { localStorage.setItem('dark', '1'); document.body.classList.add('dark'); }
    else { localStorage.removeItem('dark'); document.body.classList.remove('dark'); }
  }

  // ── Notifications ───────────────────────────────────────────────────────
  const isAndroid = (window as any).Capacitor?.getPlatform?.() === 'android';

  // ── Sync ────────────────────────────────────────────────────────────────
  let syncUrl = getSyncUrl();
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

  // ── Data ────────────────────────────────────────────────────────────────
  let breakdown: StorageBreakdown | null = null;
  async function loadBreakdown() { breakdown = await getStorageBreakdown(); }
  onMount(() => {
    loadBreakdown();
    return subscribeDb(() => loadBreakdown());
  });

  let storageInfo = '';
  async function loadStorage() {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      storageInfo = `${(usage / 1048576).toFixed(1)} MB used / ${(quota / 1048576).toFixed(0)} MB quota`;
    } else { storageInfo = 'Not available'; }
  }
  onMount(loadStorage);
  // Re-check on every open, not just at app-start init — the user may have
  // just come back from the OS "Alarms & reminders" settings screen.
  onMount(() => { if (isAndroid) checkExactAlarmPermission(); });

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

  // ── Maintenance ─────────────────────────────────────────────────────────
  let MaintenanceModalComp: typeof import('./MaintenanceModal.svelte').default | null = null;
  let showMaintenance = false;
  async function openMaintenance() {
    if (!MaintenanceModalComp) MaintenanceModalComp = (await import('./MaintenanceModal.svelte')).default;
    showMaintenance = true;
  }

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
                <div class="setting-label">Dark mode</div>
                <button class="toggle-btn" class:on={darkMode} on:click={toggleDark} aria-label="Toggle dark mode" role="switch" aria-checked={darkMode}>
                  <span class="toggle-knob"></span>
                </button>
              </div>

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

            {:else if activeCategory === 'sync'}
              <label class="field-label">
                CouchDB URL
                <input bind:value={syncUrl} placeholder="http://192.168.27.200:5984/offlog" />
              </label>
              {#if syncError && lastErrorAt}
                <p class="setting-hint">Last error at {fmtLastSynced(lastErrorAt)}: {syncError}</p>
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
              <button class="link-row" on:click={openSpaceManager}>
                <div class="link-row-text">
                  <span class="link-row-title">Manage Spaces</span>
                  <span class="link-row-desc">Rename, recolor, reorder, or remove spaces</span>
                </div>
                <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
              </button>
              <button class="link-row" on:click={openTagManager}>
                <div class="link-row-text">
                  <span class="link-row-title">Manage Tags</span>
                  <span class="link-row-desc">Rename, merge, or delete tags across all tasks</span>
                </div>
                <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
              </button>

            {:else if activeCategory === 'data'}
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

            {:else if activeCategory === 'maintenance'}
              <button class="link-row" on:click={openMaintenance}>
                <div class="link-row-text">
                  <span class="link-row-title">Run Maintenance</span>
                  <span class="link-row-desc">Check for problems, repair what's fixable, and reclaim space</span>
                </div>
                <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
              </button>
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

{#if showMaintenance && MaintenanceModalComp}
  <svelte:component this={MaintenanceModalComp} on:close={() => showMaintenance = false} on:done={loadBreakdown} />
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
  .setting-label { font-size: .88rem; color: var(--text); flex: 1; }
  .storage-info { font-family: var(--mono); font-size: .72rem; color: var(--muted); flex: 1; }

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
  .link-row-text { flex: 1; display: flex; flex-direction: column; gap: .15rem; }
  .link-row-title { font-size: .88rem; font-weight: 600; color: var(--text); }
  .link-row-desc { font-size: .74rem; color: var(--faint); }
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
