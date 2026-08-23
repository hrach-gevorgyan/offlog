import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// The 12h/24h setting is the only thing TimePicker reads from config, and it
// decides both the dropdown layout and how a picked hour maps back onto the
// 24h value it emits.
const getTimeFormat24h = vi.fn(() => true);
vi.mock('../src/config', () => ({
  getTimeFormat24h: () => getTimeFormat24h(),
}));

import TimePicker from '../src/lib/TimePicker.svelte';

const selects = (c: HTMLElement) => [...c.querySelectorAll('.custom-select')] as HTMLElement[];
const triggerText = (c: HTMLElement) =>
  selects(c).map(s => s.querySelector('.cs-value')!.textContent);

// Opens the nth dropdown and clicks the option with the given label.
async function pick(c: HTMLElement, which: number, label: string) {
  const sel = selects(c)[which];
  await fireEvent.click(sel.querySelector('.cs-trigger')!);
  await waitFor(() => { if (!sel.querySelector('.cs-panel')) throw new Error('panel did not open'); });
  const opt = [...sel.querySelectorAll('.cs-option')].find(o => o.textContent === label);
  if (!opt) throw new Error(`no option labelled ${label}`);
  await fireEvent.click(opt);
}

function renderPicker(value: string) {
  const change = vi.fn();
  const utils = render(TimePicker, { props: { value }, events: { change } } as any);
  return { change, ...utils };
}

const emitted = (change: ReturnType<typeof vi.fn>) => change.mock.calls.map(c => c[0].detail);

beforeEach(() => { vi.clearAllMocks(); getTimeFormat24h.mockReturnValue(true); });
afterEach(cleanup);

describe('TimePicker 24h mode', () => {
  it('shows two zero-padded dropdowns', () => {
    const { container } = renderPicker('09:05');
    expect(triggerText(container)).toEqual(['09', '05']);
  });

  it('emits HH:MM when the hour changes, keeping the minute', async () => {
    const { container, change } = renderPicker('09:05');
    await pick(container, 0, '17');
    expect(emitted(change)).toEqual(['17:05']);
  });

  it('emits HH:MM when the minute changes, keeping the hour padded', async () => {
    const { container, change } = renderPicker('09:05');
    await pick(container, 1, '42');
    expect(emitted(change)).toEqual(['09:42']);
  });

  it('offers all 24 hours and all 60 minutes', async () => {
    const { container } = renderPicker('09:05');
    await fireEvent.click(selects(container)[0].querySelector('.cs-trigger')!);
    expect(selects(container)[0].querySelectorAll('.cs-option').length).toBe(24);
    await fireEvent.click(selects(container)[1].querySelector('.cs-trigger')!);
    expect(selects(container)[1].querySelectorAll('.cs-option').length).toBe(60);
  });
});

describe('TimePicker 12h mode', () => {
  beforeEach(() => getTimeFormat24h.mockReturnValue(false));

  it('displays an afternoon time as an unpadded 12h hour plus PM', () => {
    const { container } = renderPicker('13:45');
    expect(triggerText(container)).toEqual(['1', '45', 'PM']);
  });

  it('displays midnight as 12 AM and noon as 12 PM', () => {
    const { container } = renderPicker('00:30');
    expect(triggerText(container)).toEqual(['12', '30', 'AM']);
    cleanup();
    const { container: c2 } = renderPicker('12:30');
    expect(triggerText(c2)).toEqual(['12', '30', 'PM']);
  });

  it('lists hours in clock order starting at 12', async () => {
    const { container } = renderPicker('13:45');
    await fireEvent.click(selects(container)[0].querySelector('.cs-trigger')!);
    const labels = [...selects(container)[0].querySelectorAll('.cs-option')].map(o => o.textContent);
    expect(labels).toEqual(['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  });

  it('still emits a 24h value when a PM hour is picked', async () => {
    const { container, change } = renderPicker('13:45');
    await pick(container, 0, '7');
    expect(emitted(change)).toEqual(['19:45']);
  });

  // 12 is the wrap case in both directions: 12 AM is hour 0, 12 PM is 12.
  it('maps 12 AM to 00 and 12 PM to 12', async () => {
    const { container, change } = renderPicker('05:00');
    await pick(container, 0, '12');
    expect(emitted(change)).toEqual(['00:00']);

    cleanup();
    const { container: c2, change: change2 } = renderPicker('17:00');
    await pick(c2, 0, '12');
    expect(emitted(change2)).toEqual(['12:00']);
  });

  it('re-maps the current hour when only the AM/PM toggle changes', async () => {
    const { container, change } = renderPicker('09:15');
    await pick(container, 2, 'PM');
    expect(emitted(change)).toEqual(['21:15']);

    cleanup();
    const { container: c2, change: change2 } = renderPicker('21:15');
    await pick(c2, 2, 'AM');
    expect(emitted(change2)).toEqual(['09:15']);
  });

  it('emits a padded 24h hour when the minute changes on a 12h display', async () => {
    const { container, change } = renderPicker('05:15');
    await pick(container, 1, '00');
    expect(emitted(change)).toEqual(['05:00']);
  });
});

describe('TimePicker disabled', () => {
  it('forwards disabled to every dropdown', () => {
    const { container } = render(TimePicker, { value: '09:00', disabled: true });
    const triggers = [...container.querySelectorAll('.cs-trigger')] as HTMLButtonElement[];
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers.every(t => t.disabled)).toBe(true);
  });
});
