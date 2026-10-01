<script lang="ts">
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
  import { I } from './icons';
  import TopBar from './TopBar.svelte';
  import Sheet from './Sheet.svelte';
  import MarkdownEditor from '../carddetail/MarkdownEditor.svelte';
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
        if (!noteFocused && !noteTimer) body = task.body ?? '';
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
    if (task && body !== (task.body ?? '')) save({ body }, 'Could not save the note. Please try again.');
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
  function checkTitle(t: string, projectId: string, excludeId: string) {
    clearTimeout(titleHintTimer);
    titleHintTimer = setTimeout(async () => {
      if (!t.trim()) { titleHint = ''; return; }
      try {
        const m = await findTasksByTitleInProject(projectId, t, excludeId);
        titleHint = m.length ? `Another task in this project is called "${t.trim()}".` : '';
      } catch { titleHint = ''; }
    }, 350);
  }

  let noteHint = '';
  let noteHintTimer: ReturnType<typeof setTimeout> | undefined;
  $: if (task) checkNote(body, task._id);
  function checkNote(text: string, excludeId: string) {
    clearTimeout(noteHintTimer);
    noteHintTimer = setTimeout(async () => {
      try {
        const m = await findSimilarNotes(excludeId, text);
        noteHint = m.length ? `Looks like the note on "${m[0].title}".` : '';
      } catch { noteHint = ''; }
    }, 350);
  }

  function onHide() { if (document.hidden) flushNote(); }
  onMount(() => { document.addEventListener('visibilitychange', onHide); return () => document.removeEventListener('visibilitychange', onHide); });

  onDestroy(() => {
    unsub?.();
    clearTimeout(titleHintTimer); clearTimeout(noteHintTimer);
    flushNote();
    if (titleFocused) commitTitle();
  });

  // ── Sheets ────────────────────────────────────────────────────────────────
  type SheetKind = 'status' | 'due' | 'prio' | 'tags' | 'reminder' | 'repeat' | 'blocked' | 'related' | 'files' | 'fields' | 'more' | 'history';
  const SHEET_TITLE: Record<SheetKind, string> = {
    status: 'Status', due: 'Due', prio: 'Priority', tags: 'Tags', reminder: 'Reminder', repeat: 'Repeat',
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
    sheet = null;
    const fn = afterClose;
    afterClose = null;
    fn?.();
  }

  // ── Row values ────────────────────────────────────────────────────────────
  const REPEAT_WORD = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
  const UNIT = { daily: 'days', weekly: 'weeks', monthly: 'months' };
  $: lastColByProject = Object.fromEntries($projects.map(p => [p._id, p.columns.at(-1)?.id]));
  $: openBlockers = blocking.filter(b => !isBlockerResolved(b, lastColByProject)).length;
  $: pill = task ? duePill(task.due_date, done) : null;
  $: statusName = project?.columns.find(c => c.id === task?.column_id)?.name ?? '—';
  $: reminderText = task?.reminder_at ? reminderLabel(task.reminder_at) : '';
  function reminderLabel(iso: string) {
    const d = new Date(iso);
    const day = localDateStr(d);
    return `${fmtTime(d)}, ${day === localDateStr(new Date()) ? 'today' : shortDate(day)}`;
  }
  $: repeatText = task?.recurrence
    ? ((task.recurrenceInterval ?? 1) > 1 ? `Every ${task.recurrenceInterval} ${UNIT[task.recurrence]}` : REPEAT_WORD[task.recurrence])
      + (task.recurrence === 'daily' && task.recurrenceWeekdaysOnly ? ', weekdays' : '')
    : '';
  $: fieldsSet = fields.filter(f => { const v = task?.custom_values?.[f.id]; return v !== null && v !== undefined && v !== ''; }).length;
  $: steps = task?.checklist ?? [];
  $: tagColor = (t: string) => soften(resolveTagColor(t, colors));
  $: canFinish = (project?.columns.length ?? 0) > 1;

  function autosize(node: HTMLTextAreaElement, _value: string) {
    const fit = () => { node.style.height = 'auto'; node.style.height = node.scrollHeight + 'px'; };
    fit();
    return { update: fit };
  }
</script>

<!-- The heading is for screen readers; the title field below is what shows. -->
{#if !task}
  <div class="tbar"><TopBar title="Task" /></div>
  {#if loaded}<p class="p-empty">This task was deleted.</p>{/if}
{:else}
  <div class="tbar">
    <TopBar title="Task">
      <button class="ib" class:on={task.pinned} aria-pressed={!!task.pinned} aria-label={task.pinned ? 'Unpin' : 'Pin'} on:click={togglePin}>{@html I.pin}</button>
      <button class="ib" aria-label="More" on:click={() => openSheet('more')}>{@html I.more}</button>
    </TopBar>
  </div>

  <div class="crumb">
    {#if space}<span class="p-dot" style:background={soften(space.color)}></span>{/if}<span>{space ? `${space.name} · ` : ''}{project?.name ?? ''}</span>{#if task.archived}<span class="p-pill">Archived</span>{/if}
  </div>

  <div class="ttl">
    {#if canFinish}<button class="chk" class:on={done} aria-label={done ? 'Mark not done' : 'Finish'} on:click={toggleDone}></button>{/if}
    <textarea rows="1" bind:value={title} use:autosize={title} aria-label="Title" placeholder="Task title"
      on:focus={() => titleFocused = true} on:blur={commitTitle} on:keydown={onTitleKey}></textarea>
  </div>
  {#if titleHint}<p class="p-say hint">{titleHint}</p>{/if}

  <div class="p-group">
    <button class="p-row" on:click={() => openSheet('status')}>
      <span class="p-ico">{@html I.status}</span><span class="p-k"><span>Status</span></span>
      <span class="p-v set">{statusName}</span>
    </button>
    <button class="p-row" on:click={() => openSheet('due')}>
      <span class="p-ico">{@html I.today}</span><span class="p-k"><span>Due</span></span>
      <span class="p-v" class:set={!!pill}>{#if pill}<span class="p-pill {pill.tone}">{pill.text}</span>{:else}None{/if}</span>
    </button>
    <button class="p-row" on:click={() => openSheet('prio')}>
      <span class="p-ico">{@html I.flag}</span><span class="p-k"><span>Priority</span></span>
      <span class="p-v set"><span class="p-dot" style:background={soften(PRIORITY_COLOR[task.priority])}></span>{PRIORITY_LABEL[task.priority]}</span>
    </button>
    <button class="p-row" on:click={() => openSheet('tags')}>
      <span class="p-ico">{@html I.tag}</span><span class="p-k"><span>Tags</span></span>
      <span class="p-v tags" class:set={task.tags.length > 0}>
        {#each task.tags.slice(0, 2) as t (t)}<span class="p-tag" style="--tag:{tagColor(t)}">#{t}</span>{:else}None{/each}
        {#if task.tags.length > 2}<span class="more-tags">+{task.tags.length - 2}</span>{/if}
      </span>
    </button>
  </div>

  <div class="p-group">
    <button class="p-row" on:click={() => openSheet('reminder')}>
      <span class="p-ico">{@html I.bell}</span><span class="p-k"><span>Reminder</span></span>
      <span class="p-v" class:set={!!reminderText}>{reminderText || 'None'}</span>
    </button>
    <button class="p-row" on:click={() => openSheet('repeat')}>
      <span class="p-ico">{@html I.repeat}</span><span class="p-k"><span>Repeat</span></span>
      <span class="p-v" class:set={!!repeatText}>{repeatText || 'Never'}</span>
    </button>
  </div>

  <div class="p-group">
    <button class="p-row" on:click={() => openSheet('blocked')}>
      <span class="p-ico">{@html I.block}</span><span class="p-k"><span>Blocked by</span></span>
      <span class="p-v" class:set={blocking.length > 0}>
        {#if !blocking.length}Nothing{:else if openBlockers}<span class="blk">{openBlockers} open</span>{:else}{blocking.length} done{/if}
      </span>
    </button>
    <button class="p-row" on:click={() => openSheet('related')}>
      <span class="p-ico">{@html I.link}</span><span class="p-k"><span>Related</span></span>
      <span class="p-v" class:set={related.length > 0}>{related.length || 'None'}</span>
    </button>
    <button class="p-row" on:click={() => openSheet('files')}>
      <span class="p-ico">{@html I.clip}</span><span class="p-k"><span>Attachments</span></span>
      <span class="p-v" class:set={!!task.attachments?.length}>{task.attachments?.length || 'None'}</span>
    </button>
    {#if fields.length}
      <button class="p-row" on:click={() => openSheet('fields')}>
        <span class="p-ico">{@html I.field}</span><span class="p-k"><span>Fields</span></span>
        <span class="p-v" class:set={fieldsSet > 0}>{fieldsSet ? `${fieldsSet} set` : 'None'}</span>
      </button>
    {/if}
  </div>

  <div class="p-sec">Note</div>
  <div class="note" on:focusin={() => noteFocused = true} on:focusout={() => { noteFocused = false; flushNote(); }} role="group" aria-label="Note">
    <MarkdownEditor bind:value={body} placeholderText="Add a note" />
  </div>
  {#if body.length > 500}<p class="p-say count">{body.length} characters</p>{/if}
  {#if noteHint}<p class="p-say hint">{noteHint}</p>{/if}

  <Steps items={steps} on:change={e => setSteps(e.detail)} />
{/if}

{#if sheet}
  {#key sheetSession}
    <Sheet title={SHEET_TITLE[sheet]} on:close={onSheetClosed} let:close>
      {#if !task}
        <p class="p-empty">This task was deleted.</p>
      {:else if sheet === 'status'}
        <Pick options={(project?.columns ?? []).map(c => ({ value: c.id, label: c.name }))} current={task.column_id}
          on:pick={e => { setStatus(e.detail); close(); }} />
        {#if project && project.columns.length > 1}<p class="p-say">The last status counts as done.</p>{/if}
      {:else if sheet === 'due'}
        <DueSheet value={task.due_date} on:pick={e => { setDue(e.detail); close(); }} />
      {:else if sheet === 'prio'}
        <Pick options={[3, 2, 1].map(p => ({ value: String(p), label: PRIORITY_LABEL[p], dot: soften(PRIORITY_COLOR[p]) }))} current={String(task.priority)}
          on:pick={e => { save({ priority: Number(e.detail) as 1 | 2 | 3 }, 'Could not save the priority. Please try again.'); close(); }} />
      {:else if sheet === 'tags'}
        <TagsSheet {task} {colors} {save} on:colors={loadColors} />
      {:else if sheet === 'reminder'}
        <ReminderSheet {task} {save} />
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
  .crumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--faint); margin: 0 2px 8px; flex-wrap: wrap; }
  .crumb .p-pill { margin-left: 4px; }
  .ttl { display: flex; gap: 12px; align-items: flex-start; margin: 0 2px 16px; }
  .ttl textarea {
    flex: 1; min-width: 0; border: 0; background: none; color: var(--text); resize: none; overflow: hidden;
    font: inherit; font-size: 24px; font-weight: 700; letter-spacing: -.015em; line-height: 1.22; padding: 0;
  }
  .ttl textarea:focus-visible { outline: none; box-shadow: 0 2px 0 var(--accent); }
  .ttl textarea::placeholder { color: var(--faint); }
  .chk {
    width: 26px; height: 26px; margin-top: 3px; border-radius: 50%; flex-shrink: 0; position: relative; padding: 0; cursor: pointer;
    background: none; border: 2px solid color-mix(in srgb, var(--faint) 60%, transparent);
  }
  .chk::before { content: ''; position: absolute; inset: -10px; }
  .chk.on { background: var(--accent); border-color: var(--accent); }
  .chk.on::after {
    content: ''; position: absolute; left: 7.5px; top: 3.5px; width: 6px; height: 11px;
    border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg);
  }
  .tbar { display: contents; }
  .tbar :global(h1) { clip-path: inset(50%); }
  .hint { color: var(--faint); margin-top: -10px; }
  .p-v .p-pill { font-size: 13px; }
  .tags { min-width: 0; flex-shrink: 1; gap: 4px; }
  .more-tags { font-size: 13px; color: var(--muted); }
  .blk { color: var(--overdue-ink); font-weight: 600; }
  .note { margin-bottom: 14px; }
  .note :global(.md-editor) { background: var(--surface); border-radius: 14px; min-height: 96px; }
  .note :global(.cm-content) { font-size: 15px; padding: 12px 14px; }
  .count { text-align: right; font-size: 12.5px; color: var(--faint); margin-top: -8px; }
</style>
