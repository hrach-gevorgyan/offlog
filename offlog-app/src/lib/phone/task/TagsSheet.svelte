<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { TaskDoc } from '../../types';
  import { getAllTags, ensureFreshTagColor } from '../../db';
  import { resolveTagColor, soften } from '../../tagColors';
  import { I } from '../icons';

  export let task: TaskDoc;
  export let colors: Record<string, string>;
  export let save: (changes: Partial<TaskDoc>, err: string) => Promise<boolean>;

  // Fired after a brand-new tag got its colour, so the parent re-reads overrides.
  const dispatch = createEventDispatcher<{ colors: void }>();
  const ERR = 'Could not save the tags. Please try again.';

  let input = '';
  let projectTags: string[] = [];
  let allTags: string[] = [];
  onMount(async () => {
    try { [allTags, projectTags] = await Promise.all([getAllTags(), getAllTags(task.project_id)]); }
    catch { /* suggestions are optional; typing a tag still works */ }
  });

  $: tags = task.tags ?? [];
  // This project's tags come first; the rest of the workspace's follow.
  $: q = input.trim().toLowerCase();
  $: ours = projectTags.filter(t => !tags.includes(t) && (!q || t.startsWith(q)));
  $: others = allTags.filter(t => !tags.includes(t) && !projectTags.includes(t) && (!q || t.startsWith(q)));

  const color = (t: string) => soften(resolveTagColor(t, colors));

  function set(next: string[]) { return save({ tags: next }, ERR); }

  async function add(raw: string) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    input = '';
    if (!t || tags.includes(t)) return;
    const before = tags;
    if (!(await set([...before, t]))) return;
    // A new tag gets a colour no tag already on this task uses. Never blocks the tag itself.
    if (!allTags.includes(t)) {
      try { await ensureFreshTagColor(t, before); dispatch('colors'); }
      catch (e) { console.warn('tag color assignment failed', e); }
      allTags = [...allTags, t];
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input); }
    else if (e.key === 'Backspace' && !input && tags.length) set(tags.slice(0, -1));
  }
</script>

{#if tags.length}
  <div class="p-cpick">
    {#each tags as t (t)}
      <button class="rm" on:click={() => set(tags.filter(x => x !== t))} aria-label="Remove tag {t}">
        <span class="p-tag" style="--tag:{color(t)}">#{t}<span class="x">{@html I.x}</span></span>
      </button>
    {/each}
  </div>
{/if}

<input class="p-fld" bind:value={input} on:keydown={onKey} placeholder="New tag, then Enter" autocomplete="off" enterkeyhint="done" aria-label="Add a tag" />

{#if ours.length || others.length}
  {#if ours.length}
    <div class="p-group">
      {#each ours as t (t)}
        <button class="p-row" on:click={() => add(t)}><span class="p-dot" style:background={color(t)}></span><span class="p-k"><span>#{t}</span></span></button>
      {/each}
    </div>
  {/if}
  {#if others.length}
    {#if ours.length}<div class="p-lab">Other tags</div>{/if}
    <div class="p-group">
      {#each others as t (t)}
        <button class="p-row" on:click={() => add(t)}><span class="p-dot" style:background={color(t)}></span><span class="p-k"><span>#{t}</span></span></button>
      {/each}
    </div>
  {/if}
{:else if q}
  <p class="p-say">Enter adds #{q.replace(/\s+/g, '-')} as a new tag.</p>
{/if}

<style>
  .rm { min-height: 44px; display: inline-flex; align-items: center; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
  .rm .p-tag { font-size: 14px; padding: 4px 6px 4px 10px; }
  .x { display: flex; opacity: .6; }
  .x :global(svg.i) { width: 14px; height: 14px; }
</style>
