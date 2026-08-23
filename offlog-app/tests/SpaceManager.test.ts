import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import type { SpaceDoc } from '../src/lib/types';

// Deleting a space is the destructive path here: it never deletes the
// space's projects, it moves them to Unsorted, and the confirmation the
// user sees has to say so. These cover that contract plus the failure
// handling on every mutating call.
const getSpaces = vi.fn().mockResolvedValue([]);
const createSpace = vi.fn().mockResolvedValue(undefined);
const updateSpace = vi.fn().mockResolvedValue(undefined);
const deleteSpace = vi.fn().mockResolvedValue(undefined);
const reorderSpaces = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/db', () => ({
  getSpaces: (...a: unknown[]) => getSpaces(...a),
  createSpace: (...a: unknown[]) => createSpace(...a),
  updateSpace: (...a: unknown[]) => updateSpace(...a),
  deleteSpace: (...a: unknown[]) => deleteSpace(...a),
  reorderSpaces: (...a: unknown[]) => reorderSpaces(...a),
  findSpacesByName: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));

const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  showError: (...a: unknown[]) => showError(...a),
}));

const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({
  confirmAction: (...a: unknown[]) => confirmAction(...a),
}));

vi.mock('../src/lib/modalStack', () => ({
  closeOnBack: (cb: () => void) => cb,
}));

import SpaceManager from '../src/lib/SpaceManager.svelte';

function mkSpace(overrides: Partial<SpaceDoc> = {}): SpaceDoc {
  return {
    _id: 'space:work', type: 'space', name: 'Work', color: '#6366f1',
    position: 1, updated_at: '2026-03-01T00:00:00.000Z', source: 'PC',
    ...overrides,
  };
}

const UNSORTED = mkSpace({ _id: 'space:unsorted', name: 'Unsorted', position: 0 });

beforeEach(() => {
  getSpaces.mockClear().mockResolvedValue([]);
  createSpace.mockClear().mockResolvedValue(undefined);
  updateSpace.mockClear().mockResolvedValue(undefined);
  deleteSpace.mockClear().mockResolvedValue(undefined);
  reorderSpaces.mockClear().mockResolvedValue(undefined);
  showError.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
});

afterEach(() => cleanup());

async function renderWith(items: SpaceDoc[]) {
  getSpaces.mockResolvedValue(items);
  const utils = render(SpaceManager);
  if (items.length) await waitFor(() => utils.getByText(items[0].name));
  return utils;
}

describe('SpaceManager delete', () => {
  it('deletes a space by id after a danger confirmation that says projects move to Unsorted', async () => {
    const { getByLabelText } = await renderWith([UNSORTED, mkSpace()]);

    await fireEvent.click(getByLabelText('Delete space'));

    await waitFor(() => expect(deleteSpace).toHaveBeenCalledWith('space:work'));
    const [message, opts] = confirmAction.mock.calls[0];
    expect(message).toContain('Work');
    expect(message).toContain('Unsorted');
    expect(opts.danger).toBe(true);
  });

  it('does not delete when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByLabelText } = await renderWith([UNSORTED, mkSpace()]);

    await fireEvent.click(getByLabelText('Delete space'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(deleteSpace).not.toHaveBeenCalled();
  });

  it('shows an error when the delete fails', async () => {
    deleteSpace.mockRejectedValueOnce(new Error('conflict'));
    const { getByLabelText } = await renderWith([UNSORTED, mkSpace()]);

    await fireEvent.click(getByLabelText('Delete space'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });

  it('offers no delete control for Unsorted — it is the fallback space', async () => {
    const { getAllByLabelText, getByText } = await renderWith([UNSORTED, mkSpace()]);

    await waitFor(() => getByText('Unsorted'));
    // Two spaces rendered, one delete button: the Unsorted row has none.
    expect(getAllByLabelText('Delete space')).toHaveLength(1);
  });
});

describe('SpaceManager rename', () => {
  it('writes the trimmed new name', async () => {
    const { getByText, getByDisplayValue } = await renderWith([mkSpace()]);

    await fireEvent.click(getByText('Work'));
    const input = getByDisplayValue('Work') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '  Renamed  ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(updateSpace).toHaveBeenCalledWith('space:work', { name: 'Renamed' }));
  });

  it('writes nothing when the name is unchanged or blanked', async () => {
    const { getByText, getByDisplayValue } = await renderWith([mkSpace()]);

    await fireEvent.click(getByText('Work'));
    const input = getByDisplayValue('Work') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '   ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => getByText('Work'));
    expect(updateSpace).not.toHaveBeenCalled();
  });

  it('discards the edit on Escape instead of saving it', async () => {
    const { getByText, getByDisplayValue } = await renderWith([mkSpace()]);

    await fireEvent.click(getByText('Work'));
    const input = getByDisplayValue('Work') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Abandoned' } });
    await fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => getByText('Work'));
    expect(updateSpace).not.toHaveBeenCalled();
  });

  it('shows an error when the rename fails', async () => {
    updateSpace.mockRejectedValueOnce(new Error('offline'));
    const { getByText, getByDisplayValue } = await renderWith([mkSpace()]);

    await fireEvent.click(getByText('Work'));
    const input = getByDisplayValue('Work') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Renamed' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });
});

describe('SpaceManager create and reorder', () => {
  it('creates a space with the typed name, colour and icon', async () => {
    const { getByText, getByPlaceholderText } = await renderWith([]);

    await fireEvent.click(getByText('+ New space'));
    const input = getByPlaceholderText('Space name…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '  Side projects  ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(createSpace).toHaveBeenCalledTimes(1));
    const [name, color, icon] = createSpace.mock.calls[0];
    expect(name).toBe('Side projects');
    expect(color).toBe('#6366f1');
    expect(typeof icon).toBe('string');
  });

  it('creates nothing when the name is left blank', async () => {
    const { getByText, getByPlaceholderText } = await renderWith([]);

    await fireEvent.click(getByText('+ New space'));
    await fireEvent.blur(getByPlaceholderText('Space name…'));

    await waitFor(() => getByText('+ New space'));
    expect(createSpace).not.toHaveBeenCalled();
  });

  it('shows an error when creating fails', async () => {
    createSpace.mockRejectedValueOnce(new Error('offline'));
    const { getByText, getByPlaceholderText } = await renderWith([]);

    await fireEvent.click(getByText('+ New space'));
    const input = getByPlaceholderText('Space name…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Nope' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });

  it('reorders by writing the full swapped id order', async () => {
    const a = mkSpace({ _id: 'space:a', name: 'Alpha', position: 0 });
    const b = mkSpace({ _id: 'space:b', name: 'Beta', position: 1 });
    const { getAllByLabelText } = await renderWith([a, b]);

    await fireEvent.click(getAllByLabelText('Move down')[0]);

    await waitFor(() => expect(reorderSpaces).toHaveBeenCalledWith(['space:b', 'space:a']));
  });

  it('shows an error when the reorder fails', async () => {
    reorderSpaces.mockRejectedValueOnce(new Error('offline'));
    const { getAllByLabelText } = await renderWith([
      mkSpace({ _id: 'space:a', name: 'Alpha' }),
      mkSpace({ _id: 'space:b', name: 'Beta' }),
    ]);

    await fireEvent.click(getAllByLabelText('Move down')[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });
});
