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
import { actions, addContext, stack, switchTab, push, toast } from '../src/lib/phone/nav';
import { toggleDone } from '../src/lib/phone/project/actions';
import { leaves, returns } from '../src/lib/phone/rowMotion';

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

// A title as seen: the screen-reader-only priority note left out.
const seen = (e: Element) => [...e.childNodes].filter(n => !(n as Element).classList?.contains('p-sr')).map(n => n.textContent).join('').trim();
const titles = (c: HTMLElement) => [...c.querySelectorAll('.card .t')].map(seen);
// A filter sheet chip by its label, its count left out.
const chip = (r: { getByText: (m: (c: string, e: Element | null) => boolean) => HTMLElement }, label: string) =>
  r.getByText((_, e) => !!e?.matches('.psheet .p-chip') && e.firstChild?.textContent === label);

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

describe('phone Project screen — board', () => {
  it('claims the active project and shows the first status with counts in every pill', async () => {
    const { getByRole, container, getByText } = setup();
    expect(get(activeProjectId)).toBe('project:p');
    expect(getByRole('tab', { name: 'To do 3' }).getAttribute('aria-selected')).toBe('true');
    expect(getByRole('tab', { name: 'Doing 1' })).toBeTruthy();
    expect(titles(container)).toEqual(['a', 'b', 'c']);
    expect([...container.querySelectorAll('.card .p-sr')].map(e => e.textContent)).toContain(', high priority');
    // Priority tints the finish ring instead of a colour-only side bar.
    expect(container.querySelector('.chk.prio')?.getAttribute('style')).toContain('--prio');
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
    expect(getByText('Tick a task to finish it.')).toBeTruthy();
    await fireEvent.touchStart(body, { touches: [{ clientX: 100, clientY: 100 }] });
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: 180, clientY: 300 }] });
    expect(getByText('Tick a task to finish it.')).toBeTruthy();
    await fireEvent.touchStart(body, { touches: [{ clientX: 100, clientY: 100 }] });
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: 250, clientY: 110 }] });
    expect(titles(container)).toEqual(['d']);
  });

  it('the pane follows a sideways drag, gives at the ends, and springs back when let go short', async () => {
    const { container } = setup();
    const body = container.querySelector('[role="tabpanel"]')!;
    const pane = () => container.querySelector('.pane') as HTMLElement;
    await fireEvent.touchStart(body, { touches: [{ clientX: 300, clientY: 100 }] });
    await fireEvent.touchMove(body, { touches: [{ clientX: 260, clientY: 102 }] });
    expect(pane().style.transform).toBe('translateX(-40px)');
    expect(pane().classList.contains('dragging')).toBe(true);
    // Back past the first status: a third of the finger's travel.
    await fireEvent.touchMove(body, { touches: [{ clientX: 390, clientY: 102 }] });
    expect(pane().style.transform).toBe('translateX(30px)');
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: 390, clientY: 102 }] });
    expect(pane().style.transform).toBe('');
    expect(titles(container)).toEqual(['a', 'b', 'c']);
  });

  it('a vertical drag never moves the pane; a drag from the screen edge is left to the system', async () => {
    const { container, getByRole } = setup();
    const body = container.querySelector('[role="tabpanel"]')!;
    const pane = () => container.querySelector('.pane') as HTMLElement;
    await fireEvent.touchStart(body, { touches: [{ clientX: 200, clientY: 100 }] });
    await fireEvent.touchMove(body, { touches: [{ clientX: 205, clientY: 140 }] });
    await fireEvent.touchMove(body, { touches: [{ clientX: 300, clientY: 150 }] });
    expect(pane().style.transform).toBe('');
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: 300, clientY: 150 }] });
    await fireEvent.touchStart(body, { touches: [{ clientX: window.innerWidth - 10, clientY: 100 }] });
    await fireEvent.touchMove(body, { touches: [{ clientX: window.innerWidth - 200, clientY: 100 }] });
    await fireEvent.touchEnd(body, { changedTouches: [{ clientX: window.innerWidth - 200, clientY: 100 }] });
    expect(pane().style.transform).toBe('');
    expect(getByRole('tab', { name: 'To do 3' }).getAttribute('aria-selected')).toBe('true');
  });

  it('an empty status offers Add a task; the empty last status offers a hint instead', async () => {
    const spy = vi.spyOn(actions, 'quickAdd').mockImplementation(() => {});
    const { getByRole, getByText, queryByText } = setup({}, tasks.slice(0, 3));
    await fireEvent.click(getByRole('tab', { name: 'Doing 0' }));
    await fireEvent.click(getByText('Add a task'));
    expect(spy).toHaveBeenCalled();
    await fireEvent.click(getByRole('tab', { name: 'Done 0' }));
    expect(getByText('Tick a task to finish it.')).toBeTruthy();
    expect(queryByText('Add a task')).toBeNull();
  });

  it('+ adds to the status on show, but never to the last one: a task added there would be born finished', async () => {
    const { getByRole } = setup();
    await fireEvent.click(getByRole('tab', { name: 'Doing 1' }));
    expect(get(addContext)).toEqual({ projectId: 'project:p', columnId: 'col:doing' });
    await fireEvent.click(getByRole('tab', { name: /^Done/ }));
    expect(get(addContext)).toEqual({ projectId: 'project:p', columnId: null });
  });

  it('a one-status project still offers Add a task when empty', () => {
    const r = setup({ columns: [{ id: 'col:todo', name: 'To do' }] }, []);
    expect(r.getByText('Add a task')).toBeTruthy();
  });

  it('the last status pill is marked as the done one; there are no page dots', () => {
    const { getByRole, container } = setup();
    expect(getByRole('tab', { name: 'Done 0' }).classList.contains('last')).toBe(true);
    expect(getByRole('tab', { name: 'To do 3' }).classList.contains('last')).toBe(false);
    expect(container.querySelector('.dots')).toBeNull();
  });

  it('the header sits on a band in the space colour; ink is whichever contrasts more (dark on this mid blue)', () => {
    const { container } = setup();
    const band = container.querySelector('.band') as HTMLElement;
    expect(band.style.getPropertyValue('--band')).toContain('#3b82f6');
    // #3b82f6: white 3.7:1, page ink 4.1:1.
    expect(band.classList.contains('light')).toBe(false);
    expect(band.querySelector('h1')?.textContent).toBe('House');
  });

  it('the title may wrap to two lines', () => {
    const { container } = setup();
    expect(container.querySelector('h1')?.classList.contains('wrap')).toBe(true);
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
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not update this task. Please try again.'));
    // The check filled on the tap; it empties again.
    await waitFor(() => expect(getByLabelText('Finish: a').classList.contains('on')).toBe(false));
  });

  it('finishing marks the card to collapse out of its status; Undo marks it to grow back', async () => {
    await toggleDone(tasks[0], project);
    expect(leaves('task:a')).toBe(true);
    await get(toast)!.undo!();
    expect(returns('task:a')).toBe(true);
  });

  it('a one-status project has no finish checkbox', () => {
    const r = setup({ columns: [{ id: 'col:todo', name: 'To do' }] });
    expect(titles(r.container)).toEqual(['a', 'b', 'c']);
    expect(r.container.querySelector('.chk')).toBeNull();
  });

  it('finishing does nothing in a one-status project', async () => {
    await toggleDone(tasks[0], { ...project, columns: [{ id: 'col:todo', name: 'To do' }] });
    expect(updateTask).not.toHaveBeenCalled();
    expect(get(toast)).toBeNull();
  });

  it('Board or List is kept on this device, never written to the synced project', async () => {
    const r = setup();
    expect(r.getByRole('button', { name: 'Board' }).getAttribute('aria-pressed')).toBe('true');
    expect(r.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(r.getByRole('button', { name: 'List' }));
    expect(await r.findByLabelText('Search tasks')).toBeTruthy();
    expect(r.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('offlog_phone_view_project:p')).toBe('list');
    expect(updateProject).not.toHaveBeenCalled();
    // Tapping the view on show changes nothing.
    await fireEvent.click(r.getByRole('button', { name: 'List' }));
    expect(r.getByLabelText('Search tasks')).toBeTruthy();
    cleanup();
    // The desktop's default_view no longer decides once this device chose.
    const again = setup({ default_view: 'kanban' });
    expect(again.getByLabelText('Search tasks')).toBeTruthy();
    await fireEvent.click(again.getByRole('button', { name: 'Board' }));
    expect(localStorage.getItem('offlog_phone_view_project:p')).toBe('board');
    expect(again.queryByLabelText('Search tasks')).toBeNull();
  });

  it('without a choice on this device, the first open follows default_view', () => {
    const r = setup({ default_view: 'list' });
    expect(r.getByLabelText('Search tasks')).toBeTruthy();
  });

  it('status and filter survive leaving the screen and coming back', async () => {
    push({ k: 'project', id: 'project:p' });
    const r = setup();
    await fireEvent.click(r.getByRole('tab', { name: 'Doing 1' }));
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    await fireEvent.click(chip(r, 'Medium'));
    await fireEvent.click(r.getByText('Show 3 tasks'));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    cleanup();
    const back = render(ProjectScreen, { id: 'project:p' });
    expect(back.getByRole('tab', { name: 'Doing 1' }).getAttribute('aria-selected')).toBe('true');
    expect(back.getByLabelText('Filter, 1 on')).toBeTruthy();
    expect(titles(back.container)).toEqual(['d']);
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

  it('Move to status appends after every card there, filtered-out ones included', async () => {
    const r = setup();
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    await fireEvent.click(chip(r, 'High'));
    await fireEvent.click(r.getByText('Show 1 task'));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await openMenu(r, 'c');
    await fireEvent.click(r.getByRole('button', { name: 'Doing' }));
    // d, hidden by the filter, sits at 500 in Doing.
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:c', { column_id: 'col:doing', position: 1524 }));
  });

  it('Move up steps past the visible neighbour without jumping a hidden card', async () => {
    const r = setup({}, [
      task('task:x', { position: 500 }),
      task('task:a', { position: 1024, priority: 3 }),
      task('task:c', { position: 3072, priority: 3 }),
    ]);
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    await fireEvent.click(chip(r, 'High'));
    await fireEvent.click(r.getByText('Show 2 tasks'));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await openMenu(r, 'c');
    await fireEvent.click(r.getByText('Move up'));
    // Between hidden x (500) and a (1024), not before x.
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:c', { position: 762 }));
  });

  it('the status pills move a task in one tap: appended to the end, with Undo', async () => {
    const r = setup();
    await openMenu(r, 'a');
    expect(r.getByRole('button', { name: 'To do' }).getAttribute('aria-pressed')).toBe('true');
    expect(r.queryByText('Move to status…')).toBeNull();
    await fireEvent.click(r.getByRole('button', { name: 'Doing' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:doing', position: 1524 }));
    expect(reloadTasks).toHaveBeenCalled();
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    expect(get(toast)?.text).toBe('Moved to Doing');
    await get(toast)!.undo!();
    expect(updateTask).toHaveBeenLastCalledWith('task:a', expect.objectContaining({ column_id: 'col:todo', position: 1024 }));
  });

  it('the last status pill finishes the task, as the checkbox does; a failure surfaces an error', async () => {
    const r = setup();
    await openMenu(r, 'a');
    await fireEvent.click(r.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:a', { column_id: 'col:done' }));
    await waitFor(() => expect(get(toast)?.text).toBe('Done: a'));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    updateTask.mockRejectedValue(new Error('boom'));
    await openMenu(r, 'b');
    await fireEvent.click(r.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not update this task. Please try again.'));
  });

  it('a failed status move surfaces an error', async () => {
    updateTask.mockRejectedValue(new Error('boom'));
    const r = setup();
    await openMenu(r, 'a');
    await fireEvent.click(r.getByRole('button', { name: 'Doing' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not move this task. Please try again.'));
  });

  it('a one-status project has no status pills in the card menu', async () => {
    const r = setup({ columns: [{ id: 'col:todo', name: 'To do' }] });
    await openMenu(r, 'a');
    expect(r.container.ownerDocument.querySelector('.psheet [aria-label="Status"]')).toBeNull();
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

  it('Pin, Archive and Delete write and reload; Undo puts them back; failures surface errors', async () => {
    const r = setup();
    await openMenu(r, 'a');
    await fireEvent.click(r.getByText('Pin'));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('task:a', { pinned: true }));
    await waitFor(() => expect(get(toast)?.text).toBe('Pinned'));
    await get(toast)!.undo!();
    expect(updateTask).toHaveBeenLastCalledWith('task:a', { pinned: false });
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await openMenu(r, 'a');
    await fireEvent.click(r.getByText('Archive'));
    await waitFor(() => expect(archiveTask).toHaveBeenCalledWith('task:a'));
    await waitFor(() => expect(get(toast)?.text).toBe('Archived'));
    await get(toast)!.undo!();
    expect(updateTask).toHaveBeenLastCalledWith('task:a', { archived: false, archivedWithProject: false });
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    deleteTask.mockRejectedValue(new Error('boom'));
    await openMenu(r, 'a');
    await fireEvent.click(r.getByText('Delete'));
    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith('task:a'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not delete this task. Please try again.'));
  });

  it('Duplicate duplicates the task; a failure surfaces an error', async () => {
    const r = setup();
    await openMenu(r, 'b');
    await fireEvent.click(r.getByText('Duplicate'));
    await waitFor(() => expect(duplicateTask).toHaveBeenCalledWith('task:b'));
    expect(reloadTasks).toHaveBeenCalled();
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    duplicateTask.mockRejectedValue(new Error('boom'));
    await openMenu(r, 'b');
    await fireEvent.click(r.getByText('Duplicate'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not duplicate this task. Please try again.'));
  });
});

describe('phone Project screen — filter', () => {
  it('filters the board by priority and tag, and Clear restores it', async () => {
    const r = setup();
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    await fireEvent.click(chip(r, 'High'));
    await fireEvent.click(r.getByText('Show 1 task'));
    await waitFor(() => expect(titles(r.container)).toEqual(['c']));
    expect(r.getByLabelText('Filter, 1 on')).toBeTruthy();
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    await fireEvent.click(r.getByText('Clear'));
    expect(titles(r.container)).toEqual(['a', 'b', 'c']);
  });

  it("the sheet's Clear keeps List's search text", async () => {
    const r = setup({ default_view: 'list' });
    await fireEvent.input(r.getByLabelText('Search tasks'), { target: { value: 'a' } });
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    await fireEvent.click(chip(r, 'High'));
    await fireEvent.click(r.getByText('Clear', { selector: '.psheet .p-tbtn' }));
    await waitFor(() => expect(r.queryByRole('dialog')).toBeNull());
    expect((r.getByLabelText('Search tasks') as HTMLInputElement).value).toBe('a');
    expect([...r.container.querySelectorAll('.rows .t')].map(seen)).toEqual(['a']);
  });

  it('each chip counts what it would show with the rest of the draft; a chip that would show nothing is dimmed', async () => {
    const r = setup();
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    const k = (l: string) => chip(r, l).querySelector('i')?.textContent;
    expect([k('To do'), k('Doing'), k('Done'), k('High'), k('Medium'), k('Low')]).toEqual(['3', '1', '0', '1', '3', '0']);
    expect(chip(r, 'Done').classList.contains('none')).toBe(true);
    await fireEvent.click(chip(r, 'High'));
    expect([k('To do'), k('Doing'), k('#tiles')]).toEqual(['1', '0', '0']);
    expect(chip(r, 'Doing').classList.contains('none')).toBe(true);
    expect(chip(r, 'High').classList.contains('none')).toBe(false);
  });

  it('saves a filter under the desktop key and applies it later', async () => {
    localStorage.removeItem('offlog_saved_filters_project:p');
    const r = setup();
    await fireEvent.click(r.getByLabelText('Filter'));
    await waitFor(() => r.getByRole('dialog', { name: 'Filter' }));
    // Nothing to save until a chip is chosen.
    expect(r.queryByLabelText('Filter name')).toBeNull();
    await fireEvent.click(chip(r, '#tiles'));
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
    await get(toast)!.undo!();
    expect(updateProject).toHaveBeenLastCalledWith('project:p', { pinned: false });
    expect(get(projects)[0].pinned).toBe(false);
  });

  it('has no Opens as row; Board or List lives on the meta line', async () => {
    const r = setup();
    await openMore(r);
    expect(r.queryByText('Opens as')).toBeNull();
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

  it('Delete project asks first, then deletes and leaves the screen; a failure surfaces an error', async () => {
    push({ k: 'project', id: 'project:p' });
    deleteProject.mockRejectedValueOnce(new Error('boom'));
    const r = setup();
    await openMore(r);
    await fireEvent.click(r.getByText('Delete project'));
    expect(deleteProject).not.toHaveBeenCalled();
    expect(r.container.ownerDocument.querySelector('.psheet .p-say')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('Deletes House and its 4 tasks. Can’t be undone.');
    await fireEvent.click(r.getByText('Delete project', { selector: '.p-go' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not delete this project. Please try again.'));
    expect(get(stack).map(s => s.k)).toEqual(['home', 'project']);
    await fireEvent.click(r.getByText('Delete project', { selector: '.p-go' }));
    await waitFor(() => expect(deleteProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(get(stack).map(s => s.k)).toEqual(['home']));
    expect(get(activeProjectId)).toBe('');
    expect(get(projects)).toEqual([]);
  });

  it('the delete confirmation counts archived tasks too', async () => {
    getArchivedTasksForProject.mockResolvedValue([task('task:old', { archived: true })]);
    const r = setup({}, [tasks[0]]);
    await openMore(r);
    await waitFor(() => expect(getArchivedTasksForProject).toHaveBeenCalled());
    await fireEvent.click(r.getByText('Delete project'));
    await waitFor(() => expect(r.container.ownerDocument.querySelector('.psheet .p-say')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('Deletes House and its 2 tasks, archived ones included. Can’t be undone.'));
  });
});
