<script lang="ts">
  import Empty from './Empty.svelte';
  import { onMount } from 'svelte';
  import { searchAllTasks, subscribe } from '../db';
  import type { TaskSearchMatch } from '../db';
  import { projects, spaces, showError } from '../store';
  import { push, actions, memo } from './nav';
  import { I } from './icons';
  import { soften } from '../tagColors';
  import TopBar from './TopBar.svelte';
  import TaskCard from './TaskCard.svelte';
  import TaskMenu from './TaskMenu.svelte';
  import { collapseIn, collapseOut } from '../motion';
  import { leaves, returns } from './rowMotion';

  const m = memo({ q: '', limit: 40 });
  let q = m.q, limit = m.limit;
  $: m.q = q;
  let lastQ = m.q;
  $: if (q !== lastQ) { lastQ = q; limit = 40; }
  $: m.limit = limit;
  let results: Awaited<ReturnType<typeof searchAllTasks>> = [];
  let seq = 0;

  const WHERE: Partial<Record<TaskSearchMatch, string>> = { attachments: 'attachments' };
  type Result = (typeof results)[number];

  // The stretch of note or step text around the hit, split for marking.
  const AROUND = 28;
  function snippet(t: Result, q: string): [string, string, string] | null {
    const text = t.matchedIn === 'body' ? t.body
      : t.matchedIn === 'checklist' ? t.checklist?.find(i => i.text.toLowerCase().includes(q))?.text : undefined;
    const i = text ? text.toLowerCase().indexOf(q) : -1;
    if (!text || i < 0) return null;
    const from = Math.max(0, i - AROUND), to = Math.min(text.length, i + q.length + AROUND);
    const flat = (x: string) => x.replace(/\s+/g, ' ');
    return [(from > 0 ? '…' : '') + flat(text.slice(from, i)), flat(text.slice(i, i + q.length)), flat(text.slice(i + q.length, to)) + (to < text.length ? '…' : '')];
  }

  let input: HTMLInputElement;
  function clear() { q = ''; input?.focus(); }

  // The card menu; {#key} bumped on every open (Sheet rule).
  let menuTask: Result | null = null, menuSession = 0;
  function openMenu(t: Result) { menuTask = t; menuSession++; }

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
  // Re-run on any write, so a finish, an Undo or a menu action shows at once.
  onMount(() => subscribe(() => run(q)));
  $: ql = q.trim().toLowerCase();
  $: matchedProjects = ql ? $projects.filter(p => p.name.toLowerCase().includes(ql)) : [];
  const colorOf = (spaceId: string) => { const c = $spaces.find(s => s._id === spaceId)?.color; return c ? soften(c) : 'var(--faint)'; };
</script>

<TopBar title="Search" root />
<label class="field">
  {@html I.search}
  <input bind:this={input} bind:value={q} placeholder="Tasks, notes, steps, tags…" autocomplete="off" enterkeyhint="search" aria-label="Search" />
  {#if q}<button class="p-ib clr" on:click={clear} aria-label="Clear search">{@html I.x}</button>{/if}
</label>

{#if !ql}
  <Empty title="Search everything" text="Tasks, notes, steps, tags and projects." />
{:else}
  {#if matchedProjects.length}
    <div class="p-sec" role="heading" aria-level="2">Projects</div>
    <div class="p-group">
      {#each matchedProjects as p (p._id)}
        <button class="p-row" on:click={() => push({ k: 'project', id: p._id })}>
          <span class="p-dot" style="background:{colorOf(p.space_id)}"></span><span class="lbl">{p.name}</span>
        </button>
      {/each}
    </div>
  {/if}
  {#if results.length}
    <div class="p-sec" role="heading" aria-level="2">Tasks</div>
    {#each results.slice(0, limit) as t (t._id)}
      {@const sn = snippet(t, ql)}
      <div in:collapseIn={{ on: returns(t._id) }} out:collapseOut={{ on: leaves(t._id) }}>
        {#if sn}<div class="why snip">{sn[0]}<mark>{sn[1]}</mark>{sn[2]}</div>
        {:else if WHERE[t.matchedIn]}<div class="why">Matched in {WHERE[t.matchedIn]}</div>{/if}
        <TaskCard task={t} highlight={t.matchedIn === 'title' ? ql : ''} menu on:open={() => actions.openTask(t)} on:changed={() => run(q)} on:menu={() => openMenu(t)} />
      </div>
    {/each}
    {#if results.length > limit}<button class="p-tbtn more" on:click={() => (limit += 40)}>Show {Math.min(40, results.length - limit)} more</button>{/if}
  {:else if !matchedProjects.length}
    <Empty title="No matches" text="Archived projects aren't searched." />
  {/if}
{/if}

{#key menuSession}
  {#if menuTask}<TaskMenu task={menuTask} on:close={() => (menuTask = null)} />{/if}
{/key}

<style>
  .field { display: flex; align-items: center; gap: 8px; background: var(--surface); border-radius: 12px; padding: 10px 12px; margin: 0 0 10px; color: var(--faint); box-shadow: var(--p-shadow); }
  .field input { flex: 1; border: 0; outline: none; background: none; font: inherit; font-size: var(--p-fs-l); color: var(--text); min-width: 0; }
  .field:focus-within { box-shadow: 0 0 0 2px var(--accent); }
  .more { display: block; margin: 4px auto 0; }
  .why { font-size: var(--p-fs-xs); color: var(--accent); font-weight: 600; margin: 0 4px 4px; }
  .why.snip { color: var(--muted); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 3px; }
  .clr { margin: -8px -6px -8px 0; flex-shrink: 0; }
  .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
