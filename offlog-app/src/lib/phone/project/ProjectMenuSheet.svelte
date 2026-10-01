<script lang="ts">
  // The project's ⋯ menu. Mount behind a {#key} bumped per open (Sheet rule).
  // Navigation waits until the sheet has closed: the sheet's own history
  // entry must be gone before a screen is pushed or popped.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { getArchivedTasksForProject, unarchiveTask, archiveProject, unarchiveProject, deleteProject } from '../../db';
  import { activeProjectId, projects, reloadTasks, showError } from '../../store';
  import { push, popScreen, showToast } from '../nav';
  import { patchProject } from './actions';
  import Sheet from '../Sheet.svelte';

  export let project: ProjectDoc;
  // The project's tasks on show; archived ones are loaded here.
  export let tasks: TaskDoc[] = [];

  const dispatch = createEventDispatcher<{ close: void }>();
  let sheet: Sheet;
  let view: 'main' | 'archived' | 'delete' = 'main';
  let after: (() => void) | null = null;
  let gone = false;
  let archived: TaskDoc[] = [];
  let busy = false;

  async function loadArchived() {
    try { archived = await getArchivedTasksForProject(project._id); }
    catch { showError('Could not load archived tasks. Please try again.'); }
  }
  onMount(loadArchived);

  // Android back during an await may already have closed the sheet; then
  // there is no history entry left to wait for.
  function then(fn: () => void) {
    if (gone) { fn(); return; }
    after = fn;
    sheet?.close();
  }
  function closed() { gone = true; dispatch('close'); after?.(); }

  async function restore(t: TaskDoc) {
    try {
      await unarchiveTask(t._id);
      await reloadTasks();
      await loadArchived();
    } catch {
      showError('Could not restore this task. Please try again.');
    }
  }

  async function pin() {
    const { _id, pinned } = project;
    sheet?.close();
    const fail = 'Could not update this project. Please try again.';
    if (await patchProject(_id, { pinned: !pinned }, fail))
      showToast(pinned ? 'Project unpinned' : 'Project pinned', async () => { await patchProject(_id, { pinned: !!pinned }, fail); });
  }

  // The project leaves the store before the screen is popped, so it can't
  // claim activeProjectId back on its way out.
  function leave(id: string) {
    activeProjectId.set('');
    projects.update(ps => ps.filter(p => p._id !== id));
    popScreen();
  }
  // Archiving can be undone, so it acts at once; deleting asks first.
  async function archive() {
    if (busy) return;
    busy = true;
    const { _id } = project;
    try {
      await archiveProject(_id);
    } catch {
      showError('Could not archive this project. Please try again.');
      busy = false;
      return;
    }
    then(() => {
      leave(_id);
      showToast('Project archived', async () => {
        try { await unarchiveProject(_id); await reloadTasks(); }
        catch { showError('Could not undo. Please try again.'); }
      });
    });
  }
  async function remove() {
    if (busy) return;
    busy = true;
    const { _id } = project;
    try {
      await deleteProject(_id);
      then(() => leave(_id));
    } catch {
      showError('Could not delete this project. Please try again.');
      busy = false;
    }
  }
  $: total = tasks.length + archived.length;
  const nameOf = (colId: string) => project.columns.find(c => c.id === colId)?.name ?? '';
</script>

<Sheet bind:this={sheet} title={view === 'archived' ? 'Archived tasks' : view === 'delete' ? 'Delete this project?' : project.name} on:close={closed}>
  {#if view === 'main'}
    <div class="p-group">
      <button class="p-row" on:click={() => then(() => push({ k: 'statuses', id: project._id }))}>Edit statuses</button>
      <button class="p-row" on:click={() => view = 'archived'}>Archived tasks<span class="p-v">{archived.length}</span></button>
      <button class="p-row" on:click={pin}>{project.pinned ? 'Unpin project' : 'Pin project'}</button>
      <button class="p-row" disabled={busy} on:click={archive}>Archive project</button>
    </div>
    <div class="p-group"><button class="p-row danger" on:click={() => view = 'delete'}>Delete project</button></div>
  {:else if view === 'archived'}
    {#if archived.length}
      <div class="p-group">
        {#each archived as t (t._id)}
          <div class="p-row">
            <span class="p-k"><span>{t.title}</span><span class="p-sub">{nameOf(t.column_id)}</span></span>
            <button class="p-tbtn" on:click={() => restore(t)}>Restore</button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="p-empty">No archived tasks.</p>
    {/if}
  {:else}
    <p class="p-say">
      Deletes <b>{project.name}</b>{#if total}{' and its '}<b>{total} {total === 1 ? 'task' : 'tasks'}</b>{#if archived.length}, archived ones included{/if}{/if}. Can’t be undone.
    </p>
    <button class="p-go danger" disabled={busy} on:click={remove}>Delete project</button>
    <button class="p-row cancel" on:click={() => view = 'main'}>Cancel</button>
  {/if}
</Sheet>

<style>
  .cancel { justify-content: center; font-weight: 600; margin-top: 4px; }
</style>
