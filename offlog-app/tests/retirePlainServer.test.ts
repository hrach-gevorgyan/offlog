import { describe, expect, it, beforeEach, vi } from 'vitest';
import db, { retirePlainServer } from '../src/lib/db';

// After the update, a desktop's readable sync database is pulled from once
// and then deleted, so no task stays on the server in the clear. A memory
// database stands in for the old server.
const PouchDB = (globalThis as { PouchDB?: PouchDB.Static }).PouchDB!;
let n = 0;
let name: string;
beforeEach(() => { localStorage.clear(); name = `plain-${n++}`; });

describe('retirePlainServer', () => {
  it('pulls what only the old readable database held, then deletes it', async () => {
    await new PouchDB(name).put({ _id: 'task:only-on-server', type: 'task', title: 'Kept' });
    localStorage.setItem('offlog_sync_key', 'a2V5');
    localStorage.setItem('offlog_plain_server_to_retire', name);
    await retirePlainServer();
    expect((await db.get<{ title: string }>('task:only-on-server')).title).toBe('Kept');
    expect((await new PouchDB(name).info()).doc_count).toBe(0);
    expect(localStorage.getItem('offlog_plain_server_to_retire')).toBeNull();
  });

  it('keeps the old database when the pull could not write everything', async () => {
    await new PouchDB(name).put({ _id: 'task:unsaved', type: 'task', title: 'x' });
    localStorage.setItem('offlog_sync_key', 'a2V5');
    localStorage.setItem('offlog_plain_server_to_retire', name);
    const pull = vi.spyOn(db.replicate, 'from').mockResolvedValueOnce({ ok: false, doc_write_failures: 1 } as never);
    await retirePlainServer();
    pull.mockRestore();
    expect((await new PouchDB(name).info()).doc_count).toBe(1);
    expect(localStorage.getItem('offlog_plain_server_to_retire')).toBe(name);
  });

  it('does nothing without a sync key', async () => {
    await new PouchDB(name).put({ _id: 'task:stays', type: 'task', title: 'x' });
    localStorage.setItem('offlog_plain_server_to_retire', name);
    await retirePlainServer();
    expect((await new PouchDB(name).info()).doc_count).toBe(1);
    expect(localStorage.getItem('offlog_plain_server_to_retire')).toBe(name);
  });
});

describe('when it runs', () => {
  it('after a sync settles, when the server is known to be up', async () => {
    const { attachSyncHandlers } = await import('../src/lib/db');
    await new PouchDB(name).put({ _id: 'task:late', type: 'task', title: 'Late' });
    localStorage.setItem('offlog_sync_key', 'a2V5');
    localStorage.setItem('offlog_plain_server_to_retire', name);
    const listeners: Record<string, ((e?: unknown) => void)[]> = {};
    const handler = { on(ev: string, cb: (e?: unknown) => void) { (listeners[ev] ??= []).push(cb); return handler; } };
    attachSyncHandlers(handler as never);
    listeners.paused.forEach(cb => cb(undefined));
    await vi.waitFor(async () => expect(localStorage.getItem('offlog_plain_server_to_retire')).toBeNull());
    expect((await db.get<{ title: string }>('task:late')).title).toBe('Late');
  });

  it('waits before trying again after a failed attempt, instead of after every sync', async () => {
    const { attachSyncHandlers } = await import('../src/lib/db');
    localStorage.setItem('offlog_sync_key', 'a2V5');
    localStorage.setItem('offlog_plain_server_to_retire', name);
    const pull = vi.spyOn(db.replicate, 'from').mockResolvedValue({ ok: false, doc_write_failures: 1 } as never);
    const realNow = Date.now.bind(Date);
    let offset = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    const listeners: Record<string, ((e?: unknown) => void)[]> = {};
    const handler = { on(ev: string, cb: (e?: unknown) => void) { (listeners[ev] ??= []).push(cb); return handler; } };
    attachSyncHandlers(handler as never);
    const settle = async () => { listeners.paused.forEach(cb => cb(undefined)); await new Promise(r => setTimeout(r, 30)); };
    try {
      await settle();
      expect(pull).toHaveBeenCalledTimes(1);
      await settle();
      await settle();
      expect(pull).toHaveBeenCalledTimes(1);
      offset = 61000;
      await settle();
      expect(pull).toHaveBeenCalledTimes(2);
      offset += 61000;
      await settle();
      expect(pull).toHaveBeenCalledTimes(2);
    } finally {
      pull.mockRestore();
      clock.mockRestore();
    }
  });
});
