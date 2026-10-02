import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

const getDashboardData = vi.fn();
vi.mock('../src/lib/db', () => ({
  getDashboardData: (...a: unknown[]) => getDashboardData(...a),
  getTaskById: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(),
    spaces: w([{ _id: 'space:w', name: 'Work', color: '#3b82f6', position: 0 }]),
    projects: w([{ _id: 'project:q', space_id: 'space:w', name: 'Q4 Sprint', position: 0, columns: [] }]),
  };
});

const markIn = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/lib/motion', async (orig) => {
  const m = await orig<typeof import('../src/lib/motion')>();
  return { ...m, markIn: (n: Element) => { markIn.calls++; return m.markIn(n); } };
});

// Home measures the hero with bind:clientHeight, which needs ResizeObserver (absent in jsdom).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

import Home from '../src/lib/phone/Home.svelte';
import { stack, switchTab, actions } from '../src/lib/phone/nav';
import { showError, spaces, projects } from '../src/lib/store';
import type { Writable } from 'svelte/store';

const data = {
  byProject: { 'project:q': { total: 9, open: 6, pinned: 2, overdue: 3, lastColId: 'col:done' } },
  todayOpenCount: 4, todayDoneCount: 2, completedLast7Days: 5, busiestProjectName: 'Q4 Sprint',
};

describe('phone Home', () => {
  beforeEach(() => {
    switchTab('home');
    getDashboardData.mockReset().mockResolvedValue(data);
    vi.mocked(showError).mockClear();
  });

  it('shows what is left today, late and pinned counts, and each project; late is said once above the fold', async () => {
    const { getByText, getAllByText, getByLabelText, container } = render(Home);
    await waitFor(() => expect(getByLabelText('Open Today: 4 left, 2 of 6 done, 3 overdue')).toBeTruthy());
    expect(getByText('Q4 Sprint')).toBeTruthy();
    expect(getAllByText('3 overdue')).toHaveLength(1); // the project row; the Overdue tile carries the total
    expect(container.querySelector('.hero .meta')).toBeNull();
    expect(container.querySelector('.tile b.late')?.textContent).toBe('3');
    expect(container.querySelector('.appbar small')?.textContent).toBe('4 left');
    expect(getByText('6')).toBeTruthy(); // open count badge
    expect(container.querySelector('.stat')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('5 finished this past week · busiest: Q4 Sprint');
  });

  it('the hero opens Today, tiles open their lists, a project row opens the project', async () => {
    const { getByLabelText, getByText } = render(Home);
    await waitFor(() => getByLabelText(/Open Today/));
    await fireEvent.click(getByLabelText(/Open Today/));
    expect(get(stack).at(-1)).toMatchObject({ k: 'today' });
    await fireEvent.click(getByText('Overdue'));
    expect(get(stack).at(-1)).toMatchObject({ k: 'late' });
    await fireEvent.click(getByText('Q4 Sprint'));
    expect(get(stack).at(-1)).toMatchObject({ k: 'project', id: 'project:q' });
  });

  it('the gear opens Settings', async () => {
    const spy = vi.spyOn(actions, 'openSettings').mockImplementation(() => {});
    const { getByLabelText } = render(Home);
    await fireEvent.click(getByLabelText('Settings'));
    expect(spy).toHaveBeenCalled();
  });

  it('a failed load surfaces an error', async () => {
    getDashboardData.mockRejectedValue(new Error('boom'));
    render(Home);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not load Home. Reopen the app to try again.'));
  });

  it('an empty day: plain words instead of zeros, no empty bar, quiet focus count, no 0 badges', async () => {
    getDashboardData.mockResolvedValue({ ...data, todayOpenCount: 0, todayDoneCount: 0, completedLast7Days: 0,
      byProject: { 'project:q': { total: 0, open: 0, pinned: 0, overdue: 0, lastColId: 'col:done' } } });
    const { getByText, queryByText, getByLabelText, container } = render(Home);
    await waitFor(() => expect(getByLabelText('Open Today: nothing due')).toBeTruthy());
    expect(container.querySelector('.hero')?.textContent).toContain('Nothing due today');
    expect(container.querySelector('.count')).toBeNull();
    expect(container.querySelector('.track')).toBeNull();
    expect(getByText('0/3')).toBeTruthy();
    expect(queryByText('Pick')).toBeNull();
    expect(container.querySelector('.p-group .p-n')).toBeNull(); // no "0" badge
  });

  it('spaces with projects first, Unsorted last; an empty space has a New project row, a full one a + by its name', async () => {
    const sp = spaces as unknown as Writable<unknown[]>, pr = projects as unknown as Writable<unknown[]>;
    const keepS = get(sp), keepP = get(pr);
    sp.set([
      { _id: 'space:unsorted', name: 'Unsorted', color: '#6b7280', position: 0 },
      { _id: 'space:w', name: 'Work', color: '#3b82f6', position: 1 },
      { _id: 'space:p', name: 'Personal', color: '#10b981', position: 2 },
    ]);
    pr.set([{ _id: 'project:q', space_id: 'space:w', name: 'Q4 Sprint', position: 0, columns: [] }]);
    const { container, queryAllByText, getByLabelText, queryByLabelText } = render(Home);
    const names = [...container.querySelectorAll('.p-sec > span:first-child')].map(e => e.textContent);
    expect(names).toEqual(['Work', 'Personal', 'Unsorted']);
    expect(queryAllByText('New project')).toHaveLength(2); // Personal and Unsorted are empty
    expect(getByLabelText('New project in Work')).toBeTruthy();
    expect(queryByLabelText('New project in Personal')).toBeNull();
    sp.set(keepS); pr.set(keepP);
  });

  it('a fresh install: the band invites the first task and opens quick add; the tiles stay', async () => {
    getDashboardData.mockResolvedValue({ ...data, totalTasks: 0, todayOpenCount: 0, todayDoneCount: 0, completedLast7Days: 0,
      byProject: { 'project:q': { total: 0, open: 0, pinned: 0, overdue: 0, lastColId: 'col:done' } } });
    const spy = vi.spyOn(actions, 'quickAdd').mockImplementation(() => {});
    const { getByText, container } = render(Home);
    await waitFor(() => expect(getByText('Add your first task')).toBeTruthy());
    expect(container.querySelector('.tiles')).not.toBeNull();
    expect(container.querySelector('.hero')?.textContent).not.toContain('Tap here');
    await fireEvent.click(getByText('Add your first task'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('band lines fade out before they reach the see-through top bar, and are whole at rest', async () => {
    // jsdom has no layout: give the band and its lines their real offsets.
    const tops: Record<string, number> = { hero: 0, hbody: 74, hi: 0, count: 33, meta: 94, track: 129 };
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return tops[this.classList[0]] ?? 0;
    });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelector('.hbody .count')).not.toBeNull());
    const scr = container.querySelector('.scr') as HTMLElement;
    const op = (c: string) => (container.querySelector('.hbody .' + c) as HTMLElement).style.opacity || '1';
    const scrollTo = async (y: number) => { scr.scrollTop = y; await fireEvent.scroll(scr); await new Promise(r => setTimeout(r, 40)); };
    await scrollTo(0);
    expect(op('hi')).toBe('1');
    await scrollTo(15); // greeting at 59: halfway through its fade
    expect(Number(op('hi'))).toBeCloseTo(0.5, 1);
    expect(op('count')).toBe('1');
    await scrollTo(40); // greeting at 34, under the title: gone
    expect(op('hi')).toBe('0');
    spy.mockRestore();
  });

  // Runs last: every earlier test mounted Home too.
  it('the mark entrance plays on the first Home of the launch only', async () => {
    const a = render(Home); a.unmount();
    const b = render(Home);
    await new Promise(r => setTimeout(r, 20));
    expect(b.container.querySelector('.markwrap')).not.toBeNull();
    expect(markIn.calls).toBe(1);
  });
});
