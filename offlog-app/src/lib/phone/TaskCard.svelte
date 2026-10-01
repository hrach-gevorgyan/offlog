<script lang="ts">
  import { soften } from '../tagColors';
  import { createEventDispatcher } from 'svelte';
  import type { TaskDoc } from '../types';
  import { projects, spaces, showError } from '../store';
  import { updateTask } from '../db';
  import { duePill } from './format';
  import { I } from './icons';
  import { showToast } from './nav';
  import { snapshot, restore } from './project/actions';
  import { markLeaving, markReturning } from './rowMotion';

  export let task: TaskDoc & { project_name?: string };

  const dispatch = createEventDispatcher<{ open: TaskDoc; changed: void }>();

  $: project = $projects.find(p => p._id === task.project_id);
  $: space = $spaces.find(s => s._id === task.space_id);
  $: lastCol = project?.columns.at(-1)?.id;
  $: done = !!lastCol && task.column_id === lastCol;
  $: pill = duePill(task.due_date, done);
  $: steps = task.checklist ?? [];
  let busy = false;
  // The check fills on the tap, before the write lands; a fresh task from
  // the list (or a failed write) puts it back to the real state.
  let pending: boolean | null = null;
  $: shown = pending ?? done;
  $: settle(task);
  function settle(_t: TaskDoc) { pending = null; }

  // Finishing moves the task to its project's last status; un-finishing
  // sends it back to the first. There is no done flag.
  async function toggleDone() {
    if (!project || busy) return;
    const target = done ? project.columns[0]?.id : lastCol;
    if (!target) return;
    busy = true;
    try {
      // Finishing a repeating task also moves its date, reminder and steps,
      // so Undo puts all of them back, not just the status.
      const before = snapshot(task), id = task._id, title = task.title;
      pending = !done;
      markLeaving(id);
      await updateTask(id, { column_id: target });
      dispatch('changed');
      if (!done) showToast(`Done: ${title}`, async () => { markReturning(id); await restore([[id, before]]); dispatch('changed'); });
    } catch {
      pending = null;
      showError('Could not update this task. Please try again.');
    } finally {
      busy = false;
    }
  }
</script>

<div class="card" class:done class:hi={task.priority === 3}>
  <button class="chk" class:on={shown} on:click={toggleDone} aria-label="{done ? 'Mark not done' : 'Finish'}: {task.title}" disabled={busy}></button>
  <button class="g" on:click={() => dispatch('open', task)}>
    <span class="t">{task.title}{#if task.priority === 3}<span class="p-sr">, high priority</span>{/if}</span>
    <span class="s">
      {#if space}<span class="dot" style="background:{soften(space.color)}"></span>{/if}
      {task.project_name ?? project?.name ?? ''}
      {#if task.recurrence}<span class="ic">· {@html I.repeat}</span>{/if}
      {#if steps.length}<span>· {steps.filter(s => s.done).length}/{steps.length}</span>{/if}
    </span>
  </button>
  {#if pill}<span class="pill {pill.tone}">{pill.text}</span>{/if}
</div>

<style>
  .card {
    position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px;
    background: var(--surface); border-radius: 12px; padding: 12px 12px 12px 14px; margin-bottom: 8px;
    box-shadow: var(--p-shadow);
    transition: transform var(--dur-hover) var(--ease-hover);
  }
  .card.hi::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: color-mix(in srgb, var(--danger) 60%, transparent); }
  .card:active { transform: scale(.98); }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
  .g { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-size: var(--p-fs-l); font-weight: 600; line-height: 1.3; }
  .s { font-size: var(--p-fs-s); color: var(--faint); margin-top: 3px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ic :global(svg) { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.8; vertical-align: -2px; }
  .done .t { color: var(--faint); text-decoration: line-through; }
  .done { opacity: .75; }
  .chk {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; position: relative;
    border: 2px solid color-mix(in srgb, var(--faint) 60%, transparent);
  }
  .chk::before { content: ''; position: absolute; inset: -11px; }
  .chk:not(.on):active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  /* The fill and tick pop in on finishing (decelerate) and leave faster
     (accelerate); the base rule holds the leaving values. */
  .chk { transition: background var(--dur-small-out) var(--ease-accelerate), border-color var(--dur-small-out) var(--ease-accelerate); }
  .chk::after {
    content: ''; position: absolute; left: 6px; top: 2.5px; width: 5px; height: 10px;
    border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg) scale(.4); opacity: 0;
    transition: transform var(--dur-small-out) var(--ease-accelerate), opacity var(--dur-small-out) var(--ease-accelerate);
  }
  .chk.on { background: var(--accent); border-color: var(--accent); transition: background var(--dur-small) var(--ease-decelerate), border-color var(--dur-small) var(--ease-decelerate); }
  .chk.on::after { transform: rotate(45deg) scale(1); opacity: 1; transition: transform var(--dur-small) var(--ease-decelerate), opacity var(--dur-small) var(--ease-decelerate); }
  .pill { font-size: var(--p-fs-xs); font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--col-bg); color: var(--muted); white-space: nowrap; }
  .pill.today { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .pill.late { background: var(--overdue-bg); color: var(--overdue-ink); }
</style>
