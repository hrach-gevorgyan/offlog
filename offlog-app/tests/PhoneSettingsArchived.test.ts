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
import { toast } from '../src/lib/phone/nav';
import { showError, activeProjectId, reloadTasks } from '../src/lib/store';

const old = { _id: 'project:old', name: 'Old Sprint', space_id: 'space:w', archived: true, position: 0, columns: [] };
const live = { _id: 'project:live', name: 'Live Sprint', space_id: 'space:w', position: 1, columns: [] };

// Sheets finish closing only once their outro ends; with reduced motion
// transitions take no time, so the close lands at once.
window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

beforeEach(async () => {
  // A closed sheet's history.back() lands as an async popstate; let it
  // settle so it cannot pop the next test's sheet.
  await new Promise(r => setTimeout(r, 20));
  vi.clearAllMocks();
  getProjects.mockResolvedValue([live]);
  getArchivedProjects.mockResolvedValue([old]);
  archiveProject.mockResolvedValue(undefined);
  unarchiveProject.mockResolvedValue(undefined);
  deleteProject.mockResolvedValue(undefined);
  activeProjectId.set('project:live');
  toast.set(null);
});
afterEach(cleanup);

describe('phone Archived projects', () => {
  it('Restore unarchives the project and reloads', async () => {
    const { getByText, getByLabelText } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('Old Sprint'));
    expect(getByText('Work')).toBeTruthy();
    await fireEvent.click(getByLabelText('Restore Old Sprint'));
    await waitFor(() => expect(unarchiveProject).toHaveBeenCalledWith('project:old'));
    expect(reloadTasks).toHaveBeenCalled();
  });

  it('Delete asks first; a failure surfaces showError', async () => {
    const { getByText, getByLabelText } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('Old Sprint'));
    confirmAction.mockResolvedValueOnce(false);
    await fireEvent.click(getByLabelText('Delete Old Sprint'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(deleteProject).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    deleteProject.mockRejectedValueOnce(new Error('x'));
    await fireEvent.click(getByLabelText('Delete Old Sprint'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to delete project. Please try again.'));
    expect(deleteProject).toHaveBeenCalledWith('project:old');
  });

  it('Archive a project archives without asking once the sheet has closed, clears the open project, and offers Undo', async () => {
    const { getByText } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('Old Sprint'));
    await fireEvent.click(getByText('Archive a project'));
    await fireEvent.click(getByText('Live Sprint'));
    await waitFor(() => expect(archiveProject).toHaveBeenCalledWith('project:live'));
    expect(confirmAction).not.toHaveBeenCalled();
    expect(document.querySelector('.psheet')).toBeNull();
    await waitFor(() => expect(get(activeProjectId)).toBe(''));
    await waitFor(() => expect(get(toast)?.text).toBe('Archived: Live Sprint'));
    await get(toast)!.undo!();
    expect(unarchiveProject).toHaveBeenCalledWith('project:live');
    unarchiveProject.mockRejectedValueOnce(new Error('x'));
    await get(toast)!.undo!();
    expect(showError).toHaveBeenCalledWith('Could not undo. Please try again.');
  });

  it('empty: says so and still offers the archive action; none when nothing is left to archive', async () => {
    getArchivedProjects.mockResolvedValue([]);
    const { getByText, queryByText, unmount } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('No archived projects.'));
    expect(getByText('Archive a project')).toBeTruthy();
    unmount();
    getProjects.mockResolvedValue([]);
    const r = render(SettingsPage, { page: 'archived' });
    await waitFor(() => r.getByText('No archived projects.'));
    expect(r.queryByText('Archive a project')).toBeNull();
    expect(queryByText('Archive…')).toBeNull();
  });

  it('a failed archive surfaces showError', async () => {
    archiveProject.mockRejectedValueOnce(new Error('x'));
    const { getByText } = render(SettingsPage, { page: 'archived' });
    await waitFor(() => getByText('Old Sprint'));
    await fireEvent.click(getByText('Archive a project'));
    await fireEvent.click(getByText('Live Sprint'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Failed to archive project. Please try again.'));
    expect(get(toast)).toBeNull();
  });
});
