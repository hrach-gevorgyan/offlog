<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { popScale } from './motion';
  import type { ProjectDoc, TaskDoc } from './types';
  import { createTask, updateTask, computeDropPosition, addColumn, renameColumn, reorderColumns, removeColumn, archiveColumnTasks, archiveTask, duplicateTask, deleteTask, getTaskById, getTaskIdsWithRelatedLinks, getTaskIdsBlocked, getTagColorOverrides, subscribe } from './db';
  import { reloadTasks, showError, projects } from './store';
  import { confirmAction } from './confirm';
  import CardDetail from './CardDetail.svelte';
  import PinStar from './PinStar.svelte';
  import { filterTasks, localDateStr, type CustomFieldFilter } from './utils';
  import { hapticToggle, hapticDragStart, hapticDragDrop } from './haptics';
  import { resolveTagColor } from './tagColors';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];
  // The Filters button/popover lives in App.svelte's shared board-header;
  // these four are owned there and passed down. They only filter which
  // cards render per column — `tasks` itself is untouched, so drag/drop,
  // quick-add etc. below still operate on the full set.
  export let search = '';
  export let filterCol = '';
  export let filterPrio = 0;
  export let filterTag = '';
  export let customFieldFilters: CustomFieldFilter[] = [];

  const dispatch = createEventDispatcher();

  function sortTasks(ts: TaskDoc[]) {
    return [...ts].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return a.position - b.position;
    });
  }

  $: visibleTasks = filterTasks(tasks, search, filterCol, filterPrio, filterTag, customFieldFilters);

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
    hapticDragStart();
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
    const newPos = computeDropPosition(colTasks, dragOverIndex);

    try {
      await updateTask(dragTask._id!, { column_id: colId, position: newPos });
      await reloadTasks();
      hapticDragDrop();
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
  // Bumped every time a card is opened, including reopening the *same*
  // card — {#key detailTask._id} alone doesn't change value on a
  // close-then-reopen of the same task, so a fast reopen can land while
  // Svelte's outro for the previous CardDetail instance is still
  // in-flight and get reversed into an intro on that same (already
  // closed-once) instance instead of a real remount. The revived
  // instance's closeOnBack() never re-runs, so its requestClose is a
  // stale, already-spent closure and the panel can never close again.
  // Any closeOnBack() consumer needs a key that changes on every open.
  let detailOpenSession = 0;
  // null = "use this board's own `project` prop" (the normal case, a task
  // from this board). Only set to a real ProjectDoc when a related-task
  // link opens a task belonging to a *different* project than this board.
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

  // Per-card "⋯" quick-actions menu. Writes immediately rather than
  // batching into a form save the way CardDetail's fields do — a Kanban
  // card action takes effect the moment it's clicked. Same click-outside
  // pattern as CustomSelect.svelte and CardDetail's own menu.
  let openCardMenu: string | null = null;
  let cardMenuTriggerEl: HTMLButtonElement | null = null;
  let cardMenuPanelEl: HTMLDivElement | null = null;
  function onWindowClick(e: MouseEvent) {
    if (!openCardMenu) return;
    const t = e.target as Node;
    if (cardMenuTriggerEl?.contains(t) || cardMenuPanelEl?.contains(t)) return;
    openCardMenu = null;
  }
  async function togglePin(task: TaskDoc) {
    try {
      await updateTask(task._id!, { pinned: !task.pinned });
      await reloadTasks();
      hapticToggle();
    } catch {
      showError('Failed to update task.');
    }
  }
  async function cardArchive(task: TaskDoc) {
    try {
      await archiveTask(task._id!);
      await reloadTasks();
    } catch {
      showError('Failed to archive task.');
    }
  }
  async function cardDuplicate(task: TaskDoc) {
    try {
      await duplicateTask(task._id!);
      await reloadTasks();
    } catch {
      showError('Failed to duplicate task.');
    }
  }
  async function cardDelete(task: TaskDoc) {
    if (!(await confirmAction('Delete this task?', { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteTask(task._id!);
      await reloadTasks();
    } catch {
      showError('Failed to delete task.');
    }
  }

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
    // "Done" is positional — the LAST status is what counts as complete
    // (db.ts). So a drag that changes which status sits last silently
    // redefines done-ness in both directions at once: everything in the
    // new last column becomes done (dropping off Agenda/Dashboard/Focus
    // and cancelling its reminders), and everything in the old last
    // column comes back as not-done, possibly as a pile of overdue. So
    // confirm — but only when the last position actually changes.
    const oldLast = project.columns.at(-1);
    const newLast = cols.at(-1);
    if (oldLast && newLast && oldLast.id !== newLast.id) {
      const nowDone = tasksByCol[newLast.id]?.length ?? 0;
      const nowUndone = tasksByCol[oldLast.id]?.length ?? 0;
      const ok = await confirmAction(
        `"${newLast.name}" would become the last status, which is what counts as done. ` +
        `${nowDone} task(s) in it will be treated as complete, and ${nowUndone} in "${oldLast.name}" will go back to not-done.`,
        { confirmLabel: 'Reorder' },
      );
      if (!ok) { dragCol = null; dragOverCol = null; return; }
    }
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
    let msg = colTasks.length
      ? `Remove column? ${colTasks.length} card(s) will move to the first column.`
      : 'Remove this column?';
    msg = msg.replace('column', 'status');
    // Removing the *last* status promotes the one before it, and "done"
    // is positional — so every task sitting in that now-last status
    // silently becomes complete: gone from Agenda, Dashboard and Focus,
    // with its reminders cancelled. The dialog must say that, not just
    // that cards move to the first status.
    if (project.columns.at(-1)?.id === colId && project.columns.length > 1) {
      const promoted = project.columns.at(-2)!;
      const affected = tasksByCol[promoted.id]?.length ?? 0;
      msg += ` "${promoted.name}" then becomes the last status, so its ${affected} task(s) will count as done.`;
    }
    if (!(await confirmAction(msg, { danger: true, confirmLabel: 'Remove' }))) return;
    try {
      const updated = await removeColumn(project._id, colId);
      project = updated;
      dispatch('projectUpdated', updated);
      await reloadTasks();
    } catch (e: any) {
      showError('Failed to remove status. Please try again.');
    }
  }

  import { PRIORITY_COLOR } from './constants';

  // ── Touch drag ─────────────────────────────────────────────────────────────
  let touchTask: TaskDoc | null = null;
  let touchGhost: HTMLElement | null = null;
  let touchOffX = 0, touchOffY = 0;
  let boardEl: HTMLElement | null = null;

  // Edge auto-scroll for touch drags. `.board`'s overflow-x:auto only
  // responds to a real scroll gesture, which a single-finger drag
  // (already busy carrying the card) can't also perform — without this,
  // an off-screen column is unreachable on mobile. Nudges
  // `.board.scrollLeft` a fixed amount per touchmove event while the
  // finger sits within EDGE_ZONE px of either edge; touchmove already
  // fires many times a second during a drag, so no rAF loop is needed.
  const EDGE_ZONE = 60;
  // Keep this small: touchmove fires at up to ~60Hz during a drag, so a
  // larger step compounds into a fast, hard-to-control scroll.
  const EDGE_SCROLL_SPEED = 6;

  // Touch and mouse drag must track entirely separate task references:
  // the desktop HTML5 dragstart/dragover/drop path guards on `dragTask`
  // (`if (!dragTask) return`), and if a touch sequence writing into that
  // same variable ends without onTouchEnd/onTouchCancel firing (the OS
  // can swallow both when it takes over the gesture mid-drag), `dragTask`
  // stays non-null forever with no touch listener left watching it —
  // drag-and-drop then silently stops committing until a module reload.
  // `isDragging()` below is the only thing that needs to know about both.
  // A watchdog (touchDragWatchdog) force-clears touch state if a drag has
  // been "active" implausibly long, as a second line of defense.
  const TOUCH_DRAG_WATCHDOG_MS = 15_000;
  let touchDragWatchdog: ReturnType<typeof setTimeout> | null = null;

  function isDragging(task: TaskDoc): boolean {
    return dragTask?._id === task._id || touchTask?._id === task._id;
  }

  // Color-graded due date: red/urgent -> amber/soon -> neutral, not a
  // binary overdue/not. The "soon" threshold (<=3 days) must stay in
  // step with FocusView.svelte's due_soon bucket so the two views agree
  // on what counts as soon.
  function dueDateClass(due: string): 'overdue' | 'soon' | '' {
    const days = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${localDateStr(new Date())}T00:00:00`).getTime()) / 86_400_000);
    if (days < 0) return 'overdue';
    if (days <= 3) return 'soon';
    return '';
  }

  // Hash-to-palette fallback (tagColors.ts) plus any per-tag color set in
  // Settings -> Organize -> Manage Tags. Reloaded on any db change
  // (below) since an override can be set from that panel while this board
  // stays mounted.
  let tagColorOverrides: Record<string, string> = {};
  function tagColor(tag: string): string {
    return resolveTagColor(tag, tagColorOverrides);
  }

  function onTouchStart(e: TouchEvent, task: TaskDoc, el: HTMLElement) {
    touchTask = task;
    if (touchDragWatchdog) clearTimeout(touchDragWatchdog);
    touchDragWatchdog = setTimeout(() => {
      if (touchGhost) { touchGhost.remove(); touchGhost = null; }
      resetTouchDragState();
    }, TOUCH_DRAG_WATCHDOG_MS);
    const touch = e.touches[0];
    const rect = el.getBoundingClientRect();
    touchOffX = touch.clientX - rect.left;
    touchOffY = touch.clientY - rect.top;
    touchGhost = el.cloneNode(true) as HTMLElement;
    touchGhost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;width:${rect.width}px;opacity:.8;box-shadow:0 8px 24px rgba(0,0,0,.18);border-radius:12px;left:${rect.left}px;top:${rect.top}px;transition:none;transform:rotate(1.5deg);`;
    document.body.appendChild(touchGhost);
    hapticDragStart();
  }

  function onTouchMove(e: TouchEvent) {
    if (!touchTask || !touchGhost) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchGhost.style.left = (touch.clientX - touchOffX) + 'px';
    touchGhost.style.top  = (touch.clientY - touchOffY) + 'px';

    if (boardEl) {
      const boardRect = boardEl.getBoundingClientRect();
      if (touch.clientX < boardRect.left + EDGE_ZONE) {
        boardEl.scrollLeft -= EDGE_SCROLL_SPEED;
      } else if (touch.clientX > boardRect.right - EDGE_ZONE) {
        boardEl.scrollLeft += EDGE_SCROLL_SPEED;
      }
    }

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

  function resetTouchDragState() {
    if (touchDragWatchdog) { clearTimeout(touchDragWatchdog); touchDragWatchdog = null; }
    touchTask = null;
    dragOverColId = null;
    dragOverIndex = null;
  }

  async function onTouchEnd() {
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    if (!touchTask) return;
    const colId = dragOverColId;
    if (colId) {
      const colTasks = tasksByCol[colId] ?? [];
      const newPos = computeDropPosition(colTasks, dragOverIndex);
      try {
        await updateTask(touchTask._id!, { column_id: colId, position: newPos });
        await reloadTasks();
        hapticDragDrop();
      } catch {
        showError('Failed to move task. Please try again.');
      }
    }
    resetTouchDragState();
  }

  // 'touchcancel' must be handled alongside 'touchend': the OS fires it
  // instead when a system gesture, notification-shade pull, or app
  // backgrounding interrupts the sequence, and leaving it unwired orphans
  // the drag ghost on screen permanently. A cancel means the gesture was
  // aborted, not completed — clean up state without committing whatever
  // column it happened to be over.
  function onTouchCancel() {
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    resetTouchDragState();
  }

  // touchGhost is appended straight to document.body (it must render
  // above the whole app, not just this component's stacking context), so
  // it lives OUTSIDE Svelte's tree: unmounting this component never
  // touches it, and navigating away mid-drag would leave it behind.
  // Hence this capture-phase document-level listener, which clears any
  // still-active touch drag on ANY touchend/touchcancel anywhere, not
  // just ones `.board` receives. Touch events are spec'd to keep
  // targeting the original element for the whole gesture, so it is
  // normally a no-op duplicate of onTouchEnd/onTouchCancel — it only
  // matters when the OS drops the board-level handlers for a gesture.
  function onDocumentTouchEnd() {
    // Deferred, not immediate: this fires in the capture phase, which
    // runs BEFORE `.board`'s own target/bubble-phase touchend/touchcancel
    // handler in the same event dispatch — resetting synchronously here
    // would wipe dragOverColId/touchTask out from under a perfectly
    // normal drop before onTouchEnd gets to read them. Deferring lets the
    // normal handler run first; this then only acts if touchTask is STILL
    // set, i.e. genuinely orphaned.
    setTimeout(() => {
      if (!touchTask) return;
      if (touchGhost) { touchGhost.remove(); touchGhost = null; }
      resetTouchDragState();
    }, 0);
  }
  onMount(() => {
    document.addEventListener('touchend', onDocumentTouchEnd, true);
    document.addEventListener('touchcancel', onDocumentTouchEnd, true);
    return () => {
      document.removeEventListener('touchend', onDocumentTouchEnd, true);
      document.removeEventListener('touchcancel', onDocumentTouchEnd, true);
    };
  });

  // Card-level indicators (related-link / blocked / tag-color lookups) all
  // follow the same shape: one cheap whole-board query up front instead of
  // re-deriving per rendered card, re-run on any db change since the
  // underlying data can be edited from another project's card, off this
  // board. The `.catch` matters: these are read-only board decorations,
  // so a failed refresh must leave the last-known value in place and log,
  // never reject unhandled.
  function loadIndicator<T>(query: () => Promise<T>, apply: (value: T) => void) {
    const run = () => query().then(apply).catch(e => console.warn('board indicator refresh failed', e));
    run();
    return subscribe(run);
  }

  // Card-level "has related links" indicator.
  let relatedIds = new Set<string>();
  onMount(() => loadIndicator(getTaskIdsWithRelatedLinks, ids => relatedIds = ids));

  // An unresolved "blocked by" dependency shows a lock badge.
  let blockedIds = new Set<string>();
  onMount(() => loadIndicator(getTaskIdsBlocked, ids => blockedIds = ids));

  onMount(() => loadIndicator(getTagColorOverrides, o => tagColorOverrides = o));

  onDestroy(() => {
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    if (touchDragWatchdog) clearTimeout(touchDragWatchdog);
  });
</script>

<svelte:window on:click={onWindowClick} />

{#if tasks.length === 0}
  <div class="board-empty-hint">No tasks yet — click "+ Add card" in any column to add one.</div>
{/if}
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="board" bind:this={boardEl} on:touchmove|nonpassive={onTouchMove} on:touchend={onTouchEnd} on:touchcancel={onTouchCancel}>
  {#each project.columns as col (col.id)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="column"
      class:col-drag-over={dragOverCol === col.id}
      on:dragover={(e) => onColDragOver(e, col.id)}
      on:drop={(e) => onColDrop(e, col.id)}
      on:dragend={() => { dragCol = null; dragOverCol = null; }}
      in:scale={{ duration: 150, start: 0.92, easing: cubicOut }}
      out:fade={{ duration: 120 }}
      animate:flip={{ duration: 200, easing: cubicOut }}
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
          <button class="col-remove" on:click={() => doRemoveCol(col.id)} title="Remove status">
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 2l10 10M12 2L2 12"/>
            </svg>
          </button>
        {/if}
        <div class="col-header-spacer"></div>
        <span class="col-count">{tasksByCol[col.id]?.length ?? 0}</span>
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
            class:dragging={isDragging(task)}
            class:insert-before={dragOverColId === col.id && dragOverIndex === idx}
            class:pinned={task.pinned}
            draggable="true"
            role="button"
            tabindex="0"
            on:dragstart={(e) => onCardDragStart(e, task)}
            on:dragover={(e) => onCardDragOver(e, col.id, idx)}
            on:drop={(e) => onCardListDrop(e, col.id)}
            on:dragend={onCardDragEnd}
            on:touchstart|nonpassive={(e) => onTouchStart(e, task, e.currentTarget)}
            on:click={() => { if (!touchGhost) openDetail(task); }}
            on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(task); } }}
            in:scale={{ duration: 150, start: 0.92, easing: cubicOut }}
            out:fade={{ duration: 120 }}
            animate:flip={{ duration: 200, easing: cubicOut }}
            style="--prio-color:{PRIORITY_COLOR[task.priority]}"
          >
            <div class="card-top">
              <span class="card-title">{task.title}</span>
              <div class="card-menu-wrap">
                <button
                  type="button"
                  class="card-menu-trigger"
                  bind:this={cardMenuTriggerEl}
                  on:click|stopPropagation={() => openCardMenu = openCardMenu === task._id ? null : task._id!}
                  aria-label="Task actions"
                  aria-expanded={openCardMenu === task._id}
                >
                  <svg viewBox="0 0 14 14" width="13" height="13" fill="currentColor"><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="11" cy="7" r="1.2"/></svg>
                </button>
                {#if openCardMenu === task._id}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div class="card-menu" bind:this={cardMenuPanelEl} on:click|stopPropagation on:keydown|stopPropagation transition:fly={{ y: 4, duration: popScale.duration, easing: popScale.easing }}>
                    <button type="button" class="card-menu-item" on:click={() => { openCardMenu = null; togglePin(task); }}>
                      <PinStar size={12} filled={task.pinned} stroked />
                      {task.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button type="button" class="card-menu-item" on:click={() => { openCardMenu = null; cardArchive(task); }}>
                      <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2" width="11" height="3" rx="1"/><path d="M2.5 5v6.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5M5.5 8h3"/></svg>
                      Archive
                    </button>
                    <button type="button" class="card-menu-item" on:click={() => { openCardMenu = null; cardDuplicate(task); }}>
                      <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4.5" y="4.5" width="8" height="8" rx="1"/><path d="M9.5 4.5V2.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>
                      Duplicate
                    </button>
                    <div class="card-menu-divider"></div>
                    <button type="button" class="card-menu-item card-menu-item-danger" on:click={() => { openCardMenu = null; cardDelete(task); }}>
                      <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 3.5h9M5.5 3.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M3.5 3.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8"/></svg>
                      Delete
                    </button>
                  </div>
                {/if}
              </div>
            </div>
            <div class="card-meta">
              {#if task.due_date}
                <span class="meta-badge due-badge {dueDateClass(task.due_date)}">
                  <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="11" height="10" rx="1.5"/><line x1="1.5" y1="5.5" x2="12.5" y2="5.5"/><line x1="4" y1="1" x2="4" y2="3.5"/><line x1="10" y1="1" x2="10" y2="3.5"/></svg>
                  {task.due_date}
                </span>
              {/if}
              {#if task.recurrence}
                <span class="meta-badge recur-badge" title="Repeats {task.recurrence}">
                  <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7a5 5 0 0 1 8.5-3.5M12 2v3h-3"/><path d="M12 7a5 5 0 0 1-8.5 3.5M2 12V9h3"/></svg>
                </span>
              {/if}
              {#if relatedIds.has(task._id!)}
                <span class="meta-badge related-badge" title="Has related tasks">
                  <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="3.5" cy="3.5" r="1.8"/><circle cx="10.5" cy="10.5" r="1.8"/><path d="M4.8 4.8l4.4 4.4"/></svg>
                </span>
              {/if}
              {#if blockedIds.has(task._id!)}
                <span class="meta-badge blocked-badge" title="Blocked by another task">
                  <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="10" height="6" rx="1.5"/><path d="M4.5 6V4a2.5 2.5 0 0 1 5 0v2"/></svg>
                </span>
              {/if}
              {#if task.checklist?.length}
                <span class="meta-badge checklist-badge" class:complete={task.checklist.every(i => i.done)}>
                  <span class="checklist-bar"><span class="checklist-bar-fill" style="width:{Math.round(task.checklist.filter(i => i.done).length / task.checklist.length * 100)}%"></span></span>
                  {task.checklist.filter(i => i.done).length}/{task.checklist.length}
                </span>
              {/if}
            </div>
            {#if task.tags.length}
              <div class="card-tags">
                {#each task.tags as tag}<span class="card-tag" style="background:color-mix(in srgb, {tagColor(tag)} 14%, transparent)"><span class="card-tag-dot" style="background:{tagColor(tag)}"></span>{tag}</span>{/each}
              </div>
            {/if}
          </div>
        {/each}

        {#if quickAddCol === col.id}
          <!-- svelte-ignore a11y-autofocus -->
          <div class="quick-add-form" transition:scale={{ duration: 140, start: 0.95, easing: cubicOut }}>
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
      <div class="add-col-form" transition:scale={{ duration: 140, start: 0.95, easing: cubicOut }}>
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
  <!-- {#key} forces a full remount if `task` changes to a different task
       while still open, so CardDetail's per-task `let` state
       (collapsible-section flags, etc.) can't carry over stale. It must
       also include detailOpenSession so reopening the *same* task quickly
       remounts too: _id alone doesn't change value then, and Svelte
       reverses the in-flight outro into an intro on the already-closed
       instance, whose closeOnBack() is spent. -->
  {#key detailTask._id + ':' + detailOpenSession}
    <CardDetail
      task={detailTask}
      project={detailProjectOverride ?? project}
      on:close={async () => { detailTask = null; detailProjectOverride = null; await reloadTasks(); }}
      on:openRelated={(e) => openRelatedTask(e.detail)}
    />
  {/key}
{/if}

<style>
  .board-empty-hint {
    color: var(--faint); font-size: 13px; padding: .75rem 1.75rem 0;
  }
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
    .card-menu-trigger { opacity: .55; }
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
    transition: border-color .12s, background .12s;
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

  .col-name { font-weight: 600; font-size: .9rem; color: var(--text); letter-spacing: -.005em; }
  .col-header-spacer { flex: 1; }
  .col-name-input {
    flex: 1; font-weight: 600; font-size: .9rem;
    border: none; border-bottom: 1.5px solid var(--accent);
    background: transparent; color: var(--text); padding: 0;
  }
  .col-name-input:focus { outline: none; }
  /* min-width so 1- vs. 2-digit counts don't shift the column name's
     position. Background must be --surface, not --hover: --hover equals
     --col-bg exactly in light mode, leaving the pill with no visible
     fill there. */
  .col-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 20px; height: 20px;
    font-family: var(--mono); font-size: .68rem; font-weight: 600;
    color: var(--muted); background: var(--surface);
    border-radius: 20px; padding: 0 .4rem;
  }
  /* All three action buttons share one fixed 20x20 flex box — mixing
     padding-only, font-size-driven and flex-box sizing here leaves them
     visibly misaligned. */
  .col-rename, .col-archive, .col-remove {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px;
    background: none; border: none; cursor: pointer;
    color: var(--faint); font-size: 1rem; line-height: 1;
    border-radius: 5px; opacity: 0;
    transition: opacity .12s, color .12s, background .12s;
  }
  .col-rename:hover { color: var(--accent); background: var(--hover); }
  .col-header:hover .col-rename { opacity: 1; }
  .col-archive:hover { color: var(--accent); background: var(--hover); }
  .col-remove:hover { color: var(--danger); background: var(--hover); }
  .col-header:hover .col-archive, .col-header:hover .col-remove { opacity: 1; }

  .card-list {
    padding: .25rem .6rem .65rem;
    display: flex;
    flex-direction: column;
    gap: .55rem;
    min-height: 60px;
    border-radius: 0 0 var(--radius) var(--radius);
    transition: background .12s;
  }
  .card-list.cards-drag-over { background: color-mix(in srgb, var(--accent) 9%, var(--col-bg)); }

  /* Priority reads as a plain thin color on the card's left edge — no
     glow, no pill, no dot. */
  .card {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 16px 14px;
    cursor: pointer;
    border-left: 2px solid var(--prio-color, var(--border));
    box-shadow: 0 1px 2px rgba(0,0,0,.04);
    transition: box-shadow var(--dur) var(--ease),
                transform var(--dur) var(--ease),
                opacity var(--dur) var(--ease);
  }
  .card:hover {
    box-shadow: 0 4px 14px rgba(0,0,0,.10);
    transform: translateY(-2px);
  }
  .card.dragging { opacity: .35; transition: none; transform: none; }
  .card.insert-before { box-shadow: inset 0 2px 0 var(--accent), 0 1px 2px rgba(0,0,0,.04); }
  /* Pinned reads as a thin accent right edge — mirrors the priority left
     edge, on the opposite side so the two never compete for space. */
  .card.pinned { border-right: 1px solid var(--accent); }

  .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; }
  .card-title { font-size: .92rem; font-weight: 600; line-height: 1.4; color: var(--text); flex: 1; }
  .card-menu-wrap { position: relative; flex-shrink: 0; margin: -3px -3px 0 0; }
  .card-menu-trigger {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; padding: 0;
    background: none; border: none; border-radius: 5px; color: var(--faint);
    opacity: 0; transition: opacity .12s, background .12s, color .12s;
    cursor: pointer;
  }
  .card:hover .card-menu-trigger, .card-menu-trigger:focus-visible { opacity: 1; }
  .card-menu-trigger:hover { background: var(--hover); color: var(--text); }
  .card-menu {
    position: absolute; top: calc(100% + 2px); right: 0;
    width: 168px; background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); box-shadow: 0 8px 24px rgba(0,0,0,.22);
    padding: .3rem; display: flex; flex-direction: column; z-index: 10;
  }
  .card-menu-item {
    display: flex; align-items: center; gap: 8px;
    background: none; border: none; border-radius: var(--radius-sm);
    padding: .4rem .55rem; font-size: .78rem; font-weight: 500;
    color: var(--text); cursor: pointer; text-align: left;
  }
  .card-menu-item:hover { background: var(--hover); }
  .card-menu-item svg { flex-shrink: 0; color: var(--muted); }
  .card-menu-divider { height: 1px; background: var(--border); margin: .25rem .15rem; }
  .card-menu-item-danger { color: var(--danger); }
  .card-menu-item-danger svg { color: var(--danger); }
  .card-menu-item-danger:hover { background: var(--overdue-bg); }
  .card-meta { display: flex; align-items: center; gap: .4rem; margin-top: .65rem; flex-wrap: wrap; }
  .meta-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: var(--mono); font-size: .68rem; font-weight: 500;
    color: var(--muted); background: var(--hover);
    padding: .18rem .5rem; border-radius: 20px;
  }
  /* Colored fills are reserved for urgent time alerts, so only overdue
     gets one; every other date (soon or comfortably future) keeps the
     plain neutral .meta-badge pill. dueDateClass() still distinguishes
     'soon' for non-visual use, it just isn't styled differently here. */
  .due-badge.overdue { color: var(--overdue-ink); background: var(--overdue-bg); }
  .checklist-badge.complete { color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .checklist-bar {
    display: inline-block; width: 24px; height: 4px; border-radius: 2px;
    background: var(--border-strong); overflow: hidden; flex-shrink: 0;
  }
  .checklist-bar-fill { display: block; height: 100%; background: var(--success); border-radius: 2px; }
  .related-badge, .recur-badge { padding: .18rem .4rem; }
  .blocked-badge { padding: .18rem .4rem; color: var(--danger); }

  /* Each tag gets a consistent soft tint from tagColor()'s hash. Text
     stays var(--text), never the raw hash color: a saturated hue as both
     text and its own tinted background fails contrast (e.g. pink on
     dark-maroon). The color identity lives in the small dot instead. */
  .card-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: .55rem; }
  .card-tag {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 500; color: var(--text);
    padding: 2px 8px; border-radius: 20px; white-space: nowrap;
  }
  .card-tag-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  .add-card-btn {
    border: 1.5px dashed var(--border-strong); background: none; cursor: pointer;
    color: var(--faint); font-size: .82rem; font-weight: 500;
    text-align: center; padding: .5rem;
    border-radius: var(--radius-sm); width: 100%;
    transition: color .12s, background .12s, border-color .12s;
  }
  .add-card-btn:hover { color: var(--text); background: var(--hover); border-color: var(--accent); }

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
