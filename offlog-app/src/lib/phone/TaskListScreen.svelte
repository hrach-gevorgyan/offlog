<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TaskDoc } from '../types';
  import { getAllTasksDue, getDashboardData, subscribe } from '../db';
  import { showError } from '../store';
  import { localDateStr } from '../utils';
  import { actions } from './nav';
  import { shortDate } from './format';
  import TopBar from './TopBar.svelte';
  import TaskCard from './TaskCard.svelte';

  // today: a tab root (also pushed from Home's hero); late/pinned: pushed from Home's tiles.
  export let kind: 'today' | 'late' | 'pinned';
  export let root = false;

  type Row = TaskDoc & { project_name?: string };
  let sections: { label: string; late?: boolean; tasks: Row[] }[] = [];
  let count = 0;
  let loaded = false;
  const today = localDateStr(new Date());
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
          sections = [{ label: 'Due today', tasks: now }, { label: 'Late', late: true, tasks: late }];
          count = now.length;
        }
      }
      loaded = true;
    } catch {
      showError('Could not load these tasks. Please try again.');
    }
  }

  let unsub: (() => void) | undefined;
  onMount(() => { load(); unsub = subscribe(load); });
  onDestroy(() => unsub?.());

  const TITLE = { today: 'Today', late: 'Late', pinned: 'Pinned' };
  const EMPTY = { today: 'Nothing due today.', late: 'Nothing late.', pinned: 'Pin a task to keep it here.' };
  $: sub = kind === 'today' ? `${shortDate(today)} · ${count} due` : kind === 'late' ? `${count} past their date` : `${count} pinned`;
</script>

<TopBar title={TITLE[kind]} {sub} {root} />
{#each sections as s}
  {#if s.label && s.tasks.length}
    <div class="sec" class:late={s.late}>{s.label} <span class="n">{s.tasks.length}</span></div>
  {/if}
  {#each s.tasks as t (t._id)}
    <TaskCard task={t} on:open={() => actions.openTask(t)} on:changed={load} />
  {:else}
    {#if !s.late && loaded}
      <div class="empty">
        <p>{EMPTY[kind]}</p>
        {#if kind !== 'pinned'}<button class="p-tbtn" on:click={() => actions.quickAdd()}>Add a task</button>{/if}
      </div>
    {/if}
  {/each}
{/each}

<style>
  .sec { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); margin: 18px 4px 8px; display: flex; gap: 8px; align-items: center; }
  .sec.late { color: var(--overdue-ink); }
  .n { background: var(--col-bg); color: var(--muted); border-radius: 999px; padding: 0 7px; font-size: 12px; letter-spacing: 0; }
  .empty { text-align: center; color: var(--faint); padding: 28px 0 8px; font-size: 14.5px; }
  .empty p { margin: 0 0 4px; }
</style>
