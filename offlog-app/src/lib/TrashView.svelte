<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getAllDeletedTasks, undoDelete, deleteForever, emptyTrash, subscribe } from './db';
  import { reloadTasks, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR } from './constants';
  import type { TaskDoc } from './types';

  const dispatch = createEventDispatcher<{ menu: void }>();

  type TrashedTask = TaskDoc & { project_name?: string };

  let items: TrashedTask[] = [];
  let emptying = false;

  async function load() { items = await getAllDeletedTasks(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

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
    if (!confirm(`Permanently delete "${t.title}"? This can't be undone.`)) return;
    try {
      await deleteForever(t._id!);
      await load();
    } catch {
      showError('Failed to delete task. Please try again.');
    }
  }

  async function emptyAll() {
    if (!items.length) return;
    if (!confirm(`Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'} in Trash? This can't be undone.`)) return;
    emptying = true;
    try {
      await emptyTrash();
      await load();
    } catch {
      showError('Failed to empty Trash. Please try again.');
    } finally {
      emptying = false;
    }
  }
</script>

<div class="trash">
  <div class="tr-header">
    <button class="hamburger" on:click={() => dispatch('menu')} aria-label="Menu">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
      </svg>
    </button>
    <div class="title-block">
      <h1 class="tr-title">Trash</h1>
      <span class="tr-count">{items.length} deleted task{items.length === 1 ? '' : 's'} · auto-removed after 3 months</span>
    </div>
    <div class="spacer"></div>
    {#if items.length > 0}
      <button class="empty-trash-btn" on:click={emptyAll} disabled={emptying}>{emptying ? 'Emptying…' : 'Empty Trash'}</button>
    {/if}
  </div>

  <div class="tr-body">
    {#if items.length === 0}
      <div class="empty">Trash is empty. Deleted tasks show up here and can be restored, or removed for good.</div>
    {:else}
      {#each items as t (t._id)}
        <div class="trash-row">
          <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}"></span>
          <span class="task-title">{t.title}</span>
          <span class="proj-badge">{t.project_name ?? '—'}</span>
          <span class="deleted-chip">Deleted {timeAgo(t.updated_at)}</span>
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
  .trash { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .tr-header {
    display: flex; align-items: center; gap: 10px;
    padding: 20px 28px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .title-block { min-width: 0; }
  .tr-title { margin: 0 0 3px; font-size: 20px; font-weight: 700; letter-spacing: -.015em; }
  .tr-count { font-family: var(--mono); font-size: 11px; color: var(--faint); }
  .spacer { flex: 1; }

  .hamburger {
    display: none;
    background: none; border: none; cursor: pointer;
    color: var(--text); padding: 4px; border-radius: 6px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .hamburger:hover { background: var(--hover); }

  .empty-trash-btn {
    padding: .45rem .9rem; border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger); font-size: .82rem; font-weight: 600; cursor: pointer;
    white-space: nowrap; transition: background .12s;
  }
  .empty-trash-btn:hover { background: color-mix(in srgb, var(--danger) 18%, transparent); }
  .empty-trash-btn:disabled { opacity: .5; cursor: default; }

  .tr-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px 40px;
    width: 100%; max-width: 900px; box-sizing: border-box;
  }

  .empty { color: var(--faint); font-size: 14px; padding: 12px 0; max-width: 46ch; }

  .trash-row {
    display: grid;
    grid-template-columns: 10px 1fr auto auto auto auto;
    align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--surface);
    margin-bottom: 5px;
  }

  .prio-dot { width: 8px; height: 8px; border-radius: 50%; }

  .task-title {
    font-size: 14px; font-weight: 500; color: var(--muted);
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .proj-badge {
    font-family: var(--mono); font-size: 10px; color: var(--faint);
    background: var(--col-bg); padding: 2px 8px; border-radius: 6px;
    white-space: nowrap;
  }

  .deleted-chip {
    font-family: var(--mono); font-size: 11px; font-weight: 500; color: var(--faint);
    white-space: nowrap;
  }

  .restore-btn {
    padding: .3rem .7rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--bg); color: var(--text); font-size: .78rem; font-weight: 500;
    white-space: nowrap; transition: background .1s;
  }
  .restore-btn:hover { background: var(--hover); }

  .forever-btn {
    background: none; border: none; cursor: pointer;
    color: var(--faint); padding: .3rem; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    transition: background .1s, color .1s;
  }
  .forever-btn:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }

  @media (max-width: 768px) {
    .hamburger { display: flex; }
  }

  @media (max-width: 700px) {
    .tr-header { padding: 14px 16px 10px; }
    .tr-body   { padding: 14px 14px 32px; }
    .tr-title  { font-size: 17px; }
    .proj-badge { display: none; }
  }

  @media (max-width: 480px) {
    .trash-row { grid-template-columns: 1fr auto auto; row-gap: 6px; }
    .prio-dot, .deleted-chip { display: none; }
  }
</style>
