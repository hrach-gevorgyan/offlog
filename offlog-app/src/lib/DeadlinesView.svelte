<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getAllTasksDue, updateTask, subscribe } from './db';
  import { projects, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
  import { dueLabelLong, dueRelative } from './utils';
  import CardDetail from './CardDetail.svelte';
  import type { TaskDoc, ProjectDoc } from './types';

  const dispatch = createEventDispatcher<{ menu: void }>();

  type DueTask = TaskDoc & { project_name?: string };

  let all: DueTask[] = [];
  let detailTask: DueTask | null = null;
  let detailProject: ProjectDoc | null = null;

  const today = new Date().toISOString().slice(0, 10);

  function startOfWeek(): string {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }

  function endOfWeek(): string {
    const d = new Date();
    d.setDate(d.getDate() + (6 - d.getDay()));
    return d.toISOString().slice(0, 10);
  }

  async function load() { all = await getAllTasksDue(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  $: overdue   = all.filter(t => t.due_date! < today);
  $: dueToday  = all.filter(t => t.due_date === today);
  $: thisWeek  = all.filter(t => t.due_date! > today && t.due_date! <= endOfWeek());
  $: later     = all.filter(t => t.due_date! > endOfWeek());

  function openDetail(t: DueTask) {
    detailTask = t;
    detailProject = $projects.find(p => p._id === t.project_id) ?? null;
  }

  async function markDone(t: DueTask) {
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) return;
    const lastCol = proj.columns.at(-1)?.id;
    if (!lastCol || t.column_id === lastCol) return;
    try {
      await updateTask(t._id!, { column_id: lastCol });
      await load();
    } catch {
      showError('Failed to update task. Please try again.');
    }
  }
</script>

<div class="deadlines">
  <div class="dl-header">
    <button class="hamburger" on:click={() => dispatch('menu')} aria-label="Menu">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
      </svg>
    </button>
    <div class="title-block">
      <h1 class="dl-title">Agenda</h1>
      <span class="dl-count">{all.length} task{all.length === 1 ? '' : 's'} with due dates</span>
    </div>
  </div>

  <div class="dl-body">
    {#if all.length === 0}
      <div class="empty">No tasks with due dates across any project.</div>
    {:else}

      {#if overdue.length}
        <section>
          <div class="group-label overdue-label">Overdue <span class="badge-count">{overdue.length}</span></div>
          {#each overdue as t (t._id)}
            <div
              class="task-row"
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}" title={PRIO_LABEL[t.priority]}></span>
              <span class="task-title">{t.title}</span>
              <span class="proj-badge">{t.project_name ?? '—'}</span>
              <span class="due-chip overdue">{dueLabelLong(t.due_date!)}</span>
            </div>
          {/each}
        </section>
      {/if}

      {#if dueToday.length}
        <section>
          <div class="group-label today-label">Today <span class="badge-count">{dueToday.length}</span></div>
          {#each dueToday as t (t._id)}
            <div
              class="task-row"
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}" title={PRIO_LABEL[t.priority]}></span>
              <span class="task-title">{t.title}</span>
              <span class="proj-badge">{t.project_name ?? '—'}</span>
              <span class="due-chip today">Today</span>
            </div>
          {/each}
        </section>
      {/if}

      {#if thisWeek.length}
        <section>
          <div class="group-label week-label">This week <span class="badge-count">{thisWeek.length}</span></div>
          {#each thisWeek as t (t._id)}
            <div
              class="task-row"
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}" title={PRIO_LABEL[t.priority]}></span>
              <span class="task-title">{t.title}</span>
              <span class="proj-badge">{t.project_name ?? '—'}</span>
              <span class="due-chip week">{dueRelative(t.due_date!)} · {dueLabelLong(t.due_date!)}</span>
            </div>
          {/each}
        </section>
      {/if}

      {#if later.length}
        <section>
          <div class="group-label later-label">Later <span class="badge-count">{later.length}</span></div>
          {#each later as t (t._id)}
            <div
              class="task-row"
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}" title={PRIO_LABEL[t.priority]}></span>
              <span class="task-title">{t.title}</span>
              <span class="proj-badge">{t.project_name ?? '—'}</span>
              <span class="due-chip later">{dueLabelLong(t.due_date!)}</span>
            </div>
          {/each}
        </section>
      {/if}

    {/if}
  </div>
</div>

{#if detailTask && detailProject}
  <CardDetail
    task={detailTask}
    project={detailProject}
    on:close={async () => { detailTask = null; detailProject = null; await load(); }}
  />
{/if}

<style>
  .deadlines { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .dl-header {
    display: flex; align-items: center; gap: 10px;
    padding: 20px 28px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .title-block { min-width: 0; }
  .dl-title { margin: 0 0 3px; font-size: 20px; font-weight: 700; letter-spacing: -.015em; }
  .dl-count { font-family: var(--mono); font-size: 11px; color: var(--faint); }

  .hamburger {
    display: none;
    background: none; border: none; cursor: pointer;
    color: var(--text); padding: 4px; border-radius: 6px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .hamburger:hover { background: var(--hover); }

  .dl-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px 40px;
    width: 100%; max-width: 900px; box-sizing: border-box;
  }

  .empty { color: var(--faint); font-size: 14px; padding: 12px 0; }

  section { margin-bottom: 24px; }

  .group-label {
    font-family: var(--mono); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .08em; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1.5px solid var(--border);
  }
  .overdue-label { color: var(--overdue-ink); border-color: color-mix(in srgb, var(--overdue-ink) 20%, transparent); }
  .today-label   { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 20%, transparent); }
  .week-label    { color: var(--success); border-color: color-mix(in srgb, var(--success) 20%, transparent); }
  .later-label   { color: var(--faint); }

  .badge-count {
    color: #fff; opacity: .9;
    font-size: 9px; padding: 1px 5px; border-radius: 8px; font-weight: 700;
  }
  /* background can't use currentColor here — that would read the badge's
     own `color` (white) rather than the parent label's color, so each
     variant gets an explicit background matching its label */
  .overdue-label .badge-count { background: var(--overdue-ink); }
  .today-label   .badge-count { background: var(--accent); }
  .week-label    .badge-count { background: var(--success); }
  .later-label   .badge-count { background: var(--faint); }

  .task-row {
    display: grid;
    grid-template-columns: 20px 10px 1fr auto auto;
    align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--surface);
    margin-bottom: 5px; cursor: pointer;
    transition: background .1s, box-shadow .1s;
  }
  .task-row:hover { background: var(--hover); box-shadow: 0 1px 4px rgba(0,0,0,.06); }

  .circle {
    width: 18px; height: 18px; border-radius: 50%;
    background: none; padding: 0;
    border: 1.6px solid var(--border-strong); flex-shrink: 0; cursor: pointer;
    transition: border-color .12s, background .12s; display: block;
  }
  .circle:hover { border-color: var(--accent); background: var(--hover); }

  .prio-dot { width: 8px; height: 8px; border-radius: 50%; }

  .task-title {
    font-size: 14px; font-weight: 500; color: var(--text);
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .proj-badge {
    font-family: var(--mono); font-size: 10px; color: var(--faint);
    background: var(--col-bg); padding: 2px 8px; border-radius: 6px;
    white-space: nowrap;
  }

  .due-chip {
    font-family: var(--mono); font-size: 11px; font-weight: 500;
    padding: 3px 9px; border-radius: 6px; white-space: nowrap;
  }
  .due-chip.overdue { background: var(--overdue-bg); color: var(--overdue-ink); }
  .due-chip.today   { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .due-chip.week    { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
  .due-chip.later   { background: var(--col-bg); color: var(--faint); }

  @media (max-width: 768px) {
    .hamburger { display: flex; }
  }

  /* Medium — hide proj badge */
  @media (max-width: 700px) {
    .dl-header { padding: 14px 16px 10px; }
    .dl-body   { padding: 14px 14px 32px; }
    .dl-title  { font-size: 17px; }
    .task-row  { grid-template-columns: 20px 10px 1fr auto; }
    .proj-badge { display: none; }
  }

  /* Small — collapse chip to short form */
  @media (max-width: 440px) {
    .task-row  { grid-template-columns: 20px 1fr auto; padding: 9px 10px; gap: 8px; }
    .prio-dot  { display: none; }
    .task-title { font-size: 13px; }
    .due-chip  { font-size: 10px; padding: 2px 6px; }
  }
</style>
