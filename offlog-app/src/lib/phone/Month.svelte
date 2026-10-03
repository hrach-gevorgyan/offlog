<script lang="ts">
  // A full-width month to pick a day from: today ringed, the picked day
  // filled. Weeks start on the user's chosen day.
  import { createEventDispatcher } from 'svelte';
  import { getWeekStartsMonday } from '../../config';
  import { localDateStr } from '../utils';
  import { today } from '../today';
  import { shortDate } from './format';
  import { I } from './icons';

  // 'YYYY-MM-DD', or '' for none.
  export let value = '';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ pick: string }>();
  const monday = getWeekStartsMonday();
  const DAYS = monday ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // The month on show; it follows the value when the value moves to another month.
  let shown = (value || $today).slice(0, 7);
  let lastValue = value;
  $: if (value !== lastValue) { lastValue = value; if (value) shown = value.slice(0, 7); }

  $: first = new Date(`${shown}-01T12:00:00`);
  $: title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  $: cells = ((): { ymd: string; out: boolean }[] => {
    const lead = (first.getDay() + 7 - (monday ? 1 : 0)) % 7;
    const start = new Date(first); start.setDate(1 - lead);
    const n = Math.ceil((lead + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      return { ymd: localDateStr(d), out: d.getMonth() !== first.getMonth() };
    });
  })();

  function step(by: number) {
    const d = new Date(first); d.setMonth(d.getMonth() + by);
    shown = localDateStr(d).slice(0, 7);
  }
</script>

<div class="month" class:disabled>
  <div class="mh">
    <button class="nav" aria-label="Previous month" on:click={() => step(-1)} {disabled}>{@html I.back}</button>
    <span aria-live="polite">{title}</span>
    <button class="nav" aria-label="Next month" on:click={() => step(1)} {disabled}>{@html I.chev}</button>
  </div>
  <div class="grid" role="group" aria-label={title}>
    {#each DAYS as d}<span class="wd" aria-hidden="true">{d}</span>{/each}
    {#each cells as c (c.ymd)}
      <button class="day" class:out={c.out} class:today={c.ymd === $today} class:on={c.ymd === value}
        aria-pressed={c.ymd === value} aria-label={shortDate(c.ymd)} {disabled}
        on:click={() => dispatch('pick', c.ymd)}><span>{Number(c.ymd.slice(8))}</span></button>
    {/each}
  </div>
</div>

<style>
  .month { background: var(--surface); border-radius: 16px; box-shadow: var(--p-shadow); padding: 8px 8px 6px; }
  .month.disabled { opacity: .45; }
  .mh { display: flex; align-items: center; justify-content: space-between; padding: 0 2px 4px; font-weight: 700; font-size: var(--p-fs-l); }
  .nav { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
  .nav:active { background: var(--col-bg); }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); }
  .wd { text-align: center; font-size: var(--p-fs-xs); font-weight: 600; color: var(--faint); padding: 4px 0; }
  .day { height: 42px; display: flex; align-items: center; justify-content: center; border: 0; background: none; padding: 0; cursor: pointer; font: inherit; color: var(--text); }
  .day span { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: var(--p-fs-m); font-variant-numeric: tabular-nums;
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover); }
  .day.out { color: var(--faint); }
  .day.today span { box-shadow: inset 0 0 0 1.5px var(--accent); color: var(--accent-ink); }
  .day.on span { background: var(--accent); color: var(--on-accent); font-weight: 700; box-shadow: none; }
  .day:not(.on):active span { background: var(--col-bg); }
  .day:disabled, .nav:disabled { cursor: default; }
  @media (orientation: landscape) and (max-height: 500px) {
    .day { height: 34px; }
    .day span { width: 30px; height: 30px; }
  }
</style>
