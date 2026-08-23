///<reference types="svelte" />
;
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

import { PRIORITY_COLOR, PRIORITY_LABEL_SHORT as PRIORITY_LABEL } from './constants';
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  
  
  
  
  

   let project: ProjectDoc/*Ωignore_startΩ*/;project = __sveltets_2_any(project);/*Ωignore_endΩ*/;
   let tasks: TaskDoc[]/*Ωignore_startΩ*/;tasks = __sveltets_2_any(tasks);/*Ωignore_endΩ*/;
  // B2 — the actual Filters button/popover lives in App.svelte's shared
  // board-header now (a dedicated toolbar row for just one button wasted
  // space, owner feedback) — these four are owned there and passed down,
  // filtering which cards render per column without touching `tasks`
  // itself (drag/drop, quick-add, etc. below all still operate on the
  // full set).
   let search = '';
   let filterCol = '';
   let filterPrio = 0;
   let filterTag = '';
   let customFieldFilters: CustomFieldFilter[] = []/*Ωignore_startΩ*/;customFieldFilters = __sveltets_2_any(customFieldFilters);/*Ωignore_endΩ*/;

  const dispatch = createEventDispatcher();

  function sortTasks(ts: TaskDoc[]) {
    return [...ts].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return a.position - b.position;
    });
  }

  let  visibleTasks = __sveltets_2_invalidate(() => filterTasks(tasks, search, filterCol, filterPrio, filterTag, customFieldFilters));

  let  tasksByCol = __sveltets_2_invalidate(() => Object.fromEntries(
    project.columns.map(col => [
      col.id,
      sortTasks(visibleTasks.filter(t => t.column_id === col.id)),
    ])
  ));

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
  // close-then-reopen of the same task, so a fast reopen could land while
  // Svelte's outro for the previous CardDetail instance is still
  // in-flight, and get reversed into an intro on that same (already
  // closed-once) instance instead of a real remount — same root cause as
  // modalStack.ts's 2026-07-17 stuck-panel bug: the revived instance's
  // own closeOnBack() never re-runs, so its requestClose is a stale,
  // already-spent closure that can never close it again.
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

  // B53 — per-card "⋯" quick-actions menu (2026-07-19, folded into the
  // B49 redesign at the owner's request). Immediate writes, not batched
  // into a form save the way CardDetail's own fields are — a Kanban card
  // action should take effect the moment it's clicked. Same click-outside
  // pattern CustomSelect.svelte/CardDetail's own new menu use.
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
    // column comes back as not-done, possibly as a pile of overdue. This
    // was reachable by one accidental drag with no confirmation at all,
    // so it now asks — but only when the last position actually changes.
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
    // with its reminders cancelled. The old dialog said only that cards
    // would move to the first status, which is the lesser half of what
    // actually happens.
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

  

  // ── Touch drag ─────────────────────────────────────────────────────────────
  let touchTask: TaskDoc | null = null;
  let touchGhost: HTMLElement | null = null;
  let touchOffX = 0, touchOffY = 0;
  let boardEl: HTMLElement | null = null;

  // Real bug found live-testing on Android, 2026-07-21 (owner-reported):
  // dragging a card toward the left/right edge of the screen never
  // scrolled the board to reveal an off-screen column — only a column
  // already visible could be dropped into. `.board`'s own overflow-x:auto
  // only responds to a real scroll gesture, which a single-finger drag
  // (already busy carrying the card) can't also perform. Nudges
  // `.board.scrollLeft` a fixed amount per touchmove event while the
  // finger sits within EDGE_ZONE px of either edge — simple and good
  // enough given touchmove already fires many times a second during a
  // drag, no need for a rAF loop.
  const EDGE_ZONE = 60;
  // Owner feedback 2026-07-22: 18px/touchmove-tick was too aggressive --
  // touchmove fires at up to ~60Hz during a drag, so it was compounding
  // into a fast, hard-to-control scroll. Lowered to a gentler nudge.
  const EDGE_SCROLL_SPEED = 6;

  // Owner-reported (mobile, live use): drag-and-drop would sometimes get
  // "stuck" -- a column move silently not committing -- and only a full
  // app restart fixed it, not just retrying or leaving Kanban and coming
  // back. Root cause candidate found on review: `touchTask` used to also
  // write into `dragTask`, the *separate* state the desktop HTML5
  // dragstart/dragover/drop path guards on (`if (!dragTask) return`) --
  // sharing one mutable variable between two independently-reasoned-
  // about code paths meant that if a touch sequence ever ended without
  // onTouchEnd/onTouchCancel actually firing (the OS can swallow both
  // if it takes over the gesture for its own edge-swipe/scroll handling
  // mid-drag), `dragTask` stayed non-null forever with no touch listener
  // left watching it -- a state no user action could clear, only an app
  // restart (a fresh module reload) resetting the variable. Decoupled:
  // touch and mouse drag now track entirely separate task references;
  // `isDragging()` below is the only thing that needs to know about both.
  // A watchdog (touchDragWatchdog) also force-clears touch state if a
  // drag has been "active" implausibly long, as a second line of
  // defense against whatever OS-level event-swallowing caused this.
  const TOUCH_DRAG_WATCHDOG_MS = 15_000;
  let touchDragWatchdog: ReturnType<typeof setTimeout> | null = null;

  function isDragging(task: TaskDoc): boolean {
    return dragTask?._id === task._id || touchTask?._id === task._id;
  }

  // redesign/v6, reference pass: color-graded due date instead of a
  // binary overdue/not -- matches the owner's reference set (a due-date
  // pill that ranges red/urgent -> amber/soon -> neutral/comfortable),
  // not just red-or-plain. "Soon" threshold (<=3 days) matches
  // FocusView.svelte's own due_soon bucket, so the two views agree on
  // what counts as soon.
  function dueDateClass(due: string): 'overdue' | 'soon' | '' {
    const days = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${localDateStr(new Date())}T00:00:00`).getTime()) / 86_400_000);
    if (days < 0) return 'overdue';
    if (days <= 3) return 'soon';
    return '';
  }

  // v6.11.0: hash-to-palette fallback (tagColors.ts) plus any per-tag
  // color a user picked in Settings -> Organize -> Manage Tags. Reloaded
  // on any db change (below) since an override can be set from that
  // panel while this board stays mounted.
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

  // v5.4.2 bug (owner-reported live testing, 2026-07-21): "shadow of old
  // is still hanging on screen" after a long-press drag, even without
  // moving to another column, still visible after navigating to other
  // pages. Only 'touchend' was wired — 'touchcancel' (which the OS fires
  // instead when a system gesture, notification-shade pull, or app
  // backgrounding interrupts the sequence, rather than the finger simply
  // lifting) was never handled, orphaning the ghost element permanently.
  // A cancel means the gesture was aborted, not completed — clean up
  // state without committing whatever column it happened to be over.
  function onTouchCancel() {
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    resetTouchDragState();
  }

  // Belt-and-suspenders for the same bug: touchGhost is appended straight
  // to document.body (needs to render above the whole app, not just this
  // component's own stacking context), which means it lives OUTSIDE
  // Svelte's tree — navigating away from Kanban while a ghost is still
  // active would leave it behind even with touchcancel handled correctly,
  // since unmounting this component never touches nodes it manually
  // appended elsewhere.
  // Second line of defense alongside `.board`'s own touchend/touchcancel
  // bindings above: a capture-phase document-level listener that clears
  // any still-active touch drag on ANY touchend/touchcancel anywhere,
  // not just ones `.board` itself receives. Touch events are spec'd to
  // keep targeting the original element for the whole gesture, so this
  // should normally be a no-op duplicate of onTouchEnd/onTouchCancel --
  // it only does anything if the OS-level event-swallowing suspected
  // above (see onTouchStart's comment) really did drop the board-level
  // handlers for a given gesture.
  function onDocumentTouchEnd() {
    // Deferred, not immediate: this fires in the capture phase, which
    // runs BEFORE `.board`'s own target/bubble-phase touchend/touchcancel
    // handler in the very same event dispatch -- resetting synchronously
    // here would wipe dragOverColId/touchTask out from under a perfectly
    // normal drop before onTouchEnd gets to read them. Deferring to a
    // fresh task lets the normal handler run first; this only ever does
    // something if touchTask is STILL set afterwards, i.e. genuinely
    // orphaned.
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
  // board. Extracted into one helper once the third copy landed — the
  // `.catch` matters: these are read-only board decorations, so a failed
  // refresh should leave the last-known value in place and log, never
  // reject unhandled (maintenance pass, 2026-07-31).
  function loadIndicator<T>(query: () => Promise<T>, apply: (value: T) => void) {
    const run = () => query().then(apply).catch(e => console.warn('board indicator refresh failed', e));
    run();
    return subscribe(run);
  }

  // v6.7.0 — card-level "has related links" indicator.
  let relatedIds = new Set<string>();
  onMount(() => loadIndicator(getTaskIdsWithRelatedLinks, ids => relatedIds = ids));

  // ROADMAP.md "Blocked by" — an unresolved dependency shows a lock badge.
  let blockedIds = new Set<string>();
  onMount(() => loadIndicator(getTaskIdsBlocked, ids => blockedIds = ids));

  onMount(() => loadIndicator(getTagColorOverrides, o => tagColorOverrides = o));

  onDestroy(() => {
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    if (touchDragWatchdog) clearTimeout(touchDragWatchdog);
  });
;
async () => {

 { svelteHTML.createElement("svelte:window", {   "on:click":onWindowClick,});}

if(tasks.length === 0){
   { svelteHTML.createElement("div", { "class":`board-empty-hint`,});              }
}

 { const $$_div0 = svelteHTML.createElement("div", {        "class":`board`,"on:touchmove":onTouchMove,"on:touchend":onTouchEnd,"on:touchcancel":onTouchCancel,});boardEl = $$_div0;
     for(let col of __sveltets_2_ensureArray(project.columns)){col.id;
    
     { svelteHTML.createElement("div", {                "class":`column`,"on:dragover":(e) => onColDragOver(e, col.id),"on:drop":(e) => onColDrop(e, col.id),"on:dragend":() => { dragCol = null; dragOverCol = null; },});dragOverCol === col.id;__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('div'),({ duration: 150, start: 0.92, easing: cubicOut })));__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),({ duration: 120 })));__sveltets_2_ensureAnimation(flip(svelteHTML.mapElementTag('div'),__sveltets_2_AnimationMove,({ duration: 200, easing: cubicOut })));
      
      
       { svelteHTML.createElement("div", {       "class":`col-header`,"draggable":`true`,"on:dragstart":(e) => onColHeaderDragStart(e, col.id),});
        if(editingColId === col.id){
          
           { svelteHTML.createElement("input", {          "class":`col-name-input`,"autofocus":true,"bind:value":editingColName,"on:blur":() => saveColRename(col.id),"on:keydown":(e) => { if (e.key === 'Enter') saveColRename(col.id); if (e.key === 'Escape') editingColId = null; },});/*Ωignore_startΩ*/() => editingColName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
        }else{
           { svelteHTML.createElement("span", { "class":`col-name`,});col.name; }
          
           { svelteHTML.createElement("button", {       "class":`col-rename`,"title":`Rename status`,"aria-label":`Rename status`,"on:click":() => { editingColId = col.id; editingColName = col.name; },});
             { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`11`,"height":`11`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
                { svelteHTML.createElement("path", { "d":`M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z`,});}
             }
           }
          if((tasksByCol[col.id]?.length ?? 0) > 0){
             { svelteHTML.createElement("button", {     "class":`col-archive`,"title":`Archive all tasks in this status`,"on:click":async () => {
              if (!(await confirmAction(`Archive all ${tasksByCol[col.id]?.length} tasks in "${col.name}"?`, { confirmLabel: 'Archive' }))) return;
              try {
                await archiveColumnTasks(project._id, col.id);
                await reloadTasks();
              } catch {
                showError('Failed to archive tasks. Please try again.');
              }
            },});
               { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`12`,"height":`12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
                  { svelteHTML.createElement("rect", {         "x":`1`,"y":`1`,"width":`12`,"height":`3`,"rx":`1`,});}  { svelteHTML.createElement("path", { "d":`M2 4v8a1 1 0 001 1h8a1 1 0 001-1V4`,});}  { svelteHTML.createElement("line", {       "x1":`5`,"y1":`7`,"x2":`9`,"y2":`7`,});}
               }
             }
          }
           { svelteHTML.createElement("button", {     "class":`col-remove`,"on:click":() => doRemoveCol(col.id),"title":`Remove status`,});
             { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`11`,"height":`11`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
                { svelteHTML.createElement("path", { "d":`M2 2l10 10M12 2L2 12`,});}
             }
           }
        }
         { svelteHTML.createElement("div", { "class":`col-header-spacer`,}); }
         { svelteHTML.createElement("span", { "class":`col-count`,});tasksByCol[col.id]?.length ?? 0; }
       }

      
      
       { svelteHTML.createElement("div", {          "class":`card-list`,...__sveltets_2_empty({"data-col-id":col.id}),"on:dragover":(e) => onCardListDragOver(e, col.id),"on:drop":(e) => onCardListDrop(e, col.id),});dragOverColId === col.id && dragOverIndex === null;
            for(let task of __sveltets_2_ensureArray(tasksByCol[col.id] ?? [])){let idx = 1;task._id;
           { svelteHTML.createElement("div", {                                    "class":`card`,...__sveltets_2_empty({"data-task-idx":idx}),"draggable":`true`,"role":`button`,"tabindex":0,"on:dragstart":(e) => onCardDragStart(e, task),"on:dragover":(e) => onCardDragOver(e, col.id, idx),"on:drop":(e) => onCardListDrop(e, col.id),"on:dragend":onCardDragEnd,"on:touchstart":(e) => onTouchStart(e, task, e.currentTarget),"on:click":() => { if (!touchGhost) openDetail(task); },"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(task); } },"style":`--prio-color:${PRIORITY_COLOR[task.priority]}`,});isDragging(task);dragOverColId === col.id && dragOverIndex === idx;task.pinned;__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('div'),({ duration: 150, start: 0.92, easing: cubicOut })));__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),({ duration: 120 })));__sveltets_2_ensureAnimation(flip(svelteHTML.mapElementTag('div'),__sveltets_2_AnimationMove,({ duration: 200, easing: cubicOut })));
             { svelteHTML.createElement("div", { "class":`card-top`,});
               { svelteHTML.createElement("span", { "class":`card-title`,});task.title; }
               { svelteHTML.createElement("div", { "class":`card-menu-wrap`,});
                 { const $$_button6 = svelteHTML.createElement("button", {            "type":`button`,"class":`card-menu-trigger`,"on:click":() => openCardMenu = openCardMenu === task._id ? null : task._id!,"aria-label":`Task actions`,"aria-expanded":openCardMenu === task._id,});cardMenuTriggerEl = $$_button6;
                   { svelteHTML.createElement("svg", {       "viewBox":`0 0 14 14`,"width":`13`,"height":`13`,"fill":`currentColor`,});  { svelteHTML.createElement("circle", {     "cx":`3`,"cy":`7`,"r":`1.2`,});}  { svelteHTML.createElement("circle", {     "cx":`7`,"cy":`7`,"r":`1.2`,});}  { svelteHTML.createElement("circle", {     "cx":`11`,"cy":`7`,"r":`1.2`,});} }
                 }
                if(openCardMenu === task._id){
                  
                   { const $$_div6 = svelteHTML.createElement("div", {      "class":`card-menu`,"on:click":undefined,"on:keydown":undefined,});cardMenuPanelEl = $$_div6;__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 4, duration: popScale.duration, easing: popScale.easing })));
                     { svelteHTML.createElement("button", {     "type":`button`,"class":`card-menu-item`,"on:click":() => { openCardMenu = null; togglePin(task); },});
                        { const $$_ratSniP8C = __sveltets_2_ensureComponent(PinStar); new $$_ratSniP8C({ target: __sveltets_2_any(), props: {    "size":12,"filled":task.pinned,"stroked":true,}});}
                      task.pinned ? 'Unpin' : 'Pin';
                     }
                     { svelteHTML.createElement("button", {     "type":`button`,"class":`card-menu-item`,"on:click":() => { openCardMenu = null; cardArchive(task); },});
                       { svelteHTML.createElement("svg", {           "viewBox":`0 0 14 14`,"width":`13`,"height":`13`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.3`,});  { svelteHTML.createElement("rect", {         "x":`1.5`,"y":`2`,"width":`11`,"height":`3`,"rx":`1`,});}  { svelteHTML.createElement("path", { "d":`M2.5 5v6.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5M5.5 8h3`,});} }
                      
                     }
                     { svelteHTML.createElement("button", {     "type":`button`,"class":`card-menu-item`,"on:click":() => { openCardMenu = null; cardDuplicate(task); },});
                       { svelteHTML.createElement("svg", {           "viewBox":`0 0 14 14`,"width":`13`,"height":`13`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.3`,});  { svelteHTML.createElement("rect", {         "x":`4.5`,"y":`4.5`,"width":`8`,"height":`8`,"rx":`1`,});}  { svelteHTML.createElement("path", { "d":`M9.5 4.5V2.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2`,});} }
                      
                     }
                     { svelteHTML.createElement("div", { "class":`card-menu-divider`,}); }
                     { svelteHTML.createElement("button", {     "type":`button`,"class":`card-menu-item card-menu-item-danger`,"on:click":() => { openCardMenu = null; cardDelete(task); },});
                       { svelteHTML.createElement("svg", {           "viewBox":`0 0 14 14`,"width":`13`,"height":`13`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.3`,});  { svelteHTML.createElement("path", { "d":`M2.5 3.5h9M5.5 3.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M3.5 3.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8`,});} }
                      
                     }
                   }
                }
               }
             }
            
             { svelteHTML.createElement("div", { "class":`card-meta`,});
              if(task.due_date){
                 { svelteHTML.createElement("span", { "class":`meta-badge due-badge ${dueDateClass(task.due_date)}`,});
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`10`,"height":`10`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("rect", {         "x":`1.5`,"y":`2.5`,"width":`11`,"height":`10`,"rx":`1.5`,});}  { svelteHTML.createElement("line", {       "x1":`1.5`,"y1":`5.5`,"x2":`12.5`,"y2":`5.5`,});}  { svelteHTML.createElement("line", {       "x1":`4`,"y1":`1`,"x2":`4`,"y2":`3.5`,});}  { svelteHTML.createElement("line", {       "x1":`10`,"y1":`1`,"x2":`10`,"y2":`3.5`,});} }
                  task.due_date;
                 }
              }
              if(task.recurrence){
                
                 { svelteHTML.createElement("span", {   "class":`meta-badge recur-badge`,"title":`Repeats ${task.recurrence}`,});
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`10`,"height":`10`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("path", { "d":`M2 7a5 5 0 0 1 8.5-3.5M12 2v3h-3`,});}  { svelteHTML.createElement("path", { "d":`M12 7a5 5 0 0 1-8.5 3.5M2 12V9h3`,});} }
                 }
              }
              if(relatedIds.has(task._id!)){
                
                 { svelteHTML.createElement("span", {   "class":`meta-badge related-badge`,"title":`Has related tasks`,});
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`10`,"height":`10`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("circle", {     "cx":`3.5`,"cy":`3.5`,"r":`1.8`,});}  { svelteHTML.createElement("circle", {     "cx":`10.5`,"cy":`10.5`,"r":`1.8`,});}  { svelteHTML.createElement("path", { "d":`M4.8 4.8l4.4 4.4`,});} }
                 }
              }
              if(blockedIds.has(task._id!)){
                 { svelteHTML.createElement("span", {   "class":`meta-badge blocked-badge`,"title":`Blocked by another task`,});
                   { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`10`,"height":`10`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("rect", {         "x":`2`,"y":`6`,"width":`10`,"height":`6`,"rx":`1.5`,});}  { svelteHTML.createElement("path", { "d":`M4.5 6V4a2.5 2.5 0 0 1 5 0v2`,});} }
                 }
              }
              if(task.checklist?.length){
                
                 { svelteHTML.createElement("span", {  "class":`meta-badge checklist-badge`,});task.checklist.every(i => i.done);
                   { svelteHTML.createElement("span", { "class":`checklist-bar`,}); { svelteHTML.createElement("span", {   "class":`checklist-bar-fill`,"style":`width:${Math.round(task.checklist.filter(i => i.done).length / task.checklist.length * 100)}%`,}); } }
                  task.checklist.filter(i => i.done).length; task.checklist.length;
                 }
              }
             }
            if(task.tags.length){
               { svelteHTML.createElement("div", { "class":`card-tags`,});
                  for(let tag of __sveltets_2_ensureArray(task.tags)){ { svelteHTML.createElement("span", {   "class":`card-tag`,"style":`background:color-mix(in srgb, ${tagColor(tag)} 14%, transparent)`,}); { svelteHTML.createElement("span", {   "class":`card-tag-dot`,"style":`background:${tagColor(tag)}`,}); }tag; }}
               }
            }
           }
        }

        if(quickAddCol === col.id){
          
           { svelteHTML.createElement("div", {   "class":`quick-add-form`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('div'),({ duration: 140, start: 0.95, easing: cubicOut })));
             { svelteHTML.createElement("input", {            "autofocus":true,"class":`quick-input`,"bind:value":quickAddTitle,"placeholder":`Task title…`,"enterkeyhint":`done`,"on:keydown":(e) => { if (e.key === 'Enter') quickAdd(col.id); if (e.key === 'Escape') quickAddCol = null; },});/*Ωignore_startΩ*/() => quickAddTitle = __sveltets_2_any(null);/*Ωignore_endΩ*/}
             { svelteHTML.createElement("div", { "class":`quick-add-actions`,});
               { svelteHTML.createElement("button", {   "class":`add-btn`,"on:click":() => quickAdd(col.id),});  }
               { svelteHTML.createElement("button", {  "on:click":() => quickAddCol = null,});  }
             }
           }
        }else{
           { svelteHTML.createElement("button", {   "class":`add-card-btn`,"on:click":() => quickAddCol = col.id,});   }
        }
       }
     }
  }

  
   { svelteHTML.createElement("div", { "class":`add-col-area`,});
    if(addingCol){
       { svelteHTML.createElement("div", {   "class":`add-col-form`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('div'),({ duration: 140, start: 0.95, easing: cubicOut })));
        
         { svelteHTML.createElement("input", {          "autofocus":true,"class":`col-name-input`,"bind:value":newColName,"placeholder":`Status name…`,"on:keydown":(e) => { if (e.key === 'Enter') doAddCol(); if (e.key === 'Escape') addingCol = false; },});/*Ωignore_startΩ*/() => newColName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
         { svelteHTML.createElement("div", { "class":`quick-add-actions`,});
           { svelteHTML.createElement("button", {   "class":`add-btn`,"on:click":doAddCol,});  }
           { svelteHTML.createElement("button", {  "on:click":() => addingCol = false,});  }
         }
       }
    }else{
       { svelteHTML.createElement("button", {   "class":`add-col-btn`,"on:click":() => { addingCol = true; newColName = ''; },});  }
    }
   }
 }

if(detailTask){
  
  detailTask._id + ':' + detailOpenSession; {
     { const $$_liateDdraC0C = __sveltets_2_ensureComponent(CardDetail); const $$_liateDdraC0 = new $$_liateDdraC0C({ target: __sveltets_2_any(), props: {         "task":detailTask,"project":detailProjectOverride ?? project,}});$$_liateDdraC0.$on("close", async () => { detailTask = null; detailProjectOverride = null; await reloadTasks(); });$$_liateDdraC0.$on("openRelated", (e) => openRelatedTask(e.detail));}
  }
}


};
return { props: {project: project , tasks: tasks , search: search , filterCol: filterCol , filterPrio: filterPrio , filterTag: filterTag , customFieldFilters: customFieldFilters} as {project: ProjectDoc, tasks: TaskDoc[], search?: typeof search, filterCol?: typeof filterCol, filterPrio?: typeof filterPrio, filterTag?: typeof filterTag, customFieldFilters?: CustomFieldFilter[]}, exports: {}, bindings: "", slots: {}, events: {'click':__sveltets_2_mapElementEvent('click'), 'keydown':__sveltets_2_mapElementEvent('keydown'), 'projectUpdated': __sveltets_2_customEvent} }}
const KanbanBoard__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type KanbanBoard__SvelteComponent_ = InstanceType<typeof KanbanBoard__SvelteComponent_>;
/*Ωignore_endΩ*/export default KanbanBoard__SvelteComponent_;