<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { getTimeFormat24h } from '../config';

  // Themed replacement for native <input type="time">, which renders as
  // the unstyleable OS picker on Android and ignores the app's own
  // 12h/24h setting. Built from two (three in 12h mode) CustomSelect
  // dropdowns. Value and emitted format are always 'HH:MM' (24h,
  // zero-padded); only the *displayed* hour dropdown and the AM/PM
  // toggle follow getTimeFormat24h(). Keep it that way — a nicer-looking
  // scroll wheel or a picker library costs either fidelity or ~100KB.
  export let value = '09:00';
  export let disabled = false;
  // Forwarded to each CustomSelect: a picker near the bottom of a
  // scrollable panel must open upward or its dropdown renders clipped.
  export let placement: 'up' | 'down' = 'down';

  const dispatch = createEventDispatcher<{ change: string }>();

  const pad = (n: number) => String(n).padStart(2, '0');
  const HOURS_24 = Array.from({ length: 24 }, (_, h) => ({ value: pad(h), label: pad(h) }));
  // Clock order (12, 1, 2, ... 11), not numeric — matches how a 12h
  // dropdown is normally read.
  const HOURS_12 = [12, ...Array.from({ length: 11 }, (_, i) => i + 1)].map(h => ({ value: pad(h), label: String(h) }));
  const PERIODS = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
  // Every minute, not 5-minute steps — coarser steps can't express an
  // exact minute.
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
    <CustomSelect options={HOURS_24} value={pad(hour24)} {disabled} {placement} on:change={onHour24} />
    <span class="time-sep">:</span>
    <CustomSelect options={MINUTES} value={m ?? '00'} {disabled} {placement} on:change={onMinute} />
  {:else}
    <CustomSelect options={HOURS_12} value={hour12} {disabled} {placement} on:change={onHour12} />
    <span class="time-sep">:</span>
    <CustomSelect options={MINUTES} value={m ?? '00'} {disabled} {placement} on:change={onMinute} />
    <CustomSelect options={PERIODS} value={period} {disabled} {placement} on:change={onPeriod} />
  {/if}
</div>

<style>
  .time-picker { display: flex; align-items: center; gap: 4px; }
  .time-picker :global(.custom-select) { width: 66px; }
  .time-sep { color: var(--faint); font-weight: 600; }
</style>
