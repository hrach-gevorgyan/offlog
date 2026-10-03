import { describe, expect, it, vi, afterEach } from 'vitest';
import { dueRelative, dueDateShort, localDateStr, filterTasks, fmtDay, dayOf, fmtFullTimestamp } from '../src/lib/utils';

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

// Roadmap item "custom fields: filterable and sortable" -- filterTasks()
// gained an optional list of custom-field exact-match filters (ANDed
// together) alongside its existing search/status/priority/tag filters.
describe('filterTasks — custom field filters', () => {
  const base = { title: 'Task', column_id: 'col1', priority: 1, tags: [] as string[] };
  const tasks = [
    { ...base, title: 'A', custom_values: { 'field:client': 'Acme', 'field:region': 'East' } },
    { ...base, title: 'B', custom_values: { 'field:client': 'Globex', 'field:region': 'East' } },
    { ...base, title: 'C', custom_values: { 'field:client': 'Acme', 'field:region': 'West' } },
    { ...base, title: 'D', custom_values: {} },
    { ...base, title: 'E' }, // custom_values entirely absent
  ];

  it('matches only tasks whose custom field value equals the filter value', () => {
    const result = filterTasks(tasks, '', '', 0, '', [{ fieldId: 'field:client', value: 'Acme' }]);
    expect(result.map(t => t.title)).toEqual(['A', 'C']);
  });

  it('ANDs multiple field filters together, not OR', () => {
    const result = filterTasks(tasks, '', '', 0, '', [
      { fieldId: 'field:client', value: 'Acme' },
      { fieldId: 'field:region', value: 'East' },
    ]);
    expect(result.map(t => t.title)).toEqual(['A']);
  });

  it('does not filter at all when customFieldFilters is empty', () => {
    const result = filterTasks(tasks, '', '', 0, '', []);
    expect(result).toHaveLength(5);
  });

  it('ignores an entry whose value is empty ("Any value")', () => {
    const result = filterTasks(tasks, '', '', 0, '', [{ fieldId: 'field:client', value: '' }]);
    expect(result).toHaveLength(5);
  });

  it('ignores an entry whose fieldId is empty', () => {
    const result = filterTasks(tasks, '', '', 0, '', [{ fieldId: '', value: 'Acme' }]);
    expect(result).toHaveLength(5);
  });

  it('treats a missing/empty custom_values map as no match for a real value filter', () => {
    const result = filterTasks(tasks, '', '', 0, '', [{ fieldId: 'field:client', value: 'Acme' }]);
    expect(result.map(t => t.title)).not.toContain('D');
    expect(result.map(t => t.title)).not.toContain('E');
  });
});

describe('fmtDay: one date style on phone and desktop', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('writes day before month, a weekday on request, and the year only when it is not this year', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12));
    expect(fmtDay(dayOf('2026-09-30'))).toBe('30 Sep');
    expect(fmtDay(dayOf('2026-09-30'), { weekday: true })).toBe('Wed 30 Sep');
    expect(fmtDay(dayOf('2027-01-05'), { weekday: true })).toBe('Tue 5 Jan 2027');
    expect(fmtDay(dayOf('2026-09-30'), { year: true })).toBe('30 Sep 2026');
    expect(dueDateShort('2026-09-30')).toBe('Wed 30 Sep');
    expect(fmtFullTimestamp(new Date(2026, 8, 30, 14, 5).toISOString())).toMatch(/^30 Sep 2026, /);
  });
});
