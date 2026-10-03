<script lang="ts">
  // Quick add's Reminder panel: the same picker as the task screen.
  import { createEventDispatcher } from 'svelte';
  import ReminderPicker from '../task/ReminderPicker.svelte';

  // An ISO instant, or null for none.
  export let value: string | null;

  // '' means no reminder.
  const dispatch = createEventDispatcher<{ pick: string }>();
</script>

<ReminderPicker {value} on:set={(e) => dispatch('pick', e.detail)} />
