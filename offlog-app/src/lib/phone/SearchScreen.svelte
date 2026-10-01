<script lang="ts">
  import { searchAllTasks } from '../db';
  import type { TaskSearchMatch } from '../db';
  import { projects, spaces, showError } from '../store';
  import { push, actions, memo } from './nav';
  import { I } from './icons';
  import { soften } from '../tagColors';
  import TopBar from './TopBar.svelte';
  import TaskCard from './TaskCard.svelte';

  const m = memo({ q: '', limit: 40 });
  let q = m.q, limit = m.limit;
  $: m.q = q;
  let lastQ = m.q;
  $: if (q !== lastQ) { lastQ = q; limit = 40; }
  $: m.limit = limit;
  let results: Awaited<ReturnType<typeof searchAllTasks>> = [];
  let seq = 0;

  const WHERE: Partial<Record<TaskSearchMatch, string>> = { body: 'note', checklist: 'steps', attachments: 'attachments' };

  async function run(query: string) {
    const my = ++seq;
    if (!query.trim()) { results = []; return; }
    try {
      const r = await searchAllTasks(query.trim());
      if (my === seq) results = r;
    } catch {
      showError('Search failed. Please try again.');
    }
  }
  $: run(q);
  $: ql = q.trim().toLowerCase();
  $: matchedProjects = ql ? $projects.filter(p => p.name.toLowerCase().includes(ql)) : [];
  const colorOf = (spaceId: string) => { const c = $spaces.find(s => s._id === spaceId)?.color; return c ? soften(c) : 'var(--faint)'; };
</script>

<TopBar title="Search" root />
<label class="field">
  {@html I.search}
  <input bind:value={q} placeholder="Tasks, notes, steps, tags…" autocomplete="off" enterkeyhint="search" aria-label="Search" />
</label>

{#if !ql}
  <p class="empty">Type to search every task and project.</p>
{:else}
  {#if matchedProjects.length}
    <div class="sec">Projects</div>
    <div class="group">
      {#each matchedProjects as p (p._id)}
        <button class="row" on:click={() => push({ k: 'project', id: p._id })}>
          <span class="dot" style="background:{colorOf(p.space_id)}"></span><span class="lbl">{p.name}</span>
        </button>
      {/each}
    </div>
  {/if}
  {#if results.length}
    <div class="sec">Tasks</div>
    {#each results.slice(0, limit) as t (t._id)}
      {#if WHERE[t.matchedIn]}<div class="why">Matched in {WHERE[t.matchedIn]}</div>{/if}
      <TaskCard task={t} on:open={() => actions.openTask(t)} on:changed={() => run(q)} />
    {/each}
    {#if results.length > limit}<button class="p-tbtn more" on:click={() => (limit += 40)}>Show {Math.min(40, results.length - limit)} more</button>{/if}
  {:else if !matchedProjects.length}
    <p class="empty">No matches.</p>
  {/if}
{/if}

<style>
  .field { display: flex; align-items: center; gap: 8px; background: var(--surface); border-radius: 12px; padding: 10px 12px; margin: 0 0 10px; color: var(--faint); box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08); }
  .field input { flex: 1; border: 0; outline: none; background: none; font: inherit; font-size: 16px; color: var(--text); min-width: 0; }
  .field:focus-within { box-shadow: 0 0 0 2px var(--accent); }
  .empty { text-align: center; color: var(--faint); padding: 28px 0; font-size: 14.5px; margin: 0; }
  .sec { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); margin: 18px 4px 8px; }
  .more { display: block; margin: 4px auto 0; }
  .why { font-size: 12px; color: var(--accent); font-weight: 600; margin: 0 4px 4px; }
  .group { background: var(--surface); border-radius: 14px; overflow: hidden; margin-bottom: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08); }
  .row { width: 100%; display: flex; align-items: center; gap: 14px; padding: 13px 16px; min-height: 52px; font: inherit; font-size: 16px; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; }
  .row + .row { border-top: 1px solid var(--border); }
  .row:active { background: var(--col-bg); }
  .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
</style>
