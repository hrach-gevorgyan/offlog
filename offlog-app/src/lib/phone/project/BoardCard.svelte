<script lang="ts">
  // A card inside a project: date, steps, tags and markers under the title.
  // Tap opens the task; hold (or right-click) asks the parent for the card menu.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { resolveTagColor, soften } from '../../tagColors';
  import { hapticDragStart } from '../../haptics';
  import { toggleDone, canFinish } from './actions';
  import { duePill } from '../format';
  import { I } from '../icons';

  export let task: TaskDoc;
  export let project: ProjectDoc;
  export let blocked = false;
  export let related = false;
  export let tagColors: Record<string, string> = {};

  const dispatch = createEventDispatcher<{ open: TaskDoc; menu: TaskDoc }>();

  $: done = task.column_id === project.columns.at(-1)?.id;
  $: pill = duePill(task.due_date, done);
  $: steps = task.checklist ?? [];
  $: stepsDone = steps.filter(s => s.done).length;
  $: files = task.attachments?.length ?? 0;
  let busy = false;
  // The check fills on the tap, before the write lands; the task coming
  // back from the store puts it to the real state.
  let pending: boolean | null = null;
  $: shown = pending ?? done;
  $: settle(task);
  function settle(_t: TaskDoc) { pending = null; }

  async function finish() {
    if (busy) return;
    busy = true;
    pending = !done;
    try { if (!(await toggleDone(task, project))) pending = null; } finally { busy = false; }
  }

  // Long press: a held pointer that hasn't moved opens the menu, and the
  // click that follows the release is swallowed so it doesn't also open the task.
  const HOLD_MS = 480;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held = false, sx = 0, sy = 0;
  function down(e: PointerEvent) {
    held = false; sx = e.clientX; sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { held = true; hapticDragStart(); dispatch('menu', task); }, HOLD_MS);
  }
  function move(e: PointerEvent) { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) clearTimeout(timer); }
  function cancel() { clearTimeout(timer); }
  function click() { if (held) { held = false; return; } dispatch('open', task); }
  function context(e: MouseEvent) {
    e.preventDefault();
    if (held) return; // the hold already opened it
    clearTimeout(timer);
    dispatch('menu', task);
  }
  onDestroy(() => clearTimeout(timer));
</script>

<div class="card" class:done class:hi={task.priority === 3}>
  {#if canFinish(project)}<button class="chk" class:on={shown} on:click={finish} aria-label="{done ? 'Mark not done' : 'Finish'}: {task.title}" disabled={busy}></button>{/if}
  <button class="g" on:click={click} on:pointerdown={down} on:pointermove={move} on:pointerup={cancel} on:pointercancel={cancel} on:pointerleave={cancel} on:contextmenu={context}>
    <span class="t">{#if task.pinned}<span class="pin" aria-hidden="true">{@html I.pin}</span>{/if}{task.title}{#if task.priority === 3}<span class="p-sr">, high priority</span>{/if}</span>
    {#if pill || steps.length || task.tags.length || blocked || related || files || task.recurrence}
      <span class="meta">
        {#if pill}<span class="p-pill {pill.tone}">{pill.text}</span>{/if}
        {#if task.recurrence}<span class="mk" title="Repeats {task.recurrence}">{@html I.repeat}</span>{/if}
        {#if steps.length}<span class="prog"><i><b style="width:{stepsDone / steps.length * 100}%"></b></i>{stepsDone}/{steps.length}</span>{/if}
        {#each task.tags as tag}
          {@const c = soften(resolveTagColor(tag, tagColors))}
          <span class="p-tag" style="--tag:{c}">#{tag}</span>
        {/each}
        {#if blocked}<span class="mk blk">{@html I.block}Blocked</span>{/if}
        {#if related}<span class="mk" title="Has related tasks">{@html I.link}</span>{/if}
        {#if files}<span class="mk" title="{files} attached">{@html I.clip}{files}</span>{/if}
      </span>
    {/if}
  </button>
</div>

<style>
  .card {
    position: relative; overflow: hidden; display: flex; align-items: flex-start; gap: 12px;
    background: var(--surface); border-radius: 12px; padding: 12px 12px 12px 14px; margin-bottom: 8px;
    box-shadow: var(--p-shadow);
    transition: transform var(--dur-hover) var(--ease-hover);
    -webkit-touch-callout: none; user-select: none; -webkit-user-select: none;
  }
  .card.hi::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: color-mix(in srgb, var(--danger) 60%, transparent); }
  .card:active { transform: scale(.98); }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
  .g { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-size: var(--p-fs-l); font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
  .pin { color: var(--accent); display: inline-flex; vertical-align: -2px; margin-right: 4px; }
  .pin :global(svg.i) { width: 13px; height: 13px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 7px; }
  .prog { display: inline-flex; align-items: center; gap: 6px; font-size: var(--p-fs-xs); color: var(--faint); }
  .prog i { width: 34px; height: 4px; border-radius: 2px; background: var(--col-bg); display: block; overflow: hidden; }
  .prog b { display: block; height: 100%; background: var(--success); }
  .mk { display: inline-flex; align-items: center; gap: 3px; font-size: var(--p-fs-xs); font-weight: 600; color: var(--faint); }
  .mk :global(svg.i) { width: 13px; height: 13px; }
  .mk.blk { color: var(--overdue-ink); }
  .done .t { color: var(--faint); text-decoration: line-through; }
  .done { opacity: .75; }
  .chk {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; position: relative; margin-top: 1px;
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
</style>
