<script lang="ts">
  // Picks a time of day as "HH:MM" on scroll wheels.
  import { createEventDispatcher } from 'svelte';
  import Sheet from '../Sheet.svelte';
  import TimeWheels from '../TimeWheels.svelte';

  export let title: string;
  export let value: string;

  const dispatch = createEventDispatcher<{ pick: string; close: void }>();
  let picked = value;
</script>

<Sheet {title} on:close={() => dispatch('close')} let:close>
  <div class="ts">
    <TimeWheels {value} on:change={(e) => (picked = e.detail)} />
    <button class="p-go" on:click={() => { dispatch('pick', picked); close(); }}>Done</button>
  </div>
</Sheet>

<style>
  .ts { display: flex; flex-direction: column; gap: 18px; padding-top: 4px; }
</style>
