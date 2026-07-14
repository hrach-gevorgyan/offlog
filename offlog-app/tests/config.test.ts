import { describe, it, expect, beforeEach } from 'vitest';
import { getSyncCredentials, setSyncCredentials } from '../src/config';

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
