<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getAllDeletedTasks, undoDelete, deleteForever, emptyTrash, subscribe } from './db';
  import { reloadTasks, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR } from './constants';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import type { TaskDoc } from './types';

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  type TrashedTask = TaskDoc & { project_name?: string };

  let items: TrashedTask[] = [];
  let emptying = false;

  async function load() { items = await getAllDeletedTasks(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  // Deleted tasks only carry a timestamp, not a duration — this turns
  // updated_at into the same kind of relative label used elsewhere in the
  // app ("2h ago", "5d ago") instead of a raw ISO string.
  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
<div class="scrim" on:click|self={() => requestClose()}></div>

<div class="panel" use:trapFocus>
  <div class="panel-head">
    <span class="panel-title">Recycle</span>
    {#if items.length > 0}
      <button class="clear-btn" on:click={emptyAll} disabled={emptying}>{emptying ? 'Emptying…' : 'Empty'}</button>
    {/if}
    <button class="close-btn" on:click={() => requestClose()}>✕</button>
  </div>

  <div class="rc-sub">{items.length} deleted task{items.length === 1 ? '' : 's'} · auto-removed after 3 months</div>

  <div class="item-list">
    {#if items.length === 0}
      <div class="empty">Recycle is empty. Deleted tasks show up here and can be restored, or removed for good.</div>
    {:else}
      {#each items as t (t._id)}
        <div class="item-row">
          <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}"></span>
          <div class="item-main">
            <span class="item-title">{t.title}</span>
            {#if t.project_name}<span class="item-proj">{t.project_name}</span>{/if}
          </div>
          <span class="item-time">{timeAgo(t.updated_at)}</span>
          <button class="restore-btn" on:click={() => restore(t._id!)}>Restore</button>
          <button class="forever-btn" on:click={() => removeForever(t)} title="Delete forever" aria-label="Delete forever">
            <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 4h10M5.5 4V2.5h3V4M3 4l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L11 4"/>
            </svg>
          </button>
        </div>
      {/each}
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
    animation: slideIn .38s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

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
    padding: 4px 10px; transition: background .12s;
  }
  .clear-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .clear-btn:disabled { opacity: .5; cursor: default; }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--hover); color: var(--text); }

  .item-list { flex: 1; overflow-y: auto; padding: 12px 24px 24px; }
  .empty { color: var(--faint); font-size: 13.5px; padding: 12px 0; line-height: 1.5; }

  .item-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 0; border-bottom: 1px solid var(--border);
  }
  .prio-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .item-title {
    font-size: 13.5px; font-weight: 500; color: var(--muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .item-proj { font-family: var(--mono); font-size: 10px; color: var(--faint); }

  .item-time {
    font-family: var(--mono); font-size: 10.5px; color: var(--faint);
    white-space: nowrap; flex-shrink: 0;
  }

  .restore-btn {
    padding: .3rem .65rem; border-radius: 6px;
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--bg); color: var(--text); font-size: .75rem; font-weight: 500;
    white-space: nowrap; transition: background .1s; flex-shrink: 0;
  }
  .restore-btn:hover { background: var(--hover); }

  .forever-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); padding: .3rem; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    transition: background .1s, color .1s; flex-shrink: 0;
  }
  .forever-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
</style>
