///<reference types="svelte" />
;
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
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);;let $permissionState = __sveltets_2_store_get(permissionState);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

   let task: TaskDoc/*Ωignore_startΩ*/;task = __sveltets_2_any(task);/*Ωignore_endΩ*/;
   let project: ProjectDoc/*Ωignore_startΩ*/;project = __sveltets_2_any(project);/*Ωignore_endΩ*/;

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

  // B25: one-tap relative shortcuts for the common "just remind me in a
  // week" case — the exact-date picker stays for anything else. Local
  // calendar dates (not UTC) so "Today" can't roll over to yesterday for
  // anyone west of UTC, matching how <input type="date"> itself works.
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

  // B30: soft guardrail only — a visible counter past this length, not a
  // hard block. Notes are unbounded markdown; this just flags when one has
  // grown long enough that it might belong in a separate doc instead.
  const NOTES_SOFT_LIMIT = 500;

  let title = task.title;
  let body = task.body;

  // Owner-requested (2026-07-20) duplicate nudges — never block saving,
  // see utils.ts's own header comment for the full reasoning. Debounced
  // (maintenance pass, 2026-07-20): both re-fire on every keystroke via
  // the two-way bound title/body inputs, and checkNotesSimilarity in
  // particular scans every task's body in the whole app, not just this
  // project — debouncing keeps that off the hot keystroke path.
  let duplicateTitleHint = '';
  let titleCheckTimer: ReturnType<typeof setTimeout> | undefined;
  ;() => {$: { clearTimeout(titleCheckTimer); titleCheckTimer = setTimeout(() => checkTitleDuplicate(title, project._id, task._id), 350); }}
  async function checkTitleDuplicate(t: string, projectId: string, excludeId?: string) {
    if (!t.trim()) { duplicateTitleHint = ''; return; }
    const matches = await findTasksByTitleInProject(projectId, t, excludeId);
    duplicateTitleHint = matches.length ? `Another task titled "${t.trim()}" already exists in this project.` : '';
  }

  let similarNotesHint = '';
  let notesCheckTimer: ReturnType<typeof setTimeout> | undefined;
  ;() => {$: { clearTimeout(notesCheckTimer); notesCheckTimer = setTimeout(() => checkNotesSimilarity(body, task._id), 350); }}
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
  ;() => {$: if (showAttachmentsBlock) ensureThumbnails();}
  let priority = task.priority;
  // CustomSelect only takes string values — priority stays 1|2|3 for
  // save()/everything else, this is just a bound proxy for the picker.
  let priorityStr = String(priority);
  $: priority = __sveltets_2_invalidate(() => ((Number(priorityStr) || 1) as 1 | 2 | 3));
  const statusOptions = project.columns.map(col => ({ value: col.id, label: col.name }));
  const priorityOptions = [
    { value: '1', label: 'Low' },
    { value: '2', label: 'Medium' },
    { value: '3', label: 'High' },
  ];
  let due_date = task.due_date ?? '';
  let reminder_at = task.reminder_at ? isoToLocalInput(task.reminder_at) : '';
  let remindOnDue = task.remindOnDue ?? false;

  // B12: derives reminder_at from due_date + the configured default time
  // whenever the toggle is on and due_date changes — recomputed live, not
  // just once on enable, so editing the due date afterward keeps the
  // reminder in sync without needing to re-toggle.
  function dueDateToReminderInput(date: string): string {
    const [h, m] = getDefaultReminderTime().split(':');
    return `${date}T${h}:${m}`;
  }
  ;() => {$: if (remindOnDue && due_date) reminder_at = dueDateToReminderInput(due_date);}
  // Recurrence needs a due_date to advance from — see db.ts's
  // spawnNextRecurrence() comment. Clearing the due date while a repeat
  // rule is set would leave a rule nothing can act on, so clear it too
  // rather than silently keep a rule the UI no longer shows a control for.
  //
  // Rewritten from scratch (2026-07-31, fourth pass, owner-specified
  // shape): one select only -- "Not repeating" by default, Day/Week/
  // Month as the other options -- no separate enable checkbox and no
  // second unit dropdown duplicating it. Picking a real option reveals
  // the rest of the row (interval number, Weekdays-only pill, Skip-this-
  // one pill) inline, all sharing one explicit control height so the
  // input/select/pills don't render at three different heights.
  // recurrenceStr is the single source of truth; recurrence is a pure
  // derived value, never assigned directly.
  const recurrenceOptions = [
    { value: '', label: 'Not repeating' },
    { value: 'daily', label: 'Day' },
    { value: 'weekly', label: 'Week' },
    { value: 'monthly', label: 'Month' },
  ];
  let recurrenceStr = task.recurrence ?? '';
  ;() => {$: if (!due_date && recurrenceStr) recurrenceStr = '';}
  let  recurrence = __sveltets_2_invalidate(() => ((recurrenceStr || null) as 'daily' | 'weekly' | 'monthly' | null));
  // Roadmap "custom recurrence intervals" -- every N days/weeks/months
  // instead of always N=1, plus a "weekdays only" toggle for daily.
  // Kept as a plain string bound to the number input (not a number
  // directly) so an in-progress empty/partial edit doesn't immediately
  // collapse to NaN -- recurrenceInterval below is the derived, clamped
  // value actually sent on save.
  let recurrenceIntervalStr = String(task.recurrenceInterval ?? 1);
  let  recurrenceInterval = __sveltets_2_invalidate(() => Math.max(1, Math.min(365, parseInt(recurrenceIntervalStr, 10) || 1)));
  let recurrenceWeekdaysOnly = task.recurrenceWeekdaysOnly ?? false;
  let column_id = task.column_id;
  let tags: string[] = [...(task.tags ?? [])];
  let pinned = task.pinned ?? false;
  // B18 — flat, not nested/reorderable. Same batched-into-save() pattern
  // as tags/custom fields, not an immediate-write-per-toggle — consistent
  // with every other field in this form.
  let checklist: { text: string; done: boolean }[] = (task.checklist ?? []).map(i => ({ ...i }));
  let checklistInput = '';
  let  duplicateChecklistItems = __sveltets_2_invalidate(() => findDuplicateChecklistItems(checklist));
  let tagInput = '';
  let tagSuggestions: string[] = [];
  let otherTagSuggestions: string[] = [];
  let allTags: string[] = [];
  let projectTags: string[] = [];
  let saving = false;
  let showHistory = false;

  // v6.7.0 — task linking, non-directional "related to" only. Unlike
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

  // ROADMAP.md "Blocked by" — same immediate-write pattern as Related
  // above, deliberately kept as its own separate block/field rather than
  // folded into Related (v6.7.0 decision: Related stays non-directional
  // and dependency-free).
  let blockingTasks: TaskDoc[] = [];
  let blockedByInput = '';
  let blockedBySuggestions: TaskDoc[] = [];
  let blockedByBusy = false;

  async function loadBlockingTasks() {
    blockingTasks = await getBlockingTasks(task._id!);
  }

  let  lastColByProject = __sveltets_2_invalidate(() => Object.fromEntries($projects.map(p => [p._id, p.columns.at(-1)?.id])));
  let  unresolvedBlockers = __sveltets_2_invalidate(() => blockingTasks.filter(b => !isBlockerResolved(b, lastColByProject)));

  // B16 (revised): field definitions are global (Settings → Organize →
  // Manage Custom Fields), not managed from here — CardDetail only reads
  // and fills in values. custom_values stays keyed by field id, not name
  // (see types.ts), so a field rename in Settings doesn't orphan values.
  let customFields: CustomFieldDef[] = [];
  let customValues: Record<string, string | number | null> = { ...(task.custom_values ?? {}) };

  // Refined further (owner feedback, 2026-07-30): only the due date
  // *value* itself is mandatory (joining Status/Priority/Tags) --
  // Repeat and Reminder move into Extras along with Checklist/Custom
  // fields/Related/Notes, all as their own compact blocks. Extras also
  // no longer auto-opens just because it has content -- owner: "don't
  // open extra also [on open], if user wants he/she will open extras
  // and update or check information". Always starts collapsed now,
  // full stop, regardless of what's already filled in underneath.
  let showExtras = false;
  // Owner feedback, 2026-07-30: each of the five blocks inside Extras
  // gets its own collapse too, same "never auto-open, full stop" rule
  // as the outer Extras toggle -- opening Extras used to dump all five
  // open at once (blocks were just always-expanded cards); now each
  // stays collapsed until clicked, regardless of whether it already
  // has content.
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
  let  visibleFields = __sveltets_2_invalidate(() => showAllFields ? customFields : customFields.slice(0, VISIBLE_FIELD_CAP));

  const RECURRENCE_LABEL: Record<string, string> = { daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly' };
  // Collapsed-state summary for the outer "Extras" toggle -- Repeat/
  // Reminder now live in here too, so the summary covers them alongside
  // checklist/related/notes. Every value read is passed in as an
  // argument (not read from closure) so Svelte's static dependency
  // analysis on the `$:` call actually re-runs this when any of them
  // changes.
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
  let  extrasSummary = __sveltets_2_invalidate(() => formatExtrasSummary(reminder_at, recurrence, recurrenceInterval, recurrenceWeekdaysOnly, checklist, relatedTasks, blockingTasks, unresolvedBlockers.length, attachments, body));

  // B49: Delete/Archive/Duplicate/history used to be 4 separate always-
  // visible controls (3 flat footer buttons + a "Show history" text
  // toggle competing with Notes for space). Consolidated into one "⋯"
  // menu — same click-outside-closes pattern CustomSelect.svelte already
  // uses, not a new mechanism. (Created/Updated timestamps were tried
  // here too but dropped — once History is open the panel itself shows
  // the same info, making the static menu text redundant/confusing.)
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

  // B26: tags already used in *this* project are the most likely match,
  // so they're suggested first — everywhere-else tags are still offered,
  // just as a clearly separate, secondary group rather than one flat
  // undifferentiated list.
  ;() => {$: {
    const q = tagInput.trim().toLowerCase();
    if (q) {
      tagSuggestions = projectTags.filter(t => t.startsWith(q) && !tags.includes(t));
      otherTagSuggestions = allTags.filter(t => t.startsWith(q) && !tags.includes(t) && !projectTags.includes(t));
    } else {
      tagSuggestions = [];
      otherTagSuggestions = [];
    }
  }}

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

  ;() => {$: {
    const q = relatedInput.trim();
    if (q) {
      searchTasksForLinking(q, task._id!, relatedTasks.map(t => t._id!)).then(r => relatedSuggestions = r);
    } else {
      relatedSuggestions = [];
    }
  }}

  ;() => {$: {
    const q = blockedByInput.trim();
    if (q) {
      searchTasksForLinking(q, task._id!, blockingTasks.map(t => t._id!)).then(r => blockedBySuggestions = r);
    } else {
      blockedBySuggestions = [];
    }
  }}

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

  // v6.8.0 — file attachments. Immediate-write like Related above (same
  // reasoning: attaching a file is its own discrete action, not part of
  // the "collect locally, write on Save" pattern the rest of this form
  // uses for title/tags/checklist/etc.), not batched into save().
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
  // actually shrinks a modern phone photo (4000px+) meaningfully -- see the
  // size-optimization discussion this came out of.
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

  // Roadmap: "skip one recurrence occurrence" -- advances due date/
  // reminder/checklist to the next occurrence without logging a
  // completion, for the day you're not doing this one but don't want
  // the series stuck overdue. Closes afterward (same as archive/
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
;
async () => {

 { svelteHTML.createElement("svelte:window", {     "on:keydown":onWindowKeydown,"on:click":onWindowClick,});}


 { svelteHTML.createElement("div", {   "class":`overlay`,"on:click":() => requestClose(),});
   {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {  "class":`panel`,});
     { svelteHTML.createElement("div", { "class":`panel-header`,});
       { svelteHTML.createElement("textarea", {         "class":`title-input`,"bind:value":title,"placeholder":`Task title`,"rows":1,"on:input":(e) => { const t = e.currentTarget; t.style.height='auto'; t.style.height=t.scrollHeight+'px'; },});/*Ωignore_startΩ*/() => title = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
       { svelteHTML.createElement("button", {      "class":`pin-btn`,"on:click":() => pinned = !pinned,"title":pinned ? 'Unpin' : 'Pin task',});pinned;
          { const $$_ratSniP4C = __sveltets_2_ensureComponent(PinStar); new $$_ratSniP4C({ target: __sveltets_2_any(), props: {    "size":15,"filled":pinned,"stroked":true,}});}
       }
       { svelteHTML.createElement("button", {   "class":`close-btn`,"on:click":() => requestClose(),});  }
     }
    if(duplicateTitleHint){ { svelteHTML.createElement("p", { "class":`dup-name-hint`,});duplicateTitleHint; }}

     { svelteHTML.createElement("div", { "class":`fields-row`,});
       { svelteHTML.createElement("label", {});
        
         { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {    "options":statusOptions,value:column_id,}});/*Ωignore_startΩ*/() => column_id = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC4.$$bindings = 'value';}
       }

       { svelteHTML.createElement("label", {});
        
         { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {    "options":priorityOptions,value:priorityStr,}});/*Ωignore_startΩ*/() => priorityStr = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC4.$$bindings = 'value';}
       }
     }

    
     { svelteHTML.createElement("div", { "class":`detail-block`,});
       { svelteHTML.createElement("label", {});
         
        
         { svelteHTML.createElement("div", { "class":`due-date-row`,});
           { const $$_rekciPradnelaC5C = __sveltets_2_ensureComponent(CalendarPicker); const $$_rekciPradnelaC5 = new $$_rekciPradnelaC5C({ target: __sveltets_2_any(), props: {    "value":due_date,}});$$_rekciPradnelaC5.$on("change", (e) => due_date = e.detail);}
           { svelteHTML.createElement("div", { "class":`due-shortcuts`,});
              for(let s of __sveltets_2_ensureArray(DUE_SHORTCUTS)){
               { svelteHTML.createElement("button", {        "type":`button`,"class":`due-shortcut`,"on:click":() => due_date = dateFromToday(s.days, s.months),});due_date === dateFromToday(s.days, s.months);s.label; }
            }
           }
         }
       }
     }

     { svelteHTML.createElement("div", { "class":`section-divider`,}); }

     { svelteHTML.createElement("div", { "class":`tags-field`,});
       { svelteHTML.createElement("span", { "class":`field-label`,});  }
       { svelteHTML.createElement("div", { "class":`tags-input-row`,});
          for(let tag of __sveltets_2_ensureArray(tags)){
           { svelteHTML.createElement("span", { "class":`tag-chip`,});
            tag;
             { svelteHTML.createElement("button", {     "class":`tag-remove`,"on:click":() => removeTag(tag),"aria-label":`Remove tag ${tag}`,});  }
           }
        }
         { svelteHTML.createElement("input", {             "class":`tag-input`,"bind:value":tagInput,"placeholder":tags.length ? '' : 'Add tag…',"enterkeyhint":`done`,"on:keydown":onTagKey,"on:blur":() => setTimeout(addTag, 150),});/*Ωignore_startΩ*/() => tagInput = __sveltets_2_any(null);/*Ωignore_endΩ*/}
       }
      if(tagSuggestions.length || otherTagSuggestions.length){
         { svelteHTML.createElement("div", { "class":`tag-suggestions`,});
            for(let s of __sveltets_2_ensureArray(tagSuggestions)){
            
             { svelteHTML.createElement("button", {   "class":`tag-suggestion`,"on:mousedown":() => { tags = [...tags, s]; tagInput = ''; },});s; }
          }
          if(tagSuggestions.length && otherTagSuggestions.length){
             { svelteHTML.createElement("div", { "class":`tag-suggestions-divider`,});  }
          }
            for(let s of __sveltets_2_ensureArray(otherTagSuggestions)){
             { svelteHTML.createElement("button", {   "class":`tag-suggestion tag-suggestion-other`,"on:mousedown":() => { tags = [...tags, s]; tagInput = ''; },});s; }
          }
         }
      }
     }

     { svelteHTML.createElement("div", { "class":`section-divider`,}); }

    
     { svelteHTML.createElement("div", { "class":`collapsible-section`,});
       { svelteHTML.createElement("button", {       "type":`button`,"class":`section-toggle extras-toggle`,"on:click":() => showExtras = !showExtras,"aria-expanded":showExtras,});
         { svelteHTML.createElement("span", { "class":`field-label`,});  }
        if(!showExtras){ { svelteHTML.createElement("span", { "class":`details-summary`,});extrasSummary; }}
         { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showExtras;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
       }
      if(showExtras){
         { svelteHTML.createElement("div", {   "class":`extras-panel`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));

           { svelteHTML.createElement("div", { "class":`extra-block`,});
             { svelteHTML.createElement("button", {       "type":`button`,"class":`extra-block-toggle`,"on:click":() => showRepeatReminder = !showRepeatReminder,"aria-expanded":showRepeatReminder,});
               { svelteHTML.createElement("span", { "class":`field-label`,});   }
               { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showRepeatReminder;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
             }
            if(showRepeatReminder){
               { svelteHTML.createElement("div", {   "class":`extra-block-body`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
                 { svelteHTML.createElement("div", { "class":`repeat-block`,});
                   { svelteHTML.createElement("div", { "class":`repeat-row`,});
                     { svelteHTML.createElement("div", {  "class":`repeat-select-wrap`,});!!recurrenceStr;
                       { const $$_tceleSmotsuC9C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC9 = new $$_tceleSmotsuC9C({ target: __sveltets_2_any(), props: {      "options":recurrenceOptions,value:recurrenceStr,"disabled":!due_date,}});/*Ωignore_startΩ*/() => recurrenceStr = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC9.$$bindings = 'value';}
                     }
                    if(recurrenceStr){
                       { svelteHTML.createElement("span", {   "class":`repeat-every-text`,"aria-hidden":`true`,});  }
                       { svelteHTML.createElement("input", {            "type":`number`,"min":`1`,"max":`365`,"class":`repeat-interval-input`,"bind:value":recurrenceIntervalStr,"aria-label":`Repeat every N ${recurrenceStr === 'daily' ? 'days' : recurrenceStr === 'weekly' ? 'weeks' : 'months'}`,});/*Ωignore_startΩ*/() => recurrenceIntervalStr = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                      if(recurrenceStr === 'daily'){
                         { svelteHTML.createElement("button", {      "type":`button`,"class":`repeat-pill`,"on:click":() => recurrenceWeekdaysOnly = !recurrenceWeekdaysOnly,});recurrenceWeekdaysOnly;
                          
                         }
                      }
                      if(task.recurrence){
                         { svelteHTML.createElement("button", {     "type":`button`,"class":`repeat-pill repeat-pill-accent`,"on:click":skipToNext,});
                          
                         }
                      }
                    }
                   }
                  if(!due_date){ { svelteHTML.createElement("span", { "class":`repeat-hint`,});       }}
                 }

                 { svelteHTML.createElement("div", { "class":`reminder-field`,});
                   { svelteHTML.createElement("label", {});
                    
                    
                     { svelteHTML.createElement("div", { "class":`reminder-row`,});
                       { const $$_rekciPradnelaC9C = __sveltets_2_ensureComponent(CalendarPicker); const $$_rekciPradnelaC9 = new $$_rekciPradnelaC9C({ target: __sveltets_2_any(), props: {       "value":reminder_at,"withTime":true,"disabled":remindOnDue,}});$$_rekciPradnelaC9.$on("change", (e) => reminder_at = e.detail);}
                       { svelteHTML.createElement("label", { "class":`remind-on-due-row`,});
                         { svelteHTML.createElement("input", {      "type":`checkbox`,"bind:checked":remindOnDue,"disabled":!due_date,});/*Ωignore_startΩ*/() => remindOnDue = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                             if(due_date){  fmtTime(new Date(`1970-01-01T${getDefaultReminderTime()}`));}
                       }
                     }
                   }
                  if(reminder_at && $permissionState !== 'granted'){
                     { svelteHTML.createElement("div", { "class":`reminder-hint`,});
                      if($permissionState === 'unsupported'){     }else{    
                         { svelteHTML.createElement("button", {     "type":`button`,"class":`reminder-enable-btn`,"on:click":() => requestPermission(),});  }
                              }
                     }
                  }
                 }
               }
            }
           }

           { svelteHTML.createElement("div", { "class":`extra-block`,});
             { svelteHTML.createElement("button", {       "type":`button`,"class":`extra-block-toggle`,"on:click":() => showChecklistBlock = !showChecklistBlock,"aria-expanded":showChecklistBlock,});
               { svelteHTML.createElement("span", { "class":`field-label`,});
                if(checklist.length){  { svelteHTML.createElement("span", { "class":`checklist-progress`,});checklist.filter(i => i.done).length; checklist.length; }}
               }
               { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showChecklistBlock;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
             }
            if(showChecklistBlock){
               { svelteHTML.createElement("div", {   "class":`extra-block-body checklist-field`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
                   for(let item of __sveltets_2_ensureArray(checklist)){let i = 1;
                   { svelteHTML.createElement("div", { "class":`checklist-row`,});
                     { svelteHTML.createElement("button", {        "type":`button`,"class":`checklist-check`,"on:click":() => toggleChecklistItem(i),"aria-label":item.done ? 'Mark not done' : 'Mark done',});item.done;
                      if(item.done){ }
                     }
                     { svelteHTML.createElement("span", {  "class":`checklist-text`,});item.done;item.text; }
                     { svelteHTML.createElement("button", {       "type":`button`,"class":`checklist-remove`,"on:click":() => removeChecklistItem(i),"aria-label":`Remove item`,});  }
                   }
                }
                 { svelteHTML.createElement("input", {             "class":`checklist-input`,"bind:value":checklistInput,"placeholder":`Add item…`,"enterkeyhint":`done`,"on:keydown":onChecklistKey,"on:blur":() => setTimeout(addChecklistItem, 150),});/*Ωignore_startΩ*/() => checklistInput = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                if(duplicateChecklistItems.length){
                   { svelteHTML.createElement("p", { "class":`dup-name-hint`,}); duplicateChecklistItems.length > 1 ? 's' : ''; duplicateChecklistItems.join(', '); }
                }
               }
            }
           }

          if(customFields.length > 0){
             { svelteHTML.createElement("div", { "class":`extra-block`,});
               { svelteHTML.createElement("button", {       "type":`button`,"class":`extra-block-toggle`,"on:click":() => showCustomFieldsBlock = !showCustomFieldsBlock,"aria-expanded":showCustomFieldsBlock,});
                 { svelteHTML.createElement("span", { "class":`field-label`,});  }
                 { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showCustomFieldsBlock;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
               }
              if(showCustomFieldsBlock){
                 { svelteHTML.createElement("div", {   "class":`extra-block-body custom-fields`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
                     for(let field of __sveltets_2_ensureArray(visibleFields)){field.id;
                     { svelteHTML.createElement("label", { "class":`custom-field-label`,});
                      field.name;
                      if(field.type === 'select'){
                         { const $$_tceleSmotsuC7C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC7 = new $$_tceleSmotsuC7C({ target: __sveltets_2_any(), props: {       "options":[{ value: '', label: '—' }, ...(field.options ?? []).map(o => ({ value: o, label: o }))],"value":(customValues[field.id] as string) ?? '',}});$$_tceleSmotsuC7.$on("change", (e) => customValues[field.id] = e.detail || null);}
                      } else if (field.type === 'date'){
                         { const $$_rekciPradnelaC7C = __sveltets_2_ensureComponent(CalendarPicker); const $$_rekciPradnelaC7 = new $$_rekciPradnelaC7C({ target: __sveltets_2_any(), props: {    "value":(customValues[field.id] as string) ?? '',}});$$_rekciPradnelaC7.$on("change", (e) => customValues[field.id] = e.detail || null);}
                      }else{
                         { svelteHTML.createElement("input", {     "type":field.type === 'number' ? 'number' : 'text',"bind:value":customValues[field.id],});/*Ωignore_startΩ*/() => customValues[field.id] = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                      }
                     }
                  }
                  if(customFields.length > VISIBLE_FIELD_CAP){
                     { svelteHTML.createElement("button", {     "type":`button`,"class":`add-field-btn`,"on:click":() => showAllFields = !showAllFields,});
                      showAllFields ? 'Show fewer fields' : `Show ${customFields.length - VISIBLE_FIELD_CAP} more field${customFields.length - VISIBLE_FIELD_CAP > 1 ? 's' : ''}`;
                     }
                  }
                 }
              }
             }
          }

           { svelteHTML.createElement("div", { "class":`extra-block`,});
             { svelteHTML.createElement("button", {       "type":`button`,"class":`extra-block-toggle`,"on:click":() => showRelatedBlock = !showRelatedBlock,"aria-expanded":showRelatedBlock,});
               { svelteHTML.createElement("span", { "class":`field-label`,});
                if(relatedTasks.length){  { svelteHTML.createElement("span", { "class":`checklist-progress`,});relatedTasks.length; }}
               }
               { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showRelatedBlock;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
             }
            if(showRelatedBlock){
               { svelteHTML.createElement("div", {   "class":`extra-block-body related-field`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
                   for(let rt of __sveltets_2_ensureArray(relatedTasks)){rt._id;
                   { svelteHTML.createElement("div", {  "class":`related-row`,});rt.deleted;
                    if(rt.deleted){
                       { svelteHTML.createElement("span", { "class":`related-title`,});rt.title;  }
                    }else{
                       { svelteHTML.createElement("button", {     "type":`button`,"class":`related-title related-title-link`,"on:click":() => dispatch('openRelated', rt._id!),});rt.title; }
                    }
                     { svelteHTML.createElement("span", { "class":`related-proj`,});projectNameFor(rt); }
                     { svelteHTML.createElement("button", {         "type":`button`,"class":`checklist-remove`,"on:click":() => removeRelated(rt._id!),"disabled":relatedBusy,"aria-label":`Remove link`,});  }
                   }
                }
                 { svelteHTML.createElement("input", {         "class":`checklist-input`,"bind:value":relatedInput,"placeholder":`Link another task…`,"disabled":relatedBusy,});/*Ωignore_startΩ*/() => relatedInput = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                if(relatedSuggestions.length){
                   { svelteHTML.createElement("div", { "class":`tag-suggestions`,});
                       for(let s of __sveltets_2_ensureArray(relatedSuggestions)){s._id;
                       { svelteHTML.createElement("button", {     "type":`button`,"class":`tag-suggestion`,"on:mousedown":() => addRelated(s._id!),});s.title;  { svelteHTML.createElement("span", { "class":`related-proj`,});projectNameFor(s); } }
                    }
                   }
                }
               }
            }
           }

           { svelteHTML.createElement("div", { "class":`extra-block`,});
             { svelteHTML.createElement("button", {       "type":`button`,"class":`extra-block-toggle`,"on:click":() => showBlockedByBlock = !showBlockedByBlock,"aria-expanded":showBlockedByBlock,});
               { svelteHTML.createElement("span", { "class":`field-label`,});
                 if(blockingTasks.length){  { svelteHTML.createElement("span", {  "class":`checklist-progress`,});unresolvedBlockers.length;blockingTasks.length; }}
               }
               { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showBlockedByBlock;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
             }
            if(showBlockedByBlock){
               { svelteHTML.createElement("div", {   "class":`extra-block-body related-field`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
                   for(let bt of __sveltets_2_ensureArray(blockingTasks)){bt._id;
                  const resolved = isBlockerResolved(bt, lastColByProject);
                   { svelteHTML.createElement("div", {  "class":`related-row`,});bt.deleted;
                    if(bt.deleted){
                       { svelteHTML.createElement("span", { "class":`related-title`,});bt.title;  }
                    }else{
                       { svelteHTML.createElement("button", {     "type":`button`,"class":`related-title related-title-link`,"on:click":() => dispatch('openRelated', bt._id!),});bt.title; }
                    }
                     { svelteHTML.createElement("span", {  "class":`blocked-status`,});resolved;resolved ? 'Done' : 'Not done'; }
                     { svelteHTML.createElement("span", { "class":`related-proj`,});projectNameFor(bt); }
                     { svelteHTML.createElement("button", {         "type":`button`,"class":`checklist-remove`,"on:click":() => removeBlockedBy(bt._id!),"disabled":blockedByBusy,"aria-label":`Remove dependency`,});  }
                   }
                }
                 { svelteHTML.createElement("input", {         "class":`checklist-input`,"bind:value":blockedByInput,"placeholder":`This task can't start until…`,"disabled":blockedByBusy,});/*Ωignore_startΩ*/() => blockedByInput = __sveltets_2_any(null);/*Ωignore_endΩ*/}
                if(blockedBySuggestions.length){
                   { svelteHTML.createElement("div", { "class":`tag-suggestions`,});
                       for(let s of __sveltets_2_ensureArray(blockedBySuggestions)){s._id;
                       { svelteHTML.createElement("button", {     "type":`button`,"class":`tag-suggestion`,"on:mousedown":() => addBlockedBy(s._id!),});s.title;  { svelteHTML.createElement("span", { "class":`related-proj`,});projectNameFor(s); } }
                    }
                   }
                }
               }
            }
           }

           { svelteHTML.createElement("div", { "class":`extra-block`,});
             { svelteHTML.createElement("button", {       "type":`button`,"class":`extra-block-toggle`,"on:click":() => showAttachmentsBlock = !showAttachmentsBlock,"aria-expanded":showAttachmentsBlock,});
               { svelteHTML.createElement("span", { "class":`field-label`,});
                if(attachments.length){  { svelteHTML.createElement("span", { "class":`checklist-progress`,});attachments.length; }}
               }
               { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showAttachmentsBlock;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
             }
            if(showAttachmentsBlock){
               { svelteHTML.createElement("div", {   "class":`extra-block-body attachments-field`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
                   for(let a of __sveltets_2_ensureArray(attachments)){a.key;
                   { svelteHTML.createElement("div", { "class":`attachment-row`,});
                     { svelteHTML.createElement("button", {       "type":`button`,"class":`attachment-open`,"on:click":() => openAttachment(a.key, a.filename),"title":`Download ${a.filename}`,});
                      if(thumbnailUrls[a.key]){
                          { svelteHTML.createElement("img", {    "class":`attachment-thumb`,"src":thumbnailUrls[a.key],"alt":"",});}
                      }else{
                         { svelteHTML.createElement("span", {   "class":`attachment-file-icon`,"aria-hidden":`true`,});
                           { svelteHTML.createElement("svg", {               "viewBox":`0 0 16 16`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.4`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("path", { "d":`M3 1.5h6l4 4v9a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z`,});}  { svelteHTML.createElement("path", { "d":`M9 1.5v4h4`,});} }
                         }
                      }
                       { svelteHTML.createElement("span", { "class":`attachment-name`,});a.filename; }
                       { svelteHTML.createElement("span", { "class":`attachment-size`,});formatAttachmentSize(a.size); }
                     }
                     { svelteHTML.createElement("button", {         "type":`button`,"class":`checklist-remove`,"on:click":() => removeAttachment(a.key),"disabled":attachmentBusy,"aria-label":`Remove attachment ${a.filename}`,});  }
                   }
                }
                 { svelteHTML.createElement("button", {       "type":`button`,"class":`attach-file-btn`,"disabled":attachmentBusy || attachments.length >= ATTACHMENT_MAX_PER_TASK,"on:click":() => attachFileInputEl.click(),});
                  attachmentBusy ? 'Attaching…' : attachments.length >= ATTACHMENT_MAX_PER_TASK ? `Max ${ATTACHMENT_MAX_PER_TASK} attachments reached` : '+ Attach a file';
                 }
                
                 { const $$_input6 = svelteHTML.createElement("input", {        "type":`file`,"multiple":true,"style":`display:none`,"on:change":onFilesPicked,});attachFileInputEl = $$_input6;}
                if(attachmentError){ { svelteHTML.createElement("p", { "class":`dup-name-hint`,});attachmentError; }}
               }
            }
           }

           { svelteHTML.createElement("div", { "class":`extra-block`,});
             { svelteHTML.createElement("button", {       "type":`button`,"class":`extra-block-toggle`,"on:click":() => showNotesBlock = !showNotesBlock,"aria-expanded":showNotesBlock,});
               { svelteHTML.createElement("span", { "class":`field-label`,});  }
               { svelteHTML.createElement("svg", {                  "class":`section-chevron`,"viewBox":`0 0 10 10`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});showNotesBlock;  { svelteHTML.createElement("polyline", { "points":`2,1 7,5 2,9`,});} }
             }
            if(showNotesBlock){
               { svelteHTML.createElement("div", {   "class":`extra-block-body notes-wrap`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
                 { svelteHTML.createElement("textarea", {       "class":`notes-textarea`,"bind:value":body,"rows":4,"placeholder":`Notes…`,});/*Ωignore_startΩ*/() => body = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
                if(body.length > NOTES_SOFT_LIMIT){
                   { svelteHTML.createElement("div", { "class":`notes-counter`,});body.length;  }
                }
                if(similarNotesHint){ { svelteHTML.createElement("p", { "class":`dup-name-hint`,});similarNotesHint; }}
               }
            }
           }

         }
      }
     }

    if(showHistory && TaskHistoryPanelComp){
       { const $$_tnenopmoc_etlevs2C = __sveltets_2_ensureComponent(TaskHistoryPanelComp); new $$_tnenopmoc_etlevs2C({ target: __sveltets_2_any(), props: {    "taskId":task._id,}});}
    }

     { svelteHTML.createElement("div", { "class":`actions`,});
       { svelteHTML.createElement("div", { "class":`menu-wrap`,});
         { const $$_button4 = svelteHTML.createElement("button", {          "type":`button`,"class":`menu-trigger`,"on:click":() => showActionsMenu = !showActionsMenu,"aria-label":`More actions`,"aria-expanded":showActionsMenu,});menuTriggerEl = $$_button4;
           { svelteHTML.createElement("svg", {       "viewBox":`0 0 14 14`,"width":`16`,"height":`16`,"fill":`currentColor`,});  { svelteHTML.createElement("circle", {     "cx":`3`,"cy":`7`,"r":`1.3`,});}  { svelteHTML.createElement("circle", {     "cx":`7`,"cy":`7`,"r":`1.3`,});}  { svelteHTML.createElement("circle", {     "cx":`11`,"cy":`7`,"r":`1.3`,});} }
         }
        if(showActionsMenu){
           { const $$_div4 = svelteHTML.createElement("div", {    "class":`actions-menu`,});menuPanelEl = $$_div4;__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 4, duration: popScale.duration, easing: popScale.easing })));
             { svelteHTML.createElement("button", {     "type":`button`,"class":`menu-item`,"on:click":() => { showActionsMenu = false; loadHistory(); },});
               { svelteHTML.createElement("svg", {           "viewBox":`0 0 14 14`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.3`,});  { svelteHTML.createElement("circle", {     "cx":`7`,"cy":`7`,"r":`5.5`,});}  { svelteHTML.createElement("path", { "d":`M7 4v3l2 1.5`,});} }
              showHistory ? 'Hide history' : 'Show history';
             }
             { svelteHTML.createElement("button", {     "type":`button`,"class":`menu-item`,"on:click":() => { showActionsMenu = false; archive(); },});
               { svelteHTML.createElement("svg", {           "viewBox":`0 0 14 14`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.3`,});  { svelteHTML.createElement("rect", {         "x":`1.5`,"y":`2`,"width":`11`,"height":`3`,"rx":`1`,});}  { svelteHTML.createElement("path", { "d":`M2.5 5v6.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5M5.5 8h3`,});} }
              
             }
             { svelteHTML.createElement("button", {     "type":`button`,"class":`menu-item`,"on:click":() => { showActionsMenu = false; duplicate(); },});
               { svelteHTML.createElement("svg", {           "viewBox":`0 0 14 14`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.3`,});  { svelteHTML.createElement("rect", {         "x":`4.5`,"y":`4.5`,"width":`8`,"height":`8`,"rx":`1`,});}  { svelteHTML.createElement("path", { "d":`M9.5 4.5V2.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2`,});} }
              
             }
             { svelteHTML.createElement("div", { "class":`menu-divider`,}); }
             { svelteHTML.createElement("button", {     "type":`button`,"class":`menu-item menu-item-danger`,"on:click":() => { showActionsMenu = false; softDelete(); },});
               { svelteHTML.createElement("svg", {           "viewBox":`0 0 14 14`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.3`,});  { svelteHTML.createElement("path", { "d":`M2.5 3.5h9M5.5 3.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M3.5 3.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8`,});} }
              
             }
           }
        }
       }
       { svelteHTML.createElement("div", { "class":`right`,});
         { svelteHTML.createElement("button", {  "on:click":() => requestClose(),});  }
         { svelteHTML.createElement("button", {     "class":`save-btn`,"on:click":save,"disabled":saving,});
          saving ? 'Saving…' : 'Save';
         }
       }
     }
   }}
 }


};
return { props: {task: task , project: project} as {task: TaskDoc, project: ProjectDoc}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void; openRelated: string }>()} }}
const CardDetail__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type CardDetail__SvelteComponent_ = InstanceType<typeof CardDetail__SvelteComponent_>;
/*Ωignore_endΩ*/export default CardDetail__SvelteComponent_;