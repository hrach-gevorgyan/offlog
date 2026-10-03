<script lang="ts">
  // Picks a reminder moment: shortcut chips, a day on the month, a time on
  // the wheels, then one button to confirm. Nothing is saved until then.
  import { createEventDispatcher } from 'svelte';
  import { getDefaultReminderTime } from '../../../config';
  import { fmtTime, localDateStr } from '../../utils';
  import { isoToLocalInput, dateFromToday } from '../../carddetail/helpers';
  import { reminderPresets } from '../presets';
  import { shortDate } from '../format';
  import Month from '../Month.svelte';
  import TimeWheels from '../TimeWheels.svelte';
  import { I } from '../icons';

  // An ISO instant, or null for none.
  export let value: string | null;

  // `set`: an ISO instant, or '' to remove the reminder.
  const dispatch = createEventDispatcher<{ set: string }>();

  const defTime = getDefaultReminderTime();
  const nowLocal = isoToLocalInput(new Date().toISOString());
  const todayStr = localDateStr(new Date());
  const tomorrowStr = dateFromToday(1);
  // Presets in the past are left out; "now" is read once per open.
  const PRESETS = reminderPresets();

  // A new reminder starts at the default time, today if that is still ahead.
  const start = value ? isoToLocalInput(value) : `${`${todayStr}T${defTime}` > nowLocal ? todayStr : tomorrowStr}T${defTime}`;
  let date = start.slice(0, 10);
  let time = start.slice(11, 16);
  let wheels = false, wheelsKey = 0;
  $: at = `${date}T${time}`;
  $: past = at <= nowLocal;

  const timeLabel = (hhmm: string) => fmtTime(new Date(`1970-01-01T${hhmm}`));
  $: dayWord = date === todayStr ? 'today' : date === tomorrowStr ? 'tomorrow' : shortDate(date);

  function preset(p: string) { date = p.slice(0, 10); time = p.slice(11, 16); wheelsKey++; }
</script>

{#if PRESETS.length}
  <div class="p-chips sc" role="group" aria-label="Shortcuts">
    {#each PRESETS as p (p.at)}
      <button class="p-chip" class:on={at === p.at} aria-pressed={at === p.at} on:click={() => preset(p.at)}>{p.label.replace(' at ', ' ')}</button>
    {/each}
  </div>
{/if}
<Month value={date} on:pick={(e) => (date = e.detail)} />
<div class="p-group tm">
  <button class="p-row" aria-expanded={wheels} on:click={() => (wheels = !wheels)}>
    <span class="p-ico">{@html I.clock}</span><span class="p-k"><span>Time</span></span>
    <span class="p-v set">{timeLabel(time)}</span>
  </button>
</div>
{#if wheels}
  {#key wheelsKey}
    <div class="wh"><TimeWheels value={time} on:change={(e) => (time = e.detail)} /></div>
  {/key}
{/if}
<button class="p-go" disabled={past} on:click={() => dispatch('set', new Date(at).toISOString())}>
  {past ? 'That time has passed' : `Remind me ${dayWord}, ${timeLabel(time)}`}
</button>
{#if value}
  <button class="clear" on:click={() => dispatch('set', '')}>No reminder</button>
{/if}

<style>
  .sc { margin: -7px 0 6px; }
  .tm { margin: 10px 0 12px; }
  .wh { margin: -4px 0 12px; }
  .clear { display: block; width: 100%; height: 46px; margin-top: 4px; border: 0; background: none; cursor: pointer; font: inherit; font-size: var(--p-fs-m); font-weight: 600; color: var(--danger); }
</style>
