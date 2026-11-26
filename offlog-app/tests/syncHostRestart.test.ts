import { describe, expect, it, vi } from 'vitest';

// When the Windows app restarts its NyxDB, PouchDB's own retry wait may have
// grown to minutes; the app restarts sync as soon as the server is back.
const syncNow = vi.fn(() => Promise.resolve());
const handlers: Record<string, () => void> = {};
vi.mock('../src/lib/db', async (importOriginal) => ({ ...(await importOriginal<object>()), syncNow: () => syncNow() }));
vi.mock('../src/config', async (importOriginal) => ({ ...(await importOriginal<object>()), isTauri: () => true }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async (name: string, cb: () => void) => { handlers[name] = cb; return () => {}; } }));
vi.mock('../src/lib/notifications', () => ({ rescheduleAll: vi.fn(() => Promise.resolve()), initNotificationListeners: vi.fn(() => Promise.resolve()), checkPermission: vi.fn() }));

import { watchSyncHostRestart } from '../src/lib/store';

describe('watchSyncHostRestart()', () => {
  it('restarts sync when the desktop reports NyxDB is back', async () => {
    watchSyncHostRestart();
    await vi.waitFor(() => expect(handlers['sync-host-restarted']).toBeTypeOf('function'));
    expect(syncNow).not.toHaveBeenCalled();
    handlers['sync-host-restarted']();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });
});
