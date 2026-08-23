///<reference types="svelte" />
;
import { createEventDispatcher, onMount } from 'svelte';
import { fly, fade } from 'svelte/transition';
import { panelFly, scrimFade } from './motion';
import { getTagCounts, renameTag, deleteTagEverywhere, getTagColorOverrides, setTagColor, subscribe } from './db';
import { reloadTasks, showError } from './store';
import { confirmAction } from './confirm';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import { TAG_PALETTE, resolveTagColor } from './tagColors';
function $$render() {

  
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let items: { tag: string; count: number }[] = [];
  let editingTag: string | null = null;
  let editingName = '';
  let overrides: Record<string, string> = {};
  let openPicker: string | null = null;

  async function load() {
    items = await getTagCounts();
    overrides = await getTagColorOverrides();
  }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (openPicker) openPicker = null; else if (editingTag) editingTag = null; else requestClose(); }
  }

  async function pickColor(tag: string, color: string | null) {
    openPicker = null;
    try {
      await setTagColor(tag, color);
      await load();
    } catch {
      showError('Failed to update tag color. Please try again.');
    }
  }

  function startEdit(tag: string) { editingTag = tag; editingName = tag; }

  async function saveEdit(tag: string) {
    const next = editingName.trim().toLowerCase().replace(/\s+/g, '-');
    editingTag = null;
    if (!next || next === tag) return;
    try {
      await renameTag(tag, next);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to rename tag. Please try again.');
    }
  }

  async function remove(tag: string, count: number) {
    if (!(await confirmAction(`Remove tag "${tag}" from ${count} task${count === 1 ? '' : 's'}? This can't be undone.`, { danger: true, confirmLabel: 'Remove' }))) return;
    try {
      await deleteTagEverywhere(tag);
      await reloadTasks();
      await load();
    } catch {
      showError('Failed to delete tag. Please try again.');
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

   { svelteHTML.createElement("div", { "class":`tg-sub`,});         }

   { svelteHTML.createElement("div", { "class":`item-list`,});
    if(items.length === 0){
       { svelteHTML.createElement("div", { "class":`empty`,});           }
    }else{
         for(let { tag, count } of __sveltets_2_ensureArray(items)){tag;
         { svelteHTML.createElement("div", { "class":`row`,});
           { svelteHTML.createElement("button", {           "class":`color-dot`,"style":`background:${resolveTagColor(tag, overrides)}`,"title":`Change color for tag ${tag}`,"aria-label":`Change color for tag ${tag}`,"on:click":() => openPicker = openPicker === tag ? null : tag,}); }
          if(editingTag === tag){
            
             { svelteHTML.createElement("input", {          "class":`name-input`,"autofocus":true,"bind:value":editingName,"on:keydown":(e) => { if (e.key === 'Enter') saveEdit(tag); if (e.key === 'Escape') editingTag = null; },"on:blur":() => saveEdit(tag),});/*Ωignore_startΩ*/() => editingName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
          }else{
             { svelteHTML.createElement("button", {   "class":`name-btn`,"on:click":() => startEdit(tag),});tag; }
          }
           { svelteHTML.createElement("span", { "class":`count`,});count; }
           { svelteHTML.createElement("button", {       "class":`delete-btn`,"on:click":() => remove(tag, count),"title":`Delete tag`,"aria-label":`Delete tag ${tag}`,});  }
         }
        if(openPicker === tag){
           { svelteHTML.createElement("div", { "class":`swatch-row`,});
              for(let c of __sveltets_2_ensureArray(TAG_PALETTE)){
               { svelteHTML.createElement("button", {            "class":`swatch`,"style":`background:${c}`,"title":c,"aria-label":`Set tag ${tag} color to ${c}`,"on:click":() => pickColor(tag, c),});overrides[tag] === c; }
            }
             { svelteHTML.createElement("button", {       "class":`swatch-auto`,"on:click":() => pickColor(tag, null),"title":`Use automatic color`,"aria-label":`Use automatic color for tag ${tag}`,});  }
           }
        }
      }
    }
   }
 }}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void }>()} }}
const TagManager__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type TagManager__SvelteComponent_ = InstanceType<typeof TagManager__SvelteComponent_>;
/*Ωignore_endΩ*/export default TagManager__SvelteComponent_;