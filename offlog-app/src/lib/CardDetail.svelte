<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { TaskDoc, ProjectDoc, CustomFieldDef } from './types';
  import { updateTask, deleteTask, getAllTags, archiveTask, duplicateTask, getCustomFieldDefs } from './db';
  import { reloadTasks, showError, modalOpen } from './store';
  import { requestPermission, permissionState } from './notifications';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import PinStar from './PinStar.svelte';
  import CalendarPicker from './CalendarPicker.svelte';
  import CustomSelect from './CustomSelect.svelte';
  import { fmtFullTimestamp } from './utils';
  import { getDefaultReminderTime } from '../config';

  export let task: TaskDoc;
  export let project: ProjectDoc;

  const dispatch = createEventDispatcher<{ close: void }>();
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

  let title = task.title;
  let body = task.body;
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

  // B12: derives reminder_at from due_date + the configured default time
  // whenever the toggle is on and due_date changes — recomputed live, not
  // just once on enable, so editing the due date afterward keeps the
  // reminder in sync without needing to re-toggle.
  function dueDateToReminderInput(date: string): string {
    const [h, m] = getDefaultReminderTime().split(':');
    return `${date}T${h}:${m}`;
  }
  $: if (remindOnDue && due_date) reminder_at = dueDateToReminderInput(due_date);
  let column_id = task.column_id;
  let tags: string[] = [...(task.tags ?? [])];
  let pinned = task.pinned ?? false;
  // B18 — flat, not nested/reorderable. Same batched-into-save() pattern
  // as tags/custom fields, not an immediate-write-per-toggle — consistent
  // with every other field in this form.
  let checklist: { text: string; done: boolean }[] = (task.checklist ?? []).map(i => ({ ...i }));
  let checklistInput = '';
  let tagInput = '';
  let tagSuggestions: string[] = [];
  let otherTagSuggestions: string[] = [];
  let allTags: string[] = [];
  let projectTags: string[] = [];
  let saving = false;
  let showHistory = false;

  // B16 (revised): field definitions are global (Settings → Organize →
  // Manage Custom Fields), not managed from here — CardDetail only reads
  // and fills in values. custom_values stays keyed by field id, not name
  // (see types.ts), so a field rename in Settings doesn't orphan values.
  let customFields: CustomFieldDef[] = [];
  let customValues: Record<string, string | number | null> = { ...(task.custom_values ?? {}) };

  // Collapsible-by-default sections (owner feedback, 2026-07-12 — the page
  // got overloaded once Checklist landed on top of everything else).
  // "Details" (status/priority/due/reminder/tags) stays always open —
  // it's the core identity of a task. Checklist/Custom fields/Notes start
  // collapsed UNLESS the task already has content there, so existing data
  // is never hidden by default, only new/empty sections start closed.
  let showChecklist = checklist.length > 0;
  let showNotes = !!body.trim();
  let showCustomFieldsSection = Object.values(customValues).some(v => v !== null && v !== '' && v !== undefined);
  // Cap how many custom fields show by default — a project with a dozen
  // fields defined shouldn't turn every card into a long form. Anything
  // past the cap is one click away, not hidden entirely.
  const VISIBLE_FIELD_CAP = 3;
  let showAllFields = false;
  $: visibleFields = showAllFields ? customFields : customFields.slice(0, VISIBLE_FIELD_CAP);

  // TaskHistoryPanel is only ever needed if the user clicks "Show history" —
  // loading it as a dynamic import keeps its query/formatting logic out of
  // the main bundle for the common case where nobody opens it.
  let TaskHistoryPanelComp: typeof import('./TaskHistoryPanel.svelte').default | null = null;

  onMount(async () => {
    modalOpen.set(true);
    [allTags, projectTags, customFields] = await Promise.all([getAllTags(), getAllTags(project._id), getCustomFieldDefs()]);
  });
  onDestroy(() => modalOpen.set(false));

  async function loadHistory() {
    if (showHistory) { showHistory = false; return; }
    if (!TaskHistoryPanelComp) TaskHistoryPanelComp = (await import('./TaskHistoryPanel.svelte')).default;
    showHistory = true;
  }

  // B26: tags already used in *this* project are the most likely match,
  // so they're suggested first — everywhere-else tags are still offered,
  // just as a clearly separate, secondary group rather than one flat
  // undifferentiated list.
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

  async function save() {
    saving = true;
    try {
      await updateTask(task._id!, {
        title, body,
        priority: priority as 1 | 2 | 3,
        due_date: due_date || null,
        reminder_at: reminder_at ? new Date(reminder_at).toISOString() : null,
        column_id, tags, pinned, remindOnDue,
        custom_values: customValues, checklist,
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

  async function duplicate() {
    try {
      await duplicateTask(task._id!);
      await reloadTasks();
      requestClose();
    } catch (e) {
      showError('Failed to duplicate task.');
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

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

    <label>
      Due date
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
    </label>

    <div class="reminder-field">
      <label>
        Reminder
        <CalendarPicker value={reminder_at} withTime on:change={(e) => reminder_at = e.detail} disabled={remindOnDue} />
      </label>
      <label class="remind-on-due-row">
        <input type="checkbox" bind:checked={remindOnDue} disabled={!due_date} />
        Remind me on the due date{#if due_date}&nbsp;at {getDefaultReminderTime()}{/if}
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
      <button type="button" class="section-toggle" on:click={() => showChecklist = !showChecklist}>
        <svg class="section-chevron" class:open={showChecklist} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
        <span class="field-label">
          Checklist{#if checklist.length} <span class="checklist-progress">{checklist.filter(i => i.done).length}/{checklist.length}</span>{/if}
        </span>
      </button>
      {#if showChecklist}
        <div class="checklist-field">
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
        </div>
      {/if}
    </div>

    {#if customFields.length > 0}
      <div class="collapsible-section">
        <button type="button" class="section-toggle" on:click={() => showCustomFieldsSection = !showCustomFieldsSection}>
          <svg class="section-chevron" class:open={showCustomFieldsSection} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
          <span class="field-label">Custom fields</span>
        </button>
        {#if showCustomFieldsSection}
          <div class="custom-fields">
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

    <div class="section-divider"></div>

    <div class="collapsible-section">
      <button type="button" class="section-toggle" on:click={() => showNotes = !showNotes}>
        <svg class="section-chevron" class:open={showNotes} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
        <span class="field-label">Notes (markdown)</span>
      </button>
      {#if showNotes}
        <textarea class="notes-textarea" bind:value={body} rows="4" placeholder="Notes…"></textarea>
      {/if}
    </div>

    <div class="timestamps">
      <span>Created {fmtFullTimestamp(task.created_at)}</span>
      {#if task.updated_at !== task.created_at}
        <span>Updated {fmtFullTimestamp(task.updated_at)}</span>
      {/if}
      <button class="history-toggle" on:click={loadHistory}>
        {showHistory ? 'Hide history' : 'Show history'}
      </button>
    </div>

    {#if showHistory && TaskHistoryPanelComp}
      <svelte:component this={TaskHistoryPanelComp} taskId={task._id} />
    {/if}

    <div class="actions">
      <div class="left-actions">
        <button class="delete-btn" on:click={softDelete}>Delete</button>
        <button class="archive-btn" on:click={async () => { try { await archiveTask(task._id!); await reloadTasks(); requestClose(); } catch { showError('Failed to archive task.'); } }}>Archive</button>
        <button class="dupe-btn" on:click={duplicate} title="Duplicate task">Duplicate</button>
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
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.45);
    display: flex; align-items: stretch; justify-content: flex-end;
    z-index: 100;
    animation: scrim .18s ease;
  }
  @keyframes scrim { from { opacity: 0; } to { opacity: 1; } }
  .panel {
    background: var(--surface);
    width: min(440px, 100vw);
    height: 100dvh;
    display: flex; flex-direction: column;
    padding: 1.1rem 1.25rem;
    padding-top: calc(1.1rem + env(safe-area-inset-top, 0px));
    gap: .55rem;
    border-left: 1px solid var(--border);
    box-shadow: -20px 0 50px rgba(0,0,0,.22);
    overflow-y: auto;
    animation: slideOver .38s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes slideOver { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
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
  .section-divider { height: 1px; background: var(--border); margin: .05rem 0; }
  label {
    display: flex; flex-direction: column; gap: .22rem;
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
  .due-shortcuts { display: flex; gap: 4px; flex-wrap: wrap; }
  .due-shortcut {
    background: var(--col-bg); color: var(--muted); border: 1px solid var(--border);
    border-radius: 5px; font-size: .68rem; font-weight: 600; letter-spacing: normal;
    text-transform: none; font-family: 'Hanken Grotesk', sans-serif;
    padding: 2px 8px; cursor: pointer; transition: background .1s, color .1s, border-color .1s;
  }
  .due-shortcut:hover { background: var(--hover); color: var(--text); }
  .due-shortcut.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  .reminder-hint {
    font-size: .72rem; color: var(--faint); line-height: 1.35;
    background: var(--col-bg); border-radius: var(--radius-sm);
    padding: .4rem .55rem;
  }

  .remind-on-due-row {
    display: flex !important; flex-direction: row !important; align-items: center;
    gap: .4rem; width: fit-content; max-width: 100%;
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
    transition: color .1s;
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
    border: 1px solid var(--border); transition: background .1s;
  }
  .tag-suggestion:hover { background: var(--hover); }
  .tag-suggestion-other { color: var(--muted); }
  .tag-suggestions-divider {
    width: 100%; font-size: .68rem; color: var(--faint); font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em; padding: 2px 2px 0;
  }

  .collapsible-section { display: flex; flex-direction: column; gap: .5rem; }
  .section-toggle {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
    cursor: pointer; padding: .5rem .65rem; width: 100%; text-align: left;
    transition: background .12s, border-color .12s;
  }
  .section-toggle:hover { background: var(--hover); border-color: var(--border-strong); }
  .section-toggle .field-label { flex: 1; }
  .section-chevron { color: var(--faint); flex-shrink: 0; transition: transform .12s ease, color .12s; }
  .section-chevron.open { transform: rotate(90deg); }
  .section-toggle:hover .section-chevron { color: var(--text); }
  .notes-textarea { width: 100%; box-sizing: border-box; }

  .checklist-field { display: flex; flex-direction: column; gap: .3rem; }
  .checklist-progress { color: var(--accent); font-weight: 600; margin-left: 4px; }
  .checklist-row { display: flex; align-items: center; gap: 7px; }
  .checklist-check {
    flex-shrink: 0; width: 17px; height: 17px; border-radius: 5px;
    border: 1.5px solid var(--border-strong); background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: .68rem; color: #fff; cursor: pointer; padding: 0;
  }
  .checklist-check.done { background: var(--accent); border-color: var(--accent); }
  .checklist-text { flex: 1; font-size: .84rem; color: var(--text); }
  .checklist-text.done { color: var(--faint); text-decoration: line-through; }
  .checklist-remove {
    flex-shrink: 0; cursor: pointer; font-size: .9rem; line-height: 1;
    color: var(--muted); background: none; border: none; padding: 0 2px;
    transition: color .1s;
  }
  .checklist-remove:hover { color: var(--danger); }
  .checklist-input {
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); outline: none;
    font-size: .84rem; color: var(--text); padding: .35rem .5rem;
  }
  .checklist-input:focus { border-color: var(--accent); }
  .checklist-input::placeholder { color: var(--faint); }
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
  .left-actions { display: flex; gap: .4rem; align-items: center; }
  .right { display: flex; gap: .5rem; }
  button {
    padding: .38rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .82rem; font-weight: 500;
  }
  .save-btn { background: var(--text); color: var(--bg); border-color: var(--text); }
  .save-btn:disabled { opacity: .5; cursor: default; }
  .delete-btn { color: var(--danger); border-color: transparent; background: transparent; font-weight: 600; }
  .delete-btn:hover { background: var(--overdue-bg); }
  .archive-btn { color: var(--muted); border-color: transparent; background: transparent; }
  .archive-btn:hover { color: var(--accent); }
  .dupe-btn { color: var(--muted); border-color: transparent; background: transparent; }
  .dupe-btn:hover { color: var(--text); }

  .timestamps {
    display: flex; flex-direction: column; gap: 3px;
    font-family: var(--mono); font-size: .65rem; color: var(--faint);
    padding-top: .3rem;
  }
  .history-toggle {
    background: none; border: none; cursor: pointer; padding: 0;
    color: var(--accent); font-family: var(--mono); font-size: .65rem;
    text-align: left; margin-top: 2px; transition: opacity .12s;
  }
  .history-toggle:hover { opacity: .75; }
</style>
