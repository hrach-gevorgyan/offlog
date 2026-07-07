<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getOpenTasksForFocusPicker, updateTask, getTaskById, subscribe } from './db';
  import { projects, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
  import CardDetail from './CardDetail.svelte';
  import type { TaskDoc, ProjectDoc } from './types';

  const dispatch = createEventDispatcher<{ menu: void }>();

  // B35 (revised) — a daily commitment lock, not an auto-computed priority
  // list. Up to 3 tasks, picked once, locked until each is done or the day
  // rolls over. This is deliberately NOT a PouchDB doc: it's ephemeral
  // per-day UI state, not data worth syncing across devices — a stale
  // lock on one device shouldn't leak into another.
  const STORAGE_KEY = 'offlog_focus_lock';
  const MAX_COMMIT = 3;

  interface FocusLock { date: string; taskIds: string[] }

  function today(): string { return new Date().toISOString().slice(0, 10); }

  function loadLock(): FocusLock | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const lock: FocusLock = JSON.parse(raw);
      return lock.date === today() ? lock : null; // stale day → treat as unset
    } catch { return null; }
  }

  function saveLock(lock: FocusLock | null) {
    if (lock) localStorage.setItem(STORAGE_KEY, JSON.stringify(lock));
    else localStorage.removeItem(STORAGE_KEY);
  }

  let lock: FocusLock | null = loadLock();
  let lockedTasks: TaskDoc[] = [];
  let pickerTasks: (TaskDoc & { project_name?: string })[] = [];
  type SuggestReason = 'pinned' | 'overdue' | 'due_soon' | 'priority';
  const SUGGEST_LABEL: Record<SuggestReason, string> = {
    pinned: 'Pinned', overdue: 'Overdue', due_soon: 'Due soon', priority: 'High priority',
  };
  let suggestedReasons = new Map<string, SuggestReason>();
  let selected: string[] = [];

  // Rank the picker so the top of the list is a genuine "what to commit to"
  // suggestion, not just a recency dump: pinned and overdue outrank
  // due-soon, which outranks priority alone. Equal-score tasks are
  // shuffled against each other (no fixed alphabetical/insertion bias).
  // The reason a task made the cut is surfaced as a colored label, not a
  // bare star — "why" matters more than "that" when deciding what to commit to.
  function scoreAndReason(t: TaskDoc): { s: number; reason: SuggestReason } {
    if (t.pinned) return { s: 1000, reason: 'pinned' };
    if (t.due_date) {
      const days = Math.floor((new Date(t.due_date).getTime() - new Date(today()).getTime()) / 86400000);
      if (days < 0) return { s: 500 + Math.min(-days, 30), reason: 'overdue' };
      if (days === 0) return { s: 400, reason: 'due_soon' };
      if (days <= 3) return { s: 200 - days * 10, reason: 'due_soon' };
    }
    return { s: (t.priority ?? 1) * 20, reason: 'priority' };
  }

  const BUCKET_ORDER: SuggestReason[] = ['pinned', 'overdue', 'due_soon', 'priority'];

  // Round-robin across reason buckets (best-first within each bucket) so
  // the daily 3 suggestions are a genuine spread — "what's overdue AND
  // what's pinned AND what's next" — instead of collapsing to "the 3 most
  // overdue tasks" whenever overdue items dominate the raw score. That
  // repetitive sameness is exactly what made the plain top-N-by-score
  // version feel useless morning after morning.
  function rankPicker(tasks: (TaskDoc & { project_name?: string })[]) {
    const withScore = tasks.map(t => ({ t, ...scoreAndReason(t), r: Math.random() }));
    const buckets: Record<SuggestReason, typeof withScore> = { pinned: [], overdue: [], due_soon: [], priority: [] };
    withScore.forEach(x => buckets[x.reason].push(x));
    BUCKET_ORDER.forEach(reason => buckets[reason].sort((a, b) => b.s - a.s || b.r - a.r));

    suggestedReasons = new Map();
    const cursors: Record<SuggestReason, number> = { pinned: 0, overdue: 0, due_soon: 0, priority: 0 };
    while (suggestedReasons.size < MAX_COMMIT) {
      let pickedAny = false;
      for (const reason of BUCKET_ORDER) {
        if (suggestedReasons.size >= MAX_COMMIT) break;
        const bucket = buckets[reason];
        if (cursors[reason] < bucket.length) {
          suggestedReasons.set(bucket[cursors[reason]].t._id!, reason);
          cursors[reason]++;
          pickedAny = true;
        }
      }
      if (!pickedAny) break; // every bucket exhausted, fewer than MAX_COMMIT open tasks exist
    }
    suggestedReasons = new Map(suggestedReasons); // trigger Svelte reactivity

    return BUCKET_ORDER.flatMap(reason => buckets[reason].map(x => x.t));
  }
  let detailTask: TaskDoc | null = null;
  let detailProject: ProjectDoc | null = null;

  async function loadLockedTasks() {
    if (!lock) { lockedTasks = []; return; }
    const fetched = await Promise.all(lock.taskIds.map(id => getTaskById(id)));
    lockedTasks = fetched.filter((t): t is TaskDoc => !!t && !t.deleted);
  }

  async function loadPicker() { pickerTasks = rankPicker(await getOpenTasksForFocusPicker()); }

  async function refresh() {
    lock = loadLock();
    if (lock) await loadLockedTasks();
    else await loadPicker();
  }

  onMount(() => {
    refresh();
    const unsub = subscribe(() => refresh());
    return unsub;
  });

  function toggleSelect(id: string) {
    if (selected.includes(id)) selected = selected.filter(x => x !== id);
    else if (selected.length < MAX_COMMIT) selected = [...selected, id];
  }

  async function commit() {
    if (!selected.length) return;
    saveLock({ date: today(), taskIds: selected });
    selected = [];
    await refresh();
  }

  async function resetCommitment() {
    saveLock(null);
    await refresh();
  }

  function openDetail(t: TaskDoc) {
    detailTask = t;
    detailProject = $projects.find(p => p._id === t.project_id) ?? null;
  }

  async function markDone(t: TaskDoc) {
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) return;
    const lastCol = proj.columns.at(-1)?.id;
    if (!lastCol || t.column_id === lastCol) return;
    try {
      await updateTask(t._id!, { column_id: lastCol });
      await refresh();
    } catch {
      showError('Failed to update task. Please try again.');
    }
  }

  $: allDone = lock !== null && lockedTasks.length > 0 && lockedTasks.every(t => {
    const proj = $projects.find(p => p._id === t.project_id);
    return proj && t.column_id === proj.columns.at(-1)?.id;
  });
</script>

<div class="focus">
  <div class="fc-header">
    <button class="hamburger" on:click={() => dispatch('menu')} aria-label="Menu">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
      </svg>
    </button>
    <div class="title-block">
      <h1 class="fc-title">Focus</h1>
      <span class="fc-count">today's commitment — up to {MAX_COMMIT} tasks</span>
    </div>
    {#if lock}
      <button class="reset-btn" on:click={resetCommitment}>Reset</button>
    {/if}
  </div>

  <div class="fc-body">
    {#if lock}
      {#if allDone}
        <div class="empty">All {lockedTasks.length} committed today — nicely done. Come back tomorrow, or reset to pick more.</div>
      {/if}
      {#each lockedTasks as t (t._id)}
        <div
          class="task-row"
          role="button"
          tabindex="0"
          on:click={() => openDetail(t)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
        >
          <button class="circle" on:click|stopPropagation={() => markDone(t)} title="Mark done" aria-label="Mark done"></button>
          <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}" title={PRIO_LABEL[t.priority]}></span>
          <span class="task-title">{t.title}</span>
          <span class="proj-badge">{$projects.find(p => p._id === t.project_id)?.name ?? '—'}</span>
        </div>
      {/each}
    {:else}
      <p class="picker-hint">Pick up to {MAX_COMMIT} tasks to commit to for today — the colored label marks the top suggestions and why. They'll stay locked here until each is done, or you reset.</p>
      {#if pickerTasks.length === 0}
        <div class="empty">No open tasks to pick from.</div>
      {:else}
        {#each pickerTasks as t (t._id)}
          <div
            class="task-row picker"
            class:selected={selected.includes(t._id!)}
            class:suggested={suggestedReasons.has(t._id!)}
            role="button"
            tabindex="0"
            on:click={() => toggleSelect(t._id!)}
            on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(t._id!); } }}
          >
            <span class="check" class:checked={selected.includes(t._id!)}></span>
            <span class="prio-dot" style="background:{PRIO_COLOR[t.priority]}" title={PRIO_LABEL[t.priority]}></span>
            <span class="task-title">{t.title}</span>
            <span class="proj-badge">{t.project_name ?? '—'}</span>
            {#if suggestedReasons.has(t._id!)}
              <span class="suggest-chip {suggestedReasons.get(t._id!)}">{SUGGEST_LABEL[suggestedReasons.get(t._id!)!]}</span>
            {/if}
          </div>
        {/each}
      {/if}
    {/if}
  </div>

  {#if !lock}
    <div class="fc-footer">
      <button class="commit-btn" disabled={!selected.length} on:click={commit}>
        Commit {selected.length ? `${selected.length} task${selected.length > 1 ? 's' : ''}` : ''}
      </button>
    </div>
  {/if}
</div>

{#if detailTask && detailProject}
  <CardDetail
    task={detailTask}
    project={detailProject}
    on:close={async () => { detailTask = null; detailProject = null; await refresh(); }}
  />
{/if}

<style>
  .focus { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .fc-header {
    display: flex; align-items: center; gap: 10px;
    padding: 20px 28px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .title-block { min-width: 0; flex: 1; }
  .fc-title { margin: 0 0 3px; font-size: 20px; font-weight: 700; letter-spacing: -.015em; }
  .fc-count { font-family: var(--mono); font-size: 11px; color: var(--faint); }

  .hamburger {
    display: none;
    background: none; border: none; cursor: pointer;
    color: var(--text); padding: 4px; border-radius: 6px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .hamburger:hover { background: var(--hover); }

  .reset-btn {
    background: none; border: 1px solid var(--border); color: var(--faint);
    font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
    flex-shrink: 0; transition: background .12s, color .12s;
  }
  .reset-btn:hover { background: var(--hover); color: var(--text); }

  .fc-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px 40px;
    width: 100%; max-width: 900px; box-sizing: border-box;
  }

  .picker-hint { color: var(--faint); font-size: 13px; margin: 0 0 16px; }
  .empty { color: var(--faint); font-size: 14px; padding: 12px 0; }

  .task-row {
    display: grid;
    grid-template-columns: 20px 10px 1fr auto;
    align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--surface);
    margin-bottom: 5px; cursor: pointer;
    transition: background .1s, box-shadow .1s;
  }
  .task-row:hover { background: var(--hover); box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  .task-row.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
  .task-row.picker { grid-template-columns: 20px 10px 1fr auto auto; }
  .task-row.picker.suggested {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 5%, var(--surface));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .task-row.picker.suggested.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }

  .suggest-chip {
    font-family: var(--mono); font-size: 10px; font-weight: 600;
    padding: 3px 8px; border-radius: 6px; white-space: nowrap;
  }
  .suggest-chip.pinned    { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .suggest-chip.overdue   { background: var(--overdue-bg); color: var(--overdue-ink); }
  .suggest-chip.due_soon  { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
  .suggest-chip.priority  { background: var(--col-bg); color: var(--faint); }

  .circle {
    width: 18px; height: 18px; border-radius: 50%;
    background: none; padding: 0;
    border: 1.6px solid var(--border-strong); flex-shrink: 0; cursor: pointer;
    transition: border-color .12s, background .12s; display: block;
  }
  .circle:hover { border-color: var(--accent); background: var(--hover); }

  .check {
    width: 18px; height: 18px; border-radius: 5px;
    border: 1.6px solid var(--border-strong); flex-shrink: 0; display: block;
    transition: border-color .12s, background .12s;
  }
  .check.checked { background: var(--accent); border-color: var(--accent); }

  .prio-dot { width: 8px; height: 8px; border-radius: 50%; }

  .task-title {
    font-size: 14px; font-weight: 500; color: var(--text);
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .proj-badge {
    font-family: var(--mono); font-size: 10px; color: var(--faint);
    background: var(--col-bg); padding: 2px 8px; border-radius: 6px;
    white-space: nowrap;
  }

  .fc-footer {
    flex-shrink: 0;
    padding: 14px 28px; border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .commit-btn {
    width: 100%; max-width: calc(900px - 56px); /* matches fc-body's content width minus its padding */
    background: var(--accent); color: #fff; border: none;
    font-size: 14px; font-weight: 600; padding: 11px; border-radius: 10px;
    cursor: pointer; transition: opacity .12s;
  }
  .commit-btn:disabled { opacity: .4; cursor: not-allowed; }
  .commit-btn:not(:disabled):hover { opacity: .9; }

  @media (max-width: 768px) {
    .hamburger { display: flex; }
  }

  @media (max-width: 700px) {
    .fc-header { padding: 14px 16px 10px; }
    .fc-body   { padding: 14px 14px 32px; }
    .fc-footer { padding: 12px 16px; }
    .fc-title  { font-size: 17px; }
    .task-row  { grid-template-columns: 20px 10px 1fr; }
    .task-row.picker { grid-template-columns: 20px 10px 1fr auto; }
    .proj-badge { display: none; }
  }
</style>
