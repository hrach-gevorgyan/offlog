import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// runAutoBackupIfDue on the Windows app, with the file system mocked: the
// database instance it opens is closed, and a failed run isn't repeated at
// every hourly housekeeping.
vi.mock('../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config')>();
  return { ...actual, isTauri: () => true, isNativePlatform: () => false, invokeTauri: vi.fn(async () => false) };
});
const fsMock = vi.hoisted(() => ({
  writeTextFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
  readDir: vi.fn(async () => []),
  remove: vi.fn(async () => {}),
  exists: vi.fn(async () => true),
}));
vi.mock('@tauri-apps/plugin-fs', () => fsMock);
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => 'C:/data', join: async (...p: string[]) => p.join('/') }));

import { runAutoBackupIfDue } from '../src/lib/autoBackup';

let opened = 0, closed = 0;
const RealPouch = window.PouchDB;

beforeEach(() => {
  opened = 0; closed = 0;
  localStorage.removeItem('offlog_auto_backup_last_run');
  window.PouchDB = new Proxy(RealPouch, {
    construct(target, args) {
      opened++;
      const inst = Reflect.construct(target, args);
      const close = inst.close.bind(inst);
      inst.close = () => { closed++; return close(); };
      return inst;
    },
  });
});
afterEach(() => { window.PouchDB = RealPouch; vi.useRealTimers(); fsMock.writeTextFile.mockReset(); fsMock.writeTextFile.mockImplementation(async () => {}); });

describe('runAutoBackupIfDue', () => {
  it('closes the database instance it opened', async () => {
    await runAutoBackupIfDue();
    expect(fsMock.writeTextFile).toHaveBeenCalledTimes(1);
    expect(opened).toBe(1);
    expect(closed).toBe(1);
  });

  it('waits hours, not the next hourly housekeeping, before retrying a failed backup', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
    fsMock.writeTextFile.mockRejectedValue(new Error('disk full'));
    await runAutoBackupIfDue();
    expect(opened).toBe(1);
    expect(closed).toBe(1);

    vi.setSystemTime(new Date('2026-11-26T11:00:00Z'));
    await runAutoBackupIfDue();
    expect(opened).toBe(1);

    fsMock.writeTextFile.mockImplementation(async () => {});
    vi.setSystemTime(new Date('2026-11-26T16:30:00Z'));
    await runAutoBackupIfDue();
    expect(opened).toBe(2);
    expect(localStorage.getItem('offlog_auto_backup_last_run')).toBe('2026-11-26T16:30:00.000Z');
  });
});
