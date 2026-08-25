<script lang="ts">
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import type { TaskDoc } from '../types';
  import { requestPermission, permissionState } from '../notifications';
  import CalendarPicker from '../CalendarPicker.svelte';
  import CustomSelect from '../CustomSelect.svelte';
  import { getDefaultReminderTime } from '../../config';
  import { fmtTime } from '../utils';

  export let task: TaskDoc;
  export let showRepeatReminder: boolean;
  export let recurrenceOptions: { value: string; label: string }[];
  export let recurrenceStr: string;
  export let recurrenceIntervalStr: string;
  export let recurrenceWeekdaysOnly: boolean;
  export let due_date: string;
  export let reminder_at: string;
  export let remindOnDue: boolean;
  export let skipToNext: () => void;
</script>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showRepeatReminder = !showRepeatReminder} aria-expanded={showRepeatReminder}>
              <span class="field-label">Repeat &amp; reminder</span>
              <svg class="section-chevron" class:open={showRepeatReminder} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showRepeatReminder}
              <div class="extra-block-body" in:slide={revealIn} out:slide={revealOut}>
                <div class="repeat-block">
                  <div class="repeat-row">
                    <div class="repeat-select-wrap" class:compact={!!recurrenceStr}>
                      <CustomSelect options={recurrenceOptions} bind:value={recurrenceStr} disabled={!due_date} />
                    </div>
                    {#if recurrenceStr}
                      <span class="repeat-every-text" aria-hidden="true">×</span>
                      <input type="number" min="1" max="365" class="repeat-interval-input" bind:value={recurrenceIntervalStr} aria-label="Repeat every N {recurrenceStr === 'daily' ? 'days' : recurrenceStr === 'weekly' ? 'weeks' : 'months'}" />
                      {#if recurrenceStr === 'daily'}
                        <button type="button" class="repeat-pill" class:active={recurrenceWeekdaysOnly} on:click={() => recurrenceWeekdaysOnly = !recurrenceWeekdaysOnly}>
                          Weekdays
                        </button>
                      {/if}
                      {#if task.recurrence}
                        <button type="button" class="repeat-pill repeat-pill-accent" on:click={skipToNext}>
                          Skip
                        </button>
                      {/if}
                    {/if}
                  </div>
                  {#if !due_date}<span class="repeat-hint">Set a due date to enable repeat</span>{/if}
                </div>

                <div class="reminder-field">
                  <label>
                    Reminder
                    <div class="reminder-row">
                      <CalendarPicker value={reminder_at} withTime on:change={(e) => reminder_at = e.detail} disabled={remindOnDue} />
                      <label class="remind-on-due-row">
                        <input type="checkbox" bind:checked={remindOnDue} disabled={!due_date} />
                        Remind me on the due date{#if due_date}&nbsp;at {fmtTime(new Date(`1970-01-01T${getDefaultReminderTime()}`))}{/if}
                      </label>
                    </div>
                  </label>
                  {#if reminder_at && $permissionState !== 'granted'}
                    <div class="reminder-hint">
                      {#if $permissionState === 'unsupported'}
                        Notifications aren't supported in this browser.
                      {:else}
                        Notifications aren't enabled yet —
                        <button type="button" class="reminder-enable-btn" on:click={() => requestPermission()}>enable them</button>
                        so this reminder can actually notify you.
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

<style>
  /* Base element styles live here, not in CardDetail's :global block:
     a :global() element selector also matches nested components'
     internals (CustomSelect, CalendarPicker), which the scoped
     original never did. */
  button {
    padding: .38rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .82rem; font-weight: 500;
  }
  label {
    display: flex; flex-direction: column; gap: .22rem;
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
</style>
