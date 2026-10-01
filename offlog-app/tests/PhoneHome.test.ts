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

  it('shows what is left today, done of total, late and pinned counts, and each project', async () => {
    const { getByText, getAllByText, getByLabelText, container } = render(Home);
    await waitFor(() => expect(getByLabelText('Open Today: 4 left, 2 of 6 done, 3 late')).toBeTruthy());
    expect(getByText('Q4 Sprint')).toBeTruthy();
    expect(getAllByText('3 late')).toHaveLength(2); // hero line and the project row
    expect(getByText('6')).toBeTruthy(); // open count badge
    expect(container.querySelector('.stat')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('5 finished this past week · busiest: Q4 Sprint');
  });

  it('the hero opens Today, tiles open their lists, a project row opens the project', async () => {
    const { getByLabelText, getByText } = render(Home);
    await waitFor(() => getByLabelText(/Open Today/));
    await fireEvent.click(getByLabelText(/Open Today/));
    expect(get(stack).at(-1)).toMatchObject({ k: 'today' });
    await fireEvent.click(getByText('Late'));
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
    await waitFor(() => expect(showError).toHaveBeenCalled());
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

  it('Unsorted is listed last; an empty space offers New project, a full one a + by its name', async () => {
    const sp = spaces as unknown as Writable<unknown[]>, pr = projects as unknown as Writable<unknown[]>;
    const keepS = get(sp), keepP = get(pr);
    sp.set([
      { _id: 'space:unsorted', name: 'Unsorted', color: '#6b7280', position: 0 },
      { _id: 'space:w', name: 'Work', color: '#3b82f6', position: 1 },
      { _id: 'space:p', name: 'Personal', color: '#10b981', position: 2 },
    ]);
    pr.set([{ _id: 'project:q', space_id: 'space:w', name: 'Q4 Sprint', position: 0, columns: [] }]);
    const { container, getAllByText, getByLabelText } = render(Home);
    const names = [...container.querySelectorAll('.p-sec > span:first-child')].map(e => e.textContent);
    expect(names).toEqual(['Work', 'Personal', 'Unsorted']);
    expect(getAllByText('New project')).toHaveLength(2); // Personal and Unsorted are empty
    expect(getByLabelText('New project in Work')).toBeTruthy();
    sp.set(keepS); pr.set(keepP);
  });
});
