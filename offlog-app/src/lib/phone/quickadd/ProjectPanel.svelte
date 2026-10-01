<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { projects, spaces } from '../../store';
  import { soften } from '../../tagColors';
  import { I } from '../icons';

  export let current: string | null;

  const dispatch = createEventDispatcher<{ pick: string }>();

  $: groups = [
    ...[...$spaces].sort((a, b) => a.position - b.position)
      .map(s => ({ id: s._id, name: s.name, dot: soften(s.color), items: $projects.filter(p => p.space_id === s._id) })),
    { id: '', name: '', dot: '', items: $projects.filter(p => !$spaces.some(s => s._id === p.space_id)) },
  ].filter(g => g.items.length);
</script>

{#each groups as g (g.id)}
  {#if g.name}<div class="p-lab"><span class="p-dot" style:background={g.dot}></span>{g.name}</div>{/if}
  <div class="p-group">
    {#each g.items as p (p._id)}
      <button class="p-row" aria-pressed={p._id === current} on:click={() => dispatch('pick', p._id)}>
        <span class="p-k"><span>{p.name}</span></span>
        {#if p._id === current}<span class="p-tick">{@html I.check}</span>{/if}
      </button>
    {/each}
  </div>
{/each}

<style>
  .p-lab { display: flex; align-items: center; gap: 7px; }
</style>
