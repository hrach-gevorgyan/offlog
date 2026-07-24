import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db, { createProject, createTask, updateTask, invalidateTaskCache } from '../src/lib/db';
import { catchUpWeb, applyQuietHours } from '../src/lib/notifications';
import { setQuietHours } from '../src/config';
import type { SpaceDoc } from '../src/lib/types';

// ROADMAP.md A12 (notification reliability audit). Real finding: a web
// reminder past the 1-hour catch-up window used to never fire AND never
// get cleared — it just sat there forever as a nominally-"active"
// reminder that could never actually notify anyone. Regression coverage
// for the fix (catchUpWeb now closes out a too-stale reminder either by
// firing it or by clearing it, never leaving it dangling).
beforeEach(async () => {
  localStorage.clear();
  const all = await db.allDocs({ include_docs: true });
  const dels = all.rows.map(r => ({ ...(r.doc as any), _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
  invalidateTaskCache();
  // jsdom has no real Notification API — stub a minimal one so
  // fireWebNotification()'s `typeof Notification === 'undefined'` guard
  // doesn't short-circuit before this test can observe whether it fired.
  (globalThis as any).Notification = class {
    static permission = 'granted';
    onclick: (() => void) | null = null;
    constructor(public title: string, public options: any) {}
    close() {}
  };
});

async function seedSpace(): Promise<SpaceDoc> {
  const space: SpaceDoc = {
    _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280',
    position: 0, updated_at: new Date().toISOString(), source: 'pc',
  };
  await db.put(space);
  return space;
}

describe('catchUpWeb', () => {
  it('fires and clears a reminder still within the 1-hour catch-up window', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Within window');
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await updateTask(task._id!, { reminder_at: thirtyMinAgo });
    const withReminder = { ...task, reminder_at: thirtyMinAgo };

    await catchUpWeb([withReminder]);

    const after = await db.get(task._id!) as any;
    expect(after.reminder_at).toBeNull();
  });

  it('clears (without firing) a reminder far past the catch-up window instead of leaving it dangling forever', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Very stale');
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await updateTask(task._id!, { reminder_at: threeDaysAgo });
    const staleReminder = { ...task, reminder_at: threeDaysAgo };

    const NotificationSpy = vi.fn();
    (globalThis as any).Notification = class {
      static permission = 'granted';
      constructor(...args: any[]) { NotificationSpy(...args); }
      close() {}
    };

    await catchUpWeb([staleReminder]);

    expect(NotificationSpy).not.toHaveBeenCalled();
    const after = await db.get(task._id!) as any;
    expect(after.reminder_at).toBeNull(); // the actual bug fix: no longer left dangling
  });

  it('leaves a future reminder untouched — that belongs to scheduleWeb, not catch-up', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Future');
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateTask(task._id!, { reminder_at: inOneHour });
    const futureReminder = { ...task, reminder_at: inOneHour };

    await catchUpWeb([futureReminder]);

    const after = await db.get(task._id!) as any;
    expect(after.reminder_at).toBe(inOneHour);
  });

  // 2026-07-18 audit finding: _firedIds used to be keyed by task id alone
  // and never cleared, so once ANY reminder on a task fired, every future
  // reminder ever set on that same task again would silently never fire
  // for the rest of the session. Regression coverage for keying by
  // `${id}:${reminder_at}` instead, so a genuinely new reminder_at on the
  // same task is treated as fireable again.
  it('fires a second, later reminder on the same task after the first one already fired', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Reused task');

    const NotificationSpy = vi.fn();
    (globalThis as any).Notification = class {
      static permission = 'granted';
      onclick: (() => void) | null = null;
      constructor(...args: any[]) { NotificationSpy(...args); }
      close() {}
    };

    const firstDue = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await updateTask(task._id!, { reminder_at: firstDue });
    await catchUpWeb([{ ...task, reminder_at: firstDue }]);
    expect(NotificationSpy).toHaveBeenCalledTimes(1);

    const secondDue = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await updateTask(task._id!, { reminder_at: secondDue });
    await catchUpWeb([{ ...task, reminder_at: secondDue }]);
    expect(NotificationSpy).toHaveBeenCalledTimes(2);
  });
});

// Quiet hours: reminders due inside a configured local wall-clock window
// queue until it ends instead of firing (config.ts's getQuietHours(),
// notifications.ts's applyQuietHours()).
describe('applyQuietHours', () => {
  it('returns the instant unchanged when quiet hours are off', () => {
    setQuietHours({ enabled: false, start: '22:00', end: '07:00' });
    const at = new Date(2026, 0, 1, 23, 30);
    expect(applyQuietHours(at)).toBe(at);
  });

  it('returns the instant unchanged when outside a wrapping window', () => {
    setQuietHours({ enabled: true, start: '22:00', end: '07:00' });
    const at = new Date(2026, 0, 1, 12, 0);
    expect(applyQuietHours(at)).toBe(at);
  });

  it('pushes an evening instant to the next morning for a wrapping window', () => {
    setQuietHours({ enabled: true, start: '22:00', end: '07:00' });
    const at = new Date(2026, 0, 1, 23, 30);
    const result = applyQuietHours(at);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(2); // next day
    expect(result.getHours()).toBe(7);
    expect(result.getMinutes()).toBe(0);
  });

  it('pushes a past-midnight instant to later the same day for a wrapping window', () => {
    setQuietHours({ enabled: true, start: '22:00', end: '07:00' });
    const at = new Date(2026, 0, 2, 2, 0); // 2am, already inside last night's window
    const result = applyQuietHours(at);
    expect(result.getDate()).toBe(2); // same day, not pushed further
    expect(result.getHours()).toBe(7);
  });

  it('handles a non-wrapping same-day window', () => {
    setQuietHours({ enabled: true, start: '13:00', end: '14:00' });
    const at = new Date(2026, 0, 1, 13, 30);
    const result = applyQuietHours(at);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(14);
  });

  // Real risk found while testing: a backlog of overdue reminders would
  // all queue for the exact same window-end instant, presenting to the
  // OS notification system as a simultaneous burst. staggerIndex spreads
  // them out instead.
  it('spreads staggered reminders apart by 15s per index instead of colliding', () => {
    setQuietHours({ enabled: true, start: '22:00', end: '07:00' });
    const at = new Date(2026, 0, 1, 23, 0);
    const first = applyQuietHours(at, 0);
    const second = applyQuietHours(at, 1);
    const third = applyQuietHours(at, 2);
    expect(second.getTime() - first.getTime()).toBe(15_000);
    expect(third.getTime() - second.getTime()).toBe(15_000);
  });

  it('ignores staggerIndex for an instant outside the window', () => {
    setQuietHours({ enabled: true, start: '22:00', end: '07:00' });
    const at = new Date(2026, 0, 1, 12, 0);
    expect(applyQuietHours(at, 5)).toBe(at);
  });
});

describe('catchUpWeb with quiet hours', () => {
  afterEach(() => {
    setQuietHours({ enabled: false, start: '22:00', end: '07:00' });
    vi.useRealTimers();
  });

  it('queues a due reminder until quiet hours end instead of firing immediately', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Quiet hours test');

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 23, 0)); // inside 22:00-07:00 window
    setQuietHours({ enabled: true, start: '22:00', end: '07:00' });

    const NotificationSpy = vi.fn();
    (globalThis as any).Notification = class {
      static permission = 'granted';
      onclick: (() => void) | null = null;
      constructor(...args: any[]) { NotificationSpy(...args); }
      close() {}
    };

    const dueNow = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await updateTask(task._id!, { reminder_at: dueNow });
    await catchUpWeb([{ ...task, reminder_at: dueNow }]);

    expect(NotificationSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000); // past 07:00
    expect(NotificationSpy).toHaveBeenCalledTimes(1);
  });

  it('spreads a backlog of overdue reminders across the window end instead of firing them all at once', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test');
    const tasks = [];
    for (let i = 0; i < 3; i++) {
      const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, `Backlog ${i}`);
      tasks.push(task);
    }

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 23, 0));
    setQuietHours({ enabled: true, start: '22:00', end: '07:00' });

    const fireTimes: number[] = [];
    (globalThis as any).Notification = class {
      static permission = 'granted';
      onclick: (() => void) | null = null;
      constructor(...args: any[]) { fireTimes.push(Date.now()); }
      close() {}
    };

    const dueNow = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const withReminders = [];
    for (const t of tasks) {
      await updateTask(t._id!, { reminder_at: dueNow });
      withReminders.push({ ...t, reminder_at: dueNow });
    }
    await catchUpWeb(withReminders);
    expect(fireTimes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(9 * 60 * 60 * 1000); // past 07:00 + stagger
    expect(fireTimes).toHaveLength(3);
    const gaps = [fireTimes[1] - fireTimes[0], fireTimes[2] - fireTimes[1]];
    expect(gaps).toEqual([15_000, 15_000]);
  });
});
