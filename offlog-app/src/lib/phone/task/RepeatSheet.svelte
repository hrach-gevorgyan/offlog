<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TaskDoc } from '../../types';
  import { advanceDate } from '../../utils';
  import { shortDate } from '../format';
  import Pick from './Pick.svelte';

  export let task: TaskDoc;
  export let save: (changes: Partial<TaskDoc>, err: string) => Promise<boolean>;

  const dispatch = createEventDispatcher<{ skip: void }>();
  type Rec = 'daily' | 'weekly' | 'monthly';
  const ERR = 'Could not save the repeat. Please try again.';
  const UNIT: Record<Rec, string> = { daily: 'days', weekly: 'weeks', monthly: 'months' };
  const OPTIONS = [
    { value: '', label: 'Never' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ];

  $: rec = (task.recurrence ?? null) as Rec | null;
  $: every = task.recurrenceInterval ?? 1;
  $: weekdays = !!task.recurrenceWeekdaysOnly;
  // The same recurrence maths a real completion uses.
  $: next = task.due_date && rec ? advanceDate(task.due_date, rec, every, rec === 'daily' && weekdays) : null;

  // Interval and weekdays-only only mean something alongside a rule; without
  // one they are cleared, never left behind.
  function rule(r: Rec | null, n: number, wd: boolean): Partial<TaskDoc> {
    return { recurrence: r, recurrenceInterval: r ? n : undefined, recurrenceWeekdaysOnly: r === 'daily' ? wd : undefined };
  }

  function onEvery(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const n = Math.max(1, Math.min(365, parseInt(input.value, 10) || 1));
    input.value = String(n);
    if (rec && n !== every) save(rule(rec, n, weekdays), ERR);
  }
</script>

{#if !task.due_date}<p class="p-say">Set a due date to make this repeat.</p>{/if}
<Pick options={OPTIONS} current={rec ?? ''} disabled={!task.due_date} on:pick={e => save(rule((e.detail || null) as Rec | null, every, weekdays), ERR)} />

{#if rec}
  <div class="p-group">
    <label class="p-row every">
      <span class="p-k"><span>Every</span></span>
      <input type="number" min="1" max="365" inputmode="numeric" value={every} on:change={onEvery} aria-label="Repeat every N {UNIT[rec]}" />
      <span class="unit">{UNIT[rec]}</span>
    </label>
    {#if rec === 'daily'}
      <button class="p-row" role="switch" aria-checked={weekdays} on:click={() => save(rule(rec, every, !weekdays), ERR)}>
        <span class="p-k"><span>Weekdays only</span><span class="p-sub">Skips Saturday and Sunday</span></span>
        <span class="p-sw" class:on={weekdays}></span>
      </button>
    {/if}
    <button class="p-row acc" on:click={() => dispatch('skip')}>
      <span class="p-k"><span>Skip to the next one</span></span>
    </button>
  </div>
  {#if next}<p class="p-say">Next: {shortDate(next)}</p>{/if}
{/if}

<style>
  .every { cursor: default; }
  .every input {
    margin-left: auto; width: 64px; box-sizing: border-box; text-align: center; font: inherit; font-size: 16px;
    border: 0; border-radius: 8px; padding: 6px 8px; background: var(--col-bg); color: var(--text);
  }
  .every input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .unit { color: var(--muted); min-width: 56px; }
</style>
