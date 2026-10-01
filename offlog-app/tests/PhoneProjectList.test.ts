import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get, type Writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const updateTask = vi.fn();
const updateProject = vi.fn();
const deleteTask = vi.fn();
const archiveTask = vi.fn();
const duplicateTask = vi.fn();
const archiveProject = vi.fn();
const unarchiveProject = vi.fn();
const deleteProject = vi.fn();
const getArchivedTasksForProject = vi.fn();
const unarchiveTask = vi.fn();
vi.mock('../src/lib/db', () => {
  const posBetween = (b: number | null, a: number | null) => (b === null && a === null ? 1024 : b === null ? a! / 2 : a === null ? b + 1024 : (a + b) / 2);
  return {
    updateTask: (...a: unknown[]) => updateTask(...a),
    updateProject: (...a: unknown[]) => updateProject(...a),
    deleteTask: (...a: unknown[]) => deleteTask(...a),
    archiveTask: (...a: unknown[]) => archiveTask(...a),
    duplicateTask: (...a: unknown[]) => duplicateTask(...a),
    archiveProject: (...a: unknown[]) => archiveProject(...a),
    unarchiveProject: (...a: unknown[]) => unarchiveProject(...a),
    deleteProject: (...a: unknown[]) => deleteProject(...a),
    getArchivedTasksForProject: (...a: unknown[]) => getArchivedTasksForProject(...a),
    unarchiveTask: (...a: unknown[]) => unarchiveTask(...a),
    getTaskIdsBlocked: vi.fn().mockResolvedValue(new Set(['task:b'])),
    getTaskIdsWithRelatedLinks: vi.fn().mockResolvedValue(new Set()),
    getTagColorOverrides: vi.fn().mockResolvedValue({}),
    getCustomFieldDefs: vi.fn().mockResolvedValue([]),
    getAllTags: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockReturnValue(() => {}),
    computeDropPosition: (col: { position: number }[], i: number | null) => {
      if (i === null) { const l = col.at(-1); return l ? l.position + 1024 : 1024; }
      return posBetween(i > 0 ? col[i - 1]?.position ?? null : null, col[i]?.position ?? null);
    },
  };
});
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(),
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    modalOpen: w(false),
    projects: w([]),
    spaces: w([{ _id: 'space:h', name: 'Home', color: '#3b82f6', position: 0 }]),
    activeProjectId: w(''),
    activeSpaceId: w(''),
    projectTasks: w([]),
  };
});

import ProjectScreen from '../src/lib/phone/ProjectScreen.svelte';
import { projects, projectTasks, activeProjectId, showError, reloadTasks, modalOpen } from '../src/lib/store';
import { actions, stack, switchTab, push, toast } from '../src/lib/phone/nav';

const project: ProjectDoc = {
  _id: 'project:p', type: 'project', space_id: 'space:h', name: 'House', position: 0, default_view: 'kanban',
  columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:doing', name: 'Doing' }, { id: 'col:done', name: 'Done' }],
  updated_at: '', source: '',
};
const task = (id: string, over: Partial<TaskDoc> = {}) => ({
  _id: id, type: 'task', project_id: 'project:p', space_id: 'space:h', column_id: 'col:todo', title: id.slice(5),
  body: '', priority: 2, due_date: null, reminder_at: null, tags: [], position: 1024, deleted: false,
  created_at: '', updated_at: '', source: '', ...over,
}) as TaskDoc;
const tasks = [
  task('task:a', { position: 1024 }),
  task('task:b', { position: 2048, tags: ['tiles'] }),
  task('task:c', { position: 3072, priority: 3 }),
  task('task:d', { column_id: 'col:doing', position: 500 }),
];

function setup(p: Partial<ProjectDoc> = {}, ts: TaskDoc[] = tasks) {
  (projects as Writable<ProjectDoc[]>).set([{ ...project, ...p }]);
  (projectTasks as Writable<TaskDoc[]>).set(ts);
  return render(ProjectScreen, { id: 'project:p' });
}
// Sheets finish closing only once their outro ends; with reduced motion
// transitions take no time, so the close lands at once.
window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const titles = (c: HTMLElement) => [...c.querySelectorAll('.card .t')].map(e => e.textContent?.trim());

beforeEach(async () => {
  // A closed sheet's history.back() lands as an async popstate; let it
  // settle so it cannot pop the next test's sheet.
  await new Promise(r => setTimeout(r, 20));
  vi.clearAllMocks();
  toast.set(null);
  for (const f of [updateTask, updateProject, deleteTask, archiveTask, duplicateTask, archiveProject, deleteProject, unarchiveTask])
    f.mockReset().mockResolvedValue(undefined);
  getArchivedTasksForProject.mockReset().mockResolvedValue([]);
  activeProjectId.set('');
  localStorage.removeItem('offlog_phone_view_project:p');
  switchTab('home');
});
afterEach(cleanup);

describe('phone Project screen — list', () => {
  const list = (p: Partial<ProjectDoc> = {}, ts: TaskDoc[] = tasks) => setup({ default_view: 'list', ...p }, ts);
  // A title as seen: the screen-reader-only priority note left out.
  const seen = (e: Element) => [...e.childNodes].filter(n => !(n as Element).classList?.contains('p-sr')).map(n => n.textContent).join('').trim();
  const rowTitles = (c: HTMLElement) => [...c.querySelectorAll('.rows .t')].map(seen);
  const bar = (c: HTMLElement) => c.querySelector('.bulkbar b')?.textContent;
  async function sortBy(r: ReturnType<typeof setup>, from: string, to: string) {
    await fireEvent.click(r.getByText(`Sort: ${from}`));
    await waitFor(() => r.getByRole('dialog', { name: 'Sort by' }));
    await fireEvent.click(r.getByText(to, { selector: '.psheet .p-row span' }));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
  }

  it('sorted by Status, rows sit under status headings with no status label of their own', () => {
    const r = list();
    expect([...r.container.querySelectorAll('.gh')].map(e => e.textContent)).toEqual(['To do3', 'Doing1']);
    expect(rowTitles(r.container)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.container.querySelectorAll('.rows .st')).toHaveLength(0);
    expect([...r.container.querySelectorAll('.row .p-sr')].map(e => e.textContent)).toContain(', high priority');
    expect(r.container.querySelector('.chk.prio')).toBeTruthy();
  });

  it('the sort chip opens a sheet with a tick on the current sort; other sorts show the status on each row', async () => {
    const r = list();
    await fireEvent.click(r.getByText('Sort: Status'));
    await waitFor(() => r.getByRole('dialog', { name: 'Sort by' }));
    expect(r.getByRole('button', { name: 'Status', pressed: true })).toBeTruthy();
    await fireEvent.click(r.getByText('Due', { selector: '.psheet .p-row span' }));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    expect(r.getByText('Sort: Due')).toBeTruthy();
    expect(rowTitles(r.container)).toEqual(['c', 'a', 'b', 'd']);
    expect([...r.container.querySelectorAll('.rows .st')].map(e => e.textContent)).toEqual(['To do', 'To do', 'To do', 'Doing']);
    await fireEvent.input(r.getByLabelText('Search tasks'), { target: { value: 'd' } });
    expect(rowTitles(r.container)).toEqual(['d']);
  });

  it('sort and search survive leaving the screen and coming back', async () => {
    push({ k: 'project', id: 'project:p' });
    const r = list();
    await sortBy(r, 'Status', 'Title');
    await fireEvent.input(r.getByLabelText('Search tasks'), { target: { value: 'b' } });
    cleanup();
    const back = render(ProjectScreen, { id: 'project:p' });
    expect(back.getByText('Sort: Title')).toBeTruthy();
    expect((back.getByLabelText('Search tasks') as HTMLInputElement).value).toBe('b');
    expect(rowTitles(back.container)).toEqual(['b']);
  });

  it('Pinned first lifts pinned rows within their status, shows the pin, and is remembered on this device', async () => {
    localStorage.removeItem('offlog_list_pinned_first');
    const r = list({}, [tasks[0], tasks[1], task('task:c', { position: 3072, pinned: true }), tasks[3]]);
    expect(rowTitles(r.container)).toEqual(['a', 'b', 'c', 'd']);
    await fireEvent.click(r.getByText('Pinned first'));
    expect(rowTitles(r.container)).toEqual(['c', 'a', 'b', 'd']);
    expect(r.container.querySelector('.rows .t .pin svg')).toBeTruthy();
    expect(localStorage.getItem('offlog_list_pinned_first')).toBe('true');
    await fireEvent.click(r.getByText('Pinned first'));
  });

  it('the row checkbox finishes a task; a one-status project has none', async () => {
    const r = list();
    await fireEvent.click(r.getByLabelText('Finish: b'));
    expect(updateTask).toHaveBeenCalledWith('task:b', { column_id: 'col:done' });
    await waitFor(() => expect(get(toast)?.text).toBe('Done: b'));
    cleanup();
    const one = list({ columns: [{ id: 'col:todo', name: 'To do' }] }, tasks.slice(0, 3));
    expect(rowTitles(one.container)).toEqual(['a', 'b', 'c']);
    expect(one.container.querySelector('.chk')).toBeNull();
  });

  it('Select mode: rows toggle, the bar moves every selected task, and Undo restores them', async () => {
    const r = list();
    await fireEvent.click(r.getByText('Select'));
    expect(get(modalOpen)).toBe(true);
    await fireEvent.click(r.getByRole('checkbox', { name: 'a' }));
    await fireEvent.click(r.getByRole('checkbox', { name: 'c' }));
    expect(bar(r.container)).toBe('2 selected');
    await fireEvent.click(r.getByText('Status', { selector: '.bulkbar button' }));
    await waitFor(() => r.getByRole('dialog', { name: 'Move 2 to' }));
    await fireEvent.click(r.getByText('Done', { selector: '.psheet .p-row' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:done' });
    expect(updateTask).toHaveBeenCalledWith('task:c', { column_id: 'col:done' });
    expect(reloadTasks).toHaveBeenCalled();
    await waitFor(() => expect(bar(r.container)).toBe('0 selected'));
    expect(get(toast)?.text).toBe('Updated 2 tasks');
    await get(toast)!.undo!();
    expect(updateTask).toHaveBeenCalledWith('task:a', expect.objectContaining({ column_id: 'col:todo' }));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await fireEvent.click(r.getByLabelText('Exit selection'));
    await waitFor(() => expect(get(modalOpen)).toBe(false));
    expect(r.container.querySelector('.bulkbar')).toBeNull();
  });

  it('holding a row enters Select mode with that row picked; a tap still opens it', async () => {
    const open = vi.spyOn(actions, 'openTask').mockImplementation(() => {});
    const r = list();
    await fireEvent.click(r.getByText('a', { selector: '.rows .t' }));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task:a' }));
    vi.useFakeTimers();
    await fireEvent.pointerDown(r.getByText('b', { selector: '.rows .t' }), { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    await waitFor(() => expect(bar(r.container)).toBe('1 selected'));
    expect(get(modalOpen)).toBe(true);
    const b = r.getByRole('checkbox', { name: 'b' });
    expect(b.getAttribute('aria-checked')).toBe('true');
    // The click that ends the hold does not unpick it; the next tap does.
    await fireEvent.click(b);
    expect(b.getAttribute('aria-checked')).toBe('true');
    await fireEvent.pointerDown(b);
    await fireEvent.click(b);
    expect(b.getAttribute('aria-checked')).toBe('false');
    expect(open).toHaveBeenCalledTimes(1);
    await fireEvent.click(r.getByLabelText('Exit selection'));
    await waitFor(() => expect(get(modalOpen)).toBe(false));
  });

  it('a row that moves while held stays a scroll, not a selection', async () => {
    const r = list();
    vi.useFakeTimers();
    const row = r.getByText('b', { selector: '.rows .t' });
    await fireEvent.pointerDown(row, { clientX: 10, clientY: 10 });
    await fireEvent.pointerMove(row, { clientX: 10, clientY: 40 });
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    expect(r.container.querySelector('.bulkbar')).toBeNull();
  });

  it('Android back leaves Select mode, not the project', async () => {
    push({ k: 'project', id: 'project:p' });
    const r = list();
    await fireEvent.click(r.getByText('Select'));
    await fireEvent.click(r.getByRole('checkbox', { name: 'a' }));
    history.back();
    await waitFor(() => expect(r.container.querySelector('.bulkbar')).toBeNull());
    expect(get(modalOpen)).toBe(false);
    expect(get(stack).map(s => s.k)).toEqual(['home', 'project']);
    expect(r.getByLabelText('Finish: a')).toBeTruthy();
  });

  it('bulk priority and tag write each task; a failure surfaces an error', async () => {
    const r = list();
    await fireEvent.click(r.getByText('Select'));
    await fireEvent.click(r.getByText('All'));
    await fireEvent.click(r.getByText('Tag', { selector: '.bulkbar button' }));
    await waitFor(() => r.getByRole('dialog', { name: 'Add a tag to 4' }));
    await fireEvent.input(r.getByLabelText('New tag'), { target: { value: 'Big Job' } });
    await fireEvent.keyDown(r.getByLabelText('New tag'), { key: 'Enter' });
    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(4));
    expect(updateTask).toHaveBeenCalledWith('task:b', { tags: ['tiles', 'big-job'] });
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    expect(bar(r.container)).toBe('4 selected');
    updateTask.mockRejectedValue(new Error('boom'));
    await fireEvent.click(r.getByText('Priority', { selector: '.bulkbar button' }));
    await waitFor(() => r.getByRole('dialog', { name: 'Priority for 4' }));
    await fireEvent.click(r.getByText('High', { selector: '.psheet .p-row' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not update some tasks. Please try again.'));
    expect(updateTask).toHaveBeenLastCalledWith('task:a', { priority: 3 });
  });
});
