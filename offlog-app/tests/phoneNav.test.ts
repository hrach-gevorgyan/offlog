import { describe, expect, it, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { waitFor } from '@testing-library/svelte';
import { tab, stack, arrival, push, back, switchTab, backAtRoot, memo, navigate, showToast, toast, actions, takeQueuedAdd, popScreen } from '../src/lib/phone/nav';
import { closeOnBack } from '../src/lib/modalStack';
import { duePill, greeting, shortDate } from '../src/lib/phone/format';

describe('phone navigation', () => {
  beforeEach(() => { switchTab('home'); });

  it('push adds a screen and back removes it through history', async () => {
    push({ k: 'project', id: 'project:a' });
    expect(get(stack).map(s => s.k)).toEqual(['home', 'project']);
    expect(get(arrival)).toBe('push');
    back();
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home']));
    expect(get(arrival)).toBe('pop');
  });

  it('hardware back (a history pop) closes only the top screen', async () => {
    push({ k: 'late' });
    push({ k: 'project', id: 'project:b' });
    history.back();
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home', 'late']));
  });

  it('switching tabs starts the new tab at its root', () => {
    push({ k: 'focus' });
    switchTab('agenda');
    expect(get(tab)).toBe('agenda');
    expect(get(stack).map(s => s.k)).toEqual(['agenda']);
    expect(get(arrival)).toBe('tab');
  });

  it('tapping the current tab returns it to its root without a tab transition', () => {
    push({ k: 'pinned' });
    switchTab('home');
    expect(get(stack).map(s => s.k)).toEqual(['home']);
    expect(get(arrival)).toBe('none');
  });

  it('back at a non-Home root goes Home; at Home it lets the app exit', () => {
    switchTab('search');
    expect(backAtRoot()).toBe(true);
    expect(get(tab)).toBe('home');
    expect(backAtRoot()).toBe(false);
  });

  it('memo keeps a screen state on its stack entry across a rebuild', () => {
    push({ k: 'project', id: 'project:m' });
    const a = memo({ ci: 0 });
    a.ci = 2;
    expect(memo({ ci: 0 }).ci).toBe(2); // the rebuilt screen reads it back
    push({ k: 'task', id: 'task:x' });
    expect(memo({ ci: 0 }).ci).toBe(0); // another entry has its own
  });

  it('navigate from deep in a stack waits for the unwind before pushing', async () => {
    push({ k: 'late' });
    push({ k: 'project', id: 'project:n' });
    navigate('home', { k: 'focus' });
    expect(get(stack).map(s => s.k)).toEqual(['home']); // not pushed yet
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home', 'focus']));
    // and the pushed screen survives the late popstate
    await new Promise(r => setTimeout(r, 50));
    expect(get(stack).map(s => s.k)).toEqual(['home', 'focus']);
  });

  it('the back arrow closes a layer above the screen first (e.g. select mode)', async () => {
    push({ k: 'project', id: 'project:s' });
    let layerOpen = true;
    closeOnBack(() => { layerOpen = false; });
    back();
    await waitFor(() => expect(layerOpen).toBe(false));
    await new Promise(r => setTimeout(r, 450)); // past modalStack's fallback window
    expect(get(stack).map(s => s.k)).toEqual(['home', 'project']);
  });

  it('popScreen leaves the screen and closes a layer above it in one step', async () => {
    push({ k: 'project', id: 'project:p' });
    let layerOpen = true;
    closeOnBack(() => { layerOpen = false; });
    popScreen();
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home']));
    expect(layerOpen).toBe(false);
  });

  it('a quick add asked for before the shell mounts is queued, once', () => {
    actions.quickAdd('2026-10-02');
    expect(takeQueuedAdd()).toEqual({ due: '2026-10-02' });
    expect(takeQueuedAdd()).toBeNull();
  });

  it('a second jump during the wait replaces the first and still survives the popstate', async () => {
    push({ k: 'late' });
    navigate('home', { k: 'focus' });
    navigate('home', { k: 'pinned' });
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home', 'pinned']));
    await new Promise(r => setTimeout(r, 450));
    expect(get(stack).map(s => s.k)).toEqual(['home', 'pinned']);
  });

  it('a tab switch while a jump waits on its popstate cancels the jump', async () => {
    push({ k: 'late' });
    navigate('home', { k: 'focus' });
    switchTab('agenda');
    await new Promise(r => setTimeout(r, 450)); // past navigate's fallback window
    expect(get(tab)).toBe('agenda');
    expect(get(stack).map(s => s.k)).toEqual(['agenda']);
  });

  it('navigate with nothing open pushes at once', () => {
    navigate('agenda', { k: 'focus' });
    expect(get(tab)).toBe('agenda');
    expect(get(stack).map(s => s.k)).toEqual(['agenda', 'focus']);
  });

  it('a newer snackbar is not cleared by the older timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    showToast('one');
    await vi.advanceTimersByTimeAsync(3000);
    showToast('two', () => {});
    await vi.advanceTimersByTimeAsync(1500);
    expect(get(toast)?.text).toBe('two');
    await vi.advanceTimersByTimeAsync(5000);
    expect(get(toast)).toBeNull();
    vi.useRealTimers();
  });
});

describe('phone formatting', () => {
  const today = '2026-09-30';
  it('duePill: late, today, tomorrow, weekday, date', () => {
    expect(duePill('2026-09-29', false, today)).toEqual({ text: '1 day overdue', tone: 'late' });
    expect(duePill('2026-09-27', false, today)).toEqual({ text: '3 days overdue', tone: 'late' });
    expect(duePill('2026-08-31', false, today)).toEqual({ text: '30 days overdue', tone: 'late' });
    expect(duePill('2026-08-30', false, today)).toEqual({ text: '30+ days overdue', tone: 'late' });
    expect(duePill('2026-09-30', false, today)).toEqual({ text: 'Today', tone: 'today' });
    expect(duePill('2026-10-01', false, today)).toEqual({ text: 'Tomorrow', tone: '' });
    expect(duePill('2026-10-03', false, today)).toEqual({ text: 'Sat', tone: '' });
    expect(duePill('2026-10-20', false, today)).toEqual({ text: 'Tue 20 Oct', tone: '' });
    expect(duePill(null, false, today)).toBeNull();
  });
  it('duePill: a finished task is never late', () => {
    expect(duePill('2026-09-20', true, today)).toEqual({ text: 'Sun 20 Sep', tone: '' });
  });
  it('greeting follows the hour', () => {
    expect(greeting(3)).toBe('Good night');
    expect(greeting(9)).toBe('Good morning');
    expect(greeting(14)).toBe('Good afternoon');
    expect(greeting(20)).toBe('Good evening');
  });
  it('shortDate names the year only when it is not this year', () => {
    const now = new Date('2026-10-01T12:00:00');
    expect(shortDate('2026-10-01', now)).toBe('Thu 1 Oct');
    expect(shortDate('2027-08-03', now)).toBe('Tue 3 Aug 2027');
  });
});

describe('phone shell: reselect and the + on scroll', () => {
  beforeEach(() => { switchTab('home'); });

  it('re-tapping the current tab at its root asks for scroll-to-top; with a screen pushed it pops instead', async () => {
    const { reselect } = await import('../src/lib/phone/nav');
    const n = get(reselect);
    switchTab('home');
    expect(get(reselect)).toBe(n + 1);
    push({ k: 'focus' });
    switchTab('home');
    expect(get(reselect)).toBe(n + 1);
    expect(get(stack).map(s => s.k)).toEqual(['home']);
    switchTab('today');
    expect(get(reselect)).toBe(n + 1);
  });

  it('the + hides after 120px of downward scroll and returns on any scroll up or at the end', async () => {
    const { fabScrollTracker } = await import('../src/lib/phone/fabScroll');
    let away = false;
    const t = fabScrollTracker(v => (away = v));
    const el = { scrollTop: 0, clientHeight: 500, scrollHeight: 2000 } as unknown as Element;
    const to = (y: number) => { (el as { scrollTop: number }).scrollTop = y; t.onScroll(el); };
    to(60); to(120);
    expect(away).toBe(false);
    to(130);
    expect(away).toBe(true);
    to(125);
    expect(away).toBe(false);
    to(400);
    expect(away).toBe(true);
    to(1500); // the end of the list
    expect(away).toBe(false);
    to(1500);
    t.reset();
    expect(away).toBe(false);
  });

  it('a horizontal scroller never moves the +', async () => {
    const { fabScrollTracker } = await import('../src/lib/phone/fabScroll');
    const set = vi.fn();
    const t = fabScrollTracker(set);
    t.onScroll({ scrollTop: 0, clientHeight: 40, scrollHeight: 40 } as unknown as Element);
    expect(set).not.toHaveBeenCalled();
  });

  it('a toast can carry a labelled action and stays up longer', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    showToast('Reminders may be a few minutes late', undefined, { label: 'Make exact', run });
    expect(get(toast)?.action?.label).toBe('Make exact');
    vi.advanceTimersByTime(4500);
    expect(get(toast)).not.toBeNull();
    vi.advanceTimersByTime(2000);
    expect(get(toast)).toBeNull();
    vi.useRealTimers();
  });
});
