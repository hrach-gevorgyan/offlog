<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getTagCounts, renameTag, deleteTagEverywhere, subscribe } from './db';
  import { reloadTasks, showError } from './store';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let items: { tag: string; count: number }[] = [];
  let editingTag: string | null = null;
  let editingName = '';

  async function load() { items = await getTagCounts(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (editingTag) editingTag = null; else requestClose(); }
  }

  function startEdit(tag: string) { editingTag = tag; editingName = tag; }

  async function saveEdit(tag: string) {
    const next = editingName.trim().toLowerCase().replace(/\s+/g, '-');
    editingTag = null;
    if (!next || next === tag) return;
    try {
      await renameTag(tag, next);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to rename tag. Please try again.');
    }
  }

  async function remove(tag: string, count: number) {
    if (!(await confirmAction(`Remove tag "${tag}" from ${count} task${count === 1 ? '' : 's'}? This can't be undone.`, { danger: true, confirmLabel: 'Remove' }))) return;
    try {
      await deleteTagEverywhere(tag);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to delete tag. Please try again.');
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()}></div>

<div class="panel" use:trapFocus>
  <div class="panel-head">
    <span class="panel-title">Manage Tags</span>
    <button class="close-btn" on:click={() => requestClose()}>✕</button>
  </div>

  <div class="tg-sub">Rename a tag to match another to merge them.</div>

  <div class="item-list">
    {#if items.length === 0}
      <div class="empty">No tags yet. Tags are added per-task from the task editor.</div>
    {:else}
      {#each items as { tag, count } (tag)}
        <div class="row">
          {#if editingTag === tag}
            <!-- svelte-ignore a11y-autofocus -->
            <input
              class="name-input"
              autofocus
              bind:value={editingName}
              on:keydown={(e) => { if (e.key === 'Enter') saveEdit(tag); if (e.key === 'Escape') editingTag = null; }}
              on:blur={() => saveEdit(tag)}
            />
          {:else}
            <button class="name-btn" on:click={() => startEdit(tag)}>{tag}</button>
          {/if}
          <span class="count">{count}</span>
          <button class="delete-btn" on:click={() => remove(tag, count)} title="Delete tag" aria-label="Delete tag {tag}">×</button>
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

  .tg-sub {
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

  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }

  .name-btn {
    flex: 1; text-align: left; background: none; border: none; cursor: pointer;
    font-family: var(--mono); font-size: 13px; color: var(--text); padding: .3rem .4rem; border-radius: 6px;
    transition: background .1s;
  }
  .name-btn:hover { background: var(--hover); }

  .name-input {
    flex: 1; font-family: var(--mono); font-size: 13px; padding: .3rem .4rem; border-radius: 6px;
    border: 1.5px solid var(--accent); background: var(--bg); color: var(--text);
  }

  .count {
    font-family: var(--mono); font-size: 11px; color: var(--faint);
    background: var(--col-bg); padding: 2px 8px; border-radius: 6px; flex-shrink: 0;
  }

  .delete-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; padding: .15rem .5rem; border-radius: 6px;
    flex-shrink: 0; transition: background .1s, color .1s;
  }
  .delete-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
</style>
