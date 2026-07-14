<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { panelFly, scrimFade } from './motion';
  import { createSpace, updateSpace, reorderSpaces, deleteSpace, getSpaces, subscribe } from './db';
  import { showError } from './store';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import type { SpaceDoc } from './types';

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let items: SpaceDoc[] = [];
  let editingId: string | null = null;
  let editingName = '';
  let newName = '';
  let newColor = '#6366f1';
  let adding = false;

  async function load() { items = await getSpaces(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (editingId) editingId = null; else requestClose(); }
  }

  function startEdit(s: SpaceDoc) { editingId = s._id; editingName = s.name; }

  async function saveEdit(s: SpaceDoc) {
    const name = editingName.trim();
    editingId = null;
    if (!name || name === s.name) return;
    try {
      await updateSpace(s._id, { name });
    } catch {
      showError('Failed to rename space. Please try again.');
    }
  }

  async function setColor(s: SpaceDoc, color: string) {
    try {
      await updateSpace(s._id, { color });
    } catch {
      showError('Failed to recolor space. Please try again.');
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await reorderSpaces(reordered.map(s => s._id));
    } catch {
      showError('Failed to reorder spaces. Please try again.');
    }
  }

  async function remove(s: SpaceDoc) {
    if (!(await confirmAction(`Delete space "${s.name}"? Its projects will move to Unsorted.`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteSpace(s._id);
    } catch (e: any) {
      showError(e?.message ?? 'Failed to delete space. Please try again.');
    }
  }

  async function addSpace() {
    const name = newName.trim();
    if (!name) { adding = false; return; }
    try {
      await createSpace(name, newColor);
      newName = '';
      newColor = '#6366f1';
    } catch {
      showError('Failed to create space. Please try again.');
    }
    adding = false;
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()} transition:fade={scrimFade}></div>

<div class="panel" use:trapFocus transition:fly={panelFly}>
  <div class="panel-head">
    <span class="panel-title">Manage Spaces</span>
    <button class="close-btn" on:click={() => requestClose()}>✕</button>
  </div>

  <div class="item-list">
    {#each items as s, i (s._id)}
      <div class="row">
        <label class="swatch-wrap" title="Change color">
          <input type="color" value={s.color} on:change={(e) => setColor(s, (e.target as HTMLInputElement).value)} />
          <span class="swatch" style="background:{s.color}"></span>
        </label>

        {#if editingId === s._id}
          <!-- svelte-ignore a11y-autofocus -->
          <input
            class="name-input"
            autofocus
            bind:value={editingName}
            on:keydown={(e) => { if (e.key === 'Enter') saveEdit(s); if (e.key === 'Escape') editingId = null; }}
            on:blur={() => saveEdit(s)}
          />
        {:else}
          <button class="name-btn" on:click={() => startEdit(s)}>{s.name}</button>
        {/if}

        <div class="reorder-btns">
          <button on:click={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
          <button on:click={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" title="Move down">↓</button>
        </div>

        {#if s._id !== 'space:unsorted'}
          <button class="delete-btn" on:click={() => remove(s)} title="Delete space" aria-label="Delete space">×</button>
        {/if}
      </div>
    {/each}

    {#if adding}
      <div class="row new-row">
        <label class="swatch-wrap" title="Pick a color">
          <input type="color" bind:value={newColor} />
          <span class="swatch" style="background:{newColor}"></span>
        </label>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          class="name-input"
          autofocus
          placeholder="Space name…"
          bind:value={newName}
          on:keydown={(e) => { if (e.key === 'Enter') addSpace(); if (e.key === 'Escape') adding = false; }}
          on:blur={addSpace}
        />
      </div>
    {:else}
      <button class="add-btn" on:click={() => { adding = true; newName = ''; newColor = '#6366f1'; }}>+ New space</button>
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
  }

  .panel-head {
    display: flex; align-items: center; gap: 8px;
    padding: 20px 24px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .panel-title { font-size: 16px; font-weight: 700; flex: 1; letter-spacing: -.015em; }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--hover); color: var(--text); }

  .item-list { flex: 1; overflow-y: auto; padding: 12px 24px 24px; }

  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }

  .swatch-wrap { position: relative; width: 20px; height: 20px; flex-shrink: 0; cursor: pointer; }
  .swatch-wrap input[type="color"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .swatch { display: block; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); }

  .name-btn {
    flex: 1; text-align: left; background: none; border: none; cursor: pointer;
    font-size: 14px; color: var(--text); padding: .3rem .4rem; border-radius: 6px;
    transition: background .1s;
  }
  .name-btn:hover { background: var(--hover); }

  .name-input {
    flex: 1; font-size: 14px; padding: .3rem .4rem; border-radius: 6px;
    border: 1.5px solid var(--accent); background: var(--bg); color: var(--text);
  }

  .reorder-btns { display: flex; gap: 2px; flex-shrink: 0; }
  .reorder-btns button {
    background: none; border: none; cursor: pointer; color: var(--faint);
    padding: .25rem .4rem; border-radius: 6px; font-size: 13px;
    transition: background .1s, color .1s;
  }
  .reorder-btns button:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .reorder-btns button:disabled { opacity: .3; cursor: default; }

  .delete-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; padding: .15rem .5rem; border-radius: 6px;
    flex-shrink: 0; transition: background .1s, color .1s;
  }
  .delete-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }

  .add-btn {
    background: none; border: none; cursor: pointer; color: var(--accent);
    font-size: 13.5px; font-weight: 500; padding: .6rem .4rem; text-align: left;
  }
  .add-btn:hover { text-decoration: underline; }

  .new-row .swatch-wrap { margin-left: 0; }
</style>
