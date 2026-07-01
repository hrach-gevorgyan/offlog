<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { init, activeProject, activeProjectId, activeSpaceId, projectTasks, projects, spaces, reloadTasks, errorToast, modalOpen } from './lib/store';
  import { updateProject, subscribeUndo, getUndoBuffer, undoDelete } from './lib/db';
  import Sidebar from './lib/Sidebar.svelte';
  import KanbanBoard from './lib/KanbanBoard.svelte';
  import ListView from './lib/ListView.svelte';
  import TableView from './lib/TableView.svelte';
  import DeadlinesView from './lib/DeadlinesView.svelte';
  import DashboardView from './lib/DashboardView.svelte';
  import GlobalSearch from './lib/GlobalSearch.svelte';
  import CardDetail from './lib/CardDetail.svelte';
  import QuickAdd from './lib/QuickAdd.svelte';

  let ready = false;
  let showDeadlines = false;
  let showDashboard = true;
  let sidebarOpen = false;

  function saveView() {
    if (!ready) return;
    const view = showDashboard ? 'dashboard' : showDeadlines ? 'agenda' : 'project';
    localStorage.setItem('offlog_view', JSON.stringify({ view, projectId: get(activeProjectId) }));
  }

  $: if (ready) { showDashboard; showDeadlines; $activeProjectId; saveView(); }
  let showSearch = false;
  let showQuickAdd = false;
  let searchDetailTask: import('./lib/types').TaskDoc | null = null;
  let searchDetailProject: import('./lib/types').ProjectDoc | null = null;

  // Undo toast
  let undoToasts: { id: string; title: string; timer: any }[] = [];

  function showUndoToast() {
    const buf = getUndoBuffer();
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

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); showSearch = true; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); showQuickAdd = true; }
  }

  onMount(async () => {
    if (localStorage.getItem('dark')) document.body.classList.add('dark');
    await init();
    // Restore last view
    try {
      const saved = JSON.parse(localStorage.getItem('offlog_view') ?? '{}');
      if (saved.view === 'agenda') { showDashboard = false; showDeadlines = true; }
      else if (saved.view === 'project' && saved.projectId) {
        showDashboard = false; showDeadlines = false;
        activeProjectId.set(saved.projectId);
      }
      // 'dashboard' or nothing → keep showDashboard = true
    } catch {}
    ready = true;
    subscribeUndo(showUndoToast);
  });

  type View = 'kanban' | 'list' | 'table';
  $: currentView = ($activeProject?.default_view ?? 'kanban') as View;

  async function setView(v: View) {
    if (!$activeProject) return;
    await updateProject($activeProject._id, { default_view: v });
    projects.update(ps => ps.map(p => p._id === $activeProject!._id ? { ...p, default_view: v } : p));
  }

  $: activeSpace = $spaces.find(s => s._id === $activeSpaceId);

  const ICONS: Record<View, string> = {
    kanban: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="4" height="11" rx="1"/><rect x="6.5" y="2.5" width="4" height="7" rx="1"/><rect x="11.5" y="2.5" width="3" height="9" rx="1"/></svg>',
    list:   '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg>',
    table:  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1"/><line x1="2" y1="6.5" x2="14" y2="6.5"/><line x1="7" y1="3" x2="7" y2="13"/></svg>',
  };

  const VIEWS: { key: View; label: string }[] = [
    { key: 'kanban', label: 'Kanban' },
    { key: 'list',   label: 'List' },
    { key: 'table',  label: 'Table' },
  ];
</script>

<svelte:window on:keydown={onKeydown}/>

{#if ready}
  <div class="status-bar-fill"></div>
  <div class="layout">
    <Sidebar
      bind:showDeadlines
      bind:showDashboard
      bind:open={sidebarOpen}
      on:navigate={() => sidebarOpen = false}
    />

    <!-- Mobile scrim -->
    {#if sidebarOpen}
      <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
      <div class="mobile-scrim" on:click={() => sidebarOpen = false}></div>
    {/if}

    <main class="main">
      {#if showDashboard}
        <DashboardView
          on:menu={() => sidebarOpen = true}
          on:openProject={(e) => {
            showDashboard = false;
            activeProjectId.set(e.detail);
          }}
        />
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

          <button class="search-btn" on:click={() => showSearch = true} title="Search (Ctrl+K)">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
            </svg>
            <span class="search-hint">Ctrl+K</span>
          </button>

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
            on:projectUpdated={(e) => {
              projects.update(ps => ps.map(p => p._id === e.detail._id ? e.detail : p));
            }}
          />
        {:else if currentView === 'list'}
          <ListView project={$activeProject} tasks={$projectTasks} />
        {:else}
          <TableView project={$activeProject} tasks={$projectTasks} />
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
{:else}
  <div class="loading">Loading…</div>
{/if}

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
    on:close={() => showSearch = false}
    on:open={(e) => { searchDetailTask = e.detail.task; searchDetailProject = e.detail.project; showSearch = false; }}
  />
{/if}

{#if searchDetailTask && searchDetailProject}
  <CardDetail
    task={searchDetailTask}
    project={searchDetailProject}
    on:close={async () => { searchDetailTask = null; searchDetailProject = null; await reloadTasks(); }}
  />
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

  .search-btn {
    display: flex; align-items: center; gap: 7px;
    background: var(--col-bg); border: 1px solid var(--border-strong);
    border-radius: 8px; padding: 6px 11px; cursor: pointer;
    color: var(--muted); font-size: 12.5px; font-weight: 500;
    transition: color .12s, border-color .12s, background .12s;
    flex-shrink: 0;
  }
  .search-btn:hover { color: var(--text); border-color: var(--accent); }
  .search-hint { font-family: var(--mono); font-size: 10.5px; color: var(--faint); }

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
    .search-hint { display: none; }
    .search-btn { padding: 6px 9px; }
  }
</style>
