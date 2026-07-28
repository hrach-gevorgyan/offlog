<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getOpenTasksForFocusPicker, updateTask, getTaskById, subscribe } from './db';
  import { projects, showError } from './store';
  import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
  import CardDetail from './CardDetail.svelte';
  import type { TaskDoc, ProjectDoc } from './types';
  import { hapticToggle } from './haptics';
  import { today, loadFocusLock, saveFocusLock, type FocusLock } from './focusLock';

  const dispatch = createEventDispatcher<{ menu: void }>();

  // B35 (revised) — a daily commitment lock, not an auto-computed priority
  // list. Up to 3 tasks, picked once, locked until each is done or the day
  // rolls over. Lock read/write lives in focusLock.ts now, shared with
  // DashboardView.svelte's "Daily Brief" card (B35) — see its own comment
  // for why this is deliberately not a PouchDB doc.
  const MAX_COMMIT = 3;

  let lock: FocusLock | null = loadFocusLock();
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

    // redesign/v6 (owner feedback, 2026-07-29): the 3 suggested (bigger)
    // notes need to land somewhere near the top of the board -- but
    // spread across roughly the first 10 cards, not stacked as a
    // consecutive block of exactly 3 (owner: "top 10, not 3 together").
    // Bucket-major order alone didn't even guarantee "near the top": a
    // handful of non-suggested pinned tasks could all list before the
    // overdue bucket's one suggested pick, burying it well past the top
    // row. Build a "top window" of up to 10 slots, place the suggested
    // picks at evenly-spaced slots within it (in their own round-robin
    // pick order — the Map's insertion order), fill the gaps with the
    // rest in bucket-major order, then append whatever's left over.
    const byBucket = BUCKET_ORDER.flatMap(reason => buckets[reason].map(x => x.t));
    const byId = new Map(byBucket.map(t => [t._id!, t]));
    const suggestedFirst = [...suggestedReasons.keys()].map(id => byId.get(id)!).filter(Boolean);
    const rest = byBucket.filter(t => !suggestedReasons.has(t._id!));

    const windowSize = Math.min(10, suggestedFirst.length + rest.length);
    const window: (TaskDoc | null)[] = new Array(windowSize).fill(null);
    suggestedFirst.forEach((t, i) => {
      const ideal = Math.round(i * (windowSize - 1) / Math.max(1, suggestedFirst.length - 1 || 1));
      let slot = Math.min(windowSize - 1, ideal);
      while (window[slot]) slot = (slot + 1) % windowSize;
      window[slot] = t;
    });
    let ri = 0;
    for (let i = 0; i < windowSize; i++) if (!window[i]) window[i] = rest[ri++];
    return [...(window.filter((t): t is TaskDoc => !!t)), ...rest.slice(ri)];
  }
  let detailTask: TaskDoc | null = null;
  let detailProject: ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists — {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;

  async function loadLockedTasks() {
    if (!lock) { lockedTasks = []; return; }
    const fetched = await Promise.all(lock.taskIds.map(id => getTaskById(id)));
    // !archived too, not just !deleted — every other read path in the
    // app (getOpenTasksForFocusPicker, getAllTasksDue, etc.) excludes
    // both; a task archived elsewhere while locked as one of today's 3
    // commitments used to stay visible/actionable here regardless.
    lockedTasks = fetched.filter((t): t is TaskDoc => !!t && !t.deleted && !t.archived);
  }

  async function loadPicker() { pickerTasks = rankPicker(await getOpenTasksForFocusPicker()); }

  async function refresh() {
    lock = loadFocusLock();
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
    saveFocusLock({ date: today(), taskIds: selected });
    selected = [];
    await refresh();
  }

  async function resetCommitment() {
    saveFocusLock(null);
    await refresh();
  }

  function openDetail(t: TaskDoc) {
    detailOpenSession++;
    detailTask = t;
    detailProject = $projects.find(p => p._id === t.project_id) ?? null;
  }

  async function openRelatedTask(id: string) {
    const t = await getTaskById(id);
    if (!t) { showError('This task no longer exists.'); return; }
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) { showError('Could not open this task right now.'); return; }
    detailOpenSession++;
    detailTask = t;
    detailProject = proj;
  }

  // Remembers, per task, which column it was in right before markDone()
  // moved it to the last column — in-memory only (resets on reload), just
  // enough to let the same checkbox undo a done-mark by clicking again
  // (owner feedback, 2026-07-29). Falls back to the project's first
  // column if that memory is gone (e.g. after a refresh).
  let doneFromCol: Record<string, string> = {};

  async function markDone(t: TaskDoc) {
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) return;
    const lastCol = proj.columns.at(-1)?.id;
    if (!lastCol) return;
    const target = t.column_id === lastCol
      ? (doneFromCol[t._id!] ?? proj.columns[0]?.id)
      : lastCol;
    if (!target || target === t.column_id) return;
    if (t.column_id !== lastCol) doneFromCol[t._id!] = t.column_id;
    try {
      await updateTask(t._id!, { column_id: target });
      await refresh();
      hapticToggle();
    } catch {
      showError('Failed to update task. Please try again.');
    }
  }

  // v5.4.1 bug (owner-reported live testing, 2026-07-20): markDone() was
  // correctly updating the task (confirmed via Time Travel) but the row
  // itself never reflected it — no isDone check anywhere in the
  // template, so a "done" task looked identical to an untouched one and
  // stayed clickable forever. allDone already computed this per-task
  // inline; extracted so the row template can reuse it too.
  function isDone(t: TaskDoc): boolean {
    const proj = $projects.find(p => p._id === t.project_id);
    return !!proj && t.column_id === proj.columns.at(-1)?.id;
  }
  $: allDone = lock !== null && lockedTasks.length > 0 && lockedTasks.every(isDone);

  // B41 — the picker uses the full available space as a scattered
  // "brainstorm corkboard" of varying-size note cards rather than a
  // plain capped-width list, per owner direction (2026-07-09). Size and
  // tilt are derived deterministically from the task id (a stable hash,
  // not Math.random()) so cards don't jitter to a new size/angle on
  // every reactive re-render — same task always looks the same until the
  // picker itself reloads. Actual layout is still flow-based (flex-wrap),
  // not true absolute-random positioning — real floating/overlapping
  // cards would be unusable (unclickable overlaps, broken tab order,
  // no responsive story), so "floating and scattered" is expressed
  // through size variety + a few degrees of rotation, not literal chaos.
  function hashId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h;
  }
  const SIZES = ['note-sm', 'note-md', 'note-lg'] as const;
  function noteSize(t: TaskDoc & { project_name?: string }): string {
    if (suggestedReasons.has(t._id!)) return 'note-lg'; // suggested tasks are the ones worth noticing first
    return SIZES[hashId(t._id!) % 2]; // sm/md mix for the rest — lg is reserved for suggested
  }
  // Reduced range (owner feedback, 2026-07-29: "too much, make more
  // stable") and about half the cards stay perfectly flat now (owner:
  // "not all cards need to be tilted, some can be normal") -- only the
  // other half lean, and only a couple degrees when they do.
  function noteTilt(t: TaskDoc): number {
    const h = hashId(t._id!);
    if (h % 4 < 2) return 0;
    return h % 4 === 2 ? -1.5 : 1.5;
  }
  // A little vertical stagger alongside the tilt (owner feedback,
  // 2026-07-29: "more freedom of card positions like it was before") --
  // keeps the flex-grow tiling (no dead gaps) but the row no longer
  // looks perfectly ruled-off, closer to loose stickers than a table.
  function noteJitter(t: TaskDoc): number {
    const h = hashId(t._id!);
    return (h % 9) - 4; // -4..4 px
  }
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
      <span class="fc-count">
        {#if lock}
          Today's focus — knock these out, then everything else can wait
        {:else}
          Select up to {MAX_COMMIT} tasks for today's commitment — they'll stay locked here until each is done
        {/if}
      </span>
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
        {@const done = isDone(t)}
        <div
          class="task-row"
          style="--prio-color:{PRIO_COLOR[t.priority]}"
          title={PRIO_LABEL[t.priority]}
          role="button"
          tabindex="0"
          on:click={() => openDetail(t)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } }}
        >
          <button class="circle" class:done on:click|stopPropagation={() => markDone(t)} title={done ? 'Mark not done' : 'Mark done'} aria-label={done ? 'Mark not done' : 'Mark done'}>
            {#if done}<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6.5 5,9.5 10,3"/></svg>{/if}
          </button>
          <div class="task-body">
            <span class="task-title" class:done>{t.title}</span>
            <span class="proj-badge">{$projects.find(p => p._id === t.project_id)?.name ?? '—'}</span>
          </div>
        </div>
      {/each}
    {:else}
      <p class="picker-hint">Bigger, blue-highlighted notes are today's top suggestions — ranked pinned, then overdue, then due-soon, then priority. Tap a note to select it, then Commit below.</p>
      {#if pickerTasks.length === 0}
        <div class="empty">No open tasks to pick from.</div>
      {:else}
        <div class="board">
          {#each pickerTasks as t (t._id)}
            <div
              class="note {noteSize(t)}"
              class:selected={selected.includes(t._id!)}
              class:suggested={suggestedReasons.has(t._id!)}
              style="--tilt: {noteTilt(t)}deg; --jitter: {noteJitter(t)}px; --prio-color: {PRIO_COLOR[t.priority]}"
              title={PRIO_LABEL[t.priority]}
              role="button"
              tabindex="0"
              on:click={() => toggleSelect(t._id!)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(t._id!); } }}
            >
              <span class="note-title">{t.title}</span>
              <div class="note-foot">
                <span class="proj-badge">{t.project_name ?? '—'}</span>
                {#if suggestedReasons.has(t._id!)}
                  <span class="suggest-chip {suggestedReasons.get(t._id!)}">{SUGGEST_LABEL[suggestedReasons.get(t._id!)!]}</span>
                {/if}
              </div>
              <span class="check" class:checked={selected.includes(t._id!)} aria-label={selected.includes(t._id!) ? 'Selected' : 'Select for commitment'}>
                {#if selected.includes(t._id!)}<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="var(--on-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6.5 5,9.5 10,3"/></svg>{/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if !lock}
    <div class="fc-footer">
      <button class="commit-btn" disabled={!selected.length} on:click={commit}>
        {selected.length ? `Let's focus on ${selected.length} task${selected.length > 1 ? 's' : ''}` : "Let's focus"}
      </button>
    </div>
  {/if}
</div>

{#if detailTask && detailProject}
  {#key detailTask._id + ':' + detailOpenSession}
    <CardDetail
      task={detailTask}
      project={detailProject}
      on:close={async () => { detailTask = null; detailProject = null; await refresh(); }}
      on:openRelated={(e) => openRelatedTask(e.detail)}
    />
  {/key}
{/if}

<style>
  .focus { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

  .fc-header {
    /* flex-start, not center — see DashboardView.svelte's .dash-header
       comment for why (consistent hamburger position across pages with
       a different number of subtitle lines, owner-reported 2026-07-16). */
    display: flex; align-items: flex-start; gap: 10px;
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
    color: var(--text); padding: 4px; border-radius: 6px; margin-top: 1px;
    flex-shrink: 0; align-items: center; justify-content: center;
    transition: background .12s;
  }
  .hamburger:hover { background: var(--hover); }

  /* Same shape family as .commit-btn (rounded, bold, outline instead of
     filled) but scaled down for a header button rather than matching its
     footer-CTA size exactly -- a literal match (owner feedback,
     2026-07-29) ended up too big for this spot. */
  .reset-btn {
    background: none; border: 1.5px solid var(--border-strong); color: var(--muted);
    font-size: 13px; font-weight: 700; padding: 8px 18px; border-radius: 9px; cursor: pointer;
    flex-shrink: 0; transition: background .12s, color .12s, border-color .12s;
    /* header is align-items:flex-start now (see .fc-header comment) —
       this button still wants to sit centered against the row. */
    align-self: center;
  }
  .reset-btn:hover { background: var(--hover); color: var(--text); border-color: var(--accent); }

  .fc-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px 40px;
    width: 100%; box-sizing: border-box;
  }

  /* Owner feedback (2026-07-29): the "X of Y done" progress stat didn't
     read as motivating, just as a metric being tracked -- removed. The
     bigger locked-row treatment it shipped alongside stays; that part
     landed well on its own. */
  .picker-hint { color: var(--faint); opacity: .7; font-size: 12.5px; margin: 0 0 16px; max-width: 640px; }
  .empty { color: var(--faint); font-size: 14px; padding: 12px 0; }

  /* B41 — the corkboard. flex-wrap, not a grid with fixed tracks, so
     differently-sized notes can sit next to each other naturally instead
     of being forced into uniform cells. */
  .board {
    display: flex; flex-wrap: wrap; align-content: flex-start;
    gap: 18px 22px;
  }
  /* redesign/v6 (owner feedback, 2026-07-28): priority moved off the
     small dot entirely -- a thin colored top edge now, same "color =
     priority" language as Kanban/List/Agenda, just on top instead of the
     left since these notes tilt and sit in a scattered board rather than
     a vertical list. Selected/suggested state stays communicated via
     border + a touch of the accent color, unrelated to priority. */
  .note {
    position: relative;
    display: flex; flex-direction: column; gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: 2px solid var(--prio-color, var(--border));
    border-radius: 7px;
    padding: 14px 16px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,.05);
    transform: rotate(var(--tilt)) translateY(var(--jitter, 0px));
    transition: transform .15s, box-shadow .15s, border-color .15s, background .15s;
  }
  .note:hover { transform: rotate(0deg) translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,.1); }
  .note.selected {
    transform: rotate(0deg); border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, var(--surface));
    box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .note.suggested { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
  .note.suggested.selected { border-color: var(--accent); }

  /* flex-grow (not a fixed width) so trailing space at the end of a row
     gets absorbed by the notes already in it instead of sitting empty --
     "a real board of stickers" should look tiled edge to edge, not leave
     a gap where one more note almost fit (owner feedback, 2026-07-29). */
  .note-sm { flex: 1 1 160px; max-width: 220px; }
  .note-md { flex: 1 1 210px; max-width: 280px; }
  .note-lg { flex: 1 1 260px; max-width: 340px; padding: 18px 20px; }
  .note-lg .note-title { font-size: 15px; }

  .note-title {
    font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.4;
    padding-right: 22px; /* clears the absolutely-positioned .check corner */
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }
  .note-foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: auto; }

  .task-row {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: center; gap: 12px;
    padding: 14px 16px; border-radius: 7px;
    border: 1px solid var(--border); border-left: 2px solid var(--prio-color, var(--border));
    background: var(--surface);
    margin-bottom: 8px; cursor: pointer;
    transition: background .1s, box-shadow .1s;
  }
  .task-row:hover { background: var(--hover); box-shadow: 0 1px 4px rgba(0,0,0,.06); }

  .suggest-chip {
    font-family: var(--mono); font-size: 10px; font-weight: 600;
    padding: 3px 8px; border-radius: 6px; white-space: nowrap;
  }
  .suggest-chip.pinned    { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .suggest-chip.overdue   { background: var(--overdue-bg); color: var(--overdue-ink); }
  .suggest-chip.due_soon  { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
  .suggest-chip.priority  { background: var(--col-bg); color: var(--faint); }

  /* Same minimal checkbox language as ListView/DeadlinesView's .circle
     (owner feedback, 2026-07-28) -- rounded square, no fill, border-only. */
  .circle {
    width: 18px; height: 18px; border-radius: 5px;
    background: none; padding: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--border-strong); flex-shrink: 0; cursor: pointer;
    transition: border-color .12s;
  }
  .circle:hover { border-color: var(--accent); }
  .circle.done { border-color: var(--accent); }
  .task-title.done { text-decoration: line-through; color: var(--muted); }

  /* Select-for-commitment checkbox -- deliberately the *filled* checkbox
     language (like ListView's bulk-select .row-check), not the plain
     border-only "done" checkbox style used elsewhere: this one means
     "chosen", not "complete". Absolutely positioned in the note's own
     top-right corner rather than inline with the footer's badges (owner
     feedback, 2026-07-28: sharing a flex row with proj-badge/suggest-chip
     made its alignment look off whenever badge heights/widths varied) --
     a solid background so it always reads cleanly against the title text
     underneath, regardless of how many lines the title wraps to. */
  .check {
    position: absolute; top: 10px; right: 10px;
    width: 18px; height: 18px; border-radius: 5px;
    background: var(--surface);
    border: 1.6px solid var(--border-strong); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: border-color .12s, background .12s;
  }
  .check.checked { background: var(--accent); border-color: var(--accent); }

  /* Locked task-row's title + project stacked (same primary/secondary
     pattern as DashboardView/DeadlinesView's .task-body) instead of a
     same-line project chip that used to just vanish below 700px
     (owner-reported, 2026-07-16) — survives at every width now. The
     corkboard note's own .proj-badge (in .note-foot below) keeps its
     chip look; that one has room to spare and pairs visually with
     .suggest-chip, so it's left as-is. */
  .task-row .task-body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .task-title {
    font-size: 15px; font-weight: 600; color: var(--text);
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* Plain text, not a chip -- the general .proj-badge rule below (used by
     the corkboard note's own project badge) sets a background/padding
     that this override was meant to remove but never actually did
     (background/padding aren't shadowed by setting other properties in
     CSS), so this row's project name was rendering as a chip that could
     look stretched/oversized (owner feedback, 2026-07-29: "project pill
     is too long"). Explicit `none`/`0` here actually clears it. */
  .task-row .proj-badge {
    font-family: var(--mono); font-size: 10px; color: var(--faint);
    background: none; padding: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .proj-badge {
    font-family: var(--mono); font-size: 10px; color: var(--faint);
    background: var(--col-bg); padding: 2px 8px; border-radius: 6px;
    white-space: nowrap;
  }

  .fc-footer {
    flex-shrink: 0;
    display: flex; justify-content: center;
    padding: 14px 28px; border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .commit-btn {
    width: auto; min-width: 240px;
    background: var(--accent); color: var(--on-accent); border: 1.5px solid var(--accent);
    font-size: 15px; font-weight: 700; padding: 13px 32px; border-radius: 12px;
    cursor: pointer; transition: opacity .12s;
  }
  .commit-btn:disabled { opacity: .4; cursor: not-allowed; }
  .commit-btn:not(:disabled):hover { opacity: .9; }

  @media (max-width: 768px), (max-height: 500px) and (orientation: landscape) {
    .hamburger { display: flex; }
  }

  @media (max-width: 700px) {
    .fc-header { padding: 14px 16px 10px; }
    .fc-body   { padding: 14px 14px 32px; }
    .fc-footer { padding: 12px 16px; }
    .fc-title  { font-size: 17px; }
    .board { gap: 14px; }
    .note-sm, .note-md, .note-lg { flex-basis: calc(50% - 7px); max-width: none; }
  }
</style>
