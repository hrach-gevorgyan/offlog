///<reference types="svelte" />
;
import { onMount, createEventDispatcher } from 'svelte';
import { getDashboardData, getStorageBreakdown, getTaskById, subscribe } from './db';
import { reloadTasks, showError } from './store';
import { PRIORITY_COLOR } from './constants';
import { dueLabelLong } from './utils';
import type { TaskDoc, ProjectDoc } from './types';
import CardDetail from './CardDetail.svelte';
import { loadFocusLock, type FocusLock } from './focusLock';
function $$render() {

  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ openProject: string; menu: void; focus: void; search: void; agenda: void }>();

  // redesign/v6 (owner feedback, 2026-07-30): Today/Pinned/Overdue were
  // unbounded -- Dashboard's job is a glanceable overview, not a second
  // full task browser (that's already List/Agenda's job). Capped with a
  // muted "View all" -- Today/Overdue link out to Agenda (which already
  // groups Overdue/Today at the top of its own list); Pinned has no
  // dedicated cross-project view anywhere in the app yet, so its "View
  // all" just expands the list in place instead of linking nowhere.
  const TASK_CAP = 6;
  let pinnedExpanded = false;

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let detailTask: TaskDoc | null = null;
  let detailProject: ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists -- {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;
  // B27 — archived tasks previously only surfaced inside List view's own
  // toggle, easy to forget exists; this is a glance-level count only, not
  // a full archived-task browser (that stays in List view).
  let archivedCount = 0;

  // B35 — "Daily Brief" card: Dashboard previously had zero visibility
  // into Focus's daily commitment lock, so there was no way to tell "did
  // I already pick today's 3, and how am I doing" without leaving for
  // Focus itself. Deliberately doesn't re-show Today/Pinned/Overdue
  // (already their own sections below) -- this card is specifically the
  // one piece of state only Focus otherwise has.
  let focusLock: FocusLock | null = null;
  let focusLockedTasks: TaskDoc[] = [];

  function isFocusTaskDone(t: TaskDoc): boolean {
    const proj = data?.allProjects.find(p => p._id === t.project_id);
    return !!proj && t.column_id === proj.columns.at(-1)?.id;
  }

  async function loadFocusSummary() {
    focusLock = loadFocusLock();
    if (!focusLock) { focusLockedTasks = []; return; }
    const fetched = await Promise.all(focusLock.taskIds.map(id => getTaskById(id)));
    // Same !deleted/!archived filter as FocusView.svelte's own
    // loadLockedTasks() -- a task removed elsewhere while locked as one
    // of today's 3 shouldn't still count here either.
    focusLockedTasks = fetched.filter((t): t is TaskDoc => !!t && !t.deleted && !t.archived);
  }

  async function load() {
    data = await getDashboardData();
    archivedCount = (await getStorageBreakdown()).archivedTasks;
    await loadFocusSummary();
  }

  onMount(() => {
    load();
    return subscribe(() => load());
  });

  function openTask(t: TaskDoc) {
    detailOpenSession++;
    detailTask = t;
    detailProject = data?.allProjects.find(p => p._id === t.project_id) ?? null;
  }

  async function openRelatedTask(id: string) {
    const t = await getTaskById(id);
    if (!t) { showError('This task no longer exists.'); return; }
    const proj = data?.allProjects.find(p => p._id === t.project_id) ?? null;
    if (!proj) { showError('Could not open this task right now.'); return; }
    detailOpenSession++;
    detailTask = t;
    detailProject = proj;
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`dash`,});
   { svelteHTML.createElement("div", { "class":`dash-header`,});
     { svelteHTML.createElement("button", {     "class":`hamburger`,"on:click":() => dispatch('menu'),"aria-label":`Menu`,});
       { svelteHTML.createElement("svg", {             "viewBox":`0 0 20 20`,"width":`20`,"height":`20`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,});
          { svelteHTML.createElement("line", {       "x1":`3`,"y1":`5`,"x2":`17`,"y2":`5`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`10`,"x2":`17`,"y2":`10`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`15`,"x2":`17`,"y2":`15`,});}
       }
     }
     { svelteHTML.createElement("div", { "class":`title-block`,});
       { svelteHTML.createElement("h1", { "class":`dash-title`,});  }
      if(data){
         { svelteHTML.createElement("span", { "class":`dash-sub`,});
          data.totalTasks;  data.totalTasks === 1 ? '' : 's';  data.allProjects.length; data.allProjects.length === 1 ? '' : 's';
          if(archivedCount > 0){ archivedCount; }
         }
         { svelteHTML.createElement("span", { "class":`dash-sub dash-week`,});
          if(data.completedLast7Days > 0){
            data.completedLast7Days;     if(data.busiestProjectName){  data.busiestProjectName;}
          }else{      }
         }
      }
     }
    
     { svelteHTML.createElement("button", {       "class":`palette-btn`,"on:click":() => dispatch('search'),"title":`Command Palette (Ctrl+K)`,"aria-label":`Command Palette (Ctrl+K)`,});
       { svelteHTML.createElement("svg", {               "viewBox":`0 0 24 24`,"width":`15`,"height":`15`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`2.1`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
          { svelteHTML.createElement("path", { "d":`M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z`,});}
       }
     }
   }

  if(!data){
     { svelteHTML.createElement("div", { "class":`loading`,}); { svelteHTML.createElement("span", { "class":`spinner`,}); }  }
  }else{
     { svelteHTML.createElement("div", { "class":`dash-body`,});
      
       { svelteHTML.createElement("div", {         "class":`brief`,"role":`button`,"tabindex":0,"on:click":() => dispatch('focus'),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch('focus'); } },});
        if(focusLock){
          const doneCount = focusLockedTasks.filter(isFocusTaskDone).length;
           { svelteHTML.createElement("div", { "class":`brief-head`,});
             { svelteHTML.createElement("span", { "class":`brief-label`,});  }
             { svelteHTML.createElement("span", { "class":`brief-count`,});doneCount;  focusLockedTasks.length;  }
           }
           { svelteHTML.createElement("div", { "class":`brief-tasks`,});
               for(let t of __sveltets_2_ensureArray(focusLockedTasks)){t._id;
               { svelteHTML.createElement("span", {  "class":`brief-task`,});isFocusTaskDone(t);t.title; }
            }
           }
        }else{
           { svelteHTML.createElement("div", { "class":`brief-head`,});
             { svelteHTML.createElement("span", { "class":`brief-label`,});  }
           }
           { svelteHTML.createElement("span", { "class":`brief-empty`,});             }
        }
       }

       { svelteHTML.createElement("div", { "class":`dash-cols`,});

        
         { svelteHTML.createElement("div", { "class":`col-projects`,});
           { svelteHTML.createElement("div", { "class":`section-title`,});  }
           { svelteHTML.createElement("div", { "class":`project-grid`,});
               for(let proj of __sveltets_2_ensureArray(data.allProjects)){proj._id;
              const stats = data.byProject[proj._id] ?? { total: 0, pinned: 0, overdue: 0 };
              const space = data.allSpaces.find(s => s._id === proj.space_id);
               { svelteHTML.createElement("div", {           "class":`proj-card`,"role":`button`,"tabindex":0,"on:click":() => dispatch('openProject', proj._id),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch('openProject', proj._id); } },});
                 { svelteHTML.createElement("div", { "class":`proj-card-top`,});
                  if(space){
                     { svelteHTML.createElement("span", {   "class":`space-dot`,"style":`background:${space.color}`,}); }
                     { svelteHTML.createElement("span", { "class":`space-name`,});space.name; }
                  }
                   { svelteHTML.createElement("span", {   "class":`task-count`,"title":`${stats.total} task${stats.total === 1 ? '' : 's'}`,});stats.total; }
                 }
                 { svelteHTML.createElement("div", { "class":`proj-name`,});proj.name; }
                 { svelteHTML.createElement("div", { "class":`proj-stats`,});
                  if(stats.pinned){ { svelteHTML.createElement("span", { "class":`stat pinned-stat`,});stats.pinned;  }}
                  if(stats.overdue){ { svelteHTML.createElement("span", { "class":`stat overdue-stat`,});stats.overdue;  }}
                 }
               }
            }
            if(data.allProjects.length === 0){
               { svelteHTML.createElement("div", { "class":`no-projects`,});                }
            }
           }
         }

        
         { svelteHTML.createElement("div", { "class":`col-tasks`,});
          if(data.todayTasks.length > 0){
             { svelteHTML.createElement("section", { "class":`section`,});
               { svelteHTML.createElement("div", { "class":`section-title`,});  }
               { svelteHTML.createElement("div", { "class":`task-list`,});
                   for(let t of __sveltets_2_ensureArray((data.todayTasks.slice(0, TASK_CAP)))){t._id;
                   { svelteHTML.createElement("div", {           "class":`task-row`,"role":`button`,"tabindex":0,"on:click":() => openTask(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t); } },});
                     { svelteHTML.createElement("span", {   "class":`prio-bar`,"style":`background:${PRIORITY_COLOR[t.priority]}`,}); }
                     { svelteHTML.createElement("div", { "class":`task-body`,});
                       { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                       { svelteHTML.createElement("span", { "class":`task-proj`,});data.projCache[t.project_id] ?? '—'; }
                     }
                   }
                }
               }
              if(data.todayTasks.length > TASK_CAP){
                 { svelteHTML.createElement("button", {   "class":`view-all`,"on:click":() => dispatch('agenda'),});  data.todayTasks.length;   }
              }
             }
          }

          if(data.pinnedTasks.length > 0){
             { svelteHTML.createElement("section", { "class":`section`,});
               { svelteHTML.createElement("div", { "class":`section-title pinned-title`,});  }
               { svelteHTML.createElement("div", { "class":`task-list`,});
                   for(let t of __sveltets_2_ensureArray((pinnedExpanded ? data.pinnedTasks : data.pinnedTasks.slice(0, TASK_CAP)))){t._id;
                   { svelteHTML.createElement("div", {           "class":`task-row`,"role":`button`,"tabindex":0,"on:click":() => openTask(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t); } },});
                     { svelteHTML.createElement("span", {   "class":`prio-bar`,"style":`background:${PRIORITY_COLOR[t.priority]}`,}); }
                     { svelteHTML.createElement("div", { "class":`task-body`,});
                       { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                       { svelteHTML.createElement("span", { "class":`task-proj`,});data.projCache[t.project_id] ?? '—'; }
                     }
                   }
                }
               }
              if(data.pinnedTasks.length > TASK_CAP){
                 { svelteHTML.createElement("button", {   "class":`view-all`,"on:click":() => pinnedExpanded = !pinnedExpanded,});
                  pinnedExpanded ? 'Show less' : `View all ${data.pinnedTasks.length}`;
                 }
              }
             }
          }

          if(data.overdueTasks.length > 0){
             { svelteHTML.createElement("section", { "class":`section`,});
               { svelteHTML.createElement("div", { "class":`section-title overdue-title`,});  }
               { svelteHTML.createElement("div", { "class":`task-list`,});
                   for(let t of __sveltets_2_ensureArray((data.overdueTasks.slice(0, TASK_CAP)))){t._id;
                   { svelteHTML.createElement("div", {           "class":`task-row`,"role":`button`,"tabindex":0,"on:click":() => openTask(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t); } },});
                     { svelteHTML.createElement("span", {   "class":`prio-bar`,"style":`background:${PRIORITY_COLOR[t.priority]}`,}); }
                     { svelteHTML.createElement("div", { "class":`task-body`,});
                       { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                       { svelteHTML.createElement("span", { "class":`task-proj`,});data.projCache[t.project_id] ?? '—';  { svelteHTML.createElement("span", { "class":`task-due overdue`,}); dueLabelLong(t.due_date!); } }
                     }
                   }
                }
               }
              if(data.overdueTasks.length > TASK_CAP){
                 { svelteHTML.createElement("button", {   "class":`view-all`,"on:click":() => dispatch('agenda'),});  data.overdueTasks.length;   }
              }
             }
          }

          if(data.todayTasks.length === 0 && data.pinnedTasks.length === 0 && data.overdueTasks.length === 0){
             { svelteHTML.createElement("div", { "class":`all-good`,});          }
          }
         }

       }
     }
  }
 }

if(detailTask && detailProject){
  detailTask._id + ':' + detailOpenSession; {
     { const $$_liateDdraC0C = __sveltets_2_ensureComponent(CardDetail); const $$_liateDdraC0 = new $$_liateDdraC0C({ target: __sveltets_2_any(), props: {         "task":detailTask,"project":detailProject,}});$$_liateDdraC0.$on("close", async () => { detailTask = null; detailProject = null; await reloadTasks(); await load(); });$$_liateDdraC0.$on("openRelated", (e) => openRelatedTask(e.detail));}
  }
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ openProject: string; menu: void; focus: void; search: void; agenda: void }>()} }}
const DashboardView__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type DashboardView__SvelteComponent_ = InstanceType<typeof DashboardView__SvelteComponent_>;
/*Ωignore_endΩ*/export default DashboardView__SvelteComponent_;