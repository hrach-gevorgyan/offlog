<script lang="ts">
  import { onMount } from 'svelte';
  import { activeProjectId, activeSpaceId, projects, spaces, projectTasks, showError } from '../store';
  import { getTaskIdsBlocked, getTaskIdsWithRelatedLinks, getTagColorOverrides, getCustomFieldDefs, subscribe } from '../db';
  import type { CustomFieldDef, TaskDoc } from '../types';
  import { PRIORITY_LABEL } from '../constants';
  import { soften } from '../tagColors';
  import { actions, addContext, memo } from './nav';
  import { onDestroy } from 'svelte';
  import { I } from './icons';
  import { applyFilter, activeCount, EMPTY, type Filter, type Sort } from './project/filter';
  import { isList, setView } from './project/actions';
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
  // Set by the toggle; until then the device's kept choice.
  let listView: boolean | null = null;
  $: list = !!project && (listView ?? isList(project));
  function pickView(v: boolean) { if (project && v !== list) listView = setView(project, v); }
  $: open = mine.filter(t => t.column_id !== project?.columns.at(-1)?.id).length;

  // Kept on the stack entry, so coming back finds the same status, filter,
  // sort and search.
  const m = memo<{ ci: number; filter: Filter; sort: Sort }>({ ci: 0, filter: { ...EMPTY }, sort: 'Status' });
  let filter: Filter = m.filter, ci = m.ci, sort: Sort = m.sort;
  $: m.filter = filter;
  $: m.ci = ci;
  $: m.sort = sort;
  $: shown = applyFilter(mine, filter);
  $: nFilters = activeCount(filter);
  // The + button adds to the status on show (the first one in List).
  // Never the last status: a task added there would be born finished, so +
  // on the Done pane adds to the default (first) status instead.
  $: if (project) addContext.set({ projectId: id, columnId: list || (ci === project.columns.length - 1 && project.columns.length > 1) ? null : project.columns[ci]?.id ?? null });
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
    <TopBar wrap title={project.name} sub="{space?.name ?? ''} · {open} open{project.pinned ? ' · pinned' : ''}">
      <span slot="sub-lead" class="p-dot" style="background:{space ? soften(space.color) : 'var(--faint)'}"></span>
      <span slot="sub-end" class="p-seg view" style="--n:2;--i:{list ? 1 : 0}" role="group" aria-label="View">
        <button class:on={!list} aria-pressed={!list} on:click={() => pickView(false)}>Board</button>
        <button class:on={list} aria-pressed={list} on:click={() => pickView(true)}>List</button>
      </span>
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
      <ListPane {project} tasks={shown} bind:search={filter.search} bind:sort filtered={nFilters > 0 || !!filter.search} on:open={e => actions.openTask(e.detail)} />
    {:else}
      <Board {project} tasks={shown} bind:ci {blockedIds} {relatedIds} {tagColors}
        on:open={e => actions.openTask(e.detail)} on:menu={e => openSheet('card', e.detail)} />
    {/if}
  </div>

  {#key session}
    {#if sheet === 'filter'}
      <FilterSheet {project} tasks={mine} {filter} {list} {customFields} on:apply={e => (filter = e.detail)} on:close={() => (sheet = null)} />
    {:else if sheet === 'more'}
      <ProjectMenuSheet {project} tasks={mine} on:close={() => (sheet = null)} />
    {:else if sheet === 'card' && menuTask}
      <CardMenuSheet task={menuTask} {project} tasks={mine} {shown} on:close={() => (sheet = null)} />
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
  .fbar .p-pill { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-ink); }
  /* Sits on the meta line without making it taller; each half still has a
     44px tap area. */
  .p-seg.view { flex-shrink: 0; margin: -8px 0 -8px auto; padding: 2px; }
  .p-seg.view button { position: relative; flex: none; width: 56px; min-height: 30px; padding: 0; }
  .p-seg.view button::before { content: ''; position: absolute; left: 0; right: 0; top: -7px; bottom: -7px; }
</style>
