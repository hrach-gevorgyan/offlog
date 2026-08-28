<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { panelIn, panelOut, panelScrimIn, panelScrimOut, exitMs } from './motion';
  import { getRecentLogs, getTaskById, clearLogs, subscribe } from './db';
  import { projects, showError } from './store';
  import { describeLog, fmt, entityLabel, ACTION_LABEL } from './logFormat';
  import { ACTION_COLOR } from './utils';
  import { closeOnBack } from './modalStack';
  import { confirmAction } from './confirm';
  import { trapFocus } from './focusTrap';
  import CardDetail from './CardDetail.svelte';
  import type { TaskDoc, ProjectDoc } from './types';
  import type { LogDoc } from './db';
  // Svelte does not run intro transitions on a component's own root elements
  // when the component itself is being created -- and every panel here is
  // created by a parent's {#if}. The result was that no modal in this app
  // animated at all, however carefully its preset was tuned. Gating the
  // markup on a flag set in onMount() makes the elements the product of an
  // UPDATE inside this component, which is what Svelte animates.
  // See docs/motion.md.
  let __introReady = false;
  onMount(() => { __introReady = true; });

  // The single surface over `log:` docs: day-grouped and paginated, with
  // per-row detail (project badge, source pill, Clear all) and
  // click-to-open on task entries.
  const dispatch = createEventDispatcher();
    // Closing hides the markup first and only tells the parent once the outro
  // has played -- the parent's {#if} destroys this component the instant it
  // hears, which would cut the exit off before its first frame.
  //
  // modalStack is deliberately untouched: closeOnBack() still runs
  // history.back() immediately and unwinds its own entry, so back-button
  // behaviour is identical. Only the parent notification waits.
  //
  // The duration is read HERE, at close time, so Reduce Motion is honoured
  // even if it was switched on after this modal opened.
  const requestClose = closeOnBack(() => {
    __introReady = false;
    setTimeout(() => dispatch('close'), exitMs.panel(560));
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  // Pagination is a growing limit on getRecentLogs(), not a date-range
  // query — adequate at single-user scale and adds no new query surface.
  const PAGE_SIZE = 150;
  let limit = PAGE_SIZE;
  let logs: LogDoc[] = [];
  let loading = true;
  let hasMore = true;
  let bodyEl: HTMLDivElement;

  // subscribe() is db.ts's single global change feed: it fires on *every*
  // doc write app-wide, not just log: docs, so this reruns constantly while
  // the panel stays open. Scroll position must be preserved across the
  // full-array replace (otherwise an unrelated edit snaps a scrolled reader
  // to the top), and overlapping reloads are skipped.
  async function load() {
    if (loading && logs.length > 0) return; // already loading, not the initial mount
    loading = true;
    const scrollTop = bodyEl?.scrollTop ?? 0;
    try {
      const fetched = await getRecentLogs(limit);
      hasMore = fetched.length === limit; // exactly the cap -> there may be more
      logs = fetched;
      if (bodyEl) requestAnimationFrame(() => { bodyEl.scrollTop = scrollTop; });
    } catch {
      showError('Failed to load history.');
    } finally {
      loading = false;
    }
  }

  function loadMore() { limit += PAGE_SIZE; load(); }

  onMount(() => {
    load();
    return subscribe(() => load());
  });

  // Local calendar date, not a raw ISO slice: ts is stored UTC (db.ts's
  // now()), so slicing the string groups late-evening entries into
  // "tomorrow" for anyone west of UTC.
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

  interface DayGroup { key: string; label: string; entries: LogDoc[]; counts: Record<string, number> }

  $: groups = (() => {
    const map = new Map<string, LogDoc[]>();
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
  // Folded into CardDetail's {#key} below: {#key detailTask._id} alone
  // doesn't change value on a fast close-then-reopen of the same task, so
  // Svelte reverses the outro instead of remounting and the component's
  // already-spent closeOnBack() handle leaves it stuck open.
  let detailOpenSession = 0;

  async function openEntry(log: LogDoc) {
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

  async function openRelatedTask(id: string) {
    try {
      const task = await getTaskById(id);
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
<div class="scrim" on:click|self={() => requestClose()} in:fade={panelScrimIn(560)} out:fade={panelScrimOut(560)}></div>

{#if __introReady}<div class="panel" use:trapFocus in:fly={panelIn(560)} out:fly={panelOut(560)}>
  <div class="panel-head">
    <span class="panel-title">Time Travel</span>
    {#if logs.length > 0}
      <!-- Confirmed like every other destructive action: this permanently
           erases the entire change history, the only record of what a task
           looked like before an unwanted edit or conflict resolution. -->
      <button class="clear-btn" on:click={async () => {
        if (!(await confirmAction('Clear the entire history? This erases the record of every change ever made, and cannot be undone.', { danger: true, confirmLabel: 'Clear all' }))) return;
        try { await clearLogs(); logs = []; } catch { showError('Failed to clear history.'); }
      }}>Clear all</button>
    {/if}
    <button class="close-btn" on:click={() => requestClose()} aria-label="Close">✕</button>
  </div>

  <div class="tt-body" bind:this={bodyEl}>
    {#if loading && logs.length === 0}
      <div class="empty"><span class="spinner"></span>Loading…</div>
    {:else if groups.length === 0}
      <div class="empty">Nothing logged yet. Once you create or edit a task, it'll show up here.</div>
    {:else}
      {#each groups as g (g.key)}
        <div class="day-group">
          <div class="day-head">
            <span class="day-label">{g.label}</span>
            <span class="day-summary">{summarize(g.counts)}</span>
          </div>
          <div class="entries-list" role="list" aria-label="{g.entries.length} change{g.entries.length === 1 ? '' : 's'} on {g.label}">
          {#each g.entries as log (log._id)}
            {@const clickable = entityLabel(log) === 'task'}
            {#if clickable}
              <div role="listitem">
              <div
                class="entry clickable"
                role="button"
                tabindex="0"
                on:click={() => openEntry(log)}
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEntry(log); } }}
              >
                <span class="action-pill" style="background:color-mix(in srgb, {ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:{ACTION_COLOR[log.action] ?? '#a39c90'}">{ACTION_LABEL[log.action] ?? log.action}</span>
                <span class="entry-desc">{describeLog(log)}</span>
                <span class="entry-meta">
                  <span class="source-pill source-{log.source ?? 'pc'}">{log.source ?? 'pc'}</span>
                  <span class="entry-time">{fmt(log.ts).split(' · ')[1]}</span>
                </span>
                {#if log.project_name && entityLabel(log) !== 'project'}
                  <span class="entry-project">{log.project_name}</span>
                {/if}
              </div>
              </div>
            {:else}
              <!-- role="listitem" matches entries-list's role="list" above;
                   never focusable since these entries have no click action. -->
              <div class="entry" role="listitem">
                <span class="action-pill" style="background:color-mix(in srgb, {ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:{ACTION_COLOR[log.action] ?? '#a39c90'}">{ACTION_LABEL[log.action] ?? log.action}</span>
                <span class="entry-desc">{describeLog(log)}</span>
                <span class="entry-meta">
                  <span class="source-pill source-{log.source ?? 'pc'}">{log.source ?? 'pc'}</span>
                  <span class="entry-time">{fmt(log.ts).split(' · ')[1]}</span>
                </span>
                <!-- Skipped for a project's own create/delete entry — its
                     name is already the description's subject. Its own grid
                     row, not an inline suffix, so it never wraps mid-
                     sentence depending on description length. -->
                {#if log.project_name && entityLabel(log) !== 'project'}
                  <span class="entry-project">{log.project_name}</span>
                {/if}
              </div>
            {/if}
          {/each}
          </div>
        </div>
      {/each}
      {#if hasMore}
        <button class="load-more-btn" on:click={loadMore} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>
      {/if}
    {/if}
  </div>
</div>{/if}

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
    padding: 4px 10px; transition: color var(--dur-hover) var(--ease-hover), border-color var(--dur-hover) var(--ease-hover);
  }
  .clear-btn:hover { color: var(--danger); border-color: var(--danger); }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: color var(--dur-hover) var(--ease-hover), background var(--dur-hover) var(--ease-hover);
  }
  .close-btn:hover { color: var(--text); background: var(--hover); }

  .tt-body { flex: 1; overflow-y: auto; padding: 8px 20px 20px; }
  .empty { display: flex; align-items: center; justify-content: center; gap: 9px; padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }

  .day-group { margin-bottom: 16px; }
  .day-head {
    display: flex; align-items: baseline; gap: 10px;
    padding-bottom: 5px; margin-bottom: 5px; border-bottom: 1px solid var(--border);
  }
  .day-label { font-weight: 700; font-size: 12.5px; }
  .day-summary { font-family: var(--mono); font-size: 10px; color: var(--faint); }

  /* Grid, not flex: fixed columns pin every description to the same x
     position regardless of how wide that row's action-pill text is
     ("Created" vs "Deleted"). With flex the start position shifts per row.
     .entry-project is an optional second grid row in column 2 rather than
     an inline suffix, so it always lands in the same place instead of
     wrapping unpredictably with the description. */
  .entry {
    display: grid; grid-template-columns: 60px 1fr auto; column-gap: 10px;
    row-gap: 4px; align-items: start;
    padding: 7px 8px; margin-bottom: 1px; border-radius: 5px; font-size: 12.5px; line-height: 1.45;
  }
  /* Source pill and time share one flex group in the 3rd (auto-width)
     column rather than two fixed-width columns of their own, so they
     shrink as a unit and leave the description room on a narrow phone. */
  .entry-meta {
    grid-column: 3; display: flex; align-items: center; gap: 6px; margin-top: 2px;
  }
  .entry.clickable { cursor: pointer; }
  .entry.clickable:hover { background: var(--hover); }

  .action-pill {
    font-family: var(--mono); font-size: 9.5px; font-weight: 500;
    letter-spacing: .03em; text-transform: uppercase;
    padding: 1px 6px; border-radius: 4px;
    justify-self: start; width: fit-content;
  }

  /* Wraps rather than truncating — this view exists to be read. */
  .entry-desc { grid-column: 2; min-width: 0; color: var(--text); white-space: normal; word-break: break-word; }
  /* Own row directly under the description, column 2 only -- see the
     .entry comment above for why this isn't an inline suffix. */
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

  /* nowrap, and the column must stay wide enough: a wrapped "09:53 AM"
     inflates the whole row's height (grid rows size to their tallest cell)
     and leaves a stray gap above the project-name row. */
  .entry-time { font-family: var(--mono); font-size: 10px; color: var(--faint); white-space: nowrap; }

  /* align-items: start (not baseline) on .entry sits these flush with the
     top of the row; nudge down to align with the description's cap-height
     instead of its line-height. Applied to .entry-meta rather than its two
     children so the offset lands once. */
  .action-pill { margin-top: 2px; }

  .load-more-btn {
    display: block; margin: 8px auto 0;
    padding: .5rem 1.2rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
    font-size: .82rem; font-weight: 500; cursor: pointer;
    transition: background var(--dur-hover) var(--ease-hover);
  }
  .load-more-btn:hover:not(:disabled) { background: var(--hover); }
  .load-more-btn:disabled { opacity: .6; cursor: default; }
</style>
