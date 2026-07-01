<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { TaskDoc, ProjectDoc } from './types';
  import { updateTask, deleteTask, getAllTags, archiveTask, getLogsForTask, duplicateTask } from './db';
  import { reloadTasks, showError } from './store';

  export let task: TaskDoc;
  export let project: ProjectDoc;

  const dispatch = createEventDispatcher<{ close: void }>();

  let title = task.title;
  let body = task.body;
  let priority = task.priority;
  let due_date = task.due_date ?? '';
  let column_id = task.column_id;
  let tags: string[] = [...(task.tags ?? [])];
  let pinned = task.pinned ?? false;
  let tagInput = '';
  let tagSuggestions: string[] = [];
  let allTags: string[] = [];
  let saving = false;
  let showHistory = false;
  let history: Awaited<ReturnType<typeof getLogsForTask>> = [];

  onMount(async () => { allTags = await getAllTags(); });

  async function loadHistory() {
    if (!showHistory) { showHistory = true; history = await getLogsForTask(task._id!); }
    else { showHistory = false; }
  }

  const ACTION_COLOR: Record<string, string> = { create: '#4ade80', update: '#5d9bff', move: '#d99a3b', delete: '#f87171' };
  const FIELD_LABEL: Record<string, string> = { title: 'Title', body: 'Notes', priority: 'Priority', due_date: 'Due date', tags: 'Tags', column_id: 'Status', pinned: 'Pinned', archived: 'Archived' };
  const PRIO: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

  function fmtLogVal(field: string, val: any): string {
    if (val == null || val === '') return '—';
    if (field === 'priority') return PRIO[val] ?? String(val);
    if (field === 'tags') return Array.isArray(val) ? (val.join(', ') || '—') : String(val);
    const s = String(val);
    return s.length > 36 ? s.slice(0, 36) + '…' : s;
  }

  function describeLog(log: any): string {
    if (log.action === 'create') return 'Task created';
    if (log.action === 'delete') return 'Task deleted';
    if (log.action === 'move') return `Moved: "${log.from}" → "${log.to}"`;
    if (log.diffs) return Object.entries(log.diffs).map(([f, d]: [string, any]) => {
      const label = FIELD_LABEL[f] ?? f;
      return `${label}: ${fmtLogVal(f, d.from)} → ${fmtLogVal(f, d.to)}`;
    }).join(' · ');
    return 'Updated';
  }

  $: tagSuggestions = tagInput.trim()
    ? allTags.filter(t => t.startsWith(tagInput.trim().toLowerCase()) && !tags.includes(t))
    : [];

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
        column_id, tags, pinned,
      });
      await reloadTasks();
      dispatch('close');
    } catch (e) {
      showError('Failed to save task. Please try again.');
    } finally {
      saving = false;
    }
  }

  async function softDelete() {
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask(task._id!);
      await reloadTasks();
      dispatch('close');
    } catch (e) {
      showError('Failed to delete task.');
    }
  }

  async function duplicate() {
    try {
      await duplicateTask(task._id!);
      await reloadTasks();
      dispatch('close');
    } catch (e) {
      showError('Failed to duplicate task.');
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="overlay" on:click|self={() => dispatch('close')}>
  <div class="panel">
    <div class="panel-header">
      <textarea class="title-input" bind:value={title} placeholder="Task title" rows="1" on:input={(e) => { const t = e.currentTarget; t.style.height='auto'; t.style.height=t.scrollHeight+'px'; }}></textarea>
      <button class="pin-btn" class:pinned on:click={() => pinned = !pinned} title={pinned ? 'Unpin' : 'Pin task'}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="8,1.5 9.8,6 14.5,6.3 11,9.4 12.1,14 8,11.3 3.9,14 5,9.4 1.5,6.3 6.2,6"/>
        </svg>
      </button>
      <button class="close-btn" on:click={() => dispatch('close')}>✕</button>
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
      </label>
    </div>

    <div class="tags-field">
      <span class="field-label">Tags</span>
      <div class="tags-input-row">
        {#each tags as tag}
          <span class="tag-chip">
            {tag}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <span class="tag-remove" on:click={() => removeTag(tag)}>×</span>
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
      {#if tagSuggestions.length}
        <div class="tag-suggestions">
          {#each tagSuggestions as s}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <span class="tag-suggestion" on:mousedown|preventDefault={() => { tags = [...tags, s]; tagInput = ''; }}>{s}</span>
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

    {#if showHistory}
      <div class="history">
        {#if history.length === 0}
          <div class="history-empty">No history recorded.</div>
        {:else}
          {#each history as log (log._id)}
            <div class="history-row">
              <span class="h-pill" style="background:{ACTION_COLOR[log.action]}22; color:{ACTION_COLOR[log.action]}">{log.action}</span>
              <span class="h-desc">{describeLog(log)}</span>
              <span class="h-time">{fmtTs(log.ts)}</span>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="actions">
      <div class="left-actions">
        <button class="delete-btn" on:click={softDelete}>Delete</button>
        <button class="archive-btn" on:click={async () => { try { await archiveTask(task._id!); await reloadTasks(); dispatch('close'); } catch { showError('Failed to archive task.'); } }}>Archive</button>
        <button class="dupe-btn" on:click={duplicate} title="Duplicate task">Duplicate</button>
      </div>
      <div class="right">
        <button on:click={() => dispatch('close')}>Cancel</button>
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
  select, input[type=date] {
    padding: .5rem .6rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--text);
    font-size: .9rem; font-family: 'Hanken Grotesk', sans-serif;
  }
  select:focus, input[type=date]:focus { outline: none; border-color: var(--accent); }
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

  .history {
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    overflow: hidden; font-size: .78rem;
  }
  .history-empty { padding: 10px 12px; color: var(--faint); }
  .history-row {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 7px 10px; border-bottom: 1px solid var(--border);
  }
  .history-row:last-child { border-bottom: none; }
  .h-pill {
    font-family: var(--mono); font-size: .6rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em;
    padding: 1px 6px; border-radius: 4px; flex-shrink: 0; margin-top: 1px;
  }
  .h-desc { flex: 1; color: var(--text); line-height: 1.4; }
  .h-time { font-family: var(--mono); font-size: .6rem; color: var(--faint); flex-shrink: 0; white-space: nowrap; }
</style>
