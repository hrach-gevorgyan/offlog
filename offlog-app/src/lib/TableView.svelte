<script lang="ts">
  import type { ProjectDoc, TaskDoc } from './types';
  import { reloadTasks } from './store';
  import CardDetail from './CardDetail.svelte';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];

  let search = '';
  let filterCol = '';
  let filterPrio = 0;
  let filterTag = '';
  type SortCol = 'title' | 'priority' | 'due' | 'column';
  let sortCol: SortCol = 'title';
  let sortAsc = true;

  const colName = (id: string) => project.columns.find(c => c.id === id)?.name ?? '—';
  const today = new Date().toISOString().slice(0, 10);

  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';

  function dueLabel(due: string | null): string {
    if (!due) return '—';
    const days = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
    const d = new Date(due);
    const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (days < 0) return 'Overdue · ' + short;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return short;
  }

  function dueInk(due: string | null): string {
    if (!due) return 'var(--faint)';
    const days = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
    if (days < 0) return 'var(--overdue-ink)';
    if (days <= 1) return 'var(--due-soon-ink)';
    return 'var(--muted)';
  }

  $: allTags = [...new Set(tasks.flatMap(t => t.tags))].sort();

  $: filtered = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCol && t.column_id !== filterCol) return false;
    if (filterPrio && t.priority !== filterPrio) return false;
    if (filterTag && !t.tags.includes(filterTag)) return false;
    return true;
  });

  $: sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'title')    cmp = a.title.localeCompare(b.title);
    if (sortCol === 'priority') cmp = b.priority - a.priority;
    if (sortCol === 'due')      cmp = (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    if (sortCol === 'column')   cmp = colName(a.column_id).localeCompare(colName(b.column_id));
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
</script>

<div class="table-wrap">
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
      {#each [[0,'All'],[1,'Low'],[2,'Med'],[3,'High']] as [v, label]}
        <button class="prio-chip" class:active={filterPrio === v} on:click={() => filterPrio = filterPrio === v ? 0 : v}>
          {#if v !== 0}<span class="chip-dot" style="background:{PRIO_COLOR[v]}"></span>{/if}
          {label}
        </button>
      {/each}
    </div>

    {#if activeFilters > 0}
      <button class="clear-all" on:click={clearFilters}>Clear filters ({activeFilters})</button>
    {/if}
  </div>

  <div class="tbl-card">
    <!-- Header row -->
    <div class="tbl-head">
      <button class="col-title th-btn" on:click={() => toggleSort('title')}>Title <span class="sort-icon">{sortIcon('title')}</span></button>
      <button class="col-col th-btn" on:click={() => toggleSort('column')}>Status <span class="sort-icon">{sortIcon('column')}</span></button>
      <button class="col-pri th-btn" on:click={() => toggleSort('priority')}>Priority <span class="sort-icon">{sortIcon('priority')}</span></button>
      <button class="col-due th-btn" on:click={() => toggleSort('due')}>Due <span class="sort-icon">{sortIcon('due')}</span></button>
      <span class="col-tags">Tags</span>
    </div>

    <!-- Data rows -->
    {#each sorted as task (task._id)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="tbl-row" on:click={() => detailTask = task}>
        <span class="cell-title">{task.title}</span>
        <span class="cell-col">{colName(task.column_id)}</span>
        <span class="cell-pri">
          <span class="prio-dot" style="background:{PRIO_COLOR[task.priority]}"></span>
          {PRIO_LABEL[task.priority]}
        </span>
        <span class="cell-due" style="color:{dueInk(task.due_date)}">{dueLabel(task.due_date)}</span>
        <span class="cell-tags">
          {#each task.tags as tag}
            <span class="tag">{tag}</span>
          {/each}
        </span>
      </div>
    {/each}

    {#if sorted.length === 0}
      <div class="empty">
        {#if activeFilters > 0}No tasks match the current filters.{:else}No tasks yet.{/if}
      </div>
    {/if}
  </div>
</div>

{#if detailTask}
  <CardDetail
    task={detailTask}
    {project}
    on:close={async () => { detailTask = null; await reloadTasks(); }}
  />
{/if}

<style>
  .table-wrap { flex: 1; overflow: auto; padding: 20px 28px; }
  @media (max-width: 768px) {
    .table-wrap { padding: 14px 14px; }
    .search-box { max-width: 100%; }
    .tbl-head, .tbl-row { grid-template-columns: minmax(160px,1fr) 90px 80px; }
    .col-due, .col-tags, .cell-due, .cell-tags { display: none; }
  }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }

  .search-box {
    display: flex; align-items: center; gap: 7px;
    background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: 8px; padding: 6px 10px;
    flex: 1; min-width: 160px; max-width: 240px;
  }
  .search-box svg { color: var(--faint); flex-shrink: 0; }
  .search-input { border: none; background: none; font-size: 13px; color: var(--text); width: 100%; outline: none; }
  .search-input::placeholder { color: var(--faint); }
  .clear-x { background: none; border: none; cursor: pointer; color: var(--faint); font-size: 14px; padding: 0; line-height: 1; }
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

  /* Table */
  .tbl-card { background: var(--surface); border: 1px solid var(--border); border-radius: 13px; overflow: hidden; }

  .tbl-head {
    display: grid;
    grid-template-columns: minmax(260px,1fr) 130px 110px 120px 200px;
    align-items: center;
    padding: 0 18px;
    background: var(--col-bg);
    border-bottom: 1px solid var(--border);
  }

  .th-btn {
    background: none; border: none; cursor: pointer;
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--faint); padding: 11px 0; text-align: left;
    display: flex; align-items: center; gap: 5px;
    transition: color .12s;
  }
  .th-btn:hover { color: var(--text); }
  .col-tags { font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
  .sort-icon { font-size: 10px; opacity: .6; }

  .tbl-row {
    display: grid;
    grid-template-columns: minmax(260px,1fr) 130px 110px 120px 200px;
    align-items: center;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    cursor: pointer; font-size: 13.5px; transition: background .1s;
  }
  .tbl-row:last-child { border-bottom: none; }
  .tbl-row:hover { background: var(--hover); }

  .cell-title { font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 14px; }
  .cell-col { color: var(--muted); font-size: 12.5px; }
  .cell-pri { display: inline-flex; align-items: center; gap: 7px; color: var(--text); font-size: 12.5px; }
  .prio-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .cell-due { font-family: var(--mono); font-size: 11.5px; }
  .cell-tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-size: 11px; color: var(--muted); background: var(--col-bg); padding: 2px 8px; border-radius: 6px; }

  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }
</style>
