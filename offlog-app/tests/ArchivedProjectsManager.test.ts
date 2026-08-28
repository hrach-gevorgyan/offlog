import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import type { ProjectDoc } from '../src/lib/types';

// Archive/unarchive move a project in and out of view; delete destroys it
// and its tasks. These cover which of the three ask for confirmation, what
// each writes, and that every one surfaces showError() on failure.
const getProjects = vi.fn().mockResolvedValue([]);
const getArchivedProjects = vi.fn().mockResolvedValue([]);
const archiveProject = vi.fn().mockResolvedValue(undefined);
const unarchiveProject = vi.fn().mockResolvedValue(undefined);
const deleteProject = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/db', () => ({
  getProjects: (...a: unknown[]) => getProjects(...a),
  getArchivedProjects: (...a: unknown[]) => getArchivedProjects(...a),
  archiveProject: (...a: unknown[]) => archiveProject(...a),
  unarchiveProject: (...a: unknown[]) => unarchiveProject(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));

const reloadTasks = vi.fn().mockResolvedValue(undefined);
const showError = vi.fn();
vi.mock('../src/lib/store', async () => {
  const { writable } = await import('svelte/store');
  return {
    reloadTasks: (...a: unknown[]) => reloadTasks(...a),
    showError: (...a: unknown[]) => showError(...a),
    activeProjectId: writable(''),
  };
});

const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({
  confirmAction: (...a: unknown[]) => confirmAction(...a),
}));

vi.mock('../src/lib/modalStack', () => ({
  closeOnBack: (cb: () => void) => cb,
}));

import { activeProjectId } from '../src/lib/store';
import { get } from 'svelte/store';
import ArchivedProjectsManager from '../src/lib/ArchivedProjectsManager.svelte';

function mkProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    _id: 'project:1', type: 'project', space_id: 'space:unsorted', name: 'Old Project',
    position: 0, columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }],
    default_view: 'kanban', updated_at: '2026-03-01T00:00:00.000Z', source: 'PC',
    ...overrides,
  };
}

beforeEach(() => {
  getProjects.mockClear().mockResolvedValue([]);
  getArchivedProjects.mockClear().mockResolvedValue([]);
  archiveProject.mockClear().mockResolvedValue(undefined);
  unarchiveProject.mockClear().mockResolvedValue(undefined);
  deleteProject.mockClear().mockResolvedValue(undefined);
  reloadTasks.mockClear();
  showError.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
  activeProjectId.set('');
});

afterEach(() => cleanup());

async function renderWith(active: ProjectDoc[], archived: ProjectDoc[]) {
  getProjects.mockResolvedValue(active);
  getArchivedProjects.mockResolvedValue(archived);
  const utils = render(ArchivedProjectsManager);
  if (archived.length) await waitFor(() => utils.getByText(archived[0].name));
  else await waitFor(() => utils.getByText('No archived projects yet.'));
  return utils;
}

describe('ArchivedProjectsManager unarchive', () => {
  it('unarchives by id and reloads the task list', async () => {
    const { getByText } = await renderWith([], [mkProject()]);

    await fireEvent.click(getByText('Restore'));

    await waitFor(() => expect(unarchiveProject).toHaveBeenCalledWith('project:1'));
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('restores without confirmation — unarchiving destroys nothing', async () => {
    const { getByText } = await renderWith([], [mkProject()]);

    await fireEvent.click(getByText('Restore'));

    await waitFor(() => expect(unarchiveProject).toHaveBeenCalled());
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it('shows an error and does not reload when the unarchive fails', async () => {
    unarchiveProject.mockRejectedValueOnce(new Error('conflict'));
    const { getByText } = await renderWith([], [mkProject()]);

    await fireEvent.click(getByText('Restore'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(reloadTasks).not.toHaveBeenCalled();
  });
});

describe('ArchivedProjectsManager delete', () => {
  it('deletes an archived project after a danger confirmation naming it', async () => {
    const { getByLabelText } = await renderWith([], [mkProject({ name: 'Doomed' })]);

    await fireEvent.click(getByLabelText('Delete project Doomed'));

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('project:1'));
    const [message, opts] = confirmAction.mock.calls[0];
    expect(message).toContain('Doomed');
    expect(opts.danger).toBe(true);
  });

  it('does not delete when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByLabelText } = await renderWith([], [mkProject({ name: 'Doomed' })]);

    await fireEvent.click(getByLabelText('Delete project Doomed'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('shows an error and does not reload when the delete fails', async () => {
    deleteProject.mockRejectedValueOnce(new Error('boom'));
    const { getByLabelText } = await renderWith([], [mkProject({ name: 'Doomed' })]);

    await fireEvent.click(getByLabelText('Delete project Doomed'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(reloadTasks).not.toHaveBeenCalled();
  });
});

describe('ArchivedProjectsManager archive', () => {
  it('archives the project picked from the list after confirming', async () => {
    const { getByText, getByRole } = await renderWith([mkProject({ _id: 'project:live', name: 'Live One' })], []);

    await fireEvent.click(getByRole('button', { name: /Choose a project/ }));
    await fireEvent.click(getByText('Live One'));
    await fireEvent.click(getByText('Archive'));

    await waitFor(() => expect(archiveProject).toHaveBeenCalledWith('project:live'));
    expect(confirmAction.mock.calls[0][0]).toContain('Live One');
    await waitFor(() => expect(reloadTasks).toHaveBeenCalled());
  });

  it('clears activeProjectId when archiving the project currently open, so the board does not go silently blank', async () => {
    activeProjectId.set('project:live');
    const { getByText, getByRole } = await renderWith([mkProject({ _id: 'project:live', name: 'Live One' })], []);

    await fireEvent.click(getByRole('button', { name: /Choose a project/ }));
    await fireEvent.click(getByText('Live One'));
    await fireEvent.click(getByText('Archive'));

    await waitFor(() => expect(archiveProject).toHaveBeenCalledWith('project:live'));
    expect(get(activeProjectId)).toBe('');
  });

  it('leaves activeProjectId alone when archiving a project that is not the open one', async () => {
    activeProjectId.set('project:other');
    const { getByText, getByRole } = await renderWith([mkProject({ _id: 'project:live', name: 'Live One' })], []);

    await fireEvent.click(getByRole('button', { name: /Choose a project/ }));
    await fireEvent.click(getByText('Live One'));
    await fireEvent.click(getByText('Archive'));

    await waitFor(() => expect(archiveProject).toHaveBeenCalledWith('project:live'));
    expect(get(activeProjectId)).toBe('project:other');
  });

  it('does not archive when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const { getByText, getByRole } = await renderWith([mkProject({ _id: 'project:live', name: 'Live One' })], []);

    await fireEvent.click(getByRole('button', { name: /Choose a project/ }));
    await fireEvent.click(getByText('Live One'));
    await fireEvent.click(getByText('Archive'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(archiveProject).not.toHaveBeenCalled();
  });

  it('shows an error when the archive fails', async () => {
    archiveProject.mockRejectedValueOnce(new Error('offline'));
    const { getByText, getByRole } = await renderWith([mkProject({ _id: 'project:live', name: 'Live One' })], []);

    await fireEvent.click(getByRole('button', { name: /Choose a project/ }));
    await fireEvent.click(getByText('Live One'));
    await fireEvent.click(getByText('Archive'));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });

  it('refuses to archive with no project picked', async () => {
    const { getByText } = await renderWith([mkProject()], []);

    const btn = getByText('Archive') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await fireEvent.click(btn);

    expect(confirmAction).not.toHaveBeenCalled();
    expect(archiveProject).not.toHaveBeenCalled();
  });
});
