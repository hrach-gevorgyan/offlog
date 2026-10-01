<script lang="ts">
  // One status at a time: pills on top, that status's cards below. A
  // sideways drag over the cards pulls the pane along and, let go far or
  // fast enough, pages to the next or previous status.
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { paneIn, paneOut, collapseIn, collapseOut } from '../../motion';
  import { prefersReducedMotion } from '../../theme';
  import { leaves, returns } from '../rowMotion';
  import { actions } from '../nav';
  import { columnTasks } from './filter';
  import { I } from '../icons';
  import BoardCard from './BoardCard.svelte';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];
  export let ci = 0;
  export let blockedIds = new Set<string>();
  export let relatedIds = new Set<string>();
  export let tagColors: Record<string, string> = {};

  const dispatch = createEventDispatcher<{ open: TaskDoc; menu: TaskDoc }>();

  $: cols = project.columns;
  $: if (ci > cols.length - 1) ci = Math.max(0, cols.length - 1);
  $: col = cols[ci];
  $: shown = col ? columnTasks(tasks, col.id) : [];
  $: counts = Object.fromEntries(cols.map(c => [c.id, tasks.filter(t => t.column_id === c.id).length]));
  // Adding to the last status would create a task that is already finished.
  $: lastPane = cols.length > 1 && ci === cols.length - 1;

  // The screen's side padding: a leaving pane travels this much further to
  // clear the screen edge.
  const GAP = 16;
  // dir and from are read by both panes' transitions when the key changes:
  // the side of travel, and where the drag left the panes.
  let dir = 0, from = 0;
  let pills: HTMLDivElement;
  const showPill = (smooth: boolean) =>
    pills?.querySelector('.on')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
  onMount(() => showPill(false));
  async function go(i: number, at = 0) {
    if (i < 0 || i >= cols.length || i === ci) return;
    dir = i > ci ? 1 : -1;
    from = at;
    dx = 0;
    ci = i;
    await tick();
    showPill(true);
  }

  // The axis is decided once the finger has moved 10px; a vertical one is
  // left to the page scroll. Touches starting in the system back-gesture
  // zone at either screen edge are ignored.
  const EDGE = 24, SLOP = 10;
  let body: HTMLDivElement;
  let sx = 0, sy = 0, st = 0, dx = 0;
  let axis: 'x' | 'y' | null = null, tracking = false;
  $: dragging = axis === 'x';
  function touchStart(e: TouchEvent) {
    const t = e.touches[0];
    tracking = e.touches.length === 1 && t.clientX >= EDGE && t.clientX <= window.innerWidth - EDGE;
    sx = t.clientX; sy = t.clientY; st = Date.now(); axis = null; dx = 0;
  }
  // Past either end the pane gives a third of the finger's travel.
  const resist = (d: number) => ((d > 0 && ci === 0) || (d < 0 && ci === cols.length - 1) ? d / 3 : d);
  function touchMove(e: TouchEvent) {
    if (!tracking) return;
    const t = e.touches[0];
    const mx = t.clientX - sx, my = t.clientY - sy;
    if (!axis) {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    }
    if (axis === 'x') dx = resist(mx);
  }
  function touchEnd(e: TouchEvent) {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const mx = t.clientX - sx, my = t.clientY - sy;
    if (!axis && Math.abs(mx) > Math.abs(my)) axis = 'x';
    const was = axis;
    axis = null;
    if (was !== 'x') { dx = 0; return; }
    // Far enough on its own, or a quick flick.
    const w = body?.clientWidth ?? 0;
    const far = w > 0 && Math.abs(mx) >= w * 0.35;
    const flick = Math.abs(mx) >= 60 && Date.now() - st < 600;
    const next = ci + (mx < 0 ? 1 : -1);
    if ((far || flick) && next >= 0 && next < cols.length) go(next, dx);
    else dx = 0;
  }
  function touchCancel() { tracking = false; axis = null; dx = 0; }
</script>

<div class="pills" bind:this={pills} role="tablist" aria-label="Statuses">
  {#each cols as c, i (c.id)}
    <button role="tab" aria-selected={i === ci} class:on={i === ci} class:last={cols.length > 1 && i === cols.length - 1} on:click={() => go(i)}>{c.name} <i>{counts[c.id]}</i></button>
  {/each}
</div>

<div class="body" bind:this={body} on:touchstart|passive={touchStart} on:touchmove|passive={touchMove} on:touchend={touchEnd} on:touchcancel={touchCancel}
  role="tabpanel" tabindex="-1" aria-label={col?.name}>
  {#if col}
    <div class="track">
      {#key col.id}
        <div class="pane" class:dragging style:transform={dx ? `translateX(${dx}px)` : null}
          in:paneIn={{ dir, from, gap: GAP }} out:paneOut={{ dir, from, gap: GAP }}>
          {#each shown as t (t._id)}
            <div in:collapseIn={{ on: returns(t._id) }} out:collapseOut={{ on: leaves(t._id) }}>
              <BoardCard task={t} {project} {tagColors} blocked={blockedIds.has(t._id)} related={relatedIds.has(t._id)}
                on:open={() => dispatch('open', t)} on:menu={() => dispatch('menu', t)} />
            </div>
          {:else}
            <div class="empty">
              {#if lastPane}
                <p class="hint"><span class="tick">{@html I.check}</span>Tick a task to finish it.</p>
              {:else}
                <p>Nothing in {col.name}.</p>
                <button class="p-tbtn" on:click={() => actions.quickAdd()}>Add a task</button>
              {/if}
            </div>
          {/each}
        </div>
      {/key}
    </div>
  {/if}
</div>

<style>
  .pills { display: flex; gap: 6px; margin: 0 -16px 8px; padding: 4px 16px; overflow-x: auto; scrollbar-width: none; }
  .pills::-webkit-scrollbar { display: none; }
  .pills button {
    position: relative; flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 8px 13px; min-height: 36px; border-radius: 999px; border: 0; cursor: pointer;
    font: inherit; font-size: var(--p-fs-s); font-weight: 600; background: var(--surface); color: var(--muted);
    box-shadow: var(--p-shadow);
    transition: background var(--dur-small) var(--ease-standard), color var(--dur-small) var(--ease-standard), box-shadow var(--dur-small) var(--ease-standard);
  }
  .pills button::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; bottom: -4px; }
  .pills button.on { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); box-shadow: none; }
  .pills button:not(.on):active { background: var(--col-bg); }
  /* The last status is the one that means done. */
  .pills button.last { background: color-mix(in srgb, var(--success) 14%, var(--surface)); }
  .pills button.last.on { background: color-mix(in srgb, var(--success) 30%, var(--surface)); color: var(--text); }
  .pills i { font-style: normal; font-size: var(--p-fs-xs); opacity: .75; }
  /* pan-y: the browser keeps vertical scrolling, horizontal moves come here. */
  .body { min-height: 45vh; touch-action: pan-y; }
  /* Both panes share one cell while one leaves and the next arrives. */
  .track { display: grid; }
  .pane { grid-area: 1 / 1; min-width: 0; transition: transform var(--dur-medium) var(--ease-standard); }
  .pane.dragging { transition: none; }
  .empty { text-align: center; color: var(--faint); padding: 28px 0 8px; font-size: var(--p-fs-m); }
  .empty p { margin: 0 0 6px; }
  .hint { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .tick { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--success) 22%, transparent); color: var(--text); }
  .tick :global(svg.i) { width: 14px; height: 14px; }
</style>
