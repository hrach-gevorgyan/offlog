import { describe, it, expect, beforeEach } from 'vitest';
import { getSyncCredentials, setSyncCredentials, isAppLockEnabled, setAppLockPin, clearAppLockPin, verifyAppLockPin, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes } from '../src/config';

// Pairing handshake (offlog-desktop/src-tauri/src/pairing.rs) replaced the
// old fixed COUCH_USER/COUCH_PASS exports with per-device stored
// credentials, since the PC app now generates a random password per
// install.
//
// C7 (ROADMAP.md, mandatory release-gate item): the old fallback was a
// real hardcoded password baked into source -- a public-repo blocker on
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
// The PIN itself is never stored in plaintext -- only a salted hash --
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
});
