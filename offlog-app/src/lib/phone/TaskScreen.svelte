<script lang="ts">
  import { hapticToggle } from '../haptics';
  // The phone's full-screen task. Every field saves the moment it changes;
  // there is no Save button. Recurrence advancing on finish, log entries and
  // reminder rescheduling all happen inside updateTask()/the store reload.
  import { onMount, onDestroy } from 'svelte';
  import type { TaskDoc, CustomFieldDef } from '../types';
  import {
    getTaskById, updateTask, deleteTask, archiveTask, unarchiveTask, duplicateTask, skipRecurrence, subscribe,
    getCustomFieldDefs, getTagColorOverrides, findTasksByTitleInProject, findSimilarNotes,
    getRelatedTasks, getBlockingTasks, isBlockerResolved, getTasksForProject,
  } from '../db';
  import { projects, spaces, reloadTasks, showError } from '../store';
  import { resolveTagColor, soften } from '../tagColors';
  import { PRIORITY_COLOR, PRIORITY_LABEL } from '../constants';
  import { fmtTime, localDateStr } from '../utils';
  import { back, push, showToast } from './nav';
  import { duePill, shortDate } from './format';
  import { today } from '../today';
  import { I } from './icons';
  import TopBar from './TopBar.svelte';
  import Sheet from './Sheet.svelte';
  import { loadNoteEditor } from './noteEditor';
  import TaskHistoryPanel from '../TaskHistoryPanel.svelte';
  import Pick from './task/Pick.svelte';
  import DueSheet from './task/DueSheet.svelte';
  import TagsSheet from './task/TagsSheet.svelte';
  import ReminderSheet from './task/ReminderSheet.svelte';
  import RepeatSheet from './task/RepeatSheet.svelte';
  import LinksSheet from './task/LinksSheet.svelte';
  import AttachmentsSheet from './task/AttachmentsSheet.svelte';
  import FieldsSheet from './task/FieldsSheet.svelte';
  import Steps from './task/Steps.svelte';
  import { dueDateToReminderInput } from '../carddetail/helpers';
  import { columnTasks, stepPosition } from './project/filter';

  export let id: string;

  let task: TaskDoc | null = null;
  let loaded = false;
  let fields: CustomFieldDef[] = [];
  let colors: Record<string, string> = {};
  let related: TaskDoc[] = [];
  let blocking: TaskDoc[] = [];

  // Local copies of the two free-text fields. A reload from the change feed
  // never overwrites the one being typed in.
  let title = '';
  let body = '';
  let titleFocused = false;
  let noteFocused = false;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;

  $: project = task ? $projects.find(p => p._id === task!.project_id) : undefined;
  $: space = task ? $spaces.find(s => s._id === task!.space_id) : undefined;
  $: lastCol = project?.columns.at(-1)?.id;
  $: done = !!task && !!lastCol && task.column_id === lastCol;

  let loadSeq = 0;
  async function load() {
    const n = ++loadSeq;
    try {
      const [t, rel, blk] = await Promise.all([getTaskById(id), getRelatedTasks(id), getBlockingTasks(id)]);
      if (n !== loadSeq) return;
      related = rel;
      blocking = blk;
      // While a write is in flight the local task is ahead of the database;
      // the reload that follows the last write brings them back in line.
      if (pending) return;
      task = t && !t.deleted ? t : null;
      if (task) {
        if (!titleFocused) title = task.title;
        if (!noteFocused && !noteTimer && !noteDirty) body = task.body ?? '';
      }
    } catch {
      showError('Could not load this task. Please try again.');
    } finally {
      if (n === loadSeq) loaded = true;
    }
  }

  async function loadColors() {
    try { colors = await getTagColorOverrides(); } catch { /* falls back to hashed colours */ }
  }

  let unsub: (() => void) | undefined;
  let NoteEditor: Awaited<ReturnType<typeof loadNoteEditor>>['default'] | null = null;
  onMount(() => { loadNoteEditor().then(m => NoteEditor = m.default, () => showError('Could not open the note editor. Please reopen the task.')); });

  onMount(async () => {
    unsub = subscribe(load);
    await load();
    loadColors();
    try { fields = await getCustomFieldDefs(); } catch { /* the Fields row just stays hidden */ }
  });

  // ── Writes ────────────────────────────────────────────────────────────────
  // Applied locally before the write, so a second quick edit (another step,
  // another tag) builds on the first instead of on the stale doc. A failed
  // write rolls back only the keys nothing has changed since.
  let pending = 0;
  async function save(changes: Partial<TaskDoc>, err = 'Could not save this change. Please try again.'): Promise<boolean> {
    if (!task) return false;
    const tid = task._id;
    const prev: Partial<TaskDoc> = {};
    for (const k of Object.keys(changes) as (keyof TaskDoc)[]) (prev as Record<string, unknown>)[k] = task[k];
    task = { ...task, ...changes };
    pending++;
    try {
      await updateTask(tid, changes);
    } catch {
      pending--;
      if (task?._id === tid) {
        const undo: Partial<TaskDoc> = {};
        for (const k of Object.keys(prev) as (keyof TaskDoc)[]) {
          if (task[k] === changes[k]) (undo as Record<string, unknown>)[k] = prev[k];
        }
        task = { ...task, ...undo };
      }
      showError(err);
      load();
      return false;
    }
    pending--;
    try { await reloadTasks(); } catch { /* the write landed; lists catch up on the next change */ }
    load();
    return true;
  }

  // Applies `changes`, then offers Undo that writes back what they replaced.
  // A status change can also advance a repeating task's date, reminder and
  // steps, so those are part of what Undo restores.
  async function saveUndoable(changes: Partial<TaskDoc>, text: string, err?: string) {
    if (!task) return;
    const keys = new Set(Object.keys(changes) as (keyof TaskDoc)[]);
    if (keys.has('column_id')) for (const k of ['due_date', 'reminder_at', 'checklist'] as const) keys.add(k);
    const before: Partial<TaskDoc> = {};
    for (const k of keys) (before as Record<string, unknown>)[k] = task[k];
    const tid = task._id;
    if (await save(changes, err)) showToast(text, () => restore(tid, before));
  }

  async function restore(tid: string, before: Partial<TaskDoc>) {
    try {
      await updateTask(tid, before);
      await reloadTasks();
      load();
    } catch {
      showError('Could not undo. Please try again.');
    }
  }

  // Finishing moves the task to its project's last status; un-finishing
  // sends it back to the first. There is no done flag.
  function toggleDone() {
    if (!task || !project) return;
    const target = done ? project.columns[0]?.id : lastCol;
    if (!target) return;
    hapticToggle();
    saveUndoable({ column_id: target }, done ? `Not done: ${task.title}` : `Done: ${task.title}`, 'Could not update this task. Please try again.');
  }

  function setStatus(colId: string) {
    if (!task || !project || colId === task.column_id) return;
    const name = project.columns.find(c => c.id === colId)?.name ?? '';
    saveUndoable({ column_id: colId }, `Moved to ${name}`);
  }

  // Clearing the date also clears a repeat rule (it has nothing to advance
  // from). A reminder that follows the due date moves with it.
  function setDue(v: string) {
    if (!task || (task.due_date ?? '') === v) return;
    const changes: Partial<TaskDoc> = { due_date: v || null };
    if (!v && task.recurrence) changes.recurrence = null;
    if (v && task.remindOnDue) changes.reminder_at = new Date(dueDateToReminderInput(v)).toISOString();
    save(changes, 'Could not save the due date. Please try again.');
  }

  function togglePin() {
    if (!task) return;
    saveUndoable({ pinned: !task.pinned }, task.pinned ? 'Unpinned' : 'Pinned');
  }

  function saveTitle() {
    if (!task || !title.trim()) return;
    if (title !== task.title) save({ title }, 'Could not save the title. Please try again.');
  }
  function commitTitle() {
    titleFocused = false;
    if (!task) return;
    if (!title.trim()) { title = task.title; return; }
    if (title !== task.title) save({ title }, 'Could not save the title. Please try again.');
  }
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLTextAreaElement).blur(); }
  }

  // Notes save on blur, on leaving the screen, and after a long pause in
  // typing. Each save is a history entry, so not after every short pause.
  $: queueNote(body);
  // noteDirty: the user typed. A remote edit that arrived while the note was
  // only focused must not be overwritten by the stale local text.
  let noteDirty = false;
  function queueNote(text: string) {
    if (!task || text === (task.body ?? '')) return;
    noteDirty = true;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNote, 3000);
  }
  function flushNote() {
    clearTimeout(noteTimer);
    noteTimer = undefined;
    if (!noteDirty) return;
    noteDirty = false;
    if (task && body !== (task.body ?? '')) {
      save({ body }, 'Could not save the note. Please try again.').then(ok => { if (!ok) noteDirty = true; });
    }
  }

  function setSteps(next: { text: string; done: boolean }[]) {
    if (!task) return;
    const prev = task.checklist ?? [];
    const tid = task._id;
    save({ checklist: next }, 'Could not save the steps. Please try again.').then(ok => {
      if (ok && next.length < prev.length) showToast('Step removed', () => restore(tid, { checklist: prev }));
    });
  }

  async function skip() {
    if (!task) return;
    const before = { due_date: task.due_date, reminder_at: task.reminder_at, checklist: task.checklist };
    const tid = task._id;
    try {
      const next = await skipRecurrence(tid);
      await reloadTasks();
      load();
      showToast(next?.due_date ? `Next: ${shortDate(next.due_date)}` : 'Skipped', () => restore(tid, before));
    } catch {
      showError('Could not skip to the next one. Please try again.');
    }
  }

  async function duplicate() {
    if (!task) return;
    try {
      const copy = await duplicateTask(task._id);
      await reloadTasks();
      push({ k: 'task', id: copy._id });
    } catch {
      showError('Could not duplicate this task. Please try again.');
    }
  }

  async function archive() {
    if (!task) return;
    const tid = task._id;
    try {
      await archiveTask(tid);
      await reloadTasks();
      back();
      showToast('Archived', async () => {
        try { await unarchiveTask(tid); await reloadTasks(); }
        catch { showError('Could not undo. Please try again.'); }
      });
    } catch {
      showError('Could not archive this task. Please try again.');
    }
  }

  // Soft delete, no confirm: App shows its own Undo toast for it.
  async function remove() {
    if (!task) return;
    const tid = task._id;
    try {
      await deleteTask(tid);
      await reloadTasks();
      back();
    } catch {
      showError('Could not delete this task. Please try again.');
    }
  }

  // ── Duplicate nudges (never block saving) ─────────────────────────────────
  let titleHint = '';
  let titleHintTimer: ReturnType<typeof setTimeout> | undefined;
  $: if (task) checkTitle(title, task.project_id, task._id);
  // A slow lookup must not overwrite the answer for newer text.
  let titleSeq = 0, noteSeq = 0;
  function checkTitle(t: string, projectId: string, excludeId: string) {
    clearTimeout(titleHintTimer);
    const mine = ++titleSeq;
    titleHintTimer = setTimeout(async () => {
      if (!t.trim()) { titleHint = ''; return; }
      try {
        const m = await findTasksByTitleInProject(projectId, t, excludeId);
        if (mine === titleSeq) titleHint = m.length ? `Another task in this project is called "${t.trim()}".` : '';
      } catch { if (mine === titleSeq) titleHint = ''; }
    }, 350);
  }

  let noteHint = '';
  let noteHintTimer: ReturnType<typeof setTimeout> | undefined;
  $: if (task) checkNote(body, task._id);
  function checkNote(text: string, excludeId: string) {
    clearTimeout(noteHintTimer);
    const mine = ++noteSeq;
    noteHintTimer = setTimeout(async () => {
      try {
        const m = await findSimilarNotes(excludeId, text);
        if (mine === noteSeq) noteHint = m.length ? `Looks like the note on "${m[0].title}".` : '';
      } catch { if (mine === noteSeq) noteHint = ''; }
    }, 350);
  }

  function onHide() { if (!document.hidden) return; flushNote(); if (titleFocused) saveTitle(); }
  onMount(() => { document.addEventListener('visibilitychange', onHide); return () => document.removeEventListener('visibilitychange', onHide); });

  onDestroy(() => {
    unsub?.();
    clearTimeout(titleHintTimer); clearTimeout(noteHintTimer);
    flushNote();
    if (titleFocused) commitTitle();
  });

  // ── Sheets ────────────────────────────────────────────────────────────────
  type SheetKind = 'add' | 'due' | 'prio' | 'tags' | 'reminder' | 'repeat' | 'blocked' | 'related' | 'files' | 'fields' | 'more' | 'history';
  const SHEET_TITLE: Record<SheetKind, string> = {
    add: 'Add', due: 'Due', prio: 'Priority', tags: 'Tags', reminder: 'Reminder', repeat: 'Repeat',
    blocked: 'Blocked by', related: 'Related tasks', files: 'Attachments', fields: 'Fields', more: 'More', history: 'Task history',
  };
  let sheet: SheetKind | null = null;
  let sheetSession = 0;
  // Runs once the open sheet has finished closing, so a follow-up (another
  // sheet, a pushed screen, a confirm) never races the sheet's history entry.
  let afterClose: (() => void) | null = null;
  function openSheet(k: SheetKind) {
    sheet = k; sheetSession++;
    if (k === 'more') loadSiblings();
  }

  // Move up/down: within its status and its pinned group, as the board orders it.
  let siblings: TaskDoc[] = [];
  async function loadSiblings() {
    if (!task) return;
    try { siblings = await getTasksForProject(task.project_id); } catch { siblings = []; }
  }
  $: col = task ? columnTasks(siblings.map(t => (t._id === task!._id ? task! : t)), task.column_id) : [];
  $: upPos = task ? stepPosition(col, task, -1) : null;
  $: downPos = task ? stepPosition(col, task, 1) : null;
  const move = (position: number) => save({ position }, 'Could not move this task. Please try again.');
  function afterClosing(close: () => void, fn: () => void) { afterClose = fn; close(); }
  function onSheetClosed() {
    const k = sheet;
    sheet = null;
    // Setting or clearing a value swaps its "+" chip for a row (or back), so
    // the control that opened the sheet may be gone; focus its replacement.
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(`[data-kind="${k}"]`)?.focus();
    });
    const fn = afterClose;
    afterClose = null;
    fn?.();
  }

  // ── Row values ────────────────────────────────────────────────────────────
  const REPEAT_WORD = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
  const UNIT = { daily: 'days', weekly: 'weeks', monthly: 'months' };
  $: lastColByProject = Object.fromEntries($projects.map(p => [p._id, p.columns.at(-1)?.id]));
  $: openBlockers = blocking.filter(b => !isBlockerResolved(b, lastColByProject)).length;
  $: pill = task ? duePill(task.due_date, done, $today) : null;
  $: reminderText = task?.reminder_at ? reminderLabel(task.reminder_at, $today) : '';
  function reminderLabel(iso: string, todayStr: string) {
    const d = new Date(iso);
    const day = localDateStr(d);
    return `${fmtTime(d)}, ${day === todayStr ? 'today' : shortDate(day)}`;
  }
  $: repeatText = !task?.recurrence ? ''
    : (task.recurrenceInterval ?? 1) > 1
      ? `Every ${task.recurrenceInterval} ${UNIT[task.recurrence]}` + (task.recurrence === 'daily' && task.recurrenceWeekdaysOnly ? ', weekdays' : '')
      : task.recurrence === 'daily' && task.recurrenceWeekdaysOnly ? 'Weekdays' : REPEAT_WORD[task.recurrence];
  $: dueText = !pill ? '' : task?.due_date && pill.text !== shortDate(task.due_date) ? `${pill.text} · ${shortDate(task.due_date)}` : pill.text;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  // Every detail that isn't set yet, in the order the Add sheet lists them.
  type AddKind = 'reminder' | 'repeat' | 'blocked' | 'related' | 'files' | 'fields';
  $: unset = ([
    !reminderText && { kind: 'reminder', label: 'Reminder', word: 'reminder', icon: I.bell },
    !repeatText && { kind: 'repeat', label: 'Repeat', word: 'repeat', icon: I.repeat },
    !blocking.length && { kind: 'blocked', label: 'Blocked by', word: 'links', icon: I.block },
    !related.length && { kind: 'related', label: 'Related', word: 'links', icon: I.link },
    !files && { kind: 'files', label: 'Attachment', word: 'attachment', icon: I.clip },
    fields.length > 0 && !fieldsSet && { kind: 'fields', label: 'Field', word: 'fields', icon: I.field },
  ] as const).filter(Boolean) as { kind: AddKind; label: string; word: string; icon: string }[];
  $: addWords = [...new Set(unset.map(u => u.word))];
  $: addText = `Add ${addWords.slice(0, 3).join(', ')}${addWords.length > 3 ? '…' : ''}`;
  // Keeps the current status in view in a bar that scrolls sideways.
  function centre(node: HTMLElement, on: boolean) {
    const go = (yes: boolean) => { const bar = node.parentElement; if (yes && bar) bar.scrollLeft = node.offsetLeft - (bar.clientWidth - node.clientWidth) / 2; };
    go(on);
    return { update: go };
  }
  $: fieldsSet = fields.filter(f => { const v = task?.custom_values?.[f.id]; return v !== null && v !== undefined && v !== ''; }).length;
  $: files = task?.attachments?.length ?? 0;
  $: steps = task?.checklist ?? [];
  $: tagColor = (t: string) => soften(resolveTagColor(t, colors));
  $: canFinish = (project?.columns.length ?? 0) > 1;

  // The bar fills in and shows the title once the title field has scrolled
  // under it (64px: the bar's height).
  let stuck = false;
  function watchTitle(node: HTMLElement) {
    if (typeof IntersectionObserver === 'undefined') return;
    // A fast fling can batch several entries; the newest is the current state.
    const io = new IntersectionObserver(entries => { stuck = !entries[entries.length - 1].isIntersecting; },
      { root: node.closest('.screen'), rootMargin: '-64px 0px 0px 0px' });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  function autosize(node: HTMLTextAreaElement, _value: string) {
    const fit = () => { node.style.height = 'auto'; node.style.height = node.scrollHeight + 'px'; };
    fit();
    return { update: fit };
  }
</script>

<!-- Order, top to bottom: title, note, fields, steps. The bar's heading
     shows the title only once the title field has scrolled under it. -->
{#if !task}
  <div class="tbar"><TopBar title="Task" /></div>
  {#if loaded}<p class="p-empty">This task was deleted.</p>{/if}
{:else}
  <div class="tbar" class:stuck>
    <TopBar title={task.title}>
      <button class="ib" class:on={task.pinned} aria-pressed={!!task.pinned} aria-label={task.pinned ? 'Unpin' : 'Pin'} on:click={togglePin}>{@html I.pin}</button>
      <button class="ib" aria-label="More" on:click={() => openSheet('more')}>{@html I.more}</button>
    </TopBar>
  </div>

  <div class="crumb">
    {#if space}<span class="p-dot" style:background={soften(space.color)}></span>{/if}<span>{space ? `${space.name} · ` : ''}{project?.name ?? ''}</span>{#if task.archived}<span class="p-pill">Archived</span>{/if}
  </div>

  <div class="ttl" use:watchTitle>
    {#if canFinish}<button class="chk" class:prio={task.priority >= 2 && !!PRIORITY_COLOR[task.priority]} style:--prio={task.priority >= 2 ? PRIORITY_COLOR[task.priority] ?? null : null} class:on={done} aria-label={done ? 'Mark not done' : 'Finish'} on:click={toggleDone}><svg class="p-loop" viewBox="0 0 26 26" aria-hidden="true"><path pathLength="1" d="M13 1 A12 12 0 1 1 12.9 1 A12 12 0 0 1 19 2.6" /></svg></button>{/if}
    <textarea rows="1" bind:value={title} use:autosize={title} aria-label="Title" placeholder="Task title"
      on:focus={() => titleFocused = true} on:blur={commitTitle} on:keydown={onTitleKey}></textarea>
  </div>
  {#if titleHint}<p class="p-say hint" class:indent={canFinish}>{titleHint}</p>{/if}

  <div class="note" class:indent={canFinish} on:focusin={() => noteFocused = true} on:focusout={() => { noteFocused = false; flushNote(); }} role="group" aria-label="Note">
    {#if NoteEditor}<svelte:component this={NoteEditor} bind:value={body} placeholderText="Add a note" />{/if}
  </div>
  {#if body.length > 500}<p class="p-say count">{body.length} characters</p>{/if}
  {#if noteHint}<p class="p-say hint" class:indent={canFinish}>{noteHint}</p>{/if}

  {#if project && project.columns.length > 1}
    <!-- The last status is done: picking it fills the ring like finishing. -->
    <div class="stbar" role="group" aria-label="Status">
      {#each project.columns as c (c.id)}
        <button class:on={c.id === task.column_id} aria-pressed={c.id === task.column_id} use:centre={c.id === task.column_id} on:click={() => setStatus(c.id)}>{c.name}</button>
      {/each}
    </div>
  {/if}

  <!-- Rows show values, not labels; each still names itself for screen readers. -->
  <div class="p-group vals">
    <button class="p-row" aria-label="Due: {dueText || 'none'}" on:click={() => openSheet('due')}>
      <span class="p-ico">{@html I.today}</span>
      {#if pill}<span class="p-k {pill.tone}"><span>{dueText}</span></span>{:else}<span class="p-k empty"><span>Add due date</span></span>{/if}
    </button>
    {#if reminderText}
      <button class="p-row" data-kind="reminder" aria-label="Reminder: {reminderText}" on:click={() => openSheet('reminder')}>
        <span class="p-ico">{@html I.bell}</span><span class="p-k"><span>{reminderText}</span></span>
      </button>
    {/if}
    {#if repeatText}
      <button class="p-row" data-kind="repeat" aria-label="Repeat: {repeatText}" on:click={() => openSheet('repeat')}>
        <span class="p-ico">{@html I.repeat}</span><span class="p-k"><span>{repeatText}</span></span>
      </button>
    {/if}
    <button class="p-row" aria-label="Priority: {PRIORITY_LABEL[task.priority]}" on:click={() => openSheet('prio')}>
      <span class="p-ico">{@html I.flag}</span>
      <span class="p-k"><span><span class="p-dot" style:background={soften(PRIORITY_COLOR[task.priority])}></span>{PRIORITY_LABEL[task.priority]} priority</span></span>
    </button>
    <button class="p-row" aria-label="Tags: {task.tags.length ? task.tags.map(t => '#' + t).join(' ') : 'none'}" on:click={() => openSheet('tags')}>
      <span class="p-ico">{@html I.tag}</span>
      {#if task.tags.length}
        <span class="p-k tags">{#each task.tags.slice(0, 3) as t (t)}<span class="p-tag" style="--tag:{tagColor(t)}">#{t}</span>{/each}{#if task.tags.length > 3}<span class="more-tags">+{task.tags.length - 3}</span>{/if}</span>
      {:else}<span class="p-k empty"><span>Add tags</span></span>{/if}
    </button>
    {#if blocking.length}
      <button class="p-row" data-kind="blocked" aria-label="Blocked by: {openBlockers ? openBlockers + ' open' : blocking.length + ' done'}" on:click={() => openSheet('blocked')}>
        <span class="p-ico">{@html I.block}</span>
        <span class="p-k"><span>{#if openBlockers}<span class="blk">Blocked by {plural(openBlockers, 'open task')}</span>{:else}{plural(blocking.length, 'blocker')} done{/if}</span></span>
      </button>
    {/if}
    {#if related.length}
      <button class="p-row" data-kind="related" aria-label="Related: {related.length}" on:click={() => openSheet('related')}>
        <span class="p-ico">{@html I.link}</span><span class="p-k"><span>{plural(related.length, 'related task')}</span></span>
      </button>
    {/if}
    {#if files}
      <button class="p-row" data-kind="files" aria-label="Attachments: {files}" on:click={() => openSheet('files')}>
        <span class="p-ico">{@html I.clip}</span><span class="p-k"><span>{plural(files, 'attachment')}</span></span>
      </button>
    {/if}
    {#if fieldsSet}
      <button class="p-row" data-kind="fields" aria-label="Fields: {fieldsSet} set" on:click={() => openSheet('fields')}>
        <span class="p-ico">{@html I.field}</span><span class="p-k"><span>{plural(fieldsSet, 'field')} set</span></span>
      </button>
    {/if}
    {#if unset.length}
      <button class="p-row add" data-kind="add" on:click={() => openSheet('add')}>
        <span class="p-ico">{@html I.plus}</span><span class="p-k"><span>{addText}</span></span>
      </button>
    {/if}
  </div>

  <Steps items={steps} on:change={e => setSteps(e.detail)} />
{/if}

{#if sheet}
  {#key sheetSession}
    <Sheet title={SHEET_TITLE[sheet]} on:close={onSheetClosed} let:close>
      {#if !task}
        <p class="p-empty">This task was deleted.</p>
      {:else if sheet === 'add'}
        <div class="p-group">
          {#each unset as u (u.kind)}
            <button class="p-row" aria-label="Add {u.label.toLowerCase()}" on:click={() => { const k = u.kind; afterClosing(close, () => openSheet(k)); }}>
              <span class="p-ico">{@html u.icon}</span><span class="p-k"><span>{u.label}</span></span>
            </button>
          {/each}
        </div>
      {:else if sheet === 'due'}
        <DueSheet value={task.due_date} on:pick={e => { setDue(e.detail); close(); }} />
      {:else if sheet === 'prio'}
        <Pick options={[3, 2, 1].map(p => ({ value: String(p), label: PRIORITY_LABEL[p], dot: soften(PRIORITY_COLOR[p]) }))} current={String(task.priority)}
          on:pick={e => { save({ priority: Number(e.detail) as 1 | 2 | 3 }, 'Could not save the priority. Please try again.'); close(); }} />
      {:else if sheet === 'tags'}
        <TagsSheet {task} {colors} {save} on:colors={loadColors} />
      {:else if sheet === 'reminder'}
        <ReminderSheet {task} {save} on:done={close} />
      {:else if sheet === 'repeat'}
        <RepeatSheet {task} {save} on:skip={() => afterClosing(close, skip)} />
      {:else if sheet === 'blocked' || sheet === 'related'}
        <LinksSheet {task} mode={sheet} linked={sheet === 'blocked' ? blocking : related}
          on:changed={load} on:open={e => { const to = e.detail; afterClosing(close, () => push({ k: 'task', id: to })); }} />
      {:else if sheet === 'files'}
        <AttachmentsSheet {task} on:changed={load} />
      {:else if sheet === 'fields'}
        <FieldsSheet {task} {fields} {save} />
      {:else if sheet === 'history'}
        <TaskHistoryPanel taskId={task._id} />
      {:else if sheet === 'more'}
        <div class="p-group">
          <button class="p-row" on:click={() => afterClosing(close, () => openSheet('history'))}><span class="p-ico">{@html I.clock}</span><span class="p-k"><span>History</span></span></button>
          {#if upPos !== null}<button class="p-row" on:click={() => { const p = upPos ?? 0; afterClosing(close, () => move(p)); }}><span class="p-ico">{@html I.up}</span><span class="p-k"><span>Move up</span></span></button>{/if}
          {#if downPos !== null}<button class="p-row" on:click={() => { const p = downPos ?? 0; afterClosing(close, () => move(p)); }}><span class="p-ico">{@html I.down}</span><span class="p-k"><span>Move down</span></span></button>{/if}
          <button class="p-row" on:click={() => afterClosing(close, duplicate)}><span class="p-ico">{@html I.copy}</span><span class="p-k"><span>Duplicate</span></span></button>
          <button class="p-row" on:click={() => afterClosing(close, archive)}><span class="p-ico">{@html I.arch}</span><span class="p-k"><span>Archive</span></span></button>
        </div>
        <div class="p-group">
          <button class="p-row danger" on:click={() => afterClosing(close, remove)}><span class="p-ico">{@html I.trash}</span><span class="p-k"><span>Delete</span></span></button>
        </div>
      {/if}
    </Sheet>
  {/key}
{/if}

<style>
  .crumb { display: flex; align-items: center; gap: 6px; font-size: var(--p-fs-s); color: var(--faint); margin: 0 2px 8px; flex-wrap: wrap; }
  .crumb .p-pill { margin-left: 4px; }
  .ttl { display: flex; gap: 12px; align-items: flex-start; margin: 0 2px 6px; }
  .ttl textarea {
    flex: 1; min-width: 0; border: 0; background: none; color: var(--text); resize: none; overflow: hidden;
    font: inherit; font-size: var(--p-fs-t); font-weight: 700; letter-spacing: -.015em; line-height: 1.22; padding: 0;
  }
  .ttl textarea { transition: box-shadow var(--dur-hover) var(--ease-hover); }
  .ttl textarea:focus { outline: none; box-shadow: 0 2px 0 var(--accent); }
  .ttl textarea::placeholder { color: var(--faint); }
  .chk {
    width: 26px; height: 26px; margin-top: 3px; border-radius: 50%; flex-shrink: 0; position: relative; padding: 0; cursor: pointer;
    background: none; border: 2px solid var(--check-ring);
  }
  .chk::before { content: ''; position: absolute; inset: -10px; }
  .chk:not(.on):active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  /* The fill and tick pop in (decelerate) and leave faster (accelerate). */
  .chk { transition: background var(--dur-small-out) var(--ease-accelerate), border-color var(--dur-small-out) var(--ease-accelerate); }
  .chk::after {
    content: ''; position: absolute; left: 7.5px; top: 3.5px; width: 6px; height: 11px;
    border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg) scale(.4); opacity: 0;
    transition: transform var(--dur-small-out) var(--ease-accelerate), opacity var(--dur-small-out) var(--ease-accelerate);
  }
  .chk.prio { border-color: color-mix(in srgb, var(--prio) 62%, var(--text)); background: color-mix(in srgb, var(--prio) 14%, transparent); }
  .chk.on { background: var(--accent); border-color: var(--accent); transition: background var(--dur-small) var(--ease-decelerate), border-color var(--dur-small) var(--ease-decelerate); }
  .chk.on::after { transform: rotate(45deg) scale(1); opacity: 1; transition: transform var(--dur-small) var(--ease-decelerate), opacity var(--dur-small) var(--ease-decelerate); }
  /* The fill and tick wait for the loop (phone.css .p-loop) to close. */
  .chk.on, .chk.on::after { transition-delay: var(--dur-large); }
  .tbar {
    position: sticky; top: 0; z-index: 3; margin: 0 -16px; padding: 0 16px; background: var(--bg); box-shadow: 0 1px 0 transparent;
    transition: background var(--dur-small-out) var(--ease-standard), box-shadow var(--dur-small-out) var(--ease-standard);
  }
  .tbar.stuck { background: var(--surface); box-shadow: 0 1px 0 var(--border); transition-duration: var(--dur-small); }
  .tbar :global(h1) { font-size: var(--p-fs-xl); opacity: 0; transition: opacity var(--dur-small-out) var(--ease-accelerate); }
  .tbar.stuck :global(h1) { opacity: 1; transition: opacity var(--dur-small) var(--ease-decelerate); }
  .hint { color: var(--faint); }
  .indent { margin-left: 40px; }
  .more-tags { font-size: var(--p-fs-s); color: var(--muted); }
  .blk { color: var(--overdue-ink); font-weight: 600; }
  /* A quiet line under the title that grows with its text; no box. */
  .note { margin: 0 2px 16px; }
  .note :global(.md-editor), div.note:focus-within :global(.md-editor) { border: 0; border-radius: 0; background: none; min-height: 0; }
  .note :global(.cm-content) { font-size: var(--p-fs-m); padding: 4px 0; }
  .stbar { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; margin: 0 0 12px; padding: 3px; border-radius: 12px; background: var(--col-bg); scroll-behavior: smooth; }
  .stbar::-webkit-scrollbar { display: none; }
  .stbar button { flex: 1 0 auto; min-width: 72px; padding: 8px 12px; border: 0; border-radius: 9px; background: none; cursor: pointer; white-space: nowrap;
    font: inherit; font-size: var(--p-fs-s); font-weight: 600; color: var(--muted); transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover); }
  .stbar button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  .vals .p-k > span { display: flex; align-items: center; gap: 6px; }
  .vals .p-k.late, .vals .p-k.today { font-weight: 600; }
  .vals .p-k.late { color: var(--overdue-ink); }
  .vals .p-k.today { color: var(--due-soon-ink); }
  .vals .p-k.empty, .vals .add { color: var(--faint); }
  .vals .add { color: var(--accent); font-weight: 600; }
  .vals .add .p-ico { color: var(--accent); }
  .vals .tags { flex-direction: row; flex-wrap: wrap; gap: 6px; align-items: center; }
  .count { text-align: right; font-size: var(--p-fs-xs); color: var(--faint); margin-top: -8px; }
</style>
