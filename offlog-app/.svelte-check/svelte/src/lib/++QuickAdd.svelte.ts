///<reference types="svelte" />
;
import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
import { fade } from 'svelte/transition';
import { quickAddPop, scrimFade, popScale } from './motion';
import { projects, reloadTasks, spaces, showError } from './store';
import { createTask, findTasksByTitleInProject } from './db';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import CustomSelect from './CustomSelect.svelte';
import { parseQuickAdd } from './nlpParse';
import { fmtTime } from './utils';
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);;let $spaces = __sveltets_2_store_get(spaces);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  

  // Set when opened from Month view's "Add card" (a tapped day) — seeds
  // the due date so the new task lands on that day without retyping it.
  // A date phrase the user actually types (parsed.due_date) still wins,
  // same precedence as any other NLP-parsed field overriding a default.
   let initialDueDate: string | null = null/*Ωignore_startΩ*/;initialDueDate = __sveltets_2_any(initialDueDate);/*Ωignore_endΩ*/;

  const dispatch = createEventDispatcher<{ close: void; created: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let title = '';
  let projectId = '';
  let projectManuallyChosen = false;
  let inputEl: HTMLInputElement;
  let saving = false;

  // pick a sensible default project
  ;() => {$: if (!projectId && $projects.length) projectId = $projects[0]._id;}

  let  projectOptions = __sveltets_2_invalidate(() => $projects.map(p => {
    const sp = $spaces.find(s => s._id === p.space_id);
    return { value: p._id, label: p.name, group: sp?.name ?? '' };
  }));

  // Live parse on every keystroke -- pure/cheap regex work, no debounce
  // needed. Only affects the dropdown's *selection*, never removes a
  // project the user picked by hand (projectManuallyChosen below), so
  // typing "@fitness" after already choosing a project from the dropdown
  // doesn't fight the user's explicit choice.
  let  parsed = __sveltets_2_invalidate(() => parseQuickAdd(title, $projects));
  ;() => {$: if (parsed.projectId && !projectManuallyChosen) projectId = parsed.projectId;}
  // A typed date phrase always wins over the prefilled default -- same
  // precedence any other parsed field already has over its own default.
  let  effectiveDueDate = __sveltets_2_invalidate(() => parsed.due_date ?? initialDueDate);

  // Owner-requested (2026-07-20) duplicate-title nudge — never blocks
  // Quick Add's fast create-and-close flow, just a dismissible-by-typing
  // hint. Scoped to the target project only, same reasoning as
  // findTasksByTitleInProject()'s own comment in db.ts.
  let duplicateTitleHint = '';
  let titleCheckTimer: ReturnType<typeof setTimeout> | undefined;
  ;() => {$: { clearTimeout(titleCheckTimer); titleCheckTimer = setTimeout(() => checkTitleDuplicate(parsed.title, projectId), 350); }}
  async function checkTitleDuplicate(t: string, pid: string) {
    if (!t || !pid) { duplicateTitleHint = ''; return; }
    const matches = await findTasksByTitleInProject(pid, t);
    duplicateTitleHint = matches.length ? `A task titled "${t}" already exists in this project.` : '';
  }
  onDestroy(() => clearTimeout(titleCheckTimer));

  function onProjectChange() { projectManuallyChosen = true; }

  const PRIORITY_LABEL: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

  // Syntax cheat-sheet popover -- a lightweight local popover (outside-
  // click + its own Escape handling), not a closeOnBack()-tracked overlay:
  // it's inline help anchored to a button, the same class of UI as
  // CustomSelect's own dropdown, not a real modal blocking the rest of the
  // app. Mirrors CustomSelect.svelte's onWindowClick/Escape pattern.
  let showHelp = false;
  let helpTriggerEl: HTMLButtonElement;
  let helpPanelEl: HTMLDivElement;
  function toggleHelp() { showHelp = !showHelp; }
  function onWindowClickForHelp(e: MouseEvent) {
    if (!showHelp) return;
    const t = e.target as Node;
    if (helpTriggerEl?.contains(t) || helpPanelEl?.contains(t)) return;
    showHelp = false;
  }
  // Escape closes the help popover even when focus isn't in the title
  // input (e.g. it's on the ? button itself) -- the input's own onKey
  // below covers the common case where focus stayed put while typing.
  function onWindowKeyForHelp(e: KeyboardEvent) {
    if (showHelp && e.key === 'Escape') showHelp = false;
  }

  onMount(async () => { await tick(); inputEl?.focus(); });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (showHelp) { showHelp = false; return; } requestClose(); }
    if (e.key === 'Enter') doAdd();
  }

  async function doAdd() {
    const t = parsed.title;
    if (!t || !projectId) return;
    saving = true;
    const proj = $projects.find(p => p._id === projectId);
    if (!proj) { saving = false; return; }
    const firstCol = proj.columns[0].id;
    try {
      await createTask(projectId, proj.space_id, firstCol, t, {
        priority: parsed.priority ?? undefined,
        due_date: effectiveDueDate,
        reminder_at: parsed.reminder_at,
        tags: parsed.tags.length ? parsed.tags : undefined,
      });
      await reloadTasks();
      title = '';
      projectManuallyChosen = false;
      dispatch('created');
      requestClose();
    } catch {
      showError('Failed to create task. Please try again.');
    } finally {
      saving = false;
    }
  }
;
async () => {

 { svelteHTML.createElement("svelte:window", {     "on:click":onWindowClickForHelp,"on:keydown":onWindowKeyForHelp,});}


 { svelteHTML.createElement("div", {     "class":`scrim`,"on:click":() => requestClose(),});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }

 {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {   "class":`panel`,});__sveltets_2_ensureTransition(quickAddPop(svelteHTML.mapElementTag('div')));
   { svelteHTML.createElement("div", { "class":`panel-head`,});
     { svelteHTML.createElement("div", { "class":`panel-title`,});   }
     { const $$_button2 = svelteHTML.createElement("button", {             "class":`help-btn`,"on:click":toggleHelp,"aria-label":`Quick add syntax help`,"aria-expanded":showHelp,"aria-controls":`quickadd-help-panel`,});helpTriggerEl = $$_button2;showHelp;  }
   }

  if(showHelp){
     { const $$_div1 = svelteHTML.createElement("div", {        "id":`quickadd-help-panel`,"class":`help-panel`,"role":`note`,});helpPanelEl = $$_div1;__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),({ duration: popScale.duration, easing: popScale.easing })));
       { svelteHTML.createElement("div", { "class":`help-title`,});            }
       { svelteHTML.createElement("dl", { "class":`help-list`,});
         { svelteHTML.createElement("dt", {});  } { svelteHTML.createElement("dd", {}); { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});   }  { svelteHTML.createElement("code", {});  } }
         { svelteHTML.createElement("dt", {});  } { svelteHTML.createElement("dd", {}); { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  }     }
         { svelteHTML.createElement("dt", {});  } { svelteHTML.createElement("dd", {}); { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  } }
         { svelteHTML.createElement("dt", {});  } { svelteHTML.createElement("dd", {}); { svelteHTML.createElement("code", {});  }       }
         { svelteHTML.createElement("dt", {});  } { svelteHTML.createElement("dd", {}); { svelteHTML.createElement("code", {});  }       }
         { svelteHTML.createElement("dt", {});  } { svelteHTML.createElement("dd", {}); { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  }  { svelteHTML.createElement("code", {});  }           { svelteHTML.createElement("code", {});  }      }
       }
       { svelteHTML.createElement("div", { "class":`help-example`,});        }
     }
  }

   { const $$_input1 = svelteHTML.createElement("input", {            "bind:value":title,"class":`title-input`,"placeholder":`Task title… try “tomorrow 5pm !high #errand @project”`,"enterkeyhint":`done`,"on:keydown":onKey,});inputEl = $$_input1;/*Ωignore_startΩ*/() => title = __sveltets_2_any(null);/*Ωignore_endΩ*/}

  if(parsed.raw){
     { svelteHTML.createElement("div", { "class":`parsed-chips`,});
       { svelteHTML.createElement("span", { "class":`chip chip-raw`,});    }
     }
  } else if (effectiveDueDate || parsed.priority || parsed.tags.length || parsed.matchedProjectLabel){
     { svelteHTML.createElement("div", { "class":`parsed-chips`,});
      if(effectiveDueDate){
         { svelteHTML.createElement("span", { "class":`chip chip-date`,});
          new Date(`${effectiveDueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          if(parsed.reminder_at){ fmtTime(new Date(parsed.reminder_at));}
         }
      }
      if(parsed.priority){ { svelteHTML.createElement("span", { "class":`chip chip-priority`,});PRIORITY_LABEL[parsed.priority]; }}
        for(let tag of __sveltets_2_ensureArray(parsed.tags)){ { svelteHTML.createElement("span", { "class":`chip chip-tag`,}); tag; }}
      if(parsed.matchedProjectLabel){ { svelteHTML.createElement("span", { "class":`chip chip-project`,}); parsed.matchedProjectLabel; }}
     }
  }

  if(duplicateTitleHint){ { svelteHTML.createElement("p", { "class":`dup-name-hint`,});duplicateTitleHint; }}

   { svelteHTML.createElement("div", { "class":`row`,});
     { svelteHTML.createElement("div", { "class":`proj-select-wrap`,});
       { const $$_tceleSmotsuC3C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC3 = new $$_tceleSmotsuC3C({ target: __sveltets_2_any(), props: {        "options":projectOptions,value:projectId,"placement":`up`,}});/*Ωignore_startΩ*/() => projectId = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC3.$$bindings = 'value';$$_tceleSmotsuC3.$on("change", onProjectChange);}
     }

     { svelteHTML.createElement("div", { "class":`actions`,});
       { svelteHTML.createElement("button", {   "class":`cancel-btn`,"on:click":() => requestClose(),});  }
       { svelteHTML.createElement("button", {     "class":`add-btn`,"on:click":doAdd,"disabled":!parsed.title || saving,});
        saving ? 'Adding…' : 'Add task';
       }
     }
   }
 }}


};
return { props: {initialDueDate: initialDueDate} as {initialDueDate?: string | null}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void; created: void }>()} }}
const QuickAdd__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type QuickAdd__SvelteComponent_ = InstanceType<typeof QuickAdd__SvelteComponent_>;
/*Ωignore_endΩ*/export default QuickAdd__SvelteComponent_;