<script lang="ts">
  // One status at a time: pills on top, that status's cards, page dots.
  // A sideways swipe over the cards steps to the next or previous status.
  import { createEventDispatcher, tick } from 'svelte';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { axisIn, collapseIn, collapseOut } from '../../motion';
  import { prefersReducedMotion } from '../../theme';
  import { leaves, returns } from '../rowMotion';
  import { actions } from '../nav';
  import { columnTasks } from './filter';
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

  let dir = 0;
  let pills: HTMLDivElement;
  async function go(i: number) {
    if (i < 0 || i >= cols.length || i === ci) return;
    dir = i > ci ? 1 : -1;
    ci = i;
    await tick();
    pills?.querySelector('.on')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // Horizontal, quick and long enough to be a swipe rather than a scroll.
  let sx = 0, sy = 0, st = 0;
  function touchStart(e: TouchEvent) { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }
  function touchEnd(e: TouchEvent) {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || Date.now() - st > 600) return;
    go(ci + (dx < 0 ? 1 : -1));
  }
</script>

<div class="pills" bind:this={pills} role="tablist" aria-label="Statuses">
  {#each cols as c, i (c.id)}
    <button role="tab" aria-selected={i === ci} class:on={i === ci} on:click={() => go(i)}>{c.name} <i>{counts[c.id]}</i></button>
  {/each}
</div>

<div class="body" on:touchstart|passive={touchStart} on:touchend={touchEnd} role="tabpanel" tabindex="-1" aria-label={col?.name}>
  {#if col}
    {#key col.id}
      <div in:axisIn={{ dir }}>
        {#each shown as t (t._id)}
          <div in:collapseIn={{ on: returns(t._id) }} out:collapseOut={{ on: leaves(t._id) }}>
            <BoardCard task={t} {project} {tagColors} blocked={blockedIds.has(t._id)} related={relatedIds.has(t._id)}
              on:open={() => dispatch('open', t)} on:menu={() => dispatch('menu', t)} />
          </div>
        {:else}
          <div class="empty">
            <p>Nothing in {col.name}.</p>
            <button class="p-tbtn" on:click={() => actions.quickAdd()}>Add a task</button>
          </div>
        {/each}
      </div>
    {/key}
  {/if}
  {#if cols.length > 1}
    <div class="dots" aria-hidden="true">{#each cols as c, i (c.id)}<i class:on={i === ci}></i>{/each}</div>
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
  .pills button.on { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); box-shadow: none; }
  .pills button:not(.on):active { background: var(--col-bg); }
  .pills i { font-style: normal; font-size: var(--p-fs-xs); opacity: .75; }
  .body { min-height: 45vh; }
  .empty { text-align: center; color: var(--faint); padding: 28px 0 8px; font-size: var(--p-fs-m); }
  .empty p { margin: 0 0 6px; }
  .dots { display: flex; justify-content: center; gap: 6px; margin: 12px 0 0; }
  .dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--border-strong); transition: width var(--dur-medium) var(--ease-standard), background var(--dur-medium) var(--ease-standard); }
  .dots i.on { background: var(--accent); width: 16px; }
</style>
