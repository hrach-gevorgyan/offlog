<script lang="ts">
  import Empty from '../Empty.svelte';
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
  import { I } from '../icons';

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

  // Archive runs after the sheet has finished closing: its history entry
  // must be popped before anything else opens or the two race.
  let afterClose: (() => void) | null = null;
  function pick(p: ProjectDoc, close: () => void) { afterClose = () => doArchive(p); close(); }
  function onPickerClosed() {
    pickerOpen = false;
    const fn = afterClose;
    afterClose = null;
    fn?.();
  }

  // Reversible, so it acts at once and offers Undo.
  async function doArchive(p: ProjectDoc) {
    try {
      await archiveProject(p._id!);
      // An archived project left as the active one blanks the board.
      if ($activeProjectId === p._id) activeProjectId.set('');
      await load();
      await reloadTasks();
      showToast(`Archived: ${p.name}`, async () => {
        try {
          await unarchiveProject(p._id!);
          await load();
          await reloadTasks();
        } catch {
          showError('Could not undo. Please try again.');
        }
      });
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

<TopBar title="Archived projects" />

{#if loaded}
  {#if archived.length === 0}<Empty title="No archived projects" text="Archived projects rest here, out of the way." />{/if}
  {#if archived.length || active.length}
    <div class="p-group">
      {#each archived as p (p._id)}
        {@const s = spaceOf(p)}
        <div class="p-row item">
          <span class="p-k">
            <span class="name">{p.name}</span>
            {#if s}<span class="p-sub sp"><span class="p-dot" style:background={soften(s.color)}></span>{s.name}</span>{/if}
          </span>
          <button class="p-tbtn" on:click={() => doRestore(p)} aria-label="Restore {p.name}">Restore</button>
          <button class="p-ib del" on:click={() => doDelete(p)} aria-label="Delete {p.name}">{@html I.trash}</button>
        </div>
      {/each}
      {#if active.length}
        <button class="p-row acc" on:click={openPicker}>
          <span class="p-ico">{@html I.plus}</span>Archive a project
        </button>
      {/if}
    </div>
  {/if}
{/if}

{#if pickerOpen}
  {#key pickerSession}
    <Sheet title="Archive a project" on:close={onPickerClosed} let:close>
      <div class="p-group">
        {#each active as p (p._id)}
          <button class="p-row" on:click={() => pick(p, close)}><span class="p-k"><span>{p.name}</span></span></button>
        {/each}
      </div>
    </Sheet>
  {/key}
{/if}

<style>
  .item { cursor: default; gap: 4px; padding-right: 6px; }
  /* Names wrap, never truncate. */
  .p-row.item .p-k > .name { white-space: normal; overflow-wrap: anywhere; }
  .sp { display: flex; align-items: center; gap: 6px; }
  .p-row.acc .p-ico { color: var(--accent); }
  .p-row.item:active { background: none; }
  .del { color: var(--faint); }
  .del:active { color: var(--danger); }
</style>
