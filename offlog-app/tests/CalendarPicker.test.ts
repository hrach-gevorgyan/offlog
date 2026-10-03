import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// A non-UTC zone, set before any Date is constructed: the picker emits bare
// 'YYYY-MM-DD' strings built from local getFullYear/getMonth/getDate, and a
// UTC-based formatter would only drift on a machine that isn't on UTC.
vi.hoisted(() => { process.env.TZ = 'America/Los_Angeles'; });

const cfg = vi.hoisted(() => ({ monday: true }));
vi.mock('../src/config', () => ({
  getTimeFormat24h: () => true,
  getWeekStartsMonday: () => cfg.monday,
  getDefaultReminderTime: () => '10:00',
}));

import CalendarPicker from '../src/lib/CalendarPicker.svelte';

// Local Sunday 2026-03-15 22:30, which is already 2026-03-16 in UTC.
const NOW = new Date('2026-03-16T05:30:00Z');

const trigger = (c: HTMLElement) => c.querySelector('.cal-trigger') as HTMLButtonElement;
const popover = (c: HTMLElement) => c.querySelector('.cal-popover') as HTMLDivElement | null;
// The popover's outro leaves the element mounted under jsdom's stubbed
// Element.animate, so "closed" is read off the trigger's aria-expanded rather
// than the popover's presence -- same reasoning as CustomSelect.test.ts.
const isOpen = (c: HTMLElement) =>
  (c.querySelector('.cal-trigger') as HTMLButtonElement).getAttribute('aria-expanded') === 'true';
const monthLabel = (c: HTMLElement) => c.querySelector('.cal-month-label')!.textContent;
const dayEls = (c: HTMLElement) => [...c.querySelectorAll('.cal-day')] as HTMLButtonElement[];
const chip = (c: HTMLElement, label: string) => {
  const el = [...c.querySelectorAll('.cal-chip, .cal-time')].find(b => b.textContent?.trim() === label);
  if (!el) throw new Error(`no chip ${label}`);
  return el;
};
const day = (c: HTMLElement, n: string) => {
  const el = dayEls(c).find(d => d.textContent === n);
  if (!el) throw new Error(`no day cell ${n}`);
  return el;
};
const footerBtn = (c: HTMLElement, label: string) => {
  const el = [...c.querySelectorAll('.cal-footer-btn')].find(b => b.textContent?.trim() === label);
  if (!el) throw new Error(`no footer button ${label}`);
  return el;
};

function renderPicker(props: Record<string, unknown>) {
  const change = vi.fn();
  const utils = render(CalendarPicker, { props, events: { change } } as any);
  return { change, ...utils };
}

const emitted = (change: ReturnType<typeof vi.fn>) => change.mock.calls.map(c => c[0].detail);

async function open(c: HTMLElement) {
  await fireEvent.click(trigger(c));
  await waitFor(() => { if (!popover(c)) throw new Error('popover did not open'); });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Only Date is faked: faking the timer queue too makes waitFor's polling
  // race the component's own tick()-driven updates.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('CalendarPicker date emission', () => {
  it('emits the clicked day as a local YYYY-MM-DD string', async () => {
    const { container, change } = renderPicker({ value: '2026-03-15' });
    await open(container);
    await fireEvent.click(day(container, '1'));
    expect(emitted(change)).toEqual(['2026-03-01']);
  });

  // The clock is deliberately on a day that has already rolled over in UTC:
  // "Today" must be the local date, not toISOString()'s.
  it('the Today chip emits the local date even when UTC is already on the next day', async () => {
    const { container, change } = renderPicker({ value: '' });
    await open(container);
    await fireEvent.click(chip(container, 'Today'));
    expect(emitted(change)).toEqual(['2026-03-15']);
    expect(isOpen(container)).toBe(false);
  });

  it('shortcut chips: Tomorrow, Next Monday and In a week, the picked one marked', async () => {
    const { container, change } = renderPicker({ value: '2026-03-16' });
    await open(container);
    expect([...container.querySelectorAll('.cal-chip')].map(b => b.textContent?.trim())).toEqual(['Today', 'Tomorrow', 'In a week']);
    expect(container.querySelector('.cal-chip.on')!.textContent).toBe('Tomorrow');
    await fireEvent.click(chip(container, 'In a week'));
    expect(emitted(change)).toEqual(['2026-03-22']);
  });

  it('emits an empty string when cleared', async () => {
    const { container, change } = renderPicker({ value: '2026-03-15' });
    await open(container);
    await fireEvent.click(footerBtn(container, 'Clear'));
    expect(emitted(change)).toEqual(['']);
    expect(isOpen(container)).toBe(false);
  });

  it('leaves its shortcut chips out when the parent has its own', async () => {
    const { container } = renderPicker({ value: '', shortcuts: false });
    await open(container);
    expect(container.querySelector('.cal-chips')).toBeNull();
  });

  it('offers no Clear button when there is nothing to clear', async () => {
    const { container } = renderPicker({ value: '' });
    await open(container);
    expect(container.querySelectorAll('.cal-footer-btn')).toHaveLength(0);
  });

  it('closes on pick in date-only mode', async () => {
    const { container } = renderPicker({ value: '2026-03-15' });
    await open(container);
    await fireEvent.click(day(container, '2'));
    expect(isOpen(container)).toBe(false);
  });
});

describe('CalendarPicker with time', () => {
  it('emits YYYY-MM-DDTHH:mm carrying the existing time through a date pick', async () => {
    const { container, change } = renderPicker({ value: '2026-03-15T14:30', withTime: true });
    await open(container);
    await fireEvent.click(day(container, '20'));
    expect(emitted(change)).toEqual(['2026-03-20T14:30']);
  });

  // Picking a time is a second step, so the popover has to survive the date
  // click that precedes it.
  it('stays open after a date pick', async () => {
    const { container } = renderPicker({ value: '2026-03-15T14:30', withTime: true });
    await open(container);
    await fireEvent.click(day(container, '20'));
    expect(isOpen(container)).toBe(true);
  });

  it('keeps the selected date when only the time changes; an uncommon time opens the time box', async () => {
    const { container, change } = renderPicker({ value: '2026-03-15T14:30', withTime: true });
    await open(container);
    expect(container.querySelector('.cal-time.on')!.getAttribute('aria-label')).toBe('Another time');
    const hourSelect = container.querySelector('.cal-time-box .custom-select') as HTMLElement;
    await fireEvent.click(hourSelect.querySelector('.cs-trigger')!);
    const opt = [...hourSelect.querySelectorAll('.cs-option')].find(o => o.textContent === '08')!;
    await fireEvent.click(opt);
    expect(emitted(change)).toEqual(['2026-03-15T08:30']);
  });

  it('falls back to today when a time is picked with no date selected', async () => {
    const { container, change } = renderPicker({ value: '', withTime: true });
    await open(container);
    await fireEvent.click(chip(container, '13:00'));
    expect(emitted(change)).toEqual(['2026-03-15T13:00']);
  });

  it('starts a new reminder at the default time, offers common times, and Done closes', async () => {
    const { container, change } = renderPicker({ value: '', withTime: true });
    await open(container);
    expect([...container.querySelectorAll('.cal-time')].map(b => b.textContent?.trim())).toEqual(['09:00', '10:00', '13:00', '18:00', '']);
    expect(container.querySelector('.cal-time.on')!.textContent).toBe('10:00');
    expect(container.querySelector('.cal-time-box')).toBeNull();
    await fireEvent.click(day(container, '20'));
    expect(emitted(change)).toEqual(['2026-03-20T10:00']);
    await fireEvent.click(container.querySelector('[aria-label="Another time"]')!);
    expect(container.querySelector('.cal-time-box .custom-select')).toBeTruthy();
    await fireEvent.click(footerBtn(container, 'Done'));
    expect(isOpen(container)).toBe(false);
  });
});

describe('CalendarPicker month grid', () => {
  it('opens on the selected date\'s month, not the current one', async () => {
    const { container } = renderPicker({ value: '2026-07-04' });
    await open(container);
    expect(monthLabel(container)).toBe('July 2026');
  });

  it('opens on the current month when nothing is selected', async () => {
    const { container } = renderPicker({ value: '' });
    await open(container);
    expect(monthLabel(container)).toBe('March 2026');
  });

  // Monday-first: 2026-03-01 is a Sunday, so six blanks precede the 1st and
  // the grid holds all 31 days.
  it('lays the month out Monday-first with the right leading offset', async () => {
    const { container } = renderPicker({ value: '2026-03-15' });
    await open(container);
    expect([...container.querySelectorAll('.cal-dow span')].map(s => s.textContent))
      .toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);

    const cells = [...container.querySelectorAll('.cal-grid > *')];
    expect(cells.findIndex(c => c.textContent === '1')).toBe(6);
    expect(dayEls(container).length).toBe(31);
    expect(cells.length % 7).toBe(0);
  });

  it('steps months and wraps the year in both directions', async () => {
    const { container } = renderPicker({ value: '2026-01-10' });
    await open(container);
    expect(monthLabel(container)).toBe('January 2026');

    await fireEvent.click(container.querySelector('[aria-label="Previous month"]')!);
    expect(monthLabel(container)).toBe('December 2025');

    for (let i = 0; i < 13; i++) await fireEvent.click(container.querySelector('[aria-label="Next month"]')!);
    expect(monthLabel(container)).toBe('January 2027');
  });

  it('starts the week on Sunday when that is the setting', async () => {
    cfg.monday = false;
    try {
      const { container } = renderPicker({ value: '2026-03-15' });
      await open(container);
      expect(container.querySelector('.cal-dow span')!.textContent).toBe('Su');
      // 2026-03-01 is a Sunday: no blanks before it.
      expect([...container.querySelectorAll('.cal-grid > *')][0].textContent).toBe('1');
    } finally { cfg.monday = true; }
  });

  it('marks today and the selected day', async () => {
    const { container } = renderPicker({ value: '2026-03-20' });
    await open(container);
    expect(container.querySelector('.cal-day.today')!.textContent).toBe('15');
    expect(container.querySelector('.cal-day.selected')!.textContent).toBe('20');
  });
});

describe('CalendarPicker open/close', () => {
  it('closes on Escape', async () => {
    const { container } = renderPicker({ value: '2026-03-15' });
    await open(container);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(isOpen(container)).toBe(false);
  });

  it('closes on a click outside the field', async () => {
    const { container } = renderPicker({ value: '2026-03-15' });
    await open(container);
    await fireEvent.click(document.body);
    await waitFor(() => { if (isOpen(container)) throw new Error('outside click left it open'); });
  });

  it('does not open when disabled', async () => {
    const { container } = renderPicker({ value: '2026-03-15', disabled: true });
    await fireEvent.click(trigger(container));
    expect(isOpen(container)).toBe(false);
  });

  it('shows the placeholder until a date is set', () => {
    const { container } = renderPicker({ value: '', placeholder: 'No due date' });
    expect(trigger(container).textContent!.trim()).toBe('No due date');
  });

  it('labels the date, and the time when it has one', () => {
    expect(trigger(renderPicker({ value: '2026-03-15' }).container).textContent!.trim()).toBe('Mar 15, 2026');
    cleanup();
    expect(trigger(renderPicker({ value: '2026-03-15T09:30', withTime: true }).container).textContent!.trim()).toBe('Mar 15, 2026, 09:30');
  });
});
