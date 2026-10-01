<script lang="ts">
  // A single-choice list for a sheet: one row per option, a tick on the
  // current one.
  import { createEventDispatcher } from 'svelte';
  import { I } from '../icons';

  export let options: { value: string; label: string; dot?: string; hint?: string }[];
  export let current: string | null = null;
  export let disabled = false;

  const dispatch = createEventDispatcher<{ pick: string }>();
</script>

<div class="p-group">
  {#each options as o (o.value)}
    <button class="p-row" {disabled} aria-pressed={o.value === current} on:click={() => dispatch('pick', o.value)}>
      {#if o.dot}<span class="p-dot" style:background={o.dot}></span>{/if}
      <span class="p-k"><span>{o.label}</span></span>
      {#if o.hint}
        <span class="p-v">{o.hint}{#if o.value === current}<span class="tick">{@html I.check}</span>{/if}</span>
      {:else if o.value === current}<span class="p-tick">{@html I.check}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tick { color: var(--accent); display: flex; }
</style>
