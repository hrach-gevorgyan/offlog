<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { popScale } from './motion';
  import type { TaskDoc, ProjectDoc, CustomFieldDef, TaskAttachment } from './types';
  import { updateTask, deleteTask, getAllTags, archiveTask, duplicateTask, skipRecurrence, getCustomFieldDefs, findTasksByTitleInProject, findSimilarNotes, getRelatedTasks, searchTasksForLinking, linkRelatedTask, unlinkRelatedTask, getBlockingTasks, linkBlockedBy, unlinkBlockedBy, isBlockerResolved, addAttachment, deleteAttachment, getAttachmentBlob, ATTACHMENT_MAX_PER_TASK } from './db';
  import { ATTACHMENT_MAX_BYTES, isAttachmentExtensionAllowed, isAttachmentImage, attachmentExtension, formatAttachmentSize } from './attachments';
  import { reloadTasks, showError, modalOpen, projects } from './store';
  import { requestPermission, permissionState } from './notifications';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import PinStar from './PinStar.svelte';
  import CalendarPicker from './CalendarPicker.svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { getDefaultReminderTime } from '../config';
  import { fmtTime, findDuplicateChecklistItems } from './utils';
  import { hapticToggle } from './haptics';

  export let task: TaskDoc;
  export let project: ProjectDoc;

  const dispatch = createEventDispatcher<{ close: void; openRelated: string }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  function isoToLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // One-tap relative shortcuts; the exact-date picker covers everything
  // else. Local calendar dates (not UTC) so "Today" can't roll over to
  // yesterday west of UTC, matching how <input type="date"> works.
  function dateFromToday(days: number, months = 0): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (months) d.setMonth(d.getMonth() + months);
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
    { value: '1', label: 'Low' },
    { value: '2', label: 'Medium' },
    { value: '3', label: 'High' },
  ];
  let due_date = task.due_date ?? '';
  let reminder_at = task.reminder_at ? isoToLocalInput(task.reminder_at) : '';
  let remindOnDue = task.remindOnDue ?? false;

  // Derives reminder_at from due_date + the configured default time
  // whenever the toggle is on and due_date changes — recomputed live, not
  // just once on enable, so editing the due date afterward keeps the
  // reminder in sync without needing to re-toggle.
  function dueDateToReminderInput(date: string): string {
    const [h, m] = getDefaultReminderTime().split(':');
    return `${date}T${h}:${m}`;
  }
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

  // Task linking, non-directional "related to" only. Unlike
  // Tags/Checklist above, this is immediate-write, not batched into
  // save() — a link can live on either of two different task docs
  // (db.ts's linkRelatedTask()/unlinkRelatedTask()), so it doesn't fit
  // the "collect locally, write this one doc on Save" pattern the rest
  // of this form uses.
  let relatedTasks: TaskDoc[] = [];
  let relatedInput = '';
  let relatedSuggestions: TaskDoc[] = [];
  let relatedBusy = false;

  async function loadRelatedTasks() {
    relatedTasks = await getRelatedTasks(task._id!);
  }

  // "Blocked by" — same immediate-write pattern as Related above, kept as
  // its own separate block/field rather than folded into Related, which
  // stays non-directional and dependency-free.
  let blockingTasks: TaskDoc[] = [];
  let blockedByInput = '';
  let blockedBySuggestions: TaskDoc[] = [];
  let blockedByBusy = false;

  async function loadBlockingTasks() {
    blockingTasks = await getBlockingTasks(task._id!);
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

  const RECURRENCE_LABEL: Record<string, string> = { daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly' };
  // Collapsed-state summary for the outer "Extras" toggle. Every value
  // read must be passed in as an argument (not read from closure) so
  // Svelte's static dependency analysis on the `$:` call re-runs this
  // when any of them changes.
  function formatExtrasSummary(
    reminder: string, repeat: string | null, interval: number, weekdaysOnly: boolean,
    cl: typeof checklist, related: TaskDoc[], blocking: TaskDoc[], unresolvedCount: number, atts: TaskAttachment[], notes: string,
  ): string {
    const parts: string[] = [];
    if (repeat === 'daily' && weekdaysOnly) parts.push('Repeats weekdays');
    else if (repeat && interval > 1) parts.push(`Repeats every ${interval} ${repeat === 'daily' ? 'days' : repeat === 'weekly' ? 'weeks' : 'months'}`);
    else if (repeat) parts.push(RECURRENCE_LABEL[repeat]);
    if (reminder) parts.push(`${fmtTime(new Date(reminder))} reminder`);
    if (cl.length) parts.push(`${cl.filter(i => i.done).length}/${cl.length} checklist`);
    if (related.length) parts.push(`${related.length} related`);
    if (blocking.length) parts.push(unresolvedCount ? `blocked by ${unresolvedCount}` : `${blocking.length} blocked by (done)`);
    if (atts.length) parts.push(`${atts.length} attachment${atts.length > 1 ? 's' : ''}`);
    if (notes.trim()) parts.push('notes');
    return parts.length ? parts.join(' · ') : 'Repeat, reminder, checklist, custom fields, related tasks, attachments, notes';
  }
  $: extrasSummary = formatExtrasSummary(reminder_at, recurrence, recurrenceInterval, recurrenceWeekdaysOnly, checklist, relatedTasks, blockingTasks, unresolvedBlockers.length, attachments, body);

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
    [allTags, projectTags, customFields] = await Promise.all([getAllTags(), getAllTags(project._id), getCustomFieldDefs()]);
    await Promise.all([loadRelatedTasks(), loadBlockingTasks()]);
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

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) tags = [...tags, t];
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

  async function addRelated(otherId: string) {
    relatedInput = '';
    relatedSuggestions = [];
    relatedBusy = true;
    try {
      await linkRelatedTask(task._id!, otherId);
      await loadRelatedTasks();
    } catch {
      showError('Could not link that task. Please try again.');
    } finally {
      relatedBusy = false;
    }
  }

  async function removeRelated(otherId: string) {
    relatedBusy = true;
    try {
      await unlinkRelatedTask(task._id!, otherId);
      await loadRelatedTasks();
    } catch {
      showError('Could not remove that link. Please try again.');
    } finally {
      relatedBusy = false;
    }
  }

  async function addBlockedBy(otherId: string) {
    blockedByInput = '';
    blockedBySuggestions = [];
    blockedByBusy = true;
    try {
      await linkBlockedBy(task._id!, otherId);
      await loadBlockingTasks();
    } catch (e) {
      showError(e instanceof Error && e.message === 'circular dependency'
        ? 'That would create a circular dependency.'
        : 'Could not link that task. Please try again.');
    } finally {
      blockedByBusy = false;
    }
  }

  async function removeBlockedBy(otherId: string) {
    blockedByBusy = true;
    try {
      await unlinkBlockedBy(task._id!, otherId);
      await loadBlockingTasks();
    } catch {
      showError('Could not remove that link. Please try again.');
    } finally {
      blockedByBusy = false;
    }
  }

  // File attachments. Immediate-write like Related above: attaching a
  // file is its own discrete action, not part of the "collect locally,
  // write on Save" pattern the rest of this form uses.
  let attachments: TaskAttachment[] = [...(task.attachments ?? [])];
  let attachmentBusy = false;
  let attachmentError = '';
  let thumbnailUrls: Record<string, string> = {};
  let attachFileInputEl: HTMLInputElement;

  const MAX_IMAGE_DIMENSION = 1600;
  const IMAGE_JPEG_QUALITY = 0.8;

  // Re-encodes to JPEG regardless of the source image format (jpg/png/webp)
  // -- one predictable output format instead of format-specific quality/
  // compression tuning for each, and JPEG is universally previewable.
  // Downscaling first, not just re-compressing at full resolution, is what
  // actually shrinks a modern phone photo (4000px+) meaningfully.
  async function downscaleImage(file: File): Promise<{ filename: string; base64Data: string; size: number }> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', IMAGE_JPEG_QUALITY);
    });
    return { filename: file.name.replace(/\.[^.]+$/, '') + '.jpg', base64Data: await blobToBase64(blob), size: blob.size };
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function attachOneFile(file: File) {
    if (attachments.length >= ATTACHMENT_MAX_PER_TASK) {
      attachmentError = `This task already has ${ATTACHMENT_MAX_PER_TASK} attachments (the max per task).`;
      return;
    }
    const ext = attachmentExtension(file.name);
    if (!isAttachmentExtensionAllowed(file.name)) {
      attachmentError = (ext === 'heic' || ext === 'heif')
        ? 'HEIC/HEIF photos aren’t supported yet -- please share or convert as JPEG first.'
        : `Unsupported file type: .${ext || '?'}`;
      return;
    }
    attachmentError = '';
    attachmentBusy = true;
    try {
      const out = isAttachmentImage(file.name)
        ? await downscaleImage(file)
        : { filename: file.name, base64Data: await blobToBase64(file), size: file.size };
      if (out.size > ATTACHMENT_MAX_BYTES) {
        attachmentError = `"${file.name}" is too large (max ${ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB).`;
        return;
      }
      const result = await addAttachment(task._id!, out);
      attachments = result.attachments ?? [];
      await ensureThumbnails();
    } catch {
      showError('Could not attach that file. Please try again.');
    } finally {
      attachmentBusy = false;
    }
  }

  async function onFilesPicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow picking the same filename again later
    for (const file of files) await attachOneFile(file);
  }

  async function removeAttachment(key: string) {
    attachmentBusy = true;
    try {
      const result = await deleteAttachment(task._id!, key);
      attachments = result.attachments ?? [];
      if (thumbnailUrls[key]) { URL.revokeObjectURL(thumbnailUrls[key]); delete thumbnailUrls[key]; thumbnailUrls = thumbnailUrls; }
    } catch {
      showError('Could not remove that attachment. Please try again.');
    } finally {
      attachmentBusy = false;
    }
  }

  async function ensureThumbnails() {
    for (const a of attachments) {
      if (thumbnailUrls[a.key] || !isAttachmentImage(a.filename)) continue;
      try {
        const blob = await getAttachmentBlob(task._id!, a.key);
        thumbnailUrls[a.key] = URL.createObjectURL(blob as Blob);
        thumbnailUrls = thumbnailUrls;
      } catch { /* thumbnail is a nice-to-have, not worth surfacing an error for */ }
    }
  }

  async function openAttachment(key: string, filename: string) {
    try {
      const blob = await getAttachmentBlob(task._id!, key);
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      showError('Could not open that attachment.');
    }
  }

  async function save() {
    saving = true;
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
      await reloadTasks();
      requestClose();
    } catch (e) {
      showError('Failed to save task. Please try again.');
    } finally {
      saving = false;
    }
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
<div class="overlay" on:click|self={() => requestClose()}>
  <div class="panel" use:trapFocus>
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
          <span class="tag-chip">
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
        {#if !showExtras}<span class="details-summary">{extrasSummary}</span>{/if}
        <svg class="section-chevron" class:open={showExtras} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
      </button>
      {#if showExtras}
        <div class="extras-panel" transition:slide={{ duration: 160 }}>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showRepeatReminder = !showRepeatReminder} aria-expanded={showRepeatReminder}>
              <span class="field-label">Repeat &amp; reminder</span>
              <svg class="section-chevron" class:open={showRepeatReminder} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showRepeatReminder}
              <div class="extra-block-body" transition:slide={{ duration: 160 }}>
                <div class="repeat-block">
                  <div class="repeat-row">
                    <div class="repeat-select-wrap" class:compact={!!recurrenceStr}>
                      <CustomSelect options={recurrenceOptions} bind:value={recurrenceStr} disabled={!due_date} />
                    </div>
                    {#if recurrenceStr}
                      <span class="repeat-every-text" aria-hidden="true">×</span>
                      <input type="number" min="1" max="365" class="repeat-interval-input" bind:value={recurrenceIntervalStr} aria-label="Repeat every N {recurrenceStr === 'daily' ? 'days' : recurrenceStr === 'weekly' ? 'weeks' : 'months'}" />
                      {#if recurrenceStr === 'daily'}
                        <button type="button" class="repeat-pill" class:active={recurrenceWeekdaysOnly} on:click={() => recurrenceWeekdaysOnly = !recurrenceWeekdaysOnly}>
                          Weekdays
                        </button>
                      {/if}
                      {#if task.recurrence}
                        <button type="button" class="repeat-pill repeat-pill-accent" on:click={skipToNext}>
                          Skip
                        </button>
                      {/if}
                    {/if}
                  </div>
                  {#if !due_date}<span class="repeat-hint">Set a due date to enable repeat</span>{/if}
                </div>

                <div class="reminder-field">
                  <label>
                    Reminder
                    <div class="reminder-row">
                      <CalendarPicker value={reminder_at} withTime on:change={(e) => reminder_at = e.detail} disabled={remindOnDue} />
                      <label class="remind-on-due-row">
                        <input type="checkbox" bind:checked={remindOnDue} disabled={!due_date} />
                        Remind me on the due date{#if due_date}&nbsp;at {fmtTime(new Date(`1970-01-01T${getDefaultReminderTime()}`))}{/if}
                      </label>
                    </div>
                  </label>
                  {#if reminder_at && $permissionState !== 'granted'}
                    <div class="reminder-hint">
                      {#if $permissionState === 'unsupported'}
                        Notifications aren't supported in this browser.
                      {:else}
                        Notifications aren't enabled yet —
                        <button type="button" class="reminder-enable-btn" on:click={() => requestPermission()}>enable them</button>
                        so this reminder can actually notify you.
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showChecklistBlock = !showChecklistBlock} aria-expanded={showChecklistBlock}>
              <span class="field-label">
                Checklist{#if checklist.length} <span class="checklist-progress">{checklist.filter(i => i.done).length}/{checklist.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showChecklistBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showChecklistBlock}
              <div class="extra-block-body checklist-field" transition:slide={{ duration: 160 }}>
                {#each checklist as item, i}
                  <div class="checklist-row">
                    <button type="button" class="checklist-check" class:done={item.done} on:click={() => toggleChecklistItem(i)} aria-label={item.done ? 'Mark not done' : 'Mark done'}>
                      {#if item.done}✓{/if}
                    </button>
                    <span class="checklist-text" class:done={item.done}>{item.text}</span>
                    <button type="button" class="checklist-remove" on:click={() => removeChecklistItem(i)} aria-label="Remove item">×</button>
                  </div>
                {/each}
                <input
                  class="checklist-input"
                  bind:value={checklistInput}
                  placeholder="Add item…"
                  enterkeyhint="done"
                  on:keydown={onChecklistKey}
                  on:blur={() => setTimeout(addChecklistItem, 150)}
                />
                {#if duplicateChecklistItems.length}
                  <p class="dup-name-hint">Repeated item{duplicateChecklistItems.length > 1 ? 's' : ''}: {duplicateChecklistItems.join(', ')}</p>
                {/if}
              </div>
            {/if}
          </div>

          {#if customFields.length > 0}
            <div class="extra-block">
              <button type="button" class="extra-block-toggle" on:click={() => showCustomFieldsBlock = !showCustomFieldsBlock} aria-expanded={showCustomFieldsBlock}>
                <span class="field-label">Custom fields</span>
                <svg class="section-chevron" class:open={showCustomFieldsBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
              </button>
              {#if showCustomFieldsBlock}
                <div class="extra-block-body custom-fields" transition:slide={{ duration: 160 }}>
                  {#each visibleFields as field (field.id)}
                    <label class="custom-field-label">
                      {field.name}
                      {#if field.type === 'select'}
                        <CustomSelect
                          options={[{ value: '', label: '—' }, ...(field.options ?? []).map(o => ({ value: o, label: o }))]}
                          value={(customValues[field.id] as string) ?? ''}
                          on:change={(e) => customValues[field.id] = e.detail || null}
                        />
                      {:else if field.type === 'date'}
                        <CalendarPicker value={(customValues[field.id] as string) ?? ''} on:change={(e) => customValues[field.id] = e.detail || null} />
                      {:else}
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          bind:value={customValues[field.id]}
                        />
                      {/if}
                    </label>
                  {/each}
                  {#if customFields.length > VISIBLE_FIELD_CAP}
                    <button type="button" class="add-field-btn" on:click={() => showAllFields = !showAllFields}>
                      {showAllFields ? 'Show fewer fields' : `Show ${customFields.length - VISIBLE_FIELD_CAP} more field${customFields.length - VISIBLE_FIELD_CAP > 1 ? 's' : ''}`}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showRelatedBlock = !showRelatedBlock} aria-expanded={showRelatedBlock}>
              <span class="field-label">
                Related{#if relatedTasks.length} <span class="checklist-progress">{relatedTasks.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showRelatedBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showRelatedBlock}
              <div class="extra-block-body related-field" transition:slide={{ duration: 160 }}>
                {#each relatedTasks as rt (rt._id)}
                  <div class="related-row" class:related-deleted={rt.deleted}>
                    {#if rt.deleted}
                      <span class="related-title">{rt.title} (deleted)</span>
                    {:else}
                      <button type="button" class="related-title related-title-link" on:click={() => dispatch('openRelated', rt._id!)}>{rt.title}</button>
                    {/if}
                    <span class="related-proj">{projectNameFor(rt)}</span>
                    <button type="button" class="checklist-remove" on:click={() => removeRelated(rt._id!)} disabled={relatedBusy} aria-label="Remove link">×</button>
                  </div>
                {/each}
                <input
                  class="checklist-input"
                  bind:value={relatedInput}
                  placeholder="Link another task…"
                  disabled={relatedBusy}
                />
                {#if relatedSuggestions.length}
                  <div class="tag-suggestions">
                    {#each relatedSuggestions as s (s._id)}
                      <button type="button" class="tag-suggestion" on:mousedown|preventDefault={() => addRelated(s._id!)}>{s.title} <span class="related-proj">{projectNameFor(s)}</span></button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showBlockedByBlock = !showBlockedByBlock} aria-expanded={showBlockedByBlock}>
              <span class="field-label">
                Blocked by{#if blockingTasks.length} <span class="checklist-progress" class:blocked-badge-active={unresolvedBlockers.length}>{blockingTasks.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showBlockedByBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showBlockedByBlock}
              <div class="extra-block-body related-field" transition:slide={{ duration: 160 }}>
                {#each blockingTasks as bt (bt._id)}
                  {@const resolved = isBlockerResolved(bt, lastColByProject)}
                  <div class="related-row" class:related-deleted={bt.deleted}>
                    {#if bt.deleted}
                      <span class="related-title">{bt.title} (deleted)</span>
                    {:else}
                      <button type="button" class="related-title related-title-link" on:click={() => dispatch('openRelated', bt._id!)}>{bt.title}</button>
                    {/if}
                    <span class="blocked-status" class:blocked-status-done={resolved}>{resolved ? 'Done' : 'Not done'}</span>
                    <span class="related-proj">{projectNameFor(bt)}</span>
                    <button type="button" class="checklist-remove" on:click={() => removeBlockedBy(bt._id!)} disabled={blockedByBusy} aria-label="Remove dependency">×</button>
                  </div>
                {/each}
                <input
                  class="checklist-input"
                  bind:value={blockedByInput}
                  placeholder="This task can't start until…"
                  disabled={blockedByBusy}
                />
                {#if blockedBySuggestions.length}
                  <div class="tag-suggestions">
                    {#each blockedBySuggestions as s (s._id)}
                      <button type="button" class="tag-suggestion" on:mousedown|preventDefault={() => addBlockedBy(s._id!)}>{s.title} <span class="related-proj">{projectNameFor(s)}</span></button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showAttachmentsBlock = !showAttachmentsBlock} aria-expanded={showAttachmentsBlock}>
              <span class="field-label">
                Attachments{#if attachments.length} <span class="checklist-progress">{attachments.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showAttachmentsBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showAttachmentsBlock}
              <div class="extra-block-body attachments-field" transition:slide={{ duration: 160 }}>
                {#each attachments as a (a.key)}
                  <div class="attachment-row">
                    <button type="button" class="attachment-open" on:click={() => openAttachment(a.key, a.filename)} title="Download {a.filename}">
                      {#if thumbnailUrls[a.key]}
                        <img class="attachment-thumb" src={thumbnailUrls[a.key]} alt="" />
                      {:else}
                        <span class="attachment-file-icon" aria-hidden="true">
                          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1.5h6l4 4v9a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z"/><path d="M9 1.5v4h4"/></svg>
                        </span>
                      {/if}
                      <span class="attachment-name">{a.filename}</span>
                      <span class="attachment-size">{formatAttachmentSize(a.size)}</span>
                    </button>
                    <button type="button" class="checklist-remove" on:click={() => removeAttachment(a.key)} disabled={attachmentBusy} aria-label="Remove attachment {a.filename}">×</button>
                  </div>
                {/each}
                <button type="button" class="attach-file-btn" disabled={attachmentBusy || attachments.length >= ATTACHMENT_MAX_PER_TASK} on:click={() => attachFileInputEl.click()}>
                  {attachmentBusy ? 'Attaching…' : attachments.length >= ATTACHMENT_MAX_PER_TASK ? `Max ${ATTACHMENT_MAX_PER_TASK} attachments reached` : '+ Attach a file'}
                </button>
                <!-- No `accept` restriction -- any file type is attachable except
                     HEIC/HEIF (rejected in attachOneFile() with a clear message);
                     `accept` can't express a negation, so this intentionally lets
                     the OS picker show everything and relies on the JS check. -->
                <input
                  bind:this={attachFileInputEl}
                  type="file" multiple style="display:none"
                  on:change={onFilesPicked}
                />
                {#if attachmentError}<p class="dup-name-hint">{attachmentError}</p>{/if}
              </div>
            {/if}
          </div>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showNotesBlock = !showNotesBlock} aria-expanded={showNotesBlock}>
              <span class="field-label">Notes (markdown)</span>
              <svg class="section-chevron" class:open={showNotesBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showNotesBlock}
              <div class="extra-block-body notes-wrap" transition:slide={{ duration: 160 }}>
                <textarea class="notes-textarea" bind:value={body} rows="4" placeholder="Notes…"></textarea>
                {#if body.length > NOTES_SOFT_LIMIT}
                  <div class="notes-counter">{body.length} characters</div>
                {/if}
                {#if similarNotesHint}<p class="dup-name-hint">{similarNotesHint}</p>{/if}
              </div>
            {/if}
          </div>

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
          <div class="actions-menu" bind:this={menuPanelEl} transition:fly={{ y: 4, duration: popScale.duration, easing: popScale.easing }}>
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
    flex-shrink: 0; transition: background .12s, color .12s;
  }
  .pin-btn:hover { background: var(--hover); color: var(--accent); }
  .pin-btn.pinned { color: var(--accent); }

  .close-btn {
    background: var(--hover); border: none; cursor: pointer;
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    font-size: .85rem; color: var(--muted); padding: 0;
    flex-shrink: 0; transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--border-strong); color: var(--text); }
  .fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .reminder-field { display: flex; flex-direction: column; gap: .35rem; }
  /* flex-wrap:wrap, not nowrap + horizontal scroll: a scrollbar on a
     compact modal control row reads worse on mobile than
     .remind-on-due-row dropping to a full line below the date picker. */
  .reminder-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  /* The picker takes flex:1 so leftover row width goes to it; the
     checkbox sizes to its content instead (flex:0 0 auto, on
     .remind-on-due-row below). Giving the checkbox flex:1 stretches it
     past its own nowrap text and leaves visible dead space. */
  .reminder-row :global(.cal-field) { flex: 1; min-width: 150px; }
  .section-divider { height: 1px; background: var(--border); margin: .05rem 0; }
  label {
    display: flex; flex-direction: column; gap: .22rem;
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
  /* The picker keeps a fixed-ish width (doesn't stretch to fill the row
     the way its own 100%-width trigger normally would) so the pills get
     real room next to it instead of being pushed off/wrapped. */
  .due-date-row { display: flex; align-items: center; gap: 8px; }
  .due-date-row :global(.cal-field) { flex: 0 0 auto; width: 150px; }
  /* One row, always -- nowrap + overflow-x auto as a safety valve on very
     narrow widths (a horizontal scroll on 4 short pills reads better than
     an awkward 3+1 wrap). */
  .due-shortcuts { display: flex; gap: 6px; flex-wrap: nowrap; margin-top: 0; overflow-x: auto; flex: 1; min-width: 0; }
  /* At true phone widths (~380px) the 150px calendar field eats most of
     the row, squeezing the shortcuts into a sliver that clips at the
     modal edge with no sign there's more to scroll. Stacking the two
     rows gives the shortcuts a full-width row of their own without
     reintroducing the wrap this row is built to avoid. */
  @media (max-width: 480px) {
    .due-date-row { flex-direction: column; align-items: stretch; }
    .due-date-row :global(.cal-field) { width: 100%; }
  }
  .due-shortcut {
    background: var(--col-bg); color: var(--muted); border: none;
    border-radius: 999px; font-size: .72rem; font-weight: 600; letter-spacing: normal;
    text-transform: none; font-family: 'Hanken Grotesk', sans-serif;
    padding: 5px 12px; cursor: pointer; transition: background .12s, color .12s;
    white-space: nowrap; flex-shrink: 0;
  }
  .due-shortcut:hover { background: var(--hover); color: var(--text); }
  .due-shortcut.active { background: var(--accent); color: var(--on-accent); }

  .reminder-hint {
    font-size: .72rem; color: var(--faint); line-height: 1.35;
    background: var(--col-bg); border-radius: var(--radius-sm);
    padding: .4rem .55rem;
  }

  .repeat-hint {
    font-size: .72rem; color: var(--faint); font-weight: 500;
    text-transform: none; letter-spacing: normal; font-family: 'Hanken Grotesk', sans-serif;
    margin-top: .2rem; display: block;
  }

  /* Every control in the revealed row (select, number input, both pills)
     must share one explicit height (--repeat-ctrl-h); letting each size
     itself from its own padding/font-size renders them at three
     different heights. .repeat-block's bottom margin keeps this section
     from running straight into Reminder below it. */
  .repeat-block { --repeat-ctrl-h: 30px; margin-bottom: .5rem; }
  .repeat-row {
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
  .repeat-select-wrap { width: 150px; flex-shrink: 0; height: var(--repeat-ctrl-h); }
  .repeat-select-wrap.compact { width: 86px; }
  .repeat-select-wrap :global(.cs-trigger) {
    height: var(--repeat-ctrl-h); box-sizing: border-box; padding: 0 6px; font-size: .8rem;
  }
  /* CustomSelect's .cs-panel is `left:0;right:0`, i.e. the full width of
     its trigger -- at this trigger's compact 86px that wraps "Not
     repeating" inside the option list. Widening just the panel (not the
     always-visible trigger) keeps the row compact and the dropdown
     readable. */
  .repeat-select-wrap :global(.cs-panel) { width: 150px; right: auto; }
  .repeat-every-text { flex-shrink: 0; }
  .repeat-interval-input {
    width: 30px; height: var(--repeat-ctrl-h); box-sizing: border-box;
    text-align: center; flex-shrink: 0;
    border: 1px solid var(--border-strong); border-radius: 6px;
    padding: 0 .15rem; font-size: .8rem; color: var(--text);
    background: var(--bg); font-family: inherit;
  }
  .repeat-interval-input:focus { border-color: var(--accent); outline: none; }
  .repeat-pill {
    flex-shrink: 0; height: var(--repeat-ctrl-h); box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface); color: var(--muted);
    border: 1px solid var(--border-strong); border-radius: 999px;
    font-size: .7rem; font-weight: 600; padding: 0 8px; cursor: pointer;
    white-space: nowrap;
    transition: background .12s, color .12s, border-color .12s;
  }
  .repeat-pill:hover { border-color: var(--accent); color: var(--text); }
  .repeat-pill.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  /* Skip is an action, not a state toggle like Weekdays-only -- accent
     outline, not accent fill, so it doesn't read as "currently on" the
     way .active does. */
  .repeat-pill-accent { border-color: var(--accent); color: var(--accent); }
  .repeat-pill-accent:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  /* flex:0 0 auto -- sizes to its own nowrap text and no further, so it
     leaves no dead space; the picker (flex:1 above) absorbs any leftover
     row width. nowrap keeps the full label ("Remind me on the due date at
     17:00") on one line rather than wrapping to two.
     The display/flex-direction !importants are required: the generic
     `label` rule above sets flex-direction:column and wins per-property
     over this more specific class otherwise. */
  .remind-on-due-row {
    display: flex !important; flex-direction: row !important; align-items: center;
    gap: .4rem; flex: 0 0 auto; white-space: nowrap;
    font-size: .74rem; color: var(--muted); font-weight: 500;
    text-transform: none; letter-spacing: normal; font-family: 'Hanken Grotesk', sans-serif;
    padding: .3rem .55rem; border-radius: var(--radius-sm);
    background: var(--col-bg); cursor: pointer; transition: background .12s, color .12s;
  }
  .remind-on-due-row:has(input:checked) { color: var(--text); background: color-mix(in srgb, var(--accent) 12%, var(--col-bg)); }
  .remind-on-due-row:has(input:disabled) { opacity: .55; cursor: default; }
  .remind-on-due-row input[type=checkbox] {
    accent-color: var(--accent); cursor: pointer; flex-shrink: 0;
    width: 13px; height: 13px; margin: 0;
  }
  .remind-on-due-row input[type=checkbox]:disabled { cursor: default; }
  .reminder-enable-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    color: var(--accent); font-weight: 600; font-size: inherit;
    text-decoration: underline;
  }
  .tags-field { display: flex; flex-direction: column; gap: .22rem; }
  .custom-fields { display: flex; flex-direction: column; gap: .3rem; }
  .custom-field-label {
    display: flex; flex-direction: column; gap: .22rem;
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
  .custom-field-label input {
    padding: .38rem .5rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .84rem; font-family: inherit;
    text-transform: none; letter-spacing: normal;
  }
  /* The native number-input spin buttons read as a stray unstyled OS
     control next to the other inputs, so they're hidden; the field stays
     type="number" (numeric keyboard on mobile, no behavior change). */
  /* standard `appearance` alongside the -moz- prefix: the prefixed one
     alone leaves non-Firefox engines on their default rendering. */
  .custom-field-label input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
  .custom-field-label input[type="number"]::-webkit-outer-spin-button,
  .custom-field-label input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none; margin: 0;
  }
  .add-field-btn {
    align-self: flex-start; background: none; border: none; cursor: pointer;
    color: var(--accent); font-size: .76rem; font-weight: 500; padding: .15rem 0;
  }
  .field-label {
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
  .tag-chip {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--col-bg); color: var(--accent); border-radius: 5px;
    font-size: .74rem; font-weight: 500; padding: 2px 7px;
  }
  .tag-remove {
    cursor: pointer; font-size: .9rem; line-height: 1; color: var(--muted);
    background: none; border: none; padding: 0;
    transition: color .12s;
  }
  .tag-remove:hover { color: var(--danger); }
  .tag-input {
    border: none; background: none; outline: none;
    font-size: .88rem; color: var(--text); min-width: 80px; flex: 1;
  }
  .tag-input::placeholder { color: var(--faint); }

  .tag-suggestions {
    display: flex; flex-wrap: wrap; gap: 5px; padding: 6px 2px;
  }
  .tag-suggestion {
    background: var(--col-bg); color: var(--accent); border-radius: 5px;
    font-size: .78rem; font-weight: 500; padding: 2px 9px; cursor: pointer;
    border: 1px solid var(--border); transition: background .12s;
  }
  .tag-suggestion:hover { background: var(--hover); }
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
    transition: background .12s, border-color .12s;
  }
  .section-toggle:hover { background: var(--hover); border-color: var(--border-strong); }
  .section-toggle .field-label { flex: 1; }
  .details-summary {
    font-family: 'Hanken Grotesk', sans-serif; font-size: .78rem;
    text-transform: none; letter-spacing: normal; color: var(--muted);
  }
  .section-chevron { color: var(--faint); flex-shrink: 0; transition: transform .12s ease, color .12s; }
  .section-chevron.open { transform: rotate(90deg); }
  .section-toggle:hover .section-chevron { color: var(--text); }
  .notes-wrap { display: block; }
  .notes-textarea { width: 100%; box-sizing: border-box; }
  .notes-counter {
    font-family: var(--mono); font-size: .68rem; color: var(--faint);
    text-align: right; margin-top: 3px;
  }
  .dup-name-hint { font-size: .72rem; color: var(--due-soon-ink); margin: 4px 0 0; line-height: 1.3; }

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
  .extra-block {
    background: var(--col-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: .1rem .6rem;
  }
  .extra-block-toggle {
    display: flex; align-items: center; gap: 8px; width: 100%;
    background: none; border: none; cursor: pointer; text-align: left;
    padding: .45rem 0;
  }
  .extra-block-toggle .field-label { flex: 1; }
  .extra-block-body { display: flex; flex-direction: column; gap: .3rem; padding-bottom: .5rem; }

  .related-field { display: flex; flex-direction: column; gap: .3rem; }
  .related-row { display: flex; align-items: center; gap: 7px; }
  .related-title { flex: 1; font-size: .84rem; color: var(--text); }
  .related-title-link {
    background: none; border: none; padding: 0; text-align: left;
    cursor: pointer; font-family: inherit;
  }
  .related-title-link:hover { color: var(--accent); text-decoration: underline; }
  .related-proj {
    font-family: var(--mono); font-size: .68rem; color: var(--faint);
    text-transform: uppercase; letter-spacing: .03em; white-space: nowrap;
  }
  .related-deleted .related-title { color: var(--faint); font-style: italic; }

  /* "Blocked by" reuses .related-row/.related-proj above — only the
     done/not-done status pill and the badge's active (still-blocking)
     tint are new. */
  .blocked-status {
    font-size: .68rem; font-weight: 700; white-space: nowrap;
    padding: 1px 7px; border-radius: 999px;
    color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent);
  }
  .blocked-status-done { color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); }
  .blocked-badge-active { color: var(--danger); }

  .checklist-field { display: flex; flex-direction: column; gap: .3rem; }
  .checklist-progress { color: var(--accent); font-weight: 600; margin-left: 4px; }
  .checklist-row { display: flex; align-items: center; gap: 7px; }
  .checklist-check {
    flex-shrink: 0; width: 17px; height: 17px; border-radius: 5px;
    border: 1.5px solid var(--border-strong); background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: .68rem; color: var(--on-accent); cursor: pointer; padding: 0;
    transition: background .12s, border-color .12s;
  }
  .checklist-check.done { background: var(--accent); border-color: var(--accent); animation: check-pop .15s cubic-bezier(0.4,0,0.2,1); }
  @keyframes check-pop { from { transform: scale(.7); } to { transform: scale(1); } }
  .checklist-text { flex: 1; font-size: .84rem; color: var(--text); transition: color .12s; }
  .checklist-text.done { color: var(--faint); text-decoration: line-through; }
  .checklist-remove {
    flex-shrink: 0; cursor: pointer; font-size: .9rem; line-height: 1;
    color: var(--muted); background: none; border: none; padding: 0 2px;
    transition: color .12s;
  }
  .checklist-remove:hover { color: var(--danger); }
  .checklist-input {
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); outline: none;
    font-size: .84rem; color: var(--text); padding: .35rem .5rem;
  }
  .checklist-input:focus { border-color: var(--accent); }
  .checklist-input::placeholder { color: var(--faint); }

  /* File attachments */
  .attachments-field { display: flex; flex-direction: column; gap: .3rem; }
  .attachment-row { display: flex; align-items: center; gap: 7px; }
  .attachment-open {
    flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;
    background: none; border: none; padding: .2rem 0; text-align: left; cursor: pointer;
    font-family: inherit; color: var(--text); border-radius: 6px;
  }
  .attachment-open:hover .attachment-name { color: var(--accent); text-decoration: underline; }
  .attachment-thumb {
    width: 26px; height: 26px; border-radius: 5px; object-fit: cover;
    flex-shrink: 0; border: 1px solid var(--border);
  }
  .attachment-file-icon {
    width: 26px; height: 26px; border-radius: 5px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface); border: 1px solid var(--border); color: var(--faint);
  }
  .attachment-name { flex: 1; font-size: .84rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .attachment-size {
    font-family: var(--mono); font-size: .68rem; color: var(--faint); flex-shrink: 0;
  }
  .attach-file-btn {
    align-self: flex-start; font-size: .82rem; color: var(--accent); cursor: pointer;
    padding: .3rem .2rem; border-radius: 6px; transition: background .12s;
    background: none; border: none; font-family: inherit;
  }
  .attach-file-btn:hover { background: var(--hover); }
  .attach-file-btn:disabled { color: var(--faint); cursor: default; }
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
    transition: background .12s, color .12s;
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
