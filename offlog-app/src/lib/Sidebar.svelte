<script lang="ts">
  import { spaces, projects, activeSpaceId, activeProjectId, showError, reloadTasks } from './store';
  import db, {
    createProject, createProjectFromTemplate, deleteProject, updateProject, syncState,
    getStorageBreakdown, type StorageBreakdown, subscribe as subscribeDb,
    findProjectsByName,
  } from './db';
  import { confirmAction } from './confirm';
  import { staleHostAlert } from './discovery';
  import { fmtLastSynced } from './utils';
  import { isNativePlatform, getSyncUrl } from '../config';
  import type { TaskDoc, ProjectDoc } from './types';
  import CustomSelect from './CustomSelect.svelte';
  import { getSpaceIconSvg } from './spaceIcons';

  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  const dispatch = createEventDispatcher();

  export let showAgenda = false;
  export let showDashboard = false;
  export let showFocus = false;
  export let open = false;

  // ── Collapsible + resizable sidebar ─────────────────────────────────────
  // Per-device (localStorage), same reasoning as every other sidebar/list
  // preference in this app (expandedSpaces below, List view's saved
  // columns, etc.) — not synced, since a phone and a PC may reasonably
  // want different widths/collapse state.
  const WIDTH_KEY = 'offlog_sidebar_width';
  const COLLAPSED_KEY = 'offlog_sidebar_collapsed';
  const DEFAULT_WIDTH = 224;
  const MIN_WIDTH = 180;
  const MAX_WIDTH = 420;
  const COLLAPSED_WIDTH = 60;

  function loadWidth(): number {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    return raw >= MIN_WIDTH && raw <= MAX_WIDTH ? raw : DEFAULT_WIDTH;
  }
  let sidebarWidth = loadWidth();
  let collapsed = localStorage.getItem(COLLAPSED_KEY) === 'true';

  function toggleCollapsed() {
    collapsed = !collapsed;
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }

  // Collapse-to-rail only makes sense for the desktop persistent sidebar --
  // on mobile the sidebar is already a temporary full-width overlay drawer
  // (see the mobile media query in <style>), so shrinking it to an icon rail
  // just produces a tiny floating rail over the page with no way to reach
  // the full nav short of the same toggle. `collapsed` itself (the desktop
  // preference) stays untouched by viewport size -- only what's actually
  // rendered/toggleable is gated, so resizing back to desktop restores
  // whatever the user last chose there.
  let isMobile = false;
  function checkMobile() { isMobile = window.innerWidth <= 768; }
  onMount(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
  });
  onDestroy(() => window.removeEventListener('resize', checkMobile));
  $: effectiveCollapsed = collapsed && !isMobile;

  // Collapsed rail's icons are meant for quick glancing/switching, not full
  // project browsing — clicking a space icon there expands back to the
  // full sidebar, opens that space, and jumps straight to its first
  // project rather than expanding to an empty space header the user then
  // has to click into again.
  //
  // `expanding` holds the rail's icons in a fading/lifting state (see
  // .sidebar.expanding in <style>) for one width-transition's worth of
  // time before the collapsed→expanded content swap, so the rail visibly
  // opens instead of teleporting. Flipping `collapsed` directly snaps the
  // width with no transition at all.
  let expanding = false;
  function expandToSpace(spaceId: string) {
    expanding = true;
    window.setTimeout(() => {
      collapsed = false;
      localStorage.setItem(COLLAPSED_KEY, 'false');
      if (!expandedSpaces.has(spaceId)) toggleSpaceExpand(spaceId);
      const firstProject = projectsForSpace(spaceId, $projects)[0];
      if (firstProject) goToProject(firstProject);
      expanding = false;
    }, 200);
  }

  // Drag-to-resize the width itself. mousemove/mouseup listen on the
  // window (not just the handle) so the drag keeps tracking even if the
  // cursor briefly leaves the thin handle strip mid-drag — a plain
  // on:mousemove on the handle alone would drop the drag the instant the
  // pointer moves off that 4px-wide element.
  let resizing = false;
  function onResizeStart(e: MouseEvent) {
    resizing = true;
    e.preventDefault();
  }
  function onResizeMove(e: MouseEvent) {
    if (!resizing) return;
    sidebarWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
  }
  function onResizeEnd() {
    if (!resizing) return;
    resizing = false;
    localStorage.setItem(WIDTH_KEY, String(sidebarWidth));
  }

  // Settings' own Escape handling (including its mobile back-vs-close
  // distinction) lives in SettingsPanel.svelte. The mobile drawer's Escape
  // handling lives in App.svelte's onKeydown, alongside its back-button
  // routing (closeSidebar) — the drawer's `open` state is bound two-way
  // from there, and closing it needs to go through that same routing
  // (see modalStack.ts), not set `open = false` directly
  // here, which would desync the pushed history entry from what's visible.

  let showTimeTravel = false;
  let showSettings = false;
  let syncStatus = syncState.status;
  let lastSynced = syncState.lastSynced;
  let syncError = syncState.error;
  let retryCount = syncState.retryCount;
  let conflictCount = syncState.conflictCount;
  let newProjectName = '';
  let addingProjectFor: string | null = null;
  // Duplicate-name nudge — never blocks creation, just a hint dismissed
  // by typing something else. Checked
  // on every keystroke rather than debounced: findProjectsByName() is a
  // single in-memory array scan (getProjects() is already cached-cheap
  // at this app's scale), not worth debouncing.
  let duplicateProjectHint = '';
  async function checkProjectNameDuplicate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) { duplicateProjectHint = ''; return; }
    const matches = await findProjectsByName(trimmed);
    if (!matches.length) { duplicateProjectHint = ''; return; }
    const spaceNames = matches.map(p => $spaces.find(s => s._id === p.space_id)?.name ?? 'another space');
    duplicateProjectHint = `A project named "${trimmed}" already exists in ${[...new Set(spaceNames)].join(', ')}.`;
  }
  // Template mode is a separate explicit step (not folded into the
  // blur-to-submit input above) — the template CustomSelect's own click
  // would otherwise blur the name input and prematurely submit a blank
  // project before the user picks a template.
  let templateMode = false;
  let templateProjectId = '';
  let copyOpenTasks = false;

  // TimeTravelView/TrashView/SettingsPanel are full separate screens only
  // opened from these buttons — loading them as dynamic imports keeps them
  // out of the main bundle.
  //
  // Each has an *active* flag, not just the showX boolean the {#if} reads.
  // active goes true the instant the button is clicked and only goes false
  // once the component has actually finished closing (its on:close fired,
  // meaning modalStack's popstate round-trip resolved) -- opening is
  // refused entirely while active is true, even though showX itself would
  // briefly go false-then-true-again under rapid clicking. Without this,
  // clicking the button again while a close is still in flight (its
  // history.back() hasn't resolved yet) could mount a second instance
  // before Svelte finished tearing down the first: two overlapping
  // scrim/panel elements briefly coexist, and if the stale one intercepts
  // a later click (document.querySelector always finds the first match),
  // its own requestClose() fires an extra history.back() beyond what the
  // live instance needed -- draining real browser history faster than
  // legitimate opens replenish it. Once history bottoms out, back() stops
  // firing popstate at all (browsers silently no-op there), and the
  // instance still waiting on that never-arriving popstate is stuck open
  // forever with no working close control — a lingering opacity:0 scrim +
  // panel that neither Escape, a scrim click, nor a manual history.back()
  // can dismiss. Refusing to open a second instance until the first is
  // fully gone makes that overlap impossible rather than trying to
  // reconcile it afterwards.
  let TimeTravelViewComp: typeof import('./TimeTravelView.svelte').default | null = null;
  let timeTravelActive = false;
  let timeTravelSession = 0;
  // export, not just a plain top-level function: App.svelte calls these
  // via sidebarRef.openTimeTravel()/openTrash()/openSettings() (bound
  // through bind:this for the keyboard-shortcut/command-palette paths,
  // not the on-screen buttons below which call them directly). Svelte 5
  // does not expose a component's plain top-level functions through
  // bind:this the way Svelte 3/4 did -- without export, sidebarRef.
  // openTimeTravel is undefined and calling it throws, caught nowhere,
  // so Ctrl+K's "Open Time Travel"/"Open Settings"/"Open Deleted" would
  // silently do nothing.
  export async function openTimeTravel() {
    if (timeTravelActive) return;
    timeTravelActive = true;
    try {
      if (!TimeTravelViewComp) TimeTravelViewComp = (await import('./TimeTravelView.svelte')).default;
      timeTravelSession++;
      showTimeTravel = true;
    } catch (e) {
      timeTravelActive = false;
      showError('Failed to open Time Travel. Please try again.');
    }
  }
  function onTimeTravelClosed() { showTimeTravel = false; timeTravelActive = false; }

  let showTrash = false;
  let TrashViewComp: typeof import('./TrashView.svelte').default | null = null;
  let trashActive = false;
  let trashSession = 0;
  export async function openTrash() {
    if (trashActive) return;
    trashActive = true;
    try {
      if (!TrashViewComp) TrashViewComp = (await import('./TrashView.svelte')).default;
      trashSession++;
      showTrash = true;
    } catch (e) {
      trashActive = false;
      showError('Failed to open Recycle. Please try again.');
    }
  }
  function onTrashClosed() { showTrash = false; trashActive = false; }

  let SettingsPanelComp: typeof import('./SettingsPanel.svelte').default | null = null;
  let settingsActive = false;
  let settingsSession = 0;
  let settingsInitialCategory: 'sync' | null = null;
  export async function openSettings(initialCategory: 'sync' | null = null) {
    if (settingsActive) return;
    settingsActive = true;
    try {
      if (!SettingsPanelComp) SettingsPanelComp = (await import('./SettingsPanel.svelte')).default;
      settingsInitialCategory = initialCategory;
      settingsSession++;
      showSettings = true;
    } catch (e) {
      settingsActive = false;
      showError('Failed to open Settings. Please try again.');
    }
  }
  function onSettingsClosed() { showSettings = false; settingsActive = false; }

  // Storage breakdown — just for the "Deleted N" count badge in the bottom
  // nav row. Kept live (not just loaded when Settings opens) so the badge
  // stays accurate as tasks get deleted/restored anywhere in the app.
  // SettingsPanel loads its own copy for the Data tab — cheap query, not
  // worth threading through props/events to share one instance.
  let breakdown: StorageBreakdown | null = null;
  async function loadBreakdown() { breakdown = await getStorageBreakdown(); }
  onMount(() => {
    loadBreakdown();
    return subscribeDb(() => { loadBreakdown(); });
  });

  // A mobile-only user who has never paired a PC host structurally can't
  // sync yet -- there's no URL to retry against, so the sync button would
  // be a silent no-op. Scoped to native/Android only: desktop web's
  // DEFAULT_SYNC_URL always resolves to a real, potentially-working
  // loopback address even before any explicit setup (see config.ts), so
  // "no URL configured yet" isn't a meaningful signal there the way it
  // is on native. Re-checked on every sync-state change (not just once)
  // so the button switches back the moment pairing succeeds and
  // startSync() fires its first status update.
  let syncNotConfigured = isNativePlatform() && !getSyncUrl();

  function onSyncChange() {
    syncStatus = syncState.status;
    lastSynced = syncState.lastSynced;
    syncError = syncState.error;
    retryCount = syncState.retryCount;
    conflictCount = syncState.conflictCount;
    syncNotConfigured = isNativePlatform() && !getSyncUrl();
  }
  syncState.listeners.add(onSyncChange);
  onDestroy(() => syncState.listeners.delete(onSyncChange));

  // Sync status is icon-only in the footer -- the full message lives in
  // this tooltip; only the icon's own glow (see .icon-btn-sync.* below)
  // is visible without hovering.
  $: syncTooltip = $staleHostAlert
    ? `Paired host not found — a different Offlog host ("${$staleHostAlert.name}") is on this network. Re-pair from Settings → Sync.`
    : syncStatus === 'offline' ? 'Offline — will retry when back online'
    : syncStatus === 'syncing' ? 'Syncing…'
    : syncStatus === 'error' ? (syncError ?? 'Sync error') + (retryCount > 1 ? ` (retry ${retryCount})` : '')
    : lastSynced ? `Synced ${fmtLastSynced(lastSynced)}` : 'Not synced yet';

  // Status color for the sync icon: green synced, red error, accent
  // syncing, amber conflicts. Mutually exclusive by construction (a
  // single derived value, not several independently-toggled classes) so
  // there's never ambiguity about which color wins when more than one
  // condition is true at once -- most urgent first: an
  // actual error beats "in progress", which beats a conflict needing
  // attention, which beats plain offline, which beats the default
  // all-clear green.
  $: syncGlowState = syncStatus === 'error' ? 'error'
    : syncStatus === 'syncing' ? 'syncing'
    : conflictCount > 0 || $staleHostAlert ? 'conflict'
    : syncStatus === 'offline' ? 'offline'
    : 'synced';

  // Pinned projects float to the top, same convention as
  // TaskDoc.pinned elsewhere in the app — otherwise stable in whatever
  // order getProjects() already returns (by position).
  function projectsForSpace(spaceId: string, all: ProjectDoc[]): ProjectDoc[] {
    return all.filter(p => p.space_id === spaceId).sort((a, b) => (!!b.pinned) === (!!a.pinned) ? 0 : b.pinned ? 1 : -1);
  }

  // Spaces + Projects are one collapsible tree, not two flat lists.
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
  // check.
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
    showAgenda = false; showDashboard = false; showFocus = false;
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

  // Escape's keydown handler calls closeAddProject(), but Escape also
  // blurs the input in some browsers, and blur fires its own
  // doAddProject() independently -- whichever runs first, the other still
  // runs after, so "Escape to cancel" would still create the project.
  // Set synchronously in the Escape handler before closeAddProject()
  // runs, and checked by the blur handler, so a cancel always wins.
  let cancellingAddProject = false;

  async function doAddProject(spaceId: string) {
    if (cancellingAddProject) return;
    const name = newProjectName.trim();
    if (!name) { closeAddProject(); return; }
    if (templateMode && !templateProjectId) return; // Create button is disabled for this case too; belt and suspenders
    try {
      if (templateMode) {
        await createProjectFromTemplate(spaceId, name, templateProjectId, copyOpenTasks);
      } else {
        await createProject(spaceId, name);
      }
      newProjectName = '';
    } catch {
      showError('Failed to create project. Please try again.');
    }
    closeAddProject();
  }

  function closeAddProject() {
    duplicateProjectHint = '';
    addingProjectFor = null;
    templateMode = false;
    templateProjectId = '';
    copyOpenTasks = false;
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

  // Per-space icon choice — see spaceIcons.ts for the picker options, the
  // legacy per-id fallback (pre-existing databases), and the default.
</script>

<svelte:window on:mousemove={onResizeMove} on:mouseup={onResizeEnd} />

<aside
  class="sidebar"
  class:mobile-open={open}
  class:collapsed={effectiveCollapsed}
  class:resizing
  class:expanding
  style="--sidebar-w: {(!effectiveCollapsed || expanding) ? sidebarWidth : COLLAPSED_WIDTH}px"
>
  <div class="sidebar-top">
    {#if !effectiveCollapsed}<div class="logo">Offlog</div>{/if}
    {#if !isMobile}
    <button class="collapse-toggle" on:click={toggleCollapsed} title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      <!-- Two literal icon variants, not one icon rotated: the panel
           glyph's chevron has to flip sides, not just point the other
           way. -->
      {#if effectiveCollapsed}
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2.5" width="12" height="11" rx="2"/>
          <line x1="6.5" y1="2.5" x2="6.5" y2="13.5"/>
          <polyline points="3.7,6.3 5.3,8 3.7,9.7"/>
        </svg>
      {:else}
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2.5" width="12" height="11" rx="2"/>
          <line x1="6.5" y1="2.5" x2="6.5" y2="13.5"/>
          <polyline points="5.3,6.3 3.7,8 5.3,9.7"/>
        </svg>
      {/if}
    </button>
    {/if}
  </div>

  <!-- Each of these three buttons must also clear activeProjectId: none
       of these views is "inside" a project, and leaving it set keeps
       .project-row.active (below) highlighting a stale project as
       "current". -->
  <nav class="primary-nav">
    <button
      class="nav-btn"
      class:active={showDashboard}
      title="Dashboard"
      on:click={() => { showDashboard = true; showAgenda = false; showFocus = false; activeProjectId.set(''); dispatch('navigate'); }}
    >
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
        <rect x="2" y="2" width="6" height="6" rx="1"/>
        <rect x="10" y="2" width="6" height="6" rx="1"/>
        <rect x="2" y="10" width="6" height="6" rx="1"/>
        <rect x="10" y="10" width="6" height="6" rx="1"/>
      </svg>
      {#if !effectiveCollapsed}Dashboard{/if}
    </button>

    <button
      class="nav-btn"
      class:active={showFocus}
      title="Focus"
      on:click={() => { showFocus = true; showDashboard = false; showAgenda = false; activeProjectId.set(''); dispatch('navigate'); }}
    >
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
        <circle cx="9" cy="9" r="7"/>
        <circle cx="9" cy="9" r="3.5"/>
        <circle cx="9" cy="9" r="0.6" fill="currentColor"/>
      </svg>
      {#if !effectiveCollapsed}Focus{/if}
    </button>

    <button
      class="nav-btn"
      class:active={showAgenda}
      title="Agenda"
      on:click={() => { showAgenda = true; showDashboard = false; showFocus = false; activeProjectId.set(''); dispatch('navigate'); }}
    >
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
        <rect x="2" y="3" width="14" height="12" rx="2"/>
        <line x1="2" y1="7" x2="16" y2="7"/>
        <line x1="6" y1="1.5" x2="6" y2="4.5"/>
        <line x1="12" y1="1.5" x2="12" y2="4.5"/>
        <line x1="6" y1="11" x2="12" y2="11"/>
      </svg>
      {#if !effectiveCollapsed}Agenda{/if}
    </button>
  </nav>
  <div class="spaces-divider"></div>

  {#if effectiveCollapsed}
    <!-- Collapsed rail: space icons only, no project tree -- it is for
         quick glancing/switching, not full browsing. Clicking a space
         expands back to the full sidebar (expandToSpace() above) rather
         than trying to cram a project flyout into 60px. -->
    <div class="tree-section-collapsed">
      {#each $spaces as space (space._id)}
        <button
          class="space-icon-only"
          class:active={$activeSpaceId === space._id}
          style="color:{space.color}; background:color-mix(in srgb, {space.color} 18%, transparent)"
          title={space.name}
          on:click={() => expandToSpace(space._id)}
        >
          {@html getSpaceIconSvg(space)}
        </button>
      {/each}
    </div>
  {:else}
  <div class="tree-section">
    {#each $spaces as space (space._id)}
      {@const spaceOpen = expandedSpaces.has(space._id)}
      {@const spProjects = projectsForSpace(space._id, $projects)}
      <div class="space-group">
        <button class="space-header" class:active={$activeSpaceId === space._id} on:click={() => toggleSpaceExpand(space._id)} aria-expanded={spaceOpen}>
          <svg class="space-chevron" class:open={spaceOpen} viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,1 7,5 2,9"/>
          </svg>
          <!-- Deliberately a lighter fill than the collapsed rail's
               space-icon-only: that one needs more contrast against the
               bare rail, this one only has to distinguish spaces by
               color without adding visual noise to the tree. -->
          <span class="space-icon" style="color:{space.color}; background:color-mix(in srgb, {space.color} 12%, transparent)">
            {@html getSpaceIconSvg(space)}
          </span>
          <span class="space-name">{space.name}</span>
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
              <div class="new-project-form">
                <!-- svelte-ignore a11y-autofocus -->
                <input autofocus class="new-project-input" bind:value={newProjectName}
                  placeholder="Project name…"
                  enterkeyhint="done"
                  on:input={() => checkProjectNameDuplicate(newProjectName)}
                  on:keydown={(e) => { if (e.key === 'Enter') doAddProject(space._id); if (e.key === 'Escape') { cancellingAddProject = true; closeAddProject(); } }}
                  on:blur={() => { if (!templateMode) doAddProject(space._id); }}
                  on:focus={(e) => {
                    // The on-screen keyboard can leave this input scrolled
                    // out of view within the narrow sidebar drawer,
                    // especially in landscape where the keyboard eats a much
                    // bigger share of the already-short viewport. Delayed
                    // past one frame so this runs
                    // after adjustResize has actually finished shrinking the
                    // layout viewport -- scrolling immediately on focus races
                    // that resize and can measure the pre-keyboard geometry.
                    const el = e.currentTarget as HTMLElement;
                    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
                  }}
                />
                {#if duplicateProjectHint}<p class="dup-name-hint">{duplicateProjectHint}</p>{/if}
                {#if !templateMode}
                  {#if $projects.length > 0}
                    <!-- mousedown|preventDefault: clicking this must not blur the name
                         input first — a plain click blurs (submitting a blank project
                         via the input's on:blur) before this button's on:click even
                         fires, since blur precedes click in the browser's event order. -->
                    <button type="button" class="template-toggle" on:mousedown|preventDefault on:click={() => templateMode = true}>Use a template…</button>
                  {/if}
                {:else}
                  <CustomSelect
                    options={$projects.map(p => ({ value: p._id, label: p.name }))}
                    bind:value={templateProjectId}
                    placeholder="Copy status structure from…"
                  />
                  <label class="template-checkbox">
                    <input type="checkbox" bind:checked={copyOpenTasks} />
                    Also copy open tasks
                  </label>
                  <div class="template-actions">
                    <button type="button" on:mousedown|preventDefault on:click={closeAddProject}>Cancel</button>
                    <button type="button" class="template-create-btn" disabled={!templateProjectId} on:mousedown|preventDefault on:click={() => doAddProject(space._id)}>Create</button>
                  </div>
                {/if}
              </div>
            {:else}
              <button class="add-project-btn" on:click={() => { addingProjectFor = space._id; newProjectName = ''; cancellingAddProject = false; }}>+ New project</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
  {/if}

  <div class="bottom">
    <!-- Icon-only, one row, no text labels -- title attrs carry the
         label via tooltip, same pattern as the collapsed rail. The
         tooltip is the only place syncTooltip and the deleted count
         show, so they must stay folded into the title text below. -->
    <div class="bottom-row" class:bottom-row-collapsed={effectiveCollapsed}>
      <button class="icon-btn" on:click={() => { openTimeTravel(); dispatch('navigate'); }} title="Time Travel">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 8a6 6 0 1 1 1.8 4.3"/><polyline points="2,4 2,8 6,8"/><polyline points="8,5 8,8.5 10.5,10"/>
        </svg>
      </button>
      <button class="icon-btn" on:click={() => { openTrash(); dispatch('navigate'); }} title="Recycle{breakdown && breakdown.deletedTasks > 0 ? ` (${breakdown.deletedTasks})` : ''}">
        <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4h10M5.5 4V2.5h3V4M3 4l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L11 4"/>
        </svg>
      </button>
      <button class="icon-btn" on:click={() => { openSettings(); dispatch('navigate'); }} title="Settings">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
      {#if !syncNotConfigured}
        <!-- A device that's never been paired has no status and no
             action worth a standing button, so the row stays a compact 3
             buttons rather than a 4th saying "not set up yet". Sync setup
             happens via the post-first-run invite (NamePrompt.svelte) or
             Settings → Sync, never a permanent footer slot.
             Clicking opens Settings' Sync category rather than syncing
             directly; "Sync now" lives inside that panel. -->
        <button
          class="icon-btn icon-btn-sync"
          class:sync-synced={syncGlowState === 'synced'}
          class:sync-syncing={syncGlowState === 'syncing'}
          class:sync-error={syncGlowState === 'error'}
          class:sync-conflict={syncGlowState === 'conflict'}
          class:sync-offline={syncGlowState === 'offline'}
          on:click={() => { openSettings('sync'); dispatch('navigate'); }}
          title={syncTooltip}
        >
          <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9a6 6 0 0 1 10.2-4.2M15 9a6 6 0 0 1-10.2 4.2"/><polyline points="13,1.5 13.2,4.8 9.9,5"/><polyline points="5,16.5 4.8,13.2 8.1,13"/>
          </svg>
          {#if conflictCount > 0}<span class="conflict-badge">{conflictCount}</span>{/if}
          {#if $staleHostAlert}<span class="conflict-badge stale-host-badge">!</span>{/if}
        </button>
      {/if}
    </div>
  </div>

  {#if !effectiveCollapsed}
    <!-- Drag-to-resize. Hidden entirely on mobile via the media query
         below -- the mobile drawer is a fixed-width overlay, not a
         resizable column. -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="resize-handle" on:mousedown={onResizeStart}></div>
  {/if}
</aside>

{#if showTimeTravel && TimeTravelViewComp}
  <!-- {#key}, not just the showTimeTravel boolean: without it, a fast
       close-then-reopen can land while Svelte's outro transition for the
       previous show is still in flight, and Svelte *reverses* that outro
       into a fresh intro on the SAME component instance instead of
       destroying and recreating it. timeTravelActive above doesn't cover
       this: it only stops a second *attempt* from starting, not Svelte
       reviving the still-alive instance. A revived instance never
       re-runs its own closeOnBack() call (that only happens once, at
       component setup) -- its `requestClose` is the original, already
       spent one, and no new stack entry exists for it either: nothing
       can ever close it again. timeTravelSession increments on every
       real open, forcing Svelte to always fully tear down and remount
       rather than ever reuse a mid-transition instance. -->
  {#key timeTravelSession}
    <svelte:component this={TimeTravelViewComp} on:close={onTimeTravelClosed} />
  {/key}
{/if}

{#if showTrash && TrashViewComp}
  {#key trashSession}
    <svelte:component this={TrashViewComp} on:close={onTrashClosed} />
  {/key}
{/if}

{#if showSettings && SettingsPanelComp}
  {#key settingsSession}
    <svelte:component this={SettingsPanelComp} initialCategory={settingsInitialCategory} on:close={onSettingsClosed} />
  {/key}
{/if}

<style>
  /* width driven by --sidebar-w (set inline from sidebarWidth/
     COLLAPSED_WIDTH in script) rather than a literal value here, so the
     collapse/resize feature can vary it -- the mobile media query below
     still overrides it back to a literal 280px when it matches, since a
     same-specificity rule declared later in the stylesheet wins the
     cascade regardless of which side uses a var(). */
  .sidebar {
    width: var(--sidebar-w, 224px); flex-shrink: 0; position: relative;
    background: var(--sidebar-bg); border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 1.1rem .75rem; gap: .35rem; overflow: hidden;
    /* Follows the page theme via --sidebar-bg (light/dark in app.css) —
       never pin this dark regardless of theme. */
    /* Width transition animates collapse/expand. Suppressed during an
       actual drag (.resizing) so live resizing stays 1:1 with the cursor
       instead of lagging behind it. */
    transition: width var(--dur-medium) var(--ease-standard);
  }
  .sidebar.resizing { transition: none; }
  .sidebar.collapsed { padding-left: .4rem; padding-right: .4rem; }

  /* Second condition covers a phone rotated to landscape -- its width
     alone often exceeds 768px (e.g. ~915px on a Pixel-class phone), which
     used to fall through to the "desktop" always-visible sidebar and eat
     a big chunk of the already-short landscape height with no way to
     hide it. max-height catches "phone in
     landscape" without also matching a genuinely short desktop window. */
  @media (max-width: 768px), (max-height: 500px) and (orientation: landscape) {
    .sidebar {
      position: fixed; top: 0; left: 0; bottom: 0; z-index: 200;
      width: 280px;
      padding-top: calc(1.1rem + env(safe-area-inset-top, 0px));
      transform: translateX(-100%);
      /* The base rule is the CLOSED state, so it carries the LEAVING curve
         and duration; .mobile-open below carries the entering pair. A single
         CSS transition cannot differ by direction, and closing on the
         decelerate curve made the drawer drift out instead of clearing.

         box-shadow is in both lists on purpose: without it a 40px black
         shadow appeared at full strength while the panel was still entirely
         off screen. visibility is in both too -- it steps discretely, so it
         flips at t=0+ going in and t=1 coming out, which is what keeps a
         closed drawer out of the tab order. Neither is decorative; don't
         tidy them out. */
      transition: transform var(--dur-large-out) var(--ease-accelerate),
                  visibility var(--dur-large-out),
                  box-shadow var(--dur-large-out) var(--ease-accelerate);
      will-change: transform;
      box-shadow: none;
      visibility: hidden;
    }
    .sidebar.mobile-open {
      transform: translateX(0);
      box-shadow: 8px 0 40px rgba(0,0,0,.45);
      visibility: visible;
      transition: transform var(--dur-large) var(--ease-decelerate),
                  visibility var(--dur-large),
                  box-shadow var(--dur-large) var(--ease-decelerate);
    }
  }
  /* Keep this padding symmetric: a lopsided bottom value shifts the box's
     own vertical center down, and align-items:center on .sidebar-top then
     renders the logo lower than the collapse toggle beside it. The
     breathing room before the nav lives on .sidebar-top's padding-bottom
     instead. */
  .logo {
    font-family: var(--mono); font-weight: 600; font-size: .68rem; text-transform: uppercase;
    letter-spacing: .14em; padding: .1rem .35rem; color: var(--faint);
  }

  .sidebar-top { display: flex; align-items: center; justify-content: space-between; padding-bottom: .6rem; }
  .sidebar.collapsed .sidebar-top { justify-content: center; }
  /* Ghost-until-hover in expanded mode, since it sits next to plain text
     (the logo) rather than the boxed icons the collapsed rail has. */
  .collapse-toggle {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; flex-shrink: 0;
    background: none; border: 1px solid transparent; cursor: pointer;
    color: var(--faint); border-radius: var(--radius-sm);
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), border-color var(--dur-hover) var(--ease-hover);
  }
  .collapse-toggle:hover { background: var(--hover); color: var(--text); border-color: var(--border-strong); }
  /* Collapsed mode gives this the same box treatment and 32px size as
     .nav-btn/.icon-btn -- a differently-sized ghost button reads as a
     fourth visual language next to the uniform boxes below it. */
  .sidebar.collapsed .collapse-toggle {
    width: 32px; height: 32px;
    background: var(--hover); border: 1px solid transparent; border-radius: 8px;
  }
  .sidebar.collapsed .collapse-toggle:hover {
    background: var(--surface); border-color: var(--border-strong);
  }

  /* Every icon in the rail carries an always-visible box, matching the
     always-boxed space icons below; transparent-until-hover leaves the
     rail reading as several competing visual languages. This background
     stays a low layer so each control's own active/status color (accent
     tint, sync-error red) layers on top rather than competing on
     specificity. Only .nav-btn needs a collapsed-only override, since it
     shows full text when expanded and is icon-only only here. */
  .sidebar.collapsed .nav-btn {
    width: 32px; height: 32px; padding: 0;
    border-radius: 8px; justify-content: center;
    background: var(--hover); border: 1px solid transparent;
  }
  .sidebar.collapsed .nav-btn:hover {
    background: var(--surface); border-color: var(--border-strong);
  }
  /* .nav-btn.active's background (var(--hover)) is identical to every
     collapsed icon's resting background above, and labels are hidden when
     collapsed, so icon color is the only signal left in a 32px icon-only
     box -- hence the accent tint here specifically. Expanded mode still
     relies on background + bold text. */
  .sidebar.collapsed .nav-btn.active { color: var(--accent); }

  /* flex:1 + justify-content:center puts the spaces column in the
     vertical middle of the rail, with the footer landing at the true
     bottom. Sizing to content (flex: 0 1 auto) instead leaves the
     leftover rail height as dead space above the footer. */
  .tree-section-collapsed {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .4rem;
    padding-top: .5rem; flex: 1 1 auto; min-height: 0; overflow-y: auto;
    transition: opacity var(--dur-small) var(--ease-standard), transform var(--dur-small) var(--ease-standard);
  }
  /* Clicking a space icon holds the rail in this lifted/faded state (see
     expandToSpace()'s `expanding` flag) for one width-transition's worth
     of time before swapping to the full tree, so the two states stay
     visually connected instead of teleporting. */
  .sidebar.expanding .tree-section-collapsed { opacity: 0; transform: translateY(-14px); }
  .space-icon-only {
    width: 32px; height: 32px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px; cursor: pointer;
    /* A real border, not just a tinted background: with only a
       translucent fill a light/neutral space color (the default gray)
       nearly vanishes against the sidebar background. */
    border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    opacity: .8; transition: opacity var(--dur-hover) var(--ease-hover), box-shadow var(--dur-hover) var(--ease-hover);
  }
  .space-icon-only :global(svg) { width: 15px; height: 15px; }
  .space-icon-only:hover, .space-icon-only.active { opacity: 1; box-shadow: 0 1px 3px rgba(0,0,0,.1); }

  /* Thin drag strip along the sidebar's own right edge -- absolutely
     positioned so it doesn't take up any layout space of its own (the
     border-right the sidebar already has is purely visual, 1px, so this
     needs a slightly wider invisible hit target overlapping it). The
     small always-visible grip mark is the affordance -- don't make it
     invisible until hovered. */
  .resize-handle {
    position: absolute; top: 0; right: -3px; bottom: 0; width: 6px;
    cursor: col-resize; z-index: 5;
    display: flex; align-items: center; justify-content: center;
  }
  .resize-handle::before {
    content: ''; width: 3px; height: 28px; border-radius: 3px;
    background: var(--border-strong); opacity: .6;
    transition: opacity var(--dur-hover) var(--ease-hover), background var(--dur-hover) var(--ease-hover);
  }
  .resize-handle:hover, .resize-handle:active { background: color-mix(in srgb, var(--text) 8%, transparent); }
  .resize-handle:hover::before, .resize-handle:active::before { opacity: 1; background: var(--muted); }
  @media (max-width: 768px), (max-height: 500px) and (orientation: landscape) {
    .resize-handle { display: none; }
  }

  /* Primary nav (Dashboard/Focus/Agenda) — same light, border-free visual
     language as .space-header below rather than 3 separately-bordered pills;
     unifying the two reduces both height per row and competing visual
     weight at the top of the sidebar. */
  .primary-nav { display: flex; flex-direction: column; gap: .1rem; }
  /* .nav-btn is width:100% by default, so align-items:center is a no-op
     there -- but once collapsed mode fixes it to a fixed size (below), a
     flex column's default cross-axis alignment is flex-start, leaving the
     fixed-width boxes stuck against the left edge instead of centered
     under the (centered) collapse toggle above them. */
  /* The three collapsed icon groups (nav/spaces/footer) share one .4rem
     gap -- keep them in step if any one of them changes. */
  .sidebar.collapsed .primary-nav { align-items: center; gap: .4rem; }
  .nav-btn {
    display: flex; align-items: center; gap: .6rem;
    width: 100%; border: none; cursor: pointer; text-align: left;
    padding: .42rem .55rem; border-radius: var(--radius-sm);
    background: none; color: var(--muted);
    font-weight: 600; font-size: .85rem; letter-spacing: -.01em;
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), box-shadow var(--dur-hover) var(--ease-hover);
  }
  .nav-btn svg { flex-shrink: 0; opacity: .85; }
  /* Subtle hover shadow, not just a flat background swap -- same
     treatment on .space-header and .project-row below. */
  .nav-btn:hover { background: var(--hover); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.07); }
  /* Needs an actual fill: a text-only active state disappears in
     practice. var(--hover) is the same flat neutral tint this row's
     :hover already uses, made permanent -- lighter than
     .project-row.active's bordered card, but still visible. */
  .nav-btn.active { background: var(--hover); color: var(--text); font-weight: 700; }
  .nav-btn.active svg { opacity: 1; }

  .spaces-divider { height: 1px; background: var(--border); margin: .5rem 0; }
  /* A full-width line reads heavier in the narrow 60px rail than in the
     full sidebar, so the collapsed divider is a short centered tick. */
  .sidebar.collapsed .spaces-divider { width: 20px; margin: .5rem auto; }

  /* Spaces + Projects are one collapsible tree: each space is a
     collapsible group and its projects nest directly underneath, rather
     than a second separately-labeled list below a divider. */
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
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), box-shadow var(--dur-hover) var(--ease-hover);
  }
  .space-header:hover { background: var(--hover); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.07); }
  /* Active space is marked by color plus weight, with no fill, border or
     new color: the same color bump :hover gets, made permanent. Color
     alone is too subtle to spot at a glance, hence .space-name's 700
     weight as a second cue. */
  .space-header.active { color: var(--text); }
  .space-header.active .space-name { font-weight: 700; }
  .space-chevron { flex-shrink: 0; color: var(--faint); transition: transform var(--dur-small) var(--ease-standard), color var(--dur-hover) var(--ease-hover); }
  .space-chevron.open { transform: rotate(90deg); }
  .space-icon {
    width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 7px;
  }
  .space-icon :global(svg) { width: 13px; height: 13px; }
  .space-name { font-size: .84rem; font-weight: 600; flex: 1; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .space-projects {
    display: flex; flex-direction: column; gap: .02rem;
    padding: .1rem 0 .3rem 1.55rem;
  }

  /* opacity 0 at rest: these reveal on row hover, as in most list UIs. A
     pinned project still shows its pin permanently via .pinned below,
     since that state is meaningful without hovering. Desktop only -- the
     touch-device media query further down forces them visible, since
     there's no hover to reveal them on a phone. */
  .proj-pin-btn {
    background: none; border: none; cursor: pointer; padding: .15rem .35rem;
    color: var(--faint); display: flex; align-items: center; border-radius: 4px;
    opacity: 0; transition: opacity var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), background var(--dur-hover) var(--ease-hover);
    flex-shrink: 0;
  }
  .project-row:hover .proj-pin-btn { opacity: .8; }
  .proj-pin-btn:hover { opacity: 1; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .proj-pin-btn.pinned { opacity: 1; color: var(--accent); }

  .project-row {
    display: flex; align-items: center;
    border-radius: var(--radius-sm);
    padding-right: .3rem;
    transition: background var(--dur-hover) var(--ease-hover), box-shadow var(--dur-hover) var(--ease-hover);
  }
  .project-row:hover { background: var(--hover); box-shadow: 0 1px 3px rgba(0,0,0,.07); }
  /* A var(--surface) card needs an explicit border: --surface and
     --sidebar-bg have a near-zero lightness gap in light mode, so the
     card is otherwise invisible there. Kept at var(--border) with a light
     shadow so it doesn't become the boldest thing in the tree. */
  .project-row.active {
    background: var(--surface); border: 1px solid var(--border);
    box-shadow: 0 1px 2px rgba(0,0,0,.05);
  }

  .project-btn {
    flex: 1; background: none; border: none; cursor: pointer;
    padding: .38rem .55rem; color: var(--muted); font-size: .85rem;
    text-align: left; transition: color var(--dur-hover) var(--ease-hover);
  }
  .project-row.active .project-btn { color: var(--text); font-weight: 600; }
  .project-row:hover .project-btn { color: var(--text); }

  .proj-delete-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; padding: .15rem .35rem;
    border-radius: 4px;
    opacity: 0; transition: opacity var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), background var(--dur-hover) var(--ease-hover);
    line-height: 1;
  }
  .project-row:hover .proj-delete-btn { opacity: 1; }
  .proj-delete-btn:hover { color: var(--danger); opacity: 1; background: color-mix(in srgb, var(--danger) 12%, transparent); }

  .new-project-form { display: flex; flex-direction: column; gap: 6px; }
  .new-project-input {
    padding: .35rem .55rem; font-size: .85rem;
    border: 1.5px solid var(--accent); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); width: 100%;
  }
  .new-project-input:focus { outline: none; }
  .dup-name-hint { font-size: .72rem; color: var(--due-soon-ink); margin: 0; line-height: 1.3; }

  .template-toggle {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: .76rem; text-align: left; padding: 0 .1rem;
    transition: color var(--dur-hover) var(--ease-hover);
  }
  .template-toggle:hover { color: var(--accent); }
  .template-checkbox {
    display: flex; align-items: center; gap: 6px;
    font-size: .78rem; color: var(--muted); cursor: pointer; padding: 0 .1rem;
  }
  .template-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .template-actions button {
    padding: .3rem .6rem; font-size: .78rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); cursor: pointer;
  }
  .template-create-btn {
    background: var(--accent); color: var(--on-accent); border-color: var(--accent);
  }
  .template-create-btn:disabled { opacity: .5; cursor: default; }

  /* Accent-colored, not --faint/--muted: anything dimmer blends into the
     project rows above, which are --muted themselves. An accent "+ Add"
     CTA marks an action to take, unlike the neutral fills used elsewhere
     in this tree to mark passive "current state". */
  .add-project-btn {
    background: none; border: none; cursor: pointer;
    color: var(--accent); font-size: .82rem; font-weight: 500; text-align: left;
    padding: .4rem .55rem; transition: color var(--dur-hover) var(--ease-hover);
  }
  .add-project-btn:hover { color: var(--text); }

  /* Bottom */
  .bottom {
    margin-top: auto; display: flex; flex-direction: column; gap: .3rem;
    padding-top: .6rem; border-top: 1px solid var(--border);
  }
  /* Same "make dividers bit small" fix as .spaces-divider above, applied
     to the footer's separator -- a full-width border-top is swapped for
     a short centered tick (via ::before, since a <border> itself can't be
     shortened without cutting the flex item's own width). */
  .sidebar.collapsed .bottom {
    border-top: none; position: relative;
  }
  .sidebar.collapsed .bottom::before {
    content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: 20px; height: 1px; background: var(--border);
  }

  /* One flex row, icon-only -- text labels wrap/truncate unreadably in a
     ~200px row, so tooltips (title attr) carry them.
     justify-content:center, not flex:1-per-button: the sync button is
     conditional, and a centered fixed-size group handles 3 or 4 buttons
     identically, where flex:1 would size buttons by how many there
     are. */
  .bottom-row { display: flex; justify-content: center; gap: .4rem; }
  /* Wider gap for the horizontal (expanded) row only. Scoped with :not()
     rather than bumping the shared .bottom-row gap, so the collapsed
     rail's vertical stack keeps the same .4rem gap as the other collapsed
     icon groups (nav/spaces) above it. */
  .bottom-row:not(.bottom-row-collapsed) { gap: .85rem; }
  .bottom-row.bottom-row-collapsed { flex-direction: column; align-items: center; }
  /* Same box as the collapsed rail's icons: the footer is icon-only in
     both modes, so it must not change appearance with collapse state. */
  .icon-btn {
    width: 33px; height: 33px; padding: 0; flex-shrink: 0;
    min-width: 0; position: relative;
    display: flex; align-items: center; justify-content: center;
    background: var(--hover); border: 1px solid transparent;
    border-radius: 8px; cursor: pointer;
    color: var(--muted);
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), border-color var(--dur-hover) var(--ease-hover);
  }
  .icon-btn svg { flex-shrink: 0; opacity: .85; }
  .icon-btn:hover { background: var(--surface); color: var(--text); border-color: var(--border-strong); }

  /* No glow or border tint, and the icon color itself is blended toward
     var(--muted) (the button's default): full-strength semantic colors
     read as too loud for a status that's visible at rest all the time,
     not just on a rare error. Same semantic tokens as everywhere else in
     this app (green
     success / red danger / amber due-soon for conflicts / the app's own
     indigo accent standing in for "syncing now" blue). syncGlowState
     (script) is a single mutually-exclusive value, so exactly one of
     these ever applies -- no cascade ambiguity about which status should
     win when several are true at once (e.g. syncing while a conflict
     also exists). */
  .icon-btn-sync.sync-synced { color: color-mix(in srgb, var(--success) 55%, var(--muted)); }
  .icon-btn-sync.sync-syncing { color: color-mix(in srgb, var(--accent) 55%, var(--muted)); }
  .icon-btn-sync.sync-error { color: color-mix(in srgb, var(--danger) 55%, var(--muted)); }
  .icon-btn-sync.sync-conflict { color: color-mix(in srgb, var(--due-soon-ink) 55%, var(--muted)); }
  .icon-btn-sync.sync-offline { color: var(--faint); }
  .conflict-badge {
    /* Absolutely positioned as a corner overlay on the icon: the footer
       is icon-only, so there's no inline label row for this to sit next
       to. The sidebar-bg border punches a "cutout" ring so the badge
       doesn't blend into the button underneath. */
    position: absolute; top: -3px; right: -3px;
    /* --on-accent, not hardcoded #fff — the background is
       --due-soon-ink, a light amber in dark mode where #fff drops to
       1.67:1. --on-accent's white/dark-text split fits this token's
       per-theme lightness. */
    color: var(--on-accent); font-family: var(--mono); font-size: .55rem; font-weight: 700;
    min-width: 13px; height: 13px; border-radius: 999px; padding: 0 3px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--sidebar-bg);
    background: var(--due-soon-ink);
  }
  @media (max-width: 768px) {
    .proj-delete-btn { opacity: .7; }
    .proj-pin-btn:not(.pinned) { opacity: .7; }
  }

  /* Short viewports (landscape phone) — tighten spacing so the project
     tree (the primary navigation surface) gets more room in a squeezed
     landscape window, where it is otherwise unreadable. */
  @media (max-height: 480px) {
    .sidebar { padding-top: .7rem; padding-bottom: .7rem; gap: .2rem; }
    .bottom { padding-top: .5rem; gap: .3rem; }
  }
</style>
