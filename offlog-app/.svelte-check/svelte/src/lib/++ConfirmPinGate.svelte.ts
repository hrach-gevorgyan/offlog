///<reference types="svelte" />
;// B61: changing or removing the App Lock PIN used to need nothing but
// an unlocked device — anyone holding it could silently disable the
// lock. This gate makes both paths behave like a password change
// anywhere else: prove you know the *current* PIN first. A separate
// component (not inline SettingsPanel state) so the flow is directly
// unit-testable without mounting the whole settings panel.

import { createEventDispatcher, onMount, tick } from 'svelte';
import { verifyAppLockPin } from '../config';
function $$render() {

  
  
  
  
  
  
  
  

   let message: string/*Ωignore_startΩ*/;message = __sveltets_2_any(message);/*Ωignore_endΩ*/;
   let confirmLabel = 'Continue';
   let danger = false/*Ωignore_startΩ*/;danger = __sveltets_2_any(danger);/*Ωignore_endΩ*/;

  const dispatch = createEventDispatcher<{ verified: void; cancel: void }>();

  let pin = '';
  let error = '';
  let busy = false;
  let inputEl: HTMLInputElement;

  onMount(async () => { await tick(); inputEl?.focus(); });

  function onPinInput(e: Event) {
    // Digits only, same filter as AppLock.svelte's lock screen.
    pin = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    error = '';
  }

  async function submit() {
    if (busy || !pin) return;
    busy = true;
    const ok = await verifyAppLockPin(pin);
    busy = false;
    if (!ok) {
      error = 'Current PIN is incorrect.';
      pin = '';
      await tick();
      inputEl?.focus();
      return;
    }
    dispatch('verified');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') dispatch('cancel');
  }
;
async () => {

 { svelteHTML.createElement("p", { "class":`gate-message`,});message; }
 { svelteHTML.createElement("label", { "class":`gate-label`,});
   
   { const $$_input1 = svelteHTML.createElement("input", {                    "type":`password`,"inputmode":`numeric`,"autocomplete":`off`,"maxlength":8,"placeholder":`4–8 digits`,"value":pin,"on:input":onPinInput,"on:keydown":onKey,"aria-label":`Current PIN`,});inputEl = $$_input1;}
 }
if(error){ { svelteHTML.createElement("p", { "class":`gate-error`,});error; }}
 { svelteHTML.createElement("div", { "class":`gate-row`,});
   { svelteHTML.createElement("button", {   "class":`gate-btn`,"on:click":() => dispatch('cancel'),});  }
   { svelteHTML.createElement("button", {      "class":`gate-btn`,"on:click":submit,"disabled":!pin || busy,});danger;
    busy ? 'Checking…' : confirmLabel;
   }
 }


};
return { props: {message: message , confirmLabel: confirmLabel , danger: danger} as {message: string, confirmLabel?: typeof confirmLabel, danger?: typeof danger}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ verified: void; cancel: void }>()} }}
const ConfirmPinGate__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type ConfirmPinGate__SvelteComponent_ = InstanceType<typeof ConfirmPinGate__SvelteComponent_>;
/*Ωignore_endΩ*/export default ConfirmPinGate__SvelteComponent_;