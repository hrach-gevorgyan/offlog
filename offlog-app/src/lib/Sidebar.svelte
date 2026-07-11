<script lang="ts">
  import { spaces, projects, activeSpaceId, activeProjectId, showError, reloadTasks } from './store';
  import db, {
    createProject, deleteProject, updateProject, syncState, syncNow,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    getRecentlyModifiedTasks,
  } from './db';
  import { confirmAction } from './confirm';
  import type { TaskDoc, ProjectDoc } from './types';

  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  const dispatch = createEventDispatcher();

  export let showDeadlines = false;
  export let showDashboard = false;
  export let showFocus = false;
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
  let addingProjectFor: string | null = null;

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
    loadRecent();
    return subscribeDb(() => { loadBreakdown(); loadRecent(); });
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

  // Compact sync status (owner feedback, 2026-07-09): a full sentence in
  // a bordered row was one more heavy sidebar block — collapsed to a
  // short label + dot, with the full message (previously always visible)
  // now only in the tooltip.
  $: syncShortLabel = syncStatus === 'offline' ? 'Offline'
    : syncStatus === 'syncing' ? 'Syncing…'
    : syncStatus === 'error' ? 'Sync error'
    : lastSynced ? 'Synced' : 'Not synced';
  $: syncTooltip = syncStatus === 'offline' ? 'Offline — will retry when back online'
    : syncStatus === 'syncing' ? 'Syncing…'
    : syncStatus === 'error' ? (syncError ?? 'Sync error') + (retryCount > 1 ? ` (retry ${retryCount})` : '')
    : lastSynced ? `Synced ${fmtLastSynced(lastSynced)}` : 'Not synced yet';

  // B34: pinned projects float to the top, same convention as
  // TaskDoc.pinned elsewhere in the app — otherwise stable in whatever
  // order getProjects() already returns (by position).
  function projectsForSpace(spaceId: string, all: ProjectDoc[]): ProjectDoc[] {
    return all.filter(p => p.space_id === spaceId).sort((a, b) => (!!b.pinned) === (!!a.pinned) ? 0 : b.pinned ? 1 : -1);
  }

  // Spaces + Projects merged into one collapsible tree (owner feedback,
  // 2026-07-09 — sidebar felt overloaded as two separate flat lists).
  // Expand state is per-device (localStorage), not synced — same reasoning
  // as every other per-device sidebar/list preference in this app. The
  // active project's space always starts expanded even if the user
  // previously collapsed it, so switching projects never hides the one
  // you're looking at.
  const EXPANDED_KEY = 'offlog_sidebar_expanded_spaces';
  let expandedSpaces = new Set<string>();
  // Tracks the space id this component last force-expanded for, so the
  // force-expand only fires on an actual navigation (activeSpaceId
  // changing), never as a standing constraint — otherwise collapsing the
  // *currently* active space would immediately snap back open, since
  // expandedSpaces changing would itself re-trigger the same reactive
  // check (the bug this replaced).
  let lastForceExpanded: string | null = null;
  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? 'null') as string[] | null;
      if (saved) expandedSpaces = new Set(saved);
    } catch {}
    if ($activeSpaceId) {
      lastForceExpanded = $activeSpaceId;
      if (!expandedSpaces.has($activeSpaceId)) expandedSpaces = new Set([...expandedSpaces, $activeSpaceId]);
    }
  });
  $: if ($activeSpaceId && $activeSpaceId !== lastForceExpanded) {
    lastForceExpanded = $activeSpaceId;
    if (!expandedSpaces.has($activeSpaceId)) expandedSpaces = new Set([...expandedSpaces, $activeSpaceId]);
  }

  function toggleSpaceExpand(spaceId: string) {
    const next = new Set(expandedSpaces);
    if (next.has(spaceId)) next.delete(spaceId); else next.add(spaceId);
    expandedSpaces = next;
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
  }

  function goToProject(project: ProjectDoc) {
    showDeadlines = false; showDashboard = false; showFocus = false;
    activeSpaceId.set(project.space_id);
    activeProjectId.set(project._id);
    dispatch('navigate');
  }

  async function toggleProjectPin(project: ProjectDoc) {
    try {
      await updateProject(project._id, { pinned: !project.pinned });
    } catch {
      showError('Failed to update project. Please try again.');
    }
  }

  // B23: quick-resume shortcut — last 2 modified tasks across every
  // project, not just the one currently open. Refreshed on any DB change
  // (same subscribeDb() already used for the storage breakdown below) so
  // it stays current as tasks are edited anywhere in the app.
  let recentTasks: TaskDoc[] = [];
  async function loadRecent() { recentTasks = await getRecentlyModifiedTasks(2); }

  function openRecentTask(task: TaskDoc) {
    const project = $projects.find(p => p._id === task.project_id);
    if (!project) return;
    dispatch('openTask', { task, project });
  }

  async function doAddProject(spaceId: string) {
    const name = newProjectName.trim();
    if (!name) { addingProjectFor = null; return; }
    try {
      await createProject(spaceId, name);
      newProjectName = '';
    } catch {
      showError('Failed to create project. Please try again.');
    }
    addingProjectFor = null;
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

  <nav class="primary-nav">
    <button
      class="nav-btn"
      class:active={showDashboard}
      on:click={() => { showDashboard = true; showDeadlines = false; showFocus = false; dispatch('navigate'); }}
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
      class="nav-btn"
      class:active={showFocus}
      on:click={() => { showFocus = true; showDashboard = false; showDeadlines = false; dispatch('navigate'); }}
    >
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
        <circle cx="9" cy="9" r="7"/>
        <circle cx="9" cy="9" r="3.5"/>
        <circle cx="9" cy="9" r="0.6" fill="currentColor"/>
      </svg>
      Focus
    </button>

    <button
      class="nav-btn"
      class:active={showDeadlines}
      on:click={() => { showDeadlines = true; showDashboard = false; showFocus = false; dispatch('navigate'); }}
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
  </nav>
  <div class="spaces-divider"></div>

  <div class="tree-section">
    {#each $spaces as space (space._id)}
      {@const spaceOpen = expandedSpaces.has(space._id)}
      {@const spProjects = projectsForSpace(space._id, $projects)}
      <div class="space-group">
        <button class="space-header" class:active={$activeSpaceId === space._id} on:click={() => toggleSpaceExpand(space._id)} aria-expanded={spaceOpen}>
          <svg class="space-chevron" class:open={spaceOpen} viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,1 7,5 2,9"/>
          </svg>
          <span class="space-icon" style="color:{space.color}; background:color-mix(in srgb, {space.color} 18%, transparent)">
            {@html SPACE_ICON[space._id] ?? DEFAULT_ICON}
          </span>
          <span class="space-name">{space.name}</span>
          <span class="space-count">{spProjects.length}</span>
        </button>

        {#if spaceOpen}
          <div class="space-projects">
            {#each spProjects as project (project._id)}
              <div class="project-row" class:active={$activeProjectId === project._id}>
                <button class="project-btn" on:click={() => goToProject(project)}>
                  {project.name}
                </button>
                <button
                  class="proj-pin-btn"
                  class:pinned={project.pinned}
                  title={project.pinned ? 'Unpin project' : 'Pin project'}
                  on:click|stopPropagation={() => toggleProjectPin(project)}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill={project.pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 17v5"/><path d="M9 3h6l-.5 6.5L17 12v2H7v-2l2.5-2.5L9 3Z"/>
                  </svg>
                </button>
                <button class="proj-delete-btn" title="Delete project" on:click={() => doDeleteProject(project._id, project.name)}>×</button>
              </div>
            {/each}

            {#if addingProjectFor === space._id}
              <!-- svelte-ignore a11y-autofocus -->
              <input autofocus class="new-project-input" bind:value={newProjectName}
                placeholder="Project name…"
                enterkeyhint="done"
                on:keydown={(e) => { if (e.key === 'Enter') doAddProject(space._id); if (e.key === 'Escape') addingProjectFor = null; }}
                on:blur={() => doAddProject(space._id)}
              />
            {:else}
              <button class="add-project-btn" on:click={() => { addingProjectFor = space._id; newProjectName = ''; }}>+ New project</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="bottom">
    {#if recentTasks.length > 0}
      <div class="recent-section">
        <div class="section-label">Recent</div>
        {#each recentTasks as task (task._id)}
          <button class="recent-btn" on:click={() => openRecentTask(task)} title={task.title}>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="8" cy="8" r="6.2"/><polyline points="8,4.5 8,8 10.5,9.5"/>
            </svg>
            <span>{task.title}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="bottom-row">
      <button class="icon-btn" on:click={() => { openChangelog(); dispatch('navigate'); }} title="Changelog">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 8a6 6 0 1 1 1.8 4.3"/><polyline points="2,4 2,8 6,8"/><polyline points="8,5 8,8.5 10.5,10"/>
        </svg>
        <span class="icon-btn-label">Changelog</span>
      </button>
      <button class="icon-btn" on:click={() => { openTrash(); dispatch('navigate'); }} title="Deleted{breakdown && breakdown.deletedTasks > 0 ? ` (${breakdown.deletedTasks})` : ''}">
        <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4h10M5.5 4V2.5h3V4M3 4l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L11 4"/>
        </svg>
        <span class="icon-btn-label">Deleted{#if breakdown && breakdown.deletedTasks > 0}<span class="icon-btn-count"> · {breakdown.deletedTasks}</span>{/if}</span>
      </button>
      <button class="icon-btn" on:click={() => { openSettings(); dispatch('navigate'); }} title="Settings">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span class="icon-btn-label">Settings</span>
      </button>
      <button class="icon-btn icon-btn-sync" on:click={syncNow} title="{syncTooltip} — click to sync now">
        <span
          class="sync-indicator"
          class:active={syncStatus === 'syncing'}
          class:error={syncStatus === 'error'}
          class:offline={syncStatus === 'offline'}
        ></span>
        {#if conflictCount > 0}<span class="conflict-badge">{conflictCount}</span>{/if}
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9a6 6 0 0 1 10.2-4.2M15 9a6 6 0 0 1-10.2 4.2"/><polyline points="13,1.5 13.2,4.8 9.9,5"/><polyline points="5,16.5 4.8,13.2 8.1,13"/>
        </svg>
        <span class="icon-btn-label">Sync</span>
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
    padding: 1.1rem .75rem; gap: .35rem; overflow: hidden;
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

  /* Primary nav (Dashboard/Focus/Agenda) — same light, border-free visual
     language as .space-btn below rather than 3 separately-bordered pills;
     unifying the two reduces both height per row and competing visual
     weight at the top of the sidebar. */
  .primary-nav { display: flex; flex-direction: column; gap: .1rem; }
  .nav-btn {
    display: flex; align-items: center; gap: .6rem;
    width: 100%; border: none; cursor: pointer; text-align: left;
    padding: .42rem .55rem; border-radius: var(--radius-sm);
    background: none; color: var(--muted);
    font-weight: 600; font-size: .85rem; letter-spacing: -.01em;
    transition: background .12s, color .12s;
  }
  .nav-btn svg { flex-shrink: 0; opacity: .85; }
  .nav-btn:hover { background: var(--hover); color: var(--text); }
  .nav-btn.active { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
  .nav-btn.active svg { opacity: 1; }

  .spaces-divider { height: 1px; background: var(--border); margin: .5rem 0; }

  /* Spaces + Projects merged into one collapsible tree (owner feedback,
     2026-07-09 — two separate flat lists felt like too many competing
     sidebar blocks). Each space is a collapsible group; its projects
     nest directly underneath instead of a second, separately-labeled
     list below a divider. */
  .tree-section {
    display: flex; flex-direction: column; gap: .05rem; padding-top: .3rem;
    flex: 1; min-height: 90px; overflow-y: auto;
  }
  .space-group { display: flex; flex-direction: column; margin-bottom: .05rem; }
  .space-header {
    display: flex; align-items: center; gap: .5rem;
    background: none; border: none; cursor: pointer;
    padding: .4rem .5rem; border-radius: var(--radius-sm);
    color: var(--muted); text-align: left; width: 100%;
    transition: background .12s, color .12s;
  }
  .space-header:hover { background: var(--hover); color: var(--text); }
  .space-header.active { color: var(--text); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .space-chevron { flex-shrink: 0; color: var(--faint); transition: transform .18s ease, color .12s; }
  .space-chevron.open { transform: rotate(90deg); }
  .space-header.active .space-chevron { color: var(--accent); }
  .space-icon {
    width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 7px;
  }
  .space-icon :global(svg) { width: 13px; height: 13px; }
  .space-name { font-size: .84rem; font-weight: 600; flex: 1; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .space-count {
    font-family: var(--mono); font-size: .64rem; color: var(--faint);
    background: var(--hover); border-radius: 5px; padding: 1px 6px; flex-shrink: 0;
  }
  .space-projects {
    display: flex; flex-direction: column; gap: .02rem;
    padding: .1rem 0 .3rem 1.55rem;
  }

  /* Recent (B23) — lives in the bottom section, near sync status */
  .recent-section { display: flex; flex-direction: column; gap: .05rem; padding-bottom: .6rem; }
  .recent-btn {
    display: flex; align-items: center; gap: .45rem;
    background: none; border: none; cursor: pointer; text-align: left; width: 100%;
    padding: .32rem .55rem; border-radius: var(--radius-sm);
    color: var(--muted); font-size: .8rem;
    transition: color .12s, background .12s;
  }
  .recent-btn svg { flex-shrink: 0; opacity: .7; }
  .recent-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .recent-btn:hover { color: var(--text); background: var(--hover); }

  .section-label {
    font-family: var(--mono); font-size: .62rem; text-transform: uppercase;
    letter-spacing: .09em; color: var(--faint); padding: .2rem .55rem .35rem;
  }

  .proj-pin-btn {
    background: none; border: none; cursor: pointer; padding: .15rem .35rem;
    color: var(--faint); display: flex; align-items: center; border-radius: 4px;
    opacity: .35; transition: opacity .12s, color .12s, background .12s;
    flex-shrink: 0;
  }
  .project-row:hover .proj-pin-btn { opacity: .8; }
  .proj-pin-btn:hover { opacity: 1; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .proj-pin-btn.pinned { opacity: 1; color: var(--accent); }

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
  .bottom {
    margin-top: auto; display: flex; flex-direction: column; gap: .4rem;
    padding-top: .75rem; border-top: 1px solid var(--border);
  }

  /* Icon-only rail (owner feedback, 2026-07-09): 4 buttons with text
     labels squeezed into a ~200px row wrapped/truncated unreadably.
     Tooltips (title attr) carry the label instead. */
  /* 2×2 grid (owner feedback, 2026-07-09): the earlier 1×4 icon-only row
     was too cramped for readable labels; each cell here has enough width
     to show icon + text together again without wrapping. */
  .bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: .4rem; }
  .icon-btn {
    min-width: 0; position: relative;
    display: flex; align-items: center; justify-content: center; gap: .4rem;
    background: var(--hover); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); cursor: pointer;
    color: var(--muted); padding: .5rem .4rem;
    transition: background .12s, color .12s, border-color .12s;
  }
  .icon-btn svg { flex-shrink: 0; opacity: .85; }
  .icon-btn-label {
    font-size: .72rem; font-weight: 500; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; min-width: 0;
  }
  .icon-btn:hover { background: var(--surface); color: var(--text); border-color: var(--border-strong); }

  .icon-btn-sync .sync-indicator {
    position: absolute; top: 6px; right: 6px;
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--success); box-shadow: 0 0 0 2px var(--sidebar-bg);
    transition: background .3s;
  }
  .icon-btn-sync .sync-indicator.active { background: var(--accent); }
  .icon-btn-sync .sync-indicator.error { background: var(--danger); }
  .icon-btn-sync .sync-indicator.offline { background: var(--faint); }
  .conflict-badge {
    position: absolute; top: -2px; right: -2px;
    color: #fff; font-family: var(--mono); font-size: .55rem; font-weight: 700;
    min-width: 13px; height: 13px; border-radius: 7px; padding: 0 3px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 2px var(--sidebar-bg);
    background: var(--due-soon-ink);
  }
  .icon-btn-count { color: var(--faint); font-weight: 400; }

  @media (max-width: 768px) {
    .proj-delete-btn { opacity: .7; }
    .proj-pin-btn:not(.pinned) { opacity: .7; }
  }

  /* Short viewports (landscape phone) — the project tree is the primary
     navigation surface and was getting squeezed to an unusable sliver
     while the less-essential Recent list kept its full size (real bug,
     owner-reported 2026-07-09: "non readable sidebar" in landscape).
     Drop Recent (its content is one tap away via Focus/search anyway)
     and tighten spacing so the tree actually gets room. */
  @media (max-height: 480px) {
    .sidebar { padding-top: .7rem; padding-bottom: .7rem; gap: .2rem; }
    .recent-section { display: none; }
    .bottom { padding-top: .5rem; gap: .3rem; }
  }
</style>
