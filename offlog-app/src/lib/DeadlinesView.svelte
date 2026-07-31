<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getAllTasksDue, updateTask, subscribe, getTaskById } from './db';
  import { projects, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
  import { dueLabelLong, dueRelative, dueDateShort, daysSinceWeekStart, localDateStr } from './utils';
  import { getWeekStartsMonday } from '../config';
  import CardDetail from './CardDetail.svelte';
  import type { TaskDoc, ProjectDoc } from './types';
  import { hapticToggle } from './haptics';

  const dispatch = createEventDispatcher<{ menu: void; search: void; addTask: string }>();

  type DueTask = TaskDoc & { project_name?: string };

  let all: DueTask[] = [];
  let detailTask: DueTask | null = null;
  let detailProject: ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists — {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;

  const today = localDateStr(new Date());

  // Agenda's second view mode alongside the flat list — Month (roadmap
  // item 2), which replaced an earlier Week grid: Week's whole value was
  // seeing the current week laid out by day, which List's own "This
  // week" section already covers, and Month's per-day drill-in replaces
  // the rest. Same underlying getAllTasksDue() query, just re-laid out.
  // Per-device preference (localStorage), same as every other view-mode
  // toggle.
  const VIEW_KEY = 'offlog_agenda_view';
  const storedMode = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_KEY) : null;
  let mode: 'list' | 'month' = storedMode === 'month' ? 'month' : 'list';
  function setMode(m: 'list' | 'month') { mode = m; localStorage.setItem(VIEW_KEY, m); }

  const weekStartsMonday = getWeekStartsMonday();
  function toDateStr(d: Date): string {
    return localDateStr(d);
  }
  // A reactive lookup, not a plain function called from the template — a
  // plain `tasksOnDay(day)` call inside {#each monthGridDays as day} only
  // references `tasksOnDay` and `day` in the compiler's eyes, not `all`
  // (that's hidden inside the function body), so the grid silently never
  // re-rendered once `all` loaded async. `$:` makes the `all` dependency
  // explicit.
  $: tasksByDate = all.reduce<Record<string, DueTask[]>>((acc, t) => {
    if (t.due_date) (acc[t.due_date] ??= []).push(t);
    return acc;
  }, {});

  // Month grid. Each cell shows a priority-colored dot per task always,
  // plus a short title chip on wider viewports only (see .month-titles
  // media query below) — real titles don't survive a narrow column at
  // this density, so month cells never try to fit titles below 700px;
  // tapping a day opens its tasks in the panel below the grid instead,
  // same interaction on every platform.
  let monthOffset = 0;
  let selectedDay: string | null = null;
  const DOW_MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOW_SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  $: orderedDayNames = weekStartsMonday ? DOW_MONDAY_FIRST : DOW_SUNDAY_FIRST;
  $: monthAnchor = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  })();
  $: monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  $: monthLeadDays = daysSinceWeekStart(monthAnchor, weekStartsMonday);
  $: monthDaysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  $: monthGridLength = Math.ceil((monthLeadDays + monthDaysInMonth) / 7) * 7;
  $: monthGridStart = (() => {
    const d = new Date(monthAnchor);
    d.setDate(d.getDate() - monthLeadDays);
    return d;
  })();
  $: monthGridDays = Array.from({ length: monthGridLength }, (_, i) => {
    const d = new Date(monthGridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  function inCurrentMonth(d: Date): boolean { return d.getMonth() === monthAnchor.getMonth(); }
  function monthPrev() { monthOffset -= 1; }
  function monthNext() { monthOffset += 1; }
  function goToTodayMonth() { monthOffset = 0; selectedDay = today; }
  function toggleSelectedDay(dStr: string) { selectedDay = selectedDay === dStr ? null : dStr; }
  // "Add card" in the day panel — QuickAdd (opened at the App level)
  // prefills its due date from this, same as any other Quick Add open.
  function addCardOnDay(dStr: string) { dispatch('addTask', dStr); }

  function startOfWeek(): string {
    const d = new Date();
    d.setDate(d.getDate() - daysSinceWeekStart(d, weekStartsMonday));
    return localDateStr(d);
  }

  function endOfWeek(): string {
    const d = new Date();
    d.setDate(d.getDate() + (6 - daysSinceWeekStart(d, weekStartsMonday)));
    return localDateStr(d);
  }

  async function load() { all = await getAllTasksDue(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return () => { unsub(); };
  });

  $: overdue   = all.filter(t => t.due_date! < today);
  $: dueToday  = all.filter(t => t.due_date === today);
  $: thisWeek  = all.filter(t => t.due_date! > today && t.due_date! <= endOfWeek());
  $: later     = all.filter(t => t.due_date! > endOfWeek());

  function openDetail(t: DueTask) {
    detailOpenSession++;
    detailTask = t;
    detailProject = $projects.find(p => p._id === t.project_id) ?? null;
  }

  async function openRelatedTask(id: string) {
    const t = await getTaskById(id);
    if (!t) { showError('This task no longer exists.'); return; }
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) { showError('Could not open this task right now.'); return; }
    detailOpenSession++;
    detailTask = t;
    detailProject = proj;
  }

  async function markDone(t: DueTask) {
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) return;
    const lastCol = proj.columns.at(-1)?.id;
    if (!lastCol || t.column_id === lastCol) return;
    try {
      await updateTask(t._id!, { column_id: lastCol });
      await load();
      hapticToggle();
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
    <div class="dl-header-actions">
      <!-- redesign/v6 (owner feedback, 2026-07-28): same Command Palette
           button/icon as List view's top bar, since Agenda has its own
           header rather than the shared board-header. -->
      <button class="palette-btn" on:click={() => dispatch('search')} title="Command Palette (Ctrl+K)" aria-label="Command Palette (Ctrl+K)">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
        </svg>
      </button>
      <div class="mode-toggle">
        <button class="mode-btn" class:active={mode === 'list'} on:click={() => setMode('list')}>List</button>
        <button class="mode-btn" class:active={mode === 'month'} on:click={() => setMode('month')}>Month</button>
      </div>
    </div>
  </div>

  {#if mode === 'month'}
    <div class="month-nav">
      <button class="cal-nav-btn" on:click={monthPrev} aria-label="Previous month">‹</button>
      <span class="cal-label">{monthLabel}{#if monthOffset !== 0}<button class="cal-today-btn" on:click={goToTodayMonth}>Today</button>{/if}</span>
      <button class="cal-nav-btn" on:click={monthNext} aria-label="Next month">›</button>
    </div>
    <div class="month-scroll">
      <div class="month-grid">
        {#each orderedDayNames as dow}<div class="month-dow">{dow}</div>{/each}
        {#each monthGridDays as day (day.toISOString())}
          {@const dStr = toDateStr(day)}
          {@const dayTasks = tasksByDate[dStr] ?? []}
          <button
            class="month-cell"
            class:today={dStr === today}
            class:out-month={!inCurrentMonth(day)}
            class:selected={dStr === selectedDay}
            on:click={() => toggleSelectedDay(dStr)}
          >
            <span class="month-daynum">{day.getDate()}</span>
            {#if dayTasks.length}
              <span class="month-dots">
                {#each dayTasks.slice(0, 4) as t (t._id)}
                  <span class="month-dot" style="background:{PRIO_COLOR[t.priority]}"></span>
                {/each}
              </span>
              <span class="month-titles">
                {#each dayTasks.slice(0, 2) as t (t._id)}
                  <span class="month-title-chip">{t.title}</span>
                {/each}
                {#if dayTasks.length > 2}<span class="month-more">+{dayTasks.length - 2} more</span>{/if}
              </span>
            {/if}
          </button>
        {/each}
      </div>
      {#if selectedDay}
        <div class="month-day-panel">
          <div class="month-day-panel-head">
            <span>{new Date(selectedDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            <button class="month-day-close" on:click={() => selectedDay = null} aria-label="Close">×</button>
          </div>
          {#if (tasksByDate[selectedDay] ?? []).length === 0}
            <div class="empty">No tasks due this day.</div>
          {:else}
            {#each tasksByDate[selectedDay] as t (t._id)}
              <div
                class="task-row"
                style="--prio-color:{PRIO_COLOR[t.priority]}"
                title={PRIO_LABEL[t.priority]}
                role="button"
                tabindex="0"
                on:click={() => openDetail(t)}
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
              >
                <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
                <div class="task-body">
                  <span class="task-title">{t.title}</span>
                  <span class="proj-badge">{t.project_name ?? '—'}</span>
                </div>
              </div>
            {/each}
          {/if}
          <button class="month-add-card-btn" on:click={() => addCardOnDay(selectedDay)}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
            </svg>
            Add card
          </button>
        </div>
      {/if}
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
              style="--prio-color:{PRIO_COLOR[t.priority]}"
              title={PRIO_LABEL[t.priority]}
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <div class="task-body">
                <span class="task-title">{t.title}</span>
                <span class="proj-badge">{t.project_name ?? '—'}</span>
              </div>
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
              style="--prio-color:{PRIO_COLOR[t.priority]}"
              title={PRIO_LABEL[t.priority]}
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <div class="task-body">
                <span class="task-title">{t.title}</span>
                <span class="proj-badge">{t.project_name ?? '—'}</span>
              </div>
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
              style="--prio-color:{PRIO_COLOR[t.priority]}"
              title={PRIO_LABEL[t.priority]}
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <div class="task-body">
                <span class="task-title">{t.title}</span>
                <span class="proj-badge">{t.project_name ?? '—'}</span>
              </div>
              <span class="due-chip week">{dueRelative(t.due_date!)} · {dueDateShort(t.due_date!)}</span>
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
              style="--prio-color:{PRIO_COLOR[t.priority]}"
              title={PRIO_LABEL[t.priority]}
              role="button"
              tabindex="0"
              on:click={() => openDetail(t)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
            >
              <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
              <div class="task-body">
                <span class="task-title">{t.title}</span>
                <span class="proj-badge">{t.project_name ?? '—'}</span>
              </div>
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
  {#key detailTask._id + ':' + detailOpenSession}
    <CardDetail
      task={detailTask}
      project={detailProject}
      on:close={async () => { detailTask = null; detailProject = null; await load(); }}
      on:openRelated={(e) => openRelatedTask(e.detail)}
    />
  {/key}
{/if}

<style>
  .deadlines { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .dl-header {
    /* flex-start, not center — see DashboardView.svelte's .dash-header
       comment for why (consistent hamburger position across pages with
       a different number of subtitle lines, owner-reported 2026-07-16). */
    display: flex; align-items: flex-start; gap: 10px;
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
    color: var(--text); padding: 4px; border-radius: 6px; margin-top: 1px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .hamburger:hover { background: var(--hover); }

  .dl-header-actions {
    display: flex; align-items: center; gap: 8px;
    flex-shrink: 0; margin-left: auto;
    /* header is align-items:flex-start now (see .dl-header comment) —
       this control cluster still wants to sit centered against the row,
       not pinned to the top like the title block. */
    align-self: center;
  }
  .palette-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: none; border: 1px solid var(--border-strong); border-radius: 8px;
    color: var(--muted); cursor: pointer; transition: color .12s, background .12s;
  }
  .palette-btn:hover { color: var(--text); background: var(--hover); }
  .mode-toggle {
    display: flex; border: 1px solid var(--border-strong); border-radius: 8px;
    overflow: hidden; flex-shrink: 0;
  }
  .mode-btn {
    padding: 6px 14px; border: none; background: var(--surface); color: var(--muted);
    font-size: .8rem; font-weight: 600; cursor: pointer; transition: background .12s, color .12s;
  }
  .mode-btn + .mode-btn { border-left: 1px solid var(--border-strong); }
  .mode-btn:hover { background: var(--hover); }
  .mode-btn.active { background: var(--accent); color: var(--on-accent); }

  /* Shared by both calendar-style nav bars (currently just Month's) --
     prev/next arrows, a centered period label, and a "Today" jump link
     that only appears once you've navigated away from the current
     period. */
  .cal-nav-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px; cursor: pointer;
    color: var(--muted); font-size: 1rem; line-height: 1; padding: 3px 10px;
    transition: background .12s, color .12s;
  }
  .cal-nav-btn:hover { background: var(--hover); color: var(--text); }
  .cal-label { font-size: .85rem; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .cal-today-btn {
    background: none; border: none; color: var(--accent); font-size: .72rem; font-weight: 600;
    cursor: pointer; padding: 2px 6px; border-radius: 5px;
  }
  .cal-today-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  .month-nav {
    display: flex; align-items: center; justify-content: center; gap: 14px;
    padding: 12px 28px 4px; flex-shrink: 0;
  }

  /* flex:1 + overflow-y:auto on the *scroll container*, not the grid
     itself — the grid sizes to its own content (6 rows max). Stretching
     a short grid to fill all leftover flex space just leaves a blank
     gap before whatever comes after it (the day panel here) — found
     live while building this view, fixed by moving the scroll behavior
     up a level instead. */
  .month-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 28px 16px; }
  .month-grid {
    display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
    border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
    margin: 12px 0;
  }
  .month-dow {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--faint); text-align: center; padding: 6px 4px;
    background: var(--col-bg); border-bottom: 1px solid var(--border);
  }
  .month-cell {
    display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
    min-height: 84px; padding: 5px 6px; text-align: left;
    background: var(--surface); border: none; cursor: pointer;
    border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
    transition: background .1s;
  }
  .month-cell:hover { background: var(--hover); }
  .month-cell:nth-child(7n) { border-right: none; }
  .month-cell.out-month { background: var(--bg); color: var(--faint); }
  .month-cell.out-month .month-daynum { color: var(--faint); }
  .month-cell.today { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .month-cell.selected { box-shadow: inset 0 0 0 2px var(--accent); }
  .month-daynum { font-size: .78rem; font-weight: 700; color: var(--text); }
  .month-cell.today .month-daynum {
    color: var(--on-accent); background: var(--accent);
    border-radius: 50%; width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center; font-size: .72rem;
  }
  .month-dots { display: flex; gap: 3px; flex-wrap: wrap; }
  .month-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  /* Title chips are a desktop-only enhancement — real titles don't
     survive a narrow column, so below 700px cells fall back to
     dots-only + tap-to-open, same interaction everywhere, just less
     crammed into the cell itself. */
  .month-titles { display: flex; flex-direction: column; gap: 1px; width: 100%; }
  .month-title-chip {
    font-size: .68rem; color: var(--text); width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .month-more { font-size: .64rem; color: var(--faint); }

  .month-day-panel {
    border-top: 1px solid var(--border); padding: 14px 0 4px;
  }
  .month-day-panel-head {
    display: flex; align-items: center; justify-content: space-between;
    font-size: .85rem; font-weight: 700; color: var(--text); margin-bottom: 10px;
  }
  .month-day-close {
    background: none; border: none; color: var(--faint); font-size: 1.1rem;
    line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 6px;
  }
  .month-day-close:hover { background: var(--hover); color: var(--text); }

  .month-add-card-btn {
    display: flex; align-items: center; gap: 6px;
    width: 100%; margin-top: 6px; padding: 9px 10px;
    border: 1px dashed var(--border-strong); border-radius: 10px;
    background: none; color: var(--muted); font-size: .82rem; font-weight: 500;
    cursor: pointer; transition: background .1s, color .12s, border-color .12s;
  }
  .month-add-card-btn:hover { background: var(--hover); color: var(--accent); border-color: var(--accent); }

  @media (max-width: 700px) {
    .month-titles { display: none; }
    .month-cell { min-height: 52px; padding: 4px 3px; }
    .month-scroll { padding: 0 12px 12px; }
    .month-nav { padding: 10px 12px 4px; }
  }

  .dl-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px 40px;
    width: 100%; box-sizing: border-box;
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
    /* --on-accent, not hardcoded #fff — maintenance pass caught this
       failing contrast badly on 3 of its 4 backgrounds in dark mode
       (worst: 1.74:1 on --success). --on-accent's white/dark-text split
       matches --overdue-ink/--accent/--faint's per-theme lightness swap;
       --success needs its own override below since it's bright in both
       themes rather than swapping. */
    color: var(--on-accent); opacity: .9;
    font-size: 9px; padding: 1px 5px; border-radius: 8px; font-weight: 700;
  }
  /* background can't use currentColor here — that would read the badge's
     own `color` (white) rather than the parent label's color, so each
     variant gets an explicit background matching its label */
  .overdue-label .badge-count { background: var(--overdue-ink); }
  .today-label   .badge-count { background: var(--accent); }
  .week-label    .badge-count { background: var(--success); color: var(--ink-fixed-dark); }
  .later-label   .badge-count { background: var(--faint); }

  .task-row {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 10px;
    border: 1px solid var(--border); border-left: 2px solid var(--prio-color, var(--border));
    background: var(--surface);
    margin-bottom: 5px; cursor: pointer;
    transition: background .1s, box-shadow .1s;
  }
  .task-row:hover { background: var(--hover); box-shadow: 0 1px 4px rgba(0,0,0,.06); }

  /* Same minimal checkbox language as ListView.svelte's .circle (owner
     feedback, 2026-07-28) -- rounded square, no fill, border-only. */
  .circle {
    width: 18px; height: 18px; border-radius: 5px;
    background: none; padding: 0;
    border: 1.5px solid var(--border-strong); flex-shrink: 0; cursor: pointer;
    transition: border-color .12s; display: block;
  }
  .circle:hover { border-color: var(--accent); }

  /* Title + project stacked (same primary/secondary pattern as
     DashboardView's .task-body) instead of a same-line project chip that
     used to just vanish below 700px (owner-reported, 2026-07-16) —
     project context now survives at every width, no breakpoint needed. */
  .task-body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .task-title {
    font-size: 14px; font-weight: 500; color: var(--text);
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .proj-badge {
    font-family: var(--mono); font-size: 10px; color: var(--faint);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .due-chip {
    font-family: var(--mono); font-size: 11px; font-weight: 500;
    padding: 3px 9px; border-radius: 6px; white-space: nowrap;
  }
  .due-chip.overdue { background: var(--overdue-bg); color: var(--overdue-ink); }
  .due-chip.today   { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .due-chip.week    { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
  .due-chip.later   { background: var(--col-bg); color: var(--faint); }

  @media (max-width: 768px), (max-height: 500px) and (orientation: landscape) {
    .hamburger { display: flex; }
  }

  @media (max-width: 700px) {
    .dl-header { padding: 14px 16px 10px; }
    .dl-body   { padding: 14px 14px 32px; }
    .dl-title  { font-size: 17px; }
  }

  /* Small — collapse chip to short form */
  @media (max-width: 440px) {
    .task-row  { padding: 9px 10px; gap: 8px; }
    .task-title { font-size: 13px; }
    .due-chip  { font-size: 10px; padding: 2px 6px; }
  }
</style>
