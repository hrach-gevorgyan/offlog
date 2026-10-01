<script lang="ts">
  // A task row in a cross-project list. Tap opens the task; hold (or
  // right-click) asks the parent for the card menu when `menu` is set.
  import { soften } from '../tagColors';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { TaskDoc } from '../types';
  import { projects, spaces } from '../store';
  import { hapticDragStart } from '../haptics';
  import { duePill } from './format';
  import { I } from './icons';
  import { toggleDone, canFinish } from './project/actions';

  export let task: TaskDoc & { project_name?: string };
  // The date the surrounding section stands for; a pill repeating it is hidden.
  export let sectionDate: string | null = null;
  export let menu = false;
  // Search text to mark in the title.
  export let highlight = '';

  const dispatch = createEventDispatcher<{ open: TaskDoc; changed: void; menu: TaskDoc }>();

  $: project = $projects.find(p => p._id === task.project_id);
  $: space = $spaces.find(s => s._id === task.space_id);
  $: done = !!project && task.column_id === project.columns.at(-1)?.id;
  $: pill = task.due_date === sectionDate ? null : duePill(task.due_date, done);
  $: steps = task.checklist ?? [];
  $: hit = split(task.title, highlight.trim());
  function split(t: string, q: string): [string, string, string] | null {
    const i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
    return i < 0 ? null : [t.slice(0, i), t.slice(i, i + q.length), t.slice(i + q.length)];
  }
  let busy = false;
  // The check fills on the tap, before the write lands; a fresh task from
  // the list (or a failed write) puts it back to the real state.
  let pending: boolean | null = null;
  $: shown = pending ?? done;
  $: settle(task);
  function settle(_t: TaskDoc) { pending = null; }

  // The project list's path, so haptic, toast, Undo and errors match it.
  async function finish() {
    if (!project || busy) return;
    busy = true;
    pending = !done;
    try {
      if (await toggleDone(task, project)) dispatch('changed');
      else pending = null;
    } finally {
      busy = false;
    }
  }

  // Long press: a held pointer that hasn't moved opens the menu, and the
  // click that follows the release is swallowed so it doesn't also open the task.
  const HOLD_MS = 480;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held = false, sx = 0, sy = 0;
  function down(e: PointerEvent) {
    if (!menu) return;
    held = false; sx = e.clientX; sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { held = true; hapticDragStart(); dispatch('menu', task); }, HOLD_MS);
  }
  function move(e: PointerEvent) { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) clearTimeout(timer); }
  function cancel() { clearTimeout(timer); }
  function click() { if (held) { held = false; return; } dispatch('open', task); }
  function context(e: MouseEvent) {
    if (!menu) return;
    e.preventDefault();
    if (held) return; // the hold already opened it
    clearTimeout(timer);
    dispatch('menu', task);
  }
  onDestroy(() => clearTimeout(timer));
</script>

<div class="card" class:done class:hi={task.priority === 3}>
  {#if project && canFinish(project)}<button class="chk" class:on={shown} on:click={finish} aria-label="{done ? 'Mark not done' : 'Finish'}: {task.title}" disabled={busy}></button>{/if}
  <button class="g" on:click={click} on:pointerdown={down} on:pointermove={move} on:pointerup={cancel} on:pointercancel={cancel} on:pointerleave={cancel} on:contextmenu={context}>
    <span class="t">{#if hit}{hit[0]}<mark>{hit[1]}</mark>{hit[2]}{:else}{task.title}{/if}{#if task.priority === 3}<span class="p-sr">, high priority</span>{/if}</span>
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
    -webkit-touch-callout: none; user-select: none; -webkit-user-select: none;
  }
  .card.hi::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: color-mix(in srgb, var(--danger) 60%, transparent); }
  .card:active { transform: scale(.98); }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
  .g { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-size: var(--p-fs-l); font-weight: 600; line-height: 1.3; }
  .s { font-size: var(--p-fs-s); color: var(--faint); margin-top: 3px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ic :global(svg) { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.8; vertical-align: -2px; }
  mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 3px; }
  .done .t { color: var(--faint); text-decoration: line-through; }
  .done { opacity: .75; }
  .chk {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; position: relative;
    border: 2px solid var(--check-ring);
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
  .pill.today { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-ink); }
  .pill.late { background: var(--overdue-bg); color: var(--overdue-ink); }
</style>
