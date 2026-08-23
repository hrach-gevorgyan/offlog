<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { panelFly, scrimFade } from './motion';
  import { getAllDeletedTasks, undoDelete, deleteForever, emptyTrash, subscribe } from './db';
  import { reloadTasks, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import { timeAgo } from './utils';
  import type { TaskDoc } from './types';

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  type TrashedTask = TaskDoc & { project_name?: string };

  let items: TrashedTask[] = [];
  let emptying = false;
  let restoringAll = false;

  async function load() { items = await getAllDeletedTasks(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  async function restore(id: string) {
    try {
      await undoDelete(id);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to restore task. Please try again.');
    }
  }

  async function removeForever(t: TrashedTask) {
    if (!(await confirmAction(`Permanently delete "${t.title}"? This can't be undone.`, { danger: true, confirmLabel: 'Delete forever' }))) return;
    try {
      await deleteForever(t._id!);
      await load();
    } catch {
      showError('Failed to delete task. Please try again.');
    }
  }

  async function restoreAll() {
    if (!items.length) return;
    if (!(await confirmAction(`Restore all ${items.length} item${items.length === 1 ? '' : 's'} from Recycle?`, { confirmLabel: 'Restore all' }))) return;
    restoringAll = true;
    try {
      for (const t of items) await undoDelete(t._id!);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to restore some tasks. Please try again.');
    } finally {
      restoringAll = false;
    }
  }

  async function emptyAll() {
    if (!items.length) return;
    if (!(await confirmAction(`Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'} in Recycle? This can't be undone.`, { danger: true, confirmLabel: 'Empty Recycle' }))) return;
    emptying = true;
    try {
      await emptyTrash();
      await load();
    } catch {
      showError('Failed to empty Recycle. Please try again.');
    } finally {
      emptying = false;
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()} transition:fade={scrimFade}></div>

<div class="panel" use:trapFocus transition:fly={panelFly}>
  <div class="panel-head">
    <span class="panel-title">Recycle</span>
    {#if items.length > 0}
      <button class="restore-all-btn" on:click={restoreAll} disabled={restoringAll || emptying}>{restoringAll ? 'Restoring…' : 'Restore all'}</button>
      <button class="clear-btn" on:click={emptyAll} disabled={emptying || restoringAll}>{emptying ? 'Emptying…' : 'Empty'}</button>
    {/if}
    <button class="close-btn" on:click={() => requestClose()}>✕</button>
  </div>

  <div class="rc-sub">{items.length} deleted task{items.length === 1 ? '' : 's'} · auto-removed after 3 months</div>

  <div class="item-list">
    {#if items.length === 0}
      <div class="empty">Recycle is empty. Deleted tasks show up here and can be restored, or removed for good.</div>
    {:else}
      <div class="item-rows">
        {#each items as t (t._id)}
          <div class="item-row">
            <span class="prio-bar" style="background:{PRIO_COLOR[t.priority]}" title={PRIO_LABEL[t.priority]}></span>
            <div class="item-main">
              <span class="item-title">{t.title}</span>
              {#if t.project_name}<span class="item-proj">{t.project_name}</span>{/if}
            </div>
            <span class="item-time">{timeAgo(t.updated_at)}</span>
            <button class="restore-btn" on:click={() => restore(t._id!)} title="Restore" aria-label="Restore">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
            </button>
            <button class="forever-btn" on:click={() => removeForever(t)} title="Delete forever" aria-label="Delete forever">
              <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 4h10M5.5 4V2.5h3V4M3 4l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L11 4"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* .scrim is defined globally in app.css */

  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 100vw);
    background: var(--surface); border-left: 1px solid var(--border);
    box-shadow: -8px 0 32px rgba(0,0,0,.15); z-index: 402;
    display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top, 0px);
  }

  .panel-head {
    display: flex; align-items: center; gap: 8px;
    padding: 20px 24px 4px; border-bottom: none; flex-shrink: 0;
  }
  .panel-title { font-size: 16px; font-weight: 700; flex: 1; letter-spacing: -.015em; }

  .rc-sub {
    padding: 0 24px 16px; font-family: var(--mono); font-size: 11px; color: var(--faint);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }

  .clear-btn {
    background: none; border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent); border-radius: 6px;
    cursor: pointer; font-size: 11.5px; font-weight: 500; color: var(--danger);
    padding: 4px 10px; transition: background .12s; flex-shrink: 0;
  }
  .clear-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .clear-btn:disabled { opacity: .5; cursor: default; }

  .restore-all-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px;
    cursor: pointer; font-size: 11.5px; font-weight: 500; color: var(--muted);
    padding: 4px 10px; transition: background .12s, color .12s, border-color .12s; flex-shrink: 0;
  }
  .restore-all-btn:hover { background: var(--hover); color: var(--text); border-color: var(--accent); }
  .restore-all-btn:disabled { opacity: .5; cursor: default; }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--hover); color: var(--text); }

  .item-list { flex: 1; overflow-y: auto; padding: 12px 24px 24px; }
  .empty { color: var(--faint); font-size: 13.5px; padding: 12px 0; line-height: 1.5; }

  /* A 1px gap of border color between rows plus a rounded .prio-bar
     segment per row — not a border-left on the row, which renders as one
     continuous stripe across adjacent rows of the same priority color.
     Same construction as Dashboard's Today/Pinned/Overdue lists. */
  .item-rows {
    display: flex; flex-direction: column; gap: 1px;
    background: var(--border); border-radius: 10px; overflow: hidden;
  }
  .item-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px; background: var(--surface);
  }
  .prio-bar { width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }

  .item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  /* Wrap, never truncate — the app-wide convention for task titles. */
  .item-title {
    font-size: 13.5px; font-weight: 500; color: var(--muted);
    overflow-wrap: break-word;
  }
  .item-proj { font-family: var(--mono); font-size: 10px; color: var(--faint); }

  .item-time {
    font-family: var(--mono); font-size: 10.5px; color: var(--faint);
    white-space: nowrap; flex-shrink: 0;
  }

  /* Two matching icon buttons (restore / delete forever), same size and
     shape, distinguished only by hover color per action. */
  .restore-btn, .forever-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); padding: .3rem; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    transition: background .12s, color .12s; flex-shrink: 0;
  }
  .restore-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .forever-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
</style>
