<script lang="ts">
  // Dense rows with a search field, a sort, Pinned first and Select. In
  // Select mode a floating bar changes status, priority or tags in bulk.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { modalOpen } from '../../store';
  import { closeOnBack } from '../../modalStack';
  import { popIn, popOut } from '../../motion';
  import { duePill } from '../format';
  import { I } from '../icons';
  import { toggleDone, canFinish } from './actions';
  import { SORTS, type Sort } from './filter';
  import BulkSheet from './BulkSheet.svelte';
  import Sheet from '../Sheet.svelte';
  import Pick from '../task/Pick.svelte';

  export let project: ProjectDoc;
  // Already filtered, search included.
  export let tasks: TaskDoc[];
  export let search = '';
  export let sort: Sort = 'Status';
  // Whether any filter or search is narrowing ; picks the empty message.
  export let filtered = false;

  const dispatch = createEventDispatcher<{ open: TaskDoc }>();

  // Per device, shared with the desktop list's own toggle.
  const PINNED_KEY = 'offlog_list_pinned_first';
  let pinnedFirst = false;
  try { pinnedFirst = JSON.parse(localStorage.getItem(PINNED_KEY) ?? 'false') === true; } catch { /* default off */ }
  function togglePinned() {
    pinnedFirst = !pinnedFirst;
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedFirst)); } catch { /* not kept */ }
  }

  $: colIdx = Object.fromEntries(project.columns.map((c, i) => [c.id, i]));
  $: lastCol = project.columns.at(-1)?.id;
  $: finishable = canFinish(project);
  const byDue = (a: TaskDoc, b: TaskDoc) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority;
  function cmp(s: Sort, a: TaskDoc, b: TaskDoc): number {
    if (s === 'Due') return byDue(a, b);
    if (s === 'Priority') return b.priority - a.priority || byDue(a, b);
    if (s === 'Title') return a.title.localeCompare(b.title);
    return a.position - b.position;
  }
  const pinCmp = (on: boolean, a: TaskDoc, b: TaskDoc) => (on && !!b.pinned !== !!a.pinned ? (b.pinned ? 1 : -1) : 0);
  // Sorted by Status, rows sit under their status's heading (pinned first
  // within it), so a row needs no status label of its own.
  $: groups = sort === 'Status'
    ? project.columns
      .map(c => ({ id: c.id, name: c.name, rows: tasks.filter(t => t.column_id === c.id).sort((a, b) => pinCmp(pinnedFirst, a, b) || cmp(sort, a, b)) }))
      .filter(g => g.rows.length)
    : [{ id: '', name: '', rows: [...tasks].sort((a, b) => pinCmp(pinnedFirst, a, b) || cmp(sort, a, b)) }];
  $: rows = groups.flatMap(g => g.rows);
  const statusOf = (t: TaskDoc) => project.columns[colIdx[t.column_id]]?.name ?? '';

  // Select mode hides the Add button (modalOpen) so the bar has the bottom
  // edge, and owns a history entry so Android back leaves Select mode
  // rather than the project.
  let selecting = false;
  let selected = new Set<string>();
  let prevModal = false;
  let leaveSelect: (() => void) | null = null;
  function startSelecting() {
    if (selecting) return;
    selecting = true;
    selected = new Set();
    prevModal = $modalOpen;
    modalOpen.set(true);
    leaveSelect = closeOnBack(endSelecting);
  }
  // Runs from the history entry's pop; on-screen exits call exitSelecting.
  function endSelecting() {
    if (!selecting) return;
    selecting = false;
    selected = new Set();
    leaveSelect = null;
    modalOpen.set(prevModal);
  }
  function exitSelecting() { leaveSelect?.(); }
  onDestroy(() => {
    if (!selecting) return;
    const leave = leaveSelect;
    endSelecting();
    leave?.();
  });
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected = next;
  }
  // A task filtered out of view leaves the selection, so a bulk change
  // never reaches a task nobody can see.
  $: { const vis = new Set(rows.map(t => t._id)); if ([...selected].some(id => !vis.has(id))) selected = new Set([...selected].filter(id => vis.has(id))); }
  $: allOn = rows.length > 0 && selected.size === rows.length;

  let bulk: 'status' | 'prio' | 'tag' | null = null;
  let bulkSession = 0;
  function openBulk(k: 'status' | 'prio' | 'tag') { bulkSession++; bulk = k; }

  // The sort sheet; {#key} bumped on every open (Sheet rule).
  let sorting = false, sortSession = 0;
  let sortSheet: Sheet;
  function pickSort(v: string) { sort = v as Sort; sortSheet?.close(); }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && selecting && !bulk && !sorting) exitSelecting(); }
</script>

<svelte:window on:keydown={onKey} />

<label class="sfield">{@html I.search}<input bind:value={search} placeholder="Search tasks…" autocomplete="off" aria-label="Search tasks" /></label>
<div class="p-chips chips">
  <button class="p-chip" on:click={() => { sortSession++; sorting = true; }}>Sort: {sort}</button>
  <button class="p-chip" class:on={pinnedFirst} aria-pressed={pinnedFirst} on:click={togglePinned}>{@html I.pin}Pinned first</button>
  <button class="p-chip" class:on={selecting} aria-pressed={selecting} on:click={() => (selecting ? exitSelecting() : startSelecting())}>Select</button>
</div>

{#each groups as g (g.id)}
  {#if g.name}<div class="p-lab gh">{g.name}<span>{g.rows.length}</span></div>{/if}
  <div class="rows">
    {#each g.rows as t (t._id)}
      {@const done = t.column_id === lastCol}
      {@const pill = duePill(t.due_date, done)}
      {#if selecting}
        <button class="row" class:done class:hi={t.priority === 3} class:picked={selected.has(t._id)} role="checkbox" aria-checked={selected.has(t._id)} aria-label={t.title} on:click={() => toggle(t._id)}>
          <span class="box"></span>
          <span class="main">
            <span class="t">{t.title}</span>
            {#if !g.name}<span class="st">{statusOf(t)}</span>{/if}
          </span>
          {#if pill}<span class="p-pill {pill.tone}">{pill.text}</span>{/if}
        </button>
      {:else}
        <div class="row" class:done class:hi={t.priority === 3}>
          {#if finishable}<button class="chk" class:on={done} aria-label="{done ? 'Mark not done' : 'Finish'}: {t.title}" on:click={() => toggleDone(t, project)}></button>{/if}
          <button class="open" on:click={() => dispatch('open', t)}>
            <span class="main">
              <span class="t">{#if t.pinned}<span class="pin" aria-hidden="true">{@html I.pin}</span>{/if}{t.title}{#if t.priority === 3}<span class="p-sr">, high priority</span>{/if}{#if t.recurrence}<span class="rep" title="Repeats {t.recurrence}">{@html I.repeat}</span>{/if}</span>
              {#if !g.name}<span class="st">{statusOf(t)}</span>{/if}
            </span>
            {#if pill}<span class="p-pill {pill.tone}">{pill.text}</span>{/if}
          </button>
        </div>
      {/if}
    {/each}
  </div>
{:else}
  <p class="p-empty">{filtered ? 'No tasks match.' : 'No tasks yet.'}</p>
{/each}

{#if selecting}
  <div class="bulkbar" role="toolbar" aria-label="Selected tasks" in:fly={popIn} out:fly={popOut}>
    <button class="x" aria-label="Exit selection" on:click={exitSelecting}>{@html I.x}</button>
    <b>{selected.size} <span class="p-sr">selected</span></b>
    <button on:click={() => (selected = allOn ? new Set() : new Set(rows.map(t => t._id)))}>{allOn ? 'None' : 'All'}</button>
    <button disabled={!selected.size} on:click={() => openBulk('status')}>Status</button>
    <button disabled={!selected.size} on:click={() => openBulk('prio')}>Priority</button>
    <button disabled={!selected.size} on:click={() => openBulk('tag')}>Tag</button>
  </div>
{/if}

{#if bulk}
  {#key bulkSession}
    <BulkSheet kind={bulk} {project} tasks={rows.filter(t => selected.has(t._id))}
      on:close={() => (bulk = null)} on:done={e => { if (e.detail.clear) selected = new Set(); }} />
  {/key}
{/if}

{#if sorting}
  {#key sortSession}
    <Sheet bind:this={sortSheet} title="Sort by" on:close={() => (sorting = false)}>
      <Pick options={SORTS.map(s => ({ value: s, label: s }))} current={sort} on:pick={e => pickSort(e.detail)} />
    </Sheet>
  {/key}
{/if}

<style>
  .sfield { display: flex; align-items: center; gap: 8px; background: var(--surface); border-radius: 12px; padding: 10px 12px; margin: 0 0 10px; color: var(--faint); box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.06); }
  .sfield input { flex: 1; min-width: 0; border: 0; outline: none; background: none; font: inherit; font-size: 16px; color: var(--text); }
  .chips { margin-bottom: 10px; }
  .gh { display: flex; gap: 6px; margin-top: 14px; }
  .gh span { font-weight: 600; opacity: .8; }
  .rows { background: var(--surface); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.06); overflow: hidden; }
  .rows + .rows { margin-top: 10px; }
  .row { position: relative; width: 100%; display: flex; align-items: center; gap: 12px; padding: 0 14px; min-height: 48px; font: inherit; font-size: 15px; color: var(--text); background: none; border: 0; text-align: left; transition: background var(--dur-hover) var(--ease-hover); }
  button.row { cursor: pointer; }
  .row + .row { border-top: 1px solid var(--border); }
  .row.hi::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: color-mix(in srgb, var(--danger) 60%, transparent); }
  .row:active, .open:active { background: var(--col-bg); }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; align-self: stretch; font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 6px 0; }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .pin { color: var(--accent); display: inline-flex; vertical-align: -2px; margin-right: 4px; }
  .pin :global(svg.i) { width: 13px; height: 13px; }
  .rep { color: var(--faint); margin-left: 5px; display: inline-flex; vertical-align: -2px; }
  .rep :global(svg.i) { width: 13px; height: 13px; }
  .done .t { color: var(--faint); text-decoration: line-through; }
  .st { font-size: 12px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .chk, .box { width: 22px; height: 22px; flex-shrink: 0; position: relative; border: 2px solid color-mix(in srgb, var(--faint) 60%, transparent); background: none; padding: 0; cursor: pointer; }
  .chk { border-radius: 50%; }
  .chk::before { content: ''; position: absolute; inset: -11px; }
  .box { border-radius: 7px; }
  .chk.on, .picked .box { background: var(--accent); border-color: var(--accent); }
  .chk.on::after, .picked .box::after {
    content: ''; position: absolute; left: 6px; top: 2.5px; width: 5px; height: 10px;
    border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg);
  }
  .row.picked { background: color-mix(in srgb, var(--accent) 9%, var(--surface)); }
  /* The tab bar under the screen already clears the gesture area. */
  .bulkbar {
    position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 11;
    display: flex; align-items: center; gap: 2px; padding: 0 6px 0 2px; border-radius: 16px;
    background: var(--inverse-surface); color: var(--on-inverse); box-shadow: 0 8px 24px rgba(0,0,0,.25);
  }
  .bulkbar b { font-size: 15px; margin-right: auto; padding-left: 2px; white-space: nowrap; }
  .bulkbar button { font: inherit; font-size: 13.5px; font-weight: 600; color: inherit; background: none; border: 0; padding: 0 9px; min-height: 44px; border-radius: 10px; cursor: pointer; }
  .bulkbar .x { width: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .bulkbar .x :global(svg.i) { width: 18px; height: 18px; }
  .bulkbar button:disabled { opacity: .45; cursor: default; }
  .bulkbar button:active { background: color-mix(in srgb, var(--on-inverse) 14%, transparent); }
</style>
