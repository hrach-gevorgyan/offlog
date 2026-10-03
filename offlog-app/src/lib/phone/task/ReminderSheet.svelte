<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TaskDoc } from '../../types';
  import ReminderPicker from './ReminderPicker.svelte';
  import { requestPermission, permissionState } from '../../notifications';
  import { getDefaultReminderTime, isTauri } from '../../../config';
  import { fmtTime } from '../../utils';
  import { dueDateToReminderInput } from '../../shared/taskHelpers';

  export let task: TaskDoc;
  export let save: (changes: Partial<TaskDoc>, err: string) => Promise<boolean>;

  const ERR = 'Could not save the reminder. Please try again.';
  const defTime = getDefaultReminderTime();
  const timeLabel = (hhmm: string) => fmtTime(new Date(`1970-01-01T${hhmm}`));

  // `done`: a reminder was set or removed; the sheet can close.
  const dispatch = createEventDispatcher<{ done: void }>();

  $: onDue = !!task.remindOnDue;

  // The first reminder is the moment the permission makes sense, so that's
  // when Android is asked; never at launch.
  function askOnce() { if ($permissionState === 'default') requestPermission(); }

  async function setAt(iso: string) {
    if (iso) askOnce();
    if (await save(iso ? { reminder_at: iso } : { reminder_at: null, remindOnDue: false }, ERR)) dispatch('done');
  }

  // On: the reminder follows the due date at the default reminder time.
  // Off: the last derived time stays as a plain reminder.
  function toggleOnDue() {
    if (!task.due_date) return;
    if (!onDue) askOnce();
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

{#if !onDue}
  <ReminderPicker value={task.reminder_at ?? null} on:set={(e) => setAt(e.detail)} />
{:else}
  <button class="clear" on:click={() => setAt('')}>No reminder</button>
{/if}

{#if task.reminder_at && $permissionState !== 'granted'}
  <p class="p-say">
    {#if $permissionState === 'unsupported'}
      Reminders can't pop up here.
    {:else if $permissionState === 'denied'}
      {isTauri() ? 'Windows is blocking reminders. Allow them for Offlog in Windows Settings → Notifications so this one can reach you.' : 'Android is blocking reminders, so this one won’t pop up.'}
      {#if !isTauri()}<button class="p-tbtn" on:click={() => requestPermission()}>Allow</button>{/if}
    {:else}
      Reminders can't pop up yet.
      <button class="p-tbtn" on:click={() => requestPermission()}>Allow</button>
    {/if}
  </p>
{/if}

<style>
  .clear { display: block; width: 100%; height: 46px; border: 0; background: none; cursor: pointer; font: inherit; font-size: var(--p-fs-m); font-weight: 600; color: var(--danger); }
</style>
