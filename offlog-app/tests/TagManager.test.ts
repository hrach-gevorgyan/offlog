import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// TagManager's rename/delete rewrite every task carrying the tag, so what
// matters here is the exact argument pair each one sends to db.ts and that
// a failure surfaces rather than silently leaving the list stale — the
// rewrite itself is db.test.ts's job.
const getTagCounts = vi.fn().mockResolvedValue([]);
const renameTag = vi.fn().mockResolvedValue(1);
const deleteTagEverywhere = vi.fn().mockResolvedValue(1);
const setTagColor = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/db', () => ({
  getTagCounts: (...a: unknown[]) => getTagCounts(...a),
  renameTag: (...a: unknown[]) => renameTag(...a),
  deleteTagEverywhere: (...a: unknown[]) => deleteTagEverywhere(...a),
  setTagColor: (...a: unknown[]) => setTagColor(...a),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));

const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
vi.mock('../src/lib/store', () => ({
  reloadTasks: (...a: unknown[]) => reloadTasks(...a),
  showError: (...a: unknown[]) => showError(...a),
}));

// confirmAction resolves via <ConfirmDialog/> in App.svelte's root, which
// isn't mounted here — its promise would never settle.
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({
  confirmAction: (...a: unknown[]) => confirmAction(...a),
}));

import TagManager from '../src/lib/TagManager.svelte';

const TAGS = [{ tag: 'urgent', count: 3 }, { tag: 'home', count: 1 }];

async function open(tags = TAGS) {
  getTagCounts.mockResolvedValue(tags);
  const utils = render(TagManager);
  await waitFor(() => {
    if (!utils.container.querySelector('.name-btn')) throw new Error('tag list not loaded');
  });
  return utils;
}

const nameButton = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('.name-btn')].find(b => b.textContent === label) as HTMLButtonElement;

async function startRename(container: HTMLElement, tag: string, next: string) {
  await fireEvent.click(nameButton(container, tag));
  const input = container.querySelector('.name-input') as HTMLInputElement;
  await fireEvent.input(input, { target: { value: next } });
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  getTagCounts.mockResolvedValue(TAGS);
  renameTag.mockResolvedValue(1);
  deleteTagEverywhere.mockResolvedValue(1);
});
afterEach(cleanup);

describe('TagManager rename', () => {
  it('renames on Enter with the old and the normalised new name', async () => {
    const { container } = await open();

    const input = await startRename(container, 'urgent', 'Do Now');
    await fireEvent.keyDown(input, { key: 'Enter' });

    // Tags are normalised to lowercase-and-hyphenated before the write, so
    // a typed "Do Now" can never create a second, differently-cased tag.
    expect(renameTag).toHaveBeenCalledWith('urgent', 'do-now');
    expect(reloadTasks).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('renames on blur too', async () => {
    const { container } = await open();

    const input = await startRename(container, 'home', 'house');
    await fireEvent.blur(input);

    expect(renameTag).toHaveBeenCalledWith('home', 'house');
  });

  it('writes nothing when the name is unchanged', async () => {
    const { container } = await open();

    const input = await startRename(container, 'urgent', 'urgent');
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(renameTag).not.toHaveBeenCalled();
    expect(reloadTasks).not.toHaveBeenCalled();
  });

  it('writes nothing when the name is emptied', async () => {
    const { container } = await open();

    const input = await startRename(container, 'urgent', '   ');
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(renameTag).not.toHaveBeenCalled();
  });

  it('Escape abandons the edit without writing', async () => {
    const { container } = await open();

    const input = await startRename(container, 'urgent', 'abandoned');
    await fireEvent.keyDown(input, { key: 'Escape' });

    expect(renameTag).not.toHaveBeenCalled();
  });

  it('surfaces an error when the rename fails', async () => {
    renameTag.mockRejectedValueOnce(new Error('bulkDocs failed'));
    const { container } = await open();

    const input = await startRename(container, 'urgent', 'renamed');
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(reloadTasks).not.toHaveBeenCalled();
  });
});

describe('TagManager delete', () => {
  const deleteButton = (container: HTMLElement, tag: string) =>
    container.querySelector(`[aria-label="Delete tag ${tag}"]`) as HTMLButtonElement;

  it('confirms first, then strips the tag from every task', async () => {
    confirmAction.mockResolvedValue(true);
    const { container } = await open();

    await fireEvent.click(deleteButton(container, 'urgent'));

    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(String(confirmAction.mock.calls[0][0])).toContain('3 tasks');
    expect(deleteTagEverywhere).toHaveBeenCalledWith('urgent');
    await waitFor(() => expect(reloadTasks).toHaveBeenCalled());
  });

  it('declining the confirmation deletes nothing', async () => {
    confirmAction.mockResolvedValue(false);
    const { container } = await open();

    await fireEvent.click(deleteButton(container, 'urgent'));

    expect(deleteTagEverywhere).not.toHaveBeenCalled();
    expect(reloadTasks).not.toHaveBeenCalled();
  });

  it('surfaces an error when the delete fails', async () => {
    confirmAction.mockResolvedValue(true);
    deleteTagEverywhere.mockRejectedValueOnce(new Error('storage error'));
    const { container } = await open();

    await fireEvent.click(deleteButton(container, 'urgent'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(reloadTasks).not.toHaveBeenCalled();
  });
});

describe('TagManager colors', () => {
  it('clears the override when Auto is picked, rather than writing a color', async () => {
    const { container } = await open();

    await fireEvent.click(container.querySelector('[aria-label="Change color for tag urgent"]') as HTMLButtonElement);
    await fireEvent.click(container.querySelector('.swatch-auto') as HTMLButtonElement);

    expect(setTagColor).toHaveBeenCalledWith('urgent', null);
  });

  it('surfaces an error when the color write fails', async () => {
    setTagColor.mockRejectedValueOnce(new Error('put failed'));
    const { container } = await open();

    await fireEvent.click(container.querySelector('[aria-label="Change color for tag urgent"]') as HTMLButtonElement);
    await fireEvent.click(container.querySelector('.swatch') as HTMLButtonElement);

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });
});
