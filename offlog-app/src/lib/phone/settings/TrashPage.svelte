<script lang="ts">
  // The Recycle bin as a phone page: TrashView's behaviour, phone layout.
  import { onMount } from 'svelte';
  import { getAllDeletedTasks, undoDelete, deleteForever, emptyTrash, subscribe } from '../../db';
  import { reloadTasks, showError } from '../../store';
  import { confirmAction } from '../../confirm';
  import { timeAgo } from '../../utils';
  import type { TaskDoc } from '../../types';
  import TopBar from '../TopBar.svelte';
  import { showToast } from '../nav';
  import { I } from '../icons';

  type TrashedTask = TaskDoc & { project_name?: string };
  let items: TrashedTask[] = [];
  let loaded = false;
  let busy = false;

  async function load() {
    try {
      items = await getAllDeletedTasks();
    } catch {
      showError('Failed to load the Recycle bin.');
    } finally {
      loaded = true;
    }
  }
  onMount(() => {
    load();
    return subscribe(() => load());
  });

  // A task whose project was deleted was hard-removed with it; retrying
  // can never bring it back, so don't say "try again".
  const isGoneForever = (e: unknown) =>
    (e as { status?: number })?.status === 404 || (e as { name?: string })?.name === 'not_found';

  async function restore(t: TrashedTask) {
    try {
      await undoDelete(t._id!);
      await reloadTasks();
      await load();
      showToast(`Restored: ${t.title}`);
    } catch (e) {
      if (isGoneForever(e)) {
        showError('That task no longer exists — it was removed permanently.');
        await load();
      } else {
        showError('Failed to restore task. Please try again.');
      }
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

  // Per task, so one unrestorable item doesn't strand everything after it.
  async function restoreAll() {
    if (!items.length) return;
    const all = items;
    if (!(await confirmAction(`Restore all ${all.length} item${all.length === 1 ? '' : 's'} from the Recycle bin?`, { confirmLabel: 'Restore all' }))) return;
    busy = true;
    let failed = 0;
    try {
      for (const t of all) {
        try { await undoDelete(t._id!); } catch { failed++; }
      }
      await reloadTasks();
      await load();
      if (failed) showError(`Restored ${all.length - failed} of ${all.length}. ${failed} could not be restored.`);
      else showToast(`Restored ${all.length} task${all.length === 1 ? '' : 's'}`);
    } catch {
      showError('Failed to restore some tasks. Please try again.');
    } finally {
      busy = false;
    }
  }

  async function emptyAll() {
    if (!items.length) return;
    if (!(await confirmAction(`Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'} in the Recycle bin? This can't be undone.`, { danger: true, confirmLabel: 'Empty' }))) return;
    busy = true;
    try {
      await emptyTrash();
      await load();
    } catch {
      showError('Failed to empty the Recycle bin. Please try again.');
    } finally {
      busy = false;
    }
  }
</script>

<TopBar title="Recycle bin" sub={items.length ? 'Kept for 3 months' : ''}>
  {#if items.length}
    <button class="p-tbtn danger" on:click={emptyAll} disabled={busy}>Empty</button>
  {/if}
</TopBar>

{#if loaded && items.length === 0}
  <!-- maintenance.ts TASK_RETENTION_MONTHS -->
  <p class="p-empty">Nothing here. Deleted tasks stay for 3 months.</p>
{:else if items.length}
  <div class="p-group">
    {#each items as t (t._id)}
      <div class="p-row item">
        <span class="p-k">
          <span class="title">{t.title}</span>
          <span class="p-sub">{t.project_name ? `${t.project_name} · ` : ''}{timeAgo(t.updated_at)}</span>
        </span>
        <button class="p-tbtn" on:click={() => restore(t)} disabled={busy} aria-label="Restore {t.title}">Restore</button>
        <button class="p-ib del" on:click={() => removeForever(t)} disabled={busy} aria-label="Delete “{t.title}” for good">{@html I.trash}</button>
      </div>
    {/each}
  </div>
  <button class="p-tbtn all" on:click={restoreAll} disabled={busy}>Restore all</button>
{/if}

<style>
  .item { cursor: default; gap: 4px; padding-right: 6px; }
  .item:active { background: none; }
  /* Titles wrap, never truncate. */
  .p-row.item .p-k > .title { white-space: normal; overflow-wrap: anywhere; }
  .del { color: var(--faint); }
  .del:active { color: var(--danger); }
  .all { display: block; margin: 0 auto; min-height: 44px; }
</style>
