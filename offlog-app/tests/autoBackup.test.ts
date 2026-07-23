import { describe, expect, it } from 'vitest';
import { isBackupDue, filesToDelete } from '../src/lib/autoBackup';

describe('isBackupDue (B62)', () => {
  it('is due when never run before', () => {
    expect(isBackupDue(null, new Date())).toBe(true);
  });

  it('is not due less than ~20h after the last run', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    const last = new Date('2026-07-23T00:00:00.000Z').toISOString(); // 12h ago
    expect(isBackupDue(last, now)).toBe(false);
  });

  it('is due once ~20h have passed', () => {
    const now = new Date('2026-07-23T20:01:00.000Z');
    const last = new Date('2026-07-23T00:00:00.000Z').toISOString(); // 20h1m ago
    expect(isBackupDue(last, now)).toBe(true);
  });

  it('treats a corrupted/unparseable last-run value as never run', () => {
    expect(isBackupDue('not-a-date', new Date())).toBe(true);
  });
});

describe('filesToDelete (B62)', () => {
  it('deletes nothing when under the keep count', () => {
    const files = ['offlog-autobackup-2026-07-21.json', 'offlog-autobackup-2026-07-22.json'];
    expect(filesToDelete(files, 7)).toEqual([]);
  });

  it('deletes only the oldest excess files, keeping the newest N', () => {
    const files = [
      'offlog-autobackup-2026-07-17T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-18T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-19T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-20T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-21T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-22T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-23T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-24T00-00-00-000Z.json',
    ];
    const result = filesToDelete(files, 7);
    expect(result).toEqual(['offlog-autobackup-2026-07-17T00-00-00-000Z.json']);
  });

  it('is order-independent -- unsorted input still deletes the oldest', () => {
    const files = [
      'offlog-autobackup-2026-07-22T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-19T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-21T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-20T00-00-00-000Z.json',
    ];
    expect(filesToDelete(files, 2)).toEqual([
      'offlog-autobackup-2026-07-19T00-00-00-000Z.json',
      'offlog-autobackup-2026-07-20T00-00-00-000Z.json',
    ]);
  });
});
