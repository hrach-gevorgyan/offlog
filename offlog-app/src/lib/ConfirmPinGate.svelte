<script lang="ts">
  // B61: changing or removing the App Lock PIN used to need nothing but
  // an unlocked device — anyone holding it could silently disable the
  // lock. This gate makes both paths behave like a password change
  // anywhere else: prove you know the *current* PIN first. A separate
  // component (not inline SettingsPanel state) so the flow is directly
  // unit-testable without mounting the whole settings panel.
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { verifyAppLockPin } from '../config';

  export let message: string;
  export let confirmLabel = 'Continue';
  export let danger = false;

  const dispatch = createEventDispatcher<{ verified: void; cancel: void }>();

  let pin = '';
  let error = '';
  let busy = false;
  let inputEl: HTMLInputElement;

  onMount(async () => { await tick(); inputEl?.focus(); });

  function onPinInput(e: Event) {
    // Digits only, same filter as AppLock.svelte's lock screen.
    pin = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    error = '';
  }

  async function submit() {
    if (busy || !pin) return;
    busy = true;
    const ok = await verifyAppLockPin(pin);
    busy = false;
    if (!ok) {
      error = 'Current PIN is incorrect.';
      pin = '';
      await tick();
      inputEl?.focus();
      return;
    }
    dispatch('verified');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') dispatch('cancel');
  }
</script>

<p class="gate-message">{message}</p>
<label class="gate-label">
  Current PIN
  <input
    bind:this={inputEl}
    type="password"
    inputmode="numeric"
    autocomplete="off"
    maxlength="8"
    placeholder="4–8 digits"
    value={pin}
    on:input={onPinInput}
    on:keydown={onKey}
    aria-label="Current PIN"
  />
</label>
{#if error}<p class="gate-error">{error}</p>{/if}
<div class="gate-row">
  <button class="gate-btn" on:click={() => dispatch('cancel')}>Cancel</button>
  <button class="gate-btn" class:gate-btn-danger={danger} on:click={submit} disabled={!pin || busy}>
    {busy ? 'Checking…' : confirmLabel}
  </button>
</div>

<style>
  /* Mirrors SettingsPanel's .field-label/.export-btn look — scoped CSS
     doesn't cross the component boundary, so the tokens are restated. */
  .gate-message { font-size: .8rem; color: var(--muted); line-height: 1.45; margin: 0 0 10px; }
  .gate-label {
    display: flex; flex-direction: column; gap: .35rem;
    font-family: var(--mono); font-size: .68rem; letter-spacing: .06em;
    text-transform: uppercase; color: var(--faint);
  }
  .gate-label input {
    padding: .5rem .6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .9rem;
  }
  .gate-label input:focus { outline: none; border-color: var(--accent); }
  .gate-error { font-size: .78rem; color: var(--danger); margin: 8px 0 0; }
  .gate-row { display: flex; gap: 8px; margin-top: 12px; }
  .gate-btn {
    padding: .35rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .8rem; font-weight: 500;
    white-space: nowrap;
  }
  .gate-btn:hover:not(:disabled) { background: var(--hover); }
  .gate-btn:disabled { opacity: .5; cursor: default; }
  .gate-btn-danger { border-color: var(--danger); color: var(--danger); }
  .gate-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 10%, transparent); }
</style>
