import { describe, it, expect, beforeEach } from 'vitest';
import { getSyncCredentials, setSyncCredentials } from '../src/config';

// Pairing handshake (offlog-desktop/src-tauri/src/pairing.rs) replaced the
// old fixed COUCH_USER/COUCH_PASS exports with per-device stored
// credentials, since the PC app now generates a random password per
// install. The one thing that must never regress: an existing install
// with nothing stored yet keeps syncing with whatever it used before —
// same fallback shape as DEFAULT_SYNC_URL's A35 fix.
describe('getSyncCredentials()/setSyncCredentials()', () => {
  beforeEach(() => {
    localStorage.removeItem('offlog_sync_user');
    localStorage.removeItem('offlog_sync_pass');
  });

  it('falls back to the default (env/static) credentials when nothing is stored', () => {
    const { user, pass } = getSyncCredentials();
    expect(user).toBeTruthy();
    expect(pass).toBeTruthy();
  });

  it('returns stored credentials once set, overriding the default', () => {
    setSyncCredentials('paired-user', 'paired-pass');
    expect(getSyncCredentials()).toEqual({ user: 'paired-user', pass: 'paired-pass' });
  });
});
