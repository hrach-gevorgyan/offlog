<script lang="ts">
  import Empty from './Empty.svelte';
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

  // Refreshes overlap (every change re-runs one); only the newest may land.
  let refreshSeq = 0;
  async function refresh() {
    const mine = ++refreshSeq;
    try {
      const l = loadFocusLock();
      let lk: TaskDoc[] = [];
      if (l) {
        const got = await Promise.all(l.taskIds.map(id => getTaskById(id)));
        lk = got.filter((t): t is TaskDoc => !!t && !t.deleted && !t.archived);
      }
      let r: ReturnType<typeof rankPicker> | null = null;
      if (lk.length < MAX) {
        const ids = new Set(lk.map(t => t._id));
        r = rankPicker((await getOpenTasksForFocusPicker()).filter(t => !ids.has(t._id)), today(), MAX - lk.length, seed);
      }
      if (mine !== refreshSeq) return;
      lock = l;
      locked = lk;
      if (r) {
        suggested = r.suggested;
        rest = r.rest;
        selected = selected.filter(id => [...suggested.map(s => s.task), ...rest].some(t => t._id === id));
      } else { suggested = []; rest = []; selected = []; }
      loaded = true;
    } catch {
      if (mine === refreshSeq) showError('Could not load Focus. Please try again.');
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
    if (s.reason === 'overdue') return 'Overdue';
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

  // The day's three places: committed tasks, then this pick, then empty ones.
  $: lockedN = active ? locked.length : 0;
  $: pool = [...suggested.map(x => x.task), ...rest];
  $: picks = selected.map(id => pool.find(t => t._id === id)).filter((t): t is Row => !!t);

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
    <div class="slots">
      {#each Array(MAX) as _, i}
        {#if i < lockedN}
          <div class="slot full">{locked[i].title}</div>
        {:else if picks[i - lockedN]}
          {@const t = picks[i - lockedN]}
          <button class="slot pend" on:click={() => toggle(t._id ?? '')} aria-label="Take {t.title} out of this pick">{t.title}</button>
        {:else}
          <div class="slot"><span class="p-sr">Empty place </span>{i + 1}</div>
        {/if}
      {/each}
    </div>
    <div class="p-sec" role="heading" aria-level="2">Suggested</div>
    <div class="rows">
      {#each suggested as s (s.task._id)}
        {@const on = selected.includes(s.task._id ?? '')}
        <button class="lrow" class:picked={on} aria-pressed={on} on:click={() => toggle(s.task._id ?? '')}>
          <span class="t">{s.task.title}<span class="pj">{s.task.project_name ?? ''} · <span class="why {s.reason}">{why(s)}</span></span></span>
          <span class="add">{on ? 'Added' : '+ Add'}</span>
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
              <span class="t">{t.title}<span class="pj">{t.project_name ?? ''}</span></span>
              <span class="add">{on ? 'Added' : '+ Add'}</span>
            </button>
          {/each}
        </div>
      {:else}
        <button class="p-tbtn more" on:click={() => (showAll = true)}>Show all {rest.length + suggested.length} open tasks</button>
      {/if}
    {/if}
  {:else if !active}
    <Empty title="Nothing to pick" text="Add a few tasks first, then choose up to three." />
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
  .lrow.picked { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); }
  .lrow.picked:active { background: color-mix(in srgb, var(--accent) 22%, var(--surface)); }
  .why { font-weight: 600; color: var(--faint); }
  .why.pinned { color: var(--accent-ink); }
  .why.overdue { color: var(--overdue-ink); }
  .why.due_soon { color: var(--due-soon-ink); }
  .add { flex-shrink: 0; font-size: var(--p-fs-s); font-weight: 700; color: var(--accent-ink); }
  .picked .add { color: var(--faint); }
  /* Three places for the day, filled left to right. */
  .slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 0 18px; }
  .slot {
    min-height: 68px; border-radius: 14px; box-sizing: border-box; padding: 8px 10px; display: flex; align-items: center; justify-content: center; text-align: center;
    border: 2px dashed var(--check-ring); color: var(--faint); font: inherit; font-size: var(--p-fs-s); font-weight: 700; overflow-wrap: anywhere;
    background: none; transition: background var(--dur-small) var(--ease-decelerate), border-color var(--dur-small) var(--ease-decelerate);
  }
  .slot.full { border: 0; background: var(--accent); color: var(--on-accent); }
  .slot.pend { border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); cursor: pointer; }
  .slot.full, .slot.pend { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; padding-top: 12px; }
  .go { margin-top: 14px; }
  .more { display: block; margin: 10px auto 0; min-height: 44px; }
</style>
