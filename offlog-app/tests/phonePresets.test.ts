import { afterEach, describe, expect, it, vi } from 'vitest';
import { dueShortcuts, reminderPresets } from '../src/lib/phone/presets';

afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('phone date and reminder choices', () => {
  it('due shortcuts are in date order with no duplicate day', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 10, 0)); // a Sunday: next Monday is tomorrow
    const s = dueShortcuts();
    expect(s.map(x => x.label)).toEqual(['Today', 'Tomorrow', 'In a week', 'In a month']);
    expect([...s.map(x => x.date)].sort()).toEqual(s.map(x => x.date));
  });
  it('reminder presets leave out the past and are earliest first', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 19, 30));
    const p = reminderPresets();
    expect(p.every(x => x.at > '2026-10-02T19:30')).toBe(true);
    expect([...p].sort((a, b) => (a.at < b.at ? -1 : 1))).toEqual(p);
    expect(p.some(x => x.label.startsWith('This evening'))).toBe(false);
  });
});
