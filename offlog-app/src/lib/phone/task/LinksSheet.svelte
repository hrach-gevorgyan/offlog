<script lang="ts">
  // Related tasks (no direction, no dependency) and Blocked by (a real
  // dependency) share one sheet; `mode` picks which db calls it makes.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { TaskDoc } from '../../types';
  import { searchTasksForLinking, linkRelatedTask, unlinkRelatedTask, linkBlockedBy, unlinkBlockedBy, isBlockerResolved } from '../../db';
  import { projects, showError } from '../../store';
  import { I } from '../icons';

  export let task: TaskDoc;
  export let mode: 'related' | 'blocked';
  export let linked: TaskDoc[];

  const dispatch = createEventDispatcher<{ changed: void; open: string }>();

  $: lastColByProject = Object.fromEntries($projects.map(p => [p._id, p.columns.at(-1)?.id]));
  const projectName = (t: TaskDoc) => $projects.find(p => p._id === t.project_id)?.name ?? '—';

  let query = '';
  let found: TaskDoc[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  $: search(query, linked);
  function search(q: string, already: TaskDoc[]) {
    clearTimeout(timer);
    if (!q.trim()) { found = []; return; }
    const n = ++seq;
    timer = setTimeout(async () => {
      try {
        const r = await searchTasksForLinking(q, task._id, already.map(t => t._id));
        if (n === seq) found = r;
      } catch { /* a failed search just shows nothing */ }
    }, 150);
  }
  onDestroy(() => clearTimeout(timer));

  let busy = false;
  async function link(other: TaskDoc) {
    if (busy) return;
    busy = true;
    try {
      if (mode === 'related') await linkRelatedTask(task._id, other._id);
      else await linkBlockedBy(task._id, other._id);
      query = '';
      dispatch('changed');
    } catch (e) {
      showError(mode === 'blocked' && e instanceof Error && e.message === 'circular dependency'
        ? `Can't be blocked by "${other.title}" — these two tasks already block each other.`
        : mode === 'blocked' ? `Could not link "${other.title}" as a blocker. Please try again.` : 'Could not link a related task. Please try again.');
    } finally { busy = false; }
  }

  async function unlink(other: TaskDoc) {
    if (busy) return;
    busy = true;
    try {
      if (mode === 'related') await unlinkRelatedTask(task._id, other._id);
      else await unlinkBlockedBy(task._id, other._id);
      dispatch('changed');
    } catch {
      showError(mode === 'related' ? 'Could not remove a related-task link. Please try again.' : 'Could not remove a dependency. Please try again.');
    } finally { busy = false; }
  }
</script>

{#if mode === 'blocked'}<p class="p-say">This task waits until these are done.</p>{/if}

{#if linked.length}
  <div class="p-group">
    {#each linked as t (t._id)}
      {@const resolved = mode === 'blocked' && isBlockerResolved(t, lastColByProject)}
      <div class="item">
        {#if t.deleted}
          <span class="p-k gone"><span>{t.title} (deleted)</span><span class="p-sub">{projectName(t)}</span></span>
        {:else}
          <button class="open" on:click={() => dispatch('open', t._id)}>
            <span class="p-k"><span class:struck={resolved}>{t.title}</span><span class="p-sub">{projectName(t)}</span></span>
          </button>
        {/if}
        {#if mode === 'blocked'}<span class="state" class:done={resolved}>{resolved ? 'Done' : 'Not done'}</span>{/if}
        <button class="p-ib" disabled={busy} on:click={() => unlink(t)} aria-label={mode === 'blocked' ? `Remove dependency on ${t.title}` : `Unlink ${t.title}`}>{@html I.x}</button>
      </div>
    {/each}
  </div>
{/if}

<input class="p-fld" bind:value={query} placeholder={mode === 'blocked' ? 'Find the task this waits for' : 'Find a task to link'} autocomplete="off" aria-label={mode === 'blocked' ? 'Find a blocking task' : 'Find a task to link'} />

{#if found.length}
  <div class="p-group">
    {#each found as t (t._id)}
      <button class="p-row" disabled={busy} on:click={() => link(t)}>
        <span class="p-k"><span>{t.title}</span></span>
        <span class="p-v">{projectName(t)}</span>
      </button>
    {/each}
  </div>
{:else if query.trim()}
  <p class="p-empty">No matching tasks.</p>
{/if}

<style>
  .item { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 16px; min-height: 52px; }
  .item + .item { border-top: 1px solid var(--border); }
  .open { flex: 1; min-width: 0; display: flex; font: inherit; font-size: 16px; color: var(--text); background: none; border: 0; padding: 8px 0; text-align: left; cursor: pointer; }
  .gone { flex: 1; color: var(--faint); }
  .struck { text-decoration: line-through; color: var(--faint); }
  .state { font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--overdue-bg); color: var(--overdue-ink); white-space: nowrap; }
  .state.done { background: var(--col-bg); color: var(--muted); }
  .p-ib :global(svg.i) { width: 18px; height: 18px; }
</style>
