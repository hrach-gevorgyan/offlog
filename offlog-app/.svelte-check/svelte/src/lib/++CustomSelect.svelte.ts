///<reference types="svelte" />
;
import { createEventDispatcher, tick } from 'svelte';
import { fly } from 'svelte/transition';
import { popScale } from './motion';
function $$render() {

  
  
  

  // Native <select> renders as the bare OS picker on Android (a plain list
  // in a system sheet, no app styling at all) — jarring next to every other
  // overlay in the app, which is a themed panel. This is a themed dropdown
  // that looks and behaves the same on every platform. Keyboard-navigable
  // (Up/Down/Enter/Escape) and closes on an outside click; Escape here
  // stops propagation so it only closes this popover, not a parent modal
  // it happens to be opened inside of.
   let options: { value: string; label: string; group?: string }[] = []/*Ωignore_startΩ*/;options = __sveltets_2_any(options);/*Ωignore_endΩ*/;
   let value: string/*Ωignore_startΩ*/;value = __sveltets_2_any(value);/*Ωignore_endΩ*/;
   let placeholder = 'Select…';
   let placement: 'up' | 'down' = 'down'/*Ωignore_startΩ*/;placement = __sveltets_2_any(placement);/*Ωignore_endΩ*/;
   let disabled = false/*Ωignore_startΩ*/;disabled = __sveltets_2_any(disabled);/*Ωignore_endΩ*/;

  const dispatch = createEventDispatcher<{ change: string }>();

  let open = false;
  let triggerEl: HTMLButtonElement;
  let panelEl: HTMLDivElement;
  let highlighted = 0;

  let  selected = __sveltets_2_invalidate(() => options.find(o => o.value === value));
  let  grouped = __sveltets_2_invalidate(() => groupOptions(options));

  function groupOptions(opts: typeof options): [string, typeof options][] {
    const groups = new Map<string, typeof options>();
    for (const o of opts) {
      const g = o.group ?? '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(o);
    }
    return [...groups.entries()];
  }

  // A30 — opening via mouse click left DOM focus on the trigger button,
  // so arrow keys did nothing until the panel was separately tabbed/
  // clicked into (onPanelKey is wired to panelEl's keydown, not the
  // trigger's). Moving focus into the panel on every open fixes both the
  // mouse-click and keyboard-open paths the same way.
  async function openPanel() {
    if (disabled) return;
    open = true;
    highlighted = Math.max(0, options.findIndex(o => o.value === value));
    await tick();
    panelEl?.focus();
  }
  function close() { open = false; triggerEl?.focus(); }
  function toggle() { if (open) close(); else openPanel(); }

  function choose(o: { value: string }) {
    value = o.value;
    dispatch('change', o.value);
    close();
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel();
    }
  }

  function onPanelKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, options.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[highlighted]) choose(options[highlighted]); }
    else if (e.key === 'Tab') { close(); }
  }

  function onWindowClick(e: MouseEvent) {
    if (!open) return;
    const t = e.target as Node;
    if (triggerEl?.contains(t) || panelEl?.contains(t)) return;
    close();
  }
;
async () => {

 { svelteHTML.createElement("svelte:window", {   "on:click":onWindowClick,});}

 { svelteHTML.createElement("div", { "class":`custom-select`,});
   { const $$_button1 = svelteHTML.createElement("button", {                "type":`button`,"class":`cs-trigger`,disabled,"on:click":toggle,"on:keydown":onTriggerKey,"aria-haspopup":`listbox`,"aria-expanded":open,});disabled;triggerEl = $$_button1;
     { svelteHTML.createElement("span", { "class":`cs-value`,});selected?.label ?? placeholder; }
     { svelteHTML.createElement("svg", {                 "class":`cs-chevron`,"viewBox":`0 0 10 6`,"width":`10`,"height":`6`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,}); { svelteHTML.createElement("polyline", {  "points":`1,1 5,5 9,1`,});} }
   }

  if(open){
    
     { const $$_div1 = svelteHTML.createElement("div", {           "class":`cs-panel`,"role":`listbox`,"tabindex":-1,"on:keydown":onPanelKey,});placement === 'up';panelEl = $$_div1;__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 4, duration: popScale.duration, easing: popScale.easing })));
         for(let [group, opts] of __sveltets_2_ensureArray(grouped)){group;
        if(group){ { svelteHTML.createElement("div", { "class":`cs-group-label`,});group; }}
           for(let o of __sveltets_2_ensureArray(opts)){o.value;
          const idx = options.indexOf(o);
           { svelteHTML.createElement("button", {               "type":`button`,"class":`cs-option`,"role":`option`,"aria-selected":o.value === value,"on:click":() => choose(o),"on:mouseenter":() => highlighted = idx,});o.value === value;idx === highlighted;o.label; }
        }
      }
     }
  }
 }


};
return { props: {options: options , value: value , placeholder: placeholder , placement: placement , disabled: disabled} as {options?: { value: string; label: string; group?: string }[], value: string, placeholder?: typeof placeholder, placement?: 'up' | 'down', disabled?: typeof disabled}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ change: string }>()} }}
const CustomSelect__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type CustomSelect__SvelteComponent_ = InstanceType<typeof CustomSelect__SvelteComponent_>;
/*Ωignore_endΩ*/export default CustomSelect__SvelteComponent_;