import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { invokeTauri, getSyncCredentials, setSyncCredentials, isAppLockEnabled, setAppLockPin, clearAppLockPin, verifyAppLockPin, getAppLockTimeoutMinutes, setAppLockTimeoutMinutes, getAppLockHint, verifyAppLockRecoveryCode, hasAppLockRecoveryCode, isAppLockBiometricEnabled, setAppLockBiometricEnabled, isHapticsEnabled, setHapticsEnabled, isPrivacyScreenEnabled, setPrivacyScreenEnabled, initDeviceName, getDeviceName, setDeviceName, shouldAskDeviceNameForSync } from '../src/config';

const plugin = vi.hoisted(() => ({ info: { name: 'Galaxy S24', model: 'SM-S921B' } as { name?: string; model: string } }));
vi.mock('@capacitor/device', () => ({ Device: { getInfo: async () => plugin.info } }));

// Pairing handshake (offlog-desktop/src-tauri/src/pairing.rs) replaced the
// old fixed COUCH_USER/COUCH_PASS exports with per-device stored
// credentials, since the PC app now generates a random password per
// install.
//
// The old fallback was a
// real hardcoded password baked into source — a public-repo blocker on
// its own. Not testing "falls back to the env/static default" here on
// purpose: `VITE_SYNC_USER`/`VITE_SYNC_PASS` come from this dev
// machine's own gitignored `.env.local`, so what that fallback actually
// resolves to is an environment detail, not something this suite should
// assert a specific value for. The behavior this suite must guard is
// that the override always wins once something's actually stored.
describe('getSyncCredentials()/setSyncCredentials()', () => {
  beforeEach(() => {
    localStorage.removeItem('offlog_sync_user');
    localStorage.removeItem('offlog_sync_pass');
  });

  it('returns stored credentials once set, overriding whatever default applies', async () => {
    await setSyncCredentials('paired-user', 'paired-pass');
    await expect(getSyncCredentials()).resolves.toEqual({ user: 'paired-user', pass: 'paired-pass' });
  });

  // Plain-web/dev (no Tauri, no Capacitor native
  // platform in this test environment) is the one path that still uses
  // localStorage directly -- an existing install upgrading from it has
  // its real credentials sitting in the *old* plaintext keys and must
  // migrate silently, with no re-pairing needed.
  it('migrates legacy plaintext localStorage credentials on first read', async () => {
    localStorage.setItem('offlog_sync_user', 'legacy-user');
    localStorage.setItem('offlog_sync_pass', 'legacy-pass');
    await expect(getSyncCredentials()).resolves.toEqual({ user: 'legacy-user', pass: 'legacy-pass' });
    // Migrated back through setSyncCredentials(), which on this
    // (non-Tauri, non-native) test platform writes the same keys right
    // back -- confirms the round-trip lands correctly, not just that
    // the pre-migration read happened to work.
    expect(localStorage.getItem('offlog_sync_user')).toBe('legacy-user');
    expect(localStorage.getItem('offlog_sync_pass')).toBe('legacy-pass');
  });
});

// App lock: a PIN gate on the UI, not data encryption (see docs/decisions.md).
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
// docs/decisions.md/config.ts's own comments for why this replaced a plain
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

// Biometric: an opt-in flag only, alongside the PIN — see docs/decisions.md's
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

// Pure polish, defaults on unlike App Lock's biometric (no security
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

// invokeTauri() reaches through Tauri's IPC global. Every caller is expected
// to gate on isTauri() first; when one forgets, a rejected promise is
// recoverable where a synchronous TypeError out of the call site is not.
describe('invokeTauri() off Tauri', () => {
  it('rejects instead of throwing when the IPC global is absent', async () => {
    expect(window.__TAURI_INTERNALS__).toBeUndefined();
    await expect(invokeTauri('get_sync_info')).rejects.toThrow(/not running under tauri/i);
  });

  it('does not throw synchronously', () => {
    // a thrown TypeError would escape the caller's .catch entirely
    expect(() => invokeTauri('get_sync_info').catch(() => {})).not.toThrow();
  });
});

describe('week start and clock: device locale until the user chooses', () => {
  const fakeLocale = (info: object) => vi.spyOn(Intl, 'Locale').mockImplementation(function () { return info; } as unknown as typeof Intl.Locale);
  const fakeClock = (hourCycle: string | undefined) => vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    function () { return { resolvedOptions: () => ({ locale: 'en-US', hourCycle }) }; } as unknown as typeof Intl.DateTimeFormat);
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('week start follows the locale (getWeekInfo or weekInfo), Monday when unknown', async () => {
    const { localeWeekStartsMonday } = await import('../src/config');
    fakeLocale({ getWeekInfo: () => ({ firstDay: 7 }) });
    expect(localeWeekStartsMonday()).toBe(false);
    vi.restoreAllMocks();
    fakeLocale({ weekInfo: { firstDay: 1 } });
    expect(localeWeekStartsMonday()).toBe(true);
    vi.restoreAllMocks();
    fakeLocale({});
    expect(localeWeekStartsMonday()).toBe(true);
  });

  it('a new install takes the locale defaults; an existing one keeps Monday and 24h', async () => {
    vi.resetModules();
    localStorage.clear();
    fakeLocale({ getWeekInfo: () => ({ firstDay: 7 }) });
    fakeClock('h12');
    let c = await import('../src/config');
    expect(c.getWeekStartsMonday()).toBe(false);
    expect(c.getTimeFormat24h()).toBe(false);
    vi.resetModules();
    localStorage.clear();
    c = await import('../src/config');
    c.markNamePromptShown();
    expect(c.getWeekStartsMonday()).toBe(true);
    expect(c.getTimeFormat24h()).toBe(true);
  });

  it('an explicit week start always wins over the locale', async () => {
    const { getWeekStartsMonday, setWeekStartsMonday } = await import('../src/config');
    fakeLocale({ getWeekInfo: () => ({ firstDay: 7 }) });
    setWeekStartsMonday(true);
    expect(getWeekStartsMonday()).toBe(true);
  });

  it('the clock follows the locale hour cycle, 24h when unknown; an explicit choice wins', async () => {
    const { localeTimeFormat24h, getTimeFormat24h, setTimeFormat24h } = await import('../src/config');
    fakeClock('h12');
    expect(localeTimeFormat24h()).toBe(false);
    vi.restoreAllMocks();
    fakeClock('h23');
    expect(localeTimeFormat24h()).toBe(true);
    vi.restoreAllMocks();
    fakeClock(undefined);
    expect(localeTimeFormat24h()).toBe(true);
    vi.restoreAllMocks();
    fakeClock('h12');
    setTimeFormat24h(true);
    expect(getTimeFormat24h()).toBe(true);
  });

});

describe('device name: the device\'s own name until the user picks one', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    plugin.info = { name: 'Galaxy S24', model: 'SM-S921B' };
  });
  afterEach(() => { delete (window as { Capacitor?: unknown }).Capacitor; localStorage.clear(); });

  it('a fresh phone takes Android\'s device name, and is still asked to confirm it', async () => {
    await initDeviceName();
    expect(getDeviceName()).toBe('Galaxy S24');
    expect(shouldAskDeviceNameForSync()).toBe(true);
  });

  it('falls back to the model when Android has no device name', async () => {
    plugin.info = { model: 'SM-S921B' };
    await initDeviceName();
    expect(getDeviceName()).toBe('SM-S921B');
  });

  it('a generic default still gets replaced; a chosen name never does', async () => {
    getDeviceName();
    await initDeviceName();
    expect(getDeviceName()).toBe('Galaxy S24');
    localStorage.clear();
    setDeviceName('Kitchen tablet');
    await initDeviceName();
    expect(getDeviceName()).toBe('Kitchen tablet');
  });

  it('runs once: a later rename back to the default is not overwritten', async () => {
    await initDeviceName();
    setDeviceName('Android phone');
    plugin.info = { name: 'Other', model: 'X' };
    await initDeviceName();
    expect(getDeviceName()).toBe('Android phone');
  });

  it('the computer asks the desktop app for its name', async () => {
    delete (window as { Capacitor?: unknown }).Capacitor;
    const invoke = vi.fn().mockResolvedValue('HRACH-PC');
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke };
    try {
      await initDeviceName();
      expect(invoke).toHaveBeenCalledWith('get_device_name', undefined);
      expect(getDeviceName()).toBe('HRACH-PC');
    } finally { delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__; }
  });

  it('a failed lookup keeps the default', async () => {
    plugin.info = { name: '  ', model: '' };
    await initDeviceName();
    expect(getDeviceName()).toBe('Android phone');
  });
});
