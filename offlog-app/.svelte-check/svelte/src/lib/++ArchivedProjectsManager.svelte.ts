///<reference types="svelte" />
;
import { createEventDispatcher, onMount } from 'svelte';
import { fly, fade } from 'svelte/transition';
import { panelFly, scrimFade } from './motion';
import { getProjects, getArchivedProjects, archiveProject, unarchiveProject, deleteProject, subscribe } from './db';
import { reloadTasks, showError } from './store';
import { confirmAction } from './confirm';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import CustomSelect from './CustomSelect.svelte';
import type { ProjectDoc } from './types';
function $$render() {

  
  
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let activeProjects: ProjectDoc[] = [];
  let archivedProjects: ProjectDoc[] = [];
  let pickerId = '';
  let  pickerOptions = __sveltets_2_invalidate(() => [{ value: '', label: 'Choose a project…' }, ...activeProjects.map(p => ({ value: p._id!, label: p.name }))]);

  async function load() {
    [activeProjects, archivedProjects] = await Promise.all([getProjects(), getArchivedProjects()]);
  }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  async function doArchive() {
    if (!pickerId) return;
    const name = activeProjects.find(p => p._id === pickerId)?.name ?? 'this project';
    if (!(await confirmAction(`Archive project "${name}"? It'll be hidden until restored here.`, { confirmLabel: 'Archive' }))) return;
    try {
      await archiveProject(pickerId);
      pickerId = '';
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to archive project. Please try again.');
    }
  }

  async function doRestore(id: string) {
    try {
      await unarchiveProject(id);
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to restore project. Please try again.');
    }
  }

  async function doDelete(id: string, name: string) {
    if (!(await confirmAction(`Delete project "${name}" and all its tasks? This can't be undone.`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteProject(id);
      await load();
      await reloadTasks();
    } catch {
      showError('Failed to delete project. Please try again.');
    }
  }
;
async () => {

  { svelteHTML.createElement("svelte:window", {  "on:keydown":onWindowKeydown,});}


 { svelteHTML.createElement("div", {     "class":`scrim`,"on:click":() => requestClose(),});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }

 {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {    "class":`panel`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),(panelFly)));
   { svelteHTML.createElement("div", { "class":`panel-head`,});
     { svelteHTML.createElement("span", { "class":`panel-title`,});  }
     { svelteHTML.createElement("button", {   "class":`close-btn`,"on:click":() => requestClose(),});  }
   }

   { svelteHTML.createElement("div", { "class":`ap-sub`,});            }

   { svelteHTML.createElement("div", { "class":`item-list`,});
     { svelteHTML.createElement("div", { "class":`picker-row`,});
       { svelteHTML.createElement("div", { "class":`picker-select`,});
         { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {    "options":pickerOptions,value:pickerId,}});/*Ωignore_startΩ*/() => pickerId = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_tceleSmotsuC4.$$bindings = 'value';}
       }
       { svelteHTML.createElement("button", {     "class":`archive-btn`,"on:click":doArchive,"disabled":!pickerId,});  }
     }

    if(archivedProjects.length === 0){
       { svelteHTML.createElement("div", { "class":`empty`,});    }
    }else{
         for(let p of __sveltets_2_ensureArray(archivedProjects)){p._id;
         { svelteHTML.createElement("div", { "class":`row`,});
           { svelteHTML.createElement("span", { "class":`name`,});p.name; }
           { svelteHTML.createElement("button", {   "class":`restore-btn`,"on:click":() => doRestore(p._id),});  }
           { svelteHTML.createElement("button", {       "class":`delete-btn`,"title":`Delete project`,"aria-label":`Delete project ${p.name}`,"on:click":() => doDelete(p._id, p.name),});  }
         }
      }
    }
   }
 }}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void }>()} }}
const ArchivedProjectsManager__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type ArchivedProjectsManager__SvelteComponent_ = InstanceType<typeof ArchivedProjectsManager__SvelteComponent_>;
/*Ωignore_endΩ*/export default ArchivedProjectsManager__SvelteComponent_;