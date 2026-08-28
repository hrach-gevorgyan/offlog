import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import type { Command } from '../src/lib/commands';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const searchAllTasks = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/db', () => ({
  searchAllTasks: (...a: unknown[]) => searchAllTasks(...a),
}));

// The factory is hoisted above every const in this file, so the store is
// created inside it and imported back below rather than closed over.
vi.mock('../src/lib/store', async () => {
  const { writable } = await import('svelte/store');
  return { projects: writable([] as ProjectDoc[]), showError: vi.fn() };
});

// discardTop() vs the closeOnBack() close: which one a row uses decides
// whether the overlay it opens survives, so both are observed here.
const discardTop = vi.fn();
vi.mock('../src/lib/modalStack', () => ({
  closeOnBack: (close: () => void) => close,
  discardTop: (...a: unknown[]) => discardTop(...a),
}));

import { projects, showError } from '../src/lib/store';
import GlobalSearch from '../src/lib/GlobalSearch.svelte';

const PROJECT: ProjectDoc = {
  _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Test Project',
  position: 0, columns: [{ id: 'col:todo', name: 'To do' }], default_view: 'list',
  updated_at: '2026-01-01T00:00:00.000Z', source: 'PC',
};

function mkResult(extra: Partial<TaskDoc> = {}) {
  return {
    _id: 'task:1', type: 'task', project_id: 'project:1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Report draft', body: '', priority: 2,
    due_date: null, reminder_at: null, tags: [], position: 100, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'PC', project_name: 'Test Project', matchedIn: 'title',
    ...extra,
  } as TaskDoc & { project_name: string; matchedIn: string };
}

const run = vi.fn();
const runOverlay = vi.fn();
const COMMANDS: Command[] = [
  { id: 'dashboard', label: 'Go to Dashboard', keywords: 'home view', run },
  { id: 'quickadd', label: 'Quick Add Task', keywords: 'new create', run: runOverlay, opensOverlay: true },
];

const rows = (container: HTMLElement) => [...container.querySelectorAll('.result-row')] as HTMLElement[];
const selectedRow = (container: HTMLElement) => container.querySelector('.result-row.selected') as HTMLElement;
const input = (container: HTMLElement) => container.querySelector('.search-input') as HTMLInputElement;

async function typeQuery(container: HTMLElement, q: string) {
  await fireEvent.input(input(container), { target: { value: q } });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchAllTasks.mockResolvedValue([]);
  projects.set([PROJECT]);
});
afterEach(cleanup);

describe('GlobalSearch matching', () => {
  it('lists every command when the query is empty', () => {
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });
    expect(rows(container).map(r => r.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['⌘ Go to Dashboard', '⌘ Quick Add Task']);
  });

  it('matches a command by its keywords, not only its label', async () => {
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await typeQuery(container, 'create');

    await waitFor(() => expect(rows(container)).toHaveLength(1));
    expect(rows(container)[0].textContent).toContain('Quick Add Task');
  });

  it('shows task results below the commands once the debounced search returns', async () => {
    searchAllTasks.mockResolvedValue([mkResult()]);
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await typeQuery(container, 'report');

    await waitFor(() => expect(rows(container)).toHaveLength(1));
    expect(searchAllTasks).toHaveBeenCalledWith('report');
    expect(rows(container)[0].textContent).toContain('Report draft');
  });

  it('reports no results when neither a command nor a task matches', async () => {
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await typeQuery(container, 'zzzz');

    await waitFor(() => {
      const hint = container.querySelector('.hint-empty');
      if (!hint) throw new Error('empty hint not shown');
      expect(hint.textContent).toContain('zzzz');
    });
  });

  it('surfaces a search failure instead of leaving the spinner running forever', async () => {
    searchAllTasks.mockRejectedValue(new Error('boom'));
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await typeQuery(container, 'report');

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Search failed. Please try again.'));
    expect(container.querySelector('.spinner')).toBeNull();
  });
});

describe('GlobalSearch keyboard navigation', () => {
  it('ArrowDown/ArrowUp move through commands and task results as one list', async () => {
    searchAllTasks.mockResolvedValue([mkResult()]);
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await typeQuery(container, 'a');
    await waitFor(() => expect(rows(container)).toHaveLength(3));

    expect(selectedRow(container).textContent).toContain('Go to Dashboard');
    await fireEvent.keyDown(input(container), { key: 'ArrowDown' });
    expect(selectedRow(container).textContent).toContain('Quick Add Task');
    // Crossing from the last command into the first task result is the
    // point of the shared index.
    await fireEvent.keyDown(input(container), { key: 'ArrowDown' });
    expect(selectedRow(container).textContent).toContain('Report draft');
    await fireEvent.keyDown(input(container), { key: 'ArrowUp' });
    expect(selectedRow(container).textContent).toContain('Quick Add Task');
  });

  it('clamps at both ends of the list', async () => {
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await fireEvent.keyDown(input(container), { key: 'ArrowUp' });
    expect(selectedRow(container).textContent).toContain('Go to Dashboard');

    for (let i = 0; i < 5; i++) await fireEvent.keyDown(input(container), { key: 'ArrowDown' });
    expect(selectedRow(container).textContent).toContain('Quick Add Task');
  });

  it('Enter runs the selected command', async () => {
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await fireEvent.keyDown(input(container), { key: 'ArrowDown' });
    await fireEvent.keyDown(input(container), { key: 'Enter' });

    expect(runOverlay).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  // Arrowing down past both commands first is what makes this assert the
  // command offset, not just "the only row opens".
  it('Enter opens the selected task result with its project', async () => {
    searchAllTasks.mockResolvedValue([mkResult({ _id: 'task:9' } as Partial<TaskDoc>), mkResult()]);
    const onOpen = vi.fn();
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS }, events: { open: onOpen } } as any);

    await typeQuery(container, 'a');
    await waitFor(() => expect(rows(container)).toHaveLength(4));
    for (let i = 0; i < 3; i++) await fireEvent.keyDown(input(container), { key: 'ArrowDown' });
    await fireEvent.keyDown(input(container), { key: 'Enter' });

    expect(onOpen).toHaveBeenCalledTimes(1);
    const detail = onOpen.mock.calls[0][0].detail;
    expect(detail.task._id).toBe('task:1');
    expect(detail.project._id).toBe('project:1');
  });

  it('Escape closes the palette', async () => {
    const onClose = vi.fn();
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS }, events: { close: onClose } } as any);

    await fireEvent.keyDown(input(container), { key: 'Escape' });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('selection follows the mouse, so Enter runs the hovered row', async () => {
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await fireEvent.mouseEnter(rows(container)[1]);
    await fireEvent.keyDown(input(container), { key: 'Enter' });

    expect(runOverlay).toHaveBeenCalledTimes(1);
  });
});

describe('GlobalSearch close behaviour per row type', () => {
  it('an overlay-opening command discards the stack entry instead of going back', async () => {
    const onClose = vi.fn();
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS }, events: { close: onClose } } as any);

    await fireEvent.click(rows(container)[1]);

    // Both are needed: discardTop() does the history bookkeeping, the
    // 'close' event unmounts the palette over the overlay it just opened.
    expect(discardTop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(runOverlay).toHaveBeenCalledTimes(1);
  });

  it('a plain command closes normally without discarding', async () => {
    const { container } = render(GlobalSearch, { props: { commands: COMMANDS } });

    await fireEvent.click(rows(container)[0]);

    expect(discardTop).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a task whose project is missing opens nothing', async () => {
    projects.set([]);
    searchAllTasks.mockResolvedValue([mkResult()]);
    const onOpen = vi.fn();
    const { container } = render(GlobalSearch, { props: { commands: [] }, events: { open: onOpen } } as any);

    await typeQuery(container, 'report');
    await waitFor(() => expect(rows(container)).toHaveLength(1));
    await fireEvent.click(rows(container)[0]);

    expect(onOpen).not.toHaveBeenCalled();
    expect(discardTop).not.toHaveBeenCalled();
  });
});

describe('GlobalSearch highlighting', () => {
  // Titles are sync-derived, untrusted data rendered via {@html} — the
  // escape has to happen before the <mark> wrap, not after.
  it('escapes a title\'s HTML rather than rendering it', async () => {
    searchAllTasks.mockResolvedValue([mkResult({ title: '<img src=x onerror=1> plan' } as Partial<TaskDoc>)]);
    const { container } = render(GlobalSearch, { props: { commands: [] } });

    await typeQuery(container, 'plan');

    await waitFor(() => expect(rows(container)).toHaveLength(1));
    const title = container.querySelector('.result-title') as HTMLElement;
    expect(title.querySelector('img')).toBeNull();
    expect(title.textContent).toContain('<img src=x onerror=1>');
    expect(title.querySelector('mark')?.textContent).toBe('plan');
  });
});
