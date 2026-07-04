<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { TaskDoc, ProjectDoc } from './types';
  import { updateTask, deleteTask, getAllTags, archiveTask, duplicateTask } from './db';
  import { reloadTasks, showError, modalOpen } from './store';
  import { requestPermission, permissionState } from './notifications';
  import { confirmAction } from './confirm';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import PinStar from './PinStar.svelte';

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
  let due_date = task.due_date ?? '';
  let reminder_at = task.reminder_at ? isoToLocalInput(task.reminder_at) : '';
  let column_id = task.column_id;
  let tags: string[] = [...(task.tags ?? [])];
  let pinned = task.pinned ?? false;
  let tagInput = '';
  let tagSuggestions: string[] = [];
  let otherTagSuggestions: string[] = [];
  let allTags: string[] = [];
  let projectTags: string[] = [];
  let saving = false;
  let showHistory = false;
  // TaskHistoryPanel is only ever needed if the user clicks "Show history" —
  // loading it as a dynamic import keeps its query/formatting logic out of
  // the main bundle for the common case where nobody opens it.
  let TaskHistoryPanelComp: typeof import('./TaskHistoryPanel.svelte').default | null = null;

  onMount(async () => {
    modalOpen.set(true);
    [allTags, projectTags] = await Promise.all([getAllTags(), getAllTags(project._id)]);
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

  function fmtTs(ts: string): string {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) tags = [...tags, t];
    tagInput = '';
  }

  function removeTag(tag: string) { tags = tags.filter(t => t !== tag); }

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
        column_id, tags, pinned,
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

    <div class="fields">
      <label>
        Status
        <select bind:value={column_id}>
          {#each project.columns as col}
            <option value={col.id}>{col.name}</option>
          {/each}
        </select>
      </label>

      <label>
        Priority
        <select bind:value={priority}>
          <option value={1}>Low</option>
          <option value={2}>Medium</option>
          <option value={3}>High</option>
        </select>
      </label>

      <label>
        Due date
        <input type="date" bind:value={due_date} />
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

      <label>
        Reminder
        <input type="datetime-local" bind:value={reminder_at} />
      </label>
    </div>

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

    <label class="notes-label">
      Notes (markdown)
      <textarea bind:value={body} rows="6" placeholder="Notes…"></textarea>
    </label>

    <div class="timestamps">
      <span>Created {fmtTs(task.created_at)}</span>
      {#if task.updated_at !== task.created_at}
        <span>Updated {fmtTs(task.updated_at)}</span>
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
    padding: 1.5rem 1.6rem;
    padding-top: calc(1.5rem + env(safe-area-inset-top, 0px));
    gap: 1.1rem;
    border-left: 1px solid var(--border);
    box-shadow: -20px 0 50px rgba(0,0,0,.22);
    overflow-y: auto;
    animation: slideOver .38s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes slideOver { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .panel-header { display: flex; gap: .5rem; align-items: flex-start; }
  .title-input {
    flex: 1; font-size: 1.2rem; font-weight: 700; letter-spacing: -.01em;
    border: none; border-bottom: 1.5px solid transparent;
    background: transparent; padding: .25rem 0;
    color: var(--text); line-height: 1.35;
    resize: none; overflow: hidden; min-height: 2rem;
    font-family: inherit;
  }
  .title-input:focus { outline: none; border-bottom-color: var(--accent); }
  .pin-btn {
    background: none; border: none; cursor: pointer;
    width: 30px; height: 30px; border-radius: var(--radius-sm);
    color: var(--faint); padding: 0; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background .12s, color .12s;
  }
  .pin-btn:hover { background: var(--hover); color: var(--accent); }
  .pin-btn.pinned { color: var(--accent); }

  .close-btn {
    background: var(--hover); border: none; cursor: pointer;
    width: 30px; height: 30px; border-radius: var(--radius-sm);
    font-size: .95rem; color: var(--muted); padding: 0;
    flex-shrink: 0; transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--border-strong); color: var(--text); }
  .fields { display: flex; flex-direction: column; gap: .85rem; }
  label {
    display: flex; flex-direction: column; gap: .3rem;
    font-family: var(--mono); font-size: .68rem; letter-spacing: .06em;
    text-transform: uppercase; color: var(--faint);
  }
  select, input[type=date], input[type=datetime-local] {
    padding: .5rem .6rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--text);
    font-size: .9rem; font-family: 'Hanken Grotesk', sans-serif;
  }
  select:focus, input[type=date]:focus, input[type=datetime-local]:focus { outline: none; border-color: var(--accent); }

  .due-shortcuts { display: flex; gap: 5px; flex-wrap: wrap; }
  .due-shortcut {
    background: var(--col-bg); color: var(--muted); border: 1px solid var(--border);
    border-radius: 5px; font-size: .72rem; font-weight: 600; letter-spacing: normal;
    text-transform: none; font-family: 'Hanken Grotesk', sans-serif;
    padding: 3px 9px; cursor: pointer; transition: background .1s, color .1s, border-color .1s;
  }
  .due-shortcut:hover { background: var(--hover); color: var(--text); }
  .due-shortcut.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  .reminder-hint {
    font-size: .78rem; color: var(--faint); line-height: 1.4;
    background: var(--col-bg); border-radius: var(--radius-sm);
    padding: .5rem .65rem; margin-top: -.4rem;
  }
  .reminder-enable-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    color: var(--accent); font-weight: 600; font-size: inherit;
    text-decoration: underline;
  }
  .tags-field { display: flex; flex-direction: column; gap: .3rem; }
  .field-label {
    font-family: var(--mono); font-size: .68rem; letter-spacing: .06em;
    text-transform: uppercase; color: var(--faint);
  }
  .tags-input-row {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    padding: .45rem .6rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--surface); min-height: 40px;
    cursor: text;
  }
  .tags-input-row:focus-within { border-color: var(--accent); }
  .tag-chip {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--col-bg); color: var(--accent); border-radius: 5px;
    font-size: .8rem; font-weight: 500; padding: 2px 8px;
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

  .notes-label {
    display: flex; flex-direction: column; gap: .3rem;
    font-family: var(--mono); font-size: .68rem; letter-spacing: .06em;
    text-transform: uppercase; color: var(--faint); flex: 1;
  }
  textarea {
    flex: 1; resize: vertical; min-height: 130px;
    padding: .7rem .8rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--bg); color: var(--text);
    font-family: 'Hanken Grotesk', sans-serif; font-size: .92rem; line-height: 1.6;
  }
  textarea:focus { outline: none; border-color: var(--accent); background: var(--surface); }
  .actions {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: .9rem; border-top: 1px solid var(--border);
  }
  .left-actions { display: flex; gap: .4rem; align-items: center; }
  .right { display: flex; gap: .5rem; }
  button {
    padding: .45rem .95rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .85rem; font-weight: 500;
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
