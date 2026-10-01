<script lang="ts">
  import Empty from './Empty.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { TaskDoc } from '../types';
  import { getAllTasksDue, getDashboardData, subscribe, updateTask } from '../db';
  import { dueDateToReminderInput } from '../carddetail/helpers';
  import { showError } from '../store';
  import { localDateStr } from '../utils';
  import { actions, push, showToast } from './nav';
  import { I } from './icons';
  import { shortDate } from './format';
  import TopBar from './TopBar.svelte';
  import TaskCard from './TaskCard.svelte';
  import TaskMenu from './TaskMenu.svelte';
  import { collapseIn, collapseOut } from '../motion';
  import { leaves, returns } from './rowMotion';

  // today: a tab root (also pushed from Home's hero); late/pinned: pushed from Home's tiles.
  export let kind: 'today' | 'late' | 'pinned';
  export let root = false;

  type Row = TaskDoc & { project_name?: string };
  let sections: { label: string; date?: string; tasks: Row[] }[] = [];
  let count = 0;
  // Today shows late tasks as one row at the top that opens the Late screen.
  let lateCount = 0;
  let loaded = false;
  let today = localDateStr(new Date());
  const byDue = (a: Row, b: Row) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || b.priority - a.priority;

  async function load() {
    try {
      if (kind === 'pinned') {
        const d = await getDashboardData();
        const rows = d.pinnedAll.map(t => ({ ...t, project_name: d.projCache[t.project_id] })).sort(byDue);
        sections = [{ label: '', tasks: rows }];
        count = rows.length;
      } else {
        const due = await getAllTasksDue();
        const late = due.filter(t => t.due_date! < today).sort(byDue);
        if (kind === 'late') { sections = [{ label: '', tasks: late }]; count = late.length; }
        else {
          const now = due.filter(t => t.due_date === today).sort(byDue);
          sections = [{ label: 'Due today', date: today, tasks: now }];
          count = now.length;
          lateCount = late.length;
        }
      }
      loaded = true;
    } catch {
      showError('Could not load these tasks. Please try again.');
    }
  }

  let unsub: (() => void) | undefined;
  onMount(() => { load(); unsub = subscribe(load); });
  function onVisible() { if (!document.hidden) { today = localDateStr(new Date()); load(); } }
  onMount(() => { document.addEventListener('visibilitychange', onVisible); return () => document.removeEventListener('visibilitychange', onVisible); });
  onDestroy(() => unsub?.());

  const TITLE = { today: 'Today', late: 'Late', pinned: 'Pinned' };
  const EMPTY = {
    today: { title: 'Nothing due today', text: 'A clear day. Plan ahead in Agenda, or add something.' },
    late: { title: 'Nothing late', text: "You're on time with everything." },
    pinned: { title: 'Nothing pinned', text: 'Hold a task, or tap the pin on its page, to pin it.' },
  };
  // The card menu; {#key} bumped on every open (Sheet rule).
  let menuTask: Row | null = null, menuSession = 0;
  function openMenu(t: Row) { menuTask = t; menuSession++; }

  // Late: every late task to today in one go, as the due sheet would set it
  // (a reminder that follows the due date moves with it). Undo puts back each
  // task's own date and reminder.
  let moving = false;
  async function moveAllToToday() {
    const rows = sections[0]?.tasks ?? [];
    if (!rows.length || moving) return;
    moving = true;
    const before = rows.map(t => ({ id: t._id, due_date: t.due_date, reminder_at: t.reminder_at }));
    const remind = new Date(dueDateToReminderInput(today)).toISOString();
    try {
      for (const t of rows) await updateTask(t._id, t.remindOnDue ? { due_date: today, reminder_at: remind } : { due_date: today });
      showToast(`Moved ${rows.length} to today`, async () => {
        try { for (const b of before) await updateTask(b.id, { due_date: b.due_date, reminder_at: b.reminder_at }); }
        catch { showError('Could not undo the move. Please try again.'); }
      });
    } catch {
      showError('Could not move these tasks. Please try again.');
    } finally {
      moving = false;
      load();
    }
  }

  $: sub = kind === 'today' ? `${shortDate(today)} · ${count} due` : kind === 'late' ? `${count} past their date` : `${count} pinned`;
</script>

<TopBar title={TITLE[kind]} {sub} {root}>
  {#if kind === 'late' && count}<button class="p-tbtn" on:click={moveAllToToday} disabled={moving}>All to today</button>{/if}
</TopBar>
{#if kind === 'today' && lateCount}
  <button class="late-row" on:click={() => push({ k: 'late' })} aria-label="Open Late: {lateCount} late {lateCount === 1 ? 'task' : 'tasks'}">
    <span class="lbl">{lateCount} late</span>{@html I.chev}
  </button>
{/if}
{#each sections as s}
  {#if s.label && s.tasks.length}
    <!-- Its last task finishing takes the heading along with the row. -->
    <div out:collapseOut={{ on: true }}><div class="p-sec" role="heading" aria-level="2">{s.label} <span class="p-n">{s.tasks.length}</span></div></div>
  {/if}
  {#each s.tasks as t (t._id)}
    <div in:collapseIn={{ on: returns(t._id) }} out:collapseOut={{ on: leaves(t._id) }}><TaskCard task={t} sectionDate={s.date ?? null} menu on:open={() => actions.openTask(t)} on:changed={load} on:menu={() => openMenu(t)} /></div>
  {:else}
    {#if loaded}
      <Empty title={EMPTY[kind].title} text={EMPTY[kind].text}>
        {#if kind !== 'pinned'}<button class="p-tbtn" on:click={() => actions.quickAdd()}>Add a task</button>{/if}
      </Empty>
    {/if}
  {/each}
{/each}

{#key menuSession}
  {#if menuTask}<TaskMenu task={menuTask} on:close={() => (menuTask = null)} />{/if}
{/key}

<style>
  .late-row {
    display: flex; align-items: center; width: 100%; gap: 6px; margin: 0 0 10px; padding: 10px 12px 10px 14px;
    background: var(--overdue-bg); color: var(--overdue-ink); border: 0; border-radius: 12px;
    font: inherit; font-size: var(--p-fs-m); font-weight: 600; text-align: left; cursor: pointer;
    transition: transform var(--dur-hover) var(--ease-hover);
  }
  .late-row:active { transform: scale(.98); }
  .late-row .lbl { flex: 1; }
  .late-row :global(svg) { width: 16px; height: 16px; }
</style>
