<script lang="ts">
  // The phone's lock screen: Offlog's own keypad, so no system keyboard rises
  // over it. Same rules as the desktop AppLock: no Back, Escape or scrim way
  // out, only the right PIN, biometrics, or the one-time recovery code.
  import { fade } from 'svelte/transition';
  import { scrimIn, scrimOut } from '../motion';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { verifyAppLockPin, clearAppLockPin, getAppLockHint, verifyAppLockRecoveryCode, hasAppLockRecoveryCode, isAppLockBiometricEnabled, isNativePlatform } from '../../config';
  import { trapFocus } from '../focusTrap';
  import { MARK_PATHS } from './mark';

  // Intro transitions only run on an update inside the component (see AppLock).
  let ready = false;
  onMount(() => { ready = true; });

  const dispatch = createEventDispatcher<{ unlocked: void }>();
  const hint = getAppLockHint();
  const recoveryExists = hasAppLockRecoveryCode();
  const biometricEnabled = isNativePlatform() && isAppLockBiometricEnabled();

  let pin = '';
  let wrong = false, shake = false, cooldown = false, wrongCount = 0;
  let showHint = false;
  let showRecovery = false, recoveryCode = '', recoveryError = '', recoveryBusy = false;
  let biometricBusy = false;

  // The PIN length isn't stored, so the screen can't know when typing is
  // done: it unlocks the moment the digits match, and treats a pause (or the
  // 8-digit maximum) on a non-matching PIN as one wrong attempt.
  const PAUSE_MS = 1300;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  let checkSeq = 0;

  async function check() {
    clearTimeout(pauseTimer);
    if (pin.length < 4) return;
    const tried = pin, seq = ++checkSeq;
    if (await verifyAppLockPin(tried)) { if (seq === checkSeq) dispatch('unlocked'); return; }
    if (seq !== checkSeq || pin !== tried) return;
    if (tried.length >= 8) fail();
    else pauseTimer = setTimeout(() => { if (pin === tried) fail(); }, PAUSE_MS);
  }

  function fail() {
    clearTimeout(pauseTimer);
    checkSeq++;
    wrong = true; shake = true; pin = '';
    setTimeout(() => { shake = false; }, 400);
    // A light throttle on idle guessing, as on the desktop lock screen.
    if (++wrongCount >= 3) {
      cooldown = true;
      setTimeout(() => { cooldown = false; wrongCount = 0; }, 3000);
    }
  }

  function press(d: string) {
    if (cooldown || pin.length >= 8) return;
    pin += d; wrong = false;
    check();
  }
  function back() { if (pin) { pin = pin.slice(0, -1); wrong = false; checkSeq++; clearTimeout(pauseTimer); check(); } }

  function onKey(e: KeyboardEvent) {
    if (showRecovery) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'Enter' && pin.length >= 4) { e.preventDefault(); clearTimeout(pauseTimer); verifyAppLockPin(pin).then(ok => ok ? dispatch('unlocked') : fail()); }
  }

  async function tryBiometric() {
    if (biometricBusy) return;
    biometricBusy = true;
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const available = await NativeBiometric.isAvailable();
      if (!available.isAvailable) return;
      await NativeBiometric.verifyIdentity({ reason: 'Unlock Offlog', title: 'Unlock Offlog' });
      dispatch('unlocked');
    } catch { /* cancelled or failed: the keypad stays */ } finally {
      biometricBusy = false;
    }
  }
  onMount(() => { if (biometricEnabled) tryBiometric(); });
  onDestroy(() => clearTimeout(pauseTimer));

  // Recovery must need the one-time code; a plain confirm-and-clear would
  // be a bypass reachable with no knowledge at all.
  async function submitRecovery() {
    if (recoveryBusy || !recoveryCode.trim()) return;
    recoveryBusy = true;
    const ok = await verifyAppLockRecoveryCode(recoveryCode);
    recoveryBusy = false;
    if (!ok) { recoveryError = 'That code doesn’t match.'; return; }
    clearAppLockPin();
    dispatch('unlocked');
  }

  $: dots = Math.max(4, pin.length);
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
</script>

<svelte:window on:keydown={onKey} />

{#if ready}
<div class="lock" use:trapFocus in:fade={scrimIn} out:fade={scrimOut}>
  <div class="head">
    <svg class="mark" viewBox="0 0 1024 1024" aria-hidden="true">{#each MARK_PATHS as d}<path d={d} />{/each}</svg>
    <h1>{showRecovery ? 'Enter your recovery code' : 'Offlog is locked'}</h1>
    {#if !showRecovery}
      <p class="sub" aria-live="polite">
        {#if cooldown}Too many tries. Wait a few seconds.{:else if wrong}<span class="err">That isn't your PIN.</span>{:else if showHint && hint}Hint: {hint}{:else}Enter your PIN{/if}
      </p>
    {/if}
  </div>

  {#if !showRecovery}
    <div class="dots" class:shake role="img" aria-label="{pin.length} of up to 8 digits entered">
      {#each Array(dots) as _, i}<span class="dot" class:on={i < pin.length}></span>{/each}
    </div>

    <div class="pad">
      {#each KEYS as k}<button class="key" on:click={() => press(k)} disabled={cooldown} aria-label={k}>{k}</button>{/each}
      {#if biometricEnabled}
        <button class="key ghost fp" on:click={tryBiometric} disabled={biometricBusy} aria-label="Unlock with fingerprint or face">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v3a6 6 0 0 1-1 3.3"/><path d="M8.5 7.5a5 5 0 0 1 8.5 3.5v2a10 10 0 0 1-.7 3.7"/><path d="M5.6 10a7 7 0 0 1 1-3"/><path d="M6.6 14.5a6 6 0 0 0 .4-2.5 5 5 0 0 1 2-4"/><path d="M14.6 18.5c.3-.9.4-1.7.4-2.5"/></svg>
        </button>
      {:else}<span></span>{/if}
      <button class="key" on:click={() => press('0')} disabled={cooldown} aria-label="0">0</button>
      <button class="key ghost" on:click={back} disabled={!pin} aria-label="Delete a digit">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11v12H9l-6-6z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>
      </button>
    </div>

    <div class="foot">
      {#if hint && !showHint}<button class="link" on:click={() => (showHint = true)}>Show hint</button>{/if}
      <button class="link" on:click={() => { showRecovery = true; recoveryError = ''; recoveryCode = ''; }}>Forgot PIN?</button>
    </div>
  {:else}
    <div class="rec">
      {#if recoveryExists}
        <p class="say">It's the code you saved when you set your PIN. It removes the PIN lock; your tasks stay as they are, and you can set a new PIN in Settings.</p>
        <!-- svelte-ignore a11y-autofocus -->
        <input class="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" aria-label="Recovery code" autofocus
          bind:value={recoveryCode} on:input={() => (recoveryError = '')} on:keydown={(e) => { if (e.key === 'Enter') submitRecovery(); }} />
        {#if recoveryError}<p class="err" role="alert">{recoveryError}</p>{/if}
        <button class="go" on:click={submitRecovery} disabled={!recoveryCode.trim() || recoveryBusy}>Unlock with code</button>
      {:else}
        <p class="say">No recovery code was saved on this phone, so the PIN lock can't be removed without the PIN. Try the hint, if you set one.</p>
      {/if}
      <button class="link" on:click={() => (showRecovery = false)}>Back to PIN</button>
    </div>
  {/if}
</div>
{/if}

<style>
  .lock {
    position: fixed; inset: 0; z-index: 10001; background: var(--bg); color: var(--text);
    display: flex; flex-direction: column; align-items: center;
    padding: calc(env(safe-area-inset-top, 0px) + 56px) 24px calc(env(safe-area-inset-bottom, 0px) + 20px);
    overflow-y: auto;
  }
  .head { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
  .mark { width: 52px; height: 52px; fill: var(--accent); }
  h1 { margin: 6px 0 0; font-size: 22px; font-weight: 600; }
  .sub { margin: 0; min-height: 22px; font-size: 15px; color: var(--faint); }
  .err { color: var(--danger); }
  .dots { display: flex; gap: 18px; margin: 30px 0 38px; }
  .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--accent); transition: background var(--dur-small) var(--ease-standard); }
  .dot.on { background: var(--accent); }
  .dots.shake { animation: shake var(--dur-large) var(--ease-standard); }
  @keyframes shake {
    10%, 90% { transform: translateX(-2px); }
    20%, 80% { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-8px); }
    40%, 60% { transform: translateX(8px); }
  }
  .pad { display: grid; grid-template-columns: repeat(3, 76px); gap: 16px 28px; }
  .key {
    width: 76px; height: 76px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
    background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.08);
    font: inherit; font-size: 30px; font-weight: 500; display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent; transition: background var(--dur-hover) var(--ease-hover);
  }
  .key:active:not(:disabled) { background: color-mix(in srgb, var(--accent) 16%, var(--surface)); }
  .key:disabled { opacity: .45; cursor: default; }
  .key.ghost { background: none; box-shadow: none; color: var(--faint); }
  .key.fp { color: var(--accent); }
  .key svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .foot { margin-top: auto; padding-top: 24px; display: flex; gap: 28px; }
  .link { background: none; border: 0; padding: 10px 4px; cursor: pointer; font: inherit; font-size: 15px; font-weight: 600; color: var(--accent); }
  .rec { width: 100%; max-width: 360px; margin-top: 22px; display: flex; flex-direction: column; align-items: stretch; gap: 14px; }
  .say { margin: 0; font-size: 15px; line-height: 1.5; color: var(--muted); text-align: center; }
  .code {
    width: 100%; box-sizing: border-box; border: 0; outline: none; border-radius: 14px; padding: 14px;
    background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 1px var(--border);
    font: inherit; font-size: 20px; letter-spacing: .12em; text-align: center; text-transform: uppercase;
  }
  .code:focus { box-shadow: inset 0 0 0 2px var(--accent); }
  .rec .err { margin: -4px 0 0; text-align: center; font-size: 14px; }
  .go {
    border: 0; border-radius: 14px; padding: 14px; cursor: pointer; font: inherit; font-size: 16px; font-weight: 700;
    background: var(--accent); color: var(--on-accent);
  }
  .go:disabled { opacity: .45; cursor: default; }
  .rec .link { align-self: center; }
</style>
