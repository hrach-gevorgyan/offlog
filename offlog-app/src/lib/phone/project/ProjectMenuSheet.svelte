<script lang="ts">
  // The project's ⋯ menu. Mount behind a {#key} bumped per open (Sheet rule).
  // Navigation waits until the sheet has closed: the sheet's own history
  // entry must be gone before a screen is pushed or popped.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { ProjectDoc, TaskDoc } from '../../types';
  import { getArchivedTasksForProject, unarchiveTask, archiveProject, unarchiveProject, deleteProject, findProjectsByName } from '../../db';
  import { activeProjectId, projects, spaces, reloadTasks, showError } from '../../store';
  import { soften } from '../../tagColors';
  import { I } from '../icons';
  import { push, popScreen, showToast } from '../nav';
  import { patchProject } from './actions';
  import Sheet from '../Sheet.svelte';

  export let project: ProjectDoc;
  // The project's tasks on show; archived ones are loaded here.
  export let tasks: TaskDoc[] = [];

  const dispatch = createEventDispatcher<{ close: void }>();
  let sheet: Sheet;
  let view: 'main' | 'archived' | 'delete' | 'rename' | 'move' = 'main';
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
  // ── Rename ──
  let newName = project.name, dupHint = '', seq = 0;
  async function checkDup(value: string) {
    const n = value.trim(), mine = ++seq;
    if (!n || n === project.name) { dupHint = ''; return; }
    try {
      const matches = await findProjectsByName(n, project._id);
      if (mine !== seq) return;
      const where = [...new Set(matches.map(p => $spaces.find(x => x._id === p.space_id)?.name ?? 'another space'))];
      dupHint = matches.length ? `“${n}” already exists in ${where.join(', ')}.` : '';
    } catch { dupHint = ''; }
  }
  $: if (view === 'rename') checkDup(newName);
  async function rename() {
    const n = newName.trim();
    const { _id, name } = project;
    sheet?.close();
    if (!n || n === name) return;
    const fail = 'Could not rename this project. Please try again.';
    if (await patchProject(_id, { name: n }, fail))
      showToast(`Renamed to ${n}`, async () => { await patchProject(_id, { name }, fail); });
  }

  // ── Move to another space ──
  $: spaceList = [...$spaces].sort((a, b) => a.position - b.position);
  $: spaceName = $spaces.find(x => x._id === project.space_id)?.name ?? '';
  async function move(spaceId: string) {
    const { _id, space_id: from, position } = project;
    if (spaceId === from) { view = 'main'; return; }
    const to = $spaces.find(x => x._id === spaceId)?.name ?? 'another space';
    // Last in its new space, where a person looks for something just moved.
    const last = Math.max(0, ...$projects.filter(p => p.space_id === spaceId).map(p => p.position ?? 0));
    sheet?.close();
    const fail = 'Could not move this project. Please try again.';
    if (await patchProject(_id, { space_id: spaceId, position: last + 1 }, fail))
      showToast(`Moved to ${to}`, async () => { await patchProject(_id, { space_id: from, position }, fail); });
  }

  $: total = tasks.length + archived.length;
  const nameOf = (colId: string) => project.columns.find(c => c.id === colId)?.name ?? '';
</script>

<Sheet bind:this={sheet} title={view === 'archived' ? 'Archived tasks' : view === 'delete' ? 'Delete this project?' : view === 'rename' ? 'Rename project' : view === 'move' ? 'Move to another space' : project.name} on:close={closed}>
  {#if view === 'main'}
    <div class="p-group">
      <button class="p-row" on:click={() => { newName = project.name; view = 'rename'; }}>Rename</button>
      <button class="p-row" disabled={spaceList.length < 2} on:click={() => view = 'move'}>Move to another space<span class="p-v">{spaceName}</span></button>
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
  {:else if view === 'rename'}
    <!-- svelte-ignore a11y-autofocus -->
    <input class="p-fld" bind:value={newName} aria-label="Project name" autofocus enterkeyhint="done"
      on:keydown={(e) => { if (e.key === 'Enter') rename(); }} />
    {#if dupHint}<p class="p-say">{dupHint}</p>{/if}
    <button class="p-go" disabled={!newName.trim()} on:click={rename}>Save</button>
  {:else if view === 'move'}
    <div class="p-group">
      {#each spaceList as sp (sp._id)}
        <button class="p-row" aria-pressed={sp._id === project.space_id} on:click={() => move(sp._id)}>
          <span class="p-dot" style="background:{soften(sp.color)}"></span>
          <span class="p-k"><span>{sp.name}</span></span>
          {#if sp._id === project.space_id}<span class="p-tick">{@html I.check}</span>{/if}
        </button>
      {/each}
    </div>
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
