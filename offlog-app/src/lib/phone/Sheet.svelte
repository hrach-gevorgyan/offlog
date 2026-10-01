<script lang="ts">
  // A Material bottom sheet: scrim, drag handle, Escape, Android back, and
  // drag-down-to-dismiss on the handle.
  //
  // Calls closeOnBack() at setup, so — like every closeOnBack consumer —
  // it MUST be mounted behind a {#key} that changes on every real open
  // (see modalStack.ts and CLAUDE.md). Close by calling the bound `close`
  // or dispatching through the ✕/scrim; never by flipping the parent's
  // flag directly, or the history entry is left behind.
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { closeOnBack } from '../modalStack';
  import { scrimIn, scrimOut, sheetIn, sheetOut } from '../motion';
  import { get } from 'svelte/store';
  import { confirmRequest } from '../confirm';
  import { trapFocus } from '../focusTrap';
  import { modalOpen } from '../store';
  import './phone.css';

  export let title = '';
  export let label = title || 'Sheet';

  const dispatch = createEventDispatcher<{ close: void }>();
  let open = true;
  // The parent unmounts this on `close`; the outro runs first.
  const requestClose = closeOnBack(() => { open = false; });
  export function close() { requestClose(); }

  let panel: HTMLDivElement;
  let dragY = 0, startY: number | null = null;
  function down(e: PointerEvent) { startY = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
  function move(e: PointerEvent) { if (startY !== null) dragY = Math.max(0, e.clientY - startY); }
  function up() {
    if (startY === null) return;
    startY = null;
    if (dragY > 90) requestClose(); else dragY = 0;
  }
  // A confirm raised from inside the sheet owns Escape while it is open.
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || get(confirmRequest)) return;
    e.stopPropagation();
    requestClose();
  }

  let prevModal = false, opener: HTMLElement | null = null;
  onMount(() => {
    opener = document.activeElement as HTMLElement | null;
    prevModal = $modalOpen; modalOpen.set(true); panel?.focus();
  });
  // Focus goes back to whatever opened the sheet, if it is still there.
  onDestroy(() => { modalOpen.set(prevModal); if (opener?.isConnected) opener.focus(); });
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="psheet-scrim" on:click={requestClose} in:fade={scrimIn} out:fade={scrimOut}></div>
  <div
    class="psheet" role="dialog" aria-modal="true" aria-label={label} tabindex="-1" bind:this={panel}
    style:transform={dragY ? `translateY(${dragY}px)` : null}
    use:trapFocus
    in:fly={sheetIn}
    out:fly={sheetOut}
    on:outroend={() => dispatch('close')}
  >
    <div class="grab-zone" on:pointerdown={down} on:pointermove={move} on:pointerup={up} on:pointercancel={up} role="presentation">
      <div class="grab"></div>
    </div>
    {#if title}<h3>{title}</h3>{/if}
    <slot {close} />
  </div>
{/if}

<style>
  /* Below ConfirmDialog (700) so a confirm raised from inside a sheet shows on top. */
  .psheet-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.38); z-index: 650; }
  .psheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 651; outline: none;
    max-height: 88dvh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--bg); color: var(--text); border-radius: 22px 22px 0 0;
    box-shadow: 0 -10px 30px rgba(0,0,0,.2);
    padding: 0 16px calc(16px + env(safe-area-inset-bottom, 0px));
  }
  /* The handle and title stay put while a tall sheet scrolls. */
  .grab-zone { position: sticky; top: 0; z-index: 1; background: var(--bg); padding: 10px 0 12px; touch-action: none; cursor: grab; }
  .grab { width: 40px; height: 5px; border-radius: 3px; background: var(--border-strong); margin: 0 auto; }
  h3 { position: sticky; top: 27px; z-index: 1; background: var(--bg); margin: 0 -4px 8px; padding: 0 8px 4px; font-size: 17px; font-weight: 700; }
</style>
