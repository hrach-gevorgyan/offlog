<script lang="ts">
  import type { ProjectDoc, TaskDoc } from './types';
  import { updateTask, archiveTask, unarchiveTask, getArchivedTasksForProject } from './db';
  import { reloadTasks } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR } from './constants';
  import { dueLabel, dueState, filterTasks } from './utils';
  import CardDetail from './CardDetail.svelte';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];

  type SortKey = 'due' | 'priority';
  let sortKey: SortKey = 'due';
  let search = '';
  let filterCol = '';
  let filterPrio = 0;
  let filterTag = '';
  let showArchived = false;

  const colName = (id: string) => project.columns.find(c => c.id === id)?.name ?? '—';

  $: allTags = [...new Set(tasks.flatMap(t => t.tags))].sort();

  $: filtered = filterTasks(tasks, search, filterCol, filterPrio, filterTag);

  $: sorted = [...filtered].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    if (sortKey === 'priority') {
      const pd = b.priority - a.priority;
      if (pd !== 0) return pd;
      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    }
    return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  });

  const lastColId = () => project.columns.at(-1)?.id ?? '';

  let detailTask: TaskDoc | null = null;
  let archivedTasks: TaskDoc[] = [];

  $: if (showArchived) {
    getArchivedTasksForProject(project._id).then(t => { archivedTasks = t; });
  } else {
    archivedTasks = [];
  }

  $: activeFilters = (search ? 1 : 0) + (filterCol ? 1 : 0) + (filterPrio ? 1 : 0) + (filterTag ? 1 : 0);
  function clearFilters() { search = ''; filterCol = ''; filterPrio = 0; filterTag = ''; }
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

    <div class="sort-group">
      <span class="sort-label">Sort</span>
      <div class="seg">
        <button class="seg-btn" class:active={sortKey === 'due'} on:click={() => sortKey = 'due'}>Due</button>
        <button class="seg-btn" class:active={sortKey === 'priority'} on:click={() => sortKey = 'priority'}>Priority</button>
      </div>
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

  <!-- Task list -->
  <div class="task-list">
    {#each sorted as task (task._id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="task-row" style="--prio-color:{PRIO_COLOR[task.priority]}" on:click={() => detailTask = task}>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <span
          class="circle"
          class:done={task.column_id === lastColId()}
          title="Move to last status"
          on:click|stopPropagation={async () => {
            await updateTask(task._id!, { column_id: lastColId() });
            await reloadTasks();
          }}
        ></span>
        <span class="task-title">{task.title}{#if task.pinned} <span class="pin-mark"><svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" stroke="none"><polygon points="8,1.5 9.8,6 14.5,6.3 11,9.4 12.1,14 8,11.3 3.9,14 5,9.4 1.5,6.3 6.2,6"/></svg></span>{/if}</span>
        {#each task.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
        <span class="col-name">{colName(task.column_id)}</span>
        {#if task.due_date}
          <span class="due-badge state-{dueState(task.due_date)}">{dueLabel(task.due_date)}</span>
        {:else}
          <span class="due-spacer"></span>
        {/if}
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
      <div class="task-list">
        {#each archivedTasks as task (task._id)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="task-row archived-row" style="--prio-color:{PRIO_COLOR[task.priority]}">
            <span class="task-title archived-title">{task.title}</span>
            <span class="col-name">{colName(task.column_id)}</span>
            <button class="unarchive-btn" on:click={async () => {
              await unarchiveTask(task._id!);
              await reloadTasks();
              archivedTasks = await getArchivedTasksForProject(project._id);
            }}>Restore</button>
          </div>
        {/each}
      </div>
    </div>
  {:else if showArchived}
    <div class="empty" style="padding: 1rem 0">No archived tasks in this project.</div>
  {/if}
</div>

{#if detailTask}
  <CardDetail
    task={detailTask}
    {project}
    on:close={async () => { detailTask = null; await reloadTasks(); }}
  />
{/if}

<style>
  .list-wrap { flex: 1; overflow-y: auto; padding: 20px 28px; }
  @media (max-width: 768px) {
    .list-wrap { padding: 14px 14px; }
    .search-box { max-width: 100%; }
    .col-name { display: none; }
    .due-spacer { display: none; }
  }

  /* Toolbar */
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 12px; flex-wrap: wrap;
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

  .sort-group { display: flex; align-items: center; gap: 7px; margin-left: 4px; }
  .sort-label { font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
  .seg { display: inline-flex; gap: 2px; background: var(--col-bg); border: 1px solid var(--border-strong); border-radius: 8px; padding: 2px; }
  .seg-btn {
    border: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600;
    padding: 5px 10px; border-radius: 6px; white-space: nowrap;
    background: transparent; color: var(--muted); transition: background .12s, color .12s, box-shadow .12s;
  }
  .seg-btn.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.10); }

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
  .archive-toggle:hover, .archive-toggle.active { color: var(--accent); border-color: var(--accent); background: rgba(93,155,255,.07); }

  .archived-section { padding: 16px 0 0; }
  .archived-label {
    font-family: var(--mono); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .08em; color: var(--faint); font-weight: 700;
    padding: 0 4px 8px;
  }
  .archived-row { opacity: .6; cursor: default; }
  .archived-row:hover { opacity: .85; background: var(--hover); }
  .archived-title { text-decoration: line-through; color: var(--muted) !important; }
  .unarchive-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px;
    color: var(--muted); font-size: 11px; padding: 3px 8px; cursor: pointer;
    white-space: nowrap; flex-shrink: 0; transition: color .12s, border-color .12s;
  }
  .unarchive-btn:hover { color: var(--accent); border-color: var(--accent); }

  /* Task list */
  .task-list { background: var(--surface); border: 1px solid var(--border); border-radius: 13px; overflow: hidden; }

  .task-row {
    display: flex; align-items: center; gap: 13px;
    padding: 13px 16px; border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--prio-color, var(--border));
    cursor: pointer; transition: background .1s;
  }
  .task-row:last-child { border-bottom: none; }
  .task-row:hover { background: var(--hover); }

  .circle {
    width: 19px; height: 19px; border-radius: 50%;
    border: 1.6px solid var(--border-strong); flex-shrink: 0; cursor: pointer;
    transition: border-color .12s, background .12s; display: block;
  }
  .circle:hover { border-color: var(--accent); }
  .circle.done { background: #22c55e; border-color: #22c55e; }

  .task-title {
    flex: 1; min-width: 0; font-size: 14px; font-weight: 500; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .pin-mark { display: inline-flex; align-items: center; color: var(--accent); opacity: .8; vertical-align: middle; margin-left: 3px; }
  .tag { font-size: 11px; color: var(--muted); background: var(--col-bg); padding: 2px 8px; border-radius: 6px; white-space: nowrap; }

  .col-name { font-family: var(--mono); font-size: 11px; color: var(--faint); width: 84px; text-align: right; white-space: nowrap; flex-shrink: 0; }

  .due-badge {
    font-family: var(--mono); font-size: 11px; font-weight: 500;
    padding: 3px 9px; border-radius: 6px; min-width: 74px;
    text-align: center; white-space: nowrap; flex-shrink: 0;
    background: var(--col-bg); color: var(--muted);
  }
  .due-badge.state-overdue { background: var(--overdue-bg); color: var(--overdue-ink); }
  .due-badge.state-soon    { background: var(--due-soon-bg); color: var(--due-soon-ink); }

  .due-spacer { width: 74px; flex-shrink: 0; }

  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }
</style>
