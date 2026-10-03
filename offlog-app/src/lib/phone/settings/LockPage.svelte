<script lang="ts">
  // The phone's App lock page. Same state and actions as the desktop's
  // SecuritySettings (owned by PrefsPage); here every form opens in a sheet
  // and every choice is a row.
  import { tick } from 'svelte';
  import { isNativePlatform, verifyAppLockPin } from '../../../config';
  import Sheet from '../Sheet.svelte';
  import Pick from '../task/Pick.svelte';
  import { I } from '../icons';

  const LOCK_TIMEOUT_OPTIONS = [
    { value: '1', label: '1 minute' },
    { value: '5', label: '5 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
  ];

  export let appLockEnabled: boolean;
  export let showPinForm: boolean;
  export let openPinForm: () => void;
  export let newPin: string;
  export let confirmPin: string;
  export let pinHint: string;
  export let pinError: string;
  export let pinSaving: boolean;
  export let savePin: () => void;
  export let pinGateMode: 'change' | 'remove' | null;
  export let onPinGateVerified: () => void;
  export let lockTimeoutStr: string;
  export let onLockTimeoutChange: (v: string) => void;
  export let biometricEnabled: boolean;
  export let biometricBusy: boolean;
  export let biometricError: string;
  export let biometricNoneEnrolled: boolean;
  export let toggleBiometric: () => void;
  export let openBiometricEnrollment: () => void;
  export let privacyScreenEnabled: boolean;
  export let togglePrivacyScreen: () => void;
  export let onPinFormClosed: () => void = () => {};

  const native = isNativePlatform();
  // The sheet focuses its own panel as it opens; the field takes focus just
  // after, so the keyboard comes up ready to type.
  function focusSoon(node: HTMLInputElement) {
    const t = setTimeout(() => node.focus(), 80);
    return { destroy: () => clearTimeout(t) };
  }
  const digits = (e: Event) => (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
  $: confirmMismatch = confirmPin.length >= newPin.length && confirmPin.length > 0 && confirmPin !== newPin;
  $: timeoutLabel = LOCK_TIMEOUT_OPTIONS.find(o => o.value === lockTimeoutStr)?.label ?? `${lockTimeoutStr} minutes`;

  // Every sheet calls closeOnBack(), so each mounts behind a {#key} bumped on
  // every real open.
  let formSession = 0, gateSession = 0, timeoutSession = 0, timeoutOpen = false;
  // The form sheet follows showPinForm, but a successful save clears that flag
  // from PrefsPage; the sheet then closes itself through Back, never by
  // unmounting, so no history entry is left behind.
  let formOpen = false, formSheet: Sheet | undefined;
  $: if (showPinForm && !formOpen) { formSession++; formOpen = true; }
  $: if (!showPinForm && formOpen) formSheet?.close();
  let wasGate = false;
  $: { if (pinGateMode && !wasGate) gateSession++; wasGate = !!pinGateMode; }

  // The current-PIN check that guards Change and Turn off.
  let gatePin = '', gateError = '', gateBusy = false, gateOk = false, gateInput: HTMLInputElement | undefined;
  $: if (pinGateMode) { gatePin = ''; gateError = ''; }
  async function checkGate(close: () => void) {
    if (gateBusy || !gatePin) return;
    gateBusy = true;
    const ok = await verifyAppLockPin(gatePin);
    gateBusy = false;
    if (!ok) { gateError = "That isn't your PIN."; gatePin = ''; await tick(); gateInput?.focus(); return; }
    // The sheet closes first; onGateClosed then acts on the still-set mode,
    // and Change opens the PIN form sheet only after this one is gone.
    gateOk = true;
    close();
  }
  function onGateClosed() {
    if (gateOk) { gateOk = false; onPinGateVerified(); } else pinGateMode = null;
  }
</script>

<p class="p-say intro">A PIN keeps Offlog closed to anyone who picks up your phone. It isn't encryption, so keep your phone's own lock on too.</p>

{#if !appLockEnabled}
  <button class="p-go" on:click={openPinForm}>Set a PIN</button>
{:else}
  <div class="p-group">
    <div class="p-row static">
      <span class="p-ico">{@html I.setLock}</span>
      <span class="p-k"><span>PIN lock is on</span></span>
    </div>
    <button class="p-row" on:click={() => (pinGateMode = 'change')}>
      <span class="p-k"><span>Change PIN</span></span>
      <span class="p-v">{@html I.chev}</span>
    </button>
    <button class="p-row" on:click={() => { timeoutSession++; timeoutOpen = true; }}>
      <span class="p-k"><span>Lock again after</span><span class="p-sub">Away from Offlog this long</span></span>
      <span class="p-v set">{timeoutLabel}{@html I.chev}</span>
    </button>
    <button class="p-row danger" on:click={() => (pinGateMode = 'remove')}>
      <span class="p-k"><span>Turn off PIN lock</span></span>
    </button>
  </div>

  {#if native}
    <div class="setting-group">
      <div class="setting-row">
        <span class="setting-label">Unlock with fingerprint or face</span>
        <button class="toggle-btn" class:on={biometricEnabled} on:click={toggleBiometric} disabled={biometricBusy} aria-label="Unlock with fingerprint or face" role="switch" aria-checked={biometricEnabled}>
          <span class="toggle-knob"></span>
        </button>
      </div>
      <p class="setting-hint compact-hint">Your PIN still works too.</p>
      {#if biometricError}<p class="setting-hint setting-hint-error">{biometricError}</p>{/if}
      {#if biometricNoneEnrolled}<button class="export-btn" on:click={openBiometricEnrollment}>Open phone settings</button>{/if}
    </div>

    <div class="setting-group">
      <div class="setting-row">
        <span class="setting-label">Hide Offlog in recent apps</span>
        <button class="toggle-btn" class:on={privacyScreenEnabled} on:click={togglePrivacyScreen} aria-label="Hide Offlog in recent apps" role="switch" aria-checked={privacyScreenEnabled}>
          <span class="toggle-knob"></span>
        </button>
      </div>
      <p class="setting-hint compact-hint">Your tasks won't show in the app switcher. Android then blocks screenshots of Offlog too.</p>
    </div>
  {/if}
{/if}

{#if formOpen}
  {#key formSession}
    <Sheet bind:this={formSheet} title={appLockEnabled ? 'New PIN' : 'Set a PIN'} on:close={() => { formOpen = false; showPinForm = false; onPinFormClosed(); }}>
      <div class="sh">
        <label class="lbl" for="pin-new">PIN, 4 to 8 digits</label>
        <input id="pin-new" class="p-fld pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" use:focusSoon
          value={newPin} on:input={(e) => (newPin = digits(e))} />
        <label class="lbl" for="pin-again">Same PIN again</label>
        <input id="pin-again" class="p-fld pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8"
          value={confirmPin} on:input={(e) => (confirmPin = digits(e))} />
        {#if confirmMismatch}<p class="err">Doesn't match yet</p>{/if}
        <label class="lbl" for="pin-hint">Hint, if you want one</label>
        <input id="pin-hint" class="p-fld" type="text" maxlength="60" bind:value={pinHint} placeholder="Something only you'd understand" />
        {#if pinError}<p class="err">{pinError}</p>{/if}
        <button class="p-go" on:click={savePin} disabled={pinSaving || newPin.length < 4 || confirmPin !== newPin}>{pinSaving ? 'Saving…' : 'Save PIN'}</button>
      </div>
    </Sheet>
  {/key}
{/if}

{#if pinGateMode}
  {#key gateSession}
    <Sheet title={pinGateMode === 'remove' ? 'Turn off PIN lock' : 'Change PIN'} on:close={onGateClosed} let:close>
      <div class="sh">
        <p class="p-say">{pinGateMode === 'remove' ? 'Offlog will open without a PIN. Enter your current PIN to confirm.' : 'Enter your current PIN first.'}</p>
        <input class="p-fld pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" use:focusSoon aria-label="Current PIN"
          bind:this={gateInput} value={gatePin} on:input={(e) => { gatePin = digits(e); gateError = ''; }}
          on:keydown={(e) => { if (e.key === 'Enter') checkGate(close); }} />
        {#if gateError}<p class="err">{gateError}</p>{/if}
        <button class="p-go" class:danger={pinGateMode === 'remove'} on:click={() => checkGate(close)} disabled={gateBusy || gatePin.length < 4}>
          {pinGateMode === 'remove' ? 'Turn off' : 'Continue'}
        </button>
      </div>
    </Sheet>
  {/key}
{/if}

{#if timeoutOpen}
  {#key timeoutSession}
    <Sheet title="Lock again after" on:close={() => (timeoutOpen = false)} let:close>
      <p class="p-say">After you leave Offlog for this long, it asks for your PIN again. It always asks when it starts.</p>
      <Pick options={LOCK_TIMEOUT_OPTIONS} current={lockTimeoutStr} on:pick={(e) => { lockTimeoutStr = e.detail; onLockTimeoutChange(e.detail); close(); }} />
    </Sheet>
  {/key}
{/if}

<style>
  .intro { margin: 0 4px; }
  .static { cursor: default; }
  .static:active { background: none; }
  .static .p-ico { color: var(--success-ink); }
  .sh { display: flex; flex-direction: column; }
  .lbl { font-size: var(--p-fs-s); color: var(--muted); margin: 0 4px 6px; }
  .pin { letter-spacing: .3em; }
  .err { margin: -6px 4px 12px; font-size: var(--p-fs-s); color: var(--danger); }
</style>
