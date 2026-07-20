<script lang="ts">
  import { fade } from 'svelte/transition';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { verifyAppLockPin, clearAppLockPin, getAppLockHint, verifyAppLockRecoveryCode, hasAppLockRecoveryCode, isAppLockBiometricEnabled, isNativePlatform } from '../config';
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
  let showHint = false;
  let showRecovery = false;
  let recoveryCode = '';
  let recoveryError = '';
  let recoverySaving = false;
  const hint = getAppLockHint();
  const recoveryExists = hasAppLockRecoveryCode();
  const biometricEnabled = isNativePlatform() && isAppLockBiometricEnabled();
  let biometricBusy = false;

  onMount(async () => {
    await tick();
    inputEl?.focus();
    if (biometricEnabled) tryBiometric();
  });

  // Fires automatically on mount, and again from the "Try again" link --
  // a cancelled/failed attempt is not a wrong PIN, so it never triggers
  // the shake/error state below. The PIN input stays usable the whole
  // time; biometric is just a faster path on top of it, never a
  // replacement (owner, 2026-07-20 -- see config.ts's own comment).
  async function tryBiometric() {
    if (biometricBusy) return;
    biometricBusy = true;
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const available = await NativeBiometric.isAvailable();
      if (!available.isAvailable) return;
      await NativeBiometric.verifyIdentity({ reason: 'Unlock Offlog', title: 'Unlock Offlog' });
      dispatch('unlocked');
    } catch {
      // Cancelled, failed, or lockout -- fall through to the PIN screen.
    } finally {
      biometricBusy = false;
    }
  }

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

  // v1 shipped this as a plain confirm-and-clear -- owner feedback,
  // 2026-07-19: "it is just removing pin... like when there is wall as
  // block of road but in middle there is door u just open and go". Right:
  // a bypass reachable with zero knowledge isn't a lock. Now requires the
  // one-time recovery code shown at PIN setup (config.ts) -- a real
  // route back in, not a button. Still no server/account to verify
  // identity against (see GOAL.md), so this is the strongest recovery
  // achievable without one: possessing a secret only ever shown once.
  async function submitRecovery() {
    if (recoverySaving || !recoveryCode.trim()) return;
    recoverySaving = true;
    const ok = await verifyAppLockRecoveryCode(recoveryCode);
    recoverySaving = false;
    if (!ok) {
      recoveryError = 'That code doesn’t match.';
      return;
    }
    clearAppLockPin();
    dispatch('unlocked');
  }

  function onRecoveryKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submitRecovery();
  }
</script>

<div class="lock-screen" use:trapFocus transition:fade={{ duration: 150 }}>
  {#if showRecovery}
    <div class="lock-card" class:shake={!!recoveryError}>
      <div class="lock-title">Enter your recovery code</div>
      {#if recoveryExists}
        <div class="lock-sub lock-sub-wide">
          This is the code you saved when you first set your PIN. Entering it correctly removes
          the PIN lock — your tasks are not affected, and you can set a new PIN afterward in
          Settings.
        </div>
        <input
          type="text"
          autocomplete="off"
          class="lock-input lock-input-code"
          placeholder="XXXXX-XXXXX"
          bind:value={recoveryCode}
          on:keydown={onRecoveryKey}
          aria-label="Recovery code"
        />
        {#if recoveryError}<div class="lock-hint lock-hint-error">{recoveryError}</div>{/if}
        <div class="lock-confirm-row">
          <button class="lock-cancel" on:click={() => { showRecovery = false; recoveryError = ''; recoveryCode = ''; }}>Cancel</button>
          <button class="lock-submit" on:click={submitRecovery} disabled={!recoveryCode.trim() || recoverySaving}>Continue</button>
        </div>
      {:else}
        <div class="lock-sub lock-sub-wide">
          No recovery code was ever saved for this device, so there's no way to remove the PIN
          lock without it. Double-check the hint above, or ask on another device if this data
          also syncs there.
        </div>
        <button class="lock-cancel" on:click={() => showRecovery = false}>Back</button>
      {/if}
    </div>
  {:else}
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

      {#if biometricEnabled}
        <button class="lock-forgot" on:click={tryBiometric} disabled={biometricBusy}>Try biometrics again</button>
      {/if}
      {#if hint}
        {#if showHint}
          <div class="lock-hint">Hint: {hint}</div>
        {:else}
          <button class="lock-forgot" on:click={() => showHint = true}>Show hint</button>
        {/if}
      {/if}
      <button class="lock-forgot" on:click={() => showRecovery = true}>Forgot PIN?</button>
    </div>
  {/if}
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
    /* text-align:center visually centers the typed dots, but leaves the
       blinking text caret jumping to the middle of the field as you type
       -- reads as broken (owner-reported, 2026-07-20). Hiding the caret
       is the standard fix for centered PIN/OTP-style inputs; the digits
       themselves are still the only visible feedback, same as any native
       PIN screen. */
    caret-color: transparent;
  }
  .lock-input:focus { border-color: var(--accent); }
  .lock-input:disabled { opacity: .6; }
  .lock-input-code { letter-spacing: .1em; font-size: 1.05rem; text-transform: uppercase; font-family: var(--mono); }
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

  .lock-sub-wide { max-width: 280px; line-height: 1.5; margin-bottom: 22px; }
  .lock-confirm-row { display: flex; gap: 10px; width: 100%; }
  .lock-confirm-row .lock-submit { flex: 1; margin-top: 0; }
  .lock-cancel {
    flex: 1; padding: .6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .9rem; font-weight: 600;
    cursor: pointer; transition: background .12s;
  }
  .lock-cancel:hover { background: var(--hover); }
</style>
