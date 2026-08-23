///<reference types="svelte" />
;
import { onMount, createEventDispatcher } from 'svelte';
import { fly, fade } from 'svelte/transition';
import { getRecentLogs, getTaskById, clearLogs, subscribe } from './db';
import { projects, showError } from './store';
import { describeLog, fmt, entityLabel, ACTION_LABEL } from './logFormat';
import { ACTION_COLOR } from './utils';
import { closeOnBack } from './modalStack';
import { confirmAction } from './confirm';
import { trapFocus } from './focusTrap';
import { panelFly, scrimFade } from './motion';
import CardDetail from './CardDetail.svelte';
import type { TaskDoc, ProjectDoc } from './types';
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  
  
  

  // Replaces the old ChangelogView.svelte (2026-07-18, owner feedback:
  // "both almost doing same thing") -- a flat 80-entry activity log and a
  // day-grouped, clickable, further-back journal over the exact same
  // log: docs were two surfaces doing one job. This is the merged one:
  // ChangelogView's per-row detail (project badge, device/source pill,
  // Clear all) plus the day grouping/pagination/click-to-open that made
  // this worth keeping instead of just deleting it.
  const dispatch = createEventDispatcher();
  const requestClose = closeOnBack(() => dispatch('close'));

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  // Reuses getRecentLogs() with a growing limit rather than a new
  // date-range query -- simplest correct thing at personal-task-manager
  // scale, no new query surface to get wrong.
  const PAGE_SIZE = 150;
  let limit = PAGE_SIZE;
  let logs: any[] = [];
  let loading = true;
  let hasMore = true;
  let bodyEl: HTMLDivElement;

  // subscribe() is db.ts's single global change feed -- it fires on
  // *every* doc write app-wide, not just log: docs, so leaving this panel
  // open while working elsewhere reruns getRecentLogs(limit) constantly.
  // Preserve scroll position across the reload (a full-array replace
  // otherwise snaps a scrolled-down reader back to the top on someone
  // else's unrelated edit) and skip overlapping reloads if one is
  // already in flight.
  async function load() {
    if (loading && logs.length > 0) return; // already loading, not the initial mount
    loading = true;
    const scrollTop = bodyEl?.scrollTop ?? 0;
    const fetched = await getRecentLogs(limit);
    hasMore = fetched.length === limit; // exactly the cap -> there may be more
    logs = fetched;
    loading = false;
    if (bodyEl) requestAnimationFrame(() => { bodyEl.scrollTop = scrollTop; });
  }

  function loadMore() { limit += PAGE_SIZE; load(); }

  onMount(() => {
    load();
    return subscribe(() => load());
  });

  // Local calendar date, not a raw ISO slice -- ts is stored UTC (db.ts's
  // now()), and slicing the string directly would group late-evening
  // entries into "tomorrow" for anyone west of UTC. Same reasoning
  // CardDetail's own dateFromToday() comment documents for due dates.
  function dayKey(ts: string): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const todayKey = dayKey(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = dayKey(yesterdayDate.toISOString());
  const thisYear = new Date().getFullYear();

  function dayLabel(key: string): string {
    if (key === todayKey) return 'Today';
    if (key === yesterdayKey) return 'Yesterday';
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric',
      year: y !== thisYear ? 'numeric' : undefined,
    });
  }

  interface DayGroup { key: string; label: string; entries: any[]; counts: Record<string, number> }

  let  groups = __sveltets_2_invalidate(() => (() => {
    const map = new Map<string, any[]>();
    for (const log of logs) {
      const key = dayKey(log.ts);
      (map.get(key) ?? map.set(key, []).get(key)!).push(log);
    }
    const out: DayGroup[] = [];
    for (const [key, entries] of map) {
      const counts: Record<string, number> = {};
      for (const e of entries) counts[e.action] = (counts[e.action] ?? 0) + 1;
      out.push({ key, label: dayLabel(key), entries, counts });
    }
    return out; // insertion order already matches getRecentLogs' descending order
  })());

  function summarize(counts: Record<string, number>): string {
    return (['create', 'update', 'move', 'delete'] as const)
      .filter(a => counts[a])
      .map(a => `${counts[a]} ${ACTION_LABEL[a].toLowerCase()}`)
      .join(' · ');
  }

  let detailTask: TaskDoc | null = null;
  let detailProject: ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists -- {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;

  async function openEntry(log: any) {
    if (entityLabel(log) !== 'task') return; // only tasks have a card to open
    try {
      const task = await getTaskById(log.ref);
      if (!task) { showError('This task no longer exists.'); return; }
      const proj = $projects.find(p => p._id === task.project_id);
      if (!proj) { showError('Could not open this task right now.'); return; }
      detailOpenSession++;
      detailTask = task;
      detailProject = proj;
    } catch {
      showError('Could not open this task right now.');
    }
  }

  async function openRelatedTask(id: string) {
    try {
      const task = await getTaskById(id);
      if (!task) { showError('This task no longer exists.'); return; }
      const proj = $projects.find(p => p._id === task.project_id);
      if (!proj) { showError('Could not open this task right now.'); return; }
      detailOpenSession++;
      detailTask = task;
      detailProject = proj;
    } catch {
      showError('Could not open this task right now.');
    }
  }
;
async () => {

  { svelteHTML.createElement("svelte:window", {  "on:keydown":onWindowKeydown,});}


 { svelteHTML.createElement("div", {     "class":`scrim`,"on:click":() => requestClose(),});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }

 {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {    "class":`panel`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),(panelFly)));
   { svelteHTML.createElement("div", { "class":`panel-head`,});
     { svelteHTML.createElement("span", { "class":`panel-title`,});  }
    if(logs.length > 0){
      
       { svelteHTML.createElement("button", {   "class":`clear-btn`,"on:click":async () => {
        if (!(await confirmAction('Clear the entire history? This erases the record of every change ever made, and cannot be undone.', { danger: true, confirmLabel: 'Clear all' }))) return;
        try { await clearLogs(); logs = []; } catch { showError('Failed to clear history.'); }
      },});  }
    }
     { svelteHTML.createElement("button", {     "class":`close-btn`,"on:click":() => requestClose(),"aria-label":`Close`,});  }
   }

   { const $$_div1 = svelteHTML.createElement("div", {  "class":`tt-body`,});bodyEl = $$_div1;
    if(loading && logs.length === 0){
       { svelteHTML.createElement("div", { "class":`empty`,}); { svelteHTML.createElement("span", { "class":`spinner`,}); }  }
    } else if (groups.length === 0){
       { svelteHTML.createElement("div", { "class":`empty`,});              }
    }else{
         for(let g of __sveltets_2_ensureArray(groups)){g.key;
         { svelteHTML.createElement("div", { "class":`day-group`,});
           { svelteHTML.createElement("div", { "class":`day-head`,});
             { svelteHTML.createElement("span", { "class":`day-label`,});g.label; }
             { svelteHTML.createElement("span", { "class":`day-summary`,});summarize(g.counts); }
           }
             for(let log of __sveltets_2_ensureArray(g.entries)){log._id;
            const clickable = entityLabel(log) === 'task';
            if(clickable){
               { svelteHTML.createElement("div", {           "class":`entry clickable`,"role":`button`,"tabindex":0,"on:click":() => openEntry(log),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEntry(log); } },});
                 { svelteHTML.createElement("span", {   "class":`action-pill`,"style":`background:color-mix(in srgb, ${ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:${ACTION_COLOR[log.action] ?? '#a39c90'}`,});ACTION_LABEL[log.action] ?? log.action; }
                 { svelteHTML.createElement("span", { "class":`entry-desc`,});describeLog(log); }
                 { svelteHTML.createElement("span", { "class":`entry-meta`,});
                   { svelteHTML.createElement("span", { "class":`source-pill source-${log.source ?? 'pc'}`,});log.source ?? 'pc'; }
                   { svelteHTML.createElement("span", { "class":`entry-time`,});fmt(log.ts).split(' · ')[1]; }
                 }
                if(log.project_name && entityLabel(log) !== 'project'){
                   { svelteHTML.createElement("span", { "class":`entry-project`,});log.project_name; }
                }
               }
            }else{
              
               { svelteHTML.createElement("div", {   "class":`entry`,"role":`listitem`,});
                 { svelteHTML.createElement("span", {   "class":`action-pill`,"style":`background:color-mix(in srgb, ${ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:${ACTION_COLOR[log.action] ?? '#a39c90'}`,});ACTION_LABEL[log.action] ?? log.action; }
                 { svelteHTML.createElement("span", { "class":`entry-desc`,});describeLog(log); }
                 { svelteHTML.createElement("span", { "class":`entry-meta`,});
                   { svelteHTML.createElement("span", { "class":`source-pill source-${log.source ?? 'pc'}`,});log.source ?? 'pc'; }
                   { svelteHTML.createElement("span", { "class":`entry-time`,});fmt(log.ts).split(' · ')[1]; }
                 }
                
                if(log.project_name && entityLabel(log) !== 'project'){
                   { svelteHTML.createElement("span", { "class":`entry-project`,});log.project_name; }
                }
               }
            }
          }
         }
      }
      if(hasMore){
         { svelteHTML.createElement("button", {     "class":`load-more-btn`,"on:click":loadMore,"disabled":loading,});loading ? 'Loading…' : 'Load more'; }
      }
    }
   }
 }}

if(detailTask && detailProject){
  detailTask._id + ':' + detailOpenSession; {
     { const $$_liateDdraC0C = __sveltets_2_ensureComponent(CardDetail); const $$_liateDdraC0 = new $$_liateDdraC0C({ target: __sveltets_2_any(), props: {         "task":detailTask,"project":detailProject,}});$$_liateDdraC0.$on("close", async () => { detailTask = null; detailProject = null; await load(); });$$_liateDdraC0.$on("openRelated", (e) => openRelatedTask(e.detail));}
  }
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {'close': __sveltets_2_customEvent} }}
const TimeTravelView__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type TimeTravelView__SvelteComponent_ = InstanceType<typeof TimeTravelView__SvelteComponent_>;
/*Ωignore_endΩ*/export default TimeTravelView__SvelteComponent_;