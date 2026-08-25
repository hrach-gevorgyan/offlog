import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import type { ProjectDoc, SpaceDoc } from '../src/lib/types';

// Sidebar owns project create/delete/pin plus the navigation stores and the
// per-device collapse/expand preferences. These cover what it writes, what
// it refuses to write, and the failure handling on each mutating path.
const createProject = vi.fn().mockResolvedValue(undefined);
const createProjectFromTemplate = vi.fn().mockResolvedValue(undefined);
const deleteProject = vi.fn().mockResolvedValue(undefined);
const updateProject = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/db', () => ({
  default: {},
  createProject: (...a: unknown[]) => createProject(...a),
  createProjectFromTemplate: (...a: unknown[]) => createProjectFromTemplate(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  updateProject: (...a: unknown[]) => updateProject(...a),
  findProjectsByName: vi.fn().mockResolvedValue([]),
  getStorageBreakdown: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockReturnValue(() => {}),
  syncState: { status: 'idle', lastSynced: null, error: null, retryCount: 0, conflictCount: 0, listeners: new Set() },
}));

// The factory is hoisted above every const in this file, so the stores are
// created inside it and imported back below rather than closed over.
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    spaces: w([]),
    projects: w([]),
    activeSpaceId: w(''),
    activeProjectId: w(''),
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    showError: vi.fn(),
  };
});

vi.mock('../src/lib/discovery', async () => {
  const { writable: w } = await import('svelte/store');
  return { staleHostAlert: w(null) };
});

vi.mock('../src/config', () => ({
  isNativePlatform: () => false,
  getSyncUrl: () => 'http://localhost:5984/offlog',
}));

const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({
  confirmAction: (...a: unknown[]) => confirmAction(...a),
}));

import {
  spaces as spacesStore, projects as projectsStore,
  activeSpaceId, activeProjectId, showError,
} from '../src/lib/store';
import Sidebar from '../src/lib/Sidebar.svelte';

function mkSpace(overrides: Partial<SpaceDoc> = {}): SpaceDoc {
  return {
    _id: 'space:work', type: 'space', name: 'Work', color: '#6366f1',
    position: 0, updated_at: '2026-03-01T00:00:00.000Z', source: 'PC',
    ...overrides,
  };
}

function mkProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:work', name: 'Alpha',
    position: 0, columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }],
    default_view: 'kanban', updated_at: '2026-03-01T00:00:00.000Z', source: 'PC',
    ...overrides,
  };
}

beforeEach(() => {
  createProject.mockClear().mockResolvedValue(undefined);
  createProjectFromTemplate.mockClear().mockResolvedValue(undefined);
  deleteProject.mockClear().mockResolvedValue(undefined);
  updateProject.mockClear().mockResolvedValue(undefined);
  (showError as ReturnType<typeof vi.fn>).mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
  localStorage.clear();
  spacesStore.set([]);
  projectsStore.set([]);
  activeSpaceId.set('');
  activeProjectId.set('');
});

afterEach(() => cleanup());

// The space tree only renders projects for an expanded space, and the
// active space is force-expanded on mount — so seeding activeSpaceId is
// what makes the project rows exist.
async function renderTree(projects: ProjectDoc[], activeProject = '') {
  spacesStore.set([mkSpace()]);
  projectsStore.set(projects);
  activeSpaceId.set('space:work');
  activeProjectId.set(activeProject);
  const utils = render(Sidebar);
  if (projects.length) await waitFor(() => utils.getByText(projects[0].name));
  return utils;
}

describe('Sidebar project delete', () => {
  it('deletes a project after a danger confirmation naming it', async () => {
    const { getByTitle } = await renderTree([mkProject({ name: 'Doomed' })]);

    await fireEvent.click(getByTitle('Delete project'));

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('project:1'));
    const [message, opts] = confirmAction.mock.calls[0];
    expect(message).toContain('Doomed');
    expect(opts.danger).toBe(true);
  });

  it('clears the active project when the deleted one was open', async () => {
    const { getByTitle } = await renderTree([mkProject()], 'project:1');

    await fireEvent.click(getByTitle('Delete project'));

    await waitFor(() => expect(get(activeProjectId)).toBe(''));
  });

  it('leaves a different open project selected', async () => {
    const { getAllByTitle } = await renderTree(
      [mkProject(), mkProject({ _id: 'project:2', name: 'Beta' })],
      'project:2',
    );

    await fireEvent.click(getAllByTitle('Delete project')[0]);

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('project:1'));
    expect(get(activeProjectId)).toBe('project:2');
  });

  it('does not delete when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByTitle } = await renderTree([mkProject()], 'project:1');

    await fireEvent.click(getByTitle('Delete project'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(deleteProject).not.toHaveBeenCalled();
    expect(get(activeProjectId)).toBe('project:1');
  });

  it('shows an error and keeps the project selected when the delete fails', async () => {
    deleteProject.mockRejectedValueOnce(new Error('conflict'));
    const { getByTitle } = await renderTree([mkProject()], 'project:1');

    await fireEvent.click(getByTitle('Delete project'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(get(activeProjectId)).toBe('project:1');
  });
});

describe('Sidebar project pin', () => {
  it('toggles the pinned flag to the opposite of its current value', async () => {
    const { getByTitle } = await renderTree([mkProject({ pinned: true })]);

    await fireEvent.click(getByTitle('Unpin project'));

    await waitFor(() => expect(updateProject).toHaveBeenCalledWith('project:1', { pinned: false }));
  });

  it('shows an error when the pin toggle fails', async () => {
    updateProject.mockRejectedValueOnce(new Error('offline'));
    const { getByTitle } = await renderTree([mkProject()]);

    await fireEvent.click(getByTitle('Pin project'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });

  it('floats pinned projects above unpinned ones', async () => {
    const { getAllByTitle } = await renderTree([
      mkProject({ _id: 'project:1', name: 'Alpha' }),
      mkProject({ _id: 'project:2', name: 'Beta', pinned: true }),
    ]);

    await waitFor(() => expect(getAllByTitle('Unpin project')).toHaveLength(1));
    const names = [...document.querySelectorAll('.project-btn')].map(el => el.textContent?.trim());
    expect(names).toEqual(['Beta', 'Alpha']);
  });
});

describe('Sidebar project create', () => {
  it('creates a project in the space whose add button was used', async () => {
    const { getByText, getByPlaceholderText } = await renderTree([]);

    await fireEvent.click(getByText('+ New project'));
    const input = getByPlaceholderText('Project name…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '  Gamma  ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('space:work', 'Gamma'));
  });

  it('creates nothing when Escape cancels, even though blur submits too', async () => {
    const { getByText, getByPlaceholderText } = await renderTree([]);

    await fireEvent.click(getByText('+ New project'));
    const input = getByPlaceholderText('Project name…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Gamma' } });
    await fireEvent.keyDown(input, { key: 'Escape' });
    await fireEvent.blur(input);

    await waitFor(() => getByText('+ New project'));
    expect(createProject).not.toHaveBeenCalled();
  });

  it('shows an error when the create fails', async () => {
    createProject.mockRejectedValueOnce(new Error('offline'));
    const { getByText, getByPlaceholderText } = await renderTree([]);

    await fireEvent.click(getByText('+ New project'));
    const input = getByPlaceholderText('Project name…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Gamma' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });
});

describe('Sidebar navigation and preferences', () => {
  it('selects a project into both the space and project stores', async () => {
    const { getByText } = await renderTree([mkProject({ space_id: 'space:work' })]);

    activeSpaceId.set('');
    await fireEvent.click(getByText('Alpha'));

    expect(get(activeSpaceId)).toBe('space:work');
    expect(get(activeProjectId)).toBe('project:1');
  });

  it('persists the collapsed state per device', async () => {
    const { getByLabelText, findByLabelText } = await renderTree([]);

    await fireEvent.click(getByLabelText('Collapse sidebar'));

    // Written on the click; the rail itself only swaps in once the content
    // crossfade has hidden it, so the toggle's label lags the preference.
    expect(localStorage.getItem('offlog_sidebar_collapsed')).toBe('true');
    await fireEvent.click(await findByLabelText('Expand sidebar'));
    expect(localStorage.getItem('offlog_sidebar_collapsed')).toBe('false');
  });

  it('returns to expanded when the collapse toggle is double-clicked', async () => {
    // The content swap is deferred, so a second click can land before the
    // first one's state update has run. Reading the pre-swap value there
    // computes the same target twice and the toggle sticks collapsed.
    const { getByLabelText } = await renderTree([]);

    await fireEvent.click(getByLabelText('Collapse sidebar'));
    await fireEvent.click(getByLabelText('Collapse sidebar'));

    expect(localStorage.getItem('offlog_sidebar_collapsed')).toBe('false');
  });

  it('persists which spaces are expanded', async () => {
    const { getByText } = await renderTree([mkProject()]);

    await fireEvent.click(getByText('Work'));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('offlog_sidebar_expanded_spaces')!)).toEqual([]));
  });
});
