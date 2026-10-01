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
import { projects, projectTasks, activeProjectId, showError, reloadTasks } from '../src/lib/store';
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
  switchTab('home');
});
afterEach(cleanup);

describe('phone Project screen — board', () => {
  it('claims the active project and shows the first status with counts in every pill', async () => {
    const { getByRole, container, getByText } = setup();
    expect(get(activeProjectId)).toBe('project:p');
    expect(getByRole('tab', { name: 'To do 3' }).getAttribute('aria-selected')).toBe('true');
    expect(getByRole('tab', { name: 'Doing 1' })).toBeTruthy();
    expect(titles(container)).toEqual(['a', 'b', 'c']);
    expect(getByText('Home · 4 open')).toBeTruthy();
    await waitFor(() => expect(getByText('Blocked')).toBeTruthy());
  });

  it('a pill or a sideways swipe changes the status shown; a vertical drag does not', async () => {
    const { getByRole, container, getByText } = setup();
    await fireEvent.click(getByRole('tab', { name: 'Doing 1' }));
    expect(titles(container)).toEqual(['d']);
    const body = container.querySelector('[role="tabpanel"]')!;
    await fireEvent.touchStart(body, { touches: [{ clientX: 300, clientY: 100 }] });
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: 150, clientY: 110 }] });
    expect(getByText('Nothing in Done.')).toBeTruthy();
    await fireEvent.touchStart(body, { touches: [{ clientX: 100, clientY: 100 }] });
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: 180, clientY: 300 }] });
    expect(getByText('Nothing in Done.')).toBeTruthy();
    await fireEvent.touchStart(body, { touches: [{ clientX: 100, clientY: 100 }] });
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: 250, clientY: 110 }] });
    expect(titles(container)).toEqual(['d']);
  });

  it('an empty status offers Add a task', async () => {
    const spy = vi.spyOn(actions, 'quickAdd').mockImplementation(() => {});
    const { getByRole, getByText } = setup();
    await fireEvent.click(getByRole('tab', { name: 'Done 0' }));
    await fireEvent.click(getByText('Add a task'));
    expect(spy).toHaveBeenCalled();
  });

  it('tapping a card opens it; the checkbox finishes it and offers Undo', async () => {
    const open = vi.spyOn(actions, 'openTask').mockImplementation(() => {});
    const { getByText, getByLabelText } = setup();
    await fireEvent.click(getByText('a'));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task:a' }));
    await fireEvent.click(getByLabelText('Finish: a'));
    expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:done' });
    await waitFor(() => expect(get(toast)?.text).toBe('Done: a'));
    await get(toast)!.undo!();
    expect(updateTask).toHaveBeenLastCalledWith('task:a', expect.objectContaining({ column_id: 'col:todo', position: 1024 }));
  });

  it('a failed finish surfaces an error', async () => {
    updateTask.mockRejectedValue(new Error('boom'));
    const { getByLabelText } = setup();
    await fireEvent.click(getByLabelText('Finish: a'));
    await waitFor(() => expect(showError).toHaveBeenCalled());
  });

  it('the view toggle persists default_view, and reverts with an error when the write fails', async () => {
    const { getByLabelText, findByLabelText } = setup();
    await fireEvent.click(getByLabelText('Show as list'));
    expect(updateProject).toHaveBeenCalledWith('project:p', { default_view: 'list' });
    expect(await findByLabelText('Search tasks')).toBeTruthy();
    updateProject.mockRejectedValue(new Error('boom'));
    await fireEvent.click(getByLabelText('Show as board'));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(get(projects)[0].default_view).toBe('list');
  });
});

describe('phone Project screen — card menu', () => {
  async function openMenu(r: ReturnType<typeof setup>, title: string) {
    await fireEvent.contextMenu(r.getByText(title));
    await waitFor(() => r.getByRole('dialog'));
  }

  it('holding a card opens its menu', async () => {
    vi.useFakeTimers();
    const r = setup();
    await fireEvent.pointerDown(r.getByText('b'), { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    await waitFor(() => expect(r.getByRole('dialog', { name: 'b' })).toBeTruthy());
  });

  it('Move to status appends to the end of the target status', async () => {
    const r = setup();
    await openMenu(r, 'a');
    await fireEvent.click(r.getByText('Move to status…'));
    await fireEvent.click(r.getByText('Doing', { selector: '.psheet .p-row' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:doing', position: 1524 }));
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('Move up / Move down step between neighbours', async () => {
    const r = setup();
    await openMenu(r, 'b');
    await fireEvent.click(r.getByText('Move up'));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:b', { position: 512 }));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await openMenu(r, 'b');
    await fireEvent.click(r.getByText('Move down'));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:b', { position: 4096 }));
  });

  it('Pin, Archive and Delete write and reload; failures surface errors', async () => {
    const r = setup();
    await openMenu(r, 'a');
    await fireEvent.click(r.getByText('Pin'));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:a', { pinned: true }));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await openMenu(r, 'a');
    await fireEvent.click(r.getByText('Archive'));
    await waitFor(() => expect(archiveTask).toHaveBeenCalledWith('task:a'));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    deleteTask.mockRejectedValue(new Error('boom'));
    await openMenu(r, 'a');
    await fireEvent.click(r.getByText('Delete'));
    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith('task:a'));
    await waitFor(() => expect(showError).toHaveBeenCalled());
  });
});

describe('phone Project screen — filter', () => {
  it('filters the board by priority and tag, and Clear restores it', async () => {
    const r = setup();
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    await fireEvent.click(r.getByText('High'));
    await fireEvent.click(r.getByText('Show 1 task'));
    await waitFor(() => expect(titles(r.container)).toEqual(['c']));
    expect(r.getByLabelText('Filter, 1 on')).toBeTruthy();
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await fireEvent.click(r.getByText('Clear'));
    expect(titles(r.container)).toEqual(['a', 'b', 'c']);
  });

  it('saves a filter under the desktop key and applies it later', async () => {
    localStorage.removeItem('offlog_saved_filters_project:p');
    const r = setup();
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    await fireEvent.click(r.getByText('#tiles', { selector: '.psheet .p-chip' }));
    await fireEvent.input(r.getByLabelText('Filter name'), { target: { value: 'Tiles' } });
    await fireEvent.click(r.getByText('Save'));
    expect(JSON.parse(localStorage.getItem('offlog_saved_filters_project:p')!)).toEqual([
      { name: 'Tiles', search: '', filterCol: '', filterPrio: 0, filterTag: 'tiles', customFieldFilters: [] },
    ]);
    await fireEvent.click(r.getByText('Tiles'));
    await waitFor(() => expect(titles(r.container)).toEqual(['b']));
  });
});

describe('phone Project screen — project menu', () => {
  async function openMore(r: ReturnType<typeof setup>) {
    await fireEvent.click(r.getByLabelText('More'));
    await waitFor(() => r.getByRole('dialog', { name: 'House' }));
  }

  it('Edit statuses pushes the statuses screen once the sheet has closed', async () => {
    push({ k: 'project', id: 'project:p' });
    const r = setup();
    await openMore(r);
    await fireEvent.click(r.getByText('Edit statuses'));
    await waitFor(() => expect(get(stack).at(-1)).toMatchObject({ k: 'statuses', id: 'project:p' }));
  });

  it('Pin project writes pinned and offers Undo', async () => {
    const r = setup();
    await openMore(r);
    await fireEvent.click(r.getByText('Pin project'));
    await waitFor(() => expect(updateProject).toHaveBeenCalledWith('project:p', { pinned: true }));
    await waitFor(() => expect(get(toast)?.text).toBe('Project pinned'));
  });

  it('Archived tasks lists them with Restore', async () => {
    getArchivedTasksForProject.mockResolvedValue([task('task:old', { archived: true })]);
    const r = setup();
    await openMore(r);
    await fireEvent.click(r.getByText('Archived tasks'));
    await fireEvent.click(await r.findByText('Restore'));
    await waitFor(() => expect(unarchiveTask).toHaveBeenCalledWith('task:old'));
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('Archive project acts at once, leaves the screen and offers Undo', async () => {
    push({ k: 'project', id: 'project:p' });
    const r = setup();
    await openMore(r);
    await fireEvent.click(r.getByText('Archive project'));
    await waitFor(() => expect(archiveProject).toHaveBeenCalledWith('project:p'));
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home']));
    expect(get(activeProjectId)).toBe('');
    await get(toast)!.undo!();
    expect(unarchiveProject).toHaveBeenCalledWith('project:p');
  });

  it('Delete project asks first, then deletes; a failure surfaces an error', async () => {
    deleteProject.mockRejectedValueOnce(new Error('boom'));
    const r = setup();
    await openMore(r);
    await fireEvent.click(r.getByText('Delete project'));
    expect(deleteProject).not.toHaveBeenCalled();
    await fireEvent.click(r.getByText('Delete project', { selector: '.p-go' }));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    await fireEvent.click(r.getByText('Delete project', { selector: '.p-go' }));
    await waitFor(() => expect(deleteProject).toHaveBeenCalledTimes(2));
  });
});
