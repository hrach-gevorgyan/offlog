import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// Native reminder scheduling against a mocked LocalNotifications plugin: the
// plugin opens the system "Alarms & reminders" page by itself whenever an
// exact alarm is requested without the grant, so the request must follow it.
const ln = vi.hoisted(() => ({
  exact: 'denied' as 'granted' | 'denied',
  schedule: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkExactNotificationSetting: async () => ({ exact_alarm: ln.exact }),
    changeExactNotificationSetting: async () => { ln.exact = 'granted'; return { exact_alarm: 'granted' }; },
    checkPermissions: async () => ({ display: 'granted' }),
    createChannel: async () => {},
    registerActionTypes: async () => {},
    getPending: async () => ({ notifications: [] }),
    cancel: async () => {},
    schedule: (...a: unknown[]) => ln.schedule(...a),
  },
}));
const tasks = vi.hoisted(() => ({ list: [] as { _id: string; title: string; reminder_at: string }[] }));
vi.mock('../src/lib/db', () => ({
  default: {},
  getAllActiveTasksWithReminders: async () => tasks.list,
  updateTask: vi.fn(), getTaskById: vi.fn(),
}));

const soon = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

async function load() {
  vi.resetModules();
  return import('../src/lib/notifications');
}

beforeEach(() => {
  (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  ln.schedule.mockReset().mockResolvedValue({ notifications: [] });
  tasks.list = [{ _id: 'task:a', title: 'A', reminder_at: soon(2) }];
  localStorage.clear();
});
afterEach(() => { delete (window as { Capacitor?: unknown }).Capacitor; });

describe('native reminders and exact alarms', () => {
  it('without the grant: schedules inexact, so the plugin never opens the system page', async () => {
    ln.exact = 'denied';
    const n = await load();
    await n.rescheduleAll();
    const sent = ln.schedule.mock.calls[0][0].notifications;
    expect(sent).toHaveLength(1);
    expect(sent[0].isExactNotification).toBe(false);
  });

  it('granting from Make exact re-arms the reminders already set as exact', async () => {
    ln.exact = 'denied';
    const n = await load();
    await n.rescheduleAll();
    ln.schedule.mockClear();
    await n.requestExactAlarmPermission();
    expect(ln.schedule).toHaveBeenCalled();
    expect(ln.schedule.mock.calls.at(-1)![0].notifications[0].isExactNotification).toBe(true);
  });

  it('with the grant: schedules exact', async () => {
    ln.exact = 'granted';
    const n = await load();
    await n.rescheduleAll();
    expect(ln.schedule.mock.calls[0][0].notifications[0].isExactNotification).toBe(true);
  });

  it('nudges once when a reminder is newly set without the grant; reminders present at launch do not', async () => {
    ln.exact = 'denied';
    const n = await load();
    await n.rescheduleAll(); // launch: task:a already had its reminder
    expect(get(n.exactAlarmNudge)).toBe(0);
    tasks.list = [...tasks.list, { _id: 'task:b', title: 'B', reminder_at: soon(3) }];
    await n.rescheduleAll();
    expect(get(n.exactAlarmNudge)).toBe(1);
    tasks.list = [...tasks.list, { _id: 'task:c', title: 'C', reminder_at: soon(4) }];
    await n.rescheduleAll();
    expect(get(n.exactAlarmNudge)).toBe(1);
  });

  it('no nudge when exact alarms are allowed', async () => {
    ln.exact = 'granted';
    const n = await load();
    await n.rescheduleAll();
    tasks.list = [...tasks.list, { _id: 'task:b', title: 'B', reminder_at: soon(3) }];
    await n.rescheduleAll();
    expect(get(n.exactAlarmNudge)).toBe(0);
  });

  it('a grant that changed while away re-arms every reminder', async () => {
    ln.exact = 'denied';
    const n = await load();
    await n.rescheduleAll();
    ln.schedule.mockClear();
    ln.exact = 'granted';
    await n.recheckGrants();
    expect(ln.schedule.mock.calls[0][0].notifications[0].isExactNotification).toBe(true);
    ln.schedule.mockClear();
    await n.recheckGrants(); // unchanged: nothing to redo
    expect(ln.schedule).not.toHaveBeenCalled();
  });
});
