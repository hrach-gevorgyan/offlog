///<reference types="svelte" />
;
import { createEventDispatcher, onMount } from 'svelte';
import { fly, fade } from 'svelte/transition';
import { panelFly, scrimFade } from './motion';
import { getAllDeletedTasks, undoDelete, deleteForever, emptyTrash, subscribe } from './db';
import { reloadTasks, showError } from './store';
import { PRIORITY_COLOR as PRIO_COLOR, PRIORITY_LABEL as PRIO_LABEL } from './constants';
import { confirmAction } from './confirm';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import { timeAgo } from './utils';
import type { TaskDoc } from './types';
function $$render() {

  
  
  
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  type TrashedTask = TaskDoc & { project_name?: string };

  let items: TrashedTask[] = [];
  let emptying = false;
  let restoringAll = false;

  async function load() { items = await getAllDeletedTasks(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  async function restore(id: string) {
    try {
      await undoDelete(id);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to restore task. Please try again.');
    }
  }

  async function removeForever(t: TrashedTask) {
    if (!(await confirmAction(`Permanently delete "${t.title}"? This can't be undone.`, { danger: true, confirmLabel: 'Delete forever' }))) return;
    try {
      await deleteForever(t._id!);
      await load();
    } catch {
      showError('Failed to delete task. Please try again.');
    }
  }

  async function restoreAll() {
    if (!items.length) return;
    if (!(await confirmAction(`Restore all ${items.length} item${items.length === 1 ? '' : 's'} from Recycle?`, { confirmLabel: 'Restore all' }))) return;
    restoringAll = true;
    try {
      for (const t of items) await undoDelete(t._id!);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to restore some tasks. Please try again.');
    } finally {
      restoringAll = false;
    }
  }

  async function emptyAll() {
    if (!items.length) return;
    if (!(await confirmAction(`Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'} in Recycle? This can't be undone.`, { danger: true, confirmLabel: 'Empty Recycle' }))) return;
    emptying = true;
    try {
      await emptyTrash();
      await load();
    } catch {
      showError('Failed to empty Recycle. Please try again.');
    } finally {
      emptying = false;
    }
  }
;
async () => {

  { svelteHTML.createElement("svelte:window", {  "on:keydown":onWindowKeydown,});}


 { svelteHTML.createElement("div", {     "class":`scrim`,"on:click":() => requestClose(),});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }

 {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {    "class":`panel`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),(panelFly)));
   { svelteHTML.createElement("div", { "class":`panel-head`,});
     { svelteHTML.createElement("span", { "class":`panel-title`,});  }
    if(items.length > 0){
       { svelteHTML.createElement("button", {     "class":`restore-all-btn`,"on:click":restoreAll,"disabled":restoringAll || emptying,});restoringAll ? 'Restoring…' : 'Restore all'; }
       { svelteHTML.createElement("button", {     "class":`clear-btn`,"on:click":emptyAll,"disabled":emptying || restoringAll,});emptying ? 'Emptying…' : 'Empty'; }
    }
     { svelteHTML.createElement("button", {   "class":`close-btn`,"on:click":() => requestClose(),});  }
   }

   { svelteHTML.createElement("div", { "class":`rc-sub`,});items.length;  items.length === 1 ? '' : 's';      }

   { svelteHTML.createElement("div", { "class":`item-list`,});
    if(items.length === 0){
       { svelteHTML.createElement("div", { "class":`empty`,});                }
    }else{
       { svelteHTML.createElement("div", { "class":`item-rows`,});
           for(let t of __sveltets_2_ensureArray(items)){t._id;
           { svelteHTML.createElement("div", { "class":`item-row`,});
             { svelteHTML.createElement("span", {     "class":`prio-bar`,"style":`background:${PRIO_COLOR[t.priority]}`,"title":PRIO_LABEL[t.priority],}); }
             { svelteHTML.createElement("div", { "class":`item-main`,});
               { svelteHTML.createElement("span", { "class":`item-title`,});t.title; }
              if(t.project_name){ { svelteHTML.createElement("span", { "class":`item-proj`,});t.project_name; }}
             }
             { svelteHTML.createElement("span", { "class":`item-time`,});timeAgo(t.updated_at); }
             { svelteHTML.createElement("button", {       "class":`restore-btn`,"on:click":() => restore(t._id!),"title":`Restore`,"aria-label":`Restore`,});
               { svelteHTML.createElement("svg", {               "viewBox":`0 0 24 24`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
                  { svelteHTML.createElement("polyline", { "points":`1 4 1 10 7 10`,});}
                  { svelteHTML.createElement("path", { "d":`M3.51 15a9 9 0 1 0 2.13-9.36L1 10`,});}
               }
             }
             { svelteHTML.createElement("button", {       "class":`forever-btn`,"on:click":() => removeForever(t),"title":`Delete forever`,"aria-label":`Delete forever`,});
               { svelteHTML.createElement("svg", {               "viewBox":`0 0 14 14`,"width":`13`,"height":`13`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
                  { svelteHTML.createElement("path", { "d":`M2 4h10M5.5 4V2.5h3V4M3 4l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L11 4`,});}
               }
             }
           }
        }
       }
    }
   }
 }}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void }>()} }}
const TrashView__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type TrashView__SvelteComponent_ = InstanceType<typeof TrashView__SvelteComponent_>;
/*Ωignore_endΩ*/export default TrashView__SvelteComponent_;