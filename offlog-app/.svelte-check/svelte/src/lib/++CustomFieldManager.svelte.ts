///<reference types="svelte" />
;
import { createEventDispatcher, onMount } from 'svelte';
import { fly, fade } from 'svelte/transition';
import { panelFly, scrimFade } from './motion';
import { getCustomFieldDefs, addCustomFieldDef, removeCustomFieldDef, updateCustomFieldDef } from './db';
import { showError } from './store';
import { confirmAction } from './confirm';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import CustomSelect from './CustomSelect.svelte';
import type { CustomFieldDef } from './types';
function $$render() {

  
  
  
  
  
  
  
  
  
  

  const dispatch = createEventDispatcher<{ close: void }>();
  const requestClose = closeOnBack(() => dispatch('close'));

  let fields: CustomFieldDef[] = [];
  let newName = '';
  let newType: CustomFieldDef['type'] = 'text';
  let newOptions = '';
  const typeOptions = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Select' },
  ];

  async function load() { fields = await getCustomFieldDefs(); }
  onMount(load);

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const options = newType === 'select' ? newOptions.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    try {
      fields = await addCustomFieldDef(name, newType, options);
      newName = ''; newOptions = ''; newType = 'text';
    } catch {
      showError('Failed to add field. Please try again.');
    }
  }

  async function remove(field: CustomFieldDef) {
    if (!(await confirmAction(`Remove the "${field.name}" field? Existing values on tasks are kept but will no longer be shown.`, { danger: true, confirmLabel: 'Remove' }))) return;
    try {
      fields = await removeCustomFieldDef(field.id);
    } catch {
      showError('Failed to remove field. Please try again.');
    }
  }

  // Owner-reported, 2026-07-24: no way to rename a field or change its
  // type/options after creation — inline edit, same row, rather than a
  // separate modal (this list is already small by design, per the panel's
  // own hint text).
  let editingId: string | null = null;
  let editName = '';
  let editType: CustomFieldDef['type'] = 'text';
  let editOptions = '';

  function startEdit(field: CustomFieldDef) {
    editingId = field.id;
    editName = field.name;
    editType = field.type;
    editOptions = (field.options ?? []).join(', ');
  }
  function cancelEdit() { editingId = null; }

  async function saveEdit(field: CustomFieldDef) {
    const name = editName.trim();
    if (!name) return;
    const options = editType === 'select' ? editOptions.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    try {
      fields = await updateCustomFieldDef(field.id, { name, type: editType, options });
      editingId = null;
    } catch {
      showError('Failed to update field. Please try again.');
    }
  }
;
async () => {

  { svelteHTML.createElement("svelte:window", {  "on:keydown":onWindowKeydown,});}


 { svelteHTML.createElement("div", {     "class":`scrim`,"on:click":() => requestClose(),});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }

 {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {    "class":`panel`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),(panelFly)));
   { svelteHTML.createElement("div", { "class":`panel-head`,});
     { svelteHTML.createElement("span", { "class":`panel-title`,});   }
     { svelteHTML.createElement("button", {   "class":`close-btn`,"on:click":() => requestClose(),});  }
   }

   { svelteHTML.createElement("div", { "class":`cf-sub`,});                 }

   { svelteHTML.createElement("div", { "class":`item-list`,});
    if(fields.length === 0){
       { svelteHTML.createElement("div", { "class":`empty`,});    }
    }else{
         for(let field of __sveltets_2_ensureArray(fields)){field.id;
        if(editingId === field.id){
           { svelteHTML.createElement("div", { "class":`row row-editing`,});
             { svelteHTML.createElement("input", {          "class":`name-input`,"bind:value":editName,"placeholder":`Field name`,"enterkeyhint":`done`,"on:keydown":(e) => e.key === 'Enter' && saveEdit(field),});/*Ωignore_startΩ*/() => editName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
             { svelteHTML.createElement("div", { "class":`type-select`,});
               { const $$_tceleSmotsuC4C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC4 = new $$_tceleSmotsuC4C({ target: __sveltets_2_any(), props: {        "options":typeOptions,"value":editType,"placement":`up`,}});$$_tceleSmotsuC4.$on("change", (e) => editType = e.detail as CustomFieldDef['type']);}
             }
            if(editType === 'select'){
               { svelteHTML.createElement("input", {      "class":`name-input`,"bind:value":editOptions,"placeholder":`Options, comma-separated`,});/*Ωignore_startΩ*/() => editOptions = __sveltets_2_any(null);/*Ωignore_endΩ*/}
            }
             { svelteHTML.createElement("div", { "class":`row-edit-actions`,});
               { svelteHTML.createElement("button", {   "class":`edit-cancel-btn`,"on:click":cancelEdit,});  }
               { svelteHTML.createElement("button", {     "class":`edit-save-btn`,"on:click":() => saveEdit(field),"disabled":!editName.trim(),});  }
             }
           }
        }else{
           { svelteHTML.createElement("div", { "class":`row`,});
             { svelteHTML.createElement("button", {       "class":`row-text row-edit-trigger`,"on:click":() => startEdit(field),"title":`Edit field`,"aria-label":`Edit field ${field.name}`,});
               { svelteHTML.createElement("span", { "class":`name`,});field.name; }
               { svelteHTML.createElement("span", { "class":`type`,});field.type;if(field.type === 'select' && field.options?.length){ field.options.join(', ');} }
             }
             { svelteHTML.createElement("button", {       "class":`delete-btn`,"on:click":() => remove(field),"title":`Remove field`,"aria-label":`Remove field ${field.name}`,});  }
           }
        }
      }
    }
   }

   { svelteHTML.createElement("div", { "class":`add-form`,});
     { svelteHTML.createElement("input", {          "class":`name-input`,"bind:value":newName,"placeholder":`Field name`,"enterkeyhint":`done`,"on:keydown":(e) => e.key === 'Enter' && add(),});/*Ωignore_startΩ*/() => newName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
     { svelteHTML.createElement("div", { "class":`type-select`,});
       { const $$_tceleSmotsuC3C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC3 = new $$_tceleSmotsuC3C({ target: __sveltets_2_any(), props: {        "options":typeOptions,"value":newType,"placement":`up`,}});$$_tceleSmotsuC3.$on("change", (e) => newType = e.detail as CustomFieldDef['type']);}
     }
    if(newType === 'select'){
       { svelteHTML.createElement("input", {      "class":`name-input`,"bind:value":newOptions,"placeholder":`Options, comma-separated`,});/*Ωignore_startΩ*/() => newOptions = __sveltets_2_any(null);/*Ωignore_endΩ*/}
    }
     { svelteHTML.createElement("button", {     "class":`add-btn`,"on:click":add,"disabled":!newName.trim(),});   }
   }
 }}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void }>()} }}
const CustomFieldManager__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type CustomFieldManager__SvelteComponent_ = InstanceType<typeof CustomFieldManager__SvelteComponent_>;
/*Ωignore_endΩ*/export default CustomFieldManager__SvelteComponent_;