<script lang="ts">
  // Picks a due date: one-tap shortcuts, then any day on the month. Used by
  // the task screen's Due sheet and quick add's Date panel.
  import { createEventDispatcher } from 'svelte';
  import { dueShortcuts } from '../presets';
  import Month from '../Month.svelte';

  export let value: string | null;

  // '' means "no date".
  const dispatch = createEventDispatcher<{ pick: string }>();
  const SHORTCUTS = dueShortcuts();
</script>

<div class="p-chips sc" role="group" aria-label="Shortcuts">
  {#each SHORTCUTS as s (s.date)}
    <button class="p-chip" class:on={value === s.date} aria-pressed={value === s.date} on:click={() => dispatch('pick', s.date)}>{s.label}</button>
  {/each}
</div>
<Month value={value ?? ''} on:pick />
{#if value}
  <button class="clear" on:click={() => dispatch('pick', '')}>No date</button>
{/if}

<style>
  .sc { margin: -7px 0 6px; }
  .clear { display: block; width: 100%; height: 46px; margin-top: 6px; border: 0; background: none; cursor: pointer; font: inherit; font-size: var(--p-fs-m); font-weight: 600; color: var(--danger); }
</style>
