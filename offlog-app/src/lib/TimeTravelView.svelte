<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getRecentLogs, getTaskById, subscribe } from './db';
  import { projects, showError } from './store';
  import { describeLog, fmt, entityLabel, ACTION_LABEL } from './logFormat';
  import { ACTION_COLOR } from './utils';
  import CardDetail from './CardDetail.svelte';
  import type { TaskDoc, ProjectDoc } from './types';

  const dispatch = createEventDispatcher();

  // Retrospective view over the same log: docs ChangelogView already
  // reads — "what did I actually do this week/month" is data Offlog
  // already keeps (6-month retention, see db.ts's pruneOldLogs) that
  // most task managers throw away entirely. Deliberately reuses
  // getRecentLogs() with a growing limit rather than a new date-range
  // query -- simplest correct thing at personal-task-manager scale, no
  // new query surface to get wrong.
  const PAGE_SIZE = 150;
  let limit = PAGE_SIZE;
  let logs: any[] = [];
  let loading = true;
  let hasMore = true;

  async function load() {
    loading = true;
    const fetched = await getRecentLogs(limit);
    hasMore = fetched.length === limit; // exactly the cap -> there may be more
    logs = fetched;
    loading = false;
  }

  function loadMore() { limit += PAGE_SIZE; load(); }

  onMount(() => {
    load();
    return subscribe(() => load());
  });

  // Local calendar date, not a raw ISO slice -- ts is stored UTC (db.ts's
  // now()), and slicing the string directly would group late-evening
  // entries into "tomorrow" for anyone west of UTC. Same reasoning
  // CardDetail's own dateFromToday() comment documents for due dates.
  function dayKey(ts: string): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const todayKey = dayKey(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = dayKey(yesterdayDate.toISOString());
  const thisYear = new Date().getFullYear();

  function dayLabel(key: string): string {
    if (key === todayKey) return 'Today';
    if (key === yesterdayKey) return 'Yesterday';
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric',
      year: y !== thisYear ? 'numeric' : undefined,
    });
  }

  interface DayGroup { key: string; label: string; entries: any[]; counts: Record<string, number> }

  $: groups = (() => {
    const map = new Map<string, any[]>();
    for (const log of logs) {
      const key = dayKey(log.ts);
      (map.get(key) ?? map.set(key, []).get(key)!).push(log);
    }
    const out: DayGroup[] = [];
    for (const [key, entries] of map) {
      const counts: Record<string, number> = {};
      for (const e of entries) counts[e.action] = (counts[e.action] ?? 0) + 1;
      out.push({ key, label: dayLabel(key), entries, counts });
    }
    return out; // insertion order already matches getRecentLogs' descending order
  })();

  function summarize(counts: Record<string, number>): string {
    return (['create', 'update', 'move', 'delete'] as const)
      .filter(a => counts[a])
      .map(a => `${counts[a]} ${ACTION_LABEL[a].toLowerCase()}`)
      .join(' · ');
  }

  let detailTask: TaskDoc | null = null;
  let detailProject: ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists -- {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;

  async function openEntry(log: any) {
    if (entityLabel(log) !== 'task') return; // only tasks have a card to open
    try {
      const task = await getTaskById(log.ref);
      if (!task) { showError('This task no longer exists.'); return; }
      const proj = $projects.find(p => p._id === task.project_id);
      if (!proj) { showError('Could not open this task right now.'); return; }
      detailOpenSession++;
      detailTask = task;
      detailProject = proj;
    } catch {
      showError('Could not open this task right now.');
    }
  }
</script>

<div class="tt">
  <div class="tt-header">
    <button class="hamburger" on:click={() => dispatch('menu')} aria-label="Menu">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
      </svg>
    </button>
    <div class="title-block">
      <h1 class="tt-title">Time Travel</h1>
      <span class="tt-sub">Everything you've done, day by day</span>
    </div>
  </div>

  <div class="tt-body">
    {#if loading && logs.length === 0}
      <div class="empty">Loading…</div>
    {:else if groups.length === 0}
      <div class="empty">Nothing logged yet. Once you create or edit a task, it'll show up here.</div>
    {:else}
      {#each groups as g (g.key)}
        <div class="day-group">
          <div class="day-head">
            <span class="day-label">{g.label}</span>
            <span class="day-summary">{summarize(g.counts)}</span>
          </div>
          {#each g.entries as log (log._id)}
            {@const clickable = entityLabel(log) === 'task'}
            <div
              class="entry"
              class:clickable
              role={clickable ? 'button' : undefined}
              tabindex={clickable ? 0 : undefined}
              on:click={() => openEntry(log)}
              on:keydown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEntry(log); } }}
            >
              <span class="action-pill" style="background:color-mix(in srgb, {ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:{ACTION_COLOR[log.action] ?? '#a39c90'}">{ACTION_LABEL[log.action] ?? log.action}</span>
              <span class="entry-desc">{describeLog(log)}</span>
              <span class="entry-time">{new Date(log.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          {/each}
        </div>
      {/each}
      {#if hasMore}
        <button class="load-more-btn" on:click={loadMore} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>
      {/if}
    {/if}
  </div>
</div>

{#if detailTask && detailProject}
  {#key detailTask._id + ':' + detailOpenSession}
    <CardDetail
      task={detailTask}
      project={detailProject}
      on:close={async () => { detailTask = null; detailProject = null; await load(); }}
    />
  {/key}
{/if}

<style>
  .tt { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .tt-header {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 20px 28px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .title-block { min-width: 0; flex: 1; }
  .tt-title { margin: 0 0 3px; font-size: 20px; font-weight: 700; letter-spacing: -.015em; }
  .tt-sub { font-family: var(--mono); font-size: 11px; color: var(--faint); }

  .hamburger {
    display: none;
    background: none; border: none; cursor: pointer;
    color: var(--text); padding: 4px; border-radius: 6px; margin-top: 1px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .hamburger:hover { background: var(--hover); }

  .tt-body { flex: 1; overflow-y: auto; padding: 20px 28px 32px; }
  .empty { color: var(--faint); font-size: 14px; padding: 24px 0; }

  .day-group { margin-bottom: 22px; }
  .day-head {
    display: flex; align-items: baseline; gap: 10px;
    padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--border);
  }
  .day-label { font-weight: 700; font-size: 14px; }
  .day-summary { font-family: var(--mono); font-size: 10.5px; color: var(--faint); }

  .entry {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 8px; border-radius: var(--radius-sm);
    transition: background .1s;
  }
  .entry.clickable { cursor: pointer; }
  .entry.clickable:hover { background: var(--hover); }

  .action-pill {
    font-family: var(--mono); font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 5px; flex-shrink: 0; white-space: nowrap;
  }
  .entry-desc { flex: 1; min-width: 0; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .entry-time { font-family: var(--mono); font-size: 10.5px; color: var(--faint); flex-shrink: 0; }

  .load-more-btn {
    display: block; margin: 8px auto 0;
    padding: .5rem 1.2rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
    font-size: .82rem; font-weight: 500; cursor: pointer;
    transition: background .12s;
  }
  .load-more-btn:hover:not(:disabled) { background: var(--hover); }
  .load-more-btn:disabled { opacity: .6; cursor: default; }

  @media (max-width: 768px) {
    .hamburger { display: flex; }
  }
</style>
