<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';

  // B50 — replaces native <input type="time"> (which renders as the bare
  // OS picker on Android, same reason CustomSelect replaced native
  // <select>) with two themed CustomSelect dropdowns sharing this app's
  // existing picker look. Value/emit format is 'HH:MM' (24h, zero-padded),
  // matching what <input type="time"> already produced — every call site
  // swaps in this component with no format change needed.
  export let value = '09:00';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  const pad = (n: number) => String(n).padStart(2, '0');
  const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: pad(h), label: pad(h) }));
  // Every minute, not 5-minute steps — matches what the native <input
  // type="time"> this replaced actually allowed (owner-reported,
  // 2026-07-16: 5-minute steps couldn't express an exact minute).
  const MINUTES = Array.from({ length: 60 }, (_, m) => ({ value: pad(m), label: pad(m) }));

  $: [h, m] = value.split(':');

  function onHour(e: CustomEvent<string>) { dispatch('change', `${e.detail}:${m ?? '00'}`); }
  function onMinute(e: CustomEvent<string>) { dispatch('change', `${h ?? '09'}:${e.detail}`); }
</script>

<div class="time-picker">
  <CustomSelect options={HOURS} value={h ?? '09'} {disabled} on:change={onHour} />
  <span class="time-sep">:</span>
  <CustomSelect options={MINUTES} value={m ?? '00'} {disabled} on:change={onMinute} />
</div>

<style>
  .time-picker { display: flex; align-items: center; gap: 4px; }
  .time-picker :global(.custom-select) { width: 66px; }
  .time-sep { color: var(--faint); font-weight: 600; }
</style>
