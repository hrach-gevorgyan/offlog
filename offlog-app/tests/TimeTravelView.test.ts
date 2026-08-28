import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

// Entries are grouped by *local* calendar day and the Today/Yesterday
// labels are computed at module init, so the clock is pinned.
const NOW = new Date('2026-03-11T10:00:00');

// Log timestamps are stored UTC; building them from local components keeps
// the expected day grouping independent of the runner's timezone.
const ts = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

const getRecentLogs = vi.fn().mockResolvedValue([]);
const getTaskById = vi.fn().mockResolvedValue(null);
const clearLogs = vi.fn().mockResolvedValue(undefined);
const subscribe = vi.fn().mockReturnValue(() => {});
vi.mock('../src/lib/db', () => ({
  getRecentLogs: (...a: unknown[]) => getRecentLogs(...a),
  getTaskById: (...a: unknown[]) => getTaskById(...a),
  clearLogs: (...a: unknown[]) => clearLogs(...a),
  subscribe: (...a: unknown[]) => subscribe(...a),
  // reached only when an entry is opened into CardDetail
  updateTask: vi.fn().mockResolvedValue(undefined),
  getAllTags: vi.fn().mockResolvedValue([]),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
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

// The real confirmAction resolves via <ConfirmDialog/> mounted in
// App.svelte's root — not present here, so its promise would hang forever.
const confirmAction = vi.fn().mockResolvedValue(true);
vi.mock('../src/lib/confirm', () => ({
  confirmAction: (...a: unknown[]) => confirmAction(...a),
}));

import { projects as projectsStore, showError } from '../src/lib/store';
import TimeTravelView from '../src/lib/TimeTravelView.svelte';

function mkProject(): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0, columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }],
    default_view: 'list', updated_at: '2026-01-01T00:00:00.000Z', source: 'PC',
  };
}

function mkTask(extra: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: 'task:1', type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'A task', body: '', priority: 2,
    due_date: null, reminder_at: null, tags: [], position: 100, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'PC', ...extra,
  };
}

function mkLog(id: string, extra: Record<string, unknown> = {}) {
  return {
    _id: id, type: 'log', action: 'update', ref: 'task:1', task_title: 'A task',
    ts: ts(2026, 3, 11), source: 'pc', ...extra,
  };
}

const dayLabels = (c: HTMLElement) =>
  [...c.querySelectorAll('.day-label')].map(e => e.textContent);
const daySummaries = (c: HTMLElement) =>
  [...c.querySelectorAll('.day-summary')].map(e => e.textContent);
const entries = (c: HTMLElement) => [...c.querySelectorAll('.entry')] as HTMLElement[];

// Older days are labelled through toLocaleDateString, so the expectation is
// derived the same way rather than hardcoding an en-US string.
const localDayLabel = (d: Date, withYear = false) =>
  d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
    year: withYear ? 'numeric' : undefined,
  });

async function renderTT(logs: unknown[], events: Record<string, () => void> = {}) {
  getRecentLogs.mockResolvedValue(logs);
  const r = render(TimeTravelView, { events } as any);
  if (logs.length) {
    await waitFor(() => { if (entries(r.container).length === 0) throw new Error('not loaded'); });
  } else {
    await waitFor(() => { if (!r.container.querySelector('.empty')) throw new Error('not loaded'); });
  }
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmAction.mockResolvedValue(true);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  (projectsStore as any).set([mkProject()]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('TimeTravelView day grouping', () => {
  it('groups entries by local calendar day, newest group first', async () => {
    const { container } = await renderTT([
      mkLog('log:1', { ts: ts(2026, 3, 11, 15) }),
      mkLog('log:2', { ts: ts(2026, 3, 11, 9) }),
      mkLog('log:3', { ts: ts(2026, 3, 10) }),
      mkLog('log:4', { ts: ts(2026, 3, 4) }),
    ]);

    expect(dayLabels(container))
      .toEqual(['Today', 'Yesterday', localDayLabel(new Date(2026, 2, 4))]);
    expect(container.querySelectorAll('.day-group')[0].querySelectorAll('.entry')).toHaveLength(2);
  });

  // Timestamps are UTC; slicing the ISO string instead of reading local
  // date parts would file a late local evening under the next day.
  it('files a late-evening entry under the local day it happened on', async () => {
    const { container } = await renderTT([mkLog('log:1', { ts: ts(2026, 3, 11, 23) })]);

    expect(dayLabels(container)).toEqual(['Today']);
  });

  it('adds the year to a label from a previous year', async () => {
    const { container } = await renderTT([mkLog('log:1', { ts: ts(2025, 12, 24) })]);

    expect(dayLabels(container)[0]).toBe(localDayLabel(new Date(2025, 11, 24), true));
    expect(dayLabels(container)[0]).toContain('2025');
  });

  it('summarises each day by action, in create/update/move/delete order', async () => {
    const { container } = await renderTT([
      mkLog('log:1', { action: 'delete' }),
      mkLog('log:2', { action: 'create' }),
      mkLog('log:3', { action: 'move', from: 'To do', to: 'Done' }),
      mkLog('log:4', { action: 'create' }),
    ]);

    expect(daySummaries(container)).toEqual(['2 created · 1 moved · 1 deleted']);
  });

  it('shows the empty state when nothing was ever logged', async () => {
    const { container } = await renderTT([]);

    expect(container.querySelector('.empty')!.textContent).toContain('Nothing logged yet');
    expect(container.querySelector('.load-more-btn')).toBeNull();
  });
});

describe('TimeTravelView load failure', () => {
  it('shows an error instead of crashing or hanging when the log read fails', async () => {
    getRecentLogs.mockRejectedValueOnce(new Error('db unreachable'));
    render(TimeTravelView, { events: {} } as any);

    await vi.waitFor(() => expect(showError).toHaveBeenCalled());
    expect(String((showError as any).mock.calls[0][0])).toMatch(/history/i);
  });

  it('does not get stuck refusing to load again after a failed load', async () => {
    getRecentLogs.mockRejectedValueOnce(new Error('db unreachable'));
    const { container } = render(TimeTravelView, { events: {} } as any);
    await vi.waitFor(() => expect(showError).toHaveBeenCalledTimes(1));

    // A second load (the subscribe() change feed firing) must still go
    // through -- the failed one must not leave `loading` stuck true, which
    // would silently swallow every load after the first failure.
    getRecentLogs.mockResolvedValueOnce([mkLog('log:1')]);
    const onDbChange = subscribe.mock.calls[0][0];
    onDbChange();
    await vi.waitFor(() => { if (entries(container).length === 0) throw new Error('still not loaded'); });
  });
});

describe('TimeTravelView pagination', () => {
  it('offers Load more only when the page came back exactly full', async () => {
    const full = Array.from({ length: 150 }, (_, i) => mkLog('log:' + i));
    const { container } = await renderTT(full);

    expect(container.querySelector('.load-more-btn')).toBeTruthy();
    expect(getRecentLogs).toHaveBeenCalledWith(150);
  });

  it('hides Load more on a short page', async () => {
    const { container } = await renderTT([mkLog('log:1')]);

    expect(container.querySelector('.load-more-btn')).toBeNull();
  });

  it('grows the limit by a page on Load more', async () => {
    const full = Array.from({ length: 150 }, (_, i) => mkLog('log:' + i));
    const { container } = await renderTT(full);

    await fireEvent.click(container.querySelector('.load-more-btn') as HTMLButtonElement);

    await waitFor(() => expect(getRecentLogs).toHaveBeenLastCalledWith(300));
  });
});

describe('TimeTravelView opening an entry', () => {
  it('opens the task behind a task entry', async () => {
    getTaskById.mockResolvedValue(mkTask());
    const { container } = await renderTT([mkLog('log:1')]);

    await fireEvent.click(entries(container)[0]);

    expect(getTaskById).toHaveBeenCalledWith('task:1');
    await waitFor(() => expect(document.querySelector('.overlay .title-input')).toBeTruthy());
    expect(vi.mocked(showError)).not.toHaveBeenCalled();
  });

  // Only tasks have a card to open — a project/space entry must not even
  // attempt a lookup.
  it('does not try to open a non-task entry', async () => {
    const { container } = await renderTT([
      mkLog('log:1', { ref: 'project:1', project_name: 'Test Project', task_title: undefined }),
    ]);

    expect(entries(container)[0].classList.contains('clickable')).toBe(false);
    await fireEvent.click(entries(container)[0]);

    expect(getTaskById).not.toHaveBeenCalled();
  });

  it('reports a task that no longer exists', async () => {
    getTaskById.mockResolvedValue(null);
    const { container } = await renderTT([mkLog('log:1')]);

    await fireEvent.click(entries(container)[0]);

    await waitFor(() =>
      expect(vi.mocked(showError)).toHaveBeenCalledWith('This task no longer exists.'));
  });

  it('reports a task whose project is gone', async () => {
    (projectsStore as any).set([]);
    getTaskById.mockResolvedValue(mkTask());
    const { container } = await renderTT([mkLog('log:1')]);

    await fireEvent.click(entries(container)[0]);

    await waitFor(() =>
      expect(vi.mocked(showError)).toHaveBeenCalledWith('Could not open this task right now.'));
  });

  it('surfaces an error when the lookup throws', async () => {
    getTaskById.mockRejectedValue(new Error('read failed'));
    const { container } = await renderTT([mkLog('log:1')]);

    await fireEvent.click(entries(container)[0]);

    await waitFor(() =>
      expect(vi.mocked(showError)).toHaveBeenCalledWith('Could not open this task right now.'));
  });
});

describe('TimeTravelView clear all', () => {
  it('erases the history once confirmed', async () => {
    const { container } = await renderTT([mkLog('log:1')]);

    await fireEvent.click(container.querySelector('.clear-btn') as HTMLButtonElement);

    await waitFor(() => expect(clearLogs).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(container.querySelector('.empty')!.textContent).toContain('Nothing logged yet'));
  });

  it('erases nothing when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const { container } = await renderTT([mkLog('log:1')]);

    await fireEvent.click(container.querySelector('.clear-btn') as HTMLButtonElement);

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(clearLogs).not.toHaveBeenCalled();
    expect(entries(container)).toHaveLength(1);
  });

  it('surfaces an error when the erase fails', async () => {
    clearLogs.mockRejectedValueOnce(new Error('write failed'));
    const { container } = await renderTT([mkLog('log:1')]);

    await fireEvent.click(container.querySelector('.clear-btn') as HTMLButtonElement);

    await waitFor(() =>
      expect(vi.mocked(showError)).toHaveBeenCalledWith('Failed to clear history.'));
    expect(entries(container)).toHaveLength(1);
  });

  it('offers no Clear all when there is nothing to clear', async () => {
    const { container } = await renderTT([]);

    expect(container.querySelector('.clear-btn')).toBeNull();
  });
});

describe('TimeTravelView closing', () => {
  it('closes on Escape', async () => {
    const close = vi.fn();
    await renderTT([mkLog('log:1')], { close });

    await fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('closes on the close button', async () => {
    const close = vi.fn();
    const { container } = await renderTT([mkLog('log:1')], { close });

    await fireEvent.click(container.querySelector('.close-btn') as HTMLButtonElement);

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});
