<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CalendarPicker from '../../CalendarPicker.svelte';
  import { dateFromToday } from '../../carddetail/helpers';
  import { shortDate } from '../format';
  import Pick from './Pick.svelte';

  export let value: string | null;

  // '' means "no date".
  const dispatch = createEventDispatcher<{ pick: string }>();

  const SHORTCUTS = [
    { label: 'Today', date: dateFromToday(0) },
    { label: 'Tomorrow', date: dateFromToday(1) },
    { label: 'In a week', date: dateFromToday(7) },
    { label: 'In a month', date: dateFromToday(0, 1) },
  ];
  $: options = [
    ...SHORTCUTS.map(s => ({ value: s.date, label: s.label, hint: shortDate(s.date) })),
    ...(value ? [{ value: '', label: 'No date' }] : []),
  ];
</script>

<Pick {options} current={value ?? ''} on:pick />
<div class="p-group cal">
  <div class="p-row" role="group" aria-label="Pick a date">
    <span class="p-k"><span>Pick a date</span></span>
    <span class="pick"><CalendarPicker value={value ?? ''} on:change={e => dispatch('pick', e.detail)} /></span>
  </div>
</div>

<style>
  .cal { overflow: visible; }
  .cal .p-row { cursor: default; }
  .pick { margin-left: auto; width: 168px; flex-shrink: 0; }
</style>
