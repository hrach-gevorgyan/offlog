<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ProjectDoc, TaskDoc } from './types';
  import { createTask, updateTask, posBetween, addColumn, renameColumn, reorderColumns, removeColumn, archiveColumnTasks } from './db';
  import { reloadTasks, showError } from './store';
  import { confirmAction } from './confirm';
  import CardDetail from './CardDetail.svelte';
  import PinStar from './PinStar.svelte';
  import { filterTasks } from './utils';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];
  // B2 — the actual Filters button/popover lives in App.svelte's shared
  // board-header now (a dedicated toolbar row for just one button wasted
  // space, owner feedback) — these four are owned there and passed down,
  // filtering which cards render per column without touching `tasks`
  // itself (drag/drop, quick-add, etc. below all still operate on the
  // full set).
  export let search = '';
  export let filterCol = '';
  export let filterPrio = 0;
  export let filterTag = '';

  const dispatch = createEventDispatcher();

  function sortTasks(ts: TaskDoc[]) {
    return [...ts].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return a.position - b.position;
    });
  }

  $: visibleTasks = filterTasks(tasks, search, filterCol, filterPrio, filterTag);

  $: tasksByCol = Object.fromEntries(
    project.columns.map(col => [
      col.id,
      sortTasks(visibleTasks.filter(t => t.column_id === col.id)),
    ])
  );

  // ── Quick add ──────────────────────────────────────────────────────────────
  let quickAddCol: string | null = null;
  let quickAddTitle = '';

  async function quickAdd(colId: string) {
    const t = quickAddTitle.trim();
    if (!t) { quickAddCol = null; return; }
    try {
      await createTask(project._id, project.space_id, colId, t);
      await reloadTasks();
      quickAddTitle = '';
      quickAddCol = null;
    } catch {
      showError('Failed to add task. Please try again.');
    }
  }

  // ── Card drag ──────────────────────────────────────────────────────────────
  let dragTask: TaskDoc | null = null;
  let dragOverColId: string | null = null;
  let dragOverIndex: number | null = null;   // insert-before index within column

  function onCardDragStart(e: DragEvent, task: TaskDoc) {
    dragTask = task;
    (e.dataTransfer as DataTransfer).effectAllowed = 'move';
    e.stopPropagation();   // don't let column header's drag fire
  }

  function onCardListDragOver(e: DragEvent, colId: string) {
    if (!dragTask) return;
    e.preventDefault();
    e.stopPropagation();
    dragOverColId = colId;
    dragOverIndex = null;  // drop at end
  }

  function onCardDragOver(e: DragEvent, colId: string, idx: number) {
    if (!dragTask) return;
    e.preventDefault();
    e.stopPropagation();
    dragOverColId = colId;
    dragOverIndex = idx;
  }

  async function onCardListDrop(e: DragEvent, colId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragTask) return;

    const colTasks = tasksByCol[colId] ?? [];

    let newPos: number;
    if (dragOverIndex === null) {
      // drop at end
      const last = colTasks.at(-1);
      newPos = last ? last.position + 1024 : 1024;
    } else {
      // insert before dragOverIndex
      const before = dragOverIndex > 0 ? colTasks[dragOverIndex - 1]?.position ?? null : null;
      const after  = colTasks[dragOverIndex]?.position ?? null;
      newPos = posBetween(before, after);
    }

    try {
      await updateTask(dragTask._id!, { column_id: colId, position: newPos });
      await reloadTasks();
    } catch {
      showError('Failed to move task. Please try again.');
    }
    dragTask = null;
    dragOverColId = null;
    dragOverIndex = null;
  }

  function onCardDragEnd() {
    dragTask = null;
    dragOverColId = null;
    dragOverIndex = null;
  }

  // ── Card detail ────────────────────────────────────────────────────────────
  let detailTask: TaskDoc | null = null;

  // ── Column drag (reorder) ──────────────────────────────────────────────────
  let dragCol: string | null = null;
  let dragOverCol: string | null = null;

  function onColHeaderDragStart(e: DragEvent, colId: string) {
    dragCol = colId;
    (e.dataTransfer as DataTransfer).effectAllowed = 'move';
  }

  function onColDragOver(e: DragEvent, colId: string) {
    if (!dragCol || dragCol === colId) return;
    e.preventDefault();
    dragOverCol = colId;
  }

  async function onColDrop(e: DragEvent, targetColId: string) {
    e.preventDefault();
    if (!dragCol || dragCol === targetColId) return;
    const cols = [...project.columns];
    const fromIdx = cols.findIndex(c => c.id === dragCol);
    const toIdx   = cols.findIndex(c => c.id === targetColId);
    const [moved] = cols.splice(fromIdx, 1);
    cols.splice(toIdx, 0, moved);
    try {
      const updated = await reorderColumns(project._id, cols);
      project = updated;
      dispatch('projectUpdated', updated);
    } catch {
      showError('Failed to reorder statuses. Please try again.');
    }
    dragCol = null;
    dragOverCol = null;
  }

  // ── Column editor ──────────────────────────────────────────────────────────
  let editingColId: string | null = null;
  let editingColName = '';
  let newColName = '';
  let addingCol = false;

  async function saveColRename(colId: string) {
    const name = editingColName.trim();
    if (name) {
      try {
        const updated = await renameColumn(project._id, colId, name);
        project = updated;
        dispatch('projectUpdated', updated);
      } catch {
        showError('Failed to rename status. Please try again.');
      }
    }
    editingColId = null;
  }

  async function doAddCol() {
    const name = newColName.trim();
    if (!name) { addingCol = false; return; }
    try {
      const updated = await addColumn(project._id, name);
      project = updated;
      dispatch('projectUpdated', updated);
      newColName = '';
    } catch {
      showError('Failed to add status. Please try again.');
    }
    addingCol = false;
  }

  async function doRemoveCol(colId: string) {
    const colTasks = tasksByCol[colId] ?? [];
    const msg = colTasks.length
      ? `Remove column? ${colTasks.length} card(s) will move to the first column.`
      : 'Remove this column?';
    if (!(await confirmAction(msg.replace('column', 'status'), { danger: true, confirmLabel: 'Remove' }))) return;
    try {
      const updated = await removeColumn(project._id, colId);
      project = updated;
      dispatch('projectUpdated', updated);
      await reloadTasks();
    } catch (e: any) {
      showError(e?.message ?? 'Failed to remove status. Please try again.');
    }
  }

  import { PRIORITY_COLOR, PRIORITY_LABEL_SHORT as PRIORITY_LABEL } from './constants';

  // ── Touch drag ─────────────────────────────────────────────────────────────
  let touchTask: TaskDoc | null = null;
  let touchGhost: HTMLElement | null = null;
  let touchOffX = 0, touchOffY = 0;

  function onTouchStart(e: TouchEvent, task: TaskDoc, el: HTMLElement) {
    touchTask = task;
    dragTask = task;
    const touch = e.touches[0];
    const rect = el.getBoundingClientRect();
    touchOffX = touch.clientX - rect.left;
    touchOffY = touch.clientY - rect.top;
    touchGhost = el.cloneNode(true) as HTMLElement;
    touchGhost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;width:${rect.width}px;opacity:.8;box-shadow:0 8px 24px rgba(0,0,0,.18);border-radius:12px;left:${rect.left}px;top:${rect.top}px;transition:none;transform:rotate(1.5deg);`;
    document.body.appendChild(touchGhost);
  }

  function onTouchMove(e: TouchEvent) {
    if (!touchTask || !touchGhost) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchGhost.style.left = (touch.clientX - touchOffX) + 'px';
    touchGhost.style.top  = (touch.clientY - touchOffY) + 'px';
    touchGhost.style.display = 'none';
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    touchGhost.style.display = '';
    if (!target) return;
    const cardEl  = target.closest('[data-task-idx]') as HTMLElement | null;
    const listEl  = target.closest('[data-col-id]')  as HTMLElement | null;
    if (cardEl && listEl) {
      dragOverColId  = listEl.getAttribute('data-col-id');
      dragOverIndex  = parseInt(cardEl.getAttribute('data-task-idx') ?? '0');
    } else if (listEl) {
      dragOverColId  = listEl.getAttribute('data-col-id');
      dragOverIndex  = null;
    }
  }

  async function onTouchEnd() {
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    if (!touchTask) return;
    const colId = dragOverColId;
    if (colId) {
      const colTasks = tasksByCol[colId] ?? [];
      let newPos: number;
      if (dragOverIndex === null) {
        const last = colTasks.at(-1);
        newPos = last ? last.position + 1024 : 1024;
      } else {
        const before = dragOverIndex > 0 ? colTasks[dragOverIndex - 1]?.position ?? null : null;
        const after  = colTasks[dragOverIndex]?.position ?? null;
        newPos = posBetween(before, after);
      }
      try {
        await updateTask(touchTask._id!, { column_id: colId, position: newPos });
        await reloadTasks();
      } catch {
        showError('Failed to move task. Please try again.');
      }
    }
    touchTask = null;
    dragTask = null;
    dragOverColId = null;
    dragOverIndex = null;
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="board" on:touchmove|nonpassive={onTouchMove} on:touchend={onTouchEnd}>
  {#each project.columns as col (col.id)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="column"
      class:col-drag-over={dragOverCol === col.id}
      on:dragover={(e) => onColDragOver(e, col.id)}
      on:drop={(e) => onColDrop(e, col.id)}
      on:dragend={() => { dragCol = null; dragOverCol = null; }}
    >
      <!-- Column header — this is the drag handle for reordering columns -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="col-header"
        draggable="true"
        on:dragstart={(e) => onColHeaderDragStart(e, col.id)}
      >
        {#if editingColId === col.id}
          <!-- svelte-ignore a11y-autofocus -->
          <input
            class="col-name-input"
            autofocus
            bind:value={editingColName}
            on:blur={() => saveColRename(col.id)}
            on:keydown={(e) => { if (e.key === 'Enter') saveColRename(col.id); if (e.key === 'Escape') editingColId = null; }}
          />
        {:else}
          <span class="col-name">{col.name}</span>
          <button class="col-rename" title="Rename status" aria-label="Rename status" on:click|stopPropagation={() => { editingColId = col.id; editingColName = col.name; }}>
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z"/>
            </svg>
          </button>
        {/if}
        <span class="col-count">{tasksByCol[col.id]?.length ?? 0}</span>
        {#if (tasksByCol[col.id]?.length ?? 0) > 0}
          <button class="col-archive" title="Archive all tasks in this status" on:click={async () => {
            if (!(await confirmAction(`Archive all ${tasksByCol[col.id]?.length} tasks in "${col.name}"?`, { confirmLabel: 'Archive' }))) return;
            try {
              await archiveColumnTasks(project._id, col.id);
              await reloadTasks();
            } catch {
              showError('Failed to archive tasks. Please try again.');
            }
          }}>
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="1" width="12" height="3" rx="1"/><path d="M2 4v8a1 1 0 001 1h8a1 1 0 001-1V4"/><line x1="5" y1="7" x2="9" y2="7"/>
            </svg>
          </button>
        {/if}
        <button class="col-remove" on:click={() => doRemoveCol(col.id)} title="Remove status">×</button>
      </div>

      <!-- Card list — drop zone for cards -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="card-list"
        data-col-id={col.id}
        class:cards-drag-over={dragOverColId === col.id && dragOverIndex === null}
        on:dragover={(e) => onCardListDragOver(e, col.id)}
        on:drop={(e) => onCardListDrop(e, col.id)}
      >
        {#each tasksByCol[col.id] ?? [] as task, idx (task._id)}
          <div
            class="card"
            data-task-idx={idx}
            class:dragging={dragTask?._id === task._id}
            class:insert-before={dragOverColId === col.id && dragOverIndex === idx}
            style="--prio-color:{PRIORITY_COLOR[task.priority]}"
            draggable="true"
            role="button"
            tabindex="0"
            on:dragstart={(e) => onCardDragStart(e, task)}
            on:dragover={(e) => onCardDragOver(e, col.id, idx)}
            on:drop={(e) => onCardListDrop(e, col.id)}
            on:dragend={onCardDragEnd}
            on:touchstart|nonpassive={(e) => onTouchStart(e, task, e.currentTarget)}
            on:click={() => { if (!touchGhost) detailTask = task; }}
            on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detailTask = task; } }}
          >
            <div class="card-top">
              <span class="card-title">{task.title}</span>
              {#if task.pinned}<span class="card-pin" title="Pinned"><PinStar size={11} /></span>{/if}
            </div>
            <div class="card-meta">
              {#if task.checklist?.length}
                <span class="checklist-badge" class:complete={task.checklist.every(i => i.done)}>
                  ☑ {task.checklist.filter(i => i.done).length}/{task.checklist.length}
                </span>
              {/if}
              {#if task.due_date}
                <span class="due-badge" class:overdue={task.due_date < new Date().toISOString().slice(0,10)}>
                  {task.due_date}
                </span>
              {/if}
            </div>
          </div>
        {/each}

        {#if quickAddCol === col.id}
          <!-- svelte-ignore a11y-autofocus -->
          <div class="quick-add-form">
            <input
              autofocus
              class="quick-input"
              bind:value={quickAddTitle}
              placeholder="Task title…"
              enterkeyhint="done"
              on:keydown={(e) => { if (e.key === 'Enter') quickAdd(col.id); if (e.key === 'Escape') quickAddCol = null; }}
            />
            <div class="quick-add-actions">
              <button class="add-btn" on:click={() => quickAdd(col.id)}>Add</button>
              <button on:click={() => quickAddCol = null}>Cancel</button>
            </div>
          </div>
        {:else}
          <button class="add-card-btn" on:click={() => quickAddCol = col.id}>+ Add card</button>
        {/if}
      </div>
    </div>
  {/each}

  <!-- Add column -->
  <div class="add-col-area">
    {#if addingCol}
      <div class="add-col-form">
        <!-- svelte-ignore a11y-autofocus -->
        <input
          autofocus
          class="col-name-input"
          bind:value={newColName}
          placeholder="Status name…"
          on:keydown={(e) => { if (e.key === 'Enter') doAddCol(); if (e.key === 'Escape') addingCol = false; }}
        />
        <div class="quick-add-actions">
          <button class="add-btn" on:click={doAddCol}>Add</button>
          <button on:click={() => addingCol = false}>Cancel</button>
        </div>
      </div>
    {:else}
      <button class="add-col-btn" on:click={() => { addingCol = true; newColName = ''; }}>+ Status</button>
    {/if}
  </div>
</div>

{#if detailTask}
  <!-- A30 — {#key} forces a full remount if `task` ever changes to a
       different task while still open, so CardDetail's per-task `let`
       state (collapsible-section flags, etc.) can't carry over stale from
       a previous task instead of re-deriving. -->
  {#key detailTask._id}
    <CardDetail
      task={detailTask}
      {project}
      on:close={async () => { detailTask = null; await reloadTasks(); }}
    />
  {/key}
{/if}

<style>
  .board {
    display: flex;
    gap: 1rem;
    padding: 1.5rem 1.75rem;
    overflow-x: auto;
    align-items: flex-start;
    min-height: 0;
    flex: 1;
    -webkit-overflow-scrolling: touch;
    /* Scroll-shadow affordance (CSS-only, no JS): "local" layers scroll with
       content and cover the shadow once you've scrolled past it; "scroll"
       layers stay fixed to the viewport and only show at an edge that still
       has more content to reveal. */
    background:
      linear-gradient(to right, var(--bg) 30%, transparent) 0 0,
      linear-gradient(to left, var(--bg) 30%, transparent) 100% 0,
      linear-gradient(to right, rgba(0,0,0,.1), transparent) 0 0,
      linear-gradient(to left, rgba(0,0,0,.1), transparent) 100% 0;
    background-repeat: no-repeat;
    background-color: var(--bg);
    background-size: 40px 100%, 40px 100%, 14px 100%, 14px 100%;
    background-attachment: local, local, scroll, scroll;
  }
  @media (max-width: 768px) {
    .board { padding: 1rem; gap: .75rem; }
    .column { width: 260px; }
    /* These are hover-revealed on desktop, but touch has no hover state —
       without this they're effectively undiscoverable on mobile. */
    .col-rename, .col-archive, .col-remove { opacity: .55; }
  }
  .column {
    background: var(--col-bg);
    border-radius: var(--radius);
    width: 286px;
    min-width: 240px;
    flex: 1;
    display: flex;
    flex-direction: column;
    border: 1.5px solid transparent;
    transition: border-color .15s, background .15s;
  }
  .column.col-drag-over { border-color: var(--accent); }

  .col-header {
    display: flex;
    align-items: center;
    gap: .45rem;
    padding: .85rem .85rem .55rem;
    cursor: grab;
    user-select: none;
  }
  .col-header:active { cursor: grabbing; }

  .col-name { font-weight: 600; font-size: .9rem; flex: 1; color: var(--text); letter-spacing: -.005em; }
  .col-name-input {
    flex: 1; font-weight: 600; font-size: .9rem;
    border: none; border-bottom: 1.5px solid var(--accent);
    background: transparent; color: var(--text); padding: 0;
  }
  .col-name-input:focus { outline: none; }
  .col-count {
    font-family: var(--mono);
    font-size: .7rem; color: var(--faint);
    padding: 0 .15rem;
  }
  .col-rename {
    cursor: pointer; color: var(--faint); display: flex; align-items: center;
    background: none; border: none;
    padding: 0 .1rem; opacity: 0; transition: opacity .15s, color .15s;
  }
  .col-rename:hover { color: var(--accent); }
  .col-header:hover .col-rename { opacity: 1; }

  .col-archive {
    background: none; border: none; cursor: pointer;
    color: var(--faint); padding: 0 .15rem; opacity: 0;
    transition: opacity .15s, color .15s; display: flex; align-items: center;
  }
  .col-archive:hover { color: var(--accent); }
  .col-header:hover .col-archive { opacity: 1; }

  .col-remove {
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1.05rem; line-height: 1;
    padding: 0 .15rem; opacity: 0; transition: opacity .15s, color .15s;
  }
  .col-remove:hover { color: var(--danger); }
  .col-header:hover .col-remove { opacity: 1; }

  .card-list {
    padding: .25rem .6rem .65rem;
    display: flex;
    flex-direction: column;
    gap: .55rem;
    min-height: 60px;
    border-radius: 0 0 var(--radius) var(--radius);
    transition: background .1s;
  }
  .card-list.cards-drag-over { background: color-mix(in srgb, var(--accent) 9%, var(--col-bg)); }

  .card {
    background: var(--surface);
    border-radius: var(--radius);
    padding: .7rem .8rem;
    cursor: pointer;
    border: 1px solid var(--border);
    border-left: 3px solid var(--prio-color, var(--border));
    box-shadow: 0 1px 2px rgba(0,0,0,.04);
    transition: box-shadow var(--dur) var(--ease),
                border-color var(--dur) var(--ease),
                transform var(--dur) var(--ease),
                opacity .18s;
  }
  .card:hover { box-shadow: 0 4px 14px rgba(0,0,0,.10); border-color: var(--border-strong); border-left-color: var(--prio-color, var(--border-strong)); transform: translateY(-2px); }
  .card.dragging { opacity: .35; transition: none; transform: none; }
  .card.insert-before { box-shadow: inset 0 2px 0 var(--accent), 0 1px 2px rgba(0,0,0,.04); }

  .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; }
  .card-title { font-size: .9rem; font-weight: 500; line-height: 1.4; color: var(--text); flex: 1; }
  .card-pin { flex-shrink: 0; color: var(--accent); opacity: .8; display: flex; align-items: center; margin-top: 2px; }
  .card-meta { display: flex; align-items: center; gap: .5rem; margin-top: .55rem; flex-wrap: wrap; }
  .due-badge {
    font-family: var(--mono);
    font-size: .68rem; font-weight: 500;
    color: var(--muted); background: var(--hover);
    padding: .12rem .45rem; border-radius: 6px;
  }
  .due-badge.overdue { color: var(--overdue-ink); background: var(--overdue-bg); }
  .checklist-badge {
    font-family: var(--mono);
    font-size: .68rem; font-weight: 500;
    color: var(--muted); background: var(--hover);
    padding: .12rem .45rem; border-radius: 6px;
  }
  .checklist-badge.complete { color: var(--success); }

  .add-card-btn {
    border: none; background: none; cursor: pointer;
    color: var(--faint); font-size: .82rem; font-weight: 500;
    text-align: left; padding: .4rem .5rem;
    border-radius: var(--radius-sm); width: 100%;
    transition: color .12s, background .12s;
  }
  .add-card-btn:hover { color: var(--text); background: var(--hover); }

  .quick-add-form, .add-col-form { display: flex; flex-direction: column; gap: .45rem; }
  .quick-input {
    padding: .5rem .6rem; border: 1.5px solid var(--accent);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font-size: .88rem;
  }
  .quick-input:focus { outline: none; }
  .quick-add-actions { display: flex; gap: .4rem; }
  .quick-add-actions button {
    padding: .35rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .82rem; font-weight: 500;
  }
  .add-btn { background: var(--text) !important; color: var(--bg) !important; border-color: var(--text) !important; }

  .add-col-area { flex-shrink: 0; flex-grow: 0; display: flex; flex-direction: column; }
  .add-col-form { width: 220px; }
  .add-col-btn {
    background: none; border: 1.5px dashed var(--border-strong);
    border-radius: var(--radius); color: var(--faint); cursor: pointer;
    padding: .7rem 1.2rem; font-size: .85rem; font-weight: 600; white-space: nowrap;
    transition: border-color .12s, color .12s;
  }
  .add-col-btn:hover { border-color: var(--accent); color: var(--accent); }
</style>
