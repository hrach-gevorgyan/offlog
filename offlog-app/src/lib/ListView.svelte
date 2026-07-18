<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { toastFly } from './motion';
  import type { ProjectDoc, TaskDoc, CustomFieldDef } from './types';
  import { updateTask, unarchiveTask, getArchivedTasksForProject, getCustomFieldDefs } from './db';
  import { reloadTasks, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
  import { dueLabel, dueInk, filterTasks } from './utils';
  import CardDetail from './CardDetail.svelte';
  import PinStar from './PinStar.svelte';
  import FilterBar from './FilterBar.svelte';
  import CustomSelect from './CustomSelect.svelte';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];

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
  let showArchived = false;

  const colName = (id: string) => project.columns.find(c => c.id === id)?.name ?? '—';
  const lastColId = () => project.columns.at(-1)?.id ?? '';

  $: allTags = [...new Set(tasks.flatMap(t => t.tags))].sort();
  $: filtered = filterTasks(tasks, search, filterCol, filterPrio, filterTag);

  // ── Multi-column sort ──────────────────────────────────────────────────
  // Plain click sorts by that column alone (resets any prior multi-sort).
  // Shift-click adds it as a secondary/tertiary tiebreaker instead of
  // replacing the sort — the standard spreadsheet pattern. Pinned tasks
  // still float above everything else regardless of sort spec.
  type SortCol = 'title' | 'column' | 'priority' | 'due' | 'created' | 'updated' | 'source';
  let sortSpec: { col: SortCol; asc: boolean }[] = [{ col: 'due', asc: true }];

  function cmpOne(col: SortCol, a: TaskDoc, b: TaskDoc): number {
    if (col === 'title')    return a.title.localeCompare(b.title);
    if (col === 'column')   return colName(a.column_id).localeCompare(colName(b.column_id));
    if (col === 'priority') return b.priority - a.priority;
    if (col === 'due')      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    if (col === 'created')  return a.created_at.localeCompare(b.created_at);
    if (col === 'updated')  return a.updated_at.localeCompare(b.updated_at);
    if (col === 'source')   return a.source.localeCompare(b.source);
    return 0;
  }

  $: sorted = [...filtered].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    for (const { col, asc } of sortSpec) {
      const cmp = cmpOne(col, a, b);
      if (cmp !== 0) return asc ? cmp : -cmp;
    }
    return 0;
  });

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
  $: sortIcons = {
    title: sortIconFor('title', sortSpec),
    column: sortIconFor('column', sortSpec),
    priority: sortIconFor('priority', sortSpec),
    due: sortIconFor('due', sortSpec),
    created: sortIconFor('created', sortSpec),
    updated: sortIconFor('updated', sortSpec),
    source: sortIconFor('source', sortSpec),
  };

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

  let customFields: CustomFieldDef[] = [];
  function colLabel(key: ColKey): string { return COL_LABELS[key] ?? customFields.find(f => f.id === key)?.name ?? key; }
  function colWidth(key: ColKey): string { return COL_WIDTH[key] ?? '130px'; }
  function isCustomCol(key: ColKey): boolean { return key.startsWith('field:'); }

  let cols: Record<ColKey, boolean> = { status: true, priority: true, due: true, tags: true, created: false, updated: false, source: false };
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

  $: visibleOrder = colOrder.filter(k => cols[k]);

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
  // column-hiding tiers.
  $: gridTemplate = (selectionMode ? '20px ' : '') + '24px minmax(220px,max-content)' + visibleOrder.map(k => ` ${colWidth(k)}`).join('');

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
  $: bulkStatusOptions = [{ value: '', label: 'Move to status…' }, ...project.columns.map(col => ({ value: col.id, label: col.name }))];
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
  $: { const visible = new Set(sorted.map(t => t._id!)); const next = new Set([...selected].filter(id => visible.has(id))); if (next.size !== selected.size) selected = next; }

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
  // exists -- {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;
  function openDetail(task: TaskDoc) { detailOpenSession++; detailTask = task; }

  // B27 — loaded regardless of showArchived (not just while the section is
  // open) so the toggle button itself can carry a count badge; previously
  // the only way to know archived tasks existed was to open the toggle.
  let archivedTasksRaw: TaskDoc[] = [];
  $: getArchivedTasksForProject(project._id).then(t => { archivedTasksRaw = t; });
  // Same active search/status/priority/tag filters as the main list — the
  // archived section previously ignored them entirely, so narrowing the
  // main list did nothing to what showed up here.
  $: archivedTasks = filterTasks(archivedTasksRaw, search, filterCol, filterPrio, filterTag);

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
  // in the same write (db.ts's updateTask() -- one task object per
  // series, not a new card per completion) -- restoring only column_id
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
    try {
      await updateTask(task._id!, { column_id: lastColId() });
      await reloadTasks();
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
</script>

<svelte:window on:click={onWindowClick} />

<div class="list-wrap">
  <!-- Toolbar + grid share one outer panel (single border/radius). The
       toolbar is one guaranteed-single-row strip at every viewport width:
       a flexible search box plus three fixed-size icon buttons (Filters /
       Archived / Columns). All filter controls (status, tag, priority,
       saved filters) live inside the Filters popover rather than inline —
       inline controls could never be made to fit one row on a phone
       without wrapping or horizontal scrolling, both explicitly rejected.
       The funnel button carries a count badge so active filters stay
       visible even though the controls themselves are collapsed. -->
  <div class="list-panel">
  <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/>
        </svg>
        <input class="search-input" bind:value={search} placeholder="Search tasks…" />
        {#if search}<button class="clear-x" on:click={() => search = ''}>×</button>{/if}
      </div>

    <div class="toolbar-actions">
      <FilterBar {project} {allTags} bind:search bind:filterCol bind:filterPrio bind:filterTag />

      <button class="action-btn" class:active={showArchived} on:click={() => showArchived = !showArchived} aria-label="Show archived tasks ({archivedTasksRaw.length})" title="Show archived tasks">
        <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="1" width="12" height="3" rx="1"/><path d="M2 4v8a1 1 0 001 1h8a1 1 0 001-1V4"/><line x1="5" y1="7" x2="9" y2="7"/>
        </svg>
        <span class="action-label">Archived{#if archivedTasksRaw.length > 0} · {archivedTasksRaw.length}{/if}</span>
      </button>

      <div class="col-menu-wrap">
        <button class="action-btn" class:active={showColMenu || selectionMode} on:click={openColMenu} aria-label="Select rows or show/hide columns" title="Select rows / show-hide columns">
          <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="3" x2="3" y2="11"/><line x1="7" y1="3" x2="7" y2="11"/><line x1="11" y1="3" x2="11" y2="11"/>
          </svg>
          <span class="action-label">Select</span>
        </button>
        {#if showColMenu}
          <!-- position:fixed (not the shared .col-menu's default absolute)
               since .list-panel has overflow:hidden to clip its rounded
               corners — an absolutely-positioned popover gets clipped by
               that same rule once its content is tall enough (e.g. several
               custom-field columns), even though it visually "should"
               float above everything. Fixed + JS-computed coordinates
               escapes that ancestor clipping entirely. -->
          <div class="col-menu col-menu--fixed" style="top:{colMenuPos.top}px; left:{colMenuPos.left}px;">
            <label class="col-menu-item select-rows-item">
              Select rows
              <button class="toggle-mini" class:on={selectionMode} on:click={toggleSelectionMode} role="switch" aria-checked={selectionMode} aria-label="Toggle row selection">
                <span class="toggle-mini-knob"></span>
              </button>
            </label>
            <div class="menu-divider"></div>
            {#each colOrder as key (key)}
              <label class="col-menu-item">
                <input type="checkbox" checked={cols[key]} on:change={() => toggleCol(key)} />
                {colLabel(key)}
              </label>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if selectionMode}
    <div class="bulk-bar">
      <span class="bulk-count">{selected.size} selected</span>
      <div class="bulk-sel-wrap">
        <CustomSelect options={bulkStatusOptions} bind:value={bulkStatus} on:change={bulkMoveStatus} disabled={bulkBusy || !selected.size} />
      </div>
      <div class="bulk-sel-wrap">
        <CustomSelect options={bulkPriorityOptions} bind:value={bulkPriorityStr} on:change={bulkChangePriority} disabled={bulkBusy || !selected.size} />
      </div>
      <input class="bulk-input" bind:value={bulkTagAdd} placeholder="Add tag…" on:keydown={(e) => e.key === 'Enter' && bulkAddTag()} disabled={bulkBusy || !selected.size} />
      <button class="bulk-btn" on:click={bulkAddTag} disabled={bulkBusy || !selected.size || !bulkTagAdd.trim()}>Add tag</button>
      <button class="bulk-btn bulk-clear" on:click={toggleSelectionMode} disabled={bulkBusy}>Done</button>
    </div>
  {/if}

  <!-- Data grid -->
  <div class="grid-scroll">
    <div class="grid-card grid-card--flush">
      <div class="grid-head" style="grid-template-columns:{gridTemplate}">
        {#if selectionMode}
          {@const allSelected = sorted.length > 0 && selected.size === sorted.length}
          <button
            class="row-check head-check"
            class:checked={allSelected}
            role="checkbox"
            aria-checked={allSelected}
            aria-label="Select all visible tasks"
            on:click={() => { selected = allSelected ? new Set() : new Set(sorted.map(t => t._id!)); }}
          >
            {#if allSelected}<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="var(--on-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6.5 5,9.5 10,3"/></svg>{/if}
          </button>
        {/if}
        <span class="head-spacer"></span>
        <button class="th-btn" title="Click to sort. Shift+click to add as a secondary sort." on:click={(e) => toggleSort('title', e.shiftKey)}>Title <span class="sort-icon">{sortIcons.title}</span></button>
        {#each visibleOrder as key (key)}
          {@const sortKey = isCustomCol(key) || key === 'tags' ? null : (key === 'status' ? 'column' : key) as SortCol | null}
          <button
            class="th-btn"
            class:drag-over-left={dragOverCol === key && dragOverSide === 'left'}
            class:drag-over-right={dragOverCol === key && dragOverSide === 'right'}
            class:dragging={dragCol === key}
            draggable="true"
            on:dragstart={() => onColDragStart(key)}
            on:dragover={(e) => { e.preventDefault(); onColDragOver(e, key); }}
            on:dragleave={() => onColDragLeave(key)}
            on:drop={() => onColDrop(key)}
            on:dragend={onColDragEnd}
            on:click={(e) => sortKey && toggleSort(sortKey, e.shiftKey)}
            title={sortKey ? 'Drag to reorder. Click to sort. Shift+click to add as a secondary sort.' : 'Drag to reorder. Not sortable.'}
          >
            {colLabel(key)}
            {#if sortKey}<span class="sort-icon">{sortIcons[sortKey]}</span>{/if}
          </button>
        {/each}
      </div>

      {#each sorted as task (task._id)}
        <div
          class="grid-row"
          class:row-selected={selected.has(task._id!)}
          style="--prio-color:{PRIO_COLOR[task.priority]}; grid-template-columns:{gridTemplate}"
          role="button"
          tabindex="0"
          on:click={() => selectionMode ? toggleRowSelect(task._id!) : openDetail(task)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectionMode ? toggleRowSelect(task._id!) : openDetail(task); } }}
          transition:slide={{ duration: 160 }}
          animate:flip={{ duration: 200, easing: cubicOut }}
        >
          {#if selectionMode}
            <button
              class="row-check"
              class:checked={selected.has(task._id!)}
              role="checkbox"
              aria-checked={selected.has(task._id!)}
              aria-label="Select {task.title}"
              on:click|stopPropagation={() => toggleRowSelect(task._id!)}
            >
              {#if selected.has(task._id!)}<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="var(--on-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6.5 5,9.5 10,3"/></svg>{/if}
            </button>
          {/if}
          <button
            class="circle"
            class:done={task.column_id === lastColId()}
            title="Move to last status"
            aria-label="Move to last status"
            on:click|stopPropagation={() => markDone(task)}
          ></button>
          <span class="cell-title">
            {task.title}{#if task.pinned}<span class="pin-mark"><PinStar size={10} /></span>{/if}
            {#if task.recurrence}
              <span class="recur-mark" title="Repeats {task.recurrence}">
                <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7a5 5 0 0 1 8.5-3.5M12 2v3h-3"/><path d="M12 7a5 5 0 0 1-8.5 3.5M2 12V9h3"/></svg>
              </span>
            {/if}
            {#if task.checklist?.length}
              <span class="checklist-mark" class:complete={task.checklist.every(i => i.done)}>☑ {task.checklist.filter(i => i.done).length}/{task.checklist.length}</span>
            {/if}
          </span>
          {#each visibleOrder as key (key)}
            {#if key === 'status'}
              <span class="cell-status">{colName(task.column_id)}</span>
            {:else if key === 'priority'}
              <span class="cell-prio">
                <span class="prio-dot" style="background:{PRIO_COLOR[task.priority]}"></span>
                {PRIO_LABEL[task.priority]}
              </span>
            {:else if key === 'due'}
              <span class="cell-due" style="color:{dueInk(task.due_date)}">{dueLabel(task.due_date, '—')}</span>
            {:else if key === 'tags'}
              <span class="cell-tags">
                {#each task.tags as tag}<span class="tag">{tag}</span>{/each}
              </span>
            {:else if key === 'created'}
              <span class="cell-date">{fmtDate(task.created_at)}</span>
            {:else if key === 'updated'}
              <span class="cell-date">{fmtDate(task.updated_at)}</span>
            {:else if key === 'source'}
              <span class="cell-date">{task.source}</span>
            {:else if isCustomCol(key)}
              <span class="cell-date">{task.custom_values?.[key] ?? '—'}</span>
            {/if}
          {/each}
        </div>
      {/each}

      {#if sorted.length === 0}
        <div class="empty">
          {#if activeFilters > 0}No tasks match the current filters.{:else}No tasks yet — add one from the kanban view.{/if}
        </div>
      {/if}
    </div>
  </div>
  </div>

  {#if showArchived && archivedTasksRaw.length > 0}
    <div class="archived-section">
      <div class="archived-label">Archived ({archivedTasks.length}{archivedTasks.length !== archivedTasksRaw.length ? ` of ${archivedTasksRaw.length}` : ''})</div>
      {#if archivedTasks.length > 0}
        <div class="grid-scroll">
          <div class="grid-card">
            {#each archivedTasks as task (task._id)}
              <div class="archived-row" style="--prio-color:{PRIO_COLOR[task.priority]}">
                <span class="archived-title">{task.title}</span>
                <span class="cell-status">{colName(task.column_id)}</span>
                <button class="unarchive-btn" on:click={async () => {
                  try {
                    await unarchiveTask(task._id!);
                    await reloadTasks();
                    archivedTasksRaw = await getArchivedTasksForProject(project._id);
                  } catch {
                    showError('Failed to restore task. Please try again.');
                  }
                }}>Restore</button>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="empty" style="padding: 1rem 0">No archived tasks match the current filters.</div>
      {/if}
    </div>
  {:else if showArchived}
    <div class="empty" style="padding: 1rem 0">No archived tasks in this project.</div>
  {/if}
</div>

{#if undoMarkDone}
  <div class="undo-toast" transition:toastFly>
    <span>Marked "{undoMarkDone.title}" done</span>
    <button class="undo-btn" on:click={undoLastMarkDone}>Undo</button>
  </div>
{/if}

{#if detailTask}
  {#key detailTask._id + ':' + detailOpenSession}
    <CardDetail
      task={detailTask}
      {project}
      on:close={async () => { detailTask = null; await reloadTasks(); }}
    />
  {/key}
{/if}

<style>
  .list-wrap { flex: 1; overflow-y: auto; padding: 20px 28px; }

  /* ── List panel — toolbar + grid share one outer border/radius so they
     read as a single structured surface instead of two floating cards ── */
  .list-panel {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 13px; overflow: hidden; margin-bottom: 20px;
  }
  /* One row, guaranteed, at every viewport width — no wrapping, no
     horizontal scrolling, no breakpoints (owner requirement after several
     failed wrap/scroll attempts). This only works because the row's
     content is minimal by construction: a shrinkable search box + three
     fixed-size icon buttons ≈ 220px minimum, which fits even a 320px
     phone. Everything else lives inside the Filters popover — don't add
     inline controls back into this row without re-checking that math. */
  .toolbar {
    position: relative;
    display: flex; flex-wrap: nowrap; align-items: center; gap: 8px;
    border-bottom: 1px solid var(--border); padding: 10px 14px;
  }
  .toolbar-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; flex-shrink: 0; }

  .search-box {
    display: flex; align-items: center; gap: 7px;
    background: var(--bg); border: 1px solid var(--border-strong);
    border-radius: 8px; padding: 6px 10px;
    flex: 1 1 auto; min-width: 110px; max-width: 280px;
  }
  .search-box svg { color: var(--faint); flex-shrink: 0; }
  .search-input {
    border: none; background: none; font-size: 13px; color: var(--text);
    width: 100%; outline: none; min-width: 0;
  }
  .search-input::placeholder { color: var(--faint); }
  .clear-x {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 14px; padding: 0; line-height: 1;
    flex-shrink: 0;
  }
  .clear-x:hover { color: var(--text); }

  /* ── Icon-only action group (Filters/Archived/Columns) — fixed-size at
     every resolution, tooltips + aria-labels carry the names ── */
  .toolbar-actions { background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; padding: 3px; }
  .col-menu-wrap { position: relative; }
  .action-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    background: none; border: none; border-radius: 6px;
    color: var(--muted); font-size: 11.5px; font-weight: 500;
    padding: 7px 9px; cursor: pointer; white-space: nowrap;
    transition: color .12s, background .12s;
  }
  .action-btn:hover { color: var(--text); background: var(--hover, var(--surface)); }
  .action-btn.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }

  .menu-divider { height: 1px; background: var(--border); margin: 8px -6px 0; }
  .col-menu {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 20;
    background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 6px; min-width: 150px;
    display: flex; flex-direction: column; gap: 2px;
    max-height: min(70vh, 420px); overflow-y: auto;
  }
  .col-menu--fixed { position: fixed; right: auto; z-index: 210; width: 190px; }
  .col-menu-item {
    display: flex; align-items: center; gap: 8px;
    padding: .35rem .5rem; border-radius: 6px; font-size: .82rem; color: var(--text); cursor: pointer;
  }
  .col-menu-item:hover { background: var(--hover); }
  .select-rows-item { justify-content: space-between; cursor: default; }
  .select-rows-item:hover { background: none; }

  .toggle-mini {
    width: 30px; height: 17px; border-radius: 9px; border: none; cursor: pointer;
    background: var(--border-strong); position: relative; transition: background .2s;
    flex-shrink: 0; padding: 0;
  }
  .toggle-mini.on { background: var(--accent); }
  .toggle-mini-knob {
    position: absolute; top: 2px; left: 2px;
    width: 13px; height: 13px; border-radius: 50%;
    background: #ffffff; transition: left .2s; box-shadow: 0 1px 2px rgba(0,0,0,.2);
  }
  .toggle-mini.on .toggle-mini-knob { left: 15px; }

  /* ── Data grid ───────────────────────────────────────────────────────── */
  /* Horizontal scroll instead of hiding/truncating columns (B36): the grid
     card sizes to its natural content width (`width: max-content` on head/
     row) and this wrapper scrolls once that's wider than the *actual*
     available space — no artificial max-width here. An earlier version
     capped this at 1080px, which forced a scrollbar even when there was
     plenty of empty space to the right (title uses `max-content`, not
     `1fr`, so it never stretches to fill that space on its own — the cap
     was solving a problem that no longer exists with that column gone).
     Nothing in the grid ever ellipsizes — see .cell-title/.cell-status
     below, both plain `white-space: nowrap` with no text-overflow. */
  .grid-scroll {
    overflow-x: auto;
    /* Scroll-shadow affordance (CSS-only) — see KanbanBoard.svelte's .board
       for the same technique; --surface here since .grid-card (the only
       child) is surface-colored, not page background. */
    background:
      linear-gradient(to right, var(--surface) 30%, transparent) 0 0,
      linear-gradient(to left, var(--surface) 30%, transparent) 100% 0,
      linear-gradient(to right, rgba(0,0,0,.1), transparent) 0 0,
      linear-gradient(to left, rgba(0,0,0,.1), transparent) 100% 0;
    background-repeat: no-repeat;
    background-size: 40px 100%, 40px 100%, 14px 100%, 14px 100%;
    background-attachment: local, local, scroll, scroll;
  }

  .grid-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 13px;
    overflow: hidden; width: max-content; min-width: 100%;
  }
  /* Nested inside .list-panel (the main grid) — panel already provides
     the border/radius/background, so the grid itself stays flush. */
  .grid-card--flush {
    background: none; border: none; border-radius: 0;
  }

  .grid-head, .grid-row {
    display: grid;
    gap: 14px; align-items: center;
  }

  .grid-head {
    padding: 0 16px;
    background: var(--col-bg); border-bottom: 1px solid var(--border);
    border-left: 3px solid transparent;
  }
  .head-spacer { width: 24px; }
  .th-btn {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--faint); text-align: left;
    background: none; border: none; cursor: grab; padding: 11px 0;
    display: flex; align-items: center; gap: 5px; transition: color .12s;
  }
  .th-btn:hover { color: var(--text); }
  .th-btn:active { cursor: grabbing; }
  .th-btn.dragging { opacity: .4; }
  /* Insertion-side indicator while dragging a column over another header —
     a colored edge shows whether dropping now would place the dragged
     column to the left or right of this one. */
  .th-btn.drag-over-left { box-shadow: inset 3px 0 0 var(--accent); }
  .th-btn.drag-over-right { box-shadow: inset -3px 0 0 var(--accent); }
  .sort-icon { font-size: 10px; opacity: .6; }

  .grid-row {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--prio-color, var(--border));
    cursor: pointer; transition: background .1s;
  }
  .grid-row:last-child { border-bottom: none; }
  .grid-row:hover { background: var(--hover); }
  .grid-row.row-selected { background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }

  .row-check {
    width: 16px; height: 16px; padding: 0; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    border-radius: 5px; border: 1.6px solid var(--border-strong);
    background: var(--surface); transition: border-color .12s, background .12s;
  }
  .row-check:hover { border-color: var(--accent); }
  .row-check.checked { background: var(--accent); border-color: var(--accent); }
  .head-check { margin: 0; }

  .bulk-bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    padding: 10px 14px; margin-bottom: 8px;
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
    border: 1px solid var(--accent); border-radius: var(--radius-sm, 8px);
  }
  .bulk-count { font-size: 12.5px; font-weight: 600; color: var(--accent); margin-right: 4px; }
  .bulk-sel-wrap { width: 150px; }
  .bulk-input {
    border: 1px solid var(--border-strong); border-radius: 6px;
    background: var(--surface); color: var(--text);
    font-size: 12.5px; padding: 5px 8px;
    width: 130px;
  }
  .bulk-btn {
    border: 1px solid var(--border-strong); border-radius: 6px;
    background: var(--surface); color: var(--text);
    font-size: 12.5px; font-weight: 500; padding: 5px 10px; cursor: pointer;
    transition: background .12s;
  }
  .bulk-btn:hover { background: var(--hover); }
  .bulk-btn:disabled { opacity: .5; cursor: not-allowed; }
  .bulk-clear { margin-left: auto; }

  .circle {
    width: 19px; height: 19px; border-radius: 50%;
    background: none; padding: 0;
    border: 1.6px solid var(--border-strong); flex-shrink: 0; cursor: pointer;
    transition: border-color .12s, background .12s; display: block;
  }
  .circle:hover { border-color: var(--accent); }
  .circle.done { background: var(--success); border-color: var(--success); }

  /* No truncation, anywhere in the grid (B36) — plain nowrap, never
     text-overflow: ellipsis. Long content makes the row (and the whole
     grid, via .grid-scroll) wider instead of hiding characters. */
  .cell-title { font-size: 14px; font-weight: 500; color: var(--text); white-space: nowrap; }
  .pin-mark { display: inline-flex; align-items: center; color: var(--accent); opacity: .8; vertical-align: middle; margin-left: 4px; }
  .recur-mark { display: inline-flex; align-items: center; color: var(--muted); opacity: .75; vertical-align: middle; margin-left: 4px; }
  .checklist-mark {
    display: inline-block; font-family: var(--mono); font-size: 10.5px; font-weight: 500;
    color: var(--muted); background: var(--col-bg); padding: 1px 6px; border-radius: 6px;
    margin-left: 6px; vertical-align: middle;
  }
  .checklist-mark.complete { color: var(--success); }

  .cell-status { color: var(--muted); font-size: 12.5px; white-space: nowrap; }
  .cell-prio { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 12.5px; white-space: nowrap; }
  .prio-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .cell-due { font-family: var(--mono); font-size: 11.5px; white-space: nowrap; }
  .cell-date { font-family: var(--mono); font-size: 11px; color: var(--faint); white-space: nowrap; text-transform: capitalize; }

  .cell-tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    font-size: 11px; color: var(--muted); background: var(--col-bg);
    padding: 2px 8px; border-radius: 6px; white-space: nowrap;
  }

  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }

  /* ── Archived ────────────────────────────────────────────────────────── */
  .archived-section { padding: 16px 0 0; }
  .archived-label {
    font-family: var(--mono); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .08em; color: var(--faint); font-weight: 700;
    padding: 0 4px 8px;
  }
  .archived-row {
    display: flex; align-items: center; gap: 13px;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--prio-color, var(--border));
    opacity: .6;
  }
  .archived-row:last-child { border-bottom: none; }
  .archived-row:hover { opacity: .85; background: var(--hover); }
  .archived-title { flex: 1; min-width: 0; text-decoration: line-through; color: var(--muted); font-size: 14px; white-space: nowrap; }
  .unarchive-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px;
    color: var(--muted); font-size: 11px; padding: 3px 8px; cursor: pointer;
    white-space: nowrap; flex-shrink: 0; transition: color .12s, border-color .12s;
  }
  .unarchive-btn:hover { color: var(--accent); border-color: var(--accent); }

  /* ── Undo toast (A22) — matches App.svelte's delete-undo toast ───────── */
  .undo-toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px; z-index: 999;
    background: var(--text); color: var(--bg);
    padding: 11px 14px; border-radius: 10px;
    font-size: 13.5px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,.25);
    white-space: nowrap;
  }
  .undo-btn {
    background: var(--accent); color: var(--on-accent); border: none; cursor: pointer;
    padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;
    transition: opacity .12s;
  }
  .undo-btn:hover { opacity: .85; }

  @media (max-width: 768px) {
    .list-wrap { padding: 14px 14px; }
    .search-box { max-width: 100%; }
    /* Icon-only actions on phones — with labels the row's minimum width
       wouldn't be guaranteed to fit a 320px screen; icons + tooltips/
       aria-labels are. This is the only thing that changes between
       desktop and mobile: still the same single row. */
    .action-label { display: none; }
  }
</style>
