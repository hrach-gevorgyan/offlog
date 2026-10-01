import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get, type Writable } from 'svelte/store';
import type { ProjectDoc, SpaceDoc } from '../src/lib/types';

const getSpaces = vi.fn();
const createSpace = vi.fn();
const updateSpace = vi.fn();
const reorderSpaces = vi.fn();
const deleteSpace = vi.fn();
const findSpacesByName = vi.fn();
vi.mock('../src/lib/db', () => ({
  getSpaces: (...a: unknown[]) => getSpaces(...a),
  createSpace: (...a: unknown[]) => createSpace(...a),
  updateSpace: (...a: unknown[]) => updateSpace(...a),
  reorderSpaces: (...a: unknown[]) => reorderSpaces(...a),
  deleteSpace: (...a: unknown[]) => deleteSpace(...a),
  findSpacesByName: (...a: unknown[]) => findSpacesByName(...a),
  getTagCounts: vi.fn().mockResolvedValue([]),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return { showError: vi.fn(), reloadTasks: vi.fn().mockResolvedValue(undefined), modalOpen: w(false), projects: w([]) };
});
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', async () => {
  const { writable: w } = await import('svelte/store');
  return { confirmAction: (...a: unknown[]) => confirmAction(...a), confirmRequest: w(null) };
});

import SettingsPage from '../src/lib/phone/settings/SettingsPage.svelte';
import { projects, showError } from '../src/lib/store';
import { toast } from '../src/lib/phone/nav';
import { TAG_PALETTE } from '../src/lib/tagColors';

window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const sp = (id: string, name: string, position: number, extra: Partial<SpaceDoc> = {}) =>
  ({ _id: id, type: 'space', name, color: '#ef4444', position, ...extra }) as SpaceDoc;
const spaces = [sp('space:unsorted', 'Unsorted', 0), sp('space:a', 'Home', 1, { icon: 'home' }), sp('space:b', 'Work', 2)];

beforeEach(() => {
  vi.clearAllMocks();
  getSpaces.mockResolvedValue(spaces);
  createSpace.mockResolvedValue({});
  updateSpace.mockResolvedValue({});
  reorderSpaces.mockResolvedValue(undefined);
  deleteSpace.mockResolvedValue(undefined);
  findSpacesByName.mockResolvedValue([]);
  (projects as Writable<ProjectDoc[]>).set([
    { _id: 'project:1', space_id: 'space:a' }, { _id: 'project:2', space_id: 'space:a' },
  ] as ProjectDoc[]);
  toast.set(null);
});
afterEach(cleanup);

async function setup() {
  const r = render(SettingsPage, { page: 'organize' });
  await waitFor(() => r.getByText('Home'));
  return r;
}
async function openSpace(r: Awaited<ReturnType<typeof setup>>, name: string) {
  await fireEvent.click(r.getByText(name));
  await waitFor(() => r.getByRole('dialog'));
  return r.getByLabelText('Space name') as HTMLInputElement;
}

describe('phone Organize → Spaces', () => {
  it('lists spaces in order with their project counts', async () => {
    const r = await setup();
    expect(r.getByRole('heading', { name: 'Organize' })).toBeTruthy();
    const rows = [...r.container.querySelectorAll('.p-group .p-row')].map(b => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Unsorted 0', 'Home 2', 'Work 0', 'New space']);
  });

  it('creates a space with the picked colour and icon', async () => {
    const r = await setup();
    await fireEvent.click(r.getByText('New space'));
    await waitFor(() => r.getByRole('dialog'));
    const add = r.getByText('Add space') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await fireEvent.input(r.getByLabelText('Space name'), { target: { value: '  Garden ' } });
    await fireEvent.click(r.getByLabelText(`Colour ${TAG_PALETTE[0]}`));
    await fireEvent.click(r.getByLabelText('Icon briefcase'));
    await fireEvent.click(add);
    await waitFor(() => expect(createSpace).toHaveBeenCalledWith('Garden', TAG_PALETTE[0], 'briefcase'));
    expect(updateSpace).not.toHaveBeenCalled();
  });

  it('a new space defaults to indigo and the folder icon', async () => {
    const r = await setup();
    await fireEvent.click(r.getByText('New space'));
    await waitFor(() => r.getByRole('dialog'));
    await fireEvent.input(r.getByLabelText('Space name'), { target: { value: 'Garden' } });
    await fireEvent.keyDown(r.getByLabelText('Space name'), { key: 'Enter' });
    await waitFor(() => expect(createSpace).toHaveBeenCalledWith('Garden', '#6366F1', 'folder'));
  });

  it('hints, without blocking, when the name is already taken', async () => {
    findSpacesByName.mockResolvedValue([spaces[1]]);
    const r = await setup();
    await fireEvent.click(r.getByText('New space'));
    await waitFor(() => r.getByRole('dialog'));
    await fireEvent.input(r.getByLabelText('Space name'), { target: { value: 'home' } });
    await waitFor(() => r.getByText('“home” already exists.'));
    expect(findSpacesByName).toHaveBeenCalledWith('home', undefined);
    expect((r.getByText('Add space') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a failed create surfaces showError', async () => {
    createSpace.mockRejectedValueOnce(new Error('x'));
    const r = await setup();
    await fireEvent.click(r.getByText('New space'));
    await waitFor(() => r.getByRole('dialog'));
    await fireEvent.input(r.getByLabelText('Space name'), { target: { value: 'Garden' } });
    await fireEvent.click(r.getByText('Add space'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to create space. Please try again.'));
  });

  it('renames on change and offers Undo that renames back', async () => {
    const r = await setup();
    const input = await openSpace(r, 'Home');
    await fireEvent.input(input, { target: { value: ' House ' } });
    await fireEvent.change(input);
    await waitFor(() => expect(updateSpace).toHaveBeenCalledWith('space:a', { name: 'House' }));
    await waitFor(() => expect(get(toast)?.text).toBe('Renamed to House'));
    await get(toast)!.undo!();
    expect(updateSpace).toHaveBeenLastCalledWith('space:a', { name: 'Home' });
    expect(findSpacesByName).toHaveBeenCalledWith('House', 'space:a');
  });

  it('an empty or unchanged name writes nothing', async () => {
    const r = await setup();
    const input = await openSpace(r, 'Home');
    await fireEvent.input(input, { target: { value: '  ' } });
    await fireEvent.change(input);
    expect(input.value).toBe('Home');
    await fireEvent.change(input);
    expect(updateSpace).not.toHaveBeenCalled();
  });

  it('a failed rename restores the name and surfaces showError', async () => {
    updateSpace.mockRejectedValueOnce(new Error('x'));
    const r = await setup();
    const input = await openSpace(r, 'Home');
    await fireEvent.input(input, { target: { value: 'House' } });
    await fireEvent.change(input);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to rename space. Please try again.'));
    expect(input.value).toBe('Home');
  });

  it('recolours and re-icons a space in place', async () => {
    const r = await setup();
    await openSpace(r, 'Home');
    expect(r.getByLabelText('Icon home').getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(r.getByLabelText(`Colour ${TAG_PALETTE[14]}`));
    await waitFor(() => expect(updateSpace).toHaveBeenCalledWith('space:a', { color: TAG_PALETTE[14] }));
    await fireEvent.click(r.getByLabelText('Icon rocket'));
    await waitFor(() => expect(updateSpace).toHaveBeenCalledWith('space:a', { icon: 'rocket' }));
    const custom = r.getByLabelText('Any colour') as HTMLInputElement;
    await fireEvent.change(custom, { target: { value: '#123456' } });
    await waitFor(() => expect(updateSpace).toHaveBeenCalledWith('space:a', { color: '#123456' }));
  });

  it('colour and icon failures surface showError', async () => {
    updateSpace.mockRejectedValue(new Error('x'));
    const r = await setup();
    await openSpace(r, 'Home');
    await fireEvent.click(r.getByLabelText(`Colour ${TAG_PALETTE[14]}`));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to recolor space. Please try again.'));
    await fireEvent.click(r.getByLabelText('Icon rocket'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to change space icon. Please try again.'));
  });

  it('Move up / Move down swap neighbours; the ends are disabled', async () => {
    const r = await setup();
    await openSpace(r, 'Home');
    await fireEvent.click(r.getByText('Move down'));
    await waitFor(() => expect(reorderSpaces).toHaveBeenCalledWith(['space:unsorted', 'space:b', 'space:a']));
    await fireEvent.click(r.getByText('Move up'));
    await waitFor(() => expect(reorderSpaces).toHaveBeenLastCalledWith(['space:a', 'space:unsorted', 'space:b']));
    cleanup();
    const r2 = await setup();
    await openSpace(r2, 'Unsorted');
    expect((r2.getByText('Move up') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a failed reorder surfaces showError', async () => {
    reorderSpaces.mockRejectedValueOnce(new Error('x'));
    const r = await setup();
    await openSpace(r, 'Home');
    await fireEvent.click(r.getByText('Move down'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to reorder spaces. Please try again.'));
  });

  it('delete asks first, says where its projects go, and only deletes on yes', async () => {
    const r = await setup();
    await openSpace(r, 'Home');
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(r.getByText('Delete space'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith('Delete “Home”? Its 2 projects move to Unsorted.', { danger: true, confirmLabel: 'Delete' }));
    expect(deleteSpace).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(r.getByText('Delete space'));
    await waitFor(() => expect(deleteSpace).toHaveBeenCalledWith('space:a'));
    await waitFor(() => expect(get(toast)?.text).toBe('Deleted Home'));
  });

  it('an empty space deletes with the short question', async () => {
    const r = await setup();
    await openSpace(r, 'Work');
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(r.getByText('Delete space'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith('Delete “Work”?', { danger: true, confirmLabel: 'Delete' }));
    await waitFor(() => expect(deleteSpace).toHaveBeenCalledWith('space:b'));
  });

  it('a failed delete surfaces showError', async () => {
    deleteSpace.mockRejectedValueOnce(new Error('x'));
    confirmAction.mockResolvedValueOnce(true);
    const r = await setup();
    await openSpace(r, 'Home');
    await fireEvent.click(r.getByText('Delete space'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to delete space. Please try again.'));
  });

  it('Unsorted cannot be deleted', async () => {
    const r = await setup();
    await openSpace(r, 'Unsorted');
    expect(r.queryByText('Delete space')).toBeNull();
  });
});
