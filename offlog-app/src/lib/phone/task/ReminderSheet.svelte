<script lang="ts">
  import type { TaskDoc } from '../../types';
  import CalendarPicker from '../../CalendarPicker.svelte';
  import { requestPermission, permissionState } from '../../notifications';
  import { getDefaultReminderTime, isTauri } from '../../../config';
  import { fmtTime } from '../../utils';
  import { isoToLocalInput, dueDateToReminderInput } from '../../carddetail/helpers';
  import { I } from '../icons';
  import { reminderPresets } from '../presets';
  import { dateLabel } from './when';

  export let task: TaskDoc;
  export let save: (changes: Partial<TaskDoc>, err: string) => Promise<boolean>;

  const ERR = 'Could not save the reminder. Please try again.';
  const defTime = getDefaultReminderTime();
  const timeLabel = (hhmm: string) => fmtTime(new Date(`1970-01-01T${hhmm}`));

  $: onDue = !!task.remindOnDue;
  $: local = task.reminder_at ? isoToLocalInput(task.reminder_at) : '';

  // Presets in the past are left out; "now" is read once per open.
  const PRESETS = reminderPresets();

  function setAt(v: string) {
    save({ reminder_at: v ? new Date(v).toISOString() : null }, ERR);
  }

  // On: the reminder follows the due date at the default reminder time.
  // Off: the last derived time stays as a plain reminder.
  function toggleOnDue() {
    if (!task.due_date) return;
    save(onDue
      ? { remindOnDue: false }
      : { remindOnDue: true, reminder_at: new Date(dueDateToReminderInput(task.due_date)).toISOString() }, ERR);
  }
</script>

<div class="p-group">
  <button class="p-row" role="switch" aria-checked={onDue} disabled={!task.due_date} on:click={toggleOnDue}>
    <span class="p-k">
      <span>On the due date</span>
      <span class="p-sub">{task.due_date ? `At ${timeLabel(defTime)}, and it moves with the date` : 'Set a due date first'}</span>
    </span>
    <span class="p-sw" class:on={onDue}></span>
  </button>
</div>

{#if PRESETS.length}
  <div class="p-group">
    {#each PRESETS as p (p.at)}
      <button class="p-row" disabled={onDue} on:click={() => setAt(p.at)}>
        <span class="p-k"><span>{p.label}</span></span>
        {#if local === p.at}<span class="p-tick">{@html I.check}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<div class="p-group cal">
  <div class="p-row" role="group" aria-label="Date & time">
    <span class="p-k"><span>Date &amp; time</span></span>
    <span class="pick"><CalendarPicker value={local} withTime bare placeholder="—" formatDate={dateLabel} disabled={onDue} on:change={e => setAt(e.detail)} /></span>
  </div>
  {#if task.reminder_at}
    <button class="p-row danger" on:click={() => save({ reminder_at: null, remindOnDue: false }, ERR)}>
      <span class="p-k"><span>No reminder</span></span>
    </button>
  {/if}
</div>

{#if task.reminder_at && $permissionState !== 'granted'}
  <p class="p-say">
    {#if $permissionState === 'unsupported'}
      Notifications aren't supported here.
    {:else if $permissionState === 'denied'}
      Notifications are blocked. Allow them for Offlog in {isTauri() ? 'Windows Settings → Notifications' : 'your phone or browser settings'} so this reminder can reach you.
    {:else}
      Notifications aren't on yet.
      <button class="p-tbtn" on:click={() => requestPermission()}>Turn on</button>
    {/if}
  </p>
{/if}

<style>
  .cal { overflow: visible; }
  .cal div.p-row { cursor: default; padding-top: 4px; padding-bottom: 4px; }
  .pick { margin-left: auto; flex: 1; min-width: 0; font-size: var(--p-fs-m); font-weight: 500; }
</style>
