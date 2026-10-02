import { describe, expect, it, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { today, onNewDay, msUntilNextLocalMidnight } from '../src/lib/today';

const ORIGINAL_TZ = process.env.TZ;

function watch() {
  const seen: string[] = [];
  const unsub = today.subscribe(d => seen.push(d));
  return { seen, unsub };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

describe('today store', () => {
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
    setHidden(false);
  });

  it('starts on the current local date and advances at local midnight, re-arming each day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 23, 59, 0));
    const { seen, unsub } = watch();
    expect(seen).toEqual(['2026-10-02']);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(59_000);
    expect(seen).toEqual(['2026-10-02']);
    vi.advanceTimersByTime(1_100);
    expect(seen).toEqual(['2026-10-02', '2026-10-03']);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(24 * 3600_000);
    expect(seen).toEqual(['2026-10-02', '2026-10-03', '2026-10-04']);
    expect(vi.getTimerCount()).toBe(1);
    unsub();
  });

  it('shares one timer across subscribers and clears it when the last one leaves', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0));
    const a = watch();
    const b = watch();
    expect(vi.getTimerCount()).toBe(1);
    a.unsub();
    expect(vi.getTimerCount()).toBe(1);
    b.unsub();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-checks on wake, since a sleeping device never fires the midnight timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 22, 0));
    const { seen, unsub } = watch();
    // Clock moves on without the timer firing, as after a suspend.
    vi.setSystemTime(new Date(2026, 9, 4, 8, 0));

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual(['2026-10-02']);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual(['2026-10-02', '2026-10-04']);
    // A same-day re-check emits nothing.
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('resume'));
    expect(seen).toEqual(['2026-10-02', '2026-10-04']);
    expect(vi.getTimerCount()).toBe(1);
    unsub();

    // Unsubscribed: no listener left behind to keep checking.
    vi.setSystemTime(new Date(2026, 9, 9, 8, 0));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual(['2026-10-02', '2026-10-04']);
  });

  it('onNewDay skips the current day and fires on each change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 23, 0));
    const fn = vi.fn();
    const unsub = onNewDay(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3600_000 + 100);
    expect(fn).toHaveBeenCalledExactlyOnceWith('2026-10-03');
    unsub();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses calendar midnight across DST changes, not a fixed 24 hours', () => {
    process.env.TZ = 'Europe/Berlin';
    // 29 Mar 2026: clocks go 02:00 -> 03:00, a 23-hour day.
    expect(msUntilNextLocalMidnight(new Date(2026, 2, 29, 0, 30))).toBe(22.5 * 3600_000);
    // 25 Oct 2026: clocks go 03:00 -> 02:00, a 25-hour day.
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 25, 0, 30))).toBe(24.5 * 3600_000);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 28, 23, 59));
    const { seen, unsub } = watch();
    vi.advanceTimersByTime(60_100);
    expect(seen).toEqual(['2026-03-28', '2026-03-29']);
    // 23 real hours later it is already the 30th.
    vi.advanceTimersByTime(23 * 3600_000);
    expect(seen).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect(get(today)).toBe('2026-03-30');
    unsub();
  });
});
