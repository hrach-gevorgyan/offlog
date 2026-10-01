<script lang="ts">
  // History (desktop: Time Travel) as a phone page: every logged change,
  // grouped by local day, newest first.
  import { onMount } from 'svelte';
  import { getRecentLogs, getTaskById, clearLogs, subscribe, type LogDoc } from '../../db';
  import { showError } from '../../store';
  import { describeLog, fmt, entityLabel, ACTION_LABEL } from '../../logFormat';
  import { confirmAction } from '../../confirm';
  import TopBar from '../TopBar.svelte';
  import { actions } from '../nav';

  // A growing limit on getRecentLogs(), not a date-range query.
  const PAGE_SIZE = 150;
  let limit = PAGE_SIZE;
  let logs: LogDoc[] = [];
  let loading = false;
  let loaded = false;
  let hasMore = false;

  // subscribe() fires on every write app-wide: a change that lands mid-load
  // queues one follow-up load instead of starting another or being lost.
  let again = false;
  async function load() {
    if (loading) { again = true; return; }
    loading = true;
    try {
      const fetched = await getRecentLogs(limit);
      hasMore = fetched.length === limit;
      logs = fetched;
      loaded = true;
    } catch {
      showError('Failed to load history.');
    } finally {
      loading = false;
    }
    if (again) { again = false; await load(); }
  }
  function loadMore() { limit += PAGE_SIZE; load(); }
  onMount(() => {
    load();
    return subscribe(() => load());
  });

  // Local calendar day: ts is stored in UTC, so slicing the ISO string would
  // put late-evening changes under tomorrow west of UTC.
  function dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const todayKey = dayKey(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterdayKey = dayKey(y);
  const thisYear = new Date().getFullYear();
  function dayLabel(key: string): string {
    if (key === todayKey) return 'Today';
    if (key === yesterdayKey) return 'Yesterday';
    const [yy, m, d] = key.split('-').map(Number);
    return new Date(yy, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: yy !== thisYear ? 'numeric' : undefined });
  }

  // The device chip only tells devices apart, so it shows once there are two.
  $: multiDevice = new Set(logs.map(l => l.source ?? 'pc')).size > 1;

  $: groups = (() => {
    const map = new Map<string, LogDoc[]>();
    for (const log of logs) {
      const key = dayKey(new Date(log.ts));
      (map.get(key) ?? map.set(key, []).get(key)!).push(log);
    }
    return [...map].map(([key, entries]) => ({ key, label: dayLabel(key), entries }));
  })();

  async function open(log: LogDoc) {
    try {
      const task = await getTaskById(log.ref);
      if (!task) { showError('This task no longer exists.'); return; }
      actions.openTask(task);
    } catch {
      showError('Could not open this task right now.');
    }
  }

  // Confirmed: this erases the only record of what a task looked like before
  // an unwanted edit.
  async function clearAll() {
    if (!(await confirmAction('Clear the entire history? This erases the record of every change ever made, and cannot be undone. Your tasks stay.', { danger: true, confirmLabel: 'Clear all' }))) return;
    try {
      await clearLogs();
      logs = [];
      hasMore = false;
    } catch {
      showError('Failed to clear history.');
    }
  }
</script>

<TopBar title="History" sub="Every change, newest first">
  {#if logs.length}<button class="p-tbtn danger" on:click={clearAll}>Clear all</button>{/if}
</TopBar>

{#if loaded && groups.length === 0}
  <p class="p-empty">Nothing logged yet.</p>
{:else if groups.length}
  {#each groups as g (g.key)}
    <div class="p-sec" role="heading" aria-level="2">{g.label}</div>
    <div class="p-group">
      {#each g.entries as log (log._id)}
        {@const isTask = entityLabel(log) === 'task'}
        {@const sub = (ACTION_LABEL[log.action] ?? log.action) + (log.project_name && entityLabel(log) !== 'project' ? ` · ${log.project_name}` : '')}
        {#if isTask}
          <button class="p-row entry" on:click={() => open(log)}>
            <span class="p-k"><span class="desc">{describeLog(log)}</span><span class="p-sub">{sub}{#if multiDevice} · <span class="src">{log.source ?? 'pc'}</span>{/if}</span></span>
            <span class="p-v">{fmt(log.ts).split(' · ')[1] ?? ''}</span>
          </button>
        {:else}
          <div class="p-row entry static">
            <span class="p-k"><span class="desc">{describeLog(log)}</span><span class="p-sub">{sub}{#if multiDevice} · <span class="src">{log.source ?? 'pc'}</span>{/if}</span></span>
            <span class="p-v">{fmt(log.ts).split(' · ')[1] ?? ''}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/each}
  {#if hasMore}
    <button class="p-tbtn more" on:click={loadMore} disabled={loading}>Load more</button>
  {/if}
{/if}

<style>
  .p-row.entry .p-k > .desc { white-space: normal; overflow-wrap: anywhere; }
  .entry { align-items: flex-start; }
  .entry .p-v { font-size: 13.5px; padding-top: 2px; }
  .static { cursor: default; }
  .p-row.static:active { background: none; }
  .src { font-size: 11px; font-weight: 700; background: var(--col-bg); border-radius: 6px; padding: 1px 6px; white-space: nowrap; }
  .more { display: block; margin: 0 auto; min-height: 44px; }
</style>
