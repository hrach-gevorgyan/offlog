<script lang="ts">
  import { onMount } from 'svelte';
  import type { TaskDoc } from '../types';
  import { getOpenTasksForFocusPicker, getTaskById, subscribe } from '../db';
  import { projects, showError } from '../store';
  import { PRIORITY_LABEL } from '../constants';
  import { today, loadFocusLock, saveFocusLock, type FocusLock } from '../focusLock';
  import { actions, showToast } from './nav';
  import { rankPicker, type Reason } from './focus/rank';
  import { I } from './icons';
  import TopBar from './TopBar.svelte';
  import TaskCard from './TaskCard.svelte';

  // A daily commitment of up to 3 tasks, kept in focusLock.ts. Picking is a
  // two-step choose-then-commit, as on desktop; a committed task stays until
  // it is removed, the lock is reset, or the day rolls over.
  const MAX = 3;
  type Row = TaskDoc & { project_name?: string };

  let lock: FocusLock | null = null;
  let locked: TaskDoc[] = [];
  let suggested: { task: Row; reason: Reason }[] = [];
  let rest: Row[] = [];
  let selected: string[] = [];
  let showAll = false;
  let loaded = false;

  // One tie-break per task for the life of the screen, so the suggestions
  // hold still while the user is picking from them.
  const seeds = new Map<string, number>();
  const seed = (t: TaskDoc) => {
    let r = seeds.get(t._id ?? '');
    if (r === undefined) { r = Math.random(); seeds.set(t._id ?? '', r); }
    return r;
  };

  async function refresh() {
    try {
      lock = loadFocusLock();
      if (lock) {
        const got = await Promise.all(lock.taskIds.map(id => getTaskById(id)));
        locked = got.filter((t): t is TaskDoc => !!t && !t.deleted && !t.archived);
      } else locked = [];
      if (locked.length < MAX) {
        const ids = new Set(locked.map(t => t._id));
        const r = rankPicker((await getOpenTasksForFocusPicker()).filter(t => !ids.has(t._id)), today(), MAX - locked.length, seed);
        suggested = r.suggested;
        rest = r.rest;
        selected = selected.filter(id => [...suggested.map(s => s.task), ...rest].some(t => t._id === id));
      } else { suggested = []; rest = []; selected = []; }
      loaded = true;
    } catch {
      showError('Could not load Focus. Please try again.');
    }
  }

  // A lock whose tasks were all deleted or archived is no lock at all.
  $: active = !!lock && locked.length > 0;
  $: isDone = (t: TaskDoc) => {
    const p = $projects.find(x => x._id === t.project_id);
    return !!p && t.column_id === p.columns.at(-1)?.id;
  };
  $: doneN = locked.filter(isDone).length;
  $: allDone = active && doneN === locked.length;
  $: room = MAX - (active ? locked.length : 0);

  function save(ids: string[]) {
    return write(ids.length ? { date: today(), taskIds: ids } : null);
  }
  function write(l: FocusLock | null) {
    try {
      saveFocusLock(l);
    } catch {
      showError('Could not save your focus. Please try again.');
      return false;
    }
    return true;
  }

  function toggle(id: string) {
    if (selected.includes(id)) selected = selected.filter(x => x !== id);
    else if (selected.length < room) selected = [...selected, id];
  }

  async function commit() {
    if (!selected.length) return;
    const ids = [...(active ? locked.map(t => t._id!) : []), ...selected].slice(0, MAX);
    if (!save(ids)) return;
    selected = [];
    showAll = false;
    await refresh();
  }

  // Dropping and resetting act at once; Undo puts the previous lock back.
  function undoTo(prev: FocusLock | null) {
    return async () => { if (write(prev)) await refresh(); };
  }

  async function drop(t: TaskDoc) {
    const prev = lock;
    if (!save(locked.map(x => x._id!).filter(x => x !== t._id))) return;
    showToast('Removed from focus', undoTo(prev));
    await refresh();
  }

  async function reset() {
    const prev = lock;
    if (!save([])) return;
    selected = [];
    showToast('Focus reset', undoTo(prev));
    await refresh();
  }

  function why(s: { task: Row; reason: Reason }): string {
    if (s.reason === 'pinned') return 'Pinned';
    if (s.reason === 'overdue') return 'Late';
    if (s.reason === 'due_soon') return 'Due soon';
    return `${PRIORITY_LABEL[s.task.priority] ?? 'Low'} priority`;
  }

  onMount(() => {
    refresh();
    const unsub = subscribe(() => refresh());
    // The lock is per day; re-read it so a screen left open past midnight
    // drops yesterday's commitment.
    const dayTimer = setInterval(refresh, 60 * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      unsub();
      clearInterval(dayTimer);
      document.removeEventListener('visibilitychange', refresh);
    };
  });

  $: sub = active ? `${doneN} of ${locked.length} done` : 'Pick up to three for today';
</script>

<TopBar title="Focus" {sub}>
  {#if active}<button class="p-tbtn" on:click={reset}>Reset</button>{/if}
</TopBar>

{#if active}
  <div class="bar" aria-hidden="true">{#each locked as t (t._id)}<i class:on={isDone(t)}></i>{/each}</div>
  {#if allDone}<p class="p-say">All done for today.</p>{/if}
  {#each locked as t (t._id)}
    <div class="lk">
      <div class="c"><TaskCard task={t} on:open={() => actions.openTask(t)} on:changed={refresh} /></div>
      <button class="p-ib" on:click={() => drop(t)} aria-label="Remove from focus: {t.title}">{@html I.x}</button>
    </div>
  {/each}
{/if}

{#if loaded && room > 0}
  {#if suggested.length || rest.length}
    <div class="p-sec" role="heading" aria-level="2">Suggested <span class="p-n">{room - selected.length} to pick</span></div>
    <div class="rows">
      {#each suggested as s (s.task._id)}
        {@const on = selected.includes(s.task._id ?? '')}
        <button class="lrow" class:picked={on} aria-pressed={on} on:click={() => toggle(s.task._id ?? '')}>
          <span class="box"></span>
          <span class="t">{s.task.title}<span class="pj">{s.task.project_name ?? ''}</span></span>
          <span class="why {s.reason}">{why(s)}</span>
        </button>
      {/each}
    </div>
    {#if selected.length}
      <button class="p-go go" on:click={commit}>
        {active ? `Add ${selected.length} to focus` : `Let's focus on ${selected.length} task${selected.length > 1 ? 's' : ''}`}
      </button>
    {/if}
    {#if rest.length}
      {#if showAll}
        <div class="p-sec" role="heading" aria-level="2">Other open tasks <span class="p-n">{rest.length}</span></div>
        <div class="rows">
          {#each rest as t (t._id)}
            {@const on = selected.includes(t._id ?? '')}
            <button class="lrow" class:picked={on} aria-pressed={on} on:click={() => toggle(t._id ?? '')}>
              <span class="box"></span>
              <span class="t">{t.title}<span class="pj">{t.project_name ?? ''}</span></span>
            </button>
          {/each}
        </div>
      {:else}
        <button class="p-tbtn more" on:click={() => (showAll = true)}>Show all {rest.length + suggested.length} open tasks</button>
      {/if}
    {/if}
  {:else if !active}
    <p class="p-empty">No open tasks to pick from.</p>
  {/if}
{/if}

<style>
  .bar { display: flex; gap: 5px; margin: 0 2px 14px; }
  .bar i { flex: 1; height: 5px; border-radius: 3px; background: var(--col-bg); transition: background var(--dur-medium) var(--ease-standard); }
  .bar i.on { background: var(--accent); }
  .lk { display: flex; align-items: center; gap: 2px; }
  .lk .c { flex: 1; min-width: 0; }
  .lk .p-ib { margin-bottom: 8px; }
  .rows { background: var(--surface); border-radius: 14px; box-shadow: var(--p-shadow); overflow: hidden; }
  .lrow {
    width: 100%; display: flex; align-items: center; gap: 12px; padding: 11px 14px; min-height: 52px;
    font: inherit; font-size: var(--p-fs-m); color: var(--text); background: none; border: 0; text-align: left; cursor: pointer;
    transition: background var(--dur-hover) var(--ease-hover);
  }
  .lrow + .lrow { border-top: 1px solid var(--border); }
  .lrow:active { background: var(--col-bg); }
  .lrow .t { flex: 1; min-width: 0; display: flex; flex-direction: column; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
  .pj { font-size: var(--p-fs-s); color: var(--faint); font-weight: 400; margin-top: 1px; }
  .box { width: 22px; height: 22px; border-radius: 7px; border: 2px solid var(--check-ring); flex-shrink: 0; position: relative; box-sizing: border-box; }
  .lrow.picked { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); }
  .lrow.picked:active { background: color-mix(in srgb, var(--accent) 22%, var(--surface)); }
  /* The fill and tick pop in (decelerate) and leave faster (accelerate). */
  .box { transition: background var(--dur-small-out) var(--ease-accelerate), border-color var(--dur-small-out) var(--ease-accelerate); }
  .box::after { content: ''; position: absolute; left: 5.5px; top: 1.5px; width: 5px; height: 10px; border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg) scale(.4); opacity: 0; transition: transform var(--dur-small-out) var(--ease-accelerate), opacity var(--dur-small-out) var(--ease-accelerate); }
  .lrow.picked .box { background: var(--accent); border-color: var(--accent); transition: background var(--dur-small) var(--ease-decelerate), border-color var(--dur-small) var(--ease-decelerate); }
  .lrow.picked .box::after { transform: rotate(45deg) scale(1); opacity: 1; transition: transform var(--dur-small) var(--ease-decelerate), opacity var(--dur-small) var(--ease-decelerate); }
  .why { font-size: var(--p-fs-xs); font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; background: var(--col-bg); color: var(--faint); }
  .why.pinned { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-ink); }
  .why.overdue { background: var(--overdue-bg); color: var(--overdue-ink); }
  .why.due_soon { background: var(--due-soon-bg); color: var(--due-soon-ink); }
  .go { margin-top: 14px; }
  .more { display: block; margin: 10px auto 0; min-height: 44px; }
</style>
