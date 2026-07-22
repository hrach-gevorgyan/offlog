import { beforeEach, describe, expect, it, vi } from 'vitest';
import db, { createProject, createTask, updateTask, invalidateTaskCache } from '../src/lib/db';
import { catchUpWeb } from '../src/lib/notifications';
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
