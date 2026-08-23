///<reference types="svelte" />
;
import { createEventDispatcher, onMount, onDestroy } from 'svelte';
import { fly, fade } from 'svelte/transition';
import { panelFly, scrimFade, popScale } from './motion';
import { createSpace, updateSpace, reorderSpaces, deleteSpace, getSpaces, subscribe, findSpacesByName } from './db';
import { showError } from './store';
import { confirmAction } from './confirm';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import type { SpaceDoc } from './types';
import { SPACE_ICONS, DEFAULT_SPACE_ICON_KEY, getSpaceIconSvg } from './spaceIcons';
function $$render() {

  
  
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let items: SpaceDoc[] = [];
  let editingId: string | null = null;
  let editingName = '';
  let newName = '';
  let newColor = '#6366f1';
  let newIcon = DEFAULT_SPACE_ICON_KEY;
  let adding = false;
  // Owner-requested (2026-07-20) duplicate-name nudge — never blocks, see
  // db.ts's findSpacesByName() for the full reasoning.
  let duplicateSpaceHint = '';
  async function checkSpaceNameDuplicate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) { duplicateSpaceHint = ''; return; }
    const matches = await findSpacesByName(trimmed);
    duplicateSpaceHint = matches.length ? `A space named "${trimmed}" already exists.` : '';
  }

  // 'new' for the not-yet-created row, or a space's own _id — only one
  // icon picker open at a time, closed on any outside click.
  let iconPickerFor: string | null = null;
  function toggleIconPicker(id: string) { iconPickerFor = iconPickerFor === id ? null : id; }
  function onDocClick(e: MouseEvent) {
    if (iconPickerFor && !(e.target as HTMLElement).closest('.icon-picker-wrap')) iconPickerFor = null;
  }
  onMount(() => document.addEventListener('click', onDocClick, true));
  onDestroy(() => document.removeEventListener('click', onDocClick, true));

  async function setIcon(s: SpaceDoc, icon: string) {
    iconPickerFor = null;
    try {
      await updateSpace(s._id, { icon });
    } catch {
      showError('Failed to change space icon. Please try again.');
    }
  }

  async function load() { items = await getSpaces(); }

  onMount(() => {
    load();
    const unsub = subscribe(() => load());
    return unsub;
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (editingId) editingId = null; else requestClose(); }
  }

  function startEdit(s: SpaceDoc) { editingId = s._id; editingName = s.name; }

  async function saveEdit(s: SpaceDoc) {
    const name = editingName.trim();
    editingId = null;
    if (!name || name === s.name) return;
    try {
      await updateSpace(s._id, { name });
    } catch {
      showError('Failed to rename space. Please try again.');
    }
  }

  async function setColor(s: SpaceDoc, color: string) {
    try {
      await updateSpace(s._id, { color });
    } catch {
      showError('Failed to recolor space. Please try again.');
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await reorderSpaces(reordered.map(s => s._id));
    } catch {
      showError('Failed to reorder spaces. Please try again.');
    }
  }

  async function remove(s: SpaceDoc) {
    if (!(await confirmAction(`Delete space "${s.name}"? Its projects will move to Unsorted.`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteSpace(s._id);
    } catch (e: any) {
      showError('Failed to delete space. Please try again.');
    }
  }

  // Same real race found in Sidebar.svelte's project-add flow
  // (2026-07-20): Escape can also blur the input, and blur fires its own
  // submit independently of the Escape keydown handler's cancel — whichever
  // the browser runs first, the other still executes after. Set before
  // cancelling so a genuine cancel always wins over a same-tick blur-submit.
  let cancellingAddSpace = false;

  async function addSpace() {
    if (cancellingAddSpace) return;
    const name = newName.trim();
    if (!name) { adding = false; return; }
    try {
      await createSpace(name, newColor, newIcon);
      newName = '';
      newColor = '#6366f1';
      newIcon = DEFAULT_SPACE_ICON_KEY;
    } catch {
      showError('Failed to create space. Please try again.');
    }
    adding = false;
    duplicateSpaceHint = '';
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

   { svelteHTML.createElement("div", { "class":`item-list`,});
        for(let s of __sveltets_2_ensureArray(items)){let i = 1;s._id;
       { svelteHTML.createElement("div", { "class":`row`,});
         { svelteHTML.createElement("label", {   "class":`swatch-wrap`,"title":`Change color`,});
           { svelteHTML.createElement("input", {      "type":`color`,"value":s.color,"on:change":(e) => setColor(s, (e.target as HTMLInputElement).value),});}
           { svelteHTML.createElement("span", {   "class":`swatch`,"style":`background:${s.color}`,}); }
         }

         { svelteHTML.createElement("div", { "class":`icon-picker-wrap`,});
           { svelteHTML.createElement("button", {         "type":`button`,"class":`icon-btn`,"title":`Change icon`,"aria-label":`Change icon`,"on:click":() => toggleIconPicker(s._id),});
             getSpaceIconSvg(s);
           }
          if(iconPickerFor === s._id){
             { svelteHTML.createElement("div", {   "class":`icon-picker`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 4, duration: popScale.duration, easing: popScale.easing })));
                 for(let opt of __sveltets_2_ensureArray(SPACE_ICONS)){opt.key;
                 { svelteHTML.createElement("button", {        "type":`button`,"class":`icon-opt`,"title":opt.key,"on:click":() => setIcon(s, opt.key),});(s.icon ?? DEFAULT_SPACE_ICON_KEY) === opt.key;
                   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${opt.svg}</svg>`;
                 }
              }
             }
          }
         }

        if(editingId === s._id){
          
           { svelteHTML.createElement("input", {          "class":`name-input`,"autofocus":true,"bind:value":editingName,"on:keydown":(e) => { if (e.key === 'Enter') saveEdit(s); if (e.key === 'Escape') editingId = null; },"on:blur":() => saveEdit(s),});/*Ωignore_startΩ*/() => editingName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
        }else{
           { svelteHTML.createElement("button", {   "class":`name-btn`,"on:click":() => startEdit(s),});s.name; }
        }

         { svelteHTML.createElement("div", { "class":`reorder-btns`,});
           { svelteHTML.createElement("button", {        "on:click":() => move(i, -1),"disabled":i === 0,"aria-label":`Move up`,"title":`Move up`,});  }
           { svelteHTML.createElement("button", {        "on:click":() => move(i, 1),"disabled":i === items.length - 1,"aria-label":`Move down`,"title":`Move down`,});  }
         }

        if(s._id !== 'space:unsorted'){
           { svelteHTML.createElement("button", {       "class":`delete-btn`,"on:click":() => remove(s),"title":`Delete space`,"aria-label":`Delete space`,});  }
        }
       }
    }

    if(adding){
       { svelteHTML.createElement("div", { "class":`row new-row`,});
         { svelteHTML.createElement("label", {   "class":`swatch-wrap`,"title":`Pick a color`,});
           { svelteHTML.createElement("input", {    "type":`color`,"bind:value":newColor,});/*Ωignore_startΩ*/() => newColor = __sveltets_2_any(null);/*Ωignore_endΩ*/}
           { svelteHTML.createElement("span", {   "class":`swatch`,"style":`background:${newColor}`,}); }
         }
         { svelteHTML.createElement("div", { "class":`icon-picker-wrap`,});
           { svelteHTML.createElement("button", {         "type":`button`,"class":`icon-btn`,"title":`Change icon`,"aria-label":`Change icon`,"on:click":() => toggleIconPicker('new'),});
             `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${SPACE_ICONS.find(i => i.key === newIcon)!.svg}</svg>`;
           }
          if(iconPickerFor === 'new'){
             { svelteHTML.createElement("div", {   "class":`icon-picker`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 4, duration: popScale.duration, easing: popScale.easing })));
                 for(let opt of __sveltets_2_ensureArray(SPACE_ICONS)){opt.key;
                 { svelteHTML.createElement("button", {        "type":`button`,"class":`icon-opt`,"title":opt.key,"on:click":() => { newIcon = opt.key; iconPickerFor = null; },});newIcon === opt.key;
                   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${opt.svg}</svg>`;
                 }
              }
             }
          }
         }
        
         { svelteHTML.createElement("input", {              "class":`name-input`,"autofocus":true,"placeholder":`Space name…`,"bind:value":newName,"on:input":() => checkSpaceNameDuplicate(newName),"on:keydown":(e) => { if (e.key === 'Enter') addSpace(); if (e.key === 'Escape') { cancellingAddSpace = true; adding = false; duplicateSpaceHint = ''; } },"on:blur":addSpace,});/*Ωignore_startΩ*/() => newName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
       }
      if(duplicateSpaceHint){ { svelteHTML.createElement("p", { "class":`dup-name-hint`,});duplicateSpaceHint; }}
    }else{
       { svelteHTML.createElement("button", {   "class":`add-btn`,"on:click":() => { adding = true; newName = ''; newColor = '#6366f1'; cancellingAddSpace = false; },});   }
    }
   }
 }}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void }>()} }}
const SpaceManager__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type SpaceManager__SvelteComponent_ = InstanceType<typeof SpaceManager__SvelteComponent_>;
/*Ωignore_endΩ*/export default SpaceManager__SvelteComponent_;