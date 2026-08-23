///<reference types="svelte" />
;
import { onMount } from 'svelte';
import { slide } from 'svelte/transition';
import { flip } from 'svelte/animate';
import { cubicOut } from 'svelte/easing';
import { toastFly } from './motion';
import type { ProjectDoc, TaskDoc, CustomFieldDef } from './types';
import { updateTask, unarchiveTask, getArchivedTasksForProject, getCustomFieldDefs, getTaskById } from './db';
import { reloadTasks, showError, projects } from './store';
import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
import { dueLabel, dueInk, filterTasks, type CustomFieldFilter } from './utils';
import CardDetail from './CardDetail.svelte';
import FilterBar from './FilterBar.svelte';
import CustomSelect from './CustomSelect.svelte';
import { hapticToggle } from './haptics';
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  
  
  
  
  

   let project: ProjectDoc/*Ωignore_startΩ*/;project = __sveltets_2_any(project);/*Ωignore_endΩ*/;
   let tasks: TaskDoc[]/*Ωignore_startΩ*/;tasks = __sveltets_2_any(tasks);/*Ωignore_endΩ*/;

  // B36 — List view power customization (2026-07-03, owner direction):
  // saved filters, column selection, column reordering, native horizontal
  // scroll (no truncation, ever), multi-column sort, and more columns.
  // Design baseline stays the from-scratch rewrite (see DECISIONS.md):
  // real data grid, generous columns, plain colored text for dates instead
  // of pill badges. Every preference here is per-device (`localStorage`),
  // not per-project or synced — a phone and a PC may reasonably want
  // different columns/filters, and syncing UI state isn't obviously
  // desirable.

  let search = '';
  let filterCol = '';
  let filterPrio = 0;
  let filterTag = '';
  let customFieldFilters: CustomFieldFilter[] = [];
  let showArchived = false;
  // Declared up here (not down by colLabel/isCustomCol below, where it's
  // also used) so cmpOne()/sortIcons above can reference it without a
  // temporal-dead-zone hazard -- `$:`/plain-`let` declaration order is
  // still real JS execution order, unlike function declarations.
  let customFields: CustomFieldDef[] = [];

  const colName = (id: string) => project.columns.find(c => c.id === id)?.name ?? '—';
  const lastColId = () => project.columns.at(-1)?.id ?? '';

  let  allTags = __sveltets_2_invalidate(() => [...new Set(tasks.flatMap(t => t.tags))].sort());
  let  filtered = __sveltets_2_invalidate(() => filterTasks(tasks, search, filterCol, filterPrio, filterTag, customFieldFilters));
  // Empty-state message (line ~585) needs to tell "no tasks at all" apart
  // from "filtered down to zero" — mirrors FilterBar.svelte's own
  // activeFilters, which only drives that popover's badge/clear-button,
  // not this view's empty-state text.
  let  activeFilters = __sveltets_2_invalidate(() => (search ? 1 : 0) + (filterCol ? 1 : 0) + (filterPrio ? 1 : 0) + (filterTag ? 1 : 0)
    + customFieldFilters.filter(f => f.fieldId && f.value).length);

  // ── Multi-column sort ──────────────────────────────────────────────────
  // Plain click sorts by that column alone (resets any prior multi-sort).
  // Shift-click adds it as a secondary/tertiary tiebreaker instead of
  // replacing the sort — the standard spreadsheet pattern. Pinned-first
  // is an opt-in toggle (owner feedback, 2026-07-28) rather than always-on
  // — some users don't want pinned tasks to override their chosen sort.
  // Off by default, persisted per-device like `cols`/`colOrder` below.
  // Widened from a strict literal union to `string` (roadmap item "custom
  // fields: filterable and sortable") -- a custom field's column key
  // (its own `id`, "field:<nanoid>") is only known at runtime, same
  // reasoning as ColKey below. cmpOne()'s `if` chain still only special-
  // cases the built-ins by name; anything else falls through to the
  // custom-field branch at the bottom.
  type SortCol = string;
  // Default sort is priority descending (High → Medium → Low), matching
  // how the data is actually ordered/queried elsewhere (owner feedback,
  // 2026-07-28). cmpOne('priority') already returns high-first with
  // asc:true, so this is just picking a different starting column.
  let sortSpec: { col: SortCol; asc: boolean }[] = [{ col: 'priority', asc: true }];
  let pinnedFirst = false;
  const PINNED_FIRST_KEY = 'offlog_list_pinned_first';
  function togglePinnedFirst() {
    pinnedFirst = !pinnedFirst;
    localStorage.setItem(PINNED_FIRST_KEY, JSON.stringify(pinnedFirst));
  }

  function cmpOne(col: SortCol, a: TaskDoc, b: TaskDoc): number {
    if (col === 'title')    return a.title.localeCompare(b.title);
    if (col === 'column')   return colName(a.column_id).localeCompare(colName(b.column_id));
    if (col === 'priority') return b.priority - a.priority;
    if (col === 'due')      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    if (col === 'created')  return a.created_at.localeCompare(b.created_at);
    if (col === 'updated')  return a.updated_at.localeCompare(b.updated_at);
    if (col === 'source')   return a.source.localeCompare(b.source);
    if (col.startsWith('field:')) {
      const av = a.custom_values?.[col], bv = b.custom_values?.[col];
      // Missing/empty always sorts last regardless of direction -- an
      // unset field isn't "less than" a real value in either direction.
      if ((av ?? '') === '' && (bv ?? '') === '') return 0;
      if ((av ?? '') === '') return 1;
      if ((bv ?? '') === '') return -1;
      const isNumber = customFields.find(f => f.id === col)?.type === 'number';
      if (isNumber) return Number(av) - Number(bv);
      return String(av).localeCompare(String(bv));
    }
    return 0;
  }

  let  sorted = __sveltets_2_invalidate(() => [...filtered].sort((a, b) => {
    if (pinnedFirst && !!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    for (const { col, asc } of sortSpec) {
      const cmp = cmpOne(col, a, b);
      if (cmp !== 0) return asc ? cmp : -cmp;
    }
    return 0;
  }));

  // redesign/v6 fix (owner feedback, 2026-07-28): the title column used
  // to be `minmax(220px, max-content)`, but .grid-head/each .grid-row are
  // independent CSS grids (grid-template-columns is set per-element, not
  // once on a shared container) -- `max-content` resolves separately per
  // row, sized only to that row's own title. A long-title row got a
  // wider title column than a short-title row, so Status/Priority/Due/
  // Tags landed at different x-offsets row to row -- read as the title
  // text bleeding into the next column and the grid not behaving like a
  // real table. Fix: measure the widest visible title once (canvas,
  // matching .cell-title's font) and use that one fixed pixel width for
  // every row's title column, so every row shares identical boundaries.
  let measureCanvas: HTMLCanvasElement | null = null;
  function measureTextWidth(text: string, font: string): number {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (!ctx) return text.length * 8;
    ctx.font = font;
    return ctx.measureText(text).width;
  }
  const TITLE_FONT = '500 14px "Hanken Grotesk", sans-serif';
  // Flat buffer for the recurrence mark that can trail the title inline
  // (pin/checklist/related marks were dropped from this view, 2026-07-28
  // owner feedback — pinned now shows via the row's left accent instead).
  const TITLE_ICON_BUFFER = 24;
  let  titleColWidth = __sveltets_2_invalidate(() => Math.min(480, Math.max(220, Math.ceil(
    Math.max(0, ...sorted.map(t => measureTextWidth(t.title, TITLE_FONT))) + TITLE_ICON_BUFFER
  ))));

  function toggleSort(col: SortCol, additive: boolean) {
    const existing = sortSpec.find(s => s.col === col);
    if (additive) {
      if (existing) sortSpec = sortSpec.map(s => s.col === col ? { ...s, asc: !s.asc } : s);
      else sortSpec = [...sortSpec, { col, asc: true }];
    } else {
      sortSpec = existing && sortSpec.length === 1 ? [{ col, asc: !existing.asc }] : [{ col, asc: true }];
    }
  }

  function sortIconFor(col: SortCol, spec: typeof sortSpec): string {
    const idx = spec.findIndex(s => s.col === col);
    if (idx === -1) return '↕';
    const arrow = spec[idx].asc ? '↑' : '↓';
    // Show which tiebreaker position this column is at (2nd, 3rd sort key)
    // when there's more than one active — otherwise a bare arrow is enough.
    return spec.length > 1 ? `${arrow}${idx + 1}` : arrow;
  }

  // Precomputed as a `$:` reactive map, not called as a plain function
  // straight from the template inside a {#each} block — a plain function
  // call there doesn't reliably re-run when `sortSpec` changes (verified
  // live: sort order updated correctly on click, but the header arrow
  // didn't). A top-level `$:` statement is guaranteed to re-run whenever
  // sortSpec changes, since Svelte tracks it as an explicit dependency.
  let  sortIcons = __sveltets_2_invalidate(() => (Object.fromEntries(
    ['title', 'column', 'priority', 'due', 'created', 'updated', 'source', ...customFields.map(f => f.id)]
      .map(col => [col, sortIconFor(col, sortSpec)])
  ) as Record<string, string>));

  // B2 — the Filters button/popover + saved-filters feature moved into
  // shared FilterBar.svelte (also used by KanbanBoard.svelte now); this
  // view keeps only the filter *values* (search/filterCol/filterPrio/
  // filterTag, declared above) since filterTasks() and the archived-tasks
  // filter below both still need them directly.

  // ── Column selection + order ────────────────────────────────────────────
  // Title (and the mark-done circle) are always shown and always first —
  // everything else is optional and reorderable. Width map covers every
  // column key; order is a plain array so drag-reorder is just an array
  // splice.
  // ColKey covers the 7 built-ins plus, dynamically, one per global custom
  // field (B16) — a field's own `id` (already namespaced "field:<nanoid>",
  // see types.ts) doubles as its column key, so it can't collide with a
  // built-in. Widened to `string` rather than a strict union since the set
  // of custom fields isn't known at compile time.
  type ColKey = string;
  const COL_LABELS: Record<string, string> = {
    status: 'Status', priority: 'Priority', due: 'Due', tags: 'Tags',
    created: 'Created', updated: 'Updated', source: 'Device',
  };
  const COL_WIDTH: Record<string, string> = {
    status: '120px', priority: '100px', due: '130px', tags: 'minmax(140px,200px)',
    created: '110px', updated: '110px', source: '90px',
  };
  const DEFAULT_ORDER: ColKey[] = ['status', 'priority', 'due', 'tags', 'created', 'updated', 'source'];
  const COLS_KEY = 'offlog_list_columns';
  const ORDER_KEY = 'offlog_list_col_order';

  function colLabel(key: ColKey): string { return COL_LABELS[key] ?? customFields.find(f => f.id === key)?.name ?? key; }
  function colWidth(key: ColKey): string { return COL_WIDTH[key] ?? '130px'; }
  function isCustomCol(key: ColKey): boolean { return key.startsWith('field:'); }

  // Priority off by default (owner feedback, 2026-07-28) -- the row's
  // left-edge color already carries priority; the column is available to
  // turn back on via the column menu for anyone who wants it explicit.
  let cols: Record<ColKey, boolean> = { status: true, priority: false, due: true, tags: true, created: false, updated: false, source: false };
  let colOrder: ColKey[] = [...DEFAULT_ORDER];
  let showColMenu = false;
  let colMenuPos = { top: 0, left: 0 };
  function openColMenu(e: MouseEvent) {
    if (!showColMenu) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const menuWidth = 190;
      colMenuPos = { top: r.bottom + 6, left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)) };
    }
    showColMenu = !showColMenu;
  }
  // Drag state for column reordering. `dragOverCol`/`dragOverSide` drive
  // the visual insertion indicator (a highlighted edge on the header
  // being dragged over) — without them, dragging gave no feedback about
  // whether dropping would place the column to the left or right of the
  // one under the cursor.
  let dragCol: ColKey | null = null;
  let dragOverCol: ColKey | null = null;
  let dragOverSide: 'left' | 'right' | null = null;


  onMount(async () => {
    // Custom fields are global (not per-project) — fetched once here so
    // their ids are known before reconciling saved column state against
    // them. New fields default OFF (opt-in), same as created/updated/source.
    customFields = await getCustomFieldDefs();
    const knownKeys = [...DEFAULT_ORDER, ...customFields.map(f => f.id)];
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null');
      if (saved) cols = { ...cols, ...saved };
    } catch {}
    for (const f of customFields) if (!(f.id in cols)) cols = { ...cols, [f.id]: false };
    try {
      const savedOrder = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null') as ColKey[] | null;
      // Reconcile against every currently-known key (built-in + custom
      // field) in case one was added or removed since this was saved —
      // never drop or silently lose a known key, never keep a stale one.
      const base = savedOrder ?? colOrder;
      colOrder = [...base.filter(k => knownKeys.includes(k)), ...knownKeys.filter(k => !base.includes(k))];
    } catch {}
    try {
      pinnedFirst = JSON.parse(localStorage.getItem(PINNED_FIRST_KEY) ?? 'false');
    } catch {}
  });

  function toggleCol(key: ColKey) {
    cols = { ...cols, [key]: !cols[key] };
    localStorage.setItem(COLS_KEY, JSON.stringify(cols));
  }

  function onColDragStart(key: ColKey) { dragCol = key; }

  function onColDragOver(e: DragEvent, targetKey: ColKey) {
    if (!dragCol || dragCol === targetKey) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOverCol = targetKey;
    dragOverSide = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
  }

  function onColDragLeave(targetKey: ColKey) {
    if (dragOverCol === targetKey) { dragOverCol = null; dragOverSide = null; }
  }

  function onColDrop(targetKey: ColKey) {
    const side = dragOverSide;
    dragOverCol = null; dragOverSide = null;
    if (!dragCol || dragCol === targetKey) { dragCol = null; return; }
    const next = colOrder.filter(k => k !== dragCol);
    let targetIdx = next.indexOf(targetKey);
    if (side === 'right') targetIdx += 1;
    next.splice(targetIdx, 0, dragCol);
    colOrder = next;
    localStorage.setItem(ORDER_KEY, JSON.stringify(colOrder));
    dragCol = null;
  }

  function onColDragEnd() { dragCol = null; dragOverCol = null; dragOverSide = null; }

  let  visibleOrder = __sveltets_2_invalidate(() => colOrder.filter(k => cols[k]));

  function onWindowClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (showColMenu && !t.closest('.col-menu-wrap')) showColMenu = false;
  }

  // ── Horizontal scroll, no truncation ────────────────────────────────────
  // grid-template-columns is built from the fixed circle/title tracks plus
  // whichever optional columns are visible, in the user's chosen order.
  // The grid card scrolls horizontally (`.grid-scroll`) rather than
  // truncating or dropping columns on a narrow viewport — .grid-head/
  // .grid-row are `width: max-content`, so they size to their natural
  // (unclipped) content width and the scroll container takes over once
  // that's wider than the viewport, instead of the old responsive
  // column-hiding tiers. Title track is `titleColWidth`px (computed above),
  // not `max-content` — every row now shares the exact same track sizes,
  // so columns actually line up instead of drifting per row.
  let  gridTemplate = __sveltets_2_invalidate(() => (selectionMode ? '20px ' : '') + `24px ${titleColWidth}px` + visibleOrder.map(k => ` ${colWidth(k)}`).join(''));

  // B19 (revised, owner feedback 2026-07-09): plain checkboxes-everywhere
  // was rejected as a UI — checkboxes only appear once "Select" mode is
  // explicitly turned on (matching Filters/Archived/Columns as a toggle in
  // the same action group), and there's no shift-click range-select.
  // `selected` is per-project-view state only, never persisted.
  let selectionMode = false;
  let selected = new Set<string>();
  let bulkStatus = '';
  let bulkPriorityStr = '';
  let bulkTagAdd = '';
  let bulkBusy = false;
  let  bulkStatusOptions = __sveltets_2_invalidate(() => [{ value: '', label: 'Move to status…' }, ...project.columns.map(col => ({ value: col.id, label: col.name }))]);
  const bulkPriorityOptions = [
    { value: '', label: 'Change priority…' },
    { value: '1', label: 'Low' },
    { value: '2', label: 'Medium' },
    { value: '3', label: 'High' },
  ];

  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    if (!selectionMode) selected = new Set();
  }

  function toggleRowSelect(taskId: string) {
    const next = new Set(selected);
    if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
    selected = next;
  }

  function clearSelection() { selected = new Set(); }

  // Selection references task ids from whatever was visible when picked —
  // if a filter/sort change hides a previously-selected task, drop it
  // rather than silently bulk-acting on a task the user can no longer see.
  ;() => {$: { const visible = new Set(sorted.map(t => t._id!)); const next = new Set([...selected].filter(id => visible.has(id))); if (next.size !== selected.size) selected = next; }}

  async function bulkMoveStatus() {
    if (!bulkStatus || !selected.size) return;
    bulkBusy = true;
    try {
      for (const id of selected) await updateTask(id, { column_id: bulkStatus });
      await reloadTasks();
      clearSelection();
    } catch {
      showError('Failed to update some tasks. Please try again.');
    } finally {
      bulkBusy = false;
      bulkStatus = '';
    }
  }

  async function bulkChangePriority() {
    if (!bulkPriorityStr || !selected.size) return;
    bulkBusy = true;
    try {
      const priority = Number(bulkPriorityStr) as 1 | 2 | 3;
      for (const id of selected) await updateTask(id, { priority });
      await reloadTasks();
      clearSelection();
    } catch {
      showError('Failed to update some tasks. Please try again.');
    } finally {
      bulkBusy = false;
      bulkPriorityStr = '';
    }
  }

  async function bulkAddTag() {
    const tag = bulkTagAdd.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || !selected.size) return;
    bulkBusy = true;
    try {
      for (const id of selected) {
        const t = sorted.find(x => x._id === id);
        if (t && !t.tags.includes(tag)) await updateTask(id, { tags: [...t.tags, tag] });
      }
      await reloadTasks();
      bulkTagAdd = '';
    } catch {
      showError('Failed to tag some tasks. Please try again.');
    } finally {
      bulkBusy = false;
    }
  }

  let detailTask: TaskDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists — {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;
  // null = "use this view's own `project` prop" (the normal case). Only
  // set to a real ProjectDoc when a related-task link opens a task
  // belonging to a *different* project than this list.
  let detailProjectOverride: ProjectDoc | null = null;
  function openDetail(task: TaskDoc) { detailOpenSession++; detailTask = task; detailProjectOverride = null; }

  async function openRelatedTask(id: string) {
    const t = await getTaskById(id);
    if (!t) { showError('This task no longer exists.'); return; }
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) { showError('Could not open this task right now.'); return; }
    detailOpenSession++;
    detailTask = t;
    detailProjectOverride = proj;
  }

  // B27 — loaded regardless of showArchived (not just while the section is
  // open) so the toggle button itself can carry a count badge; previously
  // the only way to know archived tasks existed was to open the toggle.
  let archivedTasksRaw: TaskDoc[] = [];
  ;() => {$: getArchivedTasksForProject(project._id).then(t => { archivedTasksRaw = t; });}
  // Same active search/status/priority/tag filters as the main list — the
  // archived section previously ignored them entirely, so narrowing the
  // main list did nothing to what showed up here.
  let  archivedTasks = __sveltets_2_invalidate(() => filterTasks(archivedTasksRaw, search, filterCol, filterPrio, filterTag, customFieldFilters));

  // Full date (month/day/year) — with no truncation and horizontal scroll
  // available (B36), there's no reason to abbreviate away the year.
  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // A22: the mark-done circle is a single click with no confirmation — an
  // accidental click previously had no way back short of reopening the
  // card and changing status manually. Remember the task's prior state
  // briefly so a mis-click can be undone with one tap, matching the undo
  // pattern already used for deletion (App.svelte's undo toast).
  //
  // Snapshotting more than just column_id (also due_date/reminder_at/
  // checklist) since a recurring task's completion now resets those too
  // in the same write (db.ts's updateTask() — one task object per
  // series, not a new card per completion) — restoring only column_id
  // on undo would leave the due date/checklist changes stuck even though
  // the task visually looks "undone" (found while implementing recurring
  // tasks, 2026-07-19).
  let undoMarkDone: {
    id: string; title: string;
    fromColId: string; fromDueDate: string | null; fromReminderAt: string | null;
    fromChecklist: { text: string; done: boolean }[] | undefined;
    timer: any;
  } | null = null;

  async function markDone(task: TaskDoc) {
    const { column_id: fromColId, due_date: fromDueDate, reminder_at: fromReminderAt, checklist: fromChecklist } = task;
    // lastColId() falls back to '' on a project with no columns; writing
    // that would orphan the task into a column that doesn't exist (which
    // checkIntegrity then flags as invalid_column). DeadlinesView, FocusView
    // and notifications.ts all guard this already -- this was the one path
    // that didn't.
    const target = lastColId();
    if (!target) { showError('This project has no statuses to mark done into.'); return; }
    try {
      await updateTask(task._id!, { column_id: target });
      await reloadTasks();
      hapticToggle();
    } catch {
      showError('Failed to update task. Please try again.');
      return;
    }
    if (undoMarkDone) clearTimeout(undoMarkDone.timer);
    const timer = setTimeout(() => { undoMarkDone = null; }, 5000);
    undoMarkDone = { id: task._id!, title: task.title, fromColId, fromDueDate, fromReminderAt, fromChecklist, timer };
  }

  async function undoLastMarkDone() {
    if (!undoMarkDone) return;
    const { id, fromColId, fromDueDate, fromReminderAt, fromChecklist, timer } = undoMarkDone;
    clearTimeout(timer);
    undoMarkDone = null;
    try {
      await updateTask(id, { column_id: fromColId, due_date: fromDueDate, reminder_at: fromReminderAt, checklist: fromChecklist });
      await reloadTasks();
    } catch {
      showError('Failed to undo. Please try again.');
    }
  }
;
async () => {

 { svelteHTML.createElement("svelte:window", {   "on:click":onWindowClick,});}

 { svelteHTML.createElement("div", { "class":`list-wrap`,});
  
   { svelteHTML.createElement("div", { "class":`list-panel`,});
   { svelteHTML.createElement("div", { "class":`toolbar`,});
       { svelteHTML.createElement("div", { "class":`search-box`,});
         { svelteHTML.createElement("svg", {             "viewBox":`0 0 16 16`,"width":`13`,"height":`13`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,});
            { svelteHTML.createElement("circle", {     "cx":`6.5`,"cy":`6.5`,"r":`4.5`,});}  { svelteHTML.createElement("line", {       "x1":`10`,"y1":`10`,"x2":`14`,"y2":`14`,});}
         }
         { svelteHTML.createElement("input", {      "class":`search-input`,"bind:value":search,"placeholder":`Search tasks…`,});/*Ωignore_startΩ*/() => search = __sveltets_2_any(null);/*Ωignore_endΩ*/}
        if(search){ { svelteHTML.createElement("button", {   "class":`clear-x`,"on:click":() => search = '',});  }}
       }

     { svelteHTML.createElement("div", { "class":`toolbar-actions`,});
        { const $$_raBretliF4C = __sveltets_2_ensureComponent(FilterBar); const $$_raBretliF4 = new $$_raBretliF4C({ target: __sveltets_2_any(), props: {        project,allTags,tasks,customFields,search,filterCol,filterPrio,filterTag,customFieldFilters,}});/*Ωignore_startΩ*/() => search = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF4.$$bindings = 'search';/*Ωignore_startΩ*/() => filterCol = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF4.$$bindings = 'filterCol';/*Ωignore_startΩ*/() => filterPrio = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF4.$$bindings = 'filterPrio';/*Ωignore_startΩ*/() => filterTag = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF4.$$bindings = 'filterTag';/*Ωignore_startΩ*/() => customFieldFilters = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF4.$$bindings = 'customFieldFilters';}

       { svelteHTML.createElement("button", {        "class":`action-btn`,"on:click":() => showArchived = !showArchived,"aria-label":`Show archived tasks (${archivedTasksRaw.length})`,"title":`Show archived tasks`,});showArchived;
         { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
            { svelteHTML.createElement("rect", {         "x":`1`,"y":`1`,"width":`12`,"height":`3`,"rx":`1`,});}  { svelteHTML.createElement("path", { "d":`M2 4v8a1 1 0 001 1h8a1 1 0 001-1V4`,});}  { svelteHTML.createElement("line", {       "x1":`5`,"y1":`7`,"x2":`9`,"y2":`7`,});}
         }
         { svelteHTML.createElement("span", { "class":`action-label`,}); if(archivedTasksRaw.length > 0){ archivedTasksRaw.length;} }
       }

       { svelteHTML.createElement("div", { "class":`col-menu-wrap`,});
         { svelteHTML.createElement("button", {        "class":`action-btn`,"on:click":openColMenu,"aria-label":`Select rows or show/hide columns`,"title":`Select rows / show-hide columns`,});showColMenu || selectionMode;
           { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
              { svelteHTML.createElement("line", {       "x1":`3`,"y1":`3`,"x2":`3`,"y2":`11`,});}  { svelteHTML.createElement("line", {       "x1":`7`,"y1":`3`,"x2":`7`,"y2":`11`,});}  { svelteHTML.createElement("line", {       "x1":`11`,"y1":`3`,"x2":`11`,"y2":`11`,});}
           }
           { svelteHTML.createElement("span", { "class":`action-label`,});  }
         }
        if(showColMenu){
          
           { svelteHTML.createElement("div", {   "class":`col-menu col-menu--fixed`,"style":`top:${colMenuPos.top}px; left:${colMenuPos.left}px;`,});
             { svelteHTML.createElement("label", { "class":`col-menu-item select-rows-item`,});
               
               { svelteHTML.createElement("button", {          "class":`toggle-mini`,"on:click":toggleSelectionMode,"role":`switch`,"aria-checked":selectionMode,"aria-label":`Toggle row selection`,});selectionMode;
                 { svelteHTML.createElement("span", { "class":`toggle-mini-knob`,}); }
               }
             }
             { svelteHTML.createElement("label", { "class":`col-menu-item select-rows-item`,});
               
               { svelteHTML.createElement("button", {          "class":`toggle-mini`,"on:click":togglePinnedFirst,"role":`switch`,"aria-checked":pinnedFirst,"aria-label":`Toggle pinned-first sorting`,});pinnedFirst;
                 { svelteHTML.createElement("span", { "class":`toggle-mini-knob`,}); }
               }
             }
             { svelteHTML.createElement("div", { "class":`menu-divider`,}); }
               for(let key of __sveltets_2_ensureArray(colOrder)){key;
               { svelteHTML.createElement("label", { "class":`col-menu-item`,});
                 { svelteHTML.createElement("input", {      "type":`checkbox`,"checked":cols[key],"on:change":() => toggleCol(key),});}
                colLabel(key);
               }
            }
           }
        }
       }
     }
   }

  if(selectionMode){
     { svelteHTML.createElement("div", { "class":`bulk-bar`,});
       { svelteHTML.createElement("span", { "class":`bulk-count`,});selected.size;  }
       { svelteHTML.createElement("div", { "class":`bulk-sel-wrap`,});
         { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {        "options":bulkStatusOptions,value:bulkStatus,"disabled":bulkBusy || !selected.size,}});/*Ωignore_startΩ*/() => bulkStatus = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC4.$$bindings = 'value';$$_tceleSmotsuC4.$on("change", bulkMoveStatus);}
       }
       { svelteHTML.createElement("div", { "class":`bulk-sel-wrap`,});
         { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {        "options":bulkPriorityOptions,value:bulkPriorityStr,"disabled":bulkBusy || !selected.size,}});/*Ωignore_startΩ*/() => bulkPriorityStr = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC4.$$bindings = 'value';$$_tceleSmotsuC4.$on("change", bulkChangePriority);}
       }
       { svelteHTML.createElement("input", {          "class":`bulk-input`,"bind:value":bulkTagAdd,"placeholder":`Add tag…`,"on:keydown":(e) => e.key === 'Enter' && bulkAddTag(),"disabled":bulkBusy || !selected.size,});/*Ωignore_startΩ*/() => bulkTagAdd = __sveltets_2_any(null);/*Ωignore_endΩ*/}
       { svelteHTML.createElement("button", {     "class":`bulk-btn`,"on:click":bulkAddTag,"disabled":bulkBusy || !selected.size || !bulkTagAdd.trim(),});  }
       { svelteHTML.createElement("button", {     "class":`bulk-btn bulk-clear`,"on:click":toggleSelectionMode,"disabled":bulkBusy,});  }
     }
  }

  
   { svelteHTML.createElement("div", { "class":`grid-scroll`,});
     { svelteHTML.createElement("div", { "class":`grid-card grid-card--flush`,});
       { svelteHTML.createElement("div", {   "class":`grid-head`,"style":`grid-template-columns:${gridTemplate}`,});
        if(selectionMode){
          const allSelected = sorted.length > 0 && selected.size === sorted.length;
           { svelteHTML.createElement("button", {            "class":`row-check head-check`,"role":`checkbox`,"aria-checked":allSelected,"aria-label":`Select all visible tasks`,"on:click":() => { selected = allSelected ? new Set() : new Set(sorted.map(t => t._id!)); },});allSelected;
            if(allSelected){ { svelteHTML.createElement("svg", {               "viewBox":`0 0 12 12`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`var(--on-accent)`,"stroke-width":`2`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`2,6.5 5,9.5 10,3`,});} }}
           }
        }
         { svelteHTML.createElement("span", { "class":`head-spacer`,}); }
         { svelteHTML.createElement("button", {     "class":`th-btn`,"title":`Click to sort. Shift+click to add as a secondary sort.`,"on:click":(e) => toggleSort('title', e.shiftKey),});  { svelteHTML.createElement("span", { "class":`sort-icon`,});sortIcons.title; } }
           for(let key of __sveltets_2_ensureArray(visibleOrder)){key;
          const sortKey = key === 'tags' ? null : (key === 'status' ? 'column' : key) as SortCol | null;
           { svelteHTML.createElement("button", {                      "class":`th-btn`,"draggable":`true`,"on:dragstart":() => onColDragStart(key),"on:dragover":(e) => { e.preventDefault(); onColDragOver(e, key); },"on:dragleave":() => onColDragLeave(key),"on:drop":() => onColDrop(key),"on:dragend":onColDragEnd,"on:click":(e) => sortKey && toggleSort(sortKey, e.shiftKey),"title":sortKey ? 'Drag to reorder. Click to sort. Shift+click to add as a secondary sort.' : 'Drag to reorder. Not sortable.',});dragOverCol === key && dragOverSide === 'left';dragOverCol === key && dragOverSide === 'right';dragCol === key;
            colLabel(key);
            if(sortKey){ { svelteHTML.createElement("span", { "class":`sort-icon`,});sortIcons[sortKey]; }}
           }
        }
       }

         for(let task of __sveltets_2_ensureArray(sorted)){task._id;
         { svelteHTML.createElement("div", {                   "class":`grid-row`,"style":`--prio-color:${PRIO_COLOR[task.priority]}; grid-template-columns:${gridTemplate}`,"role":`button`,"tabindex":0,"on:click":() => selectionMode ? toggleRowSelect(task._id!) : openDetail(task),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectionMode ? toggleRowSelect(task._id!) : openDetail(task); } },});selected.has(task._id!);task.pinned;__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));__sveltets_2_ensureAnimation(flip(svelteHTML.mapElementTag('div'),__sveltets_2_AnimationMove,({ duration: 200, easing: cubicOut })));
          if(selectionMode){
             { svelteHTML.createElement("button", {            "class":`row-check`,"role":`checkbox`,"aria-checked":selected.has(task._id!),"aria-label":`Select ${task.title}`,"on:click":() => toggleRowSelect(task._id!),});selected.has(task._id!);
              if(selected.has(task._id!)){ { svelteHTML.createElement("svg", {               "viewBox":`0 0 12 12`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`var(--on-accent)`,"stroke-width":`2`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`2,6.5 5,9.5 10,3`,});} }}
             }
          }
           { svelteHTML.createElement("button", {          "class":`circle`,"title":`Move to last status`,"aria-label":`Move to last status`,"on:click":() => markDone(task),});task.column_id === lastColId();
            if(task.column_id === lastColId()){
               { svelteHTML.createElement("svg", {               "viewBox":`0 0 12 12`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`var(--accent)`,"stroke-width":`2`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`2,6.5 5,9.5 10,3`,});} }
            }
           }
           { svelteHTML.createElement("span", { "class":`cell-title`,});
            task.title;
            if(task.recurrence){
               { svelteHTML.createElement("span", {   "class":`recur-mark`,"title":`Repeats ${task.recurrence}`,});
                 { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`10`,"height":`10`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.4`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("path", { "d":`M2 7a5 5 0 0 1 8.5-3.5M12 2v3h-3`,});}  { svelteHTML.createElement("path", { "d":`M12 7a5 5 0 0 1-8.5 3.5M2 12V9h3`,});} }
               }
            }
           }
             for(let key of __sveltets_2_ensureArray(visibleOrder)){key;
            if(key === 'status'){
               { svelteHTML.createElement("span", { "class":`cell-status`,});colName(task.column_id); }
            } else if (key === 'priority'){
               { svelteHTML.createElement("span", { "class":`cell-prio`,});
                 { svelteHTML.createElement("span", {   "class":`prio-dot`,"style":`background:${PRIO_COLOR[task.priority]}`,}); }
                PRIO_LABEL[task.priority];
               }
            } else if (key === 'due'){
               { svelteHTML.createElement("span", {   "class":`cell-due`,"style":`color:${dueInk(task.due_date)}`,});dueLabel(task.due_date, '—'); }
            } else if (key === 'tags'){
               { svelteHTML.createElement("span", { "class":`cell-tags`,});
                  for(let tag of __sveltets_2_ensureArray(task.tags)){ { svelteHTML.createElement("span", { "class":`tag`,});tag; }}
               }
            } else if (key === 'created'){
               { svelteHTML.createElement("span", { "class":`cell-date`,});fmtDate(task.created_at); }
            } else if (key === 'updated'){
               { svelteHTML.createElement("span", { "class":`cell-date`,});fmtDate(task.updated_at); }
            } else if (key === 'source'){
               { svelteHTML.createElement("span", { "class":`cell-date`,});task.source; }
            } else if (isCustomCol(key)){
               { svelteHTML.createElement("span", { "class":`cell-date`,});task.custom_values?.[key] ?? '—'; }
            }
          }
         }
      }

      if(sorted.length === 0){
         { svelteHTML.createElement("div", { "class":`empty`,});
          if(activeFilters > 0){     }else{         }
         }
      }
     }
   }
   }

   { svelteHTML.createElement("div", { "class":`sort-hint`,});            }

  if(showArchived && archivedTasksRaw.length > 0){
     { svelteHTML.createElement("div", { "class":`archived-section`,});
       { svelteHTML.createElement("div", { "class":`archived-label`,}); archivedTasks.length;archivedTasks.length !== archivedTasksRaw.length ? ` of ${archivedTasksRaw.length}` : '';  }
      if(archivedTasks.length > 0){
         { svelteHTML.createElement("div", { "class":`grid-scroll`,});
           { svelteHTML.createElement("div", { "class":`grid-card`,});
               for(let task of __sveltets_2_ensureArray(archivedTasks)){task._id;
               { svelteHTML.createElement("div", {   "class":`archived-row`,"style":`--prio-color:${PRIO_COLOR[task.priority]}`,});
                 { svelteHTML.createElement("span", { "class":`archived-title`,});task.title; }
                 { svelteHTML.createElement("span", { "class":`cell-status`,});colName(task.column_id); }
                 { svelteHTML.createElement("button", {   "class":`unarchive-btn`,"on:click":async () => {
                  try {
                    await unarchiveTask(task._id!);
                    await reloadTasks();
                    archivedTasksRaw = await getArchivedTasksForProject(project._id);
                  } catch {
                    showError('Failed to restore task. Please try again.');
                  }
                },});  }
               }
            }
           }
         }
      }else{
         { svelteHTML.createElement("div", {   "class":`empty`,"style":`padding: 1rem 0`,});       }
      }
     }
  } else if (showArchived){
     { svelteHTML.createElement("div", {   "class":`empty`,"style":`padding: 1rem 0`,});      }
  }
 }

if(undoMarkDone){
   { svelteHTML.createElement("div", {  "class":`undo-toast`,});__sveltets_2_ensureTransition(toastFly(svelteHTML.mapElementTag('div')));
     { svelteHTML.createElement("span", {}); undoMarkDone.title;  }
     { svelteHTML.createElement("button", {   "class":`undo-btn`,"on:click":undoLastMarkDone,});  }
   }
}

if(detailTask){
  detailTask._id + ':' + detailOpenSession; {
     { const $$_liateDdraC0C = __sveltets_2_ensureComponent(CardDetail); const $$_liateDdraC0 = new $$_liateDdraC0C({ target: __sveltets_2_any(), props: {         "task":detailTask,"project":detailProjectOverride ?? project,}});$$_liateDdraC0.$on("close", async () => { detailTask = null; detailProjectOverride = null; await reloadTasks(); });$$_liateDdraC0.$on("openRelated", (e) => openRelatedTask(e.detail));}
  }
}


};
return { props: {project: project , tasks: tasks} as {project: ProjectDoc, tasks: TaskDoc[]}, exports: {}, bindings: "", slots: {}, events: {} }}
const ListView__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type ListView__SvelteComponent_ = InstanceType<typeof ListView__SvelteComponent_>;
/*Ωignore_endΩ*/export default ListView__SvelteComponent_;