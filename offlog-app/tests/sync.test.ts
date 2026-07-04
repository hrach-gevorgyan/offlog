import { describe, it, expect, vi, beforeEach } from 'vitest';
import { describeSyncError, attachSyncHandlers, startSync, cancelSync, syncState } from '../src/lib/db';
import { setSyncEnabled } from '../src/config';

// ROADMAP.md A16 — offline-queue robustness for sync. There's no CI-reachable
// CouchDB in this project to genuinely drop mid-replication against, so this
// covers the deterministic pieces that decide how a flaky/dropped connection
// is classified and recovered from, without any real network I/O:
//   1. describeSyncError() — what a given failure is actually told to the user.
//   2. attachSyncHandlers()'s settle-once guard — the fix that stopped
//      syncNow() from ever running two concurrent replications against the
//      same remote (a real bug this project shipped and fixed once already).
//   3. startSync() respecting the B13 pause toggle — the one branch of
//      startSync() that's fully testable without touching the network, since
//      it returns before ever calling db.sync().
describe('describeSyncError', () => {
  it('classifies 401/403 as an auth failure', () => {
    expect(describeSyncError({ status: 401 })).toMatch(/credentials/i);
    expect(describeSyncError({ status: 403 })).toMatch(/credentials/i);
  });

  it('classifies 404 as the sync database missing', () => {
    expect(describeSyncError({ status: 404 })).toMatch(/not found/i);
  });

  it('classifies a network-shaped error (dropped connection) as unreachable', () => {
    expect(describeSyncError({ status: 0 })).toMatch(/cannot reach/i);
    expect(describeSyncError({ name: 'TypeError', message: 'Failed to fetch' })).toMatch(/cannot reach/i);
    expect(describeSyncError({ message: 'network error occurred' })).toMatch(/cannot reach/i);
  });

  it('falls back to the error message for anything unrecognized', () => {
    expect(describeSyncError({ message: 'something odd' })).toBe('something odd');
  });

  it('handles a falsy error without throwing', () => {
    expect(describeSyncError(null)).toMatch(/unknown/i);
  });
});

describe('attachSyncHandlers settle-once guard', () => {
  // A minimal fake of PouchDB's sync-event-emitter shape — just enough
  // chainable .on() to drive the same dedup logic attachSyncHandlers relies on.
  function fakeHandler() {
    const listeners: Record<string, ((...args: any[]) => void)[]> = {};
    const fake = {
      on(event: string, cb: (...args: any[]) => void) {
        (listeners[event] ??= []).push(cb);
        return fake;
      },
      fire(event: string, ...args: any[]) {
        (listeners[event] ?? []).forEach(cb => cb(...args));
      },
    };
    return fake;
  }

  it('only calls onSettle once even if both "paused" (with error) and "error" fire', () => {
    const handler = fakeHandler();
    const onSettle = vi.fn();
    attachSyncHandlers(handler, onSettle);

    // A dropped connection mid-replication can surface as an error event
    // and then an errored "paused" — exactly the race this guard exists for.
    handler.fire('error', new Error('dropped'));
    handler.fire('paused', new Error('dropped'));

    expect(onSettle).toHaveBeenCalledOnce();
  });

  it('settles cleanly (no error) on a successful "paused" with no error', () => {
    const handler = fakeHandler();
    const onSettle = vi.fn();
    attachSyncHandlers(handler, onSettle);

    handler.fire('paused', undefined);

    expect(onSettle).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});

describe('startSync() respects the B13 pause toggle', () => {
  beforeEach(() => {
    cancelSync(); // don't let a real handler from another test leak in
  });

  it('does not touch syncState.status (never attempts a connection) when sync is paused', () => {
    setSyncEnabled(false);
    syncState.status = 'error'; // prove startSync() actually short-circuits rather than happening to leave 'idle' already set
    startSync();
    expect(syncState.status).toBe('idle');
    setSyncEnabled(true); // restore default for any other test relying on it
  });
});
