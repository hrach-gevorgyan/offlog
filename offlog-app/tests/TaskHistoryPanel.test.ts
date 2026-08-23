import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';

// The panel's only dependency is getLogsForTask() — mocked so this covers
// the lazy load and the task-scoped describeLog phrasing, not a database
// round-trip (db.test.ts covers that).
const getLogsForTask = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/db', () => ({
  getLogsForTask: (...a: unknown[]) => getLogsForTask(...a),
}));

import TaskHistoryPanel from '../src/lib/TaskHistoryPanel.svelte';

function mkLog(extra: Record<string, unknown> = {}) {
  return {
    _id: 'log:1', type: 'log', action: 'update', ref: 'task:1',
    ts: '2026-03-11T09:00:00.000Z', source: 'PC', ...extra,
  };
}

const rows = (c: HTMLElement) => [...c.querySelectorAll('.history-row')];
const descs = (c: HTMLElement) => rows(c).map(r => r.querySelector('.h-desc')!.textContent);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('TaskHistoryPanel', () => {
  it('loads the history for the task it was given', async () => {
    getLogsForTask.mockResolvedValueOnce([mkLog({ action: 'create' })]);
    const { container } = render(TaskHistoryPanel, { props: { taskId: 'task:42' } });

    expect(getLogsForTask).toHaveBeenCalledWith('task:42');
    await waitFor(() => expect(descs(container)).toEqual(['Task created']));
  });

  it('shows the empty state when nothing was ever logged', async () => {
    getLogsForTask.mockResolvedValueOnce([]);
    const { container } = render(TaskHistoryPanel, { props: { taskId: 'task:1' } });

    await waitFor(() =>
      expect(container.querySelector('.history-empty')!.textContent).toContain('No history recorded.'));
    expect(rows(container)).toHaveLength(0);
  });

  it('phrases create/move/delete task-scoped and labels the action', async () => {
    getLogsForTask.mockResolvedValueOnce([
      mkLog({ _id: 'log:a', action: 'create' }),
      mkLog({ _id: 'log:b', action: 'move', from: 'To do', to: 'Done' }),
      mkLog({ _id: 'log:c', action: 'delete' }),
    ]);
    const { container } = render(TaskHistoryPanel, { props: { taskId: 'task:1' } });

    await waitFor(() => expect(rows(container)).toHaveLength(3));
    expect(descs(container)).toEqual([
      'Task created',
      'Moved from "To do" to "Done"',
      'Task deleted',
    ]);
    expect(rows(container).map(r => r.querySelector('.h-pill')!.textContent))
      .toEqual(['Created', 'Moved', 'Deleted']);
  });

  it('joins real diff clauses and ignores no-op ones', async () => {
    getLogsForTask.mockResolvedValueOnce([mkLog({
      diffs: {
        priority: { from: 1, to: 3 },
        pinned: { from: false, to: true },
        custom_values: { from: undefined, to: {} },  // nothing-to-nothing, not a change
      },
    })]);
    const { container } = render(TaskHistoryPanel, { props: { taskId: 'task:1' } });

    await waitFor(() => expect(rows(container)).toHaveLength(1));
    expect(descs(container)[0]).toBe('Priority changed to High; Pinned');
  });

  it('falls back to "Details updated" when every diff is a no-op', async () => {
    getLogsForTask.mockResolvedValueOnce([mkLog({
      diffs: { checklist: { from: null, to: [] }, tags: { from: [], to: [] } },
    })]);
    const { container } = render(TaskHistoryPanel, { props: { taskId: 'task:1' } });

    await waitFor(() => expect(rows(container)).toHaveLength(1));
    expect(descs(container)[0]).toBe('Details updated');
  });

  it('caps the clause list and counts the remainder', async () => {
    getLogsForTask.mockResolvedValueOnce([mkLog({
      diffs: {
        priority: { from: 1, to: 3 },
        pinned: { from: false, to: true },
        title: { from: 'a', to: 'b' },
        body: { from: 'x', to: 'y' },
        tags: { from: [], to: ['home'] },
      },
    })]);
    const { container } = render(TaskHistoryPanel, { props: { taskId: 'task:1' } });

    await waitFor(() => expect(rows(container)).toHaveLength(1));
    expect(descs(container)[0]).toBe(
      'Priority changed to High; Pinned; Renamed to "b"; +2 more changes');
  });
});
