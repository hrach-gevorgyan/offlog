<script lang="ts">
  import CustomSelect from '../CustomSelect.svelte';
  import ConfirmPinGate from '../ConfirmPinGate.svelte';
  import { isNativePlatform } from '../../config';

  // A dropdown, not the segmented control Theme/Week-starts-on use —
  // those read fine at 2-3 short options, but 4 numeric ones ("1m 5m 15m
  // 30m") in a row are cramped.
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

  // Matches ConfirmPinGate's own onPinInput -- that re-auth field already
  // strips non-digits live; this, the primary entry form for the same PIN
  // value, only rejected them on Save, so a stray letter went unnoticed
  // until after Confirm PIN and the hint were filled in too.
  function onNewPinInput(e: Event) { newPin = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8); }
  function onConfirmPinInput(e: Event) { confirmPin = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8); }

  // Previously all four checks in savePin() (length, digits, match, hint)
  // ran only on click -- a mismatched Confirm PIN surfaced only after
  // filling in the hint too. This one is worth catching live: it's the
  // check most likely to trip on a simple typo, and the earliest point a
  // typo becomes checkable is the moment Confirm PIN is at least as long
  // as New PIN (before that, of course it doesn't match yet).
  $: confirmMismatch = confirmPin.length >= newPin.length && confirmPin.length > 0 && confirmPin !== newPin;
</script>

              <div class="setting-group">
                <div class="setting-section-title">PIN lock</div>
                <p class="setting-hint">Require a PIN to open Offlog. This is a screen lock, not encryption — it keeps a passer-by from casually opening the app, not a substitute for your device's own lock.</p>

                {#if !appLockEnabled}
                  {#if !showPinForm}
                    <button class="export-btn" on:click={openPinForm}>Set a PIN</button>
                  {:else}
                    <label class="field-label">
                      New PIN
                      <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" value={newPin} on:input={onNewPinInput} placeholder="4–8 digits" />
                    </label>
                    <label class="field-label">
                      Confirm PIN
                      <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" value={confirmPin} on:input={onConfirmPinInput} placeholder="4–8 digits" />
                    </label>
                    {#if confirmMismatch}<p class="setting-hint setting-hint-warn compact-hint">Doesn't match yet</p>{/if}
                    <label class="field-label">
                      Hint (optional)
                      <input type="text" maxlength="60" bind:value={pinHint} placeholder="A reminder only you'd understand" />
                    </label>
                    {#if pinError}<p class="setting-hint setting-hint-warn">{pinError}</p>{/if}
                    <div class="setting-row">
                      <button class="export-btn" on:click={() => showPinForm = false}>Cancel</button>
                      <button class="export-btn" on:click={savePin} disabled={pinSaving}>{pinSaving ? 'Saving…' : 'Save PIN'}</button>
                    </div>
                  {/if}
                {:else if pinGateMode}
                  <ConfirmPinGate
                    message={pinGateMode === 'remove'
                      ? 'Turn off the PIN lock? Offlog will no longer require a PIN to open. Enter your current PIN to confirm.'
                      : 'Enter your current PIN to change it.'}
                    confirmLabel={pinGateMode === 'remove' ? 'Turn off' : 'Continue'}
                    danger={pinGateMode === 'remove'}
                    on:verified={onPinGateVerified}
                    on:cancel={() => pinGateMode = null}
                  />
                {:else if !showPinForm}
                  <div class="setting-row">
                    <span class="setting-label">PIN is set</span>
                    <div class="setting-row">
                      <button class="export-btn" on:click={() => pinGateMode = 'change'}>Change PIN</button>
                      <button class="export-btn" on:click={() => pinGateMode = 'remove'}>Remove PIN</button>
                    </div>
                  </div>
                {:else}
                  <label class="field-label">
                    New PIN
                    <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" value={newPin} on:input={onNewPinInput} placeholder="4–8 digits" />
                  </label>
                  <label class="field-label">
                    Confirm PIN
                    <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" value={confirmPin} on:input={onConfirmPinInput} placeholder="4–8 digits" />
                  </label>
                  {#if confirmMismatch}<p class="setting-hint setting-hint-warn compact-hint">Doesn't match yet</p>{/if}
                  <label class="field-label">
                    Hint (optional)
                    <input type="text" maxlength="60" bind:value={pinHint} placeholder="A reminder only you'd understand" />
                  </label>
                  {#if pinError}<p class="setting-hint setting-hint-warn">{pinError}</p>{/if}
                  <div class="setting-row">
                    <button class="export-btn" on:click={() => showPinForm = false}>Cancel</button>
                    <button class="export-btn" on:click={savePin} disabled={pinSaving}>{pinSaving ? 'Saving…' : 'Save PIN'}</button>
                  </div>
                {/if}
              </div>

              {#if appLockEnabled}
                <div class="setting-group">
                  <div class="setting-section-title">Lock after</div>
                  <label class="field-label">
                    Lock after this much idle/background time
                    <CustomSelect options={LOCK_TIMEOUT_OPTIONS} bind:value={lockTimeoutStr} on:change={(e) => onLockTimeoutChange(e.detail)} />
                  </label>
                  <p class="setting-hint">Also locks whenever Offlog is closed and reopened, regardless of this setting.</p>
                </div>
              {/if}

              {#if isNativePlatform() && appLockEnabled}
                <div class="setting-group">
                  <div class="setting-section-title">Biometric unlock</div>
                  <div class="setting-row">
                    <div class="setting-label">Unlock with fingerprint/face</div>
                    <button class="toggle-btn" class:on={biometricEnabled} on:click={toggleBiometric} disabled={biometricBusy} aria-label="Toggle biometric unlock" role="switch" aria-checked={biometricEnabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  <p class="setting-hint">A faster path on top of your PIN, not a replacement — the PIN still works, and is still the only way to change or recover the lock.</p>
                  {#if biometricError}<p class="setting-hint setting-hint-error">{biometricError}</p>{/if}
                  {#if biometricNoneEnrolled}
                    <button class="export-btn" on:click={openBiometricEnrollment}>Open enrollment settings</button>
                  {/if}
                </div>

                <div class="setting-group">
                  <div class="setting-section-title">Privacy screen</div>
                  <div class="setting-row">
                    <div class="setting-label">Hide preview when backgrounded</div>
                    <button class="toggle-btn" class:on={privacyScreenEnabled} on:click={togglePrivacyScreen} aria-label="Toggle privacy screen" role="switch" aria-checked={privacyScreenEnabled}>
                      <span class="toggle-knob"></span>
                    </button>
                  </div>
                  <p class="setting-hint">Extra privacy, beyond the PIN lock: when on, nobody can see your tasks in the recent-apps switcher or in a screenshot — Android blocks both at the same time, there's no way to have one without the other. Off by default since blocking screenshots is a real tradeoff (you can't screenshot your own tasks either), not just a cosmetic choice.</p>
                </div>
              {/if}

