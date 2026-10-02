<script lang="ts">
  // Picks a time of day as "HH:MM" on scroll wheels: hour and minute, plus
  // AM/PM when the 12-hour setting is on.
  import { createEventDispatcher } from 'svelte';
  import { getTimeFormat24h } from '../../../config';
  import Sheet from '../Sheet.svelte';
  import Wheel from '../Wheel.svelte';

  export let title: string;
  export let value: string;

  const dispatch = createEventDispatcher<{ pick: string; close: void }>();
  const h24 = getTimeFormat24h();
  const pad = (n: number) => String(n).padStart(2, '0');

  let hour = Number(value.slice(0, 2)) || 0;
  let minute = Number(value.slice(3, 5)) || 0;

  const HOURS24 = Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad(i) }));
  const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => ({ value: h, label: String(h) }));
  const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: i, label: pad(i) }));
  const HALVES = [{ value: 0, label: 'AM' }, { value: 1, label: 'PM' }];

  // The 12-hour wheels edit the same 0–23 hour.
  $: h12 = hour % 12 || 12;
  $: half = hour >= 12 ? 1 : 0;
  function set12(h: number) { hour = (h % 12) + (half ? 12 : 0); }
  function setHalf(p: number) { hour = (hour % 12) + (p ? 12 : 0); }
</script>

<Sheet {title} on:close={() => dispatch('close')} let:close>
  <div class="ts">
    <div class="wheels">
      <div class="band" aria-hidden="true"></div>
      {#if h24}
        <div class="col"><Wheel items={HOURS24} value={hour} label="Hour" on:change={(e) => (hour = e.detail)} /></div>
      {:else}
        <div class="col"><Wheel items={HOURS12} value={h12} label="Hour" on:change={(e) => set12(e.detail)} /></div>
      {/if}
      <span class="colon" aria-hidden="true">:</span>
      <div class="col"><Wheel items={MINUTES} value={minute} label="Minute" on:change={(e) => (minute = e.detail)} /></div>
      {#if !h24}
        <div class="col ampm"><Wheel items={HALVES} value={half} label="AM or PM" on:change={(e) => setHalf(e.detail)} /></div>
      {/if}
    </div>
    <button class="p-go" on:click={() => { dispatch('pick', `${pad(hour)}:${pad(minute)}`); close(); }}>Done</button>
  </div>
</Sheet>

<style>
  .ts { display: flex; flex-direction: column; }
  .wheels { position: relative; display: flex; justify-content: center; align-items: center; gap: 6px; margin: 4px 0 18px; }
  .band { position: absolute; left: 0; right: 0; top: 50%; height: 46px; transform: translateY(-50%); border-radius: 12px; background: var(--surface); box-shadow: var(--p-shadow); }
  .col { position: relative; width: 88px; }
  .col.ampm { width: 70px; margin-left: 8px; }
  .colon { position: relative; font-size: 28px; font-weight: 600; margin-top: -3px; }
</style>
