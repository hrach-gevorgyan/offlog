///<reference types="svelte" />
;
import { createEventDispatcher, onMount } from 'svelte';
import { fade } from 'svelte/transition';
import { searchPop, scrimFade } from './motion';
import { searchAllTasks, type TaskSearchMatch } from './db';
import { projects } from './store';
import type { TaskDoc, ProjectDoc } from './types';
import type { Command } from './commands';
import { PRIORITY_COLOR, PRIORITY_LABEL } from './constants';
import { closeOnBack, discardTop } from './modalStack';
import { trapFocus } from './focusTrap';
import { localDateStr, escapeHtml } from './utils';
function $$render() {
/*Ωignore_startΩ*/;let $projects = __sveltets_2_store_get(projects);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  
  

   let commands: Command[] = []/*Ωignore_startΩ*/;commands = __sveltets_2_any(commands);/*Ωignore_endΩ*/;

  const dispatch = createEventDispatcher<{ open: { task: TaskDoc; project: ProjectDoc }; close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let query = '';
  let results: (TaskDoc & { project_name: string; matchedIn: TaskSearchMatch })[] = [];
  let searching = false;
  let inputEl: HTMLInputElement;
  let selectedIdx = 0;

  onMount(() => { inputEl?.focus(); });

  // Same plain substring matching as searchAllTasks() (db.ts) — no fuzzy
  // library, kept consistent with the rest of the app's search.
  let  matchingCommands = __sveltets_2_invalidate(() => query.trim()
    ? commands.filter(c => (c.label + ' ' + c.keywords).toLowerCase().includes(query.trim().toLowerCase()))
    : commands);
  // Commands and task results share one keyboard-navigable list —
  // commands first since they're instant actions, tasks below.
  let  combinedLength = __sveltets_2_invalidate(() => matchingCommands.length + results.length);

  let debounce: ReturnType<typeof setTimeout> | undefined;
  ;() => {$: {
    clearTimeout(debounce);
    if (query.trim().length >= 1) {
      searching = true;
      debounce = setTimeout(async () => {
        results = await searchAllTasks(query);
        selectedIdx = 0;
        searching = false;
      }, 180);
    } else {
      results = [];
      selectedIdx = 0;
      searching = false;
    }
  }}

  function openResult(r: TaskDoc & { project_name: string }) {
    const proj = $projects.find(p => p._id === r.project_id);
    if (!proj) return;
    // discardTop(), not requestClose() — this search panel is being
    // immediately replaced by the task's CardDetail, not dismissed
    // outright. See modalStack.ts's discardTop() comment for why routing
    // this through history.back() races the CardDetail that's about to
    // mount and push its own entry.
    discardTop();
    dispatch('open', { task: r, project: proj });
  }

  function runCommand(c: Command) {
    // discardTop() for commands that open another closeOnBack()-tracked
    // overlay (QuickAdd/Settings/Time Travel/Trash) -- same reasoning as
    // openResult() above: requestClose()'s real history.back() races the
    // new overlay's own pushState and can silently swallow it. Plain
    // requestClose() for everything else (navigation, toggles, Sync Now),
    // which don't open anything and need a real, proper close.
    //
    // Unlike openResult() though, discardTop() alone isn't enough here:
    // openResult()'s dispatch('open', ...) is caught by App.svelte's
    // on:open handler, which explicitly sets showSearch = false itself.
    // Commands have no equivalent payload to piggyback that on, so this
    // dispatches 'close' directly (the same event requestClose()'s
    // popstate→close() chain would eventually dispatch) -- discardTop()
    // already handles the stack/history bookkeeping; this just tells the
    // parent to actually clear showSearch, which nothing else did
    // (2026-07-18: without this, running "Open Time Travel" left the
    // search palette still mounted/visible while it opened
    // underneath it).
    if (c.opensOverlay) { discardTop(); dispatch('close'); }
    else requestClose();
    c.run();
  }

  function selectAt(i: number) {
    if (i < matchingCommands.length) runCommand(matchingCommands[i]);
    else if (results[i - matchingCommands.length]) openResult(results[i - matchingCommands.length]);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { requestClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, combinedLength - 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); }
    if (e.key === 'Enter' && combinedLength > 0) selectAt(selectedIdx);
  }

  // r.title is sync-derived, untrusted data (can arrive from another
  // device) — must be HTML-escaped before the <mark> wrap, not after,
  // since this string is rendered via {@html}. Escaping first then
  // matching against the escaped text keeps offsets correct because
  // escapeHtml() only ever expands '&' '<' '>', never removes/reorders
  // characters the query could span.
  function highlight(text: string, q: string): string {
    const escaped = escapeHtml(text);
    if (!q.trim()) return escaped;
    const re = new RegExp(`(${escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(re, '<mark>$1</mark>');
  }

  const today = localDateStr(new Date());

  // v6.10.0 -- the title itself is always highlighted above, and a tags
  // match already gets its own visible row (result-tags below), so this
  // hint only needs to cover the two matches that would otherwise be
  // invisible: text buried in Notes or a checklist item.
  const MATCH_HINT: Partial<Record<string, string>> = { body: 'Matched in Notes', checklist: 'Matched in Checklist', attachments: 'Matched in an attachment name' };
;
async () => {


 { svelteHTML.createElement("div", {     "class":`scrim`,"on:click":() => requestClose(),});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }

 {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {   "class":`search-panel`,});__sveltets_2_ensureTransition(searchPop(svelteHTML.mapElementTag('div')));
   { svelteHTML.createElement("div", { "class":`search-bar`,});
     { svelteHTML.createElement("svg", {               "class":`search-icon`,"viewBox":`0 0 16 16`,"width":`16`,"height":`16`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,});
        { svelteHTML.createElement("circle", {     "cx":`6.5`,"cy":`6.5`,"r":`4.5`,});}  { svelteHTML.createElement("line", {       "x1":`10.5`,"y1":`10.5`,"x2":`14`,"y2":`14`,});}
     }
     { const $$_input2 = svelteHTML.createElement("input", {          "bind:value":query,"class":`search-input`,"placeholder":`Search tasks or run a command…`,"on:keydown":onKey,});inputEl = $$_input2;/*Ωignore_startΩ*/() => query = __sveltets_2_any(null);/*Ωignore_endΩ*/}
    if(query){
       { svelteHTML.createElement("button", {   "class":`clear-btn`,"on:click":() => { query = ''; inputEl.focus(); },});  }
    }
   }

  
   { svelteHTML.createElement("div", {     "class":`results`,"role":`listbox`,"aria-label":`Commands and search results`,});
    if(matchingCommands.length > 0){
       { svelteHTML.createElement("div", { "class":`section-label`,});  }
          for(let c of __sveltets_2_ensureArray(matchingCommands)){let i = 1;c.id;
        
         { svelteHTML.createElement("div", {              "class":`result-row`,"role":`option`,"aria-selected":i === selectedIdx,"tabindex":-1,"on:click":() => runCommand(c),"on:mouseenter":() => selectedIdx = i,});i === selectedIdx;
           { svelteHTML.createElement("span", { "class":`cmd-icon`,});  }
           { svelteHTML.createElement("div", { "class":`result-body`,});
             { svelteHTML.createElement("span", { "class":`result-title`,}); highlight(c.label, query); }
           }
         }
      }
    }

    if(results.length > 0){
      if(matchingCommands.length > 0){ { svelteHTML.createElement("div", { "class":`section-label`,});  }}
          for(let r of __sveltets_2_ensureArray(results)){let ri = 1;r._id;
        const i = matchingCommands.length + ri;
        
         { svelteHTML.createElement("div", {              "class":`result-row`,"role":`option`,"aria-selected":i === selectedIdx,"tabindex":-1,"on:click":() => openResult(r),"on:mouseenter":() => selectedIdx = i,});i === selectedIdx;
           { svelteHTML.createElement("span", {   "class":`prio-bar`,"style":`background:${PRIORITY_COLOR[r.priority]}`,}); }
           { svelteHTML.createElement("div", { "class":`result-body`,});
             { svelteHTML.createElement("span", { "class":`result-title`,}); highlight(r.title, query); }
            if(r.tags?.length){
               { svelteHTML.createElement("span", { "class":`result-tags`,});r.tags.join(' · '); }
            }
            if(MATCH_HINT[r.matchedIn]){
               { svelteHTML.createElement("span", { "class":`result-match-hint`,});MATCH_HINT[r.matchedIn]; }
            }
           }
           { svelteHTML.createElement("div", { "class":`result-meta`,});
             { svelteHTML.createElement("span", { "class":`result-proj`,});r.project_name; }
            if(r.due_date){
               { svelteHTML.createElement("span", {  "class":`result-due`,});r.due_date < today;r.due_date; }
            }
           }
         }
      }
    }

    if(searching){
       { svelteHTML.createElement("div", { "class":`hint`,}); { svelteHTML.createElement("span", { "class":`spinner`,}); }  }
    } else if (query.trim() && combinedLength === 0){
       { svelteHTML.createElement("div", { "class":`hint hint-empty`,});   query;  }
    }
   }

   { svelteHTML.createElement("div", { "class":`footer`,});
     { svelteHTML.createElement("span", {});  }
     { svelteHTML.createElement("span", {});  }
     { svelteHTML.createElement("span", {});  }
   }
 }}


};
return { props: {commands: commands} as {commands?: Command[]}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ open: { task: TaskDoc; project: ProjectDoc }; close: void }>()} }}
const GlobalSearch__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type GlobalSearch__SvelteComponent_ = InstanceType<typeof GlobalSearch__SvelteComponent_>;
/*Ωignore_endΩ*/export default GlobalSearch__SvelteComponent_;