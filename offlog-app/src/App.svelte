<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { init, activeProject, activeProjectId, activeSpaceId, projectTasks, projects, spaces, reloadTasks, errorToast, modalOpen } from './lib/store';
  import { updateProject, subscribeUndo, getRecentlyDeleted, undoDelete, getTaskById, syncNow } from './lib/db';
  import { pendingOpenTaskId } from './lib/notifications';
  import { applyTheme, watchSystemTheme, getThemeMode, setThemeMode, isEffectivelyDark, getHighContrast, setHighContrast } from './lib/theme';
  import { getCommands } from './lib/commands';
  import Sidebar from './lib/Sidebar.svelte';
  import KanbanBoard from './lib/KanbanBoard.svelte';
  import ListView from './lib/ListView.svelte';
  import DeadlinesView from './lib/DeadlinesView.svelte';
  import FocusView from './lib/FocusView.svelte';
  import DashboardView from './lib/DashboardView.svelte';
  import GlobalSearch from './lib/GlobalSearch.svelte';
  import FilterBar from './lib/FilterBar.svelte';
  import CardDetail from './lib/CardDetail.svelte';
  import QuickAdd from './lib/QuickAdd.svelte';
  import ConfirmDialog from './lib/ConfirmDialog.svelte';
  import { closeOnBack } from './lib/modalStack';

  let ready = false;
  let initError: string | null = null;
  let showDeadlines = false;
  let showDashboard = true;
  let showFocus = false;
  let sidebarOpen = false;

  type View = 'kanban' | 'list';
  // Per-project Kanban/List choice for the *current* browser session,
  // restored across a same-session refresh (see onMount below) so
  // reloading mid-List-view doesn't silently bounce back to Kanban.
  // Only reset to 'kanban' at genuine navigation points (picking a
  // project from the sidebar/dashboard) — see goToProject().
  let currentView: View = 'kanban';

  function saveView() {
    if (!ready) return;
    const view = showDashboard ? 'dashboard' : showFocus ? 'focus' : showDeadlines ? 'agenda' : 'project';
    localStorage.setItem('offlog_view', JSON.stringify({ view, projectId: get(activeProjectId), mode: currentView }));
  }

  $: if (ready) { showDashboard; showDeadlines; showFocus; $activeProjectId; currentView; saveView(); }

  // The one place `activeProjectId` should reset the view to Kanban —
  // called from deliberate "go to this project" actions (sidebar project/
  // space click, dashboard project card), never from state restoration.
  function goToProject(id: string) {
    activeProjectId.set(id);
    currentView = 'kanban';
  }
  let showSearch = false;
  let showQuickAdd = false;
  let showShortcuts = false;
  let sidebarRef: Sidebar;

  // B2 — Kanban's filter state lives here (not inside KanbanBoard) so the
  // Filters button can sit in this shared board-header row instead of a
  // dedicated toolbar row that, with no search box next to it, wasted a
  // full row for one button (owner feedback). List view keeps its own
  // filter state internal to ListView.svelte — its toolbar row already has
  // enough content (search box, Archived, Columns) to earn its own row.
  let kbSearch = '';
  let kbFilterCol = '';
  let kbFilterPrio = 0;
  let kbFilterTag = '';
  $: kbAllTags = [...new Set($projectTasks.flatMap(t => t.tags))].sort();
  // Stale filter values from a previous project shouldn't silently narrow
  // the next project's board — reset on every genuine navigation.
  $: $activeProjectId, (kbSearch = '', kbFilterCol = '', kbFilterPrio = 0, kbFilterTag = '');

  // B9 — command palette, folded into GlobalSearch rather than a separate
  // overlay/shortcut. Sidebar's own openSettings/openChangelog/openTrash
  // are plain top-level functions in its instance (not `export`ed — Svelte
  // exposes every top-level binding to a bound instance automatically), so
  // a bind:this ref is enough to reach them without lifting that state.
  $: commands = getCommands({
    goToDashboard: () => { showDeadlines = false; showFocus = false; showDashboard = true; },
    goToFocus: () => { showDashboard = false; showDeadlines = false; showFocus = true; },
    goToAgenda: () => { showDashboard = false; showFocus = false; showDeadlines = true; },
    openQuickAdd: () => { showQuickAdd = true; },
    toggleTheme: () => setThemeMode(isEffectivelyDark(getThemeMode()) ? 'light' : 'dark'),
    toggleHighContrast: () => setHighContrast(!getHighContrast()),
    openSettings: () => sidebarRef?.openSettings(),
    openChangelog: () => sidebarRef?.openChangelog(),
    openTrash: () => sidebarRef?.openTrash(),
    syncNow: () => { syncNow(); },
  });
  let searchDetailTask: import('./lib/types').TaskDoc | null = null;
  let searchDetailProject: import('./lib/types').ProjectDoc | null = null;

  // The shortcuts panel is a plain boolean toggled within this
  // always-mounted component, not a separate component that mounts/
  // unmounts per open — so unlike the other overlays (which each register
  // their own back-button layer via closeOnBack at component init), it
  // needs it wired reactively. See modalStack.ts / ROADMAP.md A14.
  let popShortcutsLayer: (() => void) | null = null;
  $: if (showShortcuts && !popShortcutsLayer) {
    popShortcutsLayer = closeOnBack(() => { showShortcuts = false; popShortcutsLayer = null; });
  }
  function closeShortcuts() { if (popShortcutsLayer) popShortcutsLayer(); else showShortcuts = false; }

  // The mobile sidebar drawer deliberately does NOT get a closeOnBack
  // history layer. It's primarily a launchpad — tapping any nav item
  // inside it immediately opens something else (a project, Settings,
  // Trash…), which pushes its own history entry practically the same
  // instant the drawer closes. Routing the drawer's close through
  // history.back() in that sequence raced against the newly-opened
  // overlay's history.pushState() (back() resolves async via 'popstate',
  // pushState runs sync) and could close the *new* overlay incorrectly.
  // A plain direct close avoids the race; Escape and the scrim/hamburger
  // still work as before, just without hardware-back support specifically
  // for "drawer open, nothing else" (a much rarer state to be caught in).
  function closeSidebar() { sidebarOpen = false; }

  // Undo toast
  let undoToasts: { id: string; title: string; timer: any }[] = [];

  async function showUndoToast() {
    const buf = await getRecentlyDeleted(1);
    if (!buf.length) return;
    const task = buf[0];
    if (undoToasts.find(t => t.id === task._id)) return;
    const timer = setTimeout(() => {
      undoToasts = undoToasts.filter(t => t.id !== task._id);
    }, 5000);
    undoToasts = [{ id: task._id!, title: task.title, timer }, ...undoToasts].slice(0, 3);
  }

  async function handleUndo(id: string) {
    const t = undoToasts.find(t => t.id === id);
    if (t) clearTimeout(t.timer);
    undoToasts = undoToasts.filter(t => t.id !== id);
    await undoDelete(id);
    await reloadTasks();
  }

  async function openFromNotification(taskId: string) {
    const task = await getTaskById(taskId);
    const proj = task ? $projects.find(p => p._id === task.project_id) ?? null : null;
    if (task && proj) {
      searchDetailTask = task;
      searchDetailProject = proj;
    }
    pendingOpenTaskId.set(null);
  }

  $: if ($pendingOpenTaskId) openFromNotification($pendingOpenTaskId);

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); showSearch = true; return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); showQuickAdd = true; return; }
    // Don't hijack "?" while the user is typing in a field.
    const el = e.target as HTMLElement;
    const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
    if (e.key === '?' && !typing) { e.preventDefault(); showShortcuts = true; return; }
    if (e.key === 'Escape' && showShortcuts) { closeShortcuts(); return; }
    if (e.key === 'Escape' && sidebarOpen) { closeSidebar(); return; }
  }

  // Android hardware/gesture back button: delegate to browser history when
  // there's somewhere to go back to (which is exactly when an overlay
  // registered via closeOnBack has pushed an entry — see modalStack.ts),
  // otherwise let the OS handle it normally (minimize the app — the
  // correct behavior at the true root, unlike falling through to this
  // when a modal is actually open). @capacitor/app is a no-op import on
  // web, so this listener only ever fires on native.
  async function setupBackButton() {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return;
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else CapApp.exitApp();
    });
  }

  // The combined home-screen widget (OffologWidgetProvider, B37) opens
  // MainActivity with a com.offlog.app://<host>[?query] VIEW intent,
  // depending on which part was tapped (brief → agenda, or one of the 3
  // action buttons). This
  // used to be forwarded via a custom native `triggerJSEvent` call in
  // MainActivity.onCreate() — but that fired synchronously during native
  // onCreate(), before the WebView had even loaded this script, let alone
  // reached this onMount — so on a cold start (app not already running)
  // the event was dispatched into the void and tapping a widget just
  // opened the app with nothing else happening. Using @capacitor/app's
  // own launch-URL handling instead: getLaunchUrl() reads the intent that
  // started the app for cold start, and the 'appUrlOpen' listener (which
  // Capacitor's own Bridge already fires for every plugin on onNewIntent,
  // no custom native code needed) covers a warm start.
  // Returns true if the url actually navigated somewhere, so the caller
  // can skip the localStorage view-restore below rather than have it race
  // and clobber a deliberate widget-driven navigation.
  function handleWidgetUrl(url: string | undefined | null): boolean {
    if (!url) return false;
    if (url.includes('quickadd')) { showQuickAdd = true; return false; } // an overlay, not a view change
    if (url.includes('agenda')) { showDashboard = false; showDeadlines = true; return true; }
    if (url.includes('focus')) { showDashboard = false; showDeadlines = false; showFocus = true; return true; }
    if (url.includes('dashboard')) { showDeadlines = false; showFocus = false; showDashboard = true; return true; }
    if (url.includes('project')) {
      // The project-list widget's row may point at a project that's since
      // been deleted — same "don't land on a broken view" caution as the
      // localStorage view-restore below, just via a different trigger.
      const id = new URL(url).searchParams.get('id');
      if (id && get(projects).some(p => p._id === id)) { showDashboard = false; goToProject(id); return true; }
    }
    return false;
  }

  // Cold start: check synchronously (relative to the rest of onMount)
  // before the view-restore block runs, so a widget-driven navigation
  // always wins over whatever was last open. Warm start (already
  // running): the 'appUrlOpen' listener can fire at any later point,
  // there's no restore-ordering race to worry about there.
  async function checkLaunchUrl(): Promise<boolean> {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return false;
    const { App: CapApp } = await import('@capacitor/app');
    const launch = await CapApp.getLaunchUrl();
    return handleWidgetUrl(launch?.url);
  }

  async function listenForWidgetLinks() {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return;
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('appUrlOpen', ({ url }) => handleWidgetUrl(url));
  }

  onMount(async () => {
    applyTheme(); // runs the legacy-key migration once and re-applies (idempotent vs. index.html's pre-paint script)
    watchSystemTheme(); // App.svelte is a permanent root singleton, never unmounted — no cleanup needed
    setupBackButton();
    try {
      await init();
    } catch (e: any) {
      initError = e?.message ?? 'The app failed to start.';
      return;
    }
    // Awaited (unlike setupBackButton) so the project-widget deep link's
    // existence check has a populated `projects` store, and so its result
    // is known before deciding whether to run the view-restore below.
    const launchedFromWidget = await checkLaunchUrl();
    listenForWidgetLinks(); // future (warm-start) taps — no ordering race to wait for
    // Restore last view — skipped if a widget tap already navigated
    // somewhere on this cold start; that's a deliberate action and must
    // win over whatever view happened to be open last.
    if (!launchedFromWidget) try {
      const saved = JSON.parse(localStorage.getItem('offlog_view') ?? '{}');
      // saved.projectId can point to a project that no longer exists — a
      // wipeAndReseed(), a data reset, or a reinstall that kept
      // localStorage but not IndexedDB all leave a stale id behind (A19).
      // Blindly restoring it landed on a blank project view with nothing
      // selected instead of falling back to Dashboard as intended.
      const projectStillExists = saved.projectId && get(projects).some(p => p._id === saved.projectId);
      if (saved.view === 'agenda') { showDashboard = false; showDeadlines = true; }
      else if (saved.view === 'focus') { showDashboard = false; showFocus = true; }
      else if (saved.view === 'project' && projectStillExists) {
        showDashboard = false; showDeadlines = false; showFocus = false;
        // Restore via the plain store, not goToProject() — this is state
        // restoration on reload, not a deliberate navigation, so the
        // in-progress Kanban/List choice (below) must survive too.
        activeProjectId.set(saved.projectId);
        if (saved.mode === 'list' || saved.mode === 'kanban') currentView = saved.mode;
      }
      // 'dashboard', nothing, or a stale projectId → keep showDashboard = true
    } catch {}
    ready = true;
    subscribeUndo(showUndoToast);
  });

  function retryInit() { location.reload(); }

  async function setView(v: View) {
    currentView = v;
    if (!$activeProject) return;
    // Legacy field, no longer read back (see A27) — the view switch above
    // already fully succeeded synchronously, so a failure here is a silent
    // background-persistence miss, not something the user needs an error
    // toast for (same "fire and forget" reasoning as rescheduleAll()).
    try {
      await updateProject($activeProject._id, { default_view: v });
      projects.update(ps => ps.map(p => p._id === $activeProject!._id ? { ...p, default_view: v } : p));
    } catch {}
  }

  $: activeSpace = $spaces.find(s => s._id === $activeSpaceId);

  const ICONS: Record<View, string> = {
    kanban: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="4" height="11" rx="1"/><rect x="6.5" y="2.5" width="4" height="7" rx="1"/><rect x="11.5" y="2.5" width="3" height="9" rx="1"/></svg>',
    list:   '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg>',
  };

  const VIEWS: { key: View; label: string }[] = [
    { key: 'kanban', label: 'Kanban' },
    { key: 'list',   label: 'List' },
  ];
</script>

<svelte:window on:keydown={onKeydown}/>

{#if ready}
  <div class="status-bar-fill"></div>
  <div class="layout">
    <Sidebar
      bind:this={sidebarRef}
      bind:showDeadlines
      bind:showDashboard
      bind:showFocus
      bind:open={sidebarOpen}
      on:navigate={() => { closeSidebar(); currentView = 'kanban'; }}
      on:openTask={(e) => { searchDetailTask = e.detail.task; searchDetailProject = e.detail.project; closeSidebar(); }}
    />

    <!-- Mobile scrim -->
    {#if sidebarOpen}
      <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
      <div class="mobile-scrim" on:click={closeSidebar}></div>
    {/if}

    <main class="main">
      {#if showDashboard}
        <DashboardView
          on:menu={() => sidebarOpen = true}
          on:openProject={(e) => {
            showDashboard = false;
            goToProject(e.detail);
          }}
        />
      {:else if showFocus}
        <FocusView on:menu={() => sidebarOpen = true} />
      {:else if showDeadlines}
        <DeadlinesView on:menu={() => sidebarOpen = true} />
      {:else if $activeProject}
        <header class="board-header">
          <button class="hamburger" on:click={() => sidebarOpen = true} aria-label="Menu">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
            </svg>
          </button>

          <div class="title-block">
            {#if activeSpace}
              <div class="breadcrumb">
                <span class="bc-dot" style="background:{activeSpace.color}"></span>
                {activeSpace.name}
              </div>
            {/if}
            <h1 class="board-title">{$activeProject.name}</h1>
          </div>

          <div class="spacer"></div>

          <div class="search-filter-group">
            <button class="search-btn" on:click={() => showSearch = true} title="Search (Ctrl+K)" aria-label="Search (Ctrl+K)">
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
              </svg>
            </button>
            {#if currentView === 'kanban'}
              <span class="search-filter-divider"></span>
              <FilterBar compact project={$activeProject} allTags={kbAllTags} bind:search={kbSearch} bind:filterCol={kbFilterCol} bind:filterPrio={kbFilterPrio} bind:filterTag={kbFilterTag} />
            {/if}
          </div>

          <div class="view-seg">
            {#each VIEWS as v}
              <button class="view-btn" class:active={currentView === v.key} on:click={() => setView(v.key)}>
                {@html ICONS[v.key]}
                <span class="view-label">{v.label}</span>
              </button>
            {/each}
          </div>
        </header>

        {#if currentView === 'kanban'}
          <KanbanBoard
            project={$activeProject}
            tasks={$projectTasks}
            search={kbSearch}
            filterCol={kbFilterCol}
            filterPrio={kbFilterPrio}
            filterTag={kbFilterTag}
            on:projectUpdated={(e) => {
              projects.update(ps => ps.map(p => p._id === e.detail._id ? e.detail : p));
            }}
          />
        {:else}
          <ListView project={$activeProject} tasks={$projectTasks} />
        {/if}

      {:else}
        <div class="empty-state">
          <button class="hamburger" on:click={() => sidebarOpen = true} aria-label="Menu">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
            </svg>
          </button>
          <span>Select or create a project.</span>
        </div>
      {/if}
    </main>
  </div>
{:else if initError}
  <div class="crash-recovery">
    <h2>Offlog couldn't start</h2>
    <p class="crash-msg">{initError}</p>
    <p class="crash-hint">This usually clears up on a retry. If it keeps happening, your local database may need repair — try Export JSON as a backup from a working session first if possible.</p>
    <button class="retry-btn" on:click={retryInit}>Retry</button>
  </div>
{:else}
  <div class="loading">Loading…</div>
{/if}

<ConfirmDialog />

{#if !showQuickAdd && !showSearch && !searchDetailTask && !sidebarOpen && !$modalOpen}
<button class="fab" on:click={() => showQuickAdd = true} title="Quick add task (Ctrl+N)">
  <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
  </svg>
</button>
{/if}

{#if showQuickAdd}
  <QuickAdd on:close={() => showQuickAdd = false} on:created={() => reloadTasks()} />
{/if}

{#if showSearch}
  <GlobalSearch
    {commands}
    on:close={() => showSearch = false}
    on:open={(e) => { searchDetailTask = e.detail.task; searchDetailProject = e.detail.project; showSearch = false; }}
  />
{/if}

{#if searchDetailTask && searchDetailProject}
  {#key searchDetailTask._id}
    <CardDetail
      task={searchDetailTask}
      project={searchDetailProject}
      on:close={async () => { searchDetailTask = null; searchDetailProject = null; await reloadTasks(); }}
    />
  {/key}
{/if}

{#if showShortcuts}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="scrim" on:click|self={closeShortcuts}>
    <div class="shortcuts-panel">
      <div class="shortcuts-head">
        <h3>Keyboard shortcuts</h3>
        <button class="shortcuts-close" on:click={closeShortcuts} aria-label="Close">✕</button>
      </div>
      <div class="shortcuts-list">
        <div class="shortcut-row"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd><span class="shortcut-desc">Global search</span></div>
        <div class="shortcut-row"><kbd>Ctrl</kbd><span>+</span><kbd>N</kbd><span class="shortcut-desc">Quick add task</span></div>
        <div class="shortcut-row"><kbd>?</kbd><span class="shortcut-desc">Show this list</span></div>
        <div class="shortcut-row"><kbd>Esc</kbd><span class="shortcut-desc">Close any open panel</span></div>
        <div class="shortcut-row"><kbd>Enter</kbd><span class="shortcut-desc">Open a focused card, save a rename</span></div>
      </div>
    </div>
  </div>
{/if}

{#if $errorToast}
  <div class="error-toast">{$errorToast}</div>
{/if}

{#if undoToasts.length}
  <div class="toast-stack">
    {#each undoToasts as t (t.id)}
      <div class="toast">
        <span class="toast-msg">Deleted "{t.title.length > 30 ? t.title.slice(0,30)+'…' : t.title}"</span>
        <button class="toast-undo" on:click={() => handleUndo(t.id)}>Undo</button>
        <button class="toast-close" on:click={() => { clearTimeout(t.timer); undoToasts = undoToasts.filter(u => u.id !== t.id); }}>✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Colored strip behind the transparent Android status bar (edge-to-edge).
     env(safe-area-inset-top) is 0 on desktop/browser, so this is invisible there. */
  .status-bar-fill {
    position: fixed; top: 0; left: 0; right: 0;
    height: env(safe-area-inset-top, 0px);
    background: var(--sidebar-bg);
    z-index: 10000;
  }

  .layout {
    display: flex;
    height: 100dvh;
    padding-top: env(safe-area-inset-top, 0px);
    box-sizing: border-box;
    overflow: hidden;
  }
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); min-width: 0; }

  /* Mobile scrim */
  .mobile-scrim {
    display: none;
    position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 199;
    animation: scrim-in .32s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes scrim-in { from { opacity: 0; } to { opacity: 1; } }

  .board-header {
    display: flex; align-items: center; gap: 16px;
    padding: 16px 24px 14px;
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }

  /* Hamburger — hidden on desktop, shown on mobile */
  .hamburger {
    display: none;
    background: none; border: none; cursor: pointer;
    color: var(--text); padding: 4px; border-radius: 6px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .hamburger:hover { background: var(--hover); }

  .title-block { min-width: 0; }
  .breadcrumb {
    display: flex; align-items: center; gap: 6px;
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em;
    text-transform: uppercase; color: var(--faint); margin-bottom: 3px;
  }
  .bc-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .board-title {
    margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -.015em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .spacer { flex: 1; }

  /* Search + Filters paired into one compact pill (owner feedback) rather
     than two loose buttons — same grouped-pill language as .view-seg
     below, so the two clusters read as a matched pair. */
  .search-filter-group {
    display: inline-flex; align-items: center; background: var(--col-bg);
    border: 1px solid var(--border-strong); border-radius: 8px;
    padding: 3px; gap: 1px; flex-shrink: 0;
  }
  .search-filter-divider { width: 1px; height: 14px; background: var(--border-strong); flex-shrink: 0; }
  .search-btn {
    display: flex; align-items: center; justify-content: center;
    background: none; border: none;
    border-radius: 6px; padding: 5px 8px; cursor: pointer;
    color: var(--muted);
    transition: color .12s, background .12s;
    flex-shrink: 0;
  }
  .search-btn:hover { color: var(--text); background: var(--hover, var(--surface)); }

  .view-seg {
    display: inline-flex; background: var(--col-bg); border: 1px solid var(--border-strong);
    border-radius: 10px; padding: 3px; gap: 2px; flex-shrink: 0;
  }
  .view-btn {
    display: flex; align-items: center; gap: 7px;
    border: none; cursor: pointer; font-family: inherit; font-size: 13px;
    font-weight: 600; padding: 6px 13px; border-radius: 7px;
    background: transparent; color: var(--muted);
    transition: background .12s, color .12s, box-shadow .12s;
  }
  .view-btn.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.10); }
  .view-btn:not(.active):hover { color: var(--text); }

  .empty-state {
    display: flex; flex-direction: column; align-items: flex-start;
    gap: 1rem; padding: 16px 24px; color: var(--muted); font-size: .95rem;
  }
  .empty-state span { margin: auto; align-self: center; }

  .loading {
    display: flex; align-items: center; justify-content: center;
    height: 100dvh; color: var(--faint);
    font-family: var(--mono); font-size: .8rem; letter-spacing: .04em;
  }

  .crash-recovery {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100dvh; padding: 24px; text-align: center; gap: 10px;
    background: var(--bg); color: var(--text);
  }
  .crash-recovery h2 { margin: 0; font-size: 18px; }
  .crash-msg { color: var(--danger); font-size: 13px; max-width: 380px; }
  .crash-hint { color: var(--faint); font-size: 12.5px; max-width: 380px; line-height: 1.5; }
  .retry-btn {
    margin-top: 8px; padding: 8px 20px; border-radius: var(--radius-sm);
    border: 1px solid var(--text); background: var(--text); color: var(--bg);
    cursor: pointer; font-size: 13px; font-weight: 600;
  }

  /* ── FAB ── */
  .fab {
    position: fixed; bottom: 24px; right: 24px; z-index: 300;
    width: 50px; height: 50px; border-radius: 50%;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,.25);
    display: flex; align-items: center; justify-content: center;
    transition: transform .15s, box-shadow .15s, opacity .15s;
  }
  .fab:hover { transform: scale(1.08); box-shadow: 0 6px 22px rgba(0,0,0,.3); }
  .fab:active { transform: scale(.96); }

  /* ── Shortcuts panel ── */
  .scrim { display: flex; align-items: center; justify-content: center; }
  .shortcuts-panel {
    position: relative; z-index: 401;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 1.25rem 1.4rem; width: min(360px, 90vw);
    box-shadow: 0 20px 50px rgba(0,0,0,.18);
  }
  .shortcuts-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: .9rem; }
  .shortcuts-head h3 { margin: 0; font-size: 1rem; letter-spacing: -.01em; }
  .shortcuts-close {
    background: var(--hover); border: none; cursor: pointer;
    width: 26px; height: 26px; border-radius: 6px; color: var(--muted); font-size: .8rem;
  }
  .shortcuts-close:hover { background: var(--border-strong); color: var(--text); }
  .shortcuts-list { display: flex; flex-direction: column; gap: .6rem; }
  .shortcut-row { display: flex; align-items: center; gap: .3rem; font-size: .85rem; color: var(--text); }
  .shortcut-row kbd {
    font-family: var(--mono); font-size: .74rem; background: var(--col-bg);
    border: 1px solid var(--border-strong); border-radius: 5px; padding: .15rem .4rem;
  }
  .shortcut-desc { margin-left: .5rem; color: var(--muted); }

  /* ── Error toast ── */
  .error-toast {
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: var(--danger); color: #fff;
    padding: 11px 18px; border-radius: 10px;
    font-size: 13.5px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,.25);
    z-index: 1000; white-space: nowrap;
    animation: toast-in .22s cubic-bezier(0.4,0,0.2,1) both;
  }

  /* ── Undo toast ── */
  .toast-stack {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; gap: 8px; z-index: 999;
    pointer-events: none;
  }
  .toast {
    display: flex; align-items: center; gap: 10px;
    background: var(--text); color: var(--bg);
    padding: 11px 14px; border-radius: 10px;
    font-size: 13.5px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,.25);
    pointer-events: all;
    animation: toast-in .22s cubic-bezier(0.4,0,0.2,1) both;
    white-space: nowrap;
  }
  @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .toast-msg { flex: 1; }
  .toast-undo {
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;
    transition: opacity .12s;
  }
  .toast-undo:hover { opacity: .85; }
  .toast-close {
    background: none; border: none; cursor: pointer; color: inherit;
    opacity: .5; font-size: 13px; padding: 0 2px;
  }
  .toast-close:hover { opacity: 1; }

  /* ── Mobile ── */
  @media (max-width: 768px) {
    .mobile-scrim { display: block; }
    .hamburger { display: flex; }
    .board-header { padding: 12px 16px 10px; gap: 10px; }
    .board-title { font-size: 17px; }
    .breadcrumb { display: none; }
    .view-label { display: none; }
    .view-btn { padding: 6px 9px; }
  }
</style>
