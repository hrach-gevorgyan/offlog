<script lang="ts">
  import { fade } from 'svelte/transition';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { verifyAppLockPin, clearAppLockPin } from '../config';
  import { confirmAction } from './confirm';
  import { trapFocus } from './focusTrap';

  // Deliberately does NOT use modalStack.ts's closeOnBack() -- every other
  // overlay in the app is dismissible via Escape/back/scrim-click by
  // design, but a lock screen that closes on Escape isn't a lock. The only
  // ways out are a correct PIN or the explicit "Forgot PIN" reset below.
  const dispatch = createEventDispatcher<{ unlocked: void }>();

  let pin = '';
  let error = false;
  let wrongCount = 0;
  let cooldown = false;
  let inputEl: HTMLInputElement;

  onMount(async () => { await tick(); inputEl?.focus(); });

  async function submit() {
    if (cooldown || !pin) return;
    const ok = await verifyAppLockPin(pin);
    if (ok) {
      dispatch('unlocked');
      return;
    }
    error = true;
    wrongCount++;
    pin = '';
    // A light throttle, not real rate-limiting -- this gates a UI, not a
    // vault (see DECISIONS.md), so the point is just to slow down idle
    // guessing, not withstand a determined attacker.
    if (wrongCount >= 3) {
      cooldown = true;
      setTimeout(() => { cooldown = false; wrongCount = 0; }, 3000);
    }
    setTimeout(() => { error = false; }, 400);
    await tick();
    inputEl?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
  }

  function onPinInput(e: Event) {
    // Digits only -- a PIN, not a general password field.
    pin = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
  }

  // No secondary auth factor exists to verify identity before resetting
  // (no accounts, no email -- see GOAL.md) -- since the PIN only gates the
  // UI and never encrypts anything, the honest design is a plain confirm,
  // not a fake security theater flow. Whoever has the device already has
  // the data either way; this just removes the inconvenience for its
  // rightful owner who forgot their own PIN.
  async function forgotPin() {
    const ok = await confirmAction(
      'This removes the PIN lock so you can get back into Offlog. Your tasks are not affected — you can set a new PIN afterward in Settings.',
      { confirmLabel: 'Remove PIN', cancelLabel: 'Cancel' },
    );
    if (!ok) return;
    clearAppLockPin();
    dispatch('unlocked');
  }
</script>

<div class="lock-screen" use:trapFocus transition:fade={{ duration: 150 }}>
  <div class="lock-card" class:shake={error}>
    <div class="lock-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    </div>
    <div class="lock-title">Offlog is locked</div>
    <div class="lock-sub">Enter your PIN to continue</div>

    <input
      bind:this={inputEl}
      type="password"
      inputmode="numeric"
      autocomplete="off"
      class="lock-input"
      placeholder="PIN"
      value={pin}
      on:input={onPinInput}
      on:keydown={onKey}
      disabled={cooldown}
      aria-label="PIN"
    />

    {#if cooldown}
      <div class="lock-hint lock-hint-error">Too many attempts — try again in a few seconds</div>
    {/if}

    <button class="lock-submit" on:click={submit} disabled={!pin || cooldown}>Unlock</button>
    <button class="lock-forgot" on:click={forgotPin}>Forgot PIN?</button>
  </div>
</div>

<style>
  .lock-screen {
    position: fixed; inset: 0; z-index: 10001;
    background: var(--bg); display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .lock-card {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    width: min(320px, 100%);
  }
  .lock-card.shake { animation: shake .35s ease; }
  @keyframes shake {
    10%, 90% { transform: translateX(-2px); }
    20%, 80% { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-8px); }
    40%, 60% { transform: translateX(8px); }
  }
  .lock-icon { color: var(--accent); margin-bottom: 6px; }
  .lock-title { font-size: 1.15rem; font-weight: 700; color: var(--text); }
  .lock-sub { font-size: .85rem; color: var(--muted); margin-bottom: 18px; }
  .lock-input {
    width: 100%; text-align: center; letter-spacing: .4em;
    font-size: 1.3rem; padding: .6rem .7rem;
    border: 1.5px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); outline: none;
    transition: border-color .12s;
  }
  .lock-input:focus { border-color: var(--accent); }
  .lock-input:disabled { opacity: .6; }
  .lock-hint { font-size: .78rem; margin-top: 10px; text-align: center; }
  .lock-hint-error { color: var(--danger); }
  .lock-submit {
    width: 100%; margin-top: 14px; padding: .6rem; border: none; border-radius: var(--radius-sm);
    background: var(--accent); color: var(--on-accent); font-size: .9rem; font-weight: 600;
    cursor: pointer; transition: opacity .12s;
  }
  .lock-submit:disabled { opacity: .45; cursor: default; }
  .lock-submit:not(:disabled):hover { opacity: .88; }
  .lock-forgot {
    margin-top: 14px; background: none; border: none; cursor: pointer;
    font-size: .78rem; color: var(--faint); text-decoration: underline;
  }
  .lock-forgot:hover { color: var(--muted); }
</style>
