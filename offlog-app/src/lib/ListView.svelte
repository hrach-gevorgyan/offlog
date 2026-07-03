<script lang="ts">
  import type { ProjectDoc, TaskDoc } from './types';
  import { updateTask, unarchiveTask, getArchivedTasksForProject } from './db';
  import { reloadTasks, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
  import { dueLabel, dueInk, filterTasks } from './utils';
  import CardDetail from './CardDetail.svelte';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];

  // Rewritten from scratch (2026-07-03, owner decision) after the first
  // List/Table merge produced a cramped hybrid. Design baseline is the old
  // TableView, which the owner judged the better of the two: a real data
  // grid — generous fixed-width columns, a sortable header, and plain
  // colored text for due dates instead of pill badges (text always fits;
  // the badges were the source of repeated clipping bugs). The old List
  // contributes only its interactions: mark-done circle with undo (A22),
  // pinned-tasks-float-to-top, and the archived section.

  let search = '';
  let filterCol = '';
  let filterPrio = 0;
  let filterTag = '';
  let showArchived = false;

  type SortCol = 'title' | 'column' | 'priority' | 'due';
  let sortCol: SortCol = 'due';
  let sortAsc = true;

  const colName = (id: string) => project.columns.find(c => c.id === id)?.name ?? '—';
  const lastColId = () => project.columns.at(-1)?.id ?? '';

  $: allTags = [...new Set(tasks.flatMap(t => t.tags))].sort();

  $: filtered = filterTasks(tasks, search, filterCol, filterPrio, filterTag);

  $: sorted = [...filtered].sort((a, b) => {
    // Pinned tasks stay above everything regardless of the active sort —
    // a List behavior the old Table never had, kept through the merge.
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    let cmp = 0;
    if (sortCol === 'title')    cmp = a.title.localeCompare(b.title);
    if (sortCol === 'column')   cmp = colName(a.column_id).localeCompare(colName(b.column_id));
    if (sortCol === 'priority') cmp = b.priority - a.priority;
    if (sortCol === 'due')      cmp = (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    return sortAsc ? cmp : -cmp;
  });

  function toggleSort(col: SortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = true; }
  }

  function sortIcon(col: SortCol) {
    if (sortCol !== col) return '↕';
    return sortAsc ? '↑' : '↓';
  }

  $: activeFilters = (search ? 1 : 0) + (filterCol ? 1 : 0) + (filterPrio ? 1 : 0) + (filterTag ? 1 : 0);
  function clearFilters() { search = ''; filterCol = ''; filterPrio = 0; filterTag = ''; }

  let detailTask: TaskDoc | null = null;

  let archivedTasks: TaskDoc[] = [];
  $: if (showArchived) {
    getArchivedTasksForProject(project._id).then(t => { archivedTasks = t; });
  } else {
    archivedTasks = [];
  }

  // A22: the mark-done circle is a single click with no confirmation — an
  // accidental click previously had no way back short of reopening the
  // card and changing status manually. Remember the task's prior
  // column_id briefly so a mis-click can be undone with one tap, matching
  // the undo pattern already used for deletion (App.svelte's undo toast).
  let undoMarkDone: { id: string; title: string; fromColId: string; timer: any } | null = null;

  async function markDone(task: TaskDoc) {
    const fromColId = task.column_id;
    try {
      await updateTask(task._id!, { column_id: lastColId() });
      await reloadTasks();
    } catch {
      showError('Failed to update task. Please try again.');
      return;
    }
    if (undoMarkDone) clearTimeout(undoMarkDone.timer);
    const timer = setTimeout(() => { undoMarkDone = null; }, 5000);
    undoMarkDone = { id: task._id!, title: task.title, fromColId, timer };
  }

  async function undoLastMarkDone() {
    if (!undoMarkDone) return;
    const { id, fromColId, timer } = undoMarkDone;
    clearTimeout(timer);
    undoMarkDone = null;
    try {
      await updateTask(id, { column_id: fromColId });
      await reloadTasks();
    } catch {
      showError('Failed to undo. Please try again.');
    }
  }
</script>

<div class="list-wrap">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="search-box">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/>
      </svg>
      <input class="search-input" bind:value={search} placeholder="Search tasks…" />
      {#if search}<button class="clear-x" on:click={() => search = ''}>×</button>{/if}
    </div>

    <select class="filter-sel" bind:value={filterCol}>
      <option value="">All statuses</option>
      {#each project.columns as col}
        <option value={col.id}>{col.name}</option>
      {/each}
    </select>

    {#if allTags.length}
      <select class="filter-sel" bind:value={filterTag}>
        <option value="">All tags</option>
        {#each allTags as t}<option value={t}>{t}</option>{/each}
      </select>
    {/if}

    <div class="prio-chips">
      {#each [[0,'All'],[1,'Low'],[2,'Med'],[3,'High']] as [v,label]}
        <button class="prio-chip" class:active={filterPrio === v} on:click={() => filterPrio = filterPrio === v ? 0 : v}>
          {#if v !== 0}<span class="chip-dot" style="background:{PRIO_COLOR[v]}"></span>{/if}
          {label}
        </button>
      {/each}
    </div>

    {#if activeFilters > 0}
      <button class="clear-all" on:click={clearFilters}>Clear filters ({activeFilters})</button>
    {/if}

    <button class="archive-toggle" class:active={showArchived} on:click={() => showArchived = !showArchived} title="Show archived tasks">
      <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="1" width="12" height="3" rx="1"/><path d="M2 4v8a1 1 0 001 1h8a1 1 0 001-1V4"/><line x1="5" y1="7" x2="9" y2="7"/>
      </svg>
      Archived
    </button>
  </div>

  <!-- Data grid -->
  <div class="grid-card">
    <div class="grid-head">
      <span class="head-spacer"></span>
      <button class="th-btn th-title" on:click={() => toggleSort('title')}>Title <span class="sort-icon">{sortIcon('title')}</span></button>
      <button class="th-btn th-status" on:click={() => toggleSort('column')}>Status <span class="sort-icon">{sortIcon('column')}</span></button>
      <button class="th-btn th-prio" on:click={() => toggleSort('priority')}>Priority <span class="sort-icon">{sortIcon('priority')}</span></button>
      <button class="th-btn th-due" on:click={() => toggleSort('due')}>Due <span class="sort-icon">{sortIcon('due')}</span></button>
      <span class="th-static th-tags">Tags</span>
    </div>

    {#each sorted as task (task._id)}
      <div
        class="grid-row"
        style="--prio-color:{PRIO_COLOR[task.priority]}"
        role="button"
        tabindex="0"
        on:click={() => detailTask = task}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detailTask = task; } }}
      >
        <button
          class="circle"
          class:done={task.column_id === lastColId()}
          title="Move to last status"
          aria-label="Move to last status"
          on:click|stopPropagation={() => markDone(task)}
        ></button>
        <span class="cell-title">
          {task.title}{#if task.pinned}<span class="pin-mark"><svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" stroke="none"><polygon points="8,1.5 9.8,6 14.5,6.3 11,9.4 12.1,14 8,11.3 3.9,14 5,9.4 1.5,6.3 6.2,6"/></svg></span>{/if}
        </span>
        <span class="cell-status">{colName(task.column_id)}</span>
        <span class="cell-prio">
          <span class="prio-dot" style="background:{PRIO_COLOR[task.priority]}"></span>
          {PRIO_LABEL[task.priority]}
        </span>
        <span class="cell-due" style="color:{dueInk(task.due_date)}">{dueLabel(task.due_date, '—')}</span>
        <span class="cell-tags">
          {#each task.tags as tag}
            <span class="tag">{tag}</span>
          {/each}
        </span>
      </div>
    {/each}

    {#if sorted.length === 0}
      <div class="empty">
        {#if activeFilters > 0}No tasks match the current filters.{:else}No tasks yet — add one from the kanban view.{/if}
      </div>
    {/if}
  </div>

  {#if showArchived && archivedTasks.length > 0}
    <div class="archived-section">
      <div class="archived-label">Archived ({archivedTasks.length})</div>
      <div class="grid-card">
        {#each archivedTasks as task (task._id)}
          <div class="archived-row" style="--prio-color:{PRIO_COLOR[task.priority]}">
            <span class="archived-title">{task.title}</span>
            <span class="cell-status">{colName(task.column_id)}</span>
            <button class="unarchive-btn" on:click={async () => {
              try {
                await unarchiveTask(task._id!);
                await reloadTasks();
                archivedTasks = await getArchivedTasksForProject(project._id);
              } catch {
                showError('Failed to restore task. Please try again.');
              }
            }}>Restore</button>
          </div>
        {/each}
      </div>
    </div>
  {:else if showArchived}
    <div class="empty" style="padding: 1rem 0">No archived tasks in this project.</div>
  {/if}
</div>

{#if undoMarkDone}
  <div class="undo-toast">
    <span>Marked "{undoMarkDone.title}" done</span>
    <button class="undo-btn" on:click={undoLastMarkDone}>Undo</button>
  </div>
{/if}

{#if detailTask}
  <CardDetail
    task={detailTask}
    {project}
    on:close={async () => { detailTask = null; await reloadTasks(); }}
  />
{/if}

<style>
  .list-wrap { flex: 1; overflow-y: auto; padding: 20px 28px; }

  /* ── Toolbar ─────────────────────────────────────────────────────────── */
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 12px; flex-wrap: wrap; max-width: 1080px;
  }

  .search-box {
    display: flex; align-items: center; gap: 7px;
    background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: 8px; padding: 6px 10px;
    flex: 1; min-width: 160px; max-width: 240px;
  }
  .search-box svg { color: var(--faint); flex-shrink: 0; }
  .search-input {
    border: none; background: none; font-size: 13px; color: var(--text);
    width: 100%; outline: none;
  }
  .search-input::placeholder { color: var(--faint); }
  .clear-x {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 14px; padding: 0; line-height: 1;
  }
  .clear-x:hover { color: var(--text); }

  .filter-sel {
    border: 1px solid var(--border-strong); border-radius: 8px;
    background: var(--surface); color: var(--text);
    font-size: 12.5px; padding: 6px 10px; cursor: pointer; outline: none;
  }

  .prio-chips { display: flex; gap: 3px; }
  .prio-chip {
    display: flex; align-items: center; gap: 5px;
    border: 1px solid var(--border-strong); border-radius: 7px;
    background: var(--surface); color: var(--muted);
    font-size: 12px; font-weight: 500; padding: 5px 9px;
    cursor: pointer; transition: background .1s, color .1s, border-color .1s;
  }
  .prio-chip.active { background: var(--text); color: var(--bg); border-color: var(--text); }
  .chip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .clear-all {
    background: none; border: 1px solid var(--border-strong); border-radius: 7px;
    color: var(--muted); font-size: 11.5px; padding: 5px 10px; cursor: pointer;
    transition: color .12s, border-color .12s;
  }
  .clear-all:hover { color: var(--danger); border-color: var(--danger); }

  .archive-toggle {
    display: flex; align-items: center; gap: 5px;
    background: none; border: 1px solid var(--border-strong); border-radius: 7px;
    color: var(--muted); font-size: 11.5px; font-weight: 500; padding: 5px 10px; cursor: pointer;
    transition: color .12s, border-color .12s, background .12s;
  }
  .archive-toggle:hover, .archive-toggle.active { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }

  /* ── Data grid ───────────────────────────────────────────────────────── */
  /* Column plan (desktop): circle 24px · title flexible (min 220px) ·
     status 120px · priority 100px · due 130px · tags flexible-capped.
     Due dates are plain colored mono text (dueInk), never pill badges —
     text can't be clipped by a background shape, and the widest string
     ("Overdue · Feb 22") fits 130px at 11.5px mono with room to spare.
     Capped at 1080px overall so a wide monitor doesn't stretch the title
     column into a huge dead gap between title and the data columns. */
  .grid-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 13px;
    overflow: hidden; max-width: 1080px;
  }

  .grid-head, .grid-row {
    display: grid;
    grid-template-columns: 24px minmax(220px, 1fr) 120px 100px 130px minmax(140px, 200px);
    gap: 14px; align-items: center;
  }

  .grid-head {
    padding: 0 16px;
    background: var(--col-bg); border-bottom: 1px solid var(--border);
    /* Mirrors .grid-row's priority stripe so header and row columns align. */
    border-left: 3px solid transparent;
  }
  .head-spacer { width: 24px; }
  .th-btn, .th-static {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--faint); text-align: left;
  }
  .th-btn {
    background: none; border: none; cursor: pointer; padding: 11px 0;
    display: flex; align-items: center; gap: 5px; transition: color .12s;
  }
  .th-btn:hover { color: var(--text); }
  .sort-icon { font-size: 10px; opacity: .6; }

  .grid-row {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--prio-color, var(--border));
    cursor: pointer; transition: background .1s;
  }
  .grid-row:last-child { border-bottom: none; }
  .grid-row:hover { background: var(--hover); }

  .circle {
    width: 19px; height: 19px; border-radius: 50%;
    background: none; padding: 0;
    border: 1.6px solid var(--border-strong); flex-shrink: 0; cursor: pointer;
    transition: border-color .12s, background .12s; display: block;
  }
  .circle:hover { border-color: var(--accent); }
  .circle.done { background: var(--success); border-color: var(--success); }

  .cell-title {
    font-size: 14px; font-weight: 500; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    min-width: 0;
  }
  .pin-mark { display: inline-flex; align-items: center; color: var(--accent); opacity: .8; vertical-align: middle; margin-left: 4px; }

  .cell-status {
    color: var(--muted); font-size: 12.5px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .cell-prio { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 12.5px; white-space: nowrap; }
  .prio-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .cell-due { font-family: var(--mono); font-size: 11.5px; white-space: nowrap; }

  /* Tags wrap onto extra lines rather than clipping — every tag stays
     readable; a many-tagged row just gets a little taller. */
  .cell-tags { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
  .tag {
    font-size: 11px; color: var(--muted); background: var(--col-bg);
    padding: 2px 8px; border-radius: 6px; white-space: nowrap;
  }

  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }

  /* ── Archived ────────────────────────────────────────────────────────── */
  .archived-section { padding: 16px 0 0; }
  .archived-label {
    font-family: var(--mono); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .08em; color: var(--faint); font-weight: 700;
    padding: 0 4px 8px;
  }
  /* Archived rows have a different, shorter set of children (no circle,
     priority, tags, or due) — a simple flex row, not the grid. */
  .archived-row {
    display: flex; align-items: center; gap: 13px;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--prio-color, var(--border));
    opacity: .6;
  }
  .archived-row:last-child { border-bottom: none; }
  .archived-row:hover { opacity: .85; background: var(--hover); }
  .archived-title { flex: 1; min-width: 0; text-decoration: line-through; color: var(--muted); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .unarchive-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px;
    color: var(--muted); font-size: 11px; padding: 3px 8px; cursor: pointer;
    white-space: nowrap; flex-shrink: 0; transition: color .12s, border-color .12s;
  }
  .unarchive-btn:hover { color: var(--accent); border-color: var(--accent); }

  /* ── Undo toast (A22) — matches App.svelte's delete-undo toast ───────── */
  .undo-toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px; z-index: 999;
    background: var(--text); color: var(--bg);
    padding: 11px 14px; border-radius: 10px;
    font-size: 13.5px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,.25);
    white-space: nowrap;
    animation: undo-toast-in .22s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes undo-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
  .undo-btn {
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;
    transition: opacity .12s;
  }
  .undo-btn:hover { opacity: .85; }

  /* ── Responsive ──────────────────────────────────────────────────────── */
  /* Media queries stay AFTER the base rules deliberately (A20 lesson): a
     media query has the same specificity as an unconditional rule for the
     same selector, so whichever comes later in source order wins — an
     early media block silently loses to base rules declared below it. */

  /* Mid-width: not enough room for six columns — drop tags first, they're
     the least scannable column and still visible in the card editor. */
  @media (max-width: 1020px) {
    .grid-head, .grid-row { grid-template-columns: 24px minmax(200px, 1fr) 110px 95px 125px; }
    .th-tags, .cell-tags { display: none; }
  }

  /* Phone: circle · title · due. Status/priority live in the card editor;
     the priority stripe on the row edge still shows priority at a glance. */
  @media (max-width: 768px) {
    .list-wrap { padding: 14px 14px; }
    .search-box { max-width: 100%; }
    .grid-head, .grid-row { grid-template-columns: 24px minmax(0, 1fr) max-content; }
    .th-status, .cell-status, .th-prio, .cell-prio, .th-tags, .cell-tags { display: none; }
  }
</style>
