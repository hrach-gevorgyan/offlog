<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { panelIn, panelOut, panelScrimIn, panelScrimOut, exitMs } from './motion';
  import { getCustomFieldDefs, addCustomFieldDef, removeCustomFieldDef, updateCustomFieldDef, getCustomFieldUsageCount } from './db';
  import { showError } from './store';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import CustomSelect from './CustomSelect.svelte';
  import type { CustomFieldDef } from './types';
  // Svelte does not run intro transitions on a component's own root elements
  // when the component itself is being created -- and every panel here is
  // created by a parent's {#if}. The result was that no modal in this app
  // animated at all, however carefully its preset was tuned. Gating the
  // markup on a flag set in onMount() makes the elements the product of an
  // UPDATE inside this component, which is what Svelte animates.
  // See docs/motion.md.
  let __introReady = false;
  onMount(() => { __introReady = true; });

  const dispatch = createEventDispatcher<{ close: void }>();
    // Closing hides the markup first and only tells the parent once the outro
  // has played -- the parent's {#if} destroys this component the instant it
  // hears, which would cut the exit off before its first frame.
  //
  // modalStack is deliberately untouched: closeOnBack() still runs
  // history.back() immediately and unwinds its own entry, so back-button
  // behaviour is identical. Only the parent notification waits.
  //
  // The duration is read HERE, at close time, so Reduce Motion is honoured
  // even if it was switched on after this modal opened.
  const requestClose = closeOnBack(() => {
    __introReady = false;
    setTimeout(() => dispatch('close'), exitMs.panel(420));
  });

  let fields: CustomFieldDef[] = [];
  let newName = '';
  let newType: CustomFieldDef['type'] = 'text';
  let newOptions = '';
  const typeOptions = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Select' },
  ];

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
    const count = await getCustomFieldUsageCount(field.id);
    const usage = count > 0 ? ` Its value will be permanently erased from ${count} task${count === 1 ? '' : 's'}.` : '';
    if (!(await confirmAction(`Remove the "${field.name}" field?${usage}`, { danger: true, confirmLabel: 'Remove' }))) return;
    try {
      fields = await removeCustomFieldDef(field.id);
    } catch {
      showError('Failed to remove field. Please try again.');
    }
  }

  // Renaming a field or changing its type/options edits inline in the same
  // row rather than in a separate modal — the list is small by design (see
  // the panel's own hint text).
  let editingId: string | null = null;
  let editName = '';
  let editType: CustomFieldDef['type'] = 'text';
  let editOptions = '';

  function startEdit(field: CustomFieldDef) {
    editingId = field.id;
    editName = field.name;
    editType = field.type;
    editOptions = (field.options ?? []).join(', ');
  }
  function cancelEdit() { editingId = null; }

  async function saveEdit(field: CustomFieldDef) {
    const name = editName.trim();
    if (!name) return;
    const options = editType === 'select' ? editOptions.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    try {
      fields = await updateCustomFieldDef(field.id, { name, type: editType, options });
      editingId = null;
    } catch {
      showError('Failed to update field. Please try again.');
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
{#if __introReady}
<div class="scrim" on:click|self={() => requestClose()} in:fade={panelScrimIn(420)} out:fade={panelScrimOut(420)}></div>

<div class="panel" use:trapFocus in:fly={panelIn(420)} out:fly={panelOut(420)}>
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
        {#if editingId === field.id}
          <div class="row row-editing">
            <input class="name-input" bind:value={editName} placeholder="Field name" enterkeyhint="done" on:keydown={(e) => e.key === 'Enter' && saveEdit(field)} />
            <div class="type-select">
              <CustomSelect options={typeOptions} value={editType} placement="up" on:change={(e) => editType = e.detail as CustomFieldDef['type']} />
            </div>
            {#if editType === 'select'}
              <input class="name-input" bind:value={editOptions} placeholder="Options, comma-separated" />
            {/if}
            <div class="row-edit-actions">
              <button class="edit-cancel-btn" on:click={cancelEdit}>Cancel</button>
              <button class="edit-save-btn" on:click={() => saveEdit(field)} disabled={!editName.trim()}>Save</button>
            </div>
          </div>
        {:else}
          <div class="row">
            <button class="row-text row-edit-trigger" on:click={() => startEdit(field)} title="Edit field" aria-label="Edit field {field.name}">
              <span class="name">{field.name}</span>
              <span class="type">{field.type}{#if field.type === 'select' && field.options?.length} · {field.options.join(', ')}{/if}</span>
            </button>
            <button class="delete-btn" on:click={() => remove(field)} title="Remove field" aria-label="Remove field {field.name}">×</button>
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <div class="add-form">
    <input class="name-input" bind:value={newName} placeholder="Field name" enterkeyhint="done" on:keydown={(e) => e.key === 'Enter' && add()} />
    <div class="type-select">
      <CustomSelect options={typeOptions} value={newType} placement="up" on:change={(e) => newType = e.detail as CustomFieldDef['type']} />
    </div>
    {#if newType === 'select'}
      <input class="name-input" bind:value={newOptions} placeholder="Options, comma-separated" />
    {/if}
    <button class="add-btn" on:click={add} disabled={!newName.trim()}>+ Add field</button>
  </div>
</div>
{/if}

<style>
  /* .scrim is defined globally in app.css */

  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw);
    background: var(--surface); border-left: 1px solid var(--border);
    box-shadow: -8px 0 32px rgba(0,0,0,.15); z-index: 402;
    display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top, 0px);
  }

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
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
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

  .row-edit-trigger {
    background: none; border: none; padding: 2px 4px; margin: -2px -4px; border-radius: 6px;
    text-align: left; cursor: pointer; transition: background var(--dur-hover) var(--ease-hover);
  }
  .row-edit-trigger:hover { background: var(--hover); }

  .row-editing { flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px 0; }
  .row-edit-actions { display: flex; gap: 6px; width: 100%; justify-content: flex-end; }
  .edit-cancel-btn, .edit-save-btn {
    padding: .4rem .75rem; border-radius: var(--radius-sm); font-size: .8rem; font-weight: 500; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--bg); color: var(--text);
  }
  .edit-save-btn { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .edit-save-btn:disabled { opacity: .5; cursor: not-allowed; }

  .delete-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; padding: .15rem .5rem; border-radius: 6px;
    flex-shrink: 0; transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .delete-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }

  .add-form {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    padding: 14px 24px 24px; border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .name-input {
    padding: .45rem .6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--bg); color: var(--text); font-size: .85rem; flex: 1; min-width: 90px;
  }
  .type-select { flex: 1; min-width: 90px; }
  .add-btn {
    padding: .45rem .8rem; border-radius: var(--radius-sm); border: 1px solid var(--accent);
    background: var(--accent); color: var(--on-accent); font-size: .82rem; font-weight: 500; cursor: pointer;
    white-space: nowrap;
  }
  .add-btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
