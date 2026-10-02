<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CalendarPicker from '../../CalendarPicker.svelte';
  import { isoToLocalInput } from '../../carddetail/helpers';
  import { I } from '../icons';
  import { reminderPresets } from '../presets';

  // An ISO instant, or null for none.
  export let value: string | null;

  // `pick`: a preset or "No reminder" (the panel can close); `set`: the
  // date & time picker (it stays open while the time is adjusted).
  // '' means no reminder.
  const dispatch = createEventDispatcher<{ pick: string; set: string }>();

  const toIso = (local: string) => (local ? new Date(local).toISOString() : '');

  // Presets in the past are left out; "now" is read once per open.
  const PRESETS = reminderPresets();

  $: local = value ? isoToLocalInput(value) : '';
</script>

{#if PRESETS.length}
  <div class="p-group">
    {#each PRESETS as p (p.at)}
      <button class="p-row" aria-pressed={local === p.at} on:click={() => dispatch('pick', toIso(p.at))}>
        <span class="p-k"><span>{p.label}</span></span>
        {#if local === p.at}<span class="p-tick">{@html I.check}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<div class="p-group cal">
  <div class="p-row" role="group" aria-label="Date & time">
    <span class="p-k"><span>Date &amp; time</span></span>
    <span class="pick"><CalendarPicker value={local} withTime on:change={e => dispatch('set', toIso(e.detail))} /></span>
  </div>
  <button class="p-row" aria-pressed={!value} on:click={() => dispatch('pick', '')}>
    <span class="p-k"><span>No reminder</span></span>
    {#if !value}<span class="p-tick">{@html I.check}</span>{/if}
  </button>
</div>

<style>
  .cal { overflow: visible; }
  .cal div.p-row { cursor: default; }
  .pick { margin-left: auto; width: 190px; flex-shrink: 0; }
</style>
