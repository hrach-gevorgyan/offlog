import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get, type Writable } from 'svelte/store';
import type { ProjectDoc, TaskDoc } from '../src/lib/types';

const renameColumn = vi.fn();
const reorderColumns = vi.fn();
const removeColumn = vi.fn();
const addColumn = vi.fn();
const archiveColumnTasks = vi.fn();
const updateTask = vi.fn();
vi.mock('../src/lib/db', () => ({
  renameColumn: (...a: unknown[]) => renameColumn(...a),
  reorderColumns: (...a: unknown[]) => reorderColumns(...a),
  removeColumn: (...a: unknown[]) => removeColumn(...a),
  addColumn: (...a: unknown[]) => addColumn(...a),
  archiveColumnTasks: (...a: unknown[]) => archiveColumnTasks(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
  updateProject: vi.fn(),
  computeDropPosition: vi.fn(),
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(),
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    modalOpen: w(false),
    projects: w([]),
    activeProjectId: w(''),
    activeSpaceId: w(''),
    projectTasks: w([]),
  };
});

import StatusesScreen from '../src/lib/phone/StatusesScreen.svelte';
import { projects, projectTasks, showError, reloadTasks } from '../src/lib/store';
import { toast } from '../src/lib/phone/nav';

window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const cols = [{ id: 'col:todo', name: 'To do' }, { id: 'col:doing', name: 'Doing' }, { id: 'col:done', name: 'Done' }];
const project = { _id: 'project:p', type: 'project', space_id: 'space:h', name: 'House', position: 0, default_view: 'kanban', columns: cols, updated_at: '', source: '' } as ProjectDoc;
const task = (id: string, column_id: string) => ({ _id: id, project_id: 'project:p', column_id, title: id, tags: [], priority: 2, position: 0 }) as unknown as TaskDoc;

function setup(p: Partial<ProjectDoc> = {}) {
  (projects as Writable<ProjectDoc[]>).set([{ ...project, ...p }]);
  (projectTasks as Writable<TaskDoc[]>).set([task('task:1', 'col:todo'), task('task:2', 'col:doing'), task('task:3', 'col:doing')]);
  return render(StatusesScreen, { id: 'project:p' });
}
const names = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('input[aria-label^="Name of "]')].map(i => i.value);
async function menu(r: ReturnType<typeof setup>, name: string) {
  await fireEvent.click(r.getByLabelText(`More for ${name}`));
  await waitFor(() => r.getByRole('dialog'));
}

beforeEach(async () => {
  await new Promise(r => setTimeout(r, 20));
  vi.clearAllMocks();
  toast.set(null);
  const ok = (columns: typeof cols) => Promise.resolve({ ...project, columns });
  renameColumn.mockImplementation((_p, id, name) => ok(cols.map(c => (c.id === id ? { ...c, name } : c))));
  reorderColumns.mockImplementation((_p, c) => ok(c));
  removeColumn.mockImplementation((_p, id) => ok(cols.filter(c => c.id !== id)));
  addColumn.mockImplementation((_p, name) => ok([...cols, { id: 'col:new', name }]));
  archiveColumnTasks.mockResolvedValue(undefined);
  updateTask.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('phone Statuses screen', () => {
  it('lists statuses with their task counts and the done note', () => {
    const r = setup();
    expect(names(r.container)).toEqual(['To do', 'Doing', 'Done']);
    expect(r.getByLabelText('Name of Doing')).toBeTruthy();
    expect(r.queryByText(/added last/)).toBeNull();
    expect(r.getByText('House · the last status counts as done')).toBeTruthy();
    expect([...r.container.querySelectorAll('.n')].map(e => e.textContent)).toEqual(['1', '2', '0']);
  });

  it('renames on change; an empty name reverts; a failure reverts with an error', async () => {
    const r = setup();
    const input = r.getByLabelText('Name of Doing') as HTMLInputElement;
    input.value = 'Busy';
    await fireEvent.change(input);
    expect(renameColumn).toHaveBeenCalledWith('project:p', 'col:doing', 'Busy');
    await waitFor(() => expect(get(projects)[0].columns[1].name).toBe('Busy'));
    const first = r.getByLabelText('Name of To do') as HTMLInputElement;
    first.value = '  ';
    await fireEvent.change(first);
    expect(renameColumn).toHaveBeenCalledTimes(1);
    expect(first.value).toBe('To do');
    renameColumn.mockRejectedValue(new Error('boom'));
    first.value = 'Later';
    await fireEvent.change(first);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not rename this status. Please try again.'));
    expect(first.value).toBe('To do');
  });

  it('a typed name is saved when the screen goes before the field is left', async () => {
    const r = setup();
    await fireEvent.input(r.getByLabelText('Name of Doing'), { target: { value: ' Busy ' } });
    await fireEvent.input(r.getByLabelText('Name of Done'), { target: { value: 'Done' } });
    expect(renameColumn).not.toHaveBeenCalled();
    r.unmount();
    expect(renameColumn).toHaveBeenCalledTimes(1);
    expect(renameColumn).toHaveBeenCalledWith('project:p', 'col:doing', 'Busy');
    await waitFor(() => expect(get(projects)[0].columns[1].name).toBe('Busy'));
  });

  it('a name already saved on change is not saved again on the way out', async () => {
    const r = setup();
    const input = r.getByLabelText('Name of Doing') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Busy' } });
    await fireEvent.change(input);
    r.unmount();
    expect(renameColumn).toHaveBeenCalledTimes(1);
  });

  it('Move down that changes the last status reorders and says what is now done, with Undo', async () => {
    const r = setup();
    await menu(r, 'Doing');
    await fireEvent.click(r.getByText('Move down'));
    await waitFor(() => expect(reorderColumns).toHaveBeenCalledWith('project:p', [cols[0], cols[2], cols[1]]));
    await waitFor(() => expect(get(toast)?.text).toBe('“Doing” is last now, so its 2 task(s) count as done'));
    await get(toast)!.undo!();
    expect(reorderColumns).toHaveBeenLastCalledWith('project:p', cols);
  });

  it('Archive all its tasks archives them and Undo restores each', async () => {
    const r = setup();
    await menu(r, 'Doing');
    await fireEvent.click(r.getByText('Archive all its tasks'));
    await waitFor(() => expect(archiveColumnTasks).toHaveBeenCalledWith('project:p', 'col:doing'));
    expect(reloadTasks).toHaveBeenCalled();
    await waitFor(() => expect(get(toast)?.text).toBe('Archived 2 tasks'));
    await get(toast)!.undo!();
    expect(updateTask).toHaveBeenCalledWith('task:2', { archived: false });
    expect(updateTask).toHaveBeenCalledWith('task:3', { archived: false });
  });

  it('Remove status asks first, with the desktop warning for the last status', async () => {
    const r = setup();
    await menu(r, 'Done');
    await fireEvent.click(r.getByText('Remove status'));
    expect(removeColumn).not.toHaveBeenCalled();
    expect(r.getByText('It has no tasks. “Doing” then becomes the last status, so its 2 task(s) will count as done.')).toBeTruthy();
    await fireEvent.click(r.getByText('Remove status', { selector: '.p-go' }));
    await waitFor(() => expect(removeColumn).toHaveBeenCalledWith('project:p', 'col:done'));
    await waitFor(() => expect(names(r.container)).toEqual(['To do', 'Doing']));
  });

  it('a failed remove surfaces an error', async () => {
    removeColumn.mockRejectedValue(new Error('boom'));
    const r = setup();
    await menu(r, 'To do');
    await fireEvent.click(r.getByText('Remove status'));
    expect(r.getByText('Its 1 task(s) move to “Doing”.')).toBeTruthy();
    await fireEvent.click(r.getByText('Remove status', { selector: '.p-go' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not remove this status. Please try again.'));
  });

  it('adds a status', async () => {
    const r = setup();
    await fireEvent.input(r.getByLabelText('New status name'), { target: { value: 'Waiting' } });
    await fireEvent.click(r.getByText('Add'));
    expect(addColumn).toHaveBeenCalledWith('project:p', 'Waiting');
    // Inserted before the last status, so Done stays last.
    await waitFor(() => expect(names(r.container)).toEqual(['To do', 'Doing', 'Waiting', 'Done']));
    expect(reorderColumns).toHaveBeenLastCalledWith('project:p', [cols[0], cols[1], { id: 'col:new', name: 'Waiting' }, cols[2]]);
    addColumn.mockRejectedValue(new Error('boom'));
    await fireEvent.input(r.getByLabelText('New status name'), { target: { value: 'X' } });
    await fireEvent.keyDown(r.getByLabelText('New status name'), { key: 'Enter' });
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not add a status. Please try again.'));
  });

  it('in a one-status project the new status also goes before the done one', async () => {
    addColumn.mockImplementation((_p, name) => Promise.resolve({ ...project, columns: [cols[2], { id: 'col:new', name }] }));
    const r = setup({ columns: [cols[2]] });
    await fireEvent.input(r.getByLabelText('New status name'), { target: { value: 'Waiting' } });
    await fireEvent.click(r.getByText('Add'));
    await waitFor(() => expect(reorderColumns).toHaveBeenCalledWith('project:p', [{ id: 'col:new', name: 'Waiting' }, cols[2]]));
    await waitFor(() => expect(names(r.container)).toEqual(['Waiting', 'Done']));
  });

  it('added but not moved up: says so, and shows it where it is', async () => {
    reorderColumns.mockRejectedValue(new Error('boom'));
    const r = setup();
    await fireEvent.input(r.getByLabelText('New status name'), { target: { value: 'Waiting' } });
    await fireEvent.click(r.getByText('Add'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Added, but it is last, so its tasks count as done. Move it up.'));
    expect(names(r.container)).toEqual(['To do', 'Doing', 'Done', 'Waiting']);
    expect((r.getByLabelText('New status name') as HTMLInputElement).value).toBe('');
  });
});
