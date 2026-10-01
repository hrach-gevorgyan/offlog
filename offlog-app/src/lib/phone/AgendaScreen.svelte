<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TaskDoc } from '../types';
  import { getAllTasksDue, subscribe } from '../db';
  import { showError } from '../store';
  import { localDateStr } from '../utils';
  import { getWeekStartsMonday } from '../../config';
  import { actions, memo } from './nav';
  import { shortDate } from './format';
  import { I } from './icons';
  import { agendaDay, monthGrid, endOfWeek } from './agenda/month';
  import TopBar from './TopBar.svelte';
  import TaskCard from './TaskCard.svelte';

  type Row = TaskDoc & { project_name?: string };

  // Shared with the desktop Agenda: one per-device view preference.
  const VIEW_KEY = 'offlog_agenda_view';
  function readMode(): 'list' | 'month' {
    try { return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'list'; } catch { return 'list'; }
  }
  let mode = readMode();
  function setMode(m: 'list' | 'month') {
    mode = m;
    try { localStorage.setItem(VIEW_KEY, m); } catch { /* preference only */ }
  }

  let all: Row[] = [];
  let loaded = false;
  async function load() {
    try {
      all = await getAllTasksDue();
      loaded = true;
    } catch {
      showError('Could not load the agenda. Please try again.');
    }
  }

  // Re-read so a screen left open past midnight regroups.
  let today = localDateStr(new Date());
  function refreshToday() {
    const t = localDateStr(new Date());
    if (t !== today) { if (selected === today) selected = t; today = t; }
  }

  const mondayFirst = getWeekStartsMonday();
  const byDue = (a: Row, b: Row) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || b.priority - a.priority;

  $: tomorrow = (() => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + 1); return localDateStr(d); })();
  $: weekEnd = endOfWeek(mondayFirst, new Date(today + 'T12:00:00'));
  $: groups = [
    { label: 'Late', late: true, tasks: all.filter(t => t.due_date! < today) },
    { label: 'Today', tasks: all.filter(t => t.due_date === today) },
    { label: 'Tomorrow', tasks: all.filter(t => t.due_date === tomorrow) },
    { label: 'This week', tasks: all.filter(t => t.due_date! > tomorrow && t.due_date! <= weekEnd) },
    { label: 'Later', tasks: all.filter(t => t.due_date! > tomorrow && t.due_date! > weekEnd) },
  ].map(g => ({ ...g, tasks: g.tasks.sort(byDue) })).filter(g => g.tasks.length);

  $: byDate = all.reduce<Record<string, Row[]>>((acc, t) => {
    if (t.due_date) (acc[t.due_date] ??= []).push(t);
    return acc;
  }, {});

  // Month and day survive opening a task and coming back.
  const m = memo({ offset: 0, selected: today });
  let offset = m.offset;
  let selected = m.selected;
  $: m.offset = offset;
  $: m.selected = selected;
  $: grid = monthGrid(offset, mondayFirst, new Date(today + 'T12:00:00'));
  $: monthLabel = grid.anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  $: dayTasks = (byDate[selected] ?? []).slice().sort(byDue);
  const WD_MON = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const WD_SUN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const weekdays = mondayFirst ? WD_MON : WD_SUN;

  function shiftMonth(n: number) {
    offset += n;
    selected = offset === 0 ? today : localDateStr(new Date(grid.anchor.getFullYear(), grid.anchor.getMonth() + n, 1, 12));
  }
  function thisMonth() { offset = 0; selected = today; }

  $: agendaDay.set(mode === 'month' ? selected : null);
  onDestroy(() => agendaDay.set(null));

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    const timer = setInterval(refreshToday, 60 * 1000);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      unsub();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  });
</script>

<TopBar title="Agenda" root />

<div class="p-seg" role="tablist" aria-label="Agenda view">
  <button role="tab" aria-selected={mode === 'list'} class:on={mode === 'list'} on:click={() => setMode('list')}>List</button>
  <button role="tab" aria-selected={mode === 'month'} class:on={mode === 'month'} on:click={() => setMode('month')}>Month</button>
</div>

{#if mode === 'month'}
  <div class="mhead">
    <span class="ml">{monthLabel}</span>
    {#if offset !== 0}<button class="p-tbtn" on:click={thisMonth}>Today</button>{/if}
    <button class="p-ib" on:click={() => shiftMonth(-1)} aria-label="Previous month">{@html I.back}</button>
    <button class="p-ib" on:click={() => shiftMonth(1)} aria-label="Next month">{@html I.chev}</button>
  </div>
  <div class="month">
    {#each weekdays as w, i (i)}<span class="wd">{w}</span>{/each}
    {#each grid.days as d (d.iso)}
      {@const n = byDate[d.iso] ?? []}
      <button
        class:out={!d.inMonth} class:today={d.iso === today} class:sel={d.iso === selected}
        aria-label="{shortDate(d.iso)}, {n.length} due" aria-pressed={d.iso === selected}
        on:click={() => (selected = d.iso)}
      >
        {d.day}
        <span class="dots">{#each n.slice(0, 3) as t (t._id)}<i class:late={d.iso < today}></i>{/each}</span>
      </button>
    {/each}
  </div>
  <div class="p-sec">{selected === today ? 'Today' : shortDate(selected)} <span class="p-n">{dayTasks.length}</span></div>
  {#each dayTasks as t (t._id)}
    <TaskCard task={t} on:open={() => actions.openTask(t)} on:changed={load} />
  {:else}
    <div class="none">
      <p class="p-empty">Nothing due.</p>
      <button class="p-tbtn" on:click={() => actions.quickAdd(selected)}>Add a task</button>
    </div>
  {/each}
{:else if loaded && !all.length}
  <p class="p-empty">No tasks with a due date.</p>
{:else}
  {#each groups as g (g.label)}
    <div class="p-sec" class:late={g.late}>{g.label} <span class="p-n">{g.tasks.length}</span></div>
    {#each g.tasks as t (t._id)}
      <TaskCard task={t} on:open={() => actions.openTask(t)} on:changed={load} />
    {/each}
  {/each}
{/if}

<style>
  .mhead { display: flex; align-items: center; margin: 0 0 6px 4px; }
  .ml { flex: 1; font-weight: 700; font-size: 16px; }
  .month {
    display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; padding: 8px 6px; margin-bottom: 6px;
    background: var(--surface); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.06);
  }
  .wd { font-size: 12px; font-weight: 700; color: var(--faint); text-align: center; padding: 2px 0 4px; }
  .month button {
    height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    border-radius: 10px; border: 0; background: none; padding: 0; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--text);
    transition: background var(--dur-hover) var(--ease-hover);
  }
  .month button:active { background: var(--col-bg); }
  .month button.out { color: var(--faint); opacity: .45; }
  .month button.today { color: var(--accent); font-weight: 700; }
  .month button.sel { background: var(--accent); color: var(--on-accent); }
  .dots { display: flex; gap: 2px; height: 5px; }
  .dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: .7; }
  .dots i.late { background: var(--overdue-ink); opacity: 1; }
  .month button.sel .dots i { background: var(--on-accent); }
  .none { display: flex; flex-direction: column; align-items: center; padding: 0 0 12px; }
  .none .p-empty { padding-bottom: 6px; }
</style>
