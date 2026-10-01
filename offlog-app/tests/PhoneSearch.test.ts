import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import type { Writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const searchAllTasks = vi.fn();
let feed: (() => void) | null = null;
vi.mock('../src/lib/db', () => ({
  searchAllTasks: (...a: unknown[]) => searchAllTasks(...a),
  updateTask: vi.fn(), getTasksForProject: vi.fn().mockResolvedValue([]),
  duplicateTask: vi.fn(), archiveTask: vi.fn(), deleteTask: vi.fn(), computeDropPosition: () => 1024,
  subscribe: (cb: () => void) => { feed = cb; return () => { feed = null; }; },
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return { showError: vi.fn(), reloadTasks: vi.fn(), modalOpen: w(false), projects: w([]), spaces: w([]) };
});

import SearchScreen from '../src/lib/phone/SearchScreen.svelte';
import { projects } from '../src/lib/store';

const project = {
  _id: 'project:p', type: 'project', space_id: 'space:s', name: 'House', position: 0, default_view: 'kanban',
  columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }], updated_at: '', source: '',
} as ProjectDoc;
const hit = (id: string, matchedIn: string, over: Partial<TaskDoc> = {}) => ({
  _id: id, type: 'task', project_id: 'project:p', space_id: 'space:s', column_id: 'col:todo', title: id.slice(5),
  body: '', priority: 1, due_date: null, reminder_at: null, tags: [], position: 0, deleted: false,
  created_at: '', updated_at: '', source: '', project_name: 'House', matchedIn, ...over,
});

describe('phone Search', () => {
  beforeEach(() => {
    (projects as Writable<ProjectDoc[]>).set([project]);
    searchAllTasks.mockReset().mockResolvedValue([]);
  });

  it('a clear button empties the field and refocuses it', async () => {
    const { getByLabelText, queryByLabelText } = render(SearchScreen);
    const input = getByLabelText('Search') as HTMLInputElement;
    expect(queryByLabelText('Clear search')).toBeNull();
    await fireEvent.input(input, { target: { value: 'tile' } });
    await fireEvent.click(getByLabelText('Clear search'));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(queryByLabelText('Clear search')).toBeNull();
  });

  it('marks the match in a title, and shows a note or step snippet with it marked', async () => {
    searchAllTasks.mockResolvedValue([
      hit('task:Order tiles', 'title'),
      hit('task:Call Bob', 'body', { body: 'He said the tile delivery is late' }),
      hit('task:Shop', 'checklist', { checklist: [{ text: 'milk', done: false }, { text: 'Grout for tile', done: false }] }),
    ]);
    const { getByLabelText, findByText, container } = render(SearchScreen);
    await fireEvent.input(getByLabelText('Search'), { target: { value: 'Tile' } });
    await findByText('Call Bob');
    const marks = [...container.querySelectorAll('mark')].map(m => m.textContent);
    expect(marks).toEqual(['tile', 'tile', 'tile']);
    const snips = [...container.querySelectorAll('.why.snip')].map(s => s.textContent);
    expect(snips).toEqual(['He said the tile delivery is late', 'Grout for tile']);
  });

  it('no matches mentions archived projects', async () => {
    const { getByLabelText, findByText } = render(SearchScreen);
    await fireEvent.input(getByLabelText('Search'), { target: { value: 'zzz' } });
    expect(await findByText(/Archived projects aren't searched/)).toBeTruthy();
  });

  it('re-runs on the change feed', async () => {
    const { getByLabelText, findByText } = render(SearchScreen);
    await fireEvent.input(getByLabelText('Search'), { target: { value: 'tile' } });
    await waitFor(() => expect(searchAllTasks).toHaveBeenCalledWith('tile'));
    searchAllTasks.mockResolvedValue([hit('task:Fresh tile', 'title')]);
    feed!();
    expect(await findByText(/Fresh/)).toBeTruthy();
  });
});
