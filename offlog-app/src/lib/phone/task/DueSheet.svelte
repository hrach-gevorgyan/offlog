<script lang="ts">
  import { dueShortcuts } from '../presets';
  import { createEventDispatcher } from 'svelte';
  import CalendarPicker from '../../CalendarPicker.svelte';
  import { shortDate } from '../format';
  import { dateLabel } from './when';
  import Pick from './Pick.svelte';

  export let value: string | null;

  // '' means "no date".
  const dispatch = createEventDispatcher<{ pick: string }>();

  const SHORTCUTS = dueShortcuts();
  // A date none of the shortcuts covers still opens on a ticked row.
  $: options = [
    ...(value && !SHORTCUTS.some(s => s.date === value) ? [{ value, label: dateLabel(value) }] : []),
    ...SHORTCUTS.map(s => ({ value: s.date, label: s.label, hint: shortDate(s.date) })),
    ...(value ? [{ value: '', label: 'No date' }] : []),
  ];
</script>

<Pick {options} current={value ?? ''} on:pick />
<div class="p-group cal">
  <div class="p-row" role="group" aria-label="Pick a date">
    <span class="p-k"><span>Pick a date</span></span>
    <span class="pick"><CalendarPicker value={value ?? ''} bare placeholder="—" formatDate={dateLabel} on:change={e => dispatch('pick', e.detail)} /></span>
  </div>
</div>

<style>
  .cal { overflow: visible; }
  .cal .p-row { cursor: default; padding-top: 4px; padding-bottom: 4px; }
  .pick { margin-left: auto; flex: 1; min-width: 0; font-size: var(--p-fs-m); font-weight: 500; }
</style>
