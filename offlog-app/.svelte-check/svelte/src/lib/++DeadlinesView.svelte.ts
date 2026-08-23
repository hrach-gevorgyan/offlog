///<reference types="svelte" />
;
import { onMount, createEventDispatcher } from 'svelte';
import { slide } from 'svelte/transition';
import { getAllTasksDue, updateTask, subscribe, getTaskById } from './db';
import { projects, showError } from './store';
import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
import { dueLabelLong, dueRelative, dueDateShort, daysSinceWeekStart, localDateStr } from './utils';
import { getWeekStartsMonday } from '../config';
import CardDetail from './CardDetail.svelte';
import type { TaskDoc, ProjectDoc } from './types';
import { hapticToggle } from './haptics';
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ menu: void; search: void; addTask: string }>();

  type DueTask = TaskDoc & { project_name?: string };

  let all: DueTask[] = [];
  let detailTask: DueTask | null = null;
  let detailProject: ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists — {#key detailTask._id} alone doesn't change value on a fast
  // close-then-reopen of the same task.
  let detailOpenSession = 0;

  // Reactive, not a one-shot const: the desktop app is tray-resident as of
  // 2026-07-31, so this view can stay mounted across midnight. Captured
  // once, it kept yesterday's date — "Overdue" showed a stale set, today's
  // tasks sat filed under "This week", and nothing looked broken enough to
  // notice. Re-checked on a timer, and immediately on tab focus so waking
  // a laptop corrects it without waiting out the interval.
  let today = localDateStr(new Date());
  const DAY_ROLLOVER_CHECK_MS = 60 * 1000;
  function refreshToday() {
    const current = localDateStr(new Date());
    if (current !== today) today = current;
  }

  // Agenda's second view mode alongside the flat list — Month (roadmap
  // item 2), which replaced an earlier Week grid: Week's whole value was
  // seeing the current week laid out by day, which List's own "This
  // week" section already covers, and Month's per-day drill-in replaces
  // the rest. Same underlying getAllTasksDue() query, just re-laid out.
  // Per-device preference (localStorage), same as every other view-mode
  // toggle.
  const VIEW_KEY = 'offlog_agenda_view';
  const storedMode = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_KEY) : null;
  let mode: 'list' | 'month' = storedMode === 'month' ? 'month' : 'list';
  function setMode(m: 'list' | 'month') { mode = m; localStorage.setItem(VIEW_KEY, m); }

  const weekStartsMonday = getWeekStartsMonday();
  function toDateStr(d: Date): string {
    return localDateStr(d);
  }
  // A reactive lookup, not a plain function called from the template — a
  // plain `tasksOnDay(day)` call inside {#each monthGridDays as day} only
  // references `tasksOnDay` and `day` in the compiler's eyes, not `all`
  // (that's hidden inside the function body), so the grid silently never
  // re-rendered once `all` loaded async. `$:` makes the `all` dependency
  // explicit.
  let  tasksByDate = __sveltets_2_invalidate(() => all.reduce<Record<string, DueTask[]>>((acc, t) => {
    if (t.due_date) (acc[t.due_date] ??= []).push(t);
    return acc;
  }, {}));

  // Month grid. Each cell shows a priority-colored dot per task always,
  // plus a short title chip on wider viewports only (see .month-titles
  // media query below) — real titles don't survive a narrow column at
  // this density, so month cells never try to fit titles below 700px;
  // tapping a day opens its tasks in the panel below the grid instead,
  // same interaction on every platform.
  let monthOffset = 0;
  let selectedDay: string | null = null;
  const DOW_MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOW_SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let  orderedDayNames = __sveltets_2_invalidate(() => weekStartsMonday ? DOW_MONDAY_FIRST : DOW_SUNDAY_FIRST);
  let  monthAnchor = __sveltets_2_invalidate(() => (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  })());
  let  monthLabel = __sveltets_2_invalidate(() => monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  let  monthLeadDays = __sveltets_2_invalidate(() => daysSinceWeekStart(monthAnchor, weekStartsMonday));
  let  monthDaysInMonth = __sveltets_2_invalidate(() => new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate());
  let  monthGridLength = __sveltets_2_invalidate(() => Math.ceil((monthLeadDays + monthDaysInMonth) / 7) * 7);
  let  monthGridStart = __sveltets_2_invalidate(() => (() => {
    const d = new Date(monthAnchor);
    d.setDate(d.getDate() - monthLeadDays);
    return d;
  })());
  let  monthGridDays = __sveltets_2_invalidate(() => Array.from({ length: monthGridLength }, (_, i) => {
    const d = new Date(monthGridStart);
    d.setDate(d.getDate() + i);
    return d;
  }));
  function inCurrentMonth(d: Date): boolean { return d.getMonth() === monthAnchor.getMonth(); }
  function monthPrev() { monthOffset -= 1; }
  function monthNext() { monthOffset += 1; }
  function goToTodayMonth() { monthOffset = 0; selectedDay = today; }
  function toggleSelectedDay(dStr: string) { selectedDay = selectedDay === dStr ? null : dStr; }
  // "Add card" in the day panel — QuickAdd (opened at the App level)
  // prefills its due date from this, same as any other Quick Add open.
  // Accepts null because the call site reads `selectedDay` inside an
  // {#if selectedDay} block -- true at runtime, but Svelte can't narrow a
  // template guard into an event-handler closure, so the type stays
  // string|null there. Guarding here is honest; asserting non-null at the
  // call site would just be hiding it.
  function addCardOnDay(dStr: string | null) { if (dStr) dispatch('addTask', dStr); }

  function startOfWeek(): string {
    const d = new Date();
    d.setDate(d.getDate() - daysSinceWeekStart(d, weekStartsMonday));
    return localDateStr(d);
  }

  function endOfWeek(): string {
    const d = new Date();
    d.setDate(d.getDate() + (6 - daysSinceWeekStart(d, weekStartsMonday)));
    return localDateStr(d);
  }

  async function load() { all = await getAllTasksDue(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    const dayTimer = setInterval(refreshToday, DAY_ROLLOVER_CHECK_MS);
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      unsub();
      clearInterval(dayTimer);
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  });

  let  overdue   = __sveltets_2_invalidate(() => all.filter(t => t.due_date! < today));
  let  dueToday  = __sveltets_2_invalidate(() => all.filter(t => t.due_date === today));
  let  thisWeek  = __sveltets_2_invalidate(() => all.filter(t => t.due_date! > today && t.due_date! <= endOfWeek()));
  let  later     = __sveltets_2_invalidate(() => all.filter(t => t.due_date! > endOfWeek()));

  function openDetail(t: DueTask) {
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

  async function markDone(t: DueTask) {
    const proj = $projects.find(p => p._id === t.project_id);
    if (!proj) return;
    const lastCol = proj.columns.at(-1)?.id;
    if (!lastCol || t.column_id === lastCol) return;
    try {
      await updateTask(t._id!, { column_id: lastCol });
      await load();
      hapticToggle();
    } catch {
      showError('Failed to update task. Please try again.');
    }
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`deadlines`,});
   { svelteHTML.createElement("div", { "class":`dl-header`,});
     { svelteHTML.createElement("button", {     "class":`hamburger`,"on:click":() => dispatch('menu'),"aria-label":`Menu`,});
       { svelteHTML.createElement("svg", {             "viewBox":`0 0 20 20`,"width":`20`,"height":`20`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,});
          { svelteHTML.createElement("line", {       "x1":`3`,"y1":`5`,"x2":`17`,"y2":`5`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`10`,"x2":`17`,"y2":`10`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`15`,"x2":`17`,"y2":`15`,});}
       }
     }
     { svelteHTML.createElement("div", { "class":`title-block`,});
       { svelteHTML.createElement("h1", { "class":`dl-title`,});  }
       { svelteHTML.createElement("span", { "class":`dl-count`,});all.length; all.length === 1 ? '' : 's';    }
     }
     { svelteHTML.createElement("div", { "class":`dl-header-actions`,});
      
       { svelteHTML.createElement("button", {       "class":`palette-btn`,"on:click":() => dispatch('search'),"title":`Command Palette (Ctrl+K)`,"aria-label":`Command Palette (Ctrl+K)`,});
         { svelteHTML.createElement("svg", {               "viewBox":`0 0 24 24`,"width":`15`,"height":`15`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`2.1`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
            { svelteHTML.createElement("path", { "d":`M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z`,});}
         }
       }
       { svelteHTML.createElement("div", { "class":`mode-toggle`,});
         { svelteHTML.createElement("button", {    "class":`mode-btn`,"on:click":() => setMode('list'),});mode === 'list';  }
         { svelteHTML.createElement("button", {    "class":`mode-btn`,"on:click":() => setMode('month'),});mode === 'month';  }
       }
     }
   }

  if(mode === 'month'){
     { svelteHTML.createElement("div", { "class":`month-nav`,});
       { svelteHTML.createElement("div", { "class":`month-nav-center`,});
         { svelteHTML.createElement("button", {     "class":`cal-nav-btn`,"on:click":monthPrev,"aria-label":`Previous month`,});  }
         { svelteHTML.createElement("span", { "class":`cal-label`,});monthLabel; }
         { svelteHTML.createElement("button", {     "class":`cal-nav-btn`,"on:click":monthNext,"aria-label":`Next month`,});  }
       }
      if(monthOffset !== 0){
         { svelteHTML.createElement("button", {   "class":`month-today-btn`,"on:click":goToTodayMonth,});  }
      }
     }
     { svelteHTML.createElement("div", { "class":`month-scroll`,});
       { svelteHTML.createElement("div", { "class":`month-grid`,});
          for(let dow of __sveltets_2_ensureArray(orderedDayNames)){ { svelteHTML.createElement("div", { "class":`month-dow`,});dow; }}
           for(let day of __sveltets_2_ensureArray(monthGridDays)){day.toISOString();
          const dStr = toDateStr(day);
          const dayTasks = tasksByDate[dStr] ?? [];
           { svelteHTML.createElement("button", {        "class":`month-cell`,"on:click":() => toggleSelectedDay(dStr),});dStr === today;!inCurrentMonth(day);dStr === selectedDay;
             { svelteHTML.createElement("div", { "class":`month-daynum-row`,});
               { svelteHTML.createElement("span", { "class":`month-daynum`,});day.getDate(); }
              if(dayTasks.length){
                 { svelteHTML.createElement("span", { "class":`month-dots`,});
                     for(let t of __sveltets_2_ensureArray((dayTasks.slice(0, 4)))){t._id;
                     { svelteHTML.createElement("span", {   "class":`month-dot`,"style":`background:${PRIO_COLOR[t.priority]}`,}); }
                  }
                 }
              }
             }
            if(dayTasks.length){
               { svelteHTML.createElement("span", { "class":`month-titles`,});
                   for(let t of __sveltets_2_ensureArray((dayTasks.slice(0, 2)))){t._id;
                   { svelteHTML.createElement("span", { "class":`month-title-chip`,});t.title; }
                }
                if(dayTasks.length > 2){ { svelteHTML.createElement("span", { "class":`month-more`,}); dayTasks.length - 2;  }}
               }
            }
           }
        }
       }
      if(selectedDay){
         { svelteHTML.createElement("div", {   "class":`month-day-panel`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 160 })));
           { svelteHTML.createElement("div", { "class":`month-day-panel-head`,});
             { svelteHTML.createElement("span", {});new Date(selectedDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
             { svelteHTML.createElement("button", {     "class":`month-day-close`,"on:click":() => selectedDay = null,"aria-label":`Close`,});  }
           }
          if((tasksByDate[selectedDay] ?? []).length === 0){
             { svelteHTML.createElement("div", { "class":`empty`,});     }
          }else{
               for(let t of __sveltets_2_ensureArray(tasksByDate[selectedDay])){t._id;
               { svelteHTML.createElement("div", {               "class":`task-row`,"style":`--prio-color:${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],"role":`button`,"tabindex":0,"on:click":() => openDetail(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } },});
                 { svelteHTML.createElement("button", {       "class":`circle`,"on:click":() => markDone(t),"title":`Mark done`,"aria-label":`Mark done`,}); }
                 { svelteHTML.createElement("div", { "class":`task-body`,});
                   { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                   { svelteHTML.createElement("span", { "class":`proj-badge`,});t.project_name ?? '—'; }
                 }
               }
            }
          }
           { svelteHTML.createElement("button", {   "class":`month-add-card-btn`,"on:click":() => addCardOnDay(selectedDay),});
             { svelteHTML.createElement("svg", {             "viewBox":`0 0 16 16`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`2`,"stroke-linecap":`round`,});
                { svelteHTML.createElement("line", {       "x1":`8`,"y1":`2`,"x2":`8`,"y2":`14`,});}  { svelteHTML.createElement("line", {       "x1":`2`,"y1":`8`,"x2":`14`,"y2":`8`,});}
             }
             
           }
         }
      }
     }
  }else{
   { svelteHTML.createElement("div", { "class":`dl-body`,});
    if(all.length === 0){
       { svelteHTML.createElement("div", { "class":`empty`,});        }
    }else{

      if(overdue.length){
         { svelteHTML.createElement("section", {});
           { svelteHTML.createElement("div", { "class":`group-label overdue-label`,});  { svelteHTML.createElement("span", { "class":`badge-count`,});overdue.length; } }
             for(let t of __sveltets_2_ensureArray(overdue)){t._id;
             { svelteHTML.createElement("div", {               "class":`task-row`,"style":`--prio-color:${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],"role":`button`,"tabindex":0,"on:click":() => openDetail(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } },});
               { svelteHTML.createElement("button", {       "class":`circle`,"on:click":() => markDone(t),"title":`Mark done`,"aria-label":`Mark done`,}); }
               { svelteHTML.createElement("div", { "class":`task-body`,});
                 { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                 { svelteHTML.createElement("span", { "class":`proj-badge`,});t.project_name ?? '—'; }
               }
               { svelteHTML.createElement("span", { "class":`due-chip overdue`,});dueLabelLong(t.due_date!); }
             }
          }
         }
      }

      if(dueToday.length){
         { svelteHTML.createElement("section", {});
           { svelteHTML.createElement("div", { "class":`group-label today-label`,});  { svelteHTML.createElement("span", { "class":`badge-count`,});dueToday.length; } }
             for(let t of __sveltets_2_ensureArray(dueToday)){t._id;
             { svelteHTML.createElement("div", {               "class":`task-row`,"style":`--prio-color:${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],"role":`button`,"tabindex":0,"on:click":() => openDetail(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } },});
               { svelteHTML.createElement("button", {       "class":`circle`,"on:click":() => markDone(t),"title":`Mark done`,"aria-label":`Mark done`,}); }
               { svelteHTML.createElement("div", { "class":`task-body`,});
                 { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                 { svelteHTML.createElement("span", { "class":`proj-badge`,});t.project_name ?? '—'; }
               }
               { svelteHTML.createElement("span", { "class":`due-chip today`,});  }
             }
          }
         }
      }

      if(thisWeek.length){
         { svelteHTML.createElement("section", {});
           { svelteHTML.createElement("div", { "class":`group-label week-label`,});   { svelteHTML.createElement("span", { "class":`badge-count`,});thisWeek.length; } }
             for(let t of __sveltets_2_ensureArray(thisWeek)){t._id;
             { svelteHTML.createElement("div", {               "class":`task-row`,"style":`--prio-color:${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],"role":`button`,"tabindex":0,"on:click":() => openDetail(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } },});
               { svelteHTML.createElement("button", {       "class":`circle`,"on:click":() => markDone(t),"title":`Mark done`,"aria-label":`Mark done`,}); }
               { svelteHTML.createElement("div", { "class":`task-body`,});
                 { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                 { svelteHTML.createElement("span", { "class":`proj-badge`,});t.project_name ?? '—'; }
               }
               { svelteHTML.createElement("span", { "class":`due-chip week`,});dueRelative(t.due_date!);  dueDateShort(t.due_date!); }
             }
          }
         }
      }

      if(later.length){
         { svelteHTML.createElement("section", {});
           { svelteHTML.createElement("div", { "class":`group-label later-label`,});  { svelteHTML.createElement("span", { "class":`badge-count`,});later.length; } }
             for(let t of __sveltets_2_ensureArray(later)){t._id;
             { svelteHTML.createElement("div", {               "class":`task-row`,"style":`--prio-color:${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],"role":`button`,"tabindex":0,"on:click":() => openDetail(t),"on:keydown":(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t); } },});
               { svelteHTML.createElement("button", {       "class":`circle`,"on:click":() => markDone(t),"title":`Mark done`,"aria-label":`Mark done`,}); }
               { svelteHTML.createElement("div", { "class":`task-body`,});
                 { svelteHTML.createElement("span", { "class":`task-title`,});t.title; }
                 { svelteHTML.createElement("span", { "class":`proj-badge`,});t.project_name ?? '—'; }
               }
               { svelteHTML.createElement("span", { "class":`due-chip later`,});dueLabelLong(t.due_date!); }
             }
          }
         }
      }

    }
   }
  }
 }

if(detailTask && detailProject){
  detailTask._id + ':' + detailOpenSession; {
     { const $$_liateDdraC0C = __sveltets_2_ensureComponent(CardDetail); const $$_liateDdraC0 = new $$_liateDdraC0C({ target: __sveltets_2_any(), props: {         "task":detailTask,"project":detailProject,}});$$_liateDdraC0.$on("close", async () => { detailTask = null; detailProject = null; await load(); });$$_liateDdraC0.$on("openRelated", (e) => openRelatedTask(e.detail));}
  }
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ menu: void; search: void; addTask: string }>()} }}
const DeadlinesView__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type DeadlinesView__SvelteComponent_ = InstanceType<typeof DeadlinesView__SvelteComponent_>;
/*Ωignore_endΩ*/export default DeadlinesView__SvelteComponent_;