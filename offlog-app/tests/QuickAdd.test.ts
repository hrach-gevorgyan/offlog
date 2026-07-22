import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import type { ProjectDoc } from '../src/lib/types';

// db/store/modalStack are mocked; nlpParse stays REAL on purpose — these
// tests cover the full type → parse → createTask pipeline, which is the
// path a Quick Add regression would actually break. nlpParse's own
// parsing edge cases live in nlpParse.test.ts; here it's the wiring.
const createTask = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/db', () => ({
  createTask: (...args: unknown[]) => createTask(...args),
  findTasksByTitleInProject: vi.fn().mockResolvedValue([]),
}));

const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
// vi.mock factories are hoisted above top-level declarations, so the
// stores must be created inside vi.hoisted() to exist by then.
const { projects, spaces } = vi.hoisted(() => {
  // Inlined minimal writable — importing svelte/store here would defeat
  // the point (hoisted code runs before the import statements).
  function hoistedWritable<T>(value: T) {
    const subs = new Set<(v: T) => void>();
    return {
      set(v: T) { value = v; subs.forEach(fn => fn(value)); },
      subscribe(fn: (v: T) => void) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    };
  }
  return {
    projects: hoistedWritable<unknown[]>([]),
    spaces: hoistedWritable<unknown[]>([]),
  };
});
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...args: unknown[]) => reloadTasks(...args),
  showError: (...args: unknown[]) => showError(...args),
  projects,
  spaces,
}));

// closeOnBack registers a history-stack entry; in jsdom just hand the
// callback straight back so requestClose() === the close callback.
vi.mock('../src/lib/modalStack', () => ({
  closeOnBack: (cb: () => void) => cb,
}));

import QuickAdd from '../src/lib/QuickAdd.svelte';

function mkProject(id: string, name: string): ProjectDoc {
  return {
    _id: `project:${id}`, type: 'project', space_id: 'space:unsorted', name,
    position: 0,
    columns: [
      { id: `col:${id}-todo`, name: 'To do' },
      { id: `col:${id}-done`, name: 'Done' },
    ],
    default_view: 'kanban', updated_at: new Date().toISOString(), source: 'pc',
  };
}

function renderQuickAdd() {
  const close = vi.fn();
  const created = vi.fn();
  const utils = render(QuickAdd, { events: { close, created } } as any);
  return { close, created, ...utils };
}

beforeEach(() => {
  createTask.mockClear();
  createTask.mockResolvedValue(undefined);
  reloadTasks.mockClear();
  showError.mockClear();
  projects.set([mkProject('1', 'Errands'), mkProject('2', 'Fitness')]);
  spaces.set([]);
});

afterEach(() => cleanup());

const titleInput = (utils: ReturnType<typeof render>) =>
  utils.container.querySelector('.title-input') as HTMLInputElement;

describe('QuickAdd create pipeline (A32)', () => {
  it('creates a task in the first column of the default project', async () => {
    const q = renderQuickAdd();
    await fireEvent.input(titleInput(q), { target: { value: 'Buy milk' } });
    await fireEvent.click(q.getByText('Add task'));

    expect(createTask).toHaveBeenCalledTimes(1);
    const [projectId, spaceId, columnId, title] = createTask.mock.calls[0];
    expect(projectId).toBe('project:1');
    expect(spaceId).toBe('space:unsorted');
    expect(columnId).toBe('col:1-todo');
    expect(title).toBe('Buy milk');
    expect(reloadTasks).toHaveBeenCalledTimes(1);
    expect(q.created).toHaveBeenCalledTimes(1);
    expect(q.close).toHaveBeenCalledTimes(1);
  });

  it('parses priority/tags out of the typed title (real nlpParse)', async () => {
    const q = renderQuickAdd();
    await fireEvent.input(titleInput(q), { target: { value: 'Call plumber !high #home' } });
    await fireEvent.click(q.getByText('Add task'));

    const [, , , title, extras] = createTask.mock.calls[0];
    expect(title).toBe('Call plumber');
    expect(extras.priority).toBe(3);
    expect(extras.tags).toEqual(['home']);
  });

  it('routes @project mentions to the matched project', async () => {
    const q = renderQuickAdd();
    await fireEvent.input(titleInput(q), { target: { value: 'Log workout @fitness' } });
    await fireEvent.click(q.getByText('Add task'));

    const [projectId, , columnId, title] = createTask.mock.calls[0];
    expect(projectId).toBe('project:2');
    expect(columnId).toBe('col:2-todo');
    expect(title).toBe('Log workout');
  });

  it('a fully quoted title turns parsing off', async () => {
    const q = renderQuickAdd();
    await fireEvent.input(titleInput(q), { target: { value: '"Call mom tomorrow !high"' } });
    await fireEvent.click(q.getByText('Add task'));

    const [, , , title, extras] = createTask.mock.calls[0];
    expect(title).toBe('Call mom tomorrow !high');
    expect(extras.priority).toBeUndefined();
    expect(extras.due_date).toBeNull();
  });

  it('an empty title cannot create: button disabled, Enter is a no-op', async () => {
    const q = renderQuickAdd();
    expect((q.getByText('Add task') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.keyDown(titleInput(q), { key: 'Enter' });
    expect(createTask).not.toHaveBeenCalled();
  });

  it('a failed create shows an error and keeps the panel open', async () => {
    createTask.mockRejectedValueOnce(new Error('storage full'));
    const q = renderQuickAdd();
    await fireEvent.input(titleInput(q), { target: { value: 'Doomed task' } });
    await fireEvent.click(q.getByText('Add task'));

    expect(showError).toHaveBeenCalledTimes(1);
    expect(q.close).not.toHaveBeenCalled();
    expect(q.created).not.toHaveBeenCalled();
  });
});
