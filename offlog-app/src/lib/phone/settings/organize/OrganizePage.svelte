<script lang="ts">
  // Settings → Spaces, tags & fields. The desktop's Space, Tag and Custom
  // Field managers as one page with three tabs; each item edits in a sheet.
  import { onMount } from 'svelte';
  import { getSpaces, getTagCounts, getTagColorOverrides, getCustomFieldDefs, subscribe } from '../../../db';
  import { projects, showError } from '../../../store';
  import type { CustomFieldDef, SpaceDoc } from '../../../types';
  import { getSpaceIconSvg } from '../../../spaceIcons';
  import { resolveTagColor, soften } from '../../../tagColors';
  import TopBar from '../../TopBar.svelte';
  import { memo } from '../../nav';
  import { I } from '../../icons';
  import SpaceSheet from './SpaceSheet.svelte';
  import TagSheet from './TagSheet.svelte';
  import FieldSheet from './FieldSheet.svelte';

  type TabKey = 'spaces' | 'tags' | 'fields';
  const m = memo<{ tab: TabKey }>({ tab: 'spaces' });
  let tab = m.tab;
  $: m.tab = tab;

  let spaces: SpaceDoc[] = [];
  let tags: { tag: string; count: number }[] = [];
  let overrides: Record<string, string> = {};
  let fields: CustomFieldDef[] = [];
  let loaded = false;

  async function load() {
    try {
      [spaces, tags, overrides, fields] = await Promise.all([getSpaces(), getTagCounts(), getTagColorOverrides(), getCustomFieldDefs()]);
    } catch {
      showError('Failed to load spaces, tags and fields.');
    } finally {
      loaded = true;
    }
  }
  onMount(() => {
    load();
    return subscribe(() => load());
  });

  $: projectCount = (id: string) => $projects.filter(p => p.space_id === id).length;
  const fieldType = (f: CustomFieldDef) => f.type[0].toUpperCase() + f.type.slice(1);

  // Every sheet calls closeOnBack(), so each mounts behind a {#key} bumped
  // on every open.
  let open: { k: 'space'; id: string | null } | { k: 'tag'; tag: string } | { k: 'field'; id: string | null } | null = null;
  let session = 0;
  function show(o: NonNullable<typeof open>) { open = o; session++; }
</script>

<TopBar title="Organize" />

<div class="p-seg" role="group" aria-label="Organize" style="--n:3;--i:{['spaces', 'tags', 'fields'].indexOf(tab)}">
  {#each [['spaces', 'Spaces'], ['tags', 'Tags'], ['fields', 'Fields']] as [k, label] (k)}
    <button aria-pressed={tab === k} class:on={tab === k} on:click={() => (tab = k as TabKey)}>{label}</button>
  {/each}
</div>

{#if tab === 'spaces'}
  <div class="p-group">
    {#each spaces as s (s._id)}
      <button class="p-row" on:click={() => show({ k: 'space', id: s._id })}>
        <span class="p-ico" style:color={soften(s.color)}>{@html getSpaceIconSvg(s)}</span>
        <span class="p-k"><span>{s.name}</span></span>
        <span class="p-v">{projectCount(s._id)}</span>
      </button>
    {/each}
    <button class="p-row acc" on:click={() => show({ k: 'space', id: null })}>
      <span class="p-ico">{@html I.plus}</span>New space
    </button>
  </div>
{:else if tab === 'tags'}
  {#if tags.length}
    <div class="p-group">
      {#each tags as { tag, count } (tag)}
        <button class="p-row" on:click={() => show({ k: 'tag', tag })}>
          <span class="p-k"><span><span class="p-tag" style="--tag:{soften(resolveTagColor(tag, overrides))}">#{tag}</span></span></span>
          <span class="p-v">{count}</span>
        </button>
      {/each}
    </div>
  {:else if loaded}
    <p class="p-empty">No tags yet. Add them on a task.</p>
  {/if}
{:else}
  <div class="p-group">
    {#each fields as f (f.id)}
      <button class="p-row" on:click={() => show({ k: 'field', id: f.id })}>
        <span class="p-ico">{@html I.field}</span>
        <span class="p-k"><span>{f.name}</span></span>
        <span class="p-v">{fieldType(f)}</span>
      </button>
    {/each}
    <button class="p-row acc" on:click={() => show({ k: 'field', id: null })}>
      <span class="p-ico">{@html I.plus}</span>Add a field
    </button>
  </div>
  <p class="p-say">Fields appear on every task. Keep the list short.</p>
{/if}

{#if open}
  {#key session}
    {#if open.k === 'space'}
      <SpaceSheet id={open.id} items={spaces} count={open.id ? projectCount(open.id) : 0} on:changed={load} on:close={() => (open = null)} />
    {:else if open.k === 'tag'}
      <TagSheet tag={open.tag} items={tags} {overrides} on:changed={load} on:close={() => (open = null)} />
    {:else}
      {@const fid = open.id}
      <FieldSheet field={fields.find(f => f.id === fid) ?? null} on:changed={load} on:close={() => (open = null)} />
    {/if}
  {/key}
{/if}

<style>
  .p-ico :global(svg) { width: 20px; height: 20px; }
</style>
