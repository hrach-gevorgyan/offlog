///<reference types="svelte" />
;
import { onMount, createEventDispatcher } from 'svelte';
import { getOpenTasksForFocusPicker, updateTask, getTaskById, subscribe } from './db';
import { projects, showError } from './store';
import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
import CardDetail from './CardDetail.svelte';
import type { TaskDoc, ProjectDoc } from './types';
import { hapticToggle } from './haptics';
import { today, loadFocusLock, saveFocusLock, type FocusLock } from './focusLock';
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ menu: void; search: void }>();

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
  let  allDone = __sveltets_2_invalidate(() => lock !== null && lockedTasks.length > 0 && lockedTasks.every(isDone));

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
    if (suggestedReasons.has(t._id!)) return 'note-lg'; // suggested tasks are always at least this big
    // Full 3-way size mix, not just sm/md (owner feedback, 2026-07-30:
    // the corkboard is a signature feature, lean into the variety) --
    // a non-suggested note can land on note-lg too now; what still marks
    // a *suggested* one out is the accent border tint + its suggest-chip,
    // not size alone.
    return SIZES[hashId(t._id!) % 3];
  }
  // A deliberately varied, mostly-non-zero spread (owner feedback,
  // 2026-07-29: dialing tilt down to mostly-flat killed the "real
  // corkboard" character this page is meant to have — it's one of the
  // app's signature touches, not just a detail to tone down). Only 1 of
  // 8 buckets is dead flat; the rest vary in both directions but stay
  // gentle (owner feedback, 2026-07-30: the wider range read as too
  // aggressive) rather than the earlier, more dramatic swing.
  const TILTS = [-2, -1.2, -0.5, 0, 0.7, 1.5, 2.2, -1.7];
  function noteTilt(t: TaskDoc): number {
    return TILTS[hashId(t._id!) % TILTS.length];
  }
  // A little vertical stagger alongside the tilt (owner feedback,
  // 2026-07-29: "more freedom of card positions like it was before") --
  // keeps the flex-grow tiling (no dead gaps) but the row no longer
  // looks perfectly ruled-off, closer to loose stickers than a table.
  function noteJitter(t: TaskDoc): number {
    const h = hashId(t._id!);
    return (h % 9) - 4; // -4..4 px
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`focus`,});
   { svelteHTML.createElement("div", { "class":`fc-header`,});
     { svelteHTML.createElement("button", {     "class":`hamburger`,"on:click":() => dispatch('menu'),"aria-label":`Menu`,});
       { svelteHTML.createElement("svg", {             "viewBox":`0 0 20 20`,"width":`20`,"height":`20`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,});
          { svelteHTML.createElement("line", {       "x1":`3`,"y1":`5`,"x2":`17`,"y2":`5`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`10`,"x2":`17`,"y2":`10`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`15`,"x2":`17`,"y2":`15`,});}
       }
     }
     { svelteHTML.createElement("div", { "class":`title-block`,});
       { svelteHTML.createElement("h1", { "class":`fc-title`,});  }
       { svelteHTML.createElement("span", { "class":`fc-count`,});
        if(lock){          }else{   MAX_COMMIT;             }
       }
     }
    if(lock){
       { svelteHTML.createElement("button", {   "class":`reset-btn`,"on:click":resetCommitment,});  }
    }
    
     { svelteHTML.createElement("button", {       "class":`palette-btn`,"on:click":() => dispatch('search'),"title":`Command Palette (Ctrl+K)`,"aria-label":`Command Palette (Ctrl+K)`,});
       { svelteHTML.createElement("svg", {               "viewBox":`0 0 24 24`,"width":`15`,"height":`15`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`2.1`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
          { svelteHTML.createElement("path", { "d":`M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z`,});}
       }
     }
   }

   { svelteHTML.createElement("div", { "class":`fc-body`,});
    if(lock){
      if(allDone){
         { svelteHTML.createElement("div", { "class":`empty`,}); lockedTasks.length;              }
      }
         for(let t of __sveltets_2_ensureArray(lockedTasks)){t._id;
        const done = isDone(t);
         { svelteHTML.createElement("div", {               "class":`task-row`,"style":`--prio-color:${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],"role":`button`,"tabindex":0,"on:click":() => openDetail(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } },});
           { svelteHTML.createElement("button", {        "class":`circle`,"on:click":() => markDone(t),"title":done ? 'Mark not done' : 'Mark done',"aria-label":done ? 'Mark not done' : 'Mark done',});done;
            if(done){ { svelteHTML.createElement("svg", {               "viewBox":`0 0 12 12`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`var(--accent)`,"stroke-width":`2`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`2,6.5 5,9.5 10,3`,});} }}
           }
           { svelteHTML.createElement("div", { "class":`task-body`,});
             { svelteHTML.createElement("span", {  "class":`task-title`,});done;t.title; }
             { svelteHTML.createElement("span", { "class":`proj-badge`,});$projects.find(p => p._id === t.project_id)?.name ?? '—'; }
           }
         }
      }
    }else{
       { svelteHTML.createElement("p", { "class":`picker-hint`,});                         }
      if(pickerTasks.length === 0){
         { svelteHTML.createElement("div", { "class":`empty`,});      }
      }else{
         { svelteHTML.createElement("div", { "class":`board`,});
             for(let t of __sveltets_2_ensureArray(pickerTasks)){t._id;
             { svelteHTML.createElement("div", {                 "class":`note ${noteSize(t)}`,"style":`--tilt: ${noteTilt(t)}deg; --jitter: ${noteJitter(t)}px; --prio-color: ${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],"role":`button`,"tabindex":0,"on:click":() => toggleSelect(t._id!),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(t._id!); } },});selected.includes(t._id!);suggestedReasons.has(t._id!);
               { svelteHTML.createElement("span", { "class":`note-title`,});t.title; }
               { svelteHTML.createElement("div", { "class":`note-foot`,});
                 { svelteHTML.createElement("span", { "class":`proj-badge`,});t.project_name ?? '—'; }
                if(suggestedReasons.has(t._id!)){
                   { svelteHTML.createElement("span", { "class":`suggest-chip ${suggestedReasons.get(t._id!)}`,});SUGGEST_LABEL[suggestedReasons.get(t._id!)!]; }
                }
               }
               { svelteHTML.createElement("span", {    "class":`check`,"aria-label":selected.includes(t._id!) ? 'Selected' : 'Select for commitment',});selected.includes(t._id!);
                if(selected.includes(t._id!)){ { svelteHTML.createElement("svg", {               "viewBox":`0 0 12 12`,"width":`9`,"height":`9`,"fill":`none`,"stroke":`var(--on-accent)`,"stroke-width":`2`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("polyline", { "points":`2,6.5 5,9.5 10,3`,});} }}
               }
             }
          }
         }
      }
    }
   }

  if(!lock){
     { svelteHTML.createElement("div", { "class":`fc-footer`,});
       { svelteHTML.createElement("button", {     "class":`commit-btn`,"disabled":!selected.length,"on:click":commit,});
        selected.length ? `Let's focus on ${selected.length} task${selected.length > 1 ? 's' : ''}` : "Let's focus";
       }
     }
  }
 }

if(detailTask && detailProject){
  detailTask._id + ':' + detailOpenSession; {
     { const $$_liateDdraC0C = __sveltets_2_ensureComponent(CardDetail); const $$_liateDdraC0 = new $$_liateDdraC0C({ target: __sveltets_2_any(), props: {         "task":detailTask,"project":detailProject,}});$$_liateDdraC0.$on("close", async () => { detailTask = null; detailProject = null; await refresh(); });$$_liateDdraC0.$on("openRelated", (e) => openRelatedTask(e.detail));}
  }
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ menu: void; search: void }>()} }}
const FocusView__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type FocusView__SvelteComponent_ = InstanceType<typeof FocusView__SvelteComponent_>;
/*Ωignore_endΩ*/export default FocusView__SvelteComponent_;