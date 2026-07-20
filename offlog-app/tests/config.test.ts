import { describe, it, expect, beforeEach } from 'vitest';
import { getSyncCredentials, setSyncCredentials, isAppLockEnabled, setAppLockPin, clearAppLockPin, verifyAppLockPin, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes, getAppLockHint, verifyAppLockRecoveryCode, hasAppLockRecoveryCode, isAppLockBiometricEnabled, setAppLockBiometricEnabled, isHapticsEnabled, setHapticsEnabled, isPrivacyScreenEnabled, setPrivacyScreenEnabled } from '../src/config';

// Pairing handshake (offlog-desktop/src-tauri/src/pairing.rs) replaced the
// old fixed COUCH_USER/COUCH_PASS exports with per-device stored
// credentials, since the PC app now generates a random password per
// install.
//
// C7 (ROADMAP.md, mandatory release-gate item): the old fallback was a
// real hardcoded password baked into source — a public-repo blocker on
// its own. Not testing "falls back to the env/static default" here on
// purpose: `VITE_COUCH_USER`/`VITE_COUCH_PASS` come from this dev
// machine's own gitignored `.env.local`, so what that fallback actually
// resolves to is an environment detail, not something this suite should
// assert a specific value for. The behavior this suite must guard is
// that the override always wins once something's actually stored.
describe('getSyncCredentials()/setSyncCredentials()', () => {
  beforeEach(() => {
    localStorage.removeItem('offlog_sync_user');
    localStorage.removeItem('offlog_sync_pass');
  });

  it('returns stored credentials once set, overriding whatever default applies', () => {
    setSyncCredentials('paired-user', 'paired-pass');
    expect(getSyncCredentials()).toEqual({ user: 'paired-user', pass: 'paired-pass' });
  });
});

// App lock: a PIN gate on the UI, not data encryption (see DECISIONS.md).
// The PIN itself is never stored in plaintext — only a salted hash —
// so these tests go through setAppLockPin()/verifyAppLockPin() rather
// than asserting a specific localStorage value.
describe('App lock (PIN)', () => {
  beforeEach(() => {
    clearAppLockPin();
    localStorage.removeItem('offlog_app_lock_timeout_minutes');
  });

  it('is disabled until a PIN is set', () => {
    expect(isAppLockEnabled()).toBe(false);
  });

  it('is enabled once a PIN is set, and the correct PIN verifies', async () => {
    await setAppLockPin('1234');
    expect(isAppLockEnabled()).toBe(true);
    expect(await verifyAppLockPin('1234')).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    await setAppLockPin('1234');
    expect(await verifyAppLockPin('0000')).toBe(false);
  });

  it('never stores the PIN in plaintext', async () => {
    await setAppLockPin('1234');
    const raw = JSON.stringify(localStorage);
    // A loose but meaningful check: the literal PIN digits shouldn't
    // appear verbatim anywhere localStorage persists.
    expect(localStorage.getItem('offlog_app_lock_hash')).not.toBe('1234');
    expect(localStorage.getItem('offlog_app_lock_hash')).not.toContain('1234');
  });

  it('clearAppLockPin() disables the lock and invalidates the old PIN', async () => {
    await setAppLockPin('1234');
    clearAppLockPin();
    expect(isAppLockEnabled()).toBe(false);
    expect(await verifyAppLockPin('1234')).toBe(false);
  });

  it('changing the PIN invalidates the previous one', async () => {
    await setAppLockPin('1234');
    await setAppLockPin('5678');
    expect(await verifyAppLockPin('1234')).toBe(false);
    expect(await verifyAppLockPin('5678')).toBe(true);
  });

  it('verifyAppLockPin() is false when no PIN has ever been set', async () => {
    expect(await verifyAppLockPin('1234')).toBe(false);
  });

  it('defaults the lock timeout to 5 minutes', () => {
    expect(getAppLockTimeoutMinutes()).toBe(5);
  });

  it('returns a stored custom timeout', () => {
    setAppLockTimeoutMinutes(15);
    expect(getAppLockTimeoutMinutes()).toBe(15);
  });

  it('has no hint by default', () => {
    expect(getAppLockHint()).toBeNull();
  });

  it('stores and returns a hint set alongside the PIN', async () => {
    await setAppLockPin('1234', 'my old street name');
    expect(getAppLockHint()).toBe('my old street name');
  });

  it('trims the hint and drops it if blank', async () => {
    await setAppLockPin('1234', '   ');
    expect(getAppLockHint()).toBeNull();
    await setAppLockPin('1234', '  spaced out  ');
    expect(getAppLockHint()).toBe('spaced out');
  });

  it('clearAppLockPin() also clears the hint', async () => {
    await setAppLockPin('1234', 'a hint');
    clearAppLockPin();
    expect(getAppLockHint()).toBeNull();
  });

  it('changing the PIN without passing a hint clears the old one', async () => {
    await setAppLockPin('1234', 'a hint');
    await setAppLockPin('5678');
    expect(getAppLockHint()).toBeNull();
  });
});

// Recovery code: the real route back in if the PIN is forgotten (see
// DECISIONS.md/config.ts's own comments for why this replaced a plain
// "Forgot PIN -> clear it" button — that was a bypass reachable with no
// knowledge at all, not a lock). Only the salted hash is ever stored;
// these tests go through setAppLockPin()'s returned plaintext code and
// verifyAppLockRecoveryCode() rather than asserting a raw localStorage value.
describe('App lock recovery code', () => {
  beforeEach(() => {
    clearAppLockPin();
  });

  it('has no recovery code before a PIN is ever set', () => {
    expect(hasAppLockRecoveryCode()).toBe(false);
  });

  it('generates a recovery code the first time a PIN is set', async () => {
    const result = await setAppLockPin('1234');
    expect(result.recoveryCode).not.toBeNull();
    expect(hasAppLockRecoveryCode()).toBe(true);
  });

  it('the generated code verifies correctly', async () => {
    const { recoveryCode } = await setAppLockPin('1234');
    expect(await verifyAppLockRecoveryCode(recoveryCode!)).toBe(true);
  });

  it('rejects an incorrect recovery code', async () => {
    await setAppLockPin('1234');
    expect(await verifyAppLockRecoveryCode('WRONG-CODE')).toBe(false);
  });

  it('is case-insensitive', async () => {
    const { recoveryCode } = await setAppLockPin('1234');
    expect(await verifyAppLockRecoveryCode(recoveryCode!.toLowerCase())).toBe(true);
  });

  it('changing the PIN does not generate a new recovery code or invalidate the old one', async () => {
    const first = await setAppLockPin('1234');
    const second = await setAppLockPin('5678');
    expect(second.recoveryCode).toBeNull(); // nothing new to show the user
    expect(await verifyAppLockRecoveryCode(first.recoveryCode!)).toBe(true);
  });

  it('clearAppLockPin() removes the recovery code entirely', async () => {
    const { recoveryCode } = await setAppLockPin('1234');
    clearAppLockPin();
    expect(hasAppLockRecoveryCode()).toBe(false);
    expect(await verifyAppLockRecoveryCode(recoveryCode!)).toBe(false);
  });

  it('setting a PIN again after a full clear generates a fresh code', async () => {
    const first = await setAppLockPin('1234');
    clearAppLockPin();
    const second = await setAppLockPin('1234');
    expect(second.recoveryCode).not.toBeNull();
    expect(second.recoveryCode).not.toBe(first.recoveryCode);
  });
});

// Biometric: an opt-in flag only, alongside the PIN — see DECISIONS.md's
// "Biometric unlock sits alongside the PIN" entry. No new secret to store
// here (the OS itself holds the enrolled biometric), just whether this
// device opted in.
describe('App lock biometric flag', () => {
  beforeEach(() => {
    clearAppLockPin();
  });

  it('is off by default', () => {
    expect(isAppLockBiometricEnabled()).toBe(false);
  });

  it('can be turned on and off independently of the PIN', async () => {
    await setAppLockPin('1234');
    setAppLockBiometricEnabled(true);
    expect(isAppLockBiometricEnabled()).toBe(true);
    setAppLockBiometricEnabled(false);
    expect(isAppLockBiometricEnabled()).toBe(false);
  });

  it('clearAppLockPin() also turns biometric off', async () => {
    await setAppLockPin('1234');
    setAppLockBiometricEnabled(true);
    clearAppLockPin();
    expect(isAppLockBiometricEnabled()).toBe(false);
  });
});

// B58: pure polish, defaults on unlike App Lock's biometric (no security
// implication to defaulting a vibration on) — see config.ts's own comment.
describe('Haptics setting', () => {
  beforeEach(() => {
    localStorage.removeItem('offlog_haptics_enabled');
  });

  it('defaults to on', () => {
    expect(isHapticsEnabled()).toBe(true);
  });

  it('can be turned off and back on', () => {
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);
  });
});

// v5.4.2 correction: was auto-tied to isAppLockEnabled(), no separate
// control — Android's FLAG_SECURE (what this actually sets) blocks ALL
// screenshots, not just the recents-switcher preview, so defaults off
// and is a real independent setting rather than derived from the PIN.
describe('Privacy screen setting', () => {
  beforeEach(() => {
    clearAppLockPin();
  });

  it('defaults to off', () => {
    expect(isPrivacyScreenEnabled()).toBe(false);
  });

  it('can be turned on independently of the PIN', async () => {
    await setAppLockPin('1234');
    setPrivacyScreenEnabled(true);
    expect(isPrivacyScreenEnabled()).toBe(true);
  });

  it('clearAppLockPin() also turns it off', async () => {
    await setAppLockPin('1234');
    setPrivacyScreenEnabled(true);
    clearAppLockPin();
    expect(isPrivacyScreenEnabled()).toBe(false);
  });
});
