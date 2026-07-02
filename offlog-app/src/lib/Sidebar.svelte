<script lang="ts">
  import { spaces, projects, activeSpaceId, activeProjectId, showError, reloadTasks } from './store';
  import db, {
    createProject, deleteProject, syncState, syncNow,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
  } from './db';
  import { derived } from 'svelte/store';
  import { confirmAction } from './confirm';

  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  const dispatch = createEventDispatcher();

  export let showDeadlines = false;
  export let showDashboard = false;
  export let open = false;

  // Settings' own Escape handling (including its mobile back-vs-close
  // distinction) lives in SettingsPanel.svelte. The mobile drawer's Escape
  // handling lives in App.svelte's onKeydown, alongside its back-button
  // routing (closeSidebar) — the drawer's `open` state is bound two-way
  // from there, and closing it needs to go through that same routing
  // (see modalStack.ts / ROADMAP.md A14), not set `open = false` directly
  // here, which would desync the pushed history entry from what's visible.

  let showChangelog = false;
  let showSettings = false;
  let syncStatus = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let retryCount = syncState.retryCount;
  let conflictCount = syncState.conflictCount;
  let newProjectName = '';
  let addingProject = false;

  // ChangelogView/TrashView/SettingsPanel are full separate screens only
  // opened from these buttons — loading them as dynamic imports keeps them
  // out of the main bundle.
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

  let SettingsPanelComp: typeof import('./SettingsPanel.svelte').default | null = null;
  async function openSettings() {
    if (!SettingsPanelComp) SettingsPanelComp = (await import('./SettingsPanel.svelte')).default;
    showSettings = true;
  }

  // Storage breakdown — just for the "Deleted N" count badge in the bottom
  // nav row. Kept live (not just loaded when Settings opens) so the badge
  // stays accurate as tasks get deleted/restored anywhere in the app.
  // SettingsPanel loads its own copy for the Data tab — cheap query, not
  // worth threading through props/events to share one instance.
  let breakdown: StorageBreakdown | null = null;
  async function loadBreakdown() { breakdown = await getStorageBreakdown(); }
  onMount(() => {
    loadBreakdown();
    return subscribeDb(() => loadBreakdown());
  });

  function onSyncChange() {
    syncStatus = syncState.status;
    lastSynced = syncState.lastSynced;
    syncError = syncState.error;
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

  const SPACE_ICON: Record<string, string> = {
    'space:unsorted': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><polyline points="2,9 20,9"/><polyline points="6,13 10,13 10,16 14,16"/></svg>`,
    'space:personal': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="4"/><path d="M2 18c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    'space:family':   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10L10 3l7 7"/><path d="M5 8v9h4v-5h2v5h4V8"/></svg>`,
    'space:work':     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="11" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`,
  };
  const DEFAULT_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>`;
</script>

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

{#if showSettings && SettingsPanelComp}
  <svelte:component this={SettingsPanelComp} on:close={() => showSettings = false} />
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

  @media (max-width: 768px) {
    .proj-delete-btn { opacity: .7; }
  }
</style>
