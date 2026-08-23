///<reference types="svelte" />
;// B2 — extracted from ListView.svelte (its original, List-only filter
// popover) so Kanban can get the identical filter bar + saved-filters
// feature without duplicating ~150 lines of state/logic. Saved filters
// are stored per-project (not per-view), so a filter saved from List
// shows up in Kanban's popover too — same `offlog_saved_filters_<id>`
// localStorage key either view would have used on its own.

import type { ProjectDoc, TaskDoc, CustomFieldDef } from './types';
import type { CustomFieldFilter } from './utils';
import { PRIORITY_COLOR as PRIO_COLOR } from './constants';
import { popScale } from './motion';
import { fly } from 'svelte/transition';
import CustomSelect from './CustomSelect.svelte';
function $$render() {

  
  
  
  
  
  
  
  
  

  // Declared here with an explicit tuple type rather than inline in the
  // {#each}: inline, TS widened it to (string | number)[][], so `v` came
  // out as string|number and both the filterPrio assignment and the
  // PRIO_COLOR index below silently degraded to `any`.
  const PRIO_CHIPS: [number, string][] = [[0, 'All'], [1, 'Low'], [2, 'Med'], [3, 'High']];
  
  
  

   let project: ProjectDoc/*Ωignore_startΩ*/;project = __sveltets_2_any(project);/*Ωignore_endΩ*/;
   let allTags: string[] = []/*Ωignore_startΩ*/;allTags = __sveltets_2_any(allTags);/*Ωignore_endΩ*/;
   let search = '';
   let filterCol = '';
   let filterPrio = 0;
   let filterTag = '';
  // Roadmap item "custom fields: filterable and sortable" -- `tasks` is
  // only needed to compute the distinct values a chosen field actually
  // has (same "dropdown of what's really in use" pattern as allTags
  // above), not for anything else here. A *list* of filters, not one --
  // owner feedback, 2026-07-31: filtering by a single custom field
  // wasn't enough; every row must match (AND), same as Status/Tag/
  // Priority already stacking together.
   let customFields: CustomFieldDef[] = []/*Ωignore_startΩ*/;customFields = __sveltets_2_any(customFields);/*Ωignore_endΩ*/;
   let tasks: TaskDoc[] = []/*Ωignore_startΩ*/;tasks = __sveltets_2_any(tasks);/*Ωignore_endΩ*/;
   let customFieldFilters: CustomFieldFilter[] = []/*Ωignore_startΩ*/;customFieldFilters = __sveltets_2_any(customFieldFilters);/*Ωignore_endΩ*/;

  let  statusOptions = __sveltets_2_invalidate(() => [{ value: '', label: 'All statuses' }, ...project.columns.map(col => ({ value: col.id, label: col.name }))]);
  let  tagOptions = __sveltets_2_invalidate(() => [{ value: '', label: 'All tags' }, ...allTags.map(t => ({ value: t, label: t }))]);
  // Each row's field dropdown excludes fields already chosen in another
  // row (plus itself, so its own current value stays selectable) --
  // filtering the same field twice at once is never meaningful.
  function fieldOptionsFor(rowIdx: number) {
    const usedElsewhere = new Set(customFieldFilters.filter((_, i) => i !== rowIdx).map(f => f.fieldId).filter(Boolean));
    return [{ value: '', label: 'Choose a field…' }, ...customFields.filter(f => !usedElsewhere.has(f.id)).map(f => ({ value: f.id, label: f.name }))];
  }
  function fieldValueOptionsFor(fieldId: string) {
    if (!fieldId) return [];
    return [{ value: '', label: 'Any value' }, ...[...new Set(
      tasks.map(t => t.custom_values?.[fieldId]).filter((v): v is string | number => v !== undefined && v !== null && v !== '')
    )].map(v => ({ value: String(v), label: String(v) }))];
  }
  function addFieldFilter() { customFieldFilters = [...customFieldFilters, { fieldId: '', value: '' }]; }
  function removeFieldFilter(i: number) { customFieldFilters = customFieldFilters.filter((_, idx) => idx !== i); }
  // A value chosen under a previously-selected field wouldn't mean
  // anything once the field itself changes.
  function onFieldFilterFieldChange(i: number, fieldId: string) {
    customFieldFilters = customFieldFilters.map((f, idx) => idx === i ? { fieldId, value: '' } : f);
  }
  let  canAddFieldFilter = __sveltets_2_invalidate(() => customFieldFilters.length < customFields.length);
  // Icon-only, no "Filters" text label — used where the button sits
  // paired with other icon buttons in a tight pill (App.svelte's board
  // header) rather than List's own roomier toolbar row.
   let compact = false/*Ωignore_startΩ*/;compact = __sveltets_2_any(compact);/*Ωignore_endΩ*/;

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

  // customFieldFilters is optional on old saved filters (predate this
  // feature, or predate it becoming a list) -- absent just means "no
  // custom-field filters", same as an empty array would.
  interface SavedFilter { name: string; search: string; filterCol: string; filterPrio: number; filterTag: string; customFieldFilters?: CustomFieldFilter[] }
  let  savedFiltersKey = __sveltets_2_invalidate(() => `offlog_saved_filters_${project._id}`);
  let savedFilters: SavedFilter[] = [];

  function loadSavedFilters() {
    try { savedFilters = JSON.parse(localStorage.getItem(savedFiltersKey) ?? '[]'); }
    catch { savedFilters = []; }
  }
  ;() => {$: project._id, loadSavedFilters();}

  function saveCurrentFilter() {
    const name = newFilterName.trim();
    if (!name) return;
    savedFilters = [...savedFilters.filter(f => f.name !== name), { name, search, filterCol, filterPrio, filterTag, customFieldFilters }];
    localStorage.setItem(savedFiltersKey, JSON.stringify(savedFilters));
    newFilterName = '';
  }

  function applySavedFilter(f: SavedFilter) {
    search = f.search; filterCol = f.filterCol; filterPrio = f.filterPrio; filterTag = f.filterTag;
    customFieldFilters = f.customFieldFilters ?? [];
    showFilterMenu = false;
  }

  function deleteSavedFilter(name: string) {
    savedFilters = savedFilters.filter(f => f.name !== name);
    localStorage.setItem(savedFiltersKey, JSON.stringify(savedFilters));
  }

  let  activeFilters = __sveltets_2_invalidate(() => (search ? 1 : 0) + (filterCol ? 1 : 0) + (filterPrio ? 1 : 0) + (filterTag ? 1 : 0)
    + customFieldFilters.filter(f => f.fieldId && f.value).length);
  function clearFilters() { search = ''; filterCol = ''; filterPrio = 0; filterTag = ''; customFieldFilters = []; }

  function onWindowClick(e: MouseEvent) {
    if (!showFilterMenu) return;
    // e.target isn't guaranteed to be an Element (e.g. a synthetically
    // dispatched click can target `document` itself), and .closest() only
    // exists on Element — guard instead of assuming, since this fires on
    // every window click.
    if (!(e.target instanceof Element) || !e.target.closest('.filter-menu-wrap')) showFilterMenu = false;
  }
;
async () => {

 { svelteHTML.createElement("svelte:window", {   "on:click":onWindowClick,});}

 { svelteHTML.createElement("div", { "class":`filter-menu-wrap`,});
   { svelteHTML.createElement("button", {         "class":`action-btn`,"on:click":toggleFilterMenu,"aria-label":`Filters`,"title":`Filters`,});compact;activeFilters > 0 || showFilterMenu;
     { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
        { svelteHTML.createElement("path", { "d":`M1 2h12L8.5 7.5v4L5.5 13v-5.5z`,});}
     }
    if(!compact){ { svelteHTML.createElement("span", { "class":`action-label`,});  }}
    if(activeFilters > 0){ { svelteHTML.createElement("span", { "class":`filter-count`,});activeFilters; }}
   }
  if(showFilterMenu){
     { svelteHTML.createElement("div", {     "class":`col-menu filter-menu`,"style":`top:${menuPos.top}px; left:${menuPos.left}px;`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 4, duration: popScale.duration, easing: popScale.easing })));
       { svelteHTML.createElement("div", { "class":`menu-label`,});  }
       { const $$_tceleSmotsuC2C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC2 = new $$_tceleSmotsuC2C({ target: __sveltets_2_any(), props: {    "options":statusOptions,value:filterCol,}});/*Ωignore_startΩ*/() => filterCol = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC2.$$bindings = 'value';}

      if(allTags.length){
         { svelteHTML.createElement("div", { "class":`menu-label`,});  }
         { const $$_tceleSmotsuC2C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC2 = new $$_tceleSmotsuC2C({ target: __sveltets_2_any(), props: {    "options":tagOptions,value:filterTag,}});/*Ωignore_startΩ*/() => filterTag = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC2.$$bindings = 'value';}
      }

      if(customFields.length){
         { svelteHTML.createElement("div", { "class":`menu-label`,});  }
           for(let f of __sveltets_2_ensureArray(customFieldFilters)){let i = 1;
           { svelteHTML.createElement("div", { "class":`field-filter-row`,});
             { svelteHTML.createElement("div", { "class":`field-filter-selects`,});
               { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {      "options":fieldOptionsFor(i),"value":f.fieldId,}});$$_tceleSmotsuC4.$on("change", (e) => onFieldFilterFieldChange(i, e.detail));}
              if(f.fieldId){
                 { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {    "options":fieldValueOptionsFor(f.fieldId),value:f.value,}});/*Ωignore_startΩ*/() => f.value = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC4.$$bindings = 'value';}
              }
             }
             { svelteHTML.createElement("button", {     "class":`field-filter-remove`,"on:click":() => removeFieldFilter(i),"aria-label":`Remove this custom field filter`,});  }
           }
        }
        if(canAddFieldFilter){
           { svelteHTML.createElement("button", {   "class":`add-field-filter-btn`,"on:click":addFieldFilter,});     }
        }
      }

       { svelteHTML.createElement("div", { "class":`menu-label`,});  }
       { svelteHTML.createElement("div", { "class":`prio-chips`,});
          for(let [v, label] of __sveltets_2_ensureArray(PRIO_CHIPS)){
           { svelteHTML.createElement("button", {    "class":`prio-chip`,"on:click":() => filterPrio = filterPrio === v ? 0 : v,});filterPrio === v;
            if(v !== 0){ { svelteHTML.createElement("span", {   "class":`chip-dot`,"style":`background:${PRIO_COLOR[v]}`,}); }}
            label;
           }
        }
       }

      if(activeFilters > 0){
         { svelteHTML.createElement("button", {   "class":`clear-all`,"on:click":clearFilters,});  activeFilters;  }
      }

       { svelteHTML.createElement("div", { "class":`menu-divider`,}); }
       { svelteHTML.createElement("div", { "class":`menu-label`,});  }
       { svelteHTML.createElement("div", { "class":`filter-save-row`,});
         { svelteHTML.createElement("input", {        "class":`filter-name-input`,"bind:value":newFilterName,"placeholder":`Name this filter…`,"on:keydown":(e) => { if (e.key === 'Enter') saveCurrentFilter(); },});/*Ωignore_startΩ*/() => newFilterName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
         { svelteHTML.createElement("button", {     "class":`filter-save-btn`,"on:click":saveCurrentFilter,"disabled":!newFilterName.trim(),});  }
       }
      if(savedFilters.length){
         { svelteHTML.createElement("div", { "class":`filter-list`,});
             for(let f of __sveltets_2_ensureArray(savedFilters)){f.name;
             { svelteHTML.createElement("div", { "class":`filter-row`,});
               { svelteHTML.createElement("button", {   "class":`filter-apply-btn`,"on:click":() => applySavedFilter(f),});f.name; }
               { svelteHTML.createElement("button", {     "class":`filter-del-btn`,"on:click":() => deleteSavedFilter(f.name),"aria-label":`Delete filter ${f.name}`,});  }
             }
          }
         }
      }else{
         { svelteHTML.createElement("div", { "class":`filter-empty`,});    }
      }
     }
  }
 }


};
return { props: {project: project , allTags: allTags , search: search , filterCol: filterCol , filterPrio: filterPrio , filterTag: filterTag , customFields: customFields , tasks: tasks , customFieldFilters: customFieldFilters , compact: compact} as {project: ProjectDoc, allTags?: string[], search?: typeof search, filterCol?: typeof filterCol, filterPrio?: typeof filterPrio, filterTag?: typeof filterTag, customFields?: CustomFieldDef[], tasks?: TaskDoc[], customFieldFilters?: CustomFieldFilter[], compact?: typeof compact}, exports: {}, bindings: "", slots: {}, events: {} }}
const FilterBar__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type FilterBar__SvelteComponent_ = InstanceType<typeof FilterBar__SvelteComponent_>;
/*Ωignore_endΩ*/export default FilterBar__SvelteComponent_;