import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

// Agenda buckets tasks by due date relative to "today", so the clock is
// pinned: without it the Overdue/Today/This week/Later split would depend
// on the day the suite happens to run.
const NOW = new Date('2026-03-11T10:00:00');   // a Wednesday, local time

const updateTask = vi.fn().mockResolvedValue(undefined);
const getAllTasksDue = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/db', () => ({
  getAllTasksDue: (...a: unknown[]) => getAllTasksDue(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
  getTaskById: vi.fn().mockResolvedValue(null),
  // reached only when a row is opened into CardDetail
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
    projects: w([]),
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    modalOpen: w(false),
  };
});

vi.mock('../src/config', () => ({
  getWeekStartsMonday: () => true,
  getDefaultReminderTime: () => '09:00',
  getTimeFormat24h: () => true,
  isNativePlatform: () => false,
  isTauri: () => false,
}));

vi.mock('../src/lib/notifications', () => ({
  requestPermission: vi.fn(),
  permissionState: writable('default'),
}));

vi.mock('../src/lib/confirm', () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));

import { projects as projectsStore, showError } from '../src/lib/store';
import AgendaView from '../src/lib/AgendaView.svelte';

const COLUMNS = [
  { id: 'col:todo', name: 'To do' },
  { id: 'col:done', name: 'Done' },
];

function mkProject(): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
    position: 0, columns: COLUMNS, default_view: 'list',
    updated_at: '2026-01-01T00:00:00.000Z', source: 'PC',
  };
}

function mkTask(id: string, due: string, extra: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: id, type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Task ' + id, body: '', priority: 2,
    due_date: due, reminder_at: null, tags: [], position: 100, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'PC', ...extra,
  };
}

// Each group renders its count in a .badge-count next to its label.
function groupCount(container: HTMLElement, label: RegExp): number | null {
  const el = [...container.querySelectorAll('.group-label')]
    .find(e => label.test((e as HTMLElement).textContent!));
  if (!el) return null;
  return Number(el.querySelector('.badge-count')?.textContent ?? '0');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  (projectsStore as any).set([mkProject()]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('AgendaView due-date grouping', () => {
  it('splits tasks into Overdue / Today / This week / Later', async () => {
    getAllTasksDue.mockResolvedValueOnce([
      mkTask('task:a', '2026-03-09'),   // Monday — past
      mkTask('task:b', '2026-03-10'),   // Tuesday — past
      mkTask('task:c', '2026-03-11'),   // today
      mkTask('task:d', '2026-03-13'),   // Friday — same week
      mkTask('task:e', '2026-03-20'),   // next week
    ]);
    const { container } = render(AgendaView);

    await waitFor(() => {
      if (groupCount(container, /Overdue/) === null) throw new Error('not loaded');
    });

    expect(groupCount(container, /Overdue/)).toBe(2);
    expect(groupCount(container, /Today/)).toBe(1);
    expect(groupCount(container, /This week/i)).toBe(1);
    expect(groupCount(container, /Later/)).toBe(1);
  });

  // The boundary that actually bites: a task due today must never count as
  // overdue, and one due on the last day of the week must not fall to Later.
  it('puts today on the Today boundary and the week\'s last day in This week', async () => {
    getAllTasksDue.mockResolvedValueOnce([
      mkTask('task:today', '2026-03-11'),      // today
      mkTask('task:sunday', '2026-03-15'),     // week ends Sunday (Monday start)
      mkTask('task:monday', '2026-03-16'),     // next week
    ]);
    const { container } = render(AgendaView);

    await waitFor(() => {
      if (groupCount(container, /Today/) === null) throw new Error('not loaded');
    });

    expect(groupCount(container, /Overdue/)).toBeNull(); // no overdue group at all
    expect(groupCount(container, /Today/)).toBe(1);
    expect(groupCount(container, /This week/i)).toBe(1);
    expect(groupCount(container, /Later/)).toBe(1);
  });
});

describe('AgendaView mark done', () => {
  it('moves the task into its own project\'s last status', async () => {
    getAllTasksDue.mockResolvedValueOnce([mkTask('task:a', '2026-03-11')]);
    const { container } = render(AgendaView);

    const circle = await waitFor(() => {
      const b = container.querySelector('button.circle') as HTMLButtonElement;
      if (!b) throw new Error('no task rendered');
      return b;
    });
    await fireEvent.click(circle);

    expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:done' });
    expect(vi.mocked(showError)).not.toHaveBeenCalled();
  });

  // Agenda spans every project, so a task whose project is missing from the
  // store has no last column to resolve — it must not guess one.
  it('writes nothing when the task\'s project is unknown', async () => {
    (projectsStore as any).set([]);
    getAllTasksDue.mockResolvedValueOnce([mkTask('task:a', '2026-03-11')]);
    const { container } = render(AgendaView);

    const circle = await waitFor(() => {
      const b = container.querySelector('button.circle') as HTMLButtonElement;
      if (!b) throw new Error('no task rendered');
      return b;
    });
    await fireEvent.click(circle);

    expect(updateTask).not.toHaveBeenCalled();
  });

  it('surfaces an error when the write fails', async () => {
    updateTask.mockRejectedValueOnce(new Error('write failed'));
    getAllTasksDue.mockResolvedValueOnce([mkTask('task:a', '2026-03-11')]);
    const { container } = render(AgendaView);

    const circle = await waitFor(() => {
      const b = container.querySelector('button.circle') as HTMLButtonElement;
      if (!b) throw new Error('no task rendered');
      return b;
    });
    await fireEvent.click(circle);

    await waitFor(() => expect(vi.mocked(showError)).toHaveBeenCalled());
  });
});
