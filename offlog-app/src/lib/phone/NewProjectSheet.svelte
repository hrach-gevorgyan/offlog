<script lang="ts">
  // New project: name, space, and either the default statuses or a copy of
  // another project's (optionally with its open tasks). A matching name is
  // a hint, never a block. Mount behind a {#key} bumped per open (Sheet rule).
  import { createEventDispatcher } from 'svelte';
  import type { ProjectDoc } from '../types';
  import { createProject, createProjectFromTemplate, findProjectsByName } from '../db';
  import { projects, spaces, showError } from '../store';
  import { soften } from '../tagColors';
  import Sheet from './Sheet.svelte';
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import { I } from './icons';

  export let spaceId: string;

  const dispatch = createEventDispatcher<{ created: ProjectDoc; close: void }>();
  let sheet: Sheet;
  let name = '';
  let space = spaceId;
  let template = '';
  let copyTasks = false;
  let busy = false;
  let dupHint = '';
  let created: ProjectDoc | null = null;

  $: sortedSpaces = [...$spaces].sort((a, b) => a.position - b.position);

  // Statuses: one row that opens a short list — the default set, or the same
  // statuses as an existing project (named by what they contain).
  const DEFAULT_NAMES = 'Idea · Task · In Process · Completed';
  let picking = false;
  $: source = $projects.find(p => p._id === template) ?? null;
  $: sources = [...$projects].sort((a, b) => a.name.localeCompare(b.name));
  const colorOf = (spaceId: string) => { const c = $spaces.find(x => x._id === spaceId)?.color; return c ? soften(c) : 'var(--faint)'; };
  function choose(id: string) { template = id; if (!id) copyTasks = false; picking = false; }

  let seq = 0;
  async function checkDup(value: string) {
    const n = value.trim(), mine = ++seq;
    if (!n) { dupHint = ''; return; }
    try {
      const matches = await findProjectsByName(n);
      if (mine !== seq) return;
      const where = [...new Set(matches.map(p => $spaces.find(s => s._id === p.space_id)?.name ?? 'another space'))];
      dupHint = matches.length ? `“${n}” already exists in ${where.join(', ')}.` : '';
    } catch { dupHint = ''; }
  }
  $: checkDup(name);

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    try {
      const doc = template ? await createProjectFromTemplate(space, n, template, copyTasks) : await createProject(space, n);
      // In the store at once, so the screen the parent opens finds it.
      projects.update(ps => (ps.some(p => p._id === doc._id) ? ps : [...ps, doc]));
      created = doc;
      sheet?.close();
    } catch {
      showError('Could not create the project. Please try again.');
      busy = false;
    }
  }
  // `created` fires after the sheet has gone, so the parent can push a screen.
  function closed() {
    if (created) dispatch('created', created);
    dispatch('close');
  }
</script>

<Sheet bind:this={sheet} title="New project" on:close={closed}>
  <input class="p-fld" bind:value={name} placeholder="Project name" aria-label="Project name" autocomplete="off" enterkeyhint="done" on:keydown={e => e.key === 'Enter' && create()} />
  {#if dupHint}<p class="hint">{dupHint}</p>{/if}

  <div class="p-lab">Space</div>
  <div class="p-cpick">
    {#each sortedSpaces as s (s._id)}
      <button class="p-chip" class:on={space === s._id} aria-pressed={space === s._id} on:click={() => (space = s._id)}>
        <span class="p-dot" style="background:{soften(s.color)}"></span>{s.name}
      </button>
    {/each}
  </div>

  <div class="p-lab">Statuses</div>
  <div class="p-group">
    <button class="p-row" aria-expanded={picking} on:click={() => (picking = !picking)}>
      <span class="p-k">
        <span>{source ? `Same as ${source.name}` : 'Default'}</span>
        <span class="p-sub">{source ? source.columns.map(c => c.name).join(' · ') : DEFAULT_NAMES}</span>
      </span>
      <span class="chev" class:open={picking}>{@html I.chev}</span>
    </button>
    {#if picking}
      <div class="list" in:slide={revealIn} out:slide={revealOut}>
        <button class="p-row" aria-pressed={!template} on:click={() => choose('')}>
          <span class="p-k"><span>Default</span><span class="p-sub">{DEFAULT_NAMES}</span></span>
          {#if !template}<span class="p-tick">{@html I.check}</span>{/if}
        </button>
        {#each sources as p (p._id)}
          <button class="p-row" aria-pressed={template === p._id} on:click={() => choose(p._id)}>
            <span class="p-dot" style="background:{colorOf(p.space_id)}"></span>
            <span class="p-k"><span>Same as {p.name}</span><span class="p-sub">{p.columns.map(c => c.name).join(' · ')}</span></span>
            {#if template === p._id}<span class="p-tick">{@html I.check}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
    {#if template && !picking}
      <button class="p-row" role="switch" aria-checked={copyTasks} on:click={() => (copyTasks = !copyTasks)}>
        <span class="p-k"><span>Also copy its open tasks</span></span><span class="p-sw" class:on={copyTasks}></span>
      </button>
    {/if}
  </div>

  <button class="p-go" disabled={!name.trim() || busy} on:click={create}>Create</button>
</Sheet>

<style>
  .hint { font-size: var(--p-fs-s); color: var(--faint); margin: -8px 4px 12px; }
  .chev { display: flex; color: var(--faint); transition: transform var(--dur-small) var(--ease-standard); }
  .chev.open { transform: rotate(90deg); }
  .list { max-height: 40dvh; overflow-y: auto; border-top: 1px solid var(--border); }
  .p-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
