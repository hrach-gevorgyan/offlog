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

  // B7 — week-grid view, toggled alongside the existing flat list. Same
  // underlying getAllTasksDue() query; this just re-lays it out. Per-device
  // preference (localStorage), same as every other view-mode toggle.
  const VIEW_KEY = 'offlog_agenda_view';
  let mode: 'list' | 'week' = (typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'week') ? 'week' : 'list';
  function setMode(m: 'list' | 'week') { mode = m; localStorage.setItem(VIEW_KEY, m); }

  let weekOffset = 0;
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function startOfOffsetWeek(offset: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + offset * 7);
    return d;
  }
  function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  $: weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = startOfOffsetWeek(weekOffset);
    d.setDate(d.getDate() + i);
    return d;
  });
  $: weekLabel = weekDays.length
    ? `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';
  // A reactive lookup, not a plain function called from the template — a
  // plain `tasksOnDay(day)` call inside {#each weekDays as day} only
  // references `tasksOnDay` and `day` in the compiler's eyes, not `all`
  // (that's hidden inside the function body), so the grid silently never
  // re-rendered once `all` loaded async. `$:` makes the `all` dependency
  // explicit.
  $: tasksByDate = all.reduce<Record<string, DueTask[]>>((acc, t) => {
    if (t.due_date) (acc[t.due_date] ??= []).push(t);
    return acc;
  }, {});

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
    <div class="mode-toggle">
      <button class="mode-btn" class:active={mode === 'list'} on:click={() => setMode('list')}>List</button>
      <button class="mode-btn" class:active={mode === 'week'} on:click={() => setMode('week')}>Week</button>
    </div>
  </div>

  {#if mode === 'week'}
    <div class="week-nav">
      <button class="week-nav-btn" on:click={() => weekOffset -= 1} aria-label="Previous week">‹</button>
      <span class="week-label">{weekLabel}{#if weekOffset !== 0}<button class="week-today-btn" on:click={() => weekOffset = 0}>Today</button>{/if}</span>
      <button class="week-nav-btn" on:click={() => weekOffset += 1} aria-label="Next week">›</button>
    </div>
    <div class="week-grid">
      {#each weekDays as day (day.toISOString())}
        {@const dStr = toDateStr(day)}
        <div class="week-col" class:today={dStr === today}>
          <div class="week-col-head">
            <span class="week-dow">{DAY_NAMES[day.getDay()]}</span>
            <span class="week-date">{day.getDate()}</span>
          </div>
          <div class="week-col-body">
            {#each tasksByDate[dStr] ?? [] as t (t._id)}
              <button
                class="week-task"
                style="border-left-color:{PRIO_COLOR[t.priority]}"
                on:click={() => openDetail(t)}
                title={t.title}
              >
                <span class="week-task-title">{t.title}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
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
  {/if}
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

  .mode-toggle {
    display: flex; border: 1px solid var(--border-strong); border-radius: 8px;
    overflow: hidden; flex-shrink: 0; margin-left: auto;
  }
  .mode-btn {
    padding: 6px 14px; border: none; background: var(--surface); color: var(--muted);
    font-size: .8rem; font-weight: 600; cursor: pointer; transition: background .12s, color .12s;
  }
  .mode-btn + .mode-btn { border-left: 1px solid var(--border-strong); }
  .mode-btn:hover { background: var(--hover); }
  .mode-btn.active { background: var(--accent); color: #fff; }

  .week-nav {
    display: flex; align-items: center; justify-content: center; gap: 14px;
    padding: 12px 28px 4px; flex-shrink: 0;
  }
  .week-nav-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px; cursor: pointer;
    color: var(--muted); font-size: 1rem; line-height: 1; padding: 3px 10px;
    transition: background .12s, color .12s;
  }
  .week-nav-btn:hover { background: var(--hover); color: var(--text); }
  .week-label { font-size: .85rem; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .week-today-btn {
    background: none; border: none; color: var(--accent); font-size: .72rem; font-weight: 600;
    cursor: pointer; padding: 2px 6px; border-radius: 5px;
  }
  .week-today-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  .week-grid {
    flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto;
    display: grid; grid-template-columns: repeat(7, minmax(96px, 1fr));
    border: 1px solid var(--border); border-radius: 10px;
    margin: 12px 28px 32px; width: auto;
  }
  .week-col {
    display: flex; flex-direction: column;
    border-right: 1px solid var(--border);
  }
  .week-col:last-child { border-right: none; }
  .week-col.today { background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .week-col-head {
    display: flex; align-items: baseline; gap: 5px; padding: 7px 9px;
    border-bottom: 1px solid var(--border); color: var(--faint);
  }
  .week-col.today .week-col-head { color: var(--accent); }
  .week-dow { font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: inherit; }
  .week-date { font-size: .78rem; font-weight: 700; color: var(--text); }
  .week-col.today .week-date { color: var(--accent); }
  .week-col-body { flex: 1; display: flex; flex-direction: column; }
  .week-task {
    display: block; text-align: left; width: 100%;
    background: none; border: none; border-left: 3px solid var(--faint);
    padding: 4px 8px; cursor: pointer; transition: background .1s;
  }
  .week-task:hover { background: var(--hover); }
  .week-task-title {
    display: block; font-size: .72rem; color: var(--text); overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; line-height: 1.5;
  }

  @media (max-width: 700px) {
    .week-grid { grid-template-columns: repeat(7, minmax(64px, 1fr)); margin: 10px 12px 24px; }
    .week-nav { padding: 10px 12px 4px; }
    .week-task-title { font-size: .66rem; }
  }

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
