import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

const getProjects = vi.fn();
const getArchivedProjects = vi.fn();
const archiveProject = vi.fn();
const unarchiveProject = vi.fn();
const deleteProject = vi.fn();
vi.mock('../src/lib/db', () => ({
  getProjects: (...a: unknown[]) => getProjects(...a),
  getArchivedProjects: (...a: unknown[]) => getArchivedProjects(...a),
  archiveProject: (...a: unknown[]) => archiveProject(...a),
  unarchiveProject: (...a: unknown[]) => unarchiveProject(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  subscribe: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('../src/lib/store', async () => {
  const { writable: w } = await import('svelte/store');
  return {
    reloadTasks: vi.fn().mockResolvedValue(undefined),
    showError: vi.fn(),
    activeProjectId: w('project:live'),
    modalOpen: w(false),
    spaces: w([{ _id: 'space:w', name: 'Work', color: '#3b82f6', position: 0 }]),
  };
});
const confirmAction = vi.fn();
vi.mock('../src/lib/confirm', () => ({ confirmAction: (...a: unknown[]) => confirmAction(...a) }));

import SettingsPage from '../src/lib/phone/settings/SettingsPage.svelte';
import { showError, activeProjectId, reloadTasks } from '../src/lib/store';

const old = { _id: 'project:old', name: 'Old Sprint', space_id: 'space:w', archived: true, position: 0, columns: [] };
const live = { _id: 'project:live', name: 'Live Sprint', space_id: 'space:w', position: 1, columns: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getProjects.mockResolvedValue([live]);
  getArchivedProjects.mockResolvedValue([old]);
  archiveProject.mockResolvedValue(undefined);
  unarchiveProject.mockResolvedValue(undefined);
  deleteProject.mockResolvedValue(undefined);
  activeProjectId.set('project:live');
});
afterEach(cleanup);

describe('phone Archived projects', () => {
  it('Restore unarchives the project and reloads', async () => {
    const { getByText } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('Old Sprint'));
    expect(getByText('Work')).toBeTruthy();
    await fireEvent.click(getByText('Restore'));
    await waitFor(() => expect(unarchiveProject).toHaveBeenCalledWith('project:old'));
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('Delete asks first; a failure surfaces showError', async () => {
    const { getByText } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('Old Sprint'));
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(getByText('Delete'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(deleteProject).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    deleteProject.mockRejectedValueOnce(new Error('x'));
    await fireEvent.click(getByText('Delete'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to delete project. Please try again.'));
    expect(deleteProject).toHaveBeenCalledWith('project:old');
  });

  it('Archive… picks an active project and archives it, clearing it as the open project', async () => {
    confirmAction.mockResolvedValue(true);
    const { getByText } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('Old Sprint'));
    await fireEvent.click(getByText('Archive…'));
    await fireEvent.click(getByText('Live Sprint'));
    await waitFor(() => expect(archiveProject).toHaveBeenCalledWith('project:live'));
    await waitFor(() => expect(get(activeProjectId)).toBe(''));
  });
});
