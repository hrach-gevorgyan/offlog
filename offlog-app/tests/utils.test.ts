import { describe, expect, it } from 'vitest';
import { dueRelative, dueDateShort, localDateStr } from '../src/lib/utils';

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

describe('dueDateShort / dueRelative (regression: "Tomorrow · Tomorrow", 2026-07-22)', () => {
  // Real bug: Agenda's "This week" chip composed `dueRelative(due) + ' · ' +
  // dueLabelLong(due)` -- both functions independently collapsed a task due
  // the next day to the literal word "Tomorrow", rendering "Tomorrow ·
  // Tomorrow". dueDateShort() was added specifically to pair with
  // dueRelative() without duplicating its wording.
  it('dueRelative says "Tomorrow" for a task due the next day', () => {
    expect(dueRelative(daysFromToday(1))).toBe('Tomorrow');
  });

  it('dueDateShort never returns the word "Tomorrow", even for a task due the next day', () => {
    const shortLabel = dueDateShort(daysFromToday(1));
    expect(shortLabel).not.toBe('Tomorrow');
    expect(shortLabel).not.toMatch(/tomorrow/i);
  });

  it('dueRelative and dueDateShort never produce the same string for any of the next 7 days', () => {
    for (let i = 0; i <= 7; i++) {
      const due = daysFromToday(i);
      expect(dueRelative(due)).not.toBe(dueDateShort(due));
    }
  });
});
