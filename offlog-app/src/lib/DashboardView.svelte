<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getDashboardData, getStorageBreakdown, getTaskById, subscribe } from './db';
  import { reloadTasks, showError } from './store';
  import { PRIORITY_COLOR } from './constants';
  import { dueLabelLong } from './utils';
  import type { TaskDoc, ProjectDoc } from './types';
  import CardDetail from './CardDetail.svelte';
  import { loadFocusLock, type FocusLock } from './focusLock';

  const dispatch = createEventDispatcher<{ openProject: string; menu: void; focus: void; search: void; agenda: void }>();

  // Dashboard is a glanceable overview, not a second task browser (that's
  // List/Agenda's job), so Today/Pinned/Overdue are capped. Today/Overdue
  // "View all" links out to Agenda; Pinned has no cross-project view
  // anywhere else, so its "View all" expands the list in place.
  const TASK_CAP = 6;
  let pinnedExpanded = false;

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let detailTask: TaskDoc | null = null;
  let detailProject: ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists -- {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;
  // Glance-level count only; the full archived-task browser stays in List view.
  let archivedCount = 0;

  // "Daily Brief" card: surfaces Focus's daily commitment lock, the one
  // piece of state only Focus otherwise has. Deliberately doesn't re-show
  // Today/Pinned/Overdue — those are their own sections below.
  let focusLock: FocusLock | null = null;
  let focusLockedTasks: TaskDoc[] = [];

  function isFocusTaskDone(t: TaskDoc): boolean {
    const proj = data?.allProjects.find(p => p._id === t.project_id);
    return !!proj && t.column_id === proj.columns.at(-1)?.id;
  }

  async function loadFocusSummary() {
    focusLock = loadFocusLock();
    if (!focusLock) { focusLockedTasks = []; return; }
    const fetched = await Promise.all(focusLock.taskIds.map(id => getTaskById(id)));
    // Same !deleted/!archived filter as FocusView.svelte's loadLockedTasks():
    // a task removed elsewhere while locked as one of today's 3 must not
    // still count here.
    focusLockedTasks = fetched.filter((t): t is TaskDoc => !!t && !t.deleted && !t.archived);
  }

  async function load() {
    data = await getDashboardData();
    archivedCount = (await getStorageBreakdown()).archivedTasks;
    await loadFocusSummary();
  }

  // Same day-rollover gap as FocusView.svelte's own fix: loadFocusLock()
  // discards a stale lock, but nothing re-invoked it on the clock, so a
  // tray-resident session left open past midnight kept the Daily Brief
  // card labeled "Today's Focus" on yesterday's picks.
  const DAY_ROLLOVER_CHECK_MS = 60 * 1000;
  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    const dayTimer = setInterval(loadFocusSummary, DAY_ROLLOVER_CHECK_MS);
    window.addEventListener('focus', loadFocusSummary);
    document.addEventListener('visibilitychange', loadFocusSummary);
    return () => {
      unsub();
      clearInterval(dayTimer);
      window.removeEventListener('focus', loadFocusSummary);
      document.removeEventListener('visibilitychange', loadFocusSummary);
    };
  });

  function openTask(t: TaskDoc) {
    detailOpenSession++;
    detailTask = t;
    detailProject = data?.allProjects.find(p => p._id === t.project_id) ?? null;
  }

  async function openRelatedTask(id: string) {
    const t = await getTaskById(id);
    if (!t) { showError('This task no longer exists.'); return; }
    const proj = data?.allProjects.find(p => p._id === t.project_id) ?? null;
    if (!proj) { showError('Could not open this task right now.'); return; }
    detailOpenSession++;
    detailTask = t;
    detailProject = proj;
  }
</script>

<div class="dash">
  <div class="dash-header">
    <button class="hamburger" on:click={() => dispatch('menu')} aria-label="Menu">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
      </svg>
    </button>
    <div class="title-block">
      <h1 class="dash-title">Dashboard</h1>
      {#if data}
        <span class="dash-sub">
          {data.totalTasks} active task{data.totalTasks === 1 ? '' : 's'} across {data.allProjects.length} project{data.allProjects.length === 1 ? '' : 's'}
          {#if archivedCount > 0}· {archivedCount} archived{/if}
        </span>
        <span class="dash-sub dash-week">
          {#if data.completedLast7Days > 0}
            {data.completedLast7Days} completed this past week {#if data.busiestProjectName}· busiest: {data.busiestProjectName}{/if}
          {:else}
            Nothing completed in the past week yet
          {/if}
        </span>
      {/if}
    </div>
    <!-- Every full-page view needs a visible Command Palette entry point,
         not just the Ctrl+K shortcut — unreachable on mobile with no
         physical keyboard. -->
    <button class="palette-btn" on:click={() => dispatch('search')} title="Command Palette (Ctrl+K)" aria-label="Command Palette (Ctrl+K)">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
      </svg>
    </button>
  </div>

  {#if !data}
    <div class="loading"><span class="spinner"></span>Loading…</div>
  {:else}
    <div class="dash-body">
      <div class="brief" role="button" tabindex="0" on:click={() => dispatch('focus')} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch('focus'); } }}>
        {#if focusLock}
          {@const doneCount = focusLockedTasks.filter(isFocusTaskDone).length}
          <div class="brief-head">
            <span class="brief-label">Today's Focus</span>
            <span class="brief-count">{doneCount} of {focusLockedTasks.length} done</span>
          </div>
          <div class="brief-tasks">
            {#each focusLockedTasks as t (t._id)}
              <span class="brief-task" class:done={isFocusTaskDone(t)}>{t.title}</span>
            {/each}
          </div>
        {:else}
          <div class="brief-head">
            <span class="brief-label">Today's Focus</span>
          </div>
          <span class="brief-empty">You haven't picked today's 3 tasks yet — tap to choose in Focus.</span>
        {/if}
      </div>

      <div class="dash-cols">

        <!-- Left: Project cards -->
        <div class="col-projects">
          <div class="section-title">Projects</div>
          <div class="project-grid">
            {#each data.allProjects as proj (proj._id)}
              {@const stats = data.byProject[proj._id] ?? { total: 0, pinned: 0, overdue: 0 }}
              {@const space = data.allSpaces.find(s => s._id === proj.space_id)}
              <div
                class="proj-card"
                role="button"
                tabindex="0"
                on:click={() => dispatch('openProject', proj._id)}
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch('openProject', proj._id); } }}
              >
                <div class="proj-card-top">
                  {#if space}
                    <span class="space-dot" style="background:{space.color}"></span>
                    <span class="space-name">{space.name}</span>
                  {/if}
                  <span class="task-count" title="{stats.total} task{stats.total === 1 ? '' : 's'}">{stats.total}</span>
                </div>
                <div class="proj-name">{proj.name}</div>
                <div class="proj-stats">
                  {#if stats.pinned}<span class="stat pinned-stat">{stats.pinned} pinned</span>{/if}
                  {#if stats.overdue}<span class="stat overdue-stat">{stats.overdue} overdue</span>{/if}
                </div>
              </div>
            {/each}
            {#if data.allProjects.length === 0}
              <div class="no-projects">No projects yet — use "+ New project" in the sidebar to create your first one.</div>
            {/if}
          </div>
        </div>

        <!-- Right: Pinned + Overdue -->
        <div class="col-tasks">
          {#if data.todayTasks.length > 0}
            <section class="section">
              <div class="section-title">Today</div>
              <div class="task-list">
                {#each data.todayTasks.slice(0, TASK_CAP) as t (t._id)}
                  <div
                    class="task-row"
                    role="button"
                    tabindex="0"
                    on:click={() => openTask(t)}
                    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t); } }}
                  >
                    <span class="prio-bar" style="background:{PRIORITY_COLOR[t.priority]}"></span>
                    <div class="task-body">
                      <span class="task-title">{t.title}</span>
                      <span class="task-proj">{data.projCache[t.project_id] ?? '—'}</span>
                    </div>
                  </div>
                {/each}
              </div>
              {#if data.todayTasks.length > TASK_CAP}
                <button class="view-all" on:click={() => dispatch('agenda')}>View all {data.todayTasks.length} in Agenda</button>
              {/if}
            </section>
          {/if}

          {#if data.pinnedTasks.length > 0}
            <section class="section">
              <div class="section-title pinned-title">Pinned</div>
              <div class="task-list">
                {#each (pinnedExpanded ? data.pinnedTasks : data.pinnedTasks.slice(0, TASK_CAP)) as t (t._id)}
                  <div
                    class="task-row"
                    role="button"
                    tabindex="0"
                    on:click={() => openTask(t)}
                    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t); } }}
                  >
                    <span class="prio-bar" style="background:{PRIORITY_COLOR[t.priority]}"></span>
                    <div class="task-body">
                      <span class="task-title">{t.title}</span>
                      <span class="task-proj">{data.projCache[t.project_id] ?? '—'}</span>
                    </div>
                  </div>
                {/each}
              </div>
              {#if data.pinnedTasks.length > TASK_CAP}
                <button class="view-all" on:click={() => pinnedExpanded = !pinnedExpanded}>
                  {pinnedExpanded ? 'Show less' : `View all ${data.pinnedTasks.length}`}
                </button>
              {/if}
            </section>
          {/if}

          {#if data.overdueTasks.length > 0}
            <section class="section">
              <div class="section-title overdue-title">Overdue</div>
              <div class="task-list">
                {#each data.overdueTasks.slice(0, TASK_CAP) as t (t._id)}
                  <div
                    class="task-row"
                    role="button"
                    tabindex="0"
                    on:click={() => openTask(t)}
                    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t); } }}
                  >
                    <span class="prio-bar" style="background:{PRIORITY_COLOR[t.priority]}"></span>
                    <div class="task-body">
                      <span class="task-title">{t.title}</span>
                      <span class="task-proj">{data.projCache[t.project_id] ?? '—'} <span class="task-due overdue">· {dueLabelLong(t.due_date!)}</span></span>
                    </div>
                  </div>
                {/each}
              </div>
              {#if data.overdueTasks.length > TASK_CAP}
                <button class="view-all" on:click={() => dispatch('agenda')}>View all {data.overdueTasks.length} in Agenda</button>
              {/if}
            </section>
          {/if}

          {#if data.todayTasks.length === 0 && data.pinnedTasks.length === 0 && data.overdueTasks.length === 0}
            <div class="all-good">All caught up — nothing due today, pinned, or overdue.</div>
          {/if}
        </div>

      </div>
    </div>
  {/if}
</div>

{#if detailTask && detailProject}
  {#key detailTask._id + ':' + detailOpenSession}
    <CardDetail
      task={detailTask}
      project={detailProject}
      on:close={async () => { detailTask = null; detailProject = null; await reloadTasks(); await load(); }}
      on:openRelated={(e) => openRelatedTask(e.detail)}
    />
  {/key}
{/if}

<style>
  .dash { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .dash-header {
    /* flex-start, not center: centering against the whole title-block puts
       the hamburger at a different vertical spot depending on how many
       subtitle lines a page has (Dashboard's 3 vs Agenda/Focus's 1). Top
       alignment plus the hamburger's own small top margin lines it up with
       the title's first line on every page. */
    display: flex; align-items: flex-start; gap: 10px;
    padding: 20px 28px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .title-block { min-width: 0; }
  .dash-title { margin: 0 0 3px; font-size: 20px; font-weight: 700; letter-spacing: -.015em; }
  .dash-sub { font-family: var(--mono); font-size: 11px; color: var(--faint); display: block; }
  .dash-week { margin-top: 2px; }

  .hamburger {
    display: none;
    background: none; border: none; cursor: pointer;
    color: var(--text); padding: 4px; border-radius: 6px; margin-top: 1px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background var(--dur-hover) var(--ease-hover);
  }
  .hamburger:hover { background: var(--hover); }

  .palette-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; margin-left: auto; flex-shrink: 0;
    background: none; border: 1px solid var(--border-strong); border-radius: 8px;
    color: var(--muted); cursor: pointer; transition: color var(--dur-hover) var(--ease-hover), background var(--dur-hover) var(--ease-hover);
    /* header is align-items:flex-start, but this button sits centered
       against the row rather than pinned to the top like the (multi-line)
       title block. */
    align-self: center;
  }
  .palette-btn:hover { color: var(--text); background: var(--hover); }

  .dash-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px 32px;
    display: flex; flex-direction: column;
  }

  /* "Daily Brief" card, full-width above the two-column layout. */
  .brief {
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px 20px; margin-bottom: 20px; cursor: pointer;
    display: flex; flex-direction: column; gap: 8px;
    transition: border-color var(--dur-hover) var(--ease-hover), box-shadow var(--dur-hover) var(--ease-hover);
  }
  .brief:hover { border-color: var(--accent); box-shadow: 0 4px 12px rgba(0,0,0,.09); }
  .brief-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .brief-label {
    font-family: var(--mono); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .08em; font-weight: 700; color: var(--faint);
  }
  .brief-count { font-family: var(--mono); font-size: 11.5px; color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
  .brief-empty { font-size: 13px; color: var(--faint); }
  .brief-tasks { display: flex; flex-wrap: wrap; gap: 8px 16px; }
  .brief-task {
    font-size: 13.5px; color: var(--text); position: relative; padding-left: 16px;
  }
  .brief-task::before {
    content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    width: 8px; height: 8px; border-radius: 50%; border: 1.6px solid var(--border-strong);
  }
  .brief-task.done { color: var(--faint); text-decoration: line-through; }
  .brief-task.done::before { background: var(--success); border-color: var(--success); }

  /* Two-column layout: projects left, tasks right */
  .dash-cols {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 24px;
    flex: 1;
  }

  .col-projects { display: flex; flex-direction: column; }
  .col-tasks { display: flex; flex-direction: column; gap: 20px; }

  .section { display: flex; flex-direction: column; }

  /* Deliberately understated: a secondary "there's more" affordance, not a
     call to action competing with the task rows themselves. */
  .view-all {
    background: none; border: none; cursor: pointer;
    color: var(--faint); opacity: .7;
    font-size: 11px; padding: 8px 12px 0; text-align: left;
    transition: opacity var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .view-all:hover { opacity: 1; color: var(--muted); }

  .section-title {
    font-family: var(--mono); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .08em; font-weight: 700; color: var(--faint);
    margin-bottom: 10px;
  }
  /* Pinned/overdue are signalled through color alone here, matching every
     other view — no ★/⚠ glyphs. */
  .pinned-title { color: var(--accent); }
  .overdue-title { color: var(--danger); }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    grid-auto-rows: minmax(130px, auto);
    gap: 12px;
    align-content: start;
    /* Don't add align-items:start here. Cards must keep the default
       stretch so each row's cards match its tallest sibling — with an
       uneven number of stat badges per card, start-alignment gives a
       ragged grid. Title-height variance is already handled by
       .proj-name's min-height below. */
  }
  .proj-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 18px 20px; cursor: pointer;
    transition: border-color var(--dur-hover) var(--ease-hover), box-shadow var(--dur-hover) var(--ease-hover), transform var(--dur-hover) var(--ease-hover);
    display: flex; flex-direction: column; gap: 8px;
  }
  .proj-card:hover { border-color: var(--accent); box-shadow: 0 4px 12px rgba(0,0,0,.09); transform: translateY(-1px); }

  .proj-card-top { display: flex; align-items: center; gap: 6px; }
  .space-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  /* Task count in the card's top-right corner, same pill language as
     Kanban's column-header count. margin-left:auto rather than a spacer
     div, so it works whether or not the space-dot/name are present. */
  .task-count {
    margin-left: auto; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 20px; height: 20px; padding: 0 .4rem;
    font-family: var(--mono); font-size: .68rem; font-weight: 600;
    color: var(--muted); background: var(--hover); border-radius: 20px;
  }
  /* Wrap, never truncate. min-width:0 is required for a flex child to wrap
     instead of overflowing its row (flex items default to a content-based
     min-width). The grid's grid-auto-rows: minmax(130px, auto) absorbs the
     resulting variable heights. */
  .space-name { font-family: var(--mono); font-size: 10px; color: var(--faint); text-transform: uppercase; letter-spacing: .05em; min-width: 0; overflow-wrap: break-word; }
  /* min-height reserves 2 lines' worth of title height unconditionally, so
     every card budgets the same space whether or not its title wraps and
     the grid stays uniform without truncating 2-line titles. */
  .proj-name { font-size: 16px; font-weight: 700; line-height: 1.3; min-height: 2.6em; color: var(--text); overflow-wrap: break-word; margin-top: 2px; }
  /* Chips, not bare wrapped text — at narrow card widths plain text runs
     wrap onto separate lines with uneven spacing. Pill chips still wrap,
     but each reads as one self-contained unit. */
  .proj-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: auto; padding-top: 8px; }
  .stat {
    font-family: var(--mono); font-size: 11px; color: var(--muted);
    display: inline-flex; align-items: center; gap: 3px;
    padding: 3px 8px; border-radius: 20px; background: var(--hover);
    white-space: nowrap;
  }
  .pinned-stat { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .overdue-stat { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }

  .task-list { display: flex; flex-direction: column; gap: 1px; background: var(--border); border-radius: 10px; overflow: hidden; }
  .task-row {
    display: flex; align-items: stretch; gap: 9px;
    padding: 9px 12px; background: var(--surface);
    cursor: pointer; transition: background var(--dur-hover) var(--ease-hover);
  }
  .task-row:hover { background: var(--hover); }
  /* align-self:stretch, not a fixed height — titles wrap rather than
     truncate, so row height varies; stretching keeps this a full edge
     accent at any row height. */
  .prio-bar { width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }
  /* Title on one line, project/date on a second (primary/secondary list-row
     pattern) — cramming all three onto one line inside the 320px right
     column forces heavy truncation. */
  .task-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .task-title { font-size: 13px; font-weight: 500; color: var(--text); overflow-wrap: break-word; }
  .task-proj {
    font-family: var(--mono); font-size: 10px; color: var(--faint);
    overflow-wrap: break-word;
  }
  .task-due { color: var(--muted); }
  .task-due.overdue { color: var(--danger); }

  .all-good { color: var(--faint); font-size: 13px; padding: 6px 0; }
  .no-projects { grid-column: 1 / -1; color: var(--faint); font-size: 13px; padding: 6px 0; }
  .loading { display: flex; align-items: center; justify-content: center; gap: 9px; padding: 3rem; color: var(--faint); font-family: var(--mono); font-size: .8rem; }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    /* minmax(0, 1fr), not bare 1fr — a bare fr track's implicit minimum
       is auto (= its content's max-content size), so it doesn't actually
       clamp to the container width — at a 375px viewport a bare 1fr track
       grows past its own container and clips the second card column with
       no way to reach it. */
    .dash-cols { grid-template-columns: minmax(0, 1fr); }
    .col-tasks { gap: 16px; }
  }
  @media (max-width: 768px), (max-height: 500px) and (orientation: landscape) {
    .hamburger { display: flex; }
  }
  @media (max-width: 600px) {
    .dash-header { padding: 14px 16px 10px; }
    .dash-body { padding: 14px 14px 32px; }
    .project-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
  }
</style>
