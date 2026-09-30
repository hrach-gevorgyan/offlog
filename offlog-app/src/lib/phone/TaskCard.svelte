<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TaskDoc } from '../types';
  import { projects, spaces, showError } from '../store';
  import { updateTask } from '../db';
  import { duePill } from './format';
  import { I } from './icons';

  export let task: TaskDoc & { project_name?: string };

  const dispatch = createEventDispatcher<{ open: TaskDoc; changed: void }>();

  $: project = $projects.find(p => p._id === task.project_id);
  $: space = $spaces.find(s => s._id === task.space_id);
  $: lastCol = project?.columns.at(-1)?.id;
  $: done = !!lastCol && task.column_id === lastCol;
  $: pill = duePill(task.due_date, done);
  $: steps = task.checklist ?? [];
  let busy = false;

  // Finishing moves the task to its project's last status; un-finishing
  // sends it back to the first. There is no done flag.
  async function toggleDone() {
    if (!project || busy) return;
    const target = done ? project.columns[0]?.id : lastCol;
    if (!target) return;
    busy = true;
    try {
      await updateTask(task._id, { column_id: target });
      dispatch('changed');
    } catch {
      showError('Could not update this task. Please try again.');
    } finally {
      busy = false;
    }
  }
</script>

<div class="card" class:done class:hi={task.priority === 3}>
  <button class="chk" class:on={done} on:click={toggleDone} aria-label="{done ? 'Mark not done' : 'Finish'}: {task.title}" disabled={busy}></button>
  <button class="g" on:click={() => dispatch('open', task)}>
    <span class="t">{task.title}</span>
    <span class="s">
      {#if space}<span class="dot" style="background:{space.color}"></span>{/if}
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
    box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08);
  }
  .card.hi::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--danger); }
  .card:active { transform: scale(.99); }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
  .g { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-size: 15.5px; font-weight: 600; line-height: 1.3; }
  .s { font-size: 12.5px; color: var(--faint); margin-top: 3px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ic :global(svg) { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.8; vertical-align: -2px; }
  .done .t { color: var(--faint); text-decoration: line-through; }
  .done { opacity: .75; }
  .chk {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; position: relative;
    border: 2px solid color-mix(in srgb, var(--faint) 60%, transparent);
  }
  .chk::before { content: ''; position: absolute; inset: -11px; }
  .chk.on { background: var(--accent); border-color: var(--accent); }
  .chk.on::after {
    content: ''; position: absolute; left: 6px; top: 2.5px; width: 5px; height: 10px;
    border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg);
  }
  .pill { font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--col-bg); color: var(--muted); white-space: nowrap; }
  .pill.today { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .pill.late { background: var(--overdue-bg); color: var(--overdue-ink); }
</style>
