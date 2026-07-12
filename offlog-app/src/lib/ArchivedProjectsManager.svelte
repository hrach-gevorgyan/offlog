<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getProjects, getArchivedProjects, archiveProject, unarchiveProject, deleteProject, subscribe } from './db';
  import { reloadTasks, showError } from './store';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import CustomSelect from './CustomSelect.svelte';
  import type { ProjectDoc } from './types';

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let activeProjects: ProjectDoc[] = [];
  let archivedProjects: ProjectDoc[] = [];
  let pickerId = '';
  $: pickerOptions = [{ value: '', label: 'Choose a project…' }, ...activeProjects.map(p => ({ value: p._id!, label: p.name }))];

  async function load() {
    [activeProjects, archivedProjects] = await Promise.all([getProjects(), getArchivedProjects()]);
  }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  async function doArchive() {
    if (!pickerId) return;
    const name = activeProjects.find(p => p._id === pickerId)?.name ?? 'this project';
    if (!(await confirmAction(`Archive project "${name}"? It'll be hidden until restored here.`, { confirmLabel: 'Archive' }))) return;
    try {
      await archiveProject(pickerId);
      pickerId = '';
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to archive project. Please try again.');
    }
  }

  async function doRestore(id: string) {
    try {
      await unarchiveProject(id);
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to restore project. Please try again.');
    }
  }

  async function doDelete(id: string, name: string) {
    if (!(await confirmAction(`Delete project "${name}" and all its tasks? This can't be undone.`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteProject(id);
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to delete project. Please try again.');
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()}></div>

<div class="panel" use:trapFocus>
  <div class="panel-head">
    <span class="panel-title">Archived Projects</span>
    <button class="close-btn" on:click={() => requestClose()}>✕</button>
  </div>

  <div class="ap-sub">Archiving hides a project and its open tasks — nothing is deleted.</div>

  <div class="item-list">
    <div class="picker-row">
      <div class="picker-select">
        <CustomSelect options={pickerOptions} bind:value={pickerId} />
      </div>
      <button class="archive-btn" on:click={doArchive} disabled={!pickerId}>Archive</button>
    </div>

    {#if archivedProjects.length === 0}
      <div class="empty">No archived projects yet.</div>
    {:else}
      {#each archivedProjects as p (p._id)}
        <div class="row">
          <span class="name">{p.name}</span>
          <button class="restore-btn" on:click={() => doRestore(p._id)}>Restore</button>
          <button class="delete-btn" title="Delete project" aria-label="Delete project {p.name}" on:click={() => doDelete(p._id, p.name)}>×</button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* .scrim is defined globally in app.css */

  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw);
    background: var(--surface); border-left: 1px solid var(--border);
    box-shadow: -8px 0 32px rgba(0,0,0,.15); z-index: 402;
    display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top, 0px);
    animation: slideIn .38s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  .panel-head {
    display: flex; align-items: center; gap: 8px;
    padding: 20px 24px 4px; flex-shrink: 0;
  }
  .panel-title { font-size: 16px; font-weight: 700; flex: 1; letter-spacing: -.015em; }

  .ap-sub {
    padding: 0 24px 16px; font-family: var(--mono); font-size: 11px; color: var(--faint);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--hover); color: var(--text); }

  .item-list { flex: 1; overflow-y: auto; padding: 12px 24px 24px; }
  .empty { color: var(--faint); font-size: 13.5px; padding: 12px 0; line-height: 1.5; }

  .picker-row {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 14px;
  }
  .picker-select { flex: 1; min-width: 0; }
  .archive-btn {
    flex-shrink: 0; background: var(--accent); border: none; cursor: pointer;
    color: #fff; font-size: 13px; font-weight: 600; padding: .48rem .8rem;
    border-radius: var(--radius-sm); transition: opacity .12s;
  }
  .archive-btn:hover:not(:disabled) { opacity: .88; }
  .archive-btn:disabled { opacity: .45; cursor: default; }

  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }
  .name { flex: 1; font-size: 13.5px; color: var(--text); }

  .restore-btn {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    color: var(--accent); font-size: 12.5px; font-weight: 600; padding: .3rem .5rem;
    border-radius: 6px;
  }
  .restore-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  .delete-btn {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; padding: .15rem .5rem; border-radius: 6px;
    transition: background .1s, color .1s;
  }
  .delete-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
</style>
