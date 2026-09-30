import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { waitFor } from '@testing-library/svelte';
import { tab, stack, arrival, push, back, switchTab, backAtRoot } from '../src/lib/phone/nav';
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
});

describe('phone formatting', () => {
  const today = '2026-09-30';
  it('duePill: late, today, tomorrow, weekday, date', () => {
    expect(duePill('2026-09-29', false, today)).toEqual({ text: '1 day late', tone: 'late' });
    expect(duePill('2026-09-27', false, today)).toEqual({ text: '3 days late', tone: 'late' });
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
  it('shortDate', () => { expect(shortDate('2026-10-01')).toBe('Thu 1 Oct'); });
});
