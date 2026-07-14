<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { quickAddPop, scrimFade } from './motion';
  import { projects, reloadTasks, spaces, showError } from './store';
  import { createTask } from './db';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import CustomSelect from './CustomSelect.svelte';

  const dispatch = createEventDispatcher<{ close: void; created: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let title = '';
  let projectId = '';
  let inputEl: HTMLInputElement;
  let saving = false;

  // pick a sensible default project
  $: if (!projectId && $projects.length) projectId = $projects[0]._id;

  $: projectOptions = $projects.map(p => {
    const sp = $spaces.find(s => s._id === p.space_id);
    return { value: p._id, label: p.name, group: sp?.name ?? '' };
  });

  onMount(async () => { await tick(); inputEl?.focus(); });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
    if (e.key === 'Enter') doAdd();
  }

  async function doAdd() {
    const t = title.trim();
    if (!t || !projectId) return;
    saving = true;
    const proj = $projects.find(p => p._id === projectId);
    if (!proj) { saving = false; return; }
    const firstCol = proj.columns[0].id;
    try {
      await createTask(projectId, proj.space_id, firstCol, t);
      await reloadTasks();
      title = '';
      dispatch('created');
      requestClose();
    } catch {
      showError('Failed to create task. Please try again.');
    } finally {
      saving = false;
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click={() => requestClose()} transition:fade={scrimFade}></div>

<div class="panel" use:trapFocus transition:quickAddPop>
  <div class="panel-title">Quick add task</div>

  <input
    bind:this={inputEl}
    bind:value={title}
    class="title-input"
    placeholder="Task title…"
    enterkeyhint="done"
    on:keydown={onKey}
  />

  <div class="row">
    <div class="proj-select-wrap">
      <CustomSelect options={projectOptions} bind:value={projectId} placement="up" />
    </div>

    <div class="actions">
      <button class="cancel-btn" on:click={() => requestClose()}>Cancel</button>
      <button class="add-btn" on:click={doAdd} disabled={!title.trim() || saving}>
        {saving ? 'Adding…' : 'Add task'}
      </button>
    </div>
  </div>
</div>

<style>
  /* .scrim is defined globally in app.css */

  .panel {
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    width: min(480px, 95vw); z-index: 501;
    background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.28);
    padding: 16px 18px; display: flex; flex-direction: column; gap: 12px;
  }

  .panel-title { font-size: 11px; font-family: var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--faint); font-weight: 700; }

  .title-input {
    width: 100%; border: 1.5px solid var(--border-strong); border-radius: var(--radius-sm);
    padding: .55rem .7rem; font-size: 15px; font-family: inherit;
    background: var(--bg); color: var(--text); outline: none;
    transition: border-color .12s;
    box-sizing: border-box;
  }
  .title-input:focus { border-color: var(--accent); background: var(--surface); }
  .title-input::placeholder { color: var(--faint); }

  .row { display: flex; align-items: center; gap: 10px; }

  .proj-select-wrap { flex: 1; min-width: 0; }

  .actions { display: flex; gap: 7px; flex-shrink: 0; }

  .cancel-btn {
    padding: .42rem .85rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--muted); font-size: .85rem; font-weight: 500;
  }
  .cancel-btn:hover { color: var(--text); }

  .add-btn {
    padding: .42rem .85rem; border-radius: var(--radius-sm);
    border: none; cursor: pointer;
    background: var(--accent); color: var(--on-accent); font-size: .85rem; font-weight: 600;
    transition: opacity .12s;
  }
  .add-btn:disabled { opacity: .45; cursor: default; }
  .add-btn:not(:disabled):hover { opacity: .88; }
</style>
