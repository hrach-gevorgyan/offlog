<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { getTimeFormat24h } from '../config';

  // B50 — replaces native <input type="time"> (which renders as the bare
  // OS picker on Android, same reason CustomSelect replaced native
  // <select>) with two (or three, in 12h mode) themed CustomSelect
  // dropdowns sharing this app's existing picker look. Value/emit format
  // is always 'HH:MM' (24h, zero-padded), matching what <input
  // type="time"> already produced — every call site swaps in this
  // component with no format change needed. Only the *displayed* hour
  // dropdown (and an added AM/PM toggle) switches based on Settings ->
  // Appearance's 24h/12h choice (getTimeFormat24h) — found 2026-07-23:
  // this picker previously always showed a 00-23 dropdown regardless of
  // that setting.
  export let value = '09:00';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  const pad = (n: number) => String(n).padStart(2, '0');
  const HOURS_24 = Array.from({ length: 24 }, (_, h) => ({ value: pad(h), label: pad(h) }));
  // Clock order (12, 1, 2, ... 11), not numeric — matches how a 12h
  // dropdown is normally read.
  const HOURS_12 = [12, ...Array.from({ length: 11 }, (_, i) => i + 1)].map(h => ({ value: pad(h), label: String(h) }));
  const PERIODS = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
  // Every minute, not 5-minute steps — matches what the native <input
  // type="time"> this replaced actually allowed (owner-reported,
  // 2026-07-16: 5-minute steps couldn't express an exact minute).
  const MINUTES = Array.from({ length: 60 }, (_, m) => ({ value: pad(m), label: pad(m) }));

  $: is24h = getTimeFormat24h();
  $: [h, m] = value.split(':');
  $: hour24 = +(h ?? '09');
  $: period = hour24 < 12 ? 'AM' : 'PM';
  $: hour12 = pad(hour24 % 12 === 0 ? 12 : hour24 % 12);

  function onHour24(e: CustomEvent<string>) { dispatch('change', `${e.detail}:${m ?? '00'}`); }
  function onMinute(e: CustomEvent<string>) { dispatch('change', `${pad(hour24)}:${e.detail}`); }

  function to24(hour12Val: number, p: string): number {
    const base = hour12Val % 12; // 12 -> 0
    return p === 'PM' ? base + 12 : base;
  }
  function onHour12(e: CustomEvent<string>) {
    dispatch('change', `${pad(to24(+e.detail, period))}:${m ?? '00'}`);
  }
  function onPeriod(e: CustomEvent<string>) {
    dispatch('change', `${pad(to24(+hour12, e.detail))}:${m ?? '00'}`);
  }
</script>

<div class="time-picker">
  {#if is24h}
    <CustomSelect options={HOURS_24} value={pad(hour24)} {disabled} on:change={onHour24} />
    <span class="time-sep">:</span>
    <CustomSelect options={MINUTES} value={m ?? '00'} {disabled} on:change={onMinute} />
  {:else}
    <CustomSelect options={HOURS_12} value={hour12} {disabled} on:change={onHour12} />
    <span class="time-sep">:</span>
    <CustomSelect options={MINUTES} value={m ?? '00'} {disabled} on:change={onMinute} />
    <CustomSelect options={PERIODS} value={period} {disabled} on:change={onPeriod} />
  {/if}
</div>

<style>
  .time-picker { display: flex; align-items: center; gap: 4px; }
  .time-picker :global(.custom-select) { width: 66px; }
  .time-sep { color: var(--faint); font-weight: 600; }
</style>
