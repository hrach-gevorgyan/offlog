import { describe, expect, it, vi } from 'vitest';

// The hourly housekeeping pass must re-arm reminders on its own: desktop
// reminders are setTimeouts that otherwise re-arm only after a database write.
const rescheduleAll = vi.fn(() => Promise.resolve());
const runAutoBackupIfDue = vi.fn(() => Promise.resolve());
vi.mock('../src/lib/notifications', () => ({
  rescheduleAll: () => rescheduleAll(),
  initNotificationListeners: vi.fn(() => Promise.resolve()),
  checkPermission: vi.fn(),
}));
vi.mock('../src/lib/autoBackup', () => ({ runAutoBackupIfDue: () => runAutoBackupIfDue() }));
vi.mock('../src/lib/discovery', () => ({ watchForStaleHost: vi.fn() }));

import { runHousekeeping } from '../src/lib/store';

describe('runHousekeeping()', () => {
  it('re-arms reminders alongside backups and retention', () => {
    runHousekeeping();
    expect(runAutoBackupIfDue).toHaveBeenCalledTimes(1);
    expect(rescheduleAll).toHaveBeenCalledTimes(1);
  });

  it('a failed reschedule does not escape as an unhandled rejection', async () => {
    rescheduleAll.mockImplementationOnce(() => Promise.reject(new Error('plugin gone')));
    runHousekeeping();
    await Promise.resolve();
    expect(rescheduleAll).toHaveBeenCalled();
  });
});
