import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

const getCustomFieldDefs = vi.fn();
const addCustomFieldDef = vi.fn();
const updateCustomFieldDef = vi.fn();
const removeCustomFieldDef = vi.fn();
const getCustomFieldUsageCount = vi.fn();
vi.mock('../src/lib/db', () => ({
  getSpaces: vi.fn().mockResolvedValue([]),
  getTagCounts: vi.fn().mockResolvedValue([]),
  getTagColorOverrides: vi.fn().mockResolvedValue({}),
  getCustomFieldDefs: (...a: unknown[]) => getCustomFieldDefs(...a),
  addCustomFieldDef: (...a: unknown[]) => addCustomFieldDef(...a),
  updateCustomFieldDef: (...a: unknown[]) => updateCustomFieldDef(...a),
  removeCustomFieldDef: (...a: unknown[]) => removeCustomFieldDef(...a),
  getCustomFieldUsageCount: (...a: unknown[]) => getCustomFieldUsageCount(...a),
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
import { showError } from '../src/lib/store';
import { toast } from '../src/lib/phone/nav';

window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const defs = [
  { id: 'field:1', name: 'Cost', type: 'number' },
  { id: 'field:2', name: 'Size', type: 'select', options: ['S', 'M'] },
];

beforeEach(() => {
  vi.clearAllMocks();
  getCustomFieldDefs.mockResolvedValue(defs);
  addCustomFieldDef.mockResolvedValue(defs);
  updateCustomFieldDef.mockResolvedValue(defs);
  removeCustomFieldDef.mockResolvedValue([defs[1]]);
  getCustomFieldUsageCount.mockResolvedValue(0);
  toast.set(null);
});
afterEach(cleanup);

async function setup() {
  const r = render(OrganizePage);
  await fireEvent.click(r.getByRole('button', { name: 'Fields' }));
  await waitFor(() => r.getByText('Cost'));
  return r;
}
async function openNew(r: Awaited<ReturnType<typeof setup>>) {
  await fireEvent.click(r.getByText('Add a field'));
  await waitFor(() => r.getByRole('dialog'));
}
async function openField(r: Awaited<ReturnType<typeof setup>>, name: string) {
  await fireEvent.click(r.getByText(name));
  await waitFor(() => r.getByRole('dialog'));
}

describe('phone Organize → Fields', () => {
  it('lists fields with their type', async () => {
    const r = await setup();
    const rows = [...r.container.querySelectorAll('.p-group .p-row')].map(b => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Cost Number', 'Size Select', 'Add a field']);
  });

  it('adds a text field without options', async () => {
    const r = await setup();
    await openNew(r);
    const add = r.getByText('Add field') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await fireEvent.input(r.getByLabelText('Field name'), { target: { value: ' Owner ' } });
    await fireEvent.click(add);
    await waitFor(() => expect(addCustomFieldDef).toHaveBeenCalledWith('Owner', 'text', undefined));
  });

  it('adds a select field with its trimmed, non-empty options', async () => {
    const r = await setup();
    await openNew(r);
    await fireEvent.input(r.getByLabelText('Field name'), { target: { value: 'Mood' } });
    await fireEvent.click(r.getByRole('radio', { name: 'Select' }));
    await fireEvent.input(r.getByLabelText('Options'), { target: { value: ' good, , bad ,ok' } });
    await fireEvent.keyDown(r.getByLabelText('Options'), { key: 'Enter' });
    await waitFor(() => expect(addCustomFieldDef).toHaveBeenCalledWith('Mood', 'select', ['good', 'bad', 'ok']));
  });

  it('a failed add surfaces showError', async () => {
    addCustomFieldDef.mockRejectedValueOnce(new Error('x'));
    const r = await setup();
    await openNew(r);
    await fireEvent.input(r.getByLabelText('Field name'), { target: { value: 'Owner' } });
    await fireEvent.click(r.getByText('Add field'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to add field. Please try again.'));
  });

  it('edits name, type and options, and Undo restores the old definition', async () => {
    const r = await setup();
    await openField(r, 'Size');
    expect((r.getByLabelText('Options') as HTMLInputElement).value).toBe('S, M');
    await fireEvent.input(r.getByLabelText('Field name'), { target: { value: 'Shirt size' } });
    await fireEvent.input(r.getByLabelText('Options'), { target: { value: 'S, M, L' } });
    await fireEvent.click(r.getByText('Save'));
    await waitFor(() => expect(updateCustomFieldDef).toHaveBeenCalledWith('field:2', { name: 'Shirt size', type: 'select', options: ['S', 'M', 'L'] }));
    await waitFor(() => expect(get(toast)?.text).toBe('Field saved'));
    await get(toast)!.undo!();
    expect(updateCustomFieldDef).toHaveBeenLastCalledWith('field:2', { name: 'Size', type: 'select', options: ['S', 'M'] });
  });

  it('changing the type away from Select drops the options', async () => {
    const r = await setup();
    await openField(r, 'Size');
    await fireEvent.click(r.getByRole('radio', { name: 'Text' }));
    expect(r.queryByLabelText('Options')).toBeNull();
    await fireEvent.click(r.getByText('Save'));
    await waitFor(() => expect(updateCustomFieldDef).toHaveBeenCalledWith('field:2', { name: 'Size', type: 'text', options: undefined }));
  });

  it('a failed edit surfaces showError', async () => {
    updateCustomFieldDef.mockRejectedValueOnce(new Error('x'));
    const r = await setup();
    await openField(r, 'Cost');
    await fireEvent.click(r.getByText('Save'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to update field. Please try again.'));
  });

  it('remove warns how many task values are erased, and only removes on yes', async () => {
    getCustomFieldUsageCount.mockResolvedValue(3);
    const r = await setup();
    await openField(r, 'Cost');
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(r.getByText('Remove field'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith('Remove “Cost”? Its value is erased from 3 tasks.', { danger: true, confirmLabel: 'Remove' }));
    expect(getCustomFieldUsageCount).toHaveBeenCalledWith('field:1');
    expect(removeCustomFieldDef).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(r.getByText('Remove field'));
    await waitFor(() => expect(removeCustomFieldDef).toHaveBeenCalledWith('field:1'));
    await waitFor(() => expect(get(toast)?.text).toBe('Removed Cost'));
  });

  it('an unused field asks the short question', async () => {
    const r = await setup();
    await openField(r, 'Cost');
    confirmAction.mockResolvedValueOnce(true);
    await fireEvent.click(r.getByText('Remove field'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledWith('Remove “Cost”?', { danger: true, confirmLabel: 'Remove' }));
  });

  it('a failed remove (or usage count) surfaces showError', async () => {
    removeCustomFieldDef.mockRejectedValueOnce(new Error('x'));
    confirmAction.mockResolvedValueOnce(true);
    const r = await setup();
    await openField(r, 'Cost');
    await fireEvent.click(r.getByText('Remove field'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to remove field. Please try again.'));
    vi.mocked(showError).mockClear();
    getCustomFieldUsageCount.mockRejectedValueOnce(new Error('x'));
    await fireEvent.click(r.getByText('Remove field'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to remove field. Please try again.'));
  });
});
