import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import type { CustomFieldDef } from '../src/lib/types';

// The panel is a thin editor over four db.ts calls; what it must get right
// is which identifier each call carries (field id, never name — task
// custom_values are keyed by id), how the comma-separated options string is
// parsed, and that every failure surfaces.
const getCustomFieldDefs = vi.fn().mockResolvedValue([]);
const addCustomFieldDef = vi.fn().mockResolvedValue([]);
const removeCustomFieldDef = vi.fn().mockResolvedValue([]);
const updateCustomFieldDef = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/db', () => ({
  getCustomFieldDefs: (...a: unknown[]) => getCustomFieldDefs(...a),
  addCustomFieldDef: (...a: unknown[]) => addCustomFieldDef(...a),
  removeCustomFieldDef: (...a: unknown[]) => removeCustomFieldDef(...a),
  updateCustomFieldDef: (...a: unknown[]) => updateCustomFieldDef(...a),
}));

const showError = vi.fn();
vi.mock('../src/lib/store', () => ({ showError: (...a: unknown[]) => showError(...a) }));

const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({ confirmAction: (...a: unknown[]) => confirmAction(...a) }));

import CustomFieldManager from '../src/lib/CustomFieldManager.svelte';

const FIELDS: CustomFieldDef[] = [
  { id: 'field:aaa', name: 'Estimate', type: 'number' },
  { id: 'field:bbb', name: 'Client', type: 'select', options: ['Acme', 'Globex'] },
];

async function open(fields: CustomFieldDef[] = FIELDS) {
  getCustomFieldDefs.mockResolvedValue(fields);
  const utils = render(CustomFieldManager);
  if (fields.length) {
    await waitFor(() => {
      if (!utils.container.querySelector('.row-edit-trigger')) throw new Error('field list not loaded');
    });
  }
  return utils;
}

const addNameInput = (container: HTMLElement) =>
  container.querySelector('.add-form .name-input') as HTMLInputElement;

// The row's own trigger button opens the inline editor for that field.
async function startEdit(container: HTMLElement, name: string) {
  await fireEvent.click(container.querySelector(`[aria-label="Edit field ${name}"]`) as HTMLButtonElement);
  return container.querySelector('.row-editing .name-input') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCustomFieldDefs.mockResolvedValue(FIELDS);
  addCustomFieldDef.mockResolvedValue(FIELDS);
  removeCustomFieldDef.mockResolvedValue([]);
  updateCustomFieldDef.mockResolvedValue(FIELDS);
});
afterEach(cleanup);

describe('CustomFieldManager add', () => {
  it('adds a trimmed text field on Enter and clears the form', async () => {
    const { container } = await open([]);

    const input = addNameInput(container);
    await fireEvent.input(input, { target: { value: '  Owner  ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    // options stays undefined for a non-select type — passing [] would
    // write an empty options array onto a text field.
    expect(addCustomFieldDef).toHaveBeenCalledWith('Owner', 'text', undefined);
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('writes nothing for a blank name', async () => {
    const { container } = await open([]);

    const input = addNameInput(container);
    await fireEvent.input(input, { target: { value: '   ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(addCustomFieldDef).not.toHaveBeenCalled();
  });

  it('surfaces an error when the add fails, keeping the typed name', async () => {
    addCustomFieldDef.mockRejectedValueOnce(new Error('put failed'));
    const { container } = await open([]);

    const input = addNameInput(container);
    await fireEvent.input(input, { target: { value: 'Owner' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('Owner');
  });
});

describe('CustomFieldManager rename', () => {
  it('patches by field id, so stored values stay reachable after a rename', async () => {
    const { container } = await open();

    const input = await startEdit(container, 'Estimate');
    await fireEvent.input(input, { target: { value: '  Effort ' } });
    await fireEvent.click(container.querySelector('.edit-save-btn') as HTMLButtonElement);

    expect(updateCustomFieldDef).toHaveBeenCalledWith('field:aaa', {
      name: 'Effort', type: 'number', options: undefined,
    });
  });

  it('keeps a select field\'s options, parsed from the comma-separated box', async () => {
    const { container } = await open();

    const input = await startEdit(container, 'Client');
    await fireEvent.input(input, { target: { value: 'Customer' } });
    const optionsInput = container.querySelectorAll('.row-editing .name-input')[1] as HTMLInputElement;
    await fireEvent.input(optionsInput, { target: { value: 'Acme, Globex ,, Initech' } });
    await fireEvent.click(container.querySelector('.edit-save-btn') as HTMLButtonElement);

    expect(updateCustomFieldDef).toHaveBeenCalledWith('field:bbb', {
      name: 'Customer', type: 'select', options: ['Acme', 'Globex', 'Initech'],
    });
  });

  it('writes nothing when the name is emptied', async () => {
    const { container } = await open();

    const input = await startEdit(container, 'Estimate');
    await fireEvent.input(input, { target: { value: '  ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateCustomFieldDef).not.toHaveBeenCalled();
  });

  it('Cancel closes the editor without writing', async () => {
    const { container } = await open();

    const input = await startEdit(container, 'Estimate');
    await fireEvent.input(input, { target: { value: 'Effort' } });
    await fireEvent.click(container.querySelector('.edit-cancel-btn') as HTMLButtonElement);

    expect(updateCustomFieldDef).not.toHaveBeenCalled();
    expect(container.querySelector('.row-editing')).toBeNull();
  });

  it('surfaces an error and stays in the editor when the update fails', async () => {
    updateCustomFieldDef.mockRejectedValueOnce(new Error('put failed'));
    const { container } = await open();

    const input = await startEdit(container, 'Estimate');
    await fireEvent.input(input, { target: { value: 'Effort' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(container.querySelector('.row-editing')).not.toBeNull();
  });
});

describe('CustomFieldManager delete', () => {
  const deleteButton = (container: HTMLElement, name: string) =>
    container.querySelector(`[aria-label="Remove field ${name}"]`) as HTMLButtonElement;

  it('confirms first, then removes by field id', async () => {
    confirmAction.mockResolvedValue(true);
    const { container } = await open();

    await fireEvent.click(deleteButton(container, 'Estimate'));

    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(removeCustomFieldDef).toHaveBeenCalledWith('field:aaa');
    // The list is replaced by the call's return value, not re-fetched.
    await waitFor(() => expect(container.querySelector('.empty')).not.toBeNull());
  });

  it('declining the confirmation removes nothing', async () => {
    confirmAction.mockResolvedValue(false);
    const { container } = await open();

    await fireEvent.click(deleteButton(container, 'Estimate'));

    expect(removeCustomFieldDef).not.toHaveBeenCalled();
  });

  it('surfaces an error when the removal fails', async () => {
    confirmAction.mockResolvedValue(true);
    removeCustomFieldDef.mockRejectedValueOnce(new Error('put failed'));
    const { container } = await open();

    await fireEvent.click(deleteButton(container, 'Estimate'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });
});
