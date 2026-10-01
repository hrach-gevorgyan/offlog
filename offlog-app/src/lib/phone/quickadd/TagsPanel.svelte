<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getAllTags, getTagColorOverrides } from '../../db';
  import { resolveTagColor, soften } from '../../tagColors';
  import { I } from '../icons';

  export let selected: string[];

  const dispatch = createEventDispatcher<{ toggle: string; add: string }>();

  let known: string[] = [];
  let colors: Record<string, string> = {};
  let input = '';
  onMount(async () => {
    try { [known, colors] = await Promise.all([getAllTags(), getTagColorOverrides()]); }
    catch { /* suggestions are optional; typing a tag still works */ }
  });

  // Tags picked or typed in this sheet stay listed even once deselected.
  let seen: string[] = [...selected];
  $: seen = [...seen, ...selected.filter(t => !seen.includes(t))];
  $: all = [...seen, ...known.filter(t => !seen.includes(t))];
  const color = (t: string) => soften(resolveTagColor(t, colors));

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const t = input.trim().toLowerCase().replace(/\s+/g, '-');
    input = '';
    if (t && !selected.includes(t)) dispatch('add', t);
  }
</script>

{#if all.length}
  <div class="p-cpick">
    {#each all as t (t)}
      {@const on = selected.includes(t)}
      <button class="tg" class:on aria-pressed={on} on:click={() => dispatch('toggle', t)}>
        <span class="p-tag" style="--tag:{color(t)}">#{t}{#if on}<span class="ck">{@html I.check}</span>{/if}</span>
      </button>
    {/each}
  </div>
{/if}
<input class="p-fld" bind:value={input} on:keydown={onKey} placeholder="New tag" autocomplete="off" enterkeyhint="done" aria-label="New tag" />

<style>
  .tg { min-height: 44px; display: inline-flex; align-items: center; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
  .tg .p-tag { font-size: var(--p-fs-s); padding: 4px 10px; color: var(--muted); background: transparent; box-shadow: inset 0 0 0 1px var(--border); }
  .tg.on .p-tag { color: var(--text); background: color-mix(in srgb, var(--tag) 26%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tag) 60%, transparent); }
  .tg:active .p-tag { background: var(--col-bg); }
  .ck { display: flex; }
  .ck :global(svg.i) { width: 14px; height: 14px; }
  .p-cpick { margin-bottom: 6px; }
  .p-fld { margin-bottom: 4px; }
</style>
