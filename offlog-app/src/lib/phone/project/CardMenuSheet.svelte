<script lang="ts">
  // The card menu (hold a card). Mount behind a {#key} bumped per open (Sheet rule).
  import { createEventDispatcher } from 'svelte';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { updateTask, duplicateTask, archiveTask, unarchiveTask, deleteTask, computeDropPosition } from '../../db';
  import { reloadTasks, showError } from '../../store';
  import { hapticToggle } from '../../haptics';
  import { showToast } from '../nav';
  import { restore, snapshot, toggleDone } from './actions';
  import { columnTasks, stepPosition } from './filter';
  import { I } from '../icons';
  import Sheet from '../Sheet.svelte';

  export let task: TaskDoc;
  export let project: ProjectDoc;
  // Every task in the project, filtered-out ones included: positions are
  // computed against these, so a move never lands before a hidden card.
  export let tasks: TaskDoc[];
  // The tasks on show; Move up/down step past the visible neighbour.
  export let shown: TaskDoc[] = tasks;

  const dispatch = createEventDispatcher<{ close: void }>();
  let sheet: Sheet;

  $: lastId = project.columns.at(-1)?.id;

  $: col = columnTasks(tasks, task.column_id);
  $: seen = columnTasks(shown, task.column_id);
  $: upPos = stepPosition(col, task, -1, seen);
  $: downPos = stepPosition(col, task, 1, seen);

  // Reversible changes go through at once and offer Undo.
  async function run(fn: () => Promise<unknown>, fail: string, done?: string, undo?: () => Promise<void>) {
    sheet?.close();
    try {
      await fn();
    } catch {
      showError(fail);
      return;
    }
    try { await reloadTasks(); } catch { /* the write landed; lists catch up on the next change */ }
    if (done) showToast(done, undo);
  }
  // Undo values are captured before the write; the props update after it.
  function pin() {
    const { _id, pinned } = task;
    run(async () => { await updateTask(_id, { pinned: !pinned }); hapticToggle(); },
      'Could not update this task. Please try again.', pinned ? 'Unpinned' : 'Pinned', () => restore([[_id, { pinned: !!pinned }]]));
  }
  const step = (position: number) => run(() => updateTask(task._id, { position }), 'Could not move this task. Please try again.');
  // Reaching the last status is finishing, with the checkbox's write and
  // feedback. Anything else is appended to the end of the target status, as a
  // drop onto a desktop column does.
  function toStatus(colId: string) {
    if (colId === task.column_id) { sheet?.close(); return; }
    if (colId === lastId) { sheet?.close(); toggleDone(task, project); return; }
    const position = computeDropPosition(columnTasks(tasks, colId), null);
    const id = task._id, before = snapshot(task);
    run(() => updateTask(id, { column_id: colId, position }), 'Could not move this task. Please try again.',
      `Moved to ${project.columns.find(c => c.id === colId)?.name ?? ''}`, () => restore([[id, before]]));
  }
  const duplicate = () => run(() => duplicateTask(task._id), 'Could not duplicate this task. Please try again.');
  function archive() {
    const id = task._id;
    run(() => archiveTask(id), 'Could not archive this task. Please try again.', 'Archived', () => unarchive(id));
  }
  async function unarchive(id: string) {
    try { await unarchiveTask(id); }
    catch { showError('Could not undo. Please try again.'); return; }
    try { await reloadTasks(); } catch { /* the write landed; lists catch up on the next change */ }
  }
  // Soft delete; App's undo toast offers the way back.
  const remove = () => run(() => deleteTask(task._id), 'Could not delete this task. Please try again.');
</script>

<Sheet bind:this={sheet} title={task.title} on:close={() => dispatch('close')}>
  {#if project.columns.length > 1}
    <div class="sts" role="group" aria-label="Status">
      {#each project.columns as c (c.id)}
        {@const on = c.id === task.column_id}
        <button class:on class:last={c.id === lastId} aria-pressed={on} on:click={() => toStatus(c.id)}>
          {#if on}<span class="tk">{@html I.check}</span>{/if}{c.name}
        </button>
      {/each}
    </div>
  {/if}
  <div class="p-group">
    <button class="p-row" on:click={pin}>{task.pinned ? 'Unpin' : 'Pin'}</button>
    {#if upPos !== null}<button class="p-row" on:click={() => step(upPos ?? 0)}>Move up</button>{/if}
    {#if downPos !== null}<button class="p-row" on:click={() => step(downPos ?? 0)}>Move down</button>{/if}
    <button class="p-row" on:click={duplicate}>Duplicate</button>
    <button class="p-row" on:click={archive}>Archive</button>
  </div>
  <div class="p-group"><button class="p-row danger" on:click={remove}>Delete</button></div>
</Sheet>

<style>
  /* A horizontal scroller clips vertically too, so it pads by the pills'
     tap extension and gives the space back with negative margins. */
  .sts { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: -4px -16px 8px; padding: 4px 16px 6px; }
  .sts::-webkit-scrollbar { display: none; }
  .sts button {
    position: relative; flex-shrink: 0; display: flex; align-items: center; gap: 5px; padding: 8px 13px; min-height: 36px; border-radius: 999px; border: 0; cursor: pointer;
    font: inherit; font-size: var(--p-fs-s); font-weight: 600; background: var(--surface); color: var(--muted); box-shadow: var(--p-shadow);
    transition: background var(--dur-small) var(--ease-standard), color var(--dur-small) var(--ease-standard);
  }
  .sts button::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -4px; }
  .sts button.on { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); box-shadow: none; }
  .sts button:not(.on):active { background: var(--col-bg); }
  .sts button.last { background: color-mix(in srgb, var(--success) 14%, var(--surface)); }
  .sts button.last.on { background: color-mix(in srgb, var(--success) 30%, var(--surface)); color: var(--text); }
  .tk { display: inline-flex; }
  .tk :global(svg.i) { width: 14px; height: 14px; }
</style>
