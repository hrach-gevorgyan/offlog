import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, SpaceDoc, TaskDoc } from '../src/lib/types';

// The Daily Brief reads Focus's lock, which is keyed by today's date, and
// the overdue rows render a date label — both pinned to a fixed clock.
const NOW = new Date('2026-03-11T10:00:00');
const TODAY = '2026-03-11';
const LOCK_KEY = 'offlog_focus_lock';

const getDashboardData = vi.fn();
const getStorageBreakdown = vi.fn().mockResolvedValue({ archivedTasks: 0 });
const getTaskById = vi.fn().mockResolvedValue(null);
vi.mock('../src/lib/db', () => ({
  getDashboardData: (...a: unknown[]) => getDashboardData(...a),
  getStorageBreakdown: (...a: unknown[]) => getStorageBreakdown(...a),
  getTaskById: (...a: unknown[]) => getTaskById(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
  // reached only when a row is opened into CardDetail
  updateTask: vi.fn().mockResolvedValue(undefined),
  getAllTags: vi.fn().mockResolvedValue([]),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
  findTasksByTitleInProject: vi.fn().mockResolvedValue([]),
  findSimilarNotes: vi.fn().mockResolvedValue([]),
  getRelatedTasks: vi.fn().mockResolvedValue([]),
  searchTasksForLinking: vi.fn().mockResolvedValue([]),
  linkRelatedTask: vi.fn().mockResolvedValue(undefined),
  unlinkRelatedTask: vi.fn().mockResolvedValue(undefined),
  getBlockingTasks: vi.fn().mockResolvedValue([]),
  linkBlockedBy: vi.fn().mockResolvedValue(undefined),
  unlinkBlockedBy: vi.fn().mockResolvedValue(undefined),
  isBlockerResolved: vi.fn().mockReturnValue(false),
  archiveTask: vi.fn().mockResolvedValue(undefined),
  duplicateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
}));

// The factory is hoisted above every const in this file, so the store is
// created inside it and imported back below rather than closed over.
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(),
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    projects: w([]),
    modalOpen: w(false),
  };
});

vi.mock('../src/config', () => ({
  getWeekStartsMonday: () => true,
  getDefaultReminderTime: () => '09:00',
  getTimeFormat24h: () => true,
  isNativePlatform: () => false,
  isTauri: () => false,
  isHapticsEnabled: () => false,
}));

vi.mock('../src/lib/notifications', () => ({
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

vi.mock('../src/lib/confirm', () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));

import DashboardView from '../src/lib/DashboardView.svelte';

const COLUMNS = [
  { id: 'col:todo', name: 'To do' },
  { id: 'col:done', name: 'Done' },
];

function mkProject(extra: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0, columns: COLUMNS, default_view: 'list',
    updated_at: '2026-01-01T00:00:00.000Z', source: 'PC', ...extra,
  };
}

function mkTask(id: string, extra: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: id, type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Task ' + id, body: '', priority: 2,
    due_date: null, reminder_at: null, tags: [], position: 100, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'PC', ...extra,
  };
}

type Data = Awaited<ReturnType<typeof import('../src/lib/db')['getDashboardData']>>;

function mkData(extra: Partial<Data> = {}): Data {
  const allProjects = [mkProject()];
  return {
    allProjects, allSpaces: [] as SpaceDoc[],
    byProject: { 'project:1': { total: 0, pinned: 0, overdue: 0, lastColId: 'col:done' } },
    pinnedTasks: [], overdueTasks: [], todayTasks: [],
    projCache: { 'project:1': 'Test Project' },
    totalTasks: 0, completedLast7Days: 0, busiestProjectName: null,
    ...extra,
  } as Data;
}

const sectionTitles = (c: HTMLElement) =>
  [...c.querySelectorAll('.col-tasks .section-title')].map(e => e.textContent);
const sectionRows = (c: HTMLElement, name: string) => {
  const sec = [...c.querySelectorAll('.col-tasks .section')]
    .find(s => s.querySelector('.section-title')!.textContent === name)!;
  return { sec, titles: [...sec.querySelectorAll('.task-title')].map(e => e.textContent) };
};

async function renderDash(data: Data, events: Record<string, (e: CustomEvent) => void> = {}) {
  getDashboardData.mockResolvedValue(data);
  const r = render(DashboardView, { events } as any);
  await waitFor(() => { if (!r.container.querySelector('.dash-body')) throw new Error('not loaded'); });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getStorageBreakdown.mockResolvedValue({ archivedTasks: 0 });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('DashboardView daily brief', () => {
  it('invites a pick when no commitment exists for today', async () => {
    const { container } = await renderDash(mkData());

    expect(container.querySelector('.brief-empty')!.textContent)
      .toContain("You haven't picked today's 3 tasks yet");
    expect(getTaskById).not.toHaveBeenCalled();
  });

  // The positional rule: done means "sits in the project's LAST column",
  // there is no done flag to read.
  it('counts a locked task done only when it sits in the last status', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ date: TODAY, taskIds: ['task:a', 'task:b'] }));
    getTaskById.mockImplementation(async (id: string) => ({
      'task:a': mkTask('task:a', { title: 'Finished', column_id: 'col:done' }),
      'task:b': mkTask('task:b', { title: 'Open', column_id: 'col:todo' }),
    }[id] ?? null));
    const { container } = await renderDash(mkData());

    await waitFor(() =>
      expect(container.querySelector('.brief-count')!.textContent).toBe('1 of 2 done'));
    const marked = [...container.querySelectorAll('.brief-task')]
      .filter(e => e.classList.contains('done')).map(e => e.textContent);
    expect(marked).toEqual(['Finished']);
  });

  it('does not count a task done when its project is missing', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ date: TODAY, taskIds: ['task:a'] }));
    getTaskById.mockResolvedValue(mkTask('task:a', { project_id: 'project:gone', column_id: 'col:done' }));
    const { container } = await renderDash(mkData());

    await waitFor(() =>
      expect(container.querySelector('.brief-count')!.textContent).toBe('0 of 1 done'));
  });

  it('drops locked tasks deleted or archived elsewhere', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({
      date: TODAY, taskIds: ['task:a', 'task:b', 'task:c'],
    }));
    getTaskById.mockImplementation(async (id: string) => ({
      'task:a': mkTask('task:a', { title: 'Alive' }),
      'task:b': mkTask('task:b', { title: 'Gone', deleted: true }),
      'task:c': mkTask('task:c', { title: 'Filed', archived: true }),
    }[id] ?? null));
    const { container } = await renderDash(mkData());

    await waitFor(() =>
      expect(container.querySelector('.brief-count')!.textContent).toBe('0 of 1 done'));
    expect([...container.querySelectorAll('.brief-task')].map(e => e.textContent))
      .toEqual(['Alive']);
  });

  it('ignores a commitment left over from a previous day', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ date: '2026-03-10', taskIds: ['task:a'] }));
    const { container } = await renderDash(mkData());

    expect(container.querySelector('.brief-empty')).toBeTruthy();
    expect(getTaskById).not.toHaveBeenCalled();
  });

  it('opens Focus when the brief is clicked', async () => {
    const focus = vi.fn();
    const { container } = await renderDash(mkData(), { focus });

    await fireEvent.click(container.querySelector('.brief') as HTMLElement);

    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe('DashboardView task sections', () => {
  it('says nothing is due, pinned or overdue when all three are empty', async () => {
    const { container } = await renderDash(mkData());

    expect(container.querySelector('.all-good')!.textContent).toContain('All caught up');
    expect(sectionTitles(container)).toEqual([]);
  });

  it('renders Today, Pinned and Overdue with their project names', async () => {
    const { container } = await renderDash(mkData({
      todayTasks: [mkTask('task:t', { title: 'Due now', due_date: TODAY })],
      pinnedTasks: [mkTask('task:p', { title: 'Stuck up', pinned: true })],
      overdueTasks: [mkTask('task:o', { title: 'Late', due_date: '2026-03-01' })],
    }));

    expect(sectionTitles(container)).toEqual(['Today', 'Pinned', 'Overdue']);
    expect(sectionRows(container, 'Today').titles).toEqual(['Due now']);
    expect(sectionRows(container, 'Overdue').titles).toEqual(['Late']);
    expect(container.querySelector('.all-good')).toBeNull();
    expect(container.querySelector('.task-proj')!.textContent).toContain('Test Project');
  });

  it('caps Today at six rows and links the rest to Agenda', async () => {
    const todayTasks = Array.from({ length: 8 }, (_, i) =>
      mkTask('task:' + i, { title: 'T' + i, due_date: TODAY }));
    const agenda = vi.fn();
    const { container } = await renderDash(mkData({ todayTasks }), { agenda });

    const { sec, titles } = sectionRows(container, 'Today');
    expect(titles).toEqual(['T0', 'T1', 'T2', 'T3', 'T4', 'T5']);
    const viewAll = sec.querySelector('.view-all') as HTMLButtonElement;
    expect(viewAll.textContent).toContain('View all 8 in Agenda');

    await fireEvent.click(viewAll);
    expect(agenda).toHaveBeenCalledTimes(1);
  });

  it('shows no View all link when a section fits under the cap', async () => {
    const { container } = await renderDash(mkData({
      todayTasks: Array.from({ length: 6 }, (_, i) => mkTask('task:' + i, { due_date: TODAY })),
    }));

    expect(sectionRows(container, 'Today').sec.querySelector('.view-all')).toBeNull();
  });

  // Pinned has no cross-project view to link out to, so its View all
  // expands in place instead of dispatching.
  it('expands and collapses the pinned list in place', async () => {
    const pinnedTasks = Array.from({ length: 8 }, (_, i) =>
      mkTask('task:' + i, { title: 'P' + i, pinned: true }));
    const agenda = vi.fn();
    const { container } = await renderDash(mkData({ pinnedTasks }), { agenda });

    const viewAll = () => sectionRows(container, 'Pinned').sec.querySelector('.view-all') as HTMLButtonElement;
    expect(sectionRows(container, 'Pinned').titles).toHaveLength(6);
    expect(viewAll().textContent).toContain('View all 8');

    await fireEvent.click(viewAll());
    expect(sectionRows(container, 'Pinned').titles).toHaveLength(8);
    expect(viewAll().textContent).toContain('Show less');
    expect(agenda).not.toHaveBeenCalled();

    await fireEvent.click(viewAll());
    expect(sectionRows(container, 'Pinned').titles).toHaveLength(6);
  });
});

describe('DashboardView project cards', () => {
  it('shows each project\'s totals and opens it on click', async () => {
    const openProject = vi.fn();
    const { container } = await renderDash(mkData({
      byProject: { 'project:1': { total: 7, pinned: 2, overdue: 3, lastColId: 'col:done' } },
    }), { openProject: (e) => openProject(e.detail) });

    const card = container.querySelector('.proj-card') as HTMLElement;
    expect(card.querySelector('.task-count')!.textContent).toBe('7');
    expect(card.querySelector('.pinned-stat')!.textContent).toBe('2 pinned');
    expect(card.querySelector('.overdue-stat')!.textContent).toBe('3 overdue');

    await fireEvent.click(card);
    expect(openProject).toHaveBeenCalledWith('project:1');
  });

  it('omits the pinned and overdue stats when they are zero', async () => {
    const { container } = await renderDash(mkData());

    expect(container.querySelector('.pinned-stat')).toBeNull();
    expect(container.querySelector('.overdue-stat')).toBeNull();
  });

  it('prompts for a first project when there are none', async () => {
    const { container } = await renderDash(mkData({ allProjects: [], byProject: {} }));

    expect(container.querySelector('.no-projects')!.textContent).toContain('No projects yet');
    expect(container.querySelector('.proj-card')).toBeNull();
  });
});

describe('DashboardView summary strip', () => {
  it('pluralises the task/project counts and appends the archived count', async () => {
    getStorageBreakdown.mockResolvedValue({ archivedTasks: 4 });
    const { container } = await renderDash(mkData({ totalTasks: 1 }));

    await waitFor(() =>
      expect(container.querySelector('.dash-sub')!.textContent).toContain('4 archived'));
    expect(container.querySelector('.dash-sub')!.textContent)
      .toContain('1 active task across 1 project');
  });

  it('omits the archived count when nothing is archived', async () => {
    const { container } = await renderDash(mkData({ totalTasks: 2 }));

    expect(container.querySelector('.dash-sub')!.textContent).toContain('2 active tasks');
    expect(container.querySelector('.dash-sub')!.textContent).not.toContain('archived');
  });

  it('names the busiest project alongside the weekly completed count', async () => {
    const { container } = await renderDash(mkData({
      completedLast7Days: 5, busiestProjectName: 'Test Project',
    }));

    expect(container.querySelector('.dash-week')!.textContent)
      .toContain('5 completed this past week');
    expect(container.querySelector('.dash-week')!.textContent).toContain('busiest: Test Project');
  });

  it('says so when nothing was completed in the past week', async () => {
    const { container } = await renderDash(mkData({ completedLast7Days: 0 }));

    expect(container.querySelector('.dash-week')!.textContent)
      .toContain('Nothing completed in the past week yet');
  });
});
