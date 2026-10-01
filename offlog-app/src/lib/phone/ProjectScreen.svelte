<script lang="ts">
  import { onMount } from 'svelte';
  import { activeProjectId, activeSpaceId, projects, spaces, projectTasks, showError } from '../store';
  import { getTaskIdsBlocked, getTaskIdsWithRelatedLinks, getTagColorOverrides, getCustomFieldDefs, subscribe } from '../db';
  import type { CustomFieldDef, TaskDoc } from '../types';
  import { PRIORITY_LABEL } from '../constants';
  import { soften } from '../tagColors';
  import { actions, addContext } from './nav';
  import { onDestroy } from 'svelte';
  import { I } from './icons';
  import { applyFilter, activeCount, EMPTY, type Filter } from './project/filter';
  import { isList, toggleView } from './project/actions';
  import TopBar from './TopBar.svelte';
  import Board from './project/Board.svelte';
  import ListPane from './project/ListPane.svelte';
  import FilterSheet from './project/FilterSheet.svelte';
  import CardMenuSheet from './project/CardMenuSheet.svelte';
  import ProjectMenuSheet from './project/ProjectMenuSheet.svelte';

  export let id: string;

  $: project = $projects.find(p => p._id === id) ?? null;
  $: space = project ? $spaces.find(s => s._id === project!.space_id) : undefined;
  // $projectTasks follows the store's active project, so the screen on top
  // claims it (including when a lower project screen is uncovered).
  $: if (project && $activeProjectId !== id) { activeSpaceId.set(project.space_id); activeProjectId.set(id); }
  $: mine = $activeProjectId === id ? $projectTasks : [];
  $: list = !!project && isList(project);
  $: open = mine.filter(t => t.column_id !== project?.columns.at(-1)?.id).length;

  let filter: Filter = { ...EMPTY };
  $: shown = applyFilter(mine, filter);
  $: nFilters = activeCount(filter);
  let ci = 0;
  // The + button adds to the status on show (the first one in List).
  $: if (project) addContext.set({ projectId: id, columnId: list ? null : project.columns[ci]?.id ?? null });
  onDestroy(() => addContext.set(null));

  // Card decorations, refreshed on any change: links and blockers can be
  // edited from another project. A failed refresh keeps the last value.
  let blockedIds = new Set<string>(), relatedIds = new Set<string>();
  let tagColors: Record<string, string> = {};
  let customFields: CustomFieldDef[] = [];
  function loadDecor() {
    getTaskIdsBlocked().then(v => (blockedIds = v)).catch(() => {});
    getTaskIdsWithRelatedLinks().then(v => (relatedIds = v)).catch(() => {});
    getTagColorOverrides().then(v => (tagColors = v)).catch(() => {});
  }
  onMount(() => {
    loadDecor();
    getCustomFieldDefs().then(v => (customFields = v)).catch(() => showError('Could not load custom fields.'));
    return subscribe(loadDecor);
  });

  // Each sheet sits behind a {#key} bumped on every open (Sheet.svelte rule).
  let sheet: 'filter' | 'more' | 'card' | null = null;
  let session = 0;
  let menuTask: TaskDoc | null = null;
  function openSheet(k: 'filter' | 'more' | 'card', t: TaskDoc | null = null) { menuTask = t; session++; sheet = k; }

  const colName = (cid: string) => project?.columns.find(c => c.id === cid)?.name ?? '';
  const fieldName = (fid: string) => customFields.find(f => f.id === fid)?.name ?? '';
  $: chips = [
    // List shows its search in its own field.
    ...(filter.search && !list ? [`“${filter.search}”`] : []),
    ...(filter.col ? [colName(filter.col)] : []),
    ...(filter.prio ? [PRIORITY_LABEL[filter.prio]] : []),
    ...(filter.tag ? [`#${filter.tag}`] : []),
    ...filter.fields.filter(f => f.fieldId && f.value).map(f => `${fieldName(f.fieldId)}: ${f.value}`),
  ];
</script>

{#if project}
  <div class="scr">
    <TopBar title={project.name} sub="{space?.name ?? ''} · {open} open{project.pinned ? ' · pinned' : ''}">
      <span slot="sub-lead" class="p-dot" style="background:{space ? soften(space.color) : 'var(--faint)'}"></span>
      <button class="ib" on:click={() => project && toggleView(project)} aria-label={list ? 'Show as board' : 'Show as list'}>{@html list ? I.board : I.list}</button>
      <button class="ib" class:on={nFilters > 0} on:click={() => openSheet('filter')} aria-label={nFilters ? `Filter, ${nFilters} on` : 'Filter'}>{@html I.filter}</button>
      <button class="ib" on:click={() => openSheet('more')} aria-label="More">{@html I.more}</button>
    </TopBar>

    {#if chips.length}
      <div class="fbar">
        {#each chips as c}<span class="p-pill">{c}</span>{/each}
        <button class="p-tbtn" on:click={() => (filter = { ...EMPTY, search: list ? filter.search : '' })}>Clear</button>
      </div>
    {/if}

    {#if list}
      <ListPane {project} tasks={shown} bind:search={filter.search} filtered={nFilters > 0 || !!filter.search} on:open={e => actions.openTask(e.detail)} />
    {:else}
      <Board {project} tasks={shown} bind:ci {blockedIds} {relatedIds} {tagColors}
        on:open={e => actions.openTask(e.detail)} on:menu={e => openSheet('card', e.detail)} />
    {/if}
  </div>

  {#key session}
    {#if sheet === 'filter'}
      <FilterSheet {project} tasks={mine} {filter} {customFields} on:apply={e => (filter = e.detail)} on:close={() => (sheet = null)} />
    {:else if sheet === 'more'}
      <ProjectMenuSheet {project} on:close={() => (sheet = null)} />
    {:else if sheet === 'card' && menuTask}
      <CardMenuSheet task={menuTask} {project} tasks={shown} on:close={() => (sheet = null)} />
    {/if}
  {/key}
{:else}
  <div class="scr"><TopBar title="Project" /><p class="p-empty">This project no longer exists.</p></div>
{/if}

<style>
  /* Not positioned: the list's bulk bar anchors to the screen, not this scroller. */
  .scr { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 16px 96px; scrollbar-width: none; }
  .scr::-webkit-scrollbar { display: none; }
  .fbar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: -6px 0 12px; }
  .fbar .p-pill { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
</style>
