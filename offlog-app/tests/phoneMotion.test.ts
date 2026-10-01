import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { sheetIn, sheetOut, collapseIn, collapseOut, axisIn, screenIn, screenOut } from '../src/lib/motion';
import { markLeaving, markReturning, leaves, returns } from '../src/lib/phone/rowMotion';
import Sheet from '../src/lib/phone/Sheet.svelte';

type Cfg = { duration?: number; delay?: number; css?: (t: number, u: number) => string };
const el = () => document.createElement('div');

describe('phone motion presets', () => {
  it('a sheet leaving after a drag continues from where the finger left it', () => {
    const node = el();
    Object.defineProperty(node, 'offsetHeight', { value: 300 });
    const out = sheetOut(node, { from: 120 }) as Cfg;
    expect(out.css!(1, 0)).toBe('transform: translateY(120px)');
    // Off screen at the end: its height plus the 40px shadow clearance.
    expect(out.css!(0, 1)).toBe('transform: translateY(340px)');
    expect((sheetIn(el()) as Cfg).css!(1, 0)).toBe('transform: translateY(0px)');
  });

  it('a row collapses only when asked to, after the check has filled', () => {
    expect((collapseOut(el(), { on: false }) as Cfg).duration).toBe(0);
    expect((collapseIn(el(), { on: false }) as Cfg).duration).toBe(0);
    const out = collapseOut(el(), { on: true }) as Cfg;
    expect(out.delay).toBeGreaterThan(0);
    expect(out.duration).toBeGreaterThan(0);
    expect(out.css!(0, 1)).toContain('height: 0px');
    expect(out.css!(0, 1)).toContain('opacity: 0');
    expect((collapseIn(el(), { on: true }) as Cfg).duration).toBeGreaterThan(0);
  });

  it('in-screen content enters from the side of travel', () => {
    expect((axisIn(el(), { dir: 1 }) as Cfg).css!(0, 1)).toContain('translateX(40px)');
    expect((axisIn(el(), { dir: -1 }) as Cfg).css!(0, 1)).toContain('translateX(-40px)');
  });

  it('screens move as a pair; going back, the leaving screen stays on top', () => {
    expect((screenOut(el(), { kind: 'pop' }) as Cfg).css!(0.5, 0.5)).toContain('z-index: 1');
    expect((screenOut(el(), { kind: 'push' }) as Cfg).duration).toBe((screenIn(el(), { kind: 'push' }) as Cfg).duration);
    expect((screenOut(el(), { kind: 'none' }) as Cfg).duration).toBe(0);
  });
});

describe('phone rowMotion', () => {
  afterEach(() => vi.useRealTimers());

  it('a mark is read once', () => {
    markLeaving('task:a');
    expect(leaves('task:a')).toBe(true);
    expect(leaves('task:a')).toBe(false);
    markReturning('task:a');
    expect(leaves('task:a')).toBe(false);
    expect(returns('task:a')).toBe(true);
  });

  it('a mark nobody read lapses', () => {
    vi.useFakeTimers();
    markLeaving('task:b');
    vi.advanceTimersByTime(5000);
    expect(leaves('task:b')).toBe(false);
  });
});

describe('phone Sheet drag', () => {
  const sheet = () => document.querySelector('.psheet') as HTMLElement;
  const grab = () => document.querySelector('.grab-zone') as HTMLElement;

  it('follows the finger with no transition, then glides back when let go short', async () => {
    const closed = vi.fn();
    render(Sheet, { props: { title: 'Sort by' }, events: { close: closed } } as any);
    await fireEvent.pointerDown(grab(), { clientY: 100 });
    await fireEvent.pointerMove(grab(), { clientY: 160 });
    expect(sheet().classList.contains('dragging')).toBe(true);
    expect(sheet().style.transform).toBe('translateY(60px)');
    await fireEvent.pointerUp(grab(), { clientY: 160 });
    // Released: the transition is back on, so clearing the offset glides.
    expect(sheet().classList.contains('dragging')).toBe(false);
    expect(sheet().style.transform).toBe('');
    await new Promise(r => setTimeout(r, 20));
    expect(sheet().inert).not.toBe(true);
    expect(closed).not.toHaveBeenCalled();
  });

  it('past the threshold it starts leaving from where it was dragged', async () => {
    render(Sheet, { props: { title: 'Sort by' } });
    await fireEvent.pointerDown(grab(), { clientY: 100 });
    await fireEvent.pointerMove(grab(), { clientY: 300 });
    await fireEvent.pointerUp(grab(), { clientY: 300 });
    // Svelte marks an element inert while its outro runs; the offset stays
    // put underneath, so the exit has no jump back to the top.
    await waitFor(() => expect(sheet().inert).toBe(true));
    expect(sheet().style.transform).toBe('translateY(200px)');
  });
});
