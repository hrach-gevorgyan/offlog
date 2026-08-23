import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

import CustomSelect from '../src/lib/CustomSelect.svelte';

// A pure presentational primitive: no db/store imports, so nothing to mock.
// What matters is the value it emits and that the keyboard path can reach
// every option without a mouse.

const OPTIONS = [
  { value: 'p1', label: 'Low' },
  { value: 'p2', label: 'Normal' },
  { value: 'p3', label: 'High' },
];

const GROUPED = [
  { value: 'a', label: 'Alpha', group: 'Work' },
  { value: 'b', label: 'Beta', group: 'Home' },
  { value: 'c', label: 'Gamma', group: 'Work' },
];

const trigger = (c: HTMLElement) => c.querySelector('.cs-trigger') as HTMLButtonElement;
const panel = (c: HTMLElement) => c.querySelector('.cs-panel') as HTMLDivElement | null;
// The panel's outro transition leaves the element mounted under jsdom's
// stubbed Element.animate, so "closed" is read off the trigger's
// aria-expanded rather than the panel's presence.
const isOpen = (c: HTMLElement) => trigger(c).getAttribute('aria-expanded') === 'true';
const optionEls = (c: HTMLElement) => [...c.querySelectorAll('.cs-option')] as HTMLButtonElement[];
const highlightedEl = (c: HTMLElement) => c.querySelector('.cs-option.highlighted') as HTMLButtonElement | null;

async function openWithMouse(c: HTMLElement) {
  await fireEvent.click(trigger(c));
  await waitFor(() => { if (!isOpen(c)) throw new Error('panel did not open'); });
  return panel(c)!;
}

afterEach(cleanup);

describe('CustomSelect selection', () => {
  it('emits the option value, not its label', async () => {
    const change = vi.fn();
    const { container } = render(CustomSelect, { props: { options: OPTIONS, value: 'p2' }, events: { change } } as any);

    await openWithMouse(container);
    await fireEvent.click(optionEls(container)[2]);

    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][0].detail).toBe('p3');
  });

  it('shows the selected option\'s label, and the placeholder when nothing matches', async () => {
    const { container } = render(CustomSelect, { options: OPTIONS, value: 'p2' });
    expect(container.querySelector('.cs-value')!.textContent).toBe('Normal');

    cleanup();
    const { container: c2 } = render(CustomSelect, { options: OPTIONS, value: '', placeholder: 'Pick one…' });
    expect(c2.querySelector('.cs-value')!.textContent).toBe('Pick one…');
  });

  it('closes the panel after choosing', async () => {
    const { container } = render(CustomSelect, { options: OPTIONS, value: 'p1' });
    await openWithMouse(container);
    await fireEvent.click(optionEls(container)[1]);
    await waitFor(() => { if (isOpen(container)) throw new Error('panel stayed open'); });
  });
});

describe('CustomSelect keyboard', () => {
  it('opens from the trigger on ArrowDown, Enter and Space', async () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', ' ']) {
      const { container } = render(CustomSelect, { options: OPTIONS, value: 'p1' });
      await fireEvent.keyDown(trigger(container), { key });
      await waitFor(() => { if (!isOpen(container)) throw new Error(`${key} did not open the panel`); });
      cleanup();
    }
  });

  // Focus lands on the panel, not the trigger — onPanelKey is wired to the
  // panel, so a mouse-opened select must still answer the arrow keys.
  it('arrows move the highlight from the current value and Enter picks it', async () => {
    const change = vi.fn();
    const { container } = render(CustomSelect, { props: { options: OPTIONS, value: 'p1' }, events: { change } } as any);

    const p = await openWithMouse(container);
    expect(highlightedEl(container)!.textContent).toBe('Low');

    await fireEvent.keyDown(p, { key: 'ArrowDown' });
    await fireEvent.keyDown(p, { key: 'ArrowDown' });
    expect(highlightedEl(container)!.textContent).toBe('High');

    await fireEvent.keyDown(p, { key: 'ArrowUp' });
    await fireEvent.keyDown(p, { key: 'Enter' });

    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][0].detail).toBe('p2');
  });

  it('clamps the highlight at both ends instead of wrapping past the list', async () => {
    const { container } = render(CustomSelect, { options: OPTIONS, value: 'p1' });
    const p = await openWithMouse(container);

    await fireEvent.keyDown(p, { key: 'ArrowUp' });
    expect(highlightedEl(container)!.textContent).toBe('Low');

    for (let i = 0; i < 5; i++) await fireEvent.keyDown(p, { key: 'ArrowDown' });
    expect(highlightedEl(container)!.textContent).toBe('High');
  });

  it('Escape closes without emitting a change', async () => {
    const change = vi.fn();
    const { container } = render(CustomSelect, { props: { options: OPTIONS, value: 'p1' }, events: { change } } as any);

    const p = await openWithMouse(container);
    await fireEvent.keyDown(p, { key: 'Escape' });

    await waitFor(() => { if (isOpen(container)) throw new Error('Escape left the panel open'); });
    expect(change).not.toHaveBeenCalled();
  });

  // Escape must not also close a parent modal the select was opened inside.
  it('Escape stops propagation to the window', async () => {
    let reachedWindow = false;
    const onWindow = () => { reachedWindow = true; };
    window.addEventListener('keydown', onWindow);
    try {
      const { container } = render(CustomSelect, { options: OPTIONS, value: 'p1' });
      const p = await openWithMouse(container);
      await fireEvent.keyDown(p, { key: 'Escape' });
      expect(reachedWindow).toBe(false);
    } finally {
      window.removeEventListener('keydown', onWindow);
    }
  });
});

describe('CustomSelect disabled', () => {
  it('does not open', async () => {
    const { container } = render(CustomSelect, { options: OPTIONS, value: 'p1', disabled: true });

    await fireEvent.click(trigger(container));
    await fireEvent.keyDown(trigger(container), { key: 'ArrowDown' });

    expect(isOpen(container)).toBe(false);
    expect(panel(container)).toBeNull();
  });
});

describe('CustomSelect grouping', () => {
  // Options carrying the same `group` collapse under one label even when
  // they aren't adjacent in the source array, and the highlight index still
  // refers to the flat options array, not the regrouped order.
  it('renders one label per group and keeps highlight indices flat', async () => {
    const change = vi.fn();
    const { container } = render(CustomSelect, { props: { options: GROUPED, value: 'a' }, events: { change } } as any);

    const p = await openWithMouse(container);
    const labels = [...container.querySelectorAll('.cs-group-label')].map(e => e.textContent);
    expect(labels).toEqual(['Work', 'Home']);
    expect(optionEls(container).map(e => e.textContent)).toEqual(['Alpha', 'Gamma', 'Beta']);

    // options[1] is 'b'/Beta in the flat array, even though Gamma is
    // rendered second.
    await fireEvent.keyDown(p, { key: 'ArrowDown' });
    await fireEvent.keyDown(p, { key: 'Enter' });
    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][0].detail).toBe('b');
  });

  it('omits the label for ungrouped options', async () => {
    const { container } = render(CustomSelect, { options: OPTIONS, value: 'p1' });
    await openWithMouse(container);
    expect(container.querySelectorAll('.cs-group-label').length).toBe(0);
  });
});
