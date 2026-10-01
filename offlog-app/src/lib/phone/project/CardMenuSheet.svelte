<script lang="ts">
  // The card menu (hold a card). Mount behind a {#key} bumped per open (Sheet rule).
  import { createEventDispatcher } from 'svelte';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { updateTask, duplicateTask, archiveTask, deleteTask, computeDropPosition } from '../../db';
  import { reloadTasks, showError } from '../../store';
  import { hapticToggle } from '../../haptics';
  import { showToast } from '../nav';
  import { restore, snapshot } from './actions';
  import { columnTasks, stepPosition } from './filter';
  import { I } from '../icons';
  import Sheet from '../Sheet.svelte';

  export let task: TaskDoc;
  export let project: ProjectDoc;
  // The project's tasks as currently shown; positions are computed against these.
  export let tasks: TaskDoc[];

  const dispatch = createEventDispatcher<{ close: void }>();
  let sheet: Sheet;
  let view: 'main' | 'status' = 'main';

  $: col = columnTasks(tasks, task.column_id);
  $: upPos = stepPosition(col, task, -1);
  $: downPos = stepPosition(col, task, 1);

  // Reversible changes go through at once and offer Undo.
  async function run(fn: () => Promise<unknown>, fail: string, done?: string, undo?: () => Promise<void>) {
    sheet.close();
    try {
      await fn();
      await reloadTasks();
    } catch {
      showError(fail);
      return;
    }
    if (done) showToast(done, undo);
  }
  // Undo values are captured before the write; the props update after it.
  function pin() {
    const { _id, pinned } = task;
    run(async () => { await updateTask(_id, { pinned: !pinned }); hapticToggle(); },
      'Could not update this task. Please try again.', pinned ? 'Unpinned' : 'Pinned', () => restore([[_id, { pinned: !!pinned }]]));
  }
  const step = (position: number) => run(() => updateTask(task._id, { position }), 'Could not move this task. Please try again.');
  // Appended to the end of the target status, as a drop onto a desktop column does.
  function toStatus(colId: string) {
    if (colId === task.column_id) { sheet.close(); return; }
    const position = computeDropPosition(columnTasks(tasks, colId), null);
    const id = task._id, before = snapshot(task);
    run(() => updateTask(id, { column_id: colId, position }), 'Could not move this task. Please try again.',
      `Moved to ${project.columns.find(c => c.id === colId)?.name ?? ''}`, () => restore([[id, before]]));
  }
  const duplicate = () => run(() => duplicateTask(task._id), 'Could not duplicate this task. Please try again.');
  function archive() {
    const id = task._id;
    run(() => archiveTask(id), 'Could not archive this task. Please try again.', 'Archived', () => restore([[id, { archived: false, archivedWithProject: false }]]));
  }
  // Soft delete; App's undo toast offers the way back.
  const remove = () => run(() => deleteTask(task._id), 'Could not delete this task. Please try again.');
</script>

<Sheet bind:this={sheet} title={view === 'status' ? 'Move to' : task.title} on:close={() => dispatch('close')}>
  {#if view === 'main'}
    <div class="p-group">
      <button class="p-row" on:click={pin}>{task.pinned ? 'Unpin' : 'Pin'}</button>
      {#if project.columns.length > 1}<button class="p-row" on:click={() => view = 'status'}>Move to status…</button>{/if}
      {#if upPos !== null}<button class="p-row" on:click={() => step(upPos ?? 0)}>Move up</button>{/if}
      {#if downPos !== null}<button class="p-row" on:click={() => step(downPos ?? 0)}>Move down</button>{/if}
      <button class="p-row" on:click={duplicate}>Duplicate</button>
      <button class="p-row" on:click={archive}>Archive</button>
    </div>
    <div class="p-group"><button class="p-row danger" on:click={remove}>Delete</button></div>
  {:else}
    <div class="p-group">
      {#each project.columns as c (c.id)}
        <button class="p-row" on:click={() => toStatus(c.id)}>
          {c.name}{#if c.id === task.column_id}<span class="p-tick">{@html I.check}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</Sheet>
