import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get, type Writable } from 'svelte/store';
import type { ProjectDoc } from '../src/lib/types';

const createProject = vi.fn();
const createProjectFromTemplate = vi.fn();
const findProjectsByName = vi.fn();
vi.mock('../src/lib/db', () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  createProjectFromTemplate: (...a: unknown[]) => createProjectFromTemplate(...a),
  findProjectsByName: (...a: unknown[]) => findProjectsByName(...a),
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    showError: vi.fn(),
    modalOpen: w(false),
    projects: w([]),
    spaces: w([
      { _id: 'space:w', name: 'Work', color: '#3b82f6', position: 1 },
      { _id: 'space:h', name: 'Home', color: '#22c55e', position: 0 },
    ]),
  };
});

import NewProjectSheet from '../src/lib/phone/NewProjectSheet.svelte';
import { projects, showError } from '../src/lib/store';

window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const house = { _id: 'project:house', space_id: 'space:h', name: 'House', position: 0, columns: [] } as unknown as ProjectDoc;
const made = (over: Partial<ProjectDoc> = {}) => ({ _id: 'project:new', space_id: 'space:w', name: 'Garden', position: 1, columns: [], ...over }) as ProjectDoc;

beforeEach(async () => {
  await new Promise(r => setTimeout(r, 20));
  vi.clearAllMocks();
  (projects as Writable<ProjectDoc[]>).set([house]);
  findProjectsByName.mockResolvedValue([]);
  createProject.mockResolvedValue(made());
  createProjectFromTemplate.mockResolvedValue(made());
});
afterEach(cleanup);

function setup() {
  const created = vi.fn(), close = vi.fn();
  const r = render(NewProjectSheet, { props: { spaceId: 'space:w' }, events: { created, close } } as any);
  return { ...r, created, close };
}

describe('phone NewProjectSheet', () => {
  it('creates with the default statuses in the chosen space, then reports it after closing', async () => {
    const r = setup();
    expect((r.getByText('Create') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.input(r.getByLabelText('Project name'), { target: { value: '  Garden ' } });
    await fireEvent.click(r.getByText('Home'));
    await fireEvent.click(r.getByText('Create'));
    expect(createProject).toHaveBeenCalledWith('space:h', 'Garden');
    await waitFor(() => expect(r.created).toHaveBeenCalled());
    expect(r.created.mock.calls[0][0].detail._id).toBe('project:new');
    expect(r.close).toHaveBeenCalled();
    expect(get(projects).map(p => p._id)).toEqual(['project:house', 'project:new']);
  });

  it('copies another project’s statuses, and its open tasks when asked', async () => {
    const r = setup();
    await fireEvent.input(r.getByLabelText('Project name'), { target: { value: 'Flat' } });
    await fireEvent.click(r.getByText('Default')); // opens the statuses list
    await fireEvent.click(r.getByText('Same as House'));
    // The row now names the source (the list may still be sliding shut).
    expect(document.querySelector('.p-row[aria-expanded]')?.textContent).toContain('Same as House');
    await fireEvent.click(r.getByRole('switch', { name: 'Also copy its open tasks' }));
    await fireEvent.click(r.getByText('Create'));
    expect(createProjectFromTemplate).toHaveBeenCalledWith('space:w', 'Flat', 'project:house', true);
  });

  it('warns about a duplicate name without blocking', async () => {
    findProjectsByName.mockResolvedValue([house]);
    const r = setup();
    await fireEvent.input(r.getByLabelText('Project name'), { target: { value: 'house' } });
    await waitFor(() => expect(r.getByText('“house” already exists in Home.')).toBeTruthy());
    expect((r.getByText('Create') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a failed create surfaces an error and keeps the sheet open', async () => {
    createProject.mockRejectedValue(new Error('boom'));
    const r = setup();
    await fireEvent.input(r.getByLabelText('Project name'), { target: { value: 'Garden' } });
    await fireEvent.click(r.getByText('Create'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Could not create the project. Please try again.'));
    expect(r.created).not.toHaveBeenCalled();
    expect(r.getByRole('dialog')).toBeTruthy();
  });
});
