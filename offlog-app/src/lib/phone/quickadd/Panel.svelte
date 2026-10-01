<script lang="ts">
  // An inline picker inside the Quick add sheet. Android back closes it
  // before the sheet, so it owns a closeOnBack layer: mount it behind a
  // {#key} bumped on every open (modalStack.ts), and close it only through
  // `close()`. `close` is dispatched once the layer is gone.
  import { createEventDispatcher } from 'svelte';
  import { closeOnBack } from '../../modalStack';

  export let title: string;

  const dispatch = createEventDispatcher<{ close: void }>();
  let open = true;
  const requestClose = closeOnBack(() => { open = false; dispatch('close'); });
  export function close() { if (open) requestClose(); }
</script>

<div class="qp" role="group" aria-label={title}>
  <div class="head">
    <span>{title}</span>
    <button class="p-tbtn" on:click={close}>Done</button>
  </div>
  <div class="body"><slot {close} /></div>
</div>

<style>
  .qp { margin: 2px 0 0; }
  .head { display: flex; align-items: center; justify-content: space-between; padding: 0 0 4px 4px; }
  .head span { font-size: var(--p-fs-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); }
  .body { max-height: 44dvh; overflow-y: auto; overscroll-behavior: contain; }
  .body > :global(.p-group:last-child) { margin-bottom: 0; }
</style>
