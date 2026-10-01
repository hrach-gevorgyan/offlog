<script lang="ts">
  // One status at a time: pills on top, that status's cards, page dots.
  // A sideways swipe over the cards steps to the next or previous status.
  import { createEventDispatcher, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { revealIn } from '../../motion';
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
    pills?.querySelector('.on')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
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
      <div in:fly={{ x: dir * 32, duration: revealIn.duration, easing: revealIn.easing }}>
        {#each shown as t (t._id)}
          <BoardCard task={t} {project} {tagColors} blocked={blockedIds.has(t._id)} related={relatedIds.has(t._id)}
            on:open={() => dispatch('open', t)} on:menu={() => dispatch('menu', t)} />
        {:else}
          <div class="empty">
            <p>Nothing in {col.name}.</p>
            <button class="p-tbtn" on:click={() => actions.quickAdd()}>Add a task</button>
          </div>
        {/each}
      </div>
    {/key}
  {/if}
</div>

{#if cols.length > 1}
  <div class="dots" aria-hidden="true">{#each cols as c, i (c.id)}<i class:on={i === ci}></i>{/each}</div>
{/if}

<style>
  .pills { display: flex; gap: 6px; margin: 0 -16px 12px; padding: 2px 16px 4px; overflow-x: auto; scrollbar-width: none; }
  .pills::-webkit-scrollbar { display: none; }
  .pills button {
    flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 8px 13px; min-height: 38px; border-radius: 999px; border: 0; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 600; background: var(--surface); color: var(--muted);
    box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.06);
    transition: background var(--dur-small) var(--ease-standard), color var(--dur-small) var(--ease-standard);
  }
  .pills button.on { background: var(--accent); color: var(--on-accent); box-shadow: none; }
  .pills i { font-style: normal; font-size: 12px; opacity: .75; }
  .body { min-height: 45vh; }
  .empty { text-align: center; color: var(--faint); padding: 28px 0 8px; font-size: 14.5px; }
  .empty p { margin: 0 0 6px; }
  .dots { display: flex; justify-content: center; gap: 6px; margin: 10px 0 0; }
  .dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--border-strong); transition: width var(--dur-small) var(--ease-standard); }
  .dots i.on { background: var(--accent); width: 16px; }
</style>
