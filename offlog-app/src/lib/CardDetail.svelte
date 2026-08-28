<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { scrimIn, scrimOut, centredIn, centredOut, popIn, popOut, revealIn, revealOut, exitMs } from './motion';
  import type { TaskDoc, ProjectDoc, CustomFieldDef, TaskAttachment } from './types';
  import { updateTask, deleteTask, getAllTags, archiveTask, duplicateTask, skipRecurrence, getCustomFieldDefs, findTasksByTitleInProject, findSimilarNotes, getRelatedTasks, searchTasksForLinking, linkRelatedTask, unlinkRelatedTask, getBlockingTasks, linkBlockedBy, unlinkBlockedBy, isBlockerResolved, addAttachment, deleteAttachment, getAttachmentBlob, ATTACHMENT_MAX_PER_TASK, getTagColorOverrides, ensureFreshTagColor } from './db';
  import { ATTACHMENT_MAX_BYTES, isAttachmentExtensionAllowed, isAttachmentImage, attachmentExtension, attachmentMimeType } from './attachments';
  import { resolveTagColor } from './tagColors';
  import { PRIORITY_COLOR } from './constants';
  import { reloadTasks, showError, modalOpen, projects } from './store';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import PinStar from './PinStar.svelte';
  import CalendarPicker from './CalendarPicker.svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { findDuplicateChecklistItems } from './utils';
  import { hapticToggle } from './haptics';
  import RepeatReminderBlock from './carddetail/RepeatReminderBlock.svelte';
  import ChecklistBlock from './carddetail/ChecklistBlock.svelte';
  import CustomFieldsBlock from './carddetail/CustomFieldsBlock.svelte';
  import RelatedBlock from './carddetail/RelatedBlock.svelte';
  import BlockedByBlock from './carddetail/BlockedByBlock.svelte';
  import AttachmentsBlock from './carddetail/AttachmentsBlock.svelte';
  import NotesBlock from './carddetail/NotesBlock.svelte';
  import { isoToLocalInput, dateFromToday, dueDateToReminderInput, formatExtrasSummary, blobToBase64, base64ToBlob, downscaleImage, openAttachmentFile } from './carddetail/helpers';
  // Svelte does not run intro transitions on a component's own root elements
  // when the component itself is being created -- and every panel here is
  // created by a parent's {#if}. The result was that no modal in this app
  // animated at all, however carefully its preset was tuned. Gating the
  // markup on a flag set in onMount() makes the elements the product of an
  // UPDATE inside this component, which is what Svelte animates.
  // See docs/motion.md.
  let __introReady = false;
  onMount(() => { __introReady = true; });

  // The same per-tag color used everywhere else (Kanban cards, filters) --
  // one-time fetch, not a live subscribe, since an override changing while
  // this exact card is open is not worth the extra machinery.
  let tagColorOverrides: Record<string, string> = {};
  onMount(() => { getTagColorOverrides().then(o => tagColorOverrides = o).catch(() => {}); });

  export let task: TaskDoc;
  export let project: ProjectDoc;

  const dispatch = createEventDispatcher<{ close: void; openRelated: string }>();
    // Closing hides the markup first and only tells the parent once the outro
  // has played -- the parent's {#if} destroys this component the instant it
  // hears, which would cut the exit off before its first frame.
  //
  // modalStack is deliberately untouched: closeOnBack() still runs
  // history.back() immediately and unwinds its own entry, so back-button
  // behaviour is identical. Only the parent notification waits.
  //
  // The duration is read HERE, at close time, so Reduce Motion is honoured
  // even if it was switched on after this modal opened.
  const requestClose = closeOnBack(() => {
    __introReady = false;
    setTimeout(() => dispatch('close'), exitMs.medium);
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  const DUE_SHORTCUTS: { label: string; days: number; months?: number }[] = [
    { label: 'Today', days: 0 },
    { label: 'Tomorrow', days: 1 },
    { label: '1 week', days: 7 },
    { label: '1 month', days: 0, months: 1 },
  ];

  // Soft guardrail only — a visible counter past this length, not a hard
  // block. Notes are unbounded markdown.
  const NOTES_SOFT_LIMIT = 500;

  let title = task.title;
  let body = task.body;

  // Duplicate nudges never block saving — see utils.ts's header comment.
  // Debounced because both re-fire on every keystroke via the two-way
  // bound title/body inputs, and checkNotesSimilarity scans every task's
  // body in the whole app, not just this project.
  let duplicateTitleHint = '';
  let titleCheckTimer: ReturnType<typeof setTimeout> | undefined;
  $: { clearTimeout(titleCheckTimer); titleCheckTimer = setTimeout(() => checkTitleDuplicate(title, project._id, task._id), 350); }
  async function checkTitleDuplicate(t: string, projectId: string, excludeId?: string) {
    if (!t.trim()) { duplicateTitleHint = ''; return; }
    const matches = await findTasksByTitleInProject(projectId, t, excludeId);
    duplicateTitleHint = matches.length ? `Another task titled "${t.trim()}" already exists in this project.` : '';
  }

  let similarNotesHint = '';
  let notesCheckTimer: ReturnType<typeof setTimeout> | undefined;
  $: { clearTimeout(notesCheckTimer); notesCheckTimer = setTimeout(() => checkNotesSimilarity(body, task._id), 350); }
  async function checkNotesSimilarity(text: string, excludeId?: string) {
    const matches = await findSimilarNotes(excludeId ?? null, text);
    similarNotesHint = matches.length
      ? `This looks similar to notes on "${matches[0].title}" (${Math.round(matches[0].similarity * 100)}% word overlap).`
      : '';
  }
  onDestroy(() => {
    clearTimeout(titleCheckTimer); clearTimeout(notesCheckTimer);
    for (const url of Object.values(thumbnailUrls)) URL.revokeObjectURL(url);
  });
  $: if (showAttachmentsBlock) ensureThumbnails();
  let priority = task.priority;
  // CustomSelect only takes string values — priority stays 1|2|3 for
  // save()/everything else, this is just a bound proxy for the picker.
  let priorityStr = String(priority);
  $: priority = (Number(priorityStr) || 1) as 1 | 2 | 3;
  const statusOptions = project.columns.map(col => ({ value: col.id, label: col.name }));
  const priorityOptions = [
    { value: '1', label: 'Low', dotColor: PRIORITY_COLOR[1] },
    { value: '2', label: 'Medium', dotColor: PRIORITY_COLOR[2] },
    { value: '3', label: 'High', dotColor: PRIORITY_COLOR[3] },
  ];
  let due_date = task.due_date ?? '';
  let reminder_at = task.reminder_at ? isoToLocalInput(task.reminder_at) : '';
  let remindOnDue = task.remindOnDue ?? false;

  $: if (remindOnDue && due_date) reminder_at = dueDateToReminderInput(due_date);
  // Recurrence needs a due_date to advance from — see db.ts's
  // spawnNextRecurrence() comment. Clearing the due date while a repeat
  // rule is set would leave a rule nothing can act on, so clear it too
  // rather than silently keep a rule the UI no longer shows a control for.
  //
  // One select only -- "Not repeating" by default, Day/Week/Month as the
  // other options. Picking a real option reveals the rest of the row
  // (interval number, Weekdays-only pill, Skip-this-one pill) inline, all
  // sharing one explicit control height so the input/select/pills don't
  // render at three different heights. recurrenceStr is the single source
  // of truth; recurrence is a pure derived value, never assigned to.
  const recurrenceOptions = [
    { value: '', label: 'Not repeating' },
    { value: 'daily', label: 'Day' },
    { value: 'weekly', label: 'Week' },
    { value: 'monthly', label: 'Month' },
  ];
  let recurrenceStr = task.recurrence ?? '';
  $: if (!due_date && recurrenceStr) recurrenceStr = '';
  $: recurrence = (recurrenceStr || null) as 'daily' | 'weekly' | 'monthly' | null;
  // Custom recurrence intervals: every N days/weeks/months, plus a
  // "weekdays only" toggle for daily. Kept as a plain string bound to the
  // number input (not a number directly) so an in-progress empty/partial
  // edit doesn't collapse to NaN -- recurrenceInterval below is the
  // derived, clamped value actually sent on save.
  let recurrenceIntervalStr = String(task.recurrenceInterval ?? 1);
  $: recurrenceInterval = Math.max(1, Math.min(365, parseInt(recurrenceIntervalStr, 10) || 1));
  let recurrenceWeekdaysOnly = task.recurrenceWeekdaysOnly ?? false;
  let column_id = task.column_id;
  let tags: string[] = [...(task.tags ?? [])];
  let pinned = task.pinned ?? false;
  // Flat, not nested/reorderable. Batched into save() like tags/custom
  // fields, not an immediate write per toggle — consistent with every
  // other field in this form.
  let checklist: { text: string; done: boolean }[] = (task.checklist ?? []).map(i => ({ ...i }));
  let checklistInput = '';
  $: duplicateChecklistItems = findDuplicateChecklistItems(checklist);
  let tagInput = '';
  let tagSuggestions: string[] = [];
  let otherTagSuggestions: string[] = [];
  let allTags: string[] = [];
  let projectTags: string[] = [];
  let saving = false;
  let showHistory = false;

  // Task linking, non-directional "related to" only. Batched into save()
  // like every other field on this card -- add/remove just edit this local
  // list; the diff against originalRelatedIds is replayed as real
  // linkRelatedTask()/unlinkRelatedTask() calls when Save is actually
  // clicked, so closing the card any other way discards it same as a tag.
  let relatedTasks: TaskDoc[] = [];
  let relatedInput = '';
  let relatedSuggestions: TaskDoc[] = [];
  let originalRelatedIds = new Set<string>();

  async function loadRelatedTasks() {
    relatedTasks = await getRelatedTasks(task._id!);
    originalRelatedIds = new Set(relatedTasks.map(t => t._id!));
  }

  // "Blocked by" — same batched pattern as Related above, kept as its own
  // separate block/field rather than folded into Related, which stays
  // non-directional and dependency-free.
  let blockingTasks: TaskDoc[] = [];
  let blockedByInput = '';
  let blockedBySuggestions: TaskDoc[] = [];
  let originalBlockedByIds = new Set<string>();

  async function loadBlockingTasks() {
    blockingTasks = await getBlockingTasks(task._id!);
    originalBlockedByIds = new Set(blockingTasks.map(t => t._id!));
  }

  $: lastColByProject = Object.fromEntries($projects.map(p => [p._id, p.columns.at(-1)?.id]));
  $: unresolvedBlockers = blockingTasks.filter(b => !isBlockerResolved(b, lastColByProject));

  // Field definitions are global (Settings → Organize → Manage Custom
  // Fields), not managed from here — CardDetail only reads and fills in
  // values. custom_values stays keyed by field id, not name (see
  // types.ts), so a field rename in Settings doesn't orphan values.
  let customFields: CustomFieldDef[] = [];
  let customValues: Record<string, string | number | null> = { ...(task.custom_values ?? {}) };

  // Only the due date *value* is mandatory (joining Status/Priority/
  // Tags); Repeat and Reminder live in Extras along with Checklist/Custom
  // fields/Related/Notes, each as its own compact block. Extras always
  // starts collapsed, regardless of what is already filled in underneath
  // -- never auto-open it just because it has content.
  let showExtras = false;
  // Each of the five blocks inside Extras has its own collapse, under the
  // same never-auto-open rule as the outer Extras toggle: each stays
  // collapsed until clicked, regardless of whether it has content.
  let showRepeatReminder = false;
  let showChecklistBlock = false;
  let showCustomFieldsBlock = false;
  let showRelatedBlock = false;
  let showBlockedByBlock = false;
  let showAttachmentsBlock = false;
  let showNotesBlock = false;
  // Cap how many custom fields show by default — a project with a dozen
  // fields defined shouldn't turn every card into a long form. Anything
  // past the cap is one click away, not hidden entirely.
  const VISIBLE_FIELD_CAP = 3;
  let showAllFields = false;
  $: visibleFields = showAllFields ? customFields : customFields.slice(0, VISIBLE_FIELD_CAP);

  $: extrasSummaryLines = formatExtrasSummary(reminder_at, recurrence, recurrenceInterval, recurrenceWeekdaysOnly, checklist, relatedTasks, blockingTasks, unresolvedBlockers.length, attachments, body);

  // Delete/Archive/Duplicate/history all live in one "⋯" menu — same
  // click-outside-closes pattern CustomSelect.svelte uses, not a new
  // mechanism. Created/Updated timestamps deliberately aren't repeated
  // here: the History panel already shows them once opened.
  let showActionsMenu = false;
  let menuTriggerEl: HTMLButtonElement;
  let menuPanelEl: HTMLDivElement;
  function onWindowClick(e: MouseEvent) {
    if (!showActionsMenu) return;
    const t = e.target as Node;
    if (menuTriggerEl?.contains(t) || menuPanelEl?.contains(t)) return;
    showActionsMenu = false;
  }

  // TaskHistoryPanel is only ever needed if the user clicks "Show history" —
  // loading it as a dynamic import keeps its query/formatting logic out of
  // the main bundle for the common case where nobody opens it.
  let TaskHistoryPanelComp: typeof import('./TaskHistoryPanel.svelte').default | null = null;
  let loadingHistory = false;

  onMount(async () => {
    modalOpen.set(true);
    try {
      [allTags, projectTags, customFields] = await Promise.all([getAllTags(), getAllTags(project._id), getCustomFieldDefs()]);
      await Promise.all([loadRelatedTasks(), loadBlockingTasks()]);
    } catch {
      showError('Failed to load task details. Please try again.');
    }
  });
  onDestroy(() => modalOpen.set(false));

  async function loadHistory() {
    if (showHistory) { showHistory = false; return; }
    if (loadingHistory) return;
    try {
      if (!TaskHistoryPanelComp) {
        loadingHistory = true;
        TaskHistoryPanelComp = (await import('./TaskHistoryPanel.svelte')).default;
      }
      showHistory = true;
    } catch (e) {
      showError('Failed to load task history. Please try again.');
    } finally {
      loadingHistory = false;
    }
  }

  // Tags already used in *this* project are the most likely match, so
  // they're suggested first; tags from elsewhere are still offered, as a
  // clearly separate secondary group rather than one flat list.
  $: {
    const q = tagInput.trim().toLowerCase();
    if (q) {
      tagSuggestions = projectTags.filter(t => t.startsWith(q) && !tags.includes(t));
      otherTagSuggestions = allTags.filter(t => t.startsWith(q) && !tags.includes(t) && !projectTags.includes(t));
    } else {
      tagSuggestions = [];
      otherTagSuggestions = [];
    }
  }

  async function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) {
      const others = tags; // before the push -- tags already on this card
      tags = [...tags, t];
      // Best-effort: a genuinely new tag gets a color that isn't already
      // used by another tag already on this card (or the workspace's
      // most-used, otherwise), so it reads as distinct rather than
      // whatever the hash happened to land on. Never blocks adding the
      // tag itself if this fails.
      try {
        await ensureFreshTagColor(t, others);
        tagColorOverrides = await getTagColorOverrides();
      } catch (e) { console.warn('tag color assignment failed', e); }
    }
    tagInput = '';
  }

  function removeTag(tag: string) { tags = tags.filter(t => t !== tag); }

  function addChecklistItem() {
    const t = checklistInput.trim();
    if (!t) return;
    checklist = [...checklist, { text: t, done: false }];
    checklistInput = '';
  }
  function toggleChecklistItem(i: number) {
    hapticToggle();
    checklist = checklist.map((item, idx) => idx === i ? { ...item, done: !item.done } : item);
  }
  function removeChecklistItem(i: number) {
    checklist = checklist.filter((_, idx) => idx !== i);
  }
  function onChecklistKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
  }

  function onTagKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && !tagInput && tags.length) { tags = tags.slice(0, -1); }
  }

  $: {
    const q = relatedInput.trim();
    if (q) {
      searchTasksForLinking(q, task._id!, relatedTasks.map(t => t._id!)).then(r => relatedSuggestions = r);
    } else {
      relatedSuggestions = [];
    }
  }

  $: {
    const q = blockedByInput.trim();
    if (q) {
      searchTasksForLinking(q, task._id!, blockingTasks.map(t => t._id!)).then(r => blockedBySuggestions = r);
    } else {
      blockedBySuggestions = [];
    }
  }

  function projectNameFor(t: TaskDoc): string {
    return $projects.find(p => p._id === t.project_id)?.name ?? '—';
  }

  // These four just edit the local list -- see relatedTasks' own comment.
  // The suggestion is already a full TaskDoc (searchTasksForLinking()'s
  // result), so no round-trip through the database is needed to display it.
  function addRelated(otherId: string) {
    const found = relatedSuggestions.find(s => s._id === otherId);
    relatedInput = '';
    relatedSuggestions = [];
    if (!found || relatedTasks.some(t => t._id === otherId)) return;
    relatedTasks = [...relatedTasks, found];
  }

  function removeRelated(otherId: string) {
    relatedTasks = relatedTasks.filter(t => t._id !== otherId);
  }

  function addBlockedBy(otherId: string) {
    const found = blockedBySuggestions.find(s => s._id === otherId);
    blockedByInput = '';
    blockedBySuggestions = [];
    if (!found || blockingTasks.some(t => t._id === otherId)) return;
    blockingTasks = [...blockingTasks, found];
  }

  function removeBlockedBy(otherId: string) {
    blockingTasks = blockingTasks.filter(t => t._id !== otherId);
  }

  // Replays the relatedTasks/blockingTasks diffs as real link/unlink calls
  // on Save, in place -- succeeded items are removed from the diff so a
  // second Save (after fixing an error below) doesn't redo them. A blocked-by
  // cycle is only ever caught here, not at add time (see addBlockedBy's own
  // comment): the invalid link is rolled back out of the local list so it
  // doesn't sit there looking like it worked when it never will.
  async function flushRelated(): Promise<string[]> {
    const errors: string[] = [];
    const currentIds = new Set(relatedTasks.map(t => t._id!));
    for (const id of [...originalRelatedIds]) {
      if (currentIds.has(id)) continue;
      try { await unlinkRelatedTask(task._id!, id); originalRelatedIds.delete(id); }
      catch { errors.push('Could not remove a related-task link. Please try again.'); }
    }
    for (const id of currentIds) {
      if (originalRelatedIds.has(id)) continue;
      try { await linkRelatedTask(task._id!, id); originalRelatedIds.add(id); }
      catch { errors.push('Could not link a related task. Please try again.'); }
    }
    return errors;
  }

  async function flushBlockedBy(): Promise<string[]> {
    const errors: string[] = [];
    const currentIds = new Set(blockingTasks.map(t => t._id!));
    for (const id of [...originalBlockedByIds]) {
      if (currentIds.has(id)) continue;
      try { await unlinkBlockedBy(task._id!, id); originalBlockedByIds.delete(id); }
      catch { errors.push('Could not remove a dependency. Please try again.'); }
    }
    for (const id of currentIds) {
      if (originalBlockedByIds.has(id)) continue;
      try {
        await linkBlockedBy(task._id!, id);
        originalBlockedByIds.add(id);
      } catch (e) {
        const name = blockingTasks.find(t => t._id === id)?.title ?? 'that task';
        errors.push(e instanceof Error && e.message === 'circular dependency'
          ? `Can't be blocked by "${name}" — these two tasks already block each other.`
          : `Could not link "${name}" as a blocker. Please try again.`);
        blockingTasks = blockingTasks.filter(t => t._id !== id);
      }
    }
    return errors;
  }

  // File attachments. Batched into save() like every other field -- a
  // pending attachment carries its own base64 payload locally (already
  // downscaled/encoded by attachOneFile below) until Save actually writes
  // it, keyed by a temporary "pending:N" id that doubles as the #each key
  // AttachmentsBlock uses and what removeAttachment() matches on.
  interface PendingAttachment { key: string; filename: string; content_type: string; size: number; base64Data: string }
  let savedAttachments: TaskAttachment[] = [...(task.attachments ?? [])];
  let removedAttachmentKeys = new Set<string>();
  let pendingAttachments: PendingAttachment[] = [];
  let pendingAttachmentSeq = 0;
  let attachmentBusy = false;
  let attachmentError = '';
  let thumbnailUrls: Record<string, string> = {};

  $: attachments = [
    ...savedAttachments.filter(a => !removedAttachmentKeys.has(a.key)),
    ...pendingAttachments.map(p => ({ key: p.key, filename: p.filename, content_type: p.content_type, size: p.size, added_at: '' } as TaskAttachment)),
  ];

  // Returns why the file could not be attached, or null on success. It must
  // NOT write attachmentError itself: picking several files at once runs this
  // per file, and setting a shared message meant the last file decided what
  // the user saw -- a success after a failure wiped the failure entirely, so
  // two of three files attached and nothing said so.
  async function attachOneFile(file: File): Promise<string | null> {
    if (attachments.length >= ATTACHMENT_MAX_PER_TASK) {
      return `"${file.name}" — this task already has ${ATTACHMENT_MAX_PER_TASK} attachments (the max per task).`;
    }
    const ext = attachmentExtension(file.name);
    if (!isAttachmentExtensionAllowed(file.name)) {
      return (ext === 'heic' || ext === 'heif')
        ? `"${file.name}" — HEIC/HEIF photos aren’t supported yet, please share or convert as JPEG first.`
        : `"${file.name}" — unsupported file type: .${ext || '?'}`;
    }
    try {
      const out = isAttachmentImage(file.name)
        ? await downscaleImage(file)
        : { filename: file.name, base64Data: await blobToBase64(file), size: file.size };
      if (out.size > ATTACHMENT_MAX_BYTES) {
        return `"${file.name}" — too large (max ${ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB).`;
      }
      const key = `pending:${pendingAttachmentSeq++}`;
      const content_type = attachmentMimeType(out.filename);
      pendingAttachments = [...pendingAttachments, { key, filename: out.filename, content_type, size: out.size, base64Data: out.base64Data }];
      if (isAttachmentImage(out.filename)) {
        thumbnailUrls[key] = URL.createObjectURL(base64ToBlob(out.base64Data, content_type));
        thumbnailUrls = thumbnailUrls;
      }
      return null;
    } catch {
      return `"${file.name}" — could not be attached.`;
    }
  }

  async function onFilesPicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow picking the same filename again later
    if (!files.length) return;

    attachmentError = '';
    attachmentBusy = true;
    const failures: string[] = [];
    try {
      for (const file of files) {
        const err = await attachOneFile(file);
        if (err) failures.push(err);
      }
    } finally {
      attachmentBusy = false;
    }

    // Every failure is reported, and when only some of a batch failed the
    // count leads -- otherwise a partial success reads as a total one.
    if (!failures.length) return;
    const attached = files.length - failures.length;
    attachmentError = files.length === 1
      ? failures[0]
      : `Attached ${attached} of ${files.length}. ${failures.join(' ')}`;
  }

  // Nothing is written until Save -- a pending attachment is just dropped
  // from the local list, and an already-saved one is staged for removal
  // the same way a removed tag is, no confirmation needed twice (Save
  // itself is the point of no return now).
  function removeAttachment(key: string) {
    if (key.startsWith('pending:')) {
      pendingAttachments = pendingAttachments.filter(p => p.key !== key);
    } else {
      removedAttachmentKeys = new Set([...removedAttachmentKeys, key]);
    }
    if (thumbnailUrls[key]) { URL.revokeObjectURL(thumbnailUrls[key]); delete thumbnailUrls[key]; thumbnailUrls = thumbnailUrls; }
  }

  // Only ever needed for already-saved attachments -- a pending one gets its
  // thumbnail set directly in attachOneFile from the base64 payload already
  // in memory, since getAttachmentBlob() has nothing to fetch until Save.
  async function ensureThumbnails() {
    for (const a of savedAttachments) {
      if (removedAttachmentKeys.has(a.key) || thumbnailUrls[a.key] || !isAttachmentImage(a.filename)) continue;
      try {
        const blob = await getAttachmentBlob(task._id!, a.key);
        thumbnailUrls[a.key] = URL.createObjectURL(blob as Blob);
        thumbnailUrls = thumbnailUrls;
      } catch { /* thumbnail is a nice-to-have, not worth surfacing an error for */ }
    }
  }

  async function openAttachment(key: string, filename: string) {
    try {
      if (key.startsWith('pending:')) {
        const p = pendingAttachments.find(x => x.key === key);
        if (p) await openAttachmentFile(base64ToBlob(p.base64Data, p.content_type), filename);
        return;
      }
      const blob = await getAttachmentBlob(task._id!, key);
      await openAttachmentFile(blob as Blob, filename);
    } catch {
      showError('Could not open that attachment.');
    }
  }

  // Same replay-the-diff shape as flushRelated/flushBlockedBy: succeeded
  // items are removed from the pending/removed sets so a retry Save (after
  // fixing whatever else failed) doesn't redo them.
  async function flushAttachments(): Promise<string[]> {
    const errors: string[] = [];
    for (const key of [...removedAttachmentKeys]) {
      try {
        await deleteAttachment(task._id!, key);
        savedAttachments = savedAttachments.filter(a => a.key !== key);
        removedAttachmentKeys.delete(key);
      } catch {
        errors.push('Could not remove an attachment. Please try again.');
      }
    }
    for (const p of [...pendingAttachments]) {
      try {
        await addAttachment(task._id!, { filename: p.filename, base64Data: p.base64Data, size: p.size });
        pendingAttachments = pendingAttachments.filter(x => x.key !== p.key);
      } catch (e) {
        // A generic "try again" is actively wrong advice when storage is
        // genuinely full -- the retry fails identically. IndexedDB (via
        // PouchDB) surfaces this as a QuotaExceededError, but not always
        // with that exact `.name` once wrapped, so the message is checked too.
        const isQuota = e instanceof Error && (e.name === 'QuotaExceededError' || /quota/i.test(e.message));
        errors.push(isQuota
          ? `"${p.filename}" — your device is out of storage space. Free some up (see Settings → Data) and try again.`
          : `"${p.filename}" — could not be attached.`);
      }
    }
    return errors;
  }

  async function save() {
    saving = true;
    const errors: string[] = [
      ...await flushAttachments(),
      ...await flushRelated(),
      ...await flushBlockedBy(),
    ];
    try {
      await updateTask(task._id!, {
        title, body,
        priority: priority as 1 | 2 | 3,
        due_date: due_date || null,
        reminder_at: reminder_at ? new Date(reminder_at).toISOString() : null,
        column_id, tags, pinned, remindOnDue,
        custom_values: customValues, checklist, recurrence,
        recurrenceInterval: recurrence ? recurrenceInterval : undefined,
        recurrenceWeekdaysOnly: recurrence === 'daily' ? recurrenceWeekdaysOnly : undefined,
      });
    } catch (e) {
      errors.push('Failed to save the rest of the task. Please try again.');
    }
    await reloadTasks();
    saving = false;
    if (errors.length) {
      showError(errors.length === 1 ? errors[0] : `${errors.length} things didn't save: ${errors.join(' ')}`);
      return; // stay open so the user can see and fix what failed
    }
    requestClose();
  }

  async function softDelete() {
    if (!(await confirmAction('Delete this task?', { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteTask(task._id!);
      await reloadTasks();
      requestClose();
    } catch (e) {
      showError('Failed to delete task.');
    }
  }

  async function archive() {
    try {
      await archiveTask(task._id!);
      await reloadTasks();
      requestClose();
    } catch {
      showError('Failed to archive task.');
    }
  }

  async function duplicate() {
    try {
      await duplicateTask(task._id!);
      await reloadTasks();
      requestClose();
    } catch (e) {
      showError('Failed to duplicate task.');
    }
  }

  // Skip one recurrence occurrence: advances due date/reminder/checklist
  // to the next occurrence without logging a completion, for the day
  // you're not doing this one but don't want the series stuck overdue.
  // Closes afterward (same as archive/
  // duplicate/delete above) rather than patching local state, since the
  // task's due date/checklist just changed underneath this open editor.
  async function skipToNext() {
    try {
      await skipRecurrence(task._id!);
      await reloadTasks();
      requestClose();
    } catch (e) {
      showError('Failed to skip to the next occurrence.');
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} on:click={onWindowClick} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
{#if __introReady}
<div class="overlay" on:click|self={() => requestClose()} in:fade={scrimIn} out:fade={scrimOut}>
  <div class="panel" use:trapFocus in:scale={centredIn} out:scale={centredOut}>
    <div class="panel-header">
      <textarea class="title-input" bind:value={title} placeholder="Task title" rows="1" on:input={(e) => { const t = e.currentTarget; t.style.height='auto'; t.style.height=t.scrollHeight+'px'; }}></textarea>
      <button class="pin-btn" class:pinned on:click={() => pinned = !pinned} title={pinned ? 'Unpin' : 'Pin task'}>
        <PinStar size={15} filled={pinned} stroked />
      </button>
      <button class="close-btn" on:click={() => requestClose()}>✕</button>
    </div>
    {#if duplicateTitleHint}<p class="dup-name-hint">{duplicateTitleHint}</p>{/if}

    <div class="fields-row">
      <label>
        Status
        <CustomSelect options={statusOptions} bind:value={column_id} />
      </label>

      <label>
        Priority
        <CustomSelect options={priorityOptions} bind:value={priorityStr} />
      </label>
    </div>

    <div class="detail-block">
      <label>
        Due date
        <!-- Picker and shortcut pills share one row; the picker keeps a
             fixed-ish width so the pills have real room next to it. -->
        <div class="due-date-row">
          <CalendarPicker value={due_date} on:change={(e) => due_date = e.detail} />
          <div class="due-shortcuts">
            {#each DUE_SHORTCUTS as s}
              <button
                type="button"
                class="due-shortcut"
                class:active={due_date === dateFromToday(s.days, s.months)}
                on:click={() => due_date = dateFromToday(s.days, s.months)}
              >{s.label}</button>
            {/each}
          </div>
        </div>
      </label>
    </div>

    <div class="section-divider"></div>

    <div class="tags-field">
      <span class="field-label">Tags</span>
      <div class="tags-input-row">
        {#each tags as tag}
          <span class="tag-chip" style="background:color-mix(in srgb, {resolveTagColor(tag, tagColorOverrides)} 45%, transparent)">
            {tag}
            <button class="tag-remove" on:click={() => removeTag(tag)} aria-label="Remove tag {tag}">×</button>
          </span>
        {/each}
        <input
          class="tag-input"
          bind:value={tagInput}
          placeholder={tags.length ? '' : 'Add tag…'}
          enterkeyhint="done"
          on:keydown={onTagKey}
          on:blur={() => setTimeout(addTag, 150)}
        />
      </div>
      {#if tagSuggestions.length || otherTagSuggestions.length}
        <div class="tag-suggestions">
          {#each tagSuggestions as s}
            <!-- mousedown (not click) so it fires before the tag input's on:blur -->
            <button class="tag-suggestion" on:mousedown|preventDefault={() => { tags = [...tags, s]; tagInput = ''; }}>{s}</button>
          {/each}
          {#if tagSuggestions.length && otherTagSuggestions.length}
            <div class="tag-suggestions-divider">Other tags</div>
          {/if}
          {#each otherTagSuggestions as s}
            <button class="tag-suggestion tag-suggestion-other" on:mousedown|preventDefault={() => { tags = [...tags, s]; tagInput = ''; }}>{s}</button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="section-divider"></div>

    <div class="collapsible-section">
      <button type="button" class="section-toggle extras-toggle" on:click={() => showExtras = !showExtras} aria-expanded={showExtras}>
        <span class="field-label">Extras</span>
        {#if !showExtras}
          <span class="details-summary">
            <span class="details-summary-line">{extrasSummaryLines[0]}</span>
            {#if extrasSummaryLines[1]}<span class="details-summary-line">{extrasSummaryLines[1]}</span>{/if}
          </span>
        {/if}
        <svg class="section-chevron" class:open={showExtras} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
      </button>
      {#if showExtras}
        <div class="extras-panel" in:slide={revealIn} out:slide={revealOut}>

          <RepeatReminderBlock
            {task} bind:showRepeatReminder {recurrenceOptions} bind:recurrenceStr
            bind:recurrenceIntervalStr bind:recurrenceWeekdaysOnly {due_date}
            bind:reminder_at bind:remindOnDue {skipToNext}
          />

          <ChecklistBlock
            bind:showChecklistBlock {checklist} bind:checklistInput {duplicateChecklistItems}
            {toggleChecklistItem} {removeChecklistItem} {addChecklistItem} {onChecklistKey}
          />

          {#if customFields.length > 0}
            <CustomFieldsBlock
              bind:showCustomFieldsBlock {customFields} {visibleFields}
              bind:customValues bind:showAllFields {VISIBLE_FIELD_CAP}
            />
          {/if}

          <RelatedBlock
            bind:showRelatedBlock {relatedTasks} bind:relatedInput {relatedSuggestions}
            {projectNameFor} {addRelated} {removeRelated}
            on:openRelated={(e) => dispatch('openRelated', e.detail)}
          />

          <BlockedByBlock
            bind:showBlockedByBlock {blockingTasks} {unresolvedBlockers} {lastColByProject}
            bind:blockedByInput {blockedBySuggestions} {projectNameFor}
            {addBlockedBy} {removeBlockedBy}
            on:openRelated={(e) => dispatch('openRelated', e.detail)}
          />

          <AttachmentsBlock
            bind:showAttachmentsBlock {attachments} {thumbnailUrls} {attachmentBusy}
            {attachmentError} {openAttachment} {removeAttachment} {onFilesPicked}
          />

          <NotesBlock
            bind:showNotesBlock bind:body {similarNotesHint} {NOTES_SOFT_LIMIT}
          />

        </div>
      {/if}
    </div>

    {#if showHistory && TaskHistoryPanelComp}
      <svelte:component this={TaskHistoryPanelComp} taskId={task._id} />
    {/if}

    <div class="actions">
      <div class="menu-wrap">
        <button type="button" class="menu-trigger" bind:this={menuTriggerEl} on:click={() => showActionsMenu = !showActionsMenu} aria-label="More actions" aria-expanded={showActionsMenu}>
          <svg viewBox="0 0 14 14" width="16" height="16" fill="currentColor"><circle cx="3" cy="7" r="1.3"/><circle cx="7" cy="7" r="1.3"/><circle cx="11" cy="7" r="1.3"/></svg>
        </button>
        {#if showActionsMenu}
          <div class="actions-menu" bind:this={menuPanelEl} in:fly={popIn} out:fly={popOut}>
            <button type="button" class="menu-item" on:click={() => { showActionsMenu = false; loadHistory(); }}>
              <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="7" cy="7" r="5.5"/><path d="M7 4v3l2 1.5"/></svg>
              {showHistory ? 'Hide history' : 'Show history'}
            </button>
            <button type="button" class="menu-item" on:click={() => { showActionsMenu = false; archive(); }}>
              <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2" width="11" height="3" rx="1"/><path d="M2.5 5v6.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5M5.5 8h3"/></svg>
              Archive
            </button>
            <button type="button" class="menu-item" on:click={() => { showActionsMenu = false; duplicate(); }}>
              <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4.5" y="4.5" width="8" height="8" rx="1"/><path d="M9.5 4.5V2.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>
              Duplicate
            </button>
            <div class="menu-divider"></div>
            <button type="button" class="menu-item menu-item-danger" on:click={() => { showActionsMenu = false; softDelete(); }}>
              <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 3.5h9M5.5 3.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M3.5 3.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8"/></svg>
              Delete
            </button>
          </div>
        {/if}
      </div>
      <div class="right">
        <button on:click={() => requestClose()}>Cancel</button>
        <button class="save-btn" on:click={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  /* Same centered-card layout as SettingsPanel.svelte's
     .settings-overlay/.settings-panel: flex-centered overlay,
     fixed-width card, height fits content up to a cap, no entrance
     transition on the overlay/panel itself. */
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.45);
    display: flex; align-items: center; justify-content: center;
    padding: env(safe-area-inset-top, 0px) 1rem env(safe-area-inset-bottom, 0px);
    /* Above every panel that can open a card while staying visible itself
       (TrashView/TimeTravelView z:402, GlobalSearch z:401, SettingsPanel
       z:301, QuickAdd z:501) — TimeTravelView in particular deliberately
       stays open behind a card, so "back" returns to it. Must also stay
       below ConfirmDialog's z:700/701, since CardDetail's own Delete
       button opens one on top of itself. */
    z-index: 600;
  }
  .panel {
    background: var(--surface);
    width: min(480px, 92vw);
    max-height: min(85vh, 760px);
    display: flex; flex-direction: column;
    padding: 1.1rem 1.25rem;
    gap: .55rem;
    border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0,0,0,.18);
    overflow-y: auto;
  }
  .panel-header { display: flex; gap: .4rem; align-items: flex-start; }
  .title-input {
    flex: 1; font-size: 1.05rem; font-weight: 700; letter-spacing: -.01em;
    border: none; border-bottom: 1.5px solid transparent;
    background: transparent; padding: .2rem 0;
    color: var(--text); line-height: 1.3;
    resize: none; overflow: hidden; min-height: 1.7rem;
    font-family: inherit;
  }
  .title-input:focus { outline: none; border-bottom-color: var(--accent); }
  .pin-btn {
    background: none; border: none; cursor: pointer;
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    color: var(--faint); padding: 0; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .pin-btn:hover { background: var(--hover); color: var(--accent); }
  .pin-btn.pinned { color: var(--accent); }

  .close-btn {
    background: var(--hover); border: none; cursor: pointer;
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    font-size: .85rem; color: var(--muted); padding: 0;
    flex-shrink: 0; transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .close-btn:hover { background: var(--border-strong); color: var(--text); }
  .fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .extras-panel :global(.reminder-field) { display: flex; flex-direction: column; gap: .35rem; }
  /* flex-wrap:wrap, not nowrap + horizontal scroll: a scrollbar on a
     compact modal control row reads worse on mobile than
     .remind-on-due-row dropping to a full line below the date picker. */
  .extras-panel :global(.reminder-row) { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  /* The picker takes flex:1 so leftover row width goes to it; the
     checkbox sizes to its content instead (flex:0 0 auto, on
     .remind-on-due-row below). Giving the checkbox flex:1 stretches it
     past its own nowrap text and leaves visible dead space. */
  .extras-panel :global(.reminder-row .cal-field) { flex: 1; min-width: 150px; }
  .section-divider { height: 1px; background: var(--border); margin: .05rem 0; }
  label {
    display: flex; flex-direction: column; gap: .22rem;
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
  /* Same gap as fields-row's Status/Priority pair (.5rem). The field is
     wider than before -- 150px only left the shortcuts a narrower share
     than 4 pills need, which pushed "1 month" into a horizontal-scroll
     clip the first time this was tried as a strict two-column grid. */
  .due-date-row { display: flex; align-items: center; gap: .5rem; }
  .due-date-row :global(.cal-field) { flex: 0 0 auto; width: 162px; }
  /* Packed tight and pushed to the row's own right edge -- the same right
     edge Priority's field ends at -- rather than left-packed with the
     dead space landing after "1 month" where the eye reads it as a
     mistake, not a stopping point. */
  .due-shortcuts { display: flex; gap: 6px; flex-wrap: nowrap; margin-left: auto; overflow-x: auto; min-width: 0; }
  @media (max-width: 480px) {
    .due-date-row { flex-direction: column; align-items: stretch; }
    .due-date-row :global(.cal-field) { width: 100%; }
    .due-shortcuts { margin-left: 0; }
  }
  .due-shortcut {
    background: var(--col-bg); color: var(--muted); border: none;
    border-radius: 999px; font-size: .72rem; font-weight: 600; letter-spacing: normal;
    text-transform: none; font-family: 'Hanken Grotesk', sans-serif;
    padding: 5px 12px; cursor: pointer; transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
    white-space: nowrap; flex-shrink: 0;
  }
  .due-shortcut:hover { background: var(--hover); color: var(--text); }
  .due-shortcut.active { background: var(--accent); color: var(--on-accent); }

  .extras-panel :global(.reminder-hint) {
    font-size: .72rem; color: var(--faint); line-height: 1.35;
    background: var(--col-bg); border-radius: var(--radius-sm);
    padding: .4rem .55rem;
  }

  .extras-panel :global(.repeat-hint) {
    font-size: .72rem; color: var(--faint); font-weight: 500;
    text-transform: none; letter-spacing: normal; font-family: 'Hanken Grotesk', sans-serif;
    margin-top: .2rem; display: block;
  }

  /* Every control in the revealed row (select, number input, both pills)
     must share one explicit height (--repeat-ctrl-h); letting each size
     itself from its own padding/font-size renders them at three
     different heights. .repeat-block's bottom margin keeps this section
     from running straight into Reminder below it. */
  .extras-panel :global(.repeat-block) { --repeat-ctrl-h: 30px; margin-bottom: .5rem; }
  .extras-panel :global(.repeat-row) {
    display: flex; align-items: center; flex-wrap: wrap; gap: .25rem;
    font-size: .8rem; color: var(--muted); font-weight: 500;
    text-transform: none; letter-spacing: normal; font-family: 'Hanken Grotesk', sans-serif;
  }
  /* Widths are tuned to the worst case (Day + Weekdays + Skip, every word
     shown) inside a 375px phone's ~260px modal content width, not the
     ~400px this looks roomy at on desktop. 86px fits only the short
     option words (Day/Week/Month) -- the default "Not repeating"
     truncates to "Not rep…" there, so .compact must apply only once a
     real option is chosen and the row needs the room back. */
  .extras-panel :global(.repeat-select-wrap) { width: 150px; flex-shrink: 0; height: var(--repeat-ctrl-h); }
  /* 74px, not 86px: "Month" (the longest option word) plus the chevron
     only needs about this much -- the extra 12px in the old value read as
     dead air inside the box, not padding, since .cs-value is flex:1 and
     soaks up anything left over between the word and the chevron. */
  .extras-panel :global(.repeat-select-wrap.compact) { width: 74px; }
  .extras-panel :global(.repeat-select-wrap .cs-trigger) {
    height: var(--repeat-ctrl-h); box-sizing: border-box; padding: 0 5px; font-size: .8rem;
  }
  /* CustomSelect's .cs-panel is `left:0;right:0`, i.e. the full width of
     its trigger -- at this trigger's compact 86px that wraps "Not
     repeating" inside the option list. Widening just the panel (not the
     always-visible trigger) keeps the row compact and the dropdown
     readable. */
  .extras-panel :global(.repeat-select-wrap .cs-panel) { width: 150px; right: auto; }
  .extras-panel :global(.repeat-every-text), .extras-panel :global(.repeat-unit-text) { flex-shrink: 0; }
  .extras-panel :global(.repeat-interval-input) {
    width: 30px; height: var(--repeat-ctrl-h); box-sizing: border-box;
    text-align: center; flex-shrink: 0;
    border: 1px solid var(--border-strong); border-radius: 6px;
    padding: 0 .15rem; font-size: .8rem; color: var(--text);
    background: var(--bg); font-family: inherit;
  }
  .extras-panel :global(.repeat-interval-input:focus) { border-color: var(--accent); outline: none; }
  .extras-panel :global(.repeat-pill) {
    flex-shrink: 0; height: var(--repeat-ctrl-h); box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface); color: var(--muted);
    border: 1px solid var(--border-strong); border-radius: 999px;
    font-size: .7rem; font-weight: 600; padding: 0 8px; cursor: pointer;
    white-space: nowrap;
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), border-color var(--dur-hover) var(--ease-hover);
  }
  .extras-panel :global(.repeat-pill:hover) { border-color: var(--accent); color: var(--text); }
  .extras-panel :global(.repeat-pill.active) { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  /* Skip is an action, not a state toggle like Weekdays-only -- accent
     outline, not accent fill, so it doesn't read as "currently on" the
     way .active does. */
  .extras-panel :global(.repeat-pill-accent) { border-color: var(--accent); color: var(--accent); }
  .extras-panel :global(.repeat-pill-accent:hover) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  /* A few extra px between the plain-text sentence and the first pill
     that follows it -- reads as "pill group starts here," instead of the
     row's uniform .25rem making the last word and the first pill blur
     into one run-on cluster. */
  .extras-panel :global(.repeat-every-text + .repeat-pill),
  .extras-panel :global(.repeat-unit-text + .repeat-pill) {
    margin-left: 6px;
  }
  /* Plain information, not an action -- var(--accent) here (matching
     Customize/Skip right next to it) would promise a click that does
     nothing. var(--muted) still reads as emphasized (the 600 weight)
     without the link color. */
  .extras-panel :global(.repeat-next-preview) {
    font-size: .72rem; color: var(--muted); font-weight: 600;
    text-transform: none; letter-spacing: normal; font-family: 'Hanken Grotesk', sans-serif;
    margin-top: .35rem; display: block;
  }

  /* flex:0 0 auto -- sizes to its own nowrap text and no further, so it
     leaves no dead space; the picker (flex:1 above) absorbs any leftover
     row width. nowrap keeps the full label ("Remind me on the due date at
     17:00") on one line rather than wrapping to two.
     The display/flex-direction !importants are required: the generic
     `label` rule above sets flex-direction:column and wins per-property
     over this more specific class otherwise. */
  .extras-panel :global(.remind-on-due-row) {
    display: flex !important; flex-direction: row !important; align-items: center;
    gap: .4rem; flex: 0 0 auto; white-space: nowrap;
    font-size: .74rem; color: var(--muted); font-weight: 500;
    text-transform: none; letter-spacing: normal; font-family: 'Hanken Grotesk', sans-serif;
    padding: .3rem .55rem; border-radius: var(--radius-sm);
    background: var(--col-bg); cursor: pointer; transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .extras-panel :global(.remind-on-due-row:has(input:checked)) { color: var(--text); background: color-mix(in srgb, var(--accent) 12%, var(--col-bg)); }
  .extras-panel :global(.remind-on-due-row:has(input:disabled)) { opacity: .55; cursor: default; }
  .extras-panel :global(.remind-on-due-row input[type=checkbox]) {
    accent-color: var(--accent); cursor: pointer; flex-shrink: 0;
    width: 13px; height: 13px; margin: 0;
  }
  .extras-panel :global(.remind-on-due-row input[type=checkbox]:disabled) { cursor: default; }
  .extras-panel :global(.reminder-enable-btn) {
    background: none; border: none; padding: 0; cursor: pointer;
    color: var(--accent); font-weight: 600; font-size: inherit;
    text-decoration: underline;
  }
  .tags-field { display: flex; flex-direction: column; gap: .22rem; }
  .extras-panel :global(.custom-fields) { display: flex; flex-direction: column; gap: .3rem; }
  .extras-panel :global(.custom-field-label) {
    display: flex; flex-direction: column; gap: .22rem;
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
  .extras-panel :global(.custom-field-label input) {
    padding: .38rem .5rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .84rem; font-family: inherit;
    text-transform: none; letter-spacing: normal;
  }
  /* The native number-input spin buttons read as a stray unstyled OS
     control next to the other inputs, so they're hidden; the field stays
     type="number" (numeric keyboard on mobile, no behavior change). */
  /* standard `appearance` alongside the -moz- prefix: the prefixed one
     alone leaves non-Firefox engines on their default rendering. */
  .extras-panel :global(.custom-field-label input[type="number"]) { -moz-appearance: textfield; appearance: textfield; }
  .extras-panel :global(.custom-field-label input[type="number"]::-webkit-outer-spin-button),
  .extras-panel :global(.custom-field-label input[type="number"]::-webkit-inner-spin-button) {
    -webkit-appearance: none; margin: 0;
  }
  .extras-panel :global(.add-field-btn) {
    align-self: flex-start; background: none; border: none; cursor: pointer;
    color: var(--accent); font-size: .76rem; font-weight: 500; padding: .15rem 0;
  }
  .field-label, .extras-panel :global(.field-label) {
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
  .tags-input-row {
    display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
    padding: .35rem .5rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--surface); min-height: 34px;
    cursor: text;
  }
  .tags-input-row:focus-within { border-color: var(--accent); }
  /* Background is per-tag (resolveTagColor(), same hash/override every tag
     chip elsewhere in the app already uses) set inline, at a 45% mix --
     raised from 32% once TAG_PALETTE grew to 24: at 24 hues the average
     gap between neighbours is ~15 degrees, and mixing toward white
     compresses non-hue differences hard (measured: two reds 125 RGB
     units apart pre-mix land only 40 apart post-mix at 32%), so pastel
     and "24 distinct colors" are in real tension. Raising the tint only
     helps a little (worst-pair distance 8->14 across the full 32-60%
     range checked) since it can't widen a hue gap that's just too
     narrow -- amber/yellow at 7 degrees apart stays the closest pair at
     any tint. 45% was chosen as a real half-step, not a fix: contrast
     stays comfortably safe (worst case ~6.6:1 against var(--text), full
     unmixed hue still fails WCAG AA for red/blue/violet). Text stays
     var(--text) rather than the raw hash color for the same
     reason -- KanbanBoard's card-tag already worked this out once. */
  /* A small rounded rectangle, not a full pill -- Notion's and GitHub's
     label chips both use this shape; the capsule/999px radius is a
     Material "filter chip" convention (an interactive toggle), not a
     static tag-label one. */
  .tag-chip {
    display: inline-flex; align-items: center; gap: 2px;
    background: var(--col-bg); color: var(--text); border-radius: var(--radius-sm);
    font-size: .74rem; font-weight: 500; padding: 0 2px 0 7px;
  }
  /* 24x24 hit box, not a 24px glyph: the × stays its old size and the chip
     keeps its height. Below 24 this fails WCAG 2.2's minimum target size
     (2.5.8), and at the old 8x14 it was the hardest control here to tap. */
  .tag-remove {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 4px;
    cursor: pointer; font-size: .9rem; line-height: 1; color: var(--muted);
    background: none; border: none;
    /* Box-centered math already puts it dead center of its own 24x24 --
       but a symbol glyph's own vertical center sits higher than a
       lowercase word's optical center, so dead-center reads as too low
       next to the tag text. Nudged up, not down. */
    padding: 0 0 2px;
    transition: color var(--dur-hover) var(--ease-hover);
  }
  .tag-remove:hover { color: var(--danger); }
  .tag-input {
    border: none; background: none; outline: none; min-height: 24px;
    font-size: .88rem; color: var(--text); min-width: 80px; flex: 1;
  }
  .tag-input::placeholder { color: var(--faint); }

  .tag-suggestions, .extras-panel :global(.tag-suggestions) {
    display: flex; flex-wrap: wrap; gap: 5px; padding: 6px 2px;
  }
  .tag-suggestion, .extras-panel :global(.tag-suggestion) {
    background: var(--col-bg); color: var(--accent); border-radius: 5px;
    font-size: .78rem; font-weight: 500; padding: 2px 9px; cursor: pointer;
    border: 1px solid var(--border); transition: background var(--dur-hover) var(--ease-hover);
  }
  .tag-suggestion:hover, .extras-panel :global(.tag-suggestion:hover) { background: var(--hover); }
  .tag-suggestion-other { color: var(--muted); }
  .tag-suggestions-divider {
    width: 100%; font-size: .68rem; color: var(--faint); font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em; padding: 2px 2px 0;
  }

  .collapsible-section { display: flex; flex-direction: column; gap: .35rem; }

  .section-toggle {
    display: flex; align-items: center; gap: 8px;
    background: var(--col-bg); border: 1px solid var(--border); border-radius: 8px;
    cursor: pointer; padding: .55rem .65rem; width: 100%; text-align: left;
    transition: background var(--dur-hover) var(--ease-hover), border-color var(--dur-hover) var(--ease-hover);
  }
  .section-toggle:hover { background: var(--hover); border-color: var(--border-strong); }
  /* EXTRAS stays put on the left at its own width; the summary claims the
     rest of the row and right-aligns, ending flush with the chevron
     instead of trailing right after the label on the left. */
  .section-toggle .field-label { flex: 0 0 auto; }
  /* Two pre-balanced lines (formatExtrasSummary splits by rendered length,
     not by the browser's own wrap point), not one long string left to
     wrap wherever it happens to fit -- that regularly left one line
     nearly full and the other a short, ragged trailer. */
  .details-summary {
    font-family: 'Hanken Grotesk', sans-serif; font-size: .78rem;
    text-transform: none; letter-spacing: normal; color: var(--muted);
    flex: 1; display: flex; flex-direction: column; align-items: flex-end;
  }
  .details-summary-line { text-align: right; }
  .section-chevron, .extras-panel :global(.section-chevron) { color: var(--faint); flex-shrink: 0; transition: transform var(--dur-small) var(--ease-standard), color var(--dur-hover) var(--ease-hover); }
  .section-chevron.open, .extras-panel :global(.section-chevron.open) { transform: rotate(90deg); }
  .section-toggle:hover .section-chevron { color: var(--text); }
  .extras-panel :global(.notes-wrap) { display: block; }
  .extras-panel :global(.notes-counter) {
    font-family: var(--mono); font-size: .68rem; color: var(--faint);
    text-align: right; margin-top: 3px;
  }
  .dup-name-hint, .extras-panel :global(.dup-name-hint) { font-size: .72rem; color: var(--due-soon-ink); margin: 4px 0 0; line-height: 1.3; }

  /* .detail-block (the mandatory, always-visible Due date field) stays
     plain -- no card treatment, matching Status/Priority/Tags above. */
  .detail-block { display: flex; flex-direction: column; gap: .3rem; }

  /* Extras has no outer background/border of its own; each of the five
     blocks inside is its own small card, so the grouping is visible
     rather than implied by a caption + hairline. The faint 1px
     border-left anchors the indent -- a bare margin-left with no visual
     anchor reads as a misalignment glitch. */
  .extras-panel {
    display: flex; flex-direction: column; gap: .4rem;
    margin-left: 8px; padding-left: 8px;
    border-left: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }
  .extras-panel :global(.extra-block) {
    background: var(--col-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: .1rem .6rem;
  }
  .extras-panel :global(.extra-block-toggle) {
    display: flex; align-items: center; gap: 8px; width: 100%;
    background: none; border: none; cursor: pointer; text-align: left;
    padding: .45rem 0;
  }
  .extras-panel :global(.extra-block-toggle .field-label) { flex: 1; }
  .extras-panel :global(.extra-block-body) { display: flex; flex-direction: column; gap: .3rem; padding-bottom: .5rem; }

  .extras-panel :global(.related-field) { display: flex; flex-direction: column; gap: .3rem; }
  .extras-panel :global(.related-row) { display: flex; align-items: center; gap: 7px; }
  .extras-panel :global(.related-title) { flex: 1; font-size: .84rem; color: var(--text); }
  .extras-panel :global(.related-title-link) {
    background: none; border: none; padding: 0; text-align: left;
    cursor: pointer; font-family: inherit;
  }
  .extras-panel :global(.related-title-link:hover) { color: var(--accent); text-decoration: underline; }
  .extras-panel :global(.related-proj) {
    font-family: var(--mono); font-size: .68rem; color: var(--faint);
    text-transform: uppercase; letter-spacing: .03em; white-space: nowrap;
  }
  .extras-panel :global(.related-deleted .related-title) { color: var(--faint); font-style: italic; }

  /* "Blocked by" reuses .related-row/.related-proj above — only the
     done/not-done status pill and the badge's active (still-blocking)
     tint are new. */
  .extras-panel :global(.blocked-status) {
    font-size: .68rem; font-weight: 700; white-space: nowrap;
    padding: 1px 7px; border-radius: 999px;
    color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent);
  }
  .extras-panel :global(.blocked-status-done) { color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .extras-panel :global(.blocked-badge-active) { color: var(--danger); }

  .extras-panel :global(.checklist-field) { display: flex; flex-direction: column; gap: .3rem; }
  .extras-panel :global(.checklist-progress) { color: var(--accent); font-weight: 600; margin-left: 4px; }
  .extras-panel :global(.checklist-row) { display: flex; align-items: center; gap: 7px; }
  .extras-panel :global(.checklist-check) {
    flex-shrink: 0; width: 17px; height: 17px; border-radius: 5px;
    border: 1.5px solid var(--border-strong); background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: .68rem; color: var(--on-accent); cursor: pointer; padding: 0;
    transition: background var(--dur-hover) var(--ease-hover), border-color var(--dur-hover) var(--ease-hover);
  }
  .extras-panel :global(.checklist-check.done) { background: var(--accent); border-color: var(--accent); animation: check-pop var(--dur-small) var(--ease-standard); }
  @keyframes check-pop { from { transform: scale(.7); } to { transform: scale(1); } }
  .extras-panel :global(.checklist-text) { flex: 1; font-size: .84rem; color: var(--text); transition: color var(--dur-hover) var(--ease-hover); }
  .extras-panel :global(.checklist-text.done) { color: var(--faint); text-decoration: line-through; }
  /* 24x24 hit box, not a 24px glyph: the x keeps its size and the row keeps
     its height. Below 24 this fails WCAG 2.2's minimum target size (2.5.8),
     and the same button removes a checklist item, a link, and an attachment
     -- that last one deletes the file permanently. */
  .extras-panel :global(.checklist-remove) {
    flex-shrink: 0; cursor: pointer; font-size: .9rem; line-height: 1;
    color: var(--muted); background: none; border: none; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; margin: -4px -2px;
    transition: color var(--dur-hover) var(--ease-hover);
  }
  .extras-panel :global(.checklist-remove:hover) { color: var(--danger); }
  .extras-panel :global(.checklist-input) {
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); outline: none;
    font-size: .84rem; color: var(--text); padding: .35rem .5rem;
  }
  .extras-panel :global(.checklist-input:focus) { border-color: var(--accent); }
  .extras-panel :global(.checklist-input::placeholder) { color: var(--faint); }

  /* File attachments */
  .extras-panel :global(.attachments-field) { display: flex; flex-direction: column; gap: .3rem; }
  .extras-panel :global(.attachment-row) { display: flex; align-items: center; gap: 7px; }
  .extras-panel :global(.attachment-open) {
    flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;
    background: none; border: none; padding: .2rem 0; text-align: left; cursor: pointer;
    font-family: inherit; color: var(--text); border-radius: 6px;
  }
  .extras-panel :global(.attachment-open:hover .attachment-name) { color: var(--accent); text-decoration: underline; }
  .extras-panel :global(.attachment-thumb) {
    width: 26px; height: 26px; border-radius: 5px; object-fit: cover;
    flex-shrink: 0; border: 1px solid var(--border);
  }
  .extras-panel :global(.attachment-file-icon) {
    width: 26px; height: 26px; border-radius: 5px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface); border: 1px solid var(--border); color: var(--faint);
  }
  .extras-panel :global(.attachment-name) { flex: 1; font-size: .84rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .extras-panel :global(.attachment-size) {
    font-family: var(--mono); font-size: .68rem; color: var(--faint); flex-shrink: 0;
  }
  .extras-panel :global(.attach-file-btn) {
    align-self: flex-start; font-size: .82rem; color: var(--accent); cursor: pointer;
    padding: .3rem .2rem; border-radius: 6px; transition: background var(--dur-hover) var(--ease-hover);
    background: none; border: none; font-family: inherit;
  }
  .extras-panel :global(.attach-file-btn:hover) { background: var(--hover); }
  .extras-panel :global(.attach-file-btn:disabled) { color: var(--faint); cursor: default; }
  textarea {
    flex: 1; resize: vertical; min-height: 90px;
    padding: .55rem .65rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--bg); color: var(--text);
    font-family: 'Hanken Grotesk', sans-serif; font-size: .85rem; line-height: 1.5;
  }
  textarea:focus { outline: none; border-color: var(--accent); background: var(--surface); }
  .actions {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: .6rem; border-top: 1px solid var(--border);
  }
  .right { display: flex; gap: .5rem; }
  button {
    padding: .38rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .82rem; font-weight: 500;
  }
  .save-btn { background: var(--text); color: var(--bg); border-color: var(--text); }
  .save-btn:disabled { opacity: .5; cursor: default; }

  .menu-wrap { position: relative; }
  .menu-trigger {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; padding: 0;
    background: none; border: 1px solid transparent; color: var(--muted);
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .menu-trigger:hover { background: var(--hover); color: var(--text); }
  .actions-menu {
    position: absolute; bottom: calc(100% + 6px); left: 0;
    width: 200px; background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); box-shadow: 0 8px 24px rgba(0,0,0,.22);
    padding: .35rem; display: flex; flex-direction: column; z-index: 10;
  }
  .menu-item {
    display: flex; align-items: center; gap: 9px;
    background: none; border: none; border-radius: var(--radius-sm);
    padding: .45rem .6rem; font-size: .82rem; font-weight: 500;
    color: var(--text); cursor: pointer; text-align: left;
  }
  .menu-item:hover { background: var(--hover); }
  .menu-item svg { flex-shrink: 0; color: var(--muted); }
  .menu-divider { height: 1px; background: var(--border); margin: .3rem .2rem; }
  .menu-item-danger { color: var(--danger); }
  .menu-item-danger svg { color: var(--danger); }
  .menu-item-danger:hover { background: var(--overdue-bg); }
</style>
