<script lang="ts">
  // Dense rows with a search field, a sort, Pinned first and Select. In
  // Select mode a floating bar changes status, priority or tags in bulk.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { modalOpen } from '../../store';
  import { popIn, popOut } from '../../motion';
  import { duePill } from '../format';
  import { I } from '../icons';
  import { toggleDone } from './actions';
  import BulkSheet from './BulkSheet.svelte';

  export let project: ProjectDoc;
  // Already filtered, search included.
  export let tasks: TaskDoc[];
  export let search = '';
  // Whether any filter or search is narrowing ; picks the empty message.
  export let filtered = false;

  const dispatch = createEventDispatcher<{ open: TaskDoc }>();

  const SORTS = ['Status', 'Due', 'Priority', 'Title'] as const;
  type Sort = typeof SORTS[number];
  let sort: Sort = 'Status';
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
  const byDue = (a: TaskDoc, b: TaskDoc) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority;
  function cmp(s: Sort, a: TaskDoc, b: TaskDoc): number {
    if (s === 'Due') return byDue(a, b);
    if (s === 'Priority') return b.priority - a.priority || byDue(a, b);
    if (s === 'Title') return a.title.localeCompare(b.title);
    return (colIdx[a.column_id] ?? 0) - (colIdx[b.column_id] ?? 0) || a.position - b.position;
  }
  $: rows = [...tasks].sort((a, b) => (pinnedFirst && !!b.pinned !== !!a.pinned ? (b.pinned ? 1 : -1) : cmp(sort, a, b)));

  // Select mode hides the Add button (modalOpen) so the bar has the bottom edge.
  let selecting = false;
  let selected = new Set<string>();
  let prevModal = false;
  function setSelecting(on: boolean) {
    if (on === selecting) return;
    selecting = on;
    selected = new Set();
    if (on) { prevModal = $modalOpen; modalOpen.set(true); } else modalOpen.set(prevModal);
  }
  onDestroy(() => { if (selecting) modalOpen.set(prevModal); });
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

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && selecting && !bulk) setSelecting(false); }
</script>

<svelte:window on:keydown={onKey} />

<label class="sfield">{@html I.search}<input bind:value={search} placeholder="Search tasks…" autocomplete="off" aria-label="Search tasks" /></label>
<div class="p-chips chips">
  <button class="p-chip" on:click={() => (sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])}>Sort: {sort}</button>
  <button class="p-chip" class:on={pinnedFirst} aria-pressed={pinnedFirst} on:click={togglePinned}>{@html I.pin}Pinned first</button>
  <button class="p-chip" class:on={selecting} on:click={() => setSelecting(!selecting)}>{selecting ? 'Done selecting' : 'Select'}</button>
</div>

{#if rows.length}
  <div class="rows">
    {#each rows as t (t._id)}
      {@const done = t.column_id === lastCol}
      {@const pill = duePill(t.due_date, done)}
      {#if selecting}
        <button class="row" class:done class:hi={t.priority === 3} class:picked={selected.has(t._id)} role="checkbox" aria-checked={selected.has(t._id)} aria-label={t.title} on:click={() => toggle(t._id)}>
          <span class="box"></span>
          <span class="t">{t.title}</span>
          {#if pill}<span class="p-pill {pill.tone}">{pill.text}</span>{/if}
          <span class="st">{project.columns[colIdx[t.column_id]]?.name ?? ''}</span>
        </button>
      {:else}
        <div class="row" class:done class:hi={t.priority === 3}>
          <button class="chk" class:on={done} aria-label="{done ? 'Mark not done' : 'Finish'}: {t.title}" on:click={() => toggleDone(t, project)}></button>
          <button class="open" on:click={() => dispatch('open', t)}>
            <span class="t">{#if t.pinned}<span class="pin" aria-hidden="true">●</span>{/if}{t.title}{#if t.recurrence}<span class="rep" title="Repeats {t.recurrence}">{@html I.repeat}</span>{/if}</span>
            {#if pill}<span class="p-pill {pill.tone}">{pill.text}</span>{/if}
            <span class="st">{project.columns[colIdx[t.column_id]]?.name ?? ''}</span>
          </button>
        </div>
      {/if}
    {/each}
  </div>
{:else}
  <p class="p-empty">{filtered ? 'No tasks match.' : 'No tasks yet.'}</p>
{/if}

{#if selecting}
  <div class="bulkbar" role="toolbar" aria-label="Selected tasks" in:fly={popIn} out:fly={popOut}>
    <b>{selected.size} selected</b>
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

<style>
  .sfield { display: flex; align-items: center; gap: 8px; background: var(--surface); border-radius: 12px; padding: 10px 12px; margin: 0 0 10px; color: var(--faint); box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.06); }
  .sfield input { flex: 1; min-width: 0; border: 0; outline: none; background: none; font: inherit; font-size: 16px; color: var(--text); }
  .chips { margin-bottom: 10px; }
  .rows { background: var(--surface); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.06); overflow: hidden; }
  .row { position: relative; width: 100%; display: flex; align-items: center; gap: 12px; padding: 0 14px; min-height: 48px; font: inherit; font-size: 15px; color: var(--text); background: none; border: 0; text-align: left; transition: background var(--dur-hover) var(--ease-hover); }
  button.row { cursor: pointer; }
  .row + .row { border-top: 1px solid var(--border); }
  .row.hi::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: var(--danger); }
  .row:active, .open:active { background: var(--col-bg); }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; align-self: stretch; font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
  .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .pin { color: var(--accent); margin-right: 5px; font-size: 10px; vertical-align: 2px; }
  .rep { color: var(--faint); margin-left: 5px; display: inline-flex; vertical-align: -2px; }
  .rep :global(svg.i) { width: 13px; height: 13px; }
  .done .t { color: var(--faint); text-decoration: line-through; }
  .st { font-size: 12px; color: var(--faint); white-space: nowrap; max-width: 30%; overflow: hidden; text-overflow: ellipsis; }
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
  .bulkbar {
    position: absolute; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 11;
    display: flex; align-items: center; gap: 2px; padding: 6px 6px 6px 16px; border-radius: 16px;
    background: var(--text); color: var(--bg); box-shadow: 0 8px 24px rgba(0,0,0,.25);
  }
  .bulkbar b { font-size: 14px; margin-right: auto; white-space: nowrap; }
  .bulkbar button { font: inherit; font-size: 13.5px; font-weight: 600; color: inherit; background: none; border: 0; padding: 0 9px; min-height: 40px; border-radius: 10px; cursor: pointer; }
  .bulkbar button:disabled { opacity: .45; cursor: default; }
  .bulkbar button:active { background: color-mix(in srgb, var(--bg) 16%, transparent); }
</style>
