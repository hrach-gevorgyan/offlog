<script lang="ts">
  // Picks a time of day as "HH:MM": the hour from a grid, the minute in
  // 5-minute steps, in the app's own look. Follows the 12/24-hour setting.
  import { createEventDispatcher } from 'svelte';
  import { getTimeFormat24h } from '../../../config';
  import Sheet from '../Sheet.svelte';

  export let title: string;
  export let value: string;

  const dispatch = createEventDispatcher<{ pick: string; close: void }>();
  const h24 = getTimeFormat24h();

  let hour = Number(value.slice(0, 2)) || 0;
  // A stored minute off the 5-minute grid stays as it is until another is picked.
  let minute = Number(value.slice(3, 5)) || 0;
  $: pm = hour >= 12;

  const pad = (n: number) => String(n).padStart(2, '0');
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
  const HOURS24 = Array.from({ length: 24 }, (_, i) => i);
  const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  $: label = h24 ? `${pad(hour)}:${pad(minute)}` : `${hour % 12 || 12}:${pad(minute)}`;
  function pick12(h: number) { hour = (h % 12) + (pm ? 12 : 0); }
  function setPm(on: boolean) { if (on !== pm) hour = (hour + 12) % 24; }
</script>

<Sheet {title} on:close={() => dispatch('close')} let:close>
  <div class="ts">
    <div class="big" aria-live="polite">{label}{#if !h24}<small>{pm ? 'PM' : 'AM'}</small>{/if}</div>

    {#if !h24}
      <div class="p-seg ampm" role="group" aria-label="Morning or afternoon" style="--n:2;--i:{pm ? 1 : 0}">
        <button class:on={!pm} aria-pressed={!pm} on:click={() => setPm(false)}>AM</button>
        <button class:on={pm} aria-pressed={pm} on:click={() => setPm(true)}>PM</button>
      </div>
    {/if}

    <div class="lbl">Hour</div>
    <div class="grid" class:g12={!h24} role="group" aria-label="Hour">
      {#if h24}
        {#each HOURS24 as h}<button class:on={h === hour} aria-pressed={h === hour} on:click={() => (hour = h)}>{pad(h)}</button>{/each}
      {:else}
        {#each HOURS12 as h}<button class:on={(hour % 12 || 12) === h} aria-pressed={(hour % 12 || 12) === h} on:click={() => pick12(h)}>{h}</button>{/each}
      {/if}
    </div>

    <div class="lbl">Minute</div>
    <div class="grid m" role="group" aria-label="Minute">
      {#each MINUTES as m}<button class:on={m === minute} aria-pressed={m === minute} on:click={() => (minute = m)}>:{pad(m)}</button>{/each}
    </div>

    <button class="p-go done" on:click={() => { dispatch('pick', `${pad(hour)}:${pad(minute)}`); close(); }}>Done</button>
  </div>
</Sheet>

<style>
  .ts { display: flex; flex-direction: column; }
  .big { text-align: center; font-size: 44px; font-weight: 600; letter-spacing: .02em; margin: 0 0 14px; font-variant-numeric: tabular-nums; }
  .big small { font-size: 18px; font-weight: 600; margin-left: 6px; color: var(--faint); }
  .ampm { margin: 0 auto 14px; width: 180px; }
  .lbl { font-size: var(--p-fs-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); margin: 0 4px 8px; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 16px; }
  .grid.g12, .grid.m { grid-template-columns: repeat(6, 1fr); }
  .grid button {
    min-height: 44px; border: 0; border-radius: 12px; cursor: pointer; font: inherit; font-size: var(--p-fs-m); font-weight: 600;
    font-variant-numeric: tabular-nums; color: var(--text); background: var(--surface); box-shadow: var(--p-shadow);
  }
  .grid button.on { background: var(--accent); color: var(--on-accent); box-shadow: none; }
  .grid button:not(.on):active { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); }
  .done { margin-top: 4px; }
</style>
