<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getCustomFieldDefs, addCustomFieldDef, removeCustomFieldDef } from './db';
  import { showError } from './store';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import type { CustomFieldDef } from './types';

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let fields: CustomFieldDef[] = [];
  let newName = '';
  let newType: CustomFieldDef['type'] = 'text';
  let newOptions = '';

  async function load() { fields = await getCustomFieldDefs(); }
  onMount(load);

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const options = newType === 'select' ? newOptions.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    try {
      fields = await addCustomFieldDef(name, newType, options);
      newName = ''; newOptions = ''; newType = 'text';
    } catch {
      showError('Failed to add field. Please try again.');
    }
  }

  async function remove(field: CustomFieldDef) {
    if (!(await confirmAction(`Remove the "${field.name}" field? Existing values on tasks are kept but will no longer be shown.`, { danger: true, confirmLabel: 'Remove' }))) return;
    try {
      fields = await removeCustomFieldDef(field.id);
    } catch {
      showError('Failed to remove field. Please try again.');
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()}></div>

<div class="panel" use:trapFocus>
  <div class="panel-head">
    <span class="panel-title">Manage Custom Fields</span>
    <button class="close-btn" on:click={() => requestClose()}>✕</button>
  </div>

  <div class="cf-sub">Fields apply to every task in every project — keep the list short so cards stay readable.</div>

  <div class="item-list">
    {#if fields.length === 0}
      <div class="empty">No custom fields yet.</div>
    {:else}
      {#each fields as field (field.id)}
        <div class="row">
          <div class="row-text">
            <span class="name">{field.name}</span>
            <span class="type">{field.type}{#if field.type === 'select' && field.options?.length} · {field.options.join(', ')}{/if}</span>
          </div>
          <button class="delete-btn" on:click={() => remove(field)} title="Remove field" aria-label="Remove field {field.name}">×</button>
        </div>
      {/each}
    {/if}
  </div>

  <div class="add-form">
    <input class="name-input" bind:value={newName} placeholder="Field name" enterkeyhint="done" on:keydown={(e) => e.key === 'Enter' && add()} />
    <select class="type-select" bind:value={newType}>
      <option value="text">Text</option>
      <option value="number">Number</option>
      <option value="date">Date</option>
      <option value="select">Select</option>
    </select>
    {#if newType === 'select'}
      <input class="name-input" bind:value={newOptions} placeholder="Options, comma-separated" />
    {/if}
    <button class="add-btn" on:click={add} disabled={!newName.trim()}>+ Add field</button>
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

  .cf-sub {
    padding: 0 24px 16px; font-family: var(--mono); font-size: 11px; color: var(--faint);
    border-bottom: 1px solid var(--border); flex-shrink: 0; line-height: 1.5;
  }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--hover); color: var(--text); }

  .item-list { flex: 1; overflow-y: auto; padding: 12px 24px; }
  .empty { color: var(--faint); font-size: 13.5px; padding: 12px 0; line-height: 1.5; }

  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }
  .row-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .name { font-size: 13.5px; color: var(--text); font-weight: 500; }
  .type { font-family: var(--mono); font-size: 10.5px; color: var(--faint); }

  .delete-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; padding: .15rem .5rem; border-radius: 6px;
    flex-shrink: 0; transition: background .1s, color .1s;
  }
  .delete-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }

  .add-form {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    padding: 14px 24px 24px; border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .name-input, .type-select {
    padding: .45rem .6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--bg); color: var(--text); font-size: .85rem; flex: 1; min-width: 90px;
  }
  .add-btn {
    padding: .45rem .8rem; border-radius: var(--radius-sm); border: 1px solid var(--accent);
    background: var(--accent); color: #fff; font-size: .82rem; font-weight: 500; cursor: pointer;
    white-space: nowrap;
  }
  .add-btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
