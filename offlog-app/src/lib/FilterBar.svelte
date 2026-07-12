<script lang="ts">
  // B2 — extracted from ListView.svelte (its original, List-only filter
  // popover) so Kanban can get the identical filter bar + saved-filters
  // feature without duplicating ~150 lines of state/logic. Saved filters
  // are stored per-project (not per-view), so a filter saved from List
  // shows up in Kanban's popover too — same `offlog_saved_filters_<id>`
  // localStorage key either view would have used on its own.
  import type { ProjectDoc } from './types';
  import { PRIORITY_COLOR as PRIO_COLOR } from './constants';
  import CustomSelect from './CustomSelect.svelte';

  export let project: ProjectDoc;
  export let allTags: string[] = [];
  export let search = '';
  export let filterCol = '';
  export let filterPrio = 0;
  export let filterTag = '';

  $: statusOptions = [{ value: '', label: 'All statuses' }, ...project.columns.map(col => ({ value: col.id, label: col.name }))];
  $: tagOptions = [{ value: '', label: 'All tags' }, ...allTags.map(t => ({ value: t, label: t }))];
  // Icon-only, no "Filters" text label — used where the button sits
  // paired with other icon buttons in a tight pill (App.svelte's board
  // header) rather than List's own roomier toolbar row.
  export let compact = false;

  let showFilterMenu = false;
  let newFilterName = '';
  // Fixed-position, computed from the button's own rect on open — not
  // absolute-anchored to an ancestor — because both ListView's .list-panel
  // and a short Kanban board can be shorter than the popover itself, and
  // `overflow: hidden`/auto on that ancestor was clipping the bottom half
  // (same class of bug as the Columns popover fix in v4.6.5).
  let menuPos = { top: 0, left: 0 };
  const MENU_WIDTH = 280;
  function toggleFilterMenu(e: MouseEvent) {
    if (!showFilterMenu) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      menuPos = { top: r.bottom + 6, left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)) };
    }
    showFilterMenu = !showFilterMenu;
  }

  interface SavedFilter { name: string; search: string; filterCol: string; filterPrio: number; filterTag: string }
  $: savedFiltersKey = `offlog_saved_filters_${project._id}`;
  let savedFilters: SavedFilter[] = [];

  function loadSavedFilters() {
    try { savedFilters = JSON.parse(localStorage.getItem(savedFiltersKey) ?? '[]'); }
    catch { savedFilters = []; }
  }
  $: project._id, loadSavedFilters();

  function saveCurrentFilter() {
    const name = newFilterName.trim();
    if (!name) return;
    savedFilters = [...savedFilters.filter(f => f.name !== name), { name, search, filterCol, filterPrio, filterTag }];
    localStorage.setItem(savedFiltersKey, JSON.stringify(savedFilters));
    newFilterName = '';
  }

  function applySavedFilter(f: SavedFilter) {
    search = f.search; filterCol = f.filterCol; filterPrio = f.filterPrio; filterTag = f.filterTag;
    showFilterMenu = false;
  }

  function deleteSavedFilter(name: string) {
    savedFilters = savedFilters.filter(f => f.name !== name);
    localStorage.setItem(savedFiltersKey, JSON.stringify(savedFilters));
  }

  $: activeFilters = (search ? 1 : 0) + (filterCol ? 1 : 0) + (filterPrio ? 1 : 0) + (filterTag ? 1 : 0);
  function clearFilters() { search = ''; filterCol = ''; filterPrio = 0; filterTag = ''; }

  function onWindowClick(e: MouseEvent) {
    if (!showFilterMenu) return;
    // e.target isn't guaranteed to be an Element (e.g. a synthetically
    // dispatched click can target `document` itself), and .closest() only
    // exists on Element — guard instead of assuming, since this fires on
    // every window click.
    if (!(e.target instanceof Element) || !e.target.closest('.filter-menu-wrap')) showFilterMenu = false;
  }
</script>

<svelte:window on:click={onWindowClick} />

<div class="filter-menu-wrap">
  <button class="action-btn" class:compact class:active={activeFilters > 0 || showFilterMenu} on:click|stopPropagation={toggleFilterMenu} aria-label="Filters" title="Filters">
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 2h12L8.5 7.5v4L5.5 13v-5.5z"/>
    </svg>
    {#if !compact}<span class="action-label">Filters</span>{/if}
    {#if activeFilters > 0}<span class="filter-count">{activeFilters}</span>{/if}
  </button>
  {#if showFilterMenu}
    <div class="col-menu filter-menu" style="top:{menuPos.top}px; left:{menuPos.left}px;">
      <div class="menu-label">Status</div>
      <CustomSelect options={statusOptions} bind:value={filterCol} />

      {#if allTags.length}
        <div class="menu-label">Tag</div>
        <CustomSelect options={tagOptions} bind:value={filterTag} />
      {/if}

      <div class="menu-label">Priority</div>
      <div class="prio-chips">
        {#each [[0,'All'],[1,'Low'],[2,'Med'],[3,'High']] as [v,label]}
          <button class="prio-chip" class:active={filterPrio === v} on:click={() => filterPrio = filterPrio === v ? 0 : v}>
            {#if v !== 0}<span class="chip-dot" style="background:{PRIO_COLOR[v]}"></span>{/if}
            {label}
          </button>
        {/each}
      </div>

      {#if activeFilters > 0}
        <button class="clear-all" on:click={clearFilters}>Clear filters ({activeFilters})</button>
      {/if}

      <div class="menu-divider"></div>
      <div class="menu-label">Saved filters</div>
      <div class="filter-save-row">
        <input class="filter-name-input" bind:value={newFilterName} placeholder="Name this filter…" on:keydown={(e) => { if (e.key === 'Enter') saveCurrentFilter(); }} />
        <button class="filter-save-btn" on:click={saveCurrentFilter} disabled={!newFilterName.trim()}>Save</button>
      </div>
      {#if savedFilters.length}
        <div class="filter-list">
          {#each savedFilters as f (f.name)}
            <div class="filter-row">
              <button class="filter-apply-btn" on:click={() => applySavedFilter(f)}>{f.name}</button>
              <button class="filter-del-btn" on:click={() => deleteSavedFilter(f.name)} aria-label="Delete filter {f.name}">×</button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="filter-empty">No saved filters yet</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .filter-menu-wrap { position: relative; }
  .action-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    background: none; border: none; border-radius: 6px;
    color: var(--muted); font-size: 11.5px; font-weight: 500;
    padding: 7px 9px; cursor: pointer; white-space: nowrap;
    transition: color .12s, background .12s;
  }
  .action-btn.compact { padding: 5px 8px; }
  .action-btn:hover { color: var(--text); background: var(--hover, var(--surface)); }
  .action-btn.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .filter-count {
    position: absolute; top: -3px; right: -3px;
    min-width: 14px; height: 14px; padding: 0 3px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent); color: var(--on-accent);
    border-radius: 7px; font-size: 9.5px; font-weight: 700; line-height: 1;
  }

  .menu-label {
    font-family: var(--mono); font-size: .6rem; text-transform: uppercase;
    letter-spacing: .08em; color: var(--faint); padding: 6px 2px 2px;
  }
  .menu-divider { height: 1px; background: var(--border); margin: 8px -6px 0; }
  .col-menu {
    position: fixed; z-index: 210;
    background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 6px; min-width: 150px;
    display: flex; flex-direction: column; gap: 2px;
    max-height: min(70vh, 420px); overflow-y: auto;
  }

  .prio-chips { display: flex; gap: 3px; flex-wrap: wrap; }
  .prio-chip {
    display: flex; align-items: center; gap: 5px;
    border: 1px solid var(--border-strong); border-radius: 7px;
    background: var(--bg); color: var(--muted);
    font-size: 12px; font-weight: 500; padding: 5px 9px;
    cursor: pointer; transition: background .1s, color .1s, border-color .1s;
  }
  .prio-chip.active { background: var(--text); color: var(--bg); border-color: var(--text); }
  .chip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .clear-all {
    width: 100%;
    background: none; border: 1px solid var(--border-strong); border-radius: 7px;
    color: var(--muted); font-size: 11.5px; padding: 5px 10px; cursor: pointer;
    transition: color .12s, border-color .12s;
  }
  .clear-all:hover { color: var(--danger); border-color: var(--danger); }

  .filter-menu { width: 280px; min-width: 0; }
  .filter-save-row { display: flex; gap: 6px; padding: 2px; }
  .filter-name-input {
    flex: 1; min-width: 0; font-size: .8rem; padding: .4rem .5rem;
    border: 1px solid var(--border-strong); border-radius: 6px; background: var(--bg); color: var(--text);
  }
  .filter-save-btn {
    background: var(--accent); color: var(--on-accent); border: none; border-radius: 6px;
    padding: .4rem .6rem; font-size: .78rem; font-weight: 600; cursor: pointer;
  }
  .filter-save-btn:disabled { opacity: .5; cursor: default; }
  .filter-list { display: flex; flex-direction: column; gap: 1px; margin-top: 4px; border-top: 1px solid var(--border); padding-top: 4px; }
  .filter-row { display: flex; align-items: center; gap: 4px; }
  .filter-apply-btn {
    flex: 1; text-align: left; background: none; border: none; cursor: pointer;
    padding: .35rem .5rem; border-radius: 6px; font-size: .8rem; color: var(--text);
  }
  .filter-apply-btn:hover { background: var(--hover); }
  .filter-del-btn {
    background: none; border: none; cursor: pointer; color: var(--faint);
    font-size: .85rem; padding: .2rem .4rem; border-radius: 6px; flex-shrink: 0;
  }
  .filter-del-btn:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
  .filter-empty { padding: .5rem; text-align: center; color: var(--faint); font-size: .78rem; }

  @media (max-width: 600px) {
    .action-label { display: none; }
  }
</style>
