import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

const getTagCounts = vi.fn();
const getTagColorOverrides = vi.fn();
const renameTag = vi.fn();
const deleteTagEverywhere = vi.fn();
const setTagColor = vi.fn();
vi.mock('../src/lib/db', () => ({
  getSpaces: vi.fn().mockResolvedValue([]),
  getCustomFieldDefs: vi.fn().mockResolvedValue([]),
  getTagCounts: (...a: unknown[]) => getTagCounts(...a),
  getTagColorOverrides: (...a: unknown[]) => getTagColorOverrides(...a),
  renameTag: (...a: unknown[]) => renameTag(...a),
  deleteTagEverywhere: (...a: unknown[]) => deleteTagEverywhere(...a),
  setTagColor: (...a: unknown[]) => setTagColor(...a),
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

import OrganizePage from '../src/lib/phone/settings/organize/OrganizePage.svelte';
import { showError, reloadTasks } from '../src/lib/store';
import { toast } from '../src/lib/phone/nav';
import { TAG_PALETTE } from '../src/lib/tagColors';

window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  getTagCounts.mockResolvedValue([{ tag: 'urgent', count: 2 }, { tag: 'home', count: 5 }, { tag: 'errand', count: 1 }]);
  getTagColorOverrides.mockResolvedValue({ home: TAG_PALETTE[3] });
  renameTag.mockResolvedValue(2);
  deleteTagEverywhere.mockResolvedValue(2);
  setTagColor.mockResolvedValue(undefined);
  toast.set(null);
});
afterEach(cleanup);

async function setup() {
  const r = render(OrganizePage);
  await fireEvent.click(r.getByRole('button', { name: 'Tags' }));
  await waitFor(() => r.getByText('#urgent'));
  return r;
}
async function openTag(r: Awaited<ReturnType<typeof setup>>, tag: string) {
  await fireEvent.click(r.getByText(`#${tag}`));
  await waitFor(() => r.getByRole('dialog'));
  return r.getByLabelText('Tag name') as HTMLInputElement;
}
async function typeName(input: HTMLInputElement, value: string) {
  await fireEvent.input(input, { target: { value } });
  await fireEvent.change(input);
}

describe('phone Organize → Tags', () => {
  it('lists tags with their counts', async () => {
    const r = await setup();
    const rows = [...r.container.querySelectorAll('.p-group .p-row')].map(b => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['#urgent 2', '#home 5', '#errand 1']);
  });

  it('shows an empty state with no tags', async () => {
    getTagCounts.mockResolvedValue([]);
    const r = render(OrganizePage);
    await fireEvent.click(r.getByRole('button', { name: 'Tags' }));
    await waitFor(() => r.getByText('No tags yet. Add them on a task.'));
  });

  it('renames (normalised to lowercase-dashes) and Undo renames back', async () => {
    const r = await setup();
    await typeName(await openTag(r, 'urgent'), ' Right Now ');
    await waitFor(() => expect(renameTag).toHaveBeenCalledWith('urgent', 'right-now'));
    expect(confirmAction).not.toHaveBeenCalled();
    expect(reloadTasks).toHaveBeenCalled();
    await waitFor(() => expect(get(toast)?.text).toBe('Renamed to #right-now'));
    await get(toast)!.undo!();
    expect(renameTag).toHaveBeenLastCalledWith('right-now', 'urgent');
  });

  it('an unchanged or empty name writes nothing', async () => {
    const r = await setup();
    const input = await openTag(r, 'urgent');
    await typeName(input, 'URGENT');
    await typeName(input, '   ');
    expect(input.value).toBe('urgent');
    expect(renameTag).not.toHaveBeenCalled();
  });

  it('renaming onto an existing tag asks to merge first', async () => {
    const r = await setup();
    const input = await openTag(r, 'urgent');
    confirmAction.mockResolvedValueOnce(false);
    await typeName(input, 'home');
    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith('Merge #urgent into #home? Its 2 tasks will be tagged #home instead.', { danger: true, confirmLabel: 'Merge' }));
    expect(renameTag).not.toHaveBeenCalled();
    expect(input.value).toBe('urgent');
    confirmAction.mockResolvedValueOnce(true);
    await typeName(input, 'home');
    await waitFor(() => expect(renameTag).toHaveBeenCalledWith('urgent', 'home'));
  });

  it('Merge into merges with one tap after the confirm', async () => {
    const r = await setup();
    await openTag(r, 'errand');
    confirmAction.mockResolvedValueOnce(true);
    const dialog = r.getByRole('dialog');
    await fireEvent.click([...dialog.querySelectorAll('.p-chip')].find(b => b.textContent === '#home')!);
    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith('Merge #errand into #home? Its 1 task will be tagged #home instead.', { danger: true, confirmLabel: 'Merge' }));
    await waitFor(() => expect(renameTag).toHaveBeenCalledWith('errand', 'home'));
    await waitFor(() => expect(get(toast)?.text).toBe('Merged into #home'));
  });

  it('a failed rename surfaces showError and restores the name', async () => {
    renameTag.mockRejectedValueOnce(new Error('x'));
    const r = await setup();
    const input = await openTag(r, 'urgent');
    await typeName(input, 'soon');
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to rename tag. Please try again.'));
    expect(input.value).toBe('urgent');
  });

  it('sets a colour override, or back to automatic', async () => {
    const r = await setup();
    await openTag(r, 'home');
    expect(r.getByLabelText(`Colour ${TAG_PALETTE[3]}`).getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(r.getByLabelText(`Colour ${TAG_PALETTE[0]}`));
    await waitFor(() => expect(setTagColor).toHaveBeenCalledWith('home', TAG_PALETTE[0]));
    await fireEvent.click(r.getByLabelText('Automatic'));
    await waitFor(() => expect(setTagColor).toHaveBeenLastCalledWith('home', null));
  });

  it('a failed colour change surfaces showError', async () => {
    setTagColor.mockRejectedValueOnce(new Error('x'));
    const r = await setup();
    await openTag(r, 'home');
    await fireEvent.click(r.getByLabelText('Automatic'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to update tag color. Please try again.'));
  });

  it('removing everywhere asks with the count, and only removes on yes', async () => {
    const r = await setup();
    await openTag(r, 'urgent');
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(r.getByText('Remove from 2 tasks'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith("Remove #urgent from 2 tasks? This can't be undone.", { danger: true, confirmLabel: 'Remove' }));
    expect(deleteTagEverywhere).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(r.getByText('Remove from 2 tasks'));
    await waitFor(() => expect(deleteTagEverywhere).toHaveBeenCalledWith('urgent'));
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('a failed remove surfaces showError', async () => {
    deleteTagEverywhere.mockRejectedValueOnce(new Error('x'));
    confirmAction.mockResolvedValueOnce(true);
    const r = await setup();
    await openTag(r, 'urgent');
    await fireEvent.click(r.getByText('Remove from 2 tasks'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to delete tag. Please try again.'));
  });
});
