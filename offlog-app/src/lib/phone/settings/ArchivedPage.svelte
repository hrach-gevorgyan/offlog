<script lang="ts">
  // Archived projects as a phone page: ArchivedProjectsManager's behaviour.
  import { onMount } from 'svelte';
  import { getProjects, getArchivedProjects, archiveProject, unarchiveProject, deleteProject, subscribe } from '../../db';
  import { reloadTasks, showError, activeProjectId, spaces } from '../../store';
  import { confirmAction } from '../../confirm';
  import type { ProjectDoc } from '../../types';
  import TopBar from '../TopBar.svelte';
  import Sheet from '../Sheet.svelte';
  import { showToast } from '../nav';
  import { soften } from '../../tagColors';

  let active: ProjectDoc[] = [];
  let archived: ProjectDoc[] = [];
  let loaded = false;

  async function load() {
    try {
      [active, archived] = await Promise.all([getProjects(), getArchivedProjects()]);
    } catch {
      showError('Failed to load archived projects.');
    } finally {
      loaded = true;
    }
  }
  onMount(() => {
    load();
    return subscribe(() => load());
  });

  $: spaceOf = (p: ProjectDoc) => $spaces.find(s => s._id === p.space_id);

  let pickerOpen = false;
  let pickerSession = 0;
  function openPicker() { pickerSession++; pickerOpen = true; }

  async function doArchive(p: ProjectDoc, close: () => void) {
    close();
    if (!(await confirmAction(`Archive project "${p.name}"? It'll be hidden until restored here.`, { confirmLabel: 'Archive' }))) return;
    try {
      await archiveProject(p._id!);
      // An archived project left as the active one blanks the board.
      if ($activeProjectId === p._id) activeProjectId.set('');
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to archive project. Please try again.');
    }
  }

  async function doRestore(p: ProjectDoc) {
    try {
      await unarchiveProject(p._id!);
      await load();
      await reloadTasks();
      showToast(`Restored: ${p.name}`);
    } catch {
      showError('Failed to restore project. Please try again.');
    }
  }

  async function doDelete(p: ProjectDoc) {
    if (!(await confirmAction(`Delete project "${p.name}" and all its tasks? This can't be undone.`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteProject(p._id!);
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to delete project. Please try again.');
    }
  }
</script>

<TopBar title="Archived projects" sub="Archiving hides a project and its open tasks — nothing is deleted.">
  {#if active.length}<button class="p-tbtn" on:click={openPicker}>Archive…</button>{/if}
</TopBar>

{#if !loaded}
  <p class="p-empty">Loading…</p>
{:else if archived.length === 0}
  <p class="p-empty">No archived projects.</p>
{:else}
  <div class="p-group">
    {#each archived as p (p._id)}
      {@const s = spaceOf(p)}
      <div class="p-row item">
        <span class="p-k">
          <span>{p.name}</span>
          {#if s}<span class="p-sub"><span class="p-dot" style:background={soften(s.color)}></span> {s.name}</span>{/if}
        </span>
        <button class="p-tbtn" on:click={() => doRestore(p)}>Restore</button>
        <button class="p-tbtn danger" on:click={() => doDelete(p)}>Delete</button>
      </div>
    {/each}
  </div>
{/if}

{#if pickerOpen}
  {#key pickerSession}
    <Sheet title="Archive a project" on:close={() => pickerOpen = false} let:close>
      <div class="p-group">
        {#each active as p (p._id)}
          <button class="p-row" on:click={() => doArchive(p, close)}><span class="p-k"><span>{p.name}</span></span></button>
        {/each}
      </div>
    </Sheet>
  {/key}
{/if}

<style>
  .item { cursor: default; gap: 2px; padding-right: 6px; }
  .p-row.item:active { background: none; }
</style>
