<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { getRecentLogs, getTaskById, clearLogs, subscribe } from './db';
  import { projects, showError } from './store';
  import { describeLog, fmt, entityLabel, ACTION_LABEL } from './logFormat';
  import { ACTION_COLOR } from './utils';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import { panelFly, scrimFade } from './motion';
  import CardDetail from './CardDetail.svelte';
  import type { TaskDoc, ProjectDoc } from './types';

  // Replaces the old ChangelogView.svelte (2026-07-18, owner feedback:
  // "both almost doing same thing") -- a flat 80-entry activity log and a
  // day-grouped, clickable, further-back journal over the exact same
  // log: docs were two surfaces doing one job. This is the merged one:
  // ChangelogView's per-row detail (project badge, device/source pill,
  // Clear all) plus the day grouping/pagination/click-to-open that made
  // this worth keeping instead of just deleting it.
  const dispatch = createEventDispatcher();
  const requestClose = closeOnBack(() => dispatch('close'));

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  // Reuses getRecentLogs() with a growing limit rather than a new
  // date-range query -- simplest correct thing at personal-task-manager
  // scale, no new query surface to get wrong.
  const PAGE_SIZE = 150;
  let limit = PAGE_SIZE;
  let logs: any[] = [];
  let loading = true;
  let hasMore = true;
  let bodyEl: HTMLDivElement;

  // subscribe() is db.ts's single global change feed -- it fires on
  // *every* doc write app-wide, not just log: docs, so leaving this panel
  // open while working elsewhere reruns getRecentLogs(limit) constantly.
  // Preserve scroll position across the reload (a full-array replace
  // otherwise snaps a scrolled-down reader back to the top on someone
  // else's unrelated edit) and skip overlapping reloads if one is
  // already in flight.
  async function load() {
    if (loading && logs.length > 0) return; // already loading, not the initial mount
    loading = true;
    const scrollTop = bodyEl?.scrollTop ?? 0;
    const fetched = await getRecentLogs(limit);
    hasMore = fetched.length === limit; // exactly the cap -> there may be more
    logs = fetched;
    loading = false;
    if (bodyEl) requestAnimationFrame(() => { bodyEl.scrollTop = scrollTop; });
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

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()} transition:fade={scrimFade}></div>

<div class="panel" use:trapFocus transition:fly={panelFly}>
  <div class="panel-head">
    <span class="panel-title">Time Travel</span>
    {#if logs.length > 0}
      <button class="clear-btn" on:click={async () => { try { await clearLogs(); logs = []; } catch { showError('Failed to clear history.'); } }}>Clear all</button>
    {/if}
    <button class="close-btn" on:click={() => requestClose()} aria-label="Close">✕</button>
  </div>

  <div class="tt-body" bind:this={bodyEl}>
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
            {#if clickable}
              <div
                class="entry clickable"
                role="button"
                tabindex="0"
                on:click={() => openEntry(log)}
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEntry(log); } }}
              >
                <span class="action-pill" style="background:color-mix(in srgb, {ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:{ACTION_COLOR[log.action] ?? '#a39c90'}">{ACTION_LABEL[log.action] ?? log.action}</span>
                <span class="entry-desc">{describeLog(log)}</span>
                <span class="source-pill source-{log.source ?? 'pc'}">{log.source ?? 'pc'}</span>
                <span class="entry-time">{fmt(log.ts).split(' · ')[1]}</span>
                {#if log.project_name && entityLabel(log) !== 'project'}
                  <span class="entry-project">{log.project_name}</span>
                {/if}
              </div>
            {:else}
              <!-- role="listitem" matches the day-group's implicit list semantics;
                   never focusable since these entries have no click action. -->
              <div class="entry" role="listitem">
                <span class="action-pill" style="background:color-mix(in srgb, {ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:{ACTION_COLOR[log.action] ?? '#a39c90'}">{ACTION_LABEL[log.action] ?? log.action}</span>
                <span class="entry-desc">{describeLog(log)}</span>
                <span class="source-pill source-{log.source ?? 'pc'}">{log.source ?? 'pc'}</span>
                <span class="entry-time">{fmt(log.ts).split(' · ')[1]}</span>
                <!-- Skipped for a project's own create/delete entry -- its
                     name is already the main description's subject. Own
                     grid row (not an inline suffix) so it never wraps mid-
                     sentence or lands split across two lines depending on
                     description length (owner-reported 2026-07-18). -->
                {#if log.project_name && entityLabel(log) !== 'project'}
                  <span class="entry-project">{log.project_name}</span>
                {/if}
              </div>
            {/if}
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
  /* .scrim is defined globally in app.css */

  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 100vw);
    background: var(--surface); border-left: 1px solid var(--border);
    box-shadow: -8px 0 32px rgba(0,0,0,.15); z-index: 402;
    display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top, 0px);
  }

  .panel-head {
    display: flex; align-items: center; gap: 8px;
    padding: 20px 24px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .panel-title { font-size: 16px; font-weight: 700; flex: 1; letter-spacing: -.015em; }

  .clear-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px;
    cursor: pointer; font-size: 11.5px; font-weight: 500; color: var(--muted);
    padding: 4px 10px; transition: color .12s, border-color .12s;
  }
  .clear-btn:hover { color: var(--danger); border-color: var(--danger); }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: color .12s, background .12s;
  }
  .close-btn:hover { color: var(--text); background: var(--hover); }

  .tt-body { flex: 1; overflow-y: auto; padding: 8px 20px 20px; }
  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }

  .day-group { margin-bottom: 16px; }
  .day-head {
    display: flex; align-items: baseline; gap: 10px;
    padding-bottom: 5px; margin-bottom: 5px; border-bottom: 1px solid var(--border);
  }
  .day-label { font-weight: 700; font-size: 12.5px; }
  .day-summary { font-family: var(--mono); font-size: 10px; color: var(--faint); }

  /* Grid, not flex -- with flex, the description's start position shifted
     per row depending on how wide that row's own action-pill text was
     ("Created" vs "Edited" vs "Moved" vs "Deleted"), so nothing lined up
     (owner feedback, 2026-07-18: "make all text start from same line").
     Fixed first/third/fourth columns pin every description to the same
     x position regardless of pill/device-name length.
     .entry-project is an optional second grid row, column 2 only -- it
     used to be an inline "· ProjectName" suffix appended to entry-desc,
     which wrapped unpredictably: sometimes staying on the description's
     line, sometimes splitting across two depending on description length
     (owner-reported 2026-07-18: "part on first row and part on second").
     A dedicated row always lands in the same place regardless of how long
     the description is. */
  .entry {
    display: grid; grid-template-columns: 60px 1fr 56px 54px; column-gap: 10px;
    row-gap: 4px; align-items: start;
    padding: 7px 8px; margin-bottom: 1px; border-radius: 5px; font-size: 12.5px; line-height: 1.45;
  }
  .entry.clickable { cursor: pointer; }
  .entry.clickable:hover { background: var(--hover); }

  .action-pill {
    font-family: var(--mono); font-size: 9.5px; font-weight: 500;
    letter-spacing: .03em; text-transform: uppercase;
    padding: 1px 6px; border-radius: 4px;
    justify-self: start; width: fit-content;
  }

  /* Wraps normally -- this used to be truncated with an ellipsis
     (owner-reported 2026-07-18), which defeats the point of a view
     meant to be read. */
  .entry-desc { grid-column: 2; min-width: 0; color: var(--text); white-space: normal; word-break: break-word; }
  /* Own row directly under the description, column 2 only -- see the
     .entry comment above for why this isn't an inline suffix anymore. */
  .entry-project {
    grid-column: 2; font-family: var(--mono); font-size: 10px; color: var(--faint);
  }

  .source-pill {
    font-family: var(--mono); font-size: 9px; font-weight: 600;
    letter-spacing: .04em; text-transform: uppercase;
    padding: 1px 6px; border-radius: 4px;
    background: var(--col-bg); color: var(--muted);
    justify-self: start; width: fit-content;
  }
  .source-pill.source-mobile { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }

  /* nowrap + a wide-enough column -- "09:53 AM" used to wrap onto two
     lines in a 46px column, which silently inflated the whole row's
     height (grid rows size to their tallest cell) and left a stray gap
     between the description and the project-name row below it even
     though neither of those had actually grown (owner-reported
     2026-07-18: "empty rows between log and project name"). */
  .entry-time { font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; }

  /* align-items: start (not baseline) on .entry means these two sit
     flush with the top of the row; nudge down slightly to align with
     the description text's cap-height instead of its extra line-height. */
  .action-pill, .source-pill, .entry-time { margin-top: 2px; }

  .load-more-btn {
    display: block; margin: 8px auto 0;
    padding: .5rem 1.2rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
    font-size: .82rem; font-weight: 500; cursor: pointer;
    transition: background .12s;
  }
  .load-more-btn:hover:not(:disabled) { background: var(--hover); }
  .load-more-btn:disabled { opacity: .6; cursor: default; }
</style>
