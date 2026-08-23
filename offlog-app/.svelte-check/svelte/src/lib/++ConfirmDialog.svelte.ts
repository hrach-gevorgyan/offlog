///<reference types="svelte" />
;
import { fade } from 'svelte/transition';
import { confirmRequest } from './confirm';
import { closeOnBack } from './modalStack';
import { trapFocus } from './focusTrap';
import { dialogPop, scrimFade } from './motion';
function $$render() {
/*Ωignore_startΩ*/;let $confirmRequest = __sveltets_2_store_get(confirmRequest);/*Ωignore_endΩ*/
  
  
  
  
  

  // ConfirmDialog is mounted once, permanently, at the App.svelte root —
  // it never mounts/unmounts per dialog the way other overlays do, it just
  // toggles {#if $confirmRequest}. So the back-button history layer (see
  // modalStack.ts / ROADMAP.md A14) has to be pushed/popped reactively
  // instead of at component init. `pendingResult` carries which button was
  // pressed through the async history.back() -> popstate round-trip, since
  // the actual promise resolution happens inside the registered close
  // callback, not synchronously in respond().
  let popLayer: (() => void) | null = null;
  let pendingResult = false;

  ;() => {$: if ($confirmRequest && !popLayer) {
    popLayer = closeOnBack(() => {
      $confirmRequest?.resolve(pendingResult);
      confirmRequest.set(null);
      popLayer = null;
    });
  }}

  function respond(v: boolean) {
    pendingResult = v;
    if (popLayer) popLayer();
    else { $confirmRequest?.resolve(v); confirmRequest.set(null); } // safety net, shouldn't normally hit
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!$confirmRequest) return;
    if (e.key === 'Escape') { e.preventDefault(); respond(false); }
    if (e.key === 'Enter')  { e.preventDefault(); respond(true); }
  }
;
async () => {

  { svelteHTML.createElement("svelte:window", {  "on:keydown":onWindowKeydown,});}

if($confirmRequest){
  
   { svelteHTML.createElement("div", {     "class":`confirm-scrim`,"on:click":() => respond(false),});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }
   {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {       "class":`confirm-panel`,"role":`alertdialog`,"aria-modal":`true`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
     { svelteHTML.createElement("p", { "class":`confirm-msg`,});$confirmRequest.message; }
     { svelteHTML.createElement("div", { "class":`confirm-actions`,});
       { svelteHTML.createElement("button", {   "class":`cancel-btn`,"on:click":() => respond(false),});$confirmRequest.cancelLabel; }
      
       { svelteHTML.createElement("button", {     "class":`ok-btn`,"on:click":() => respond(true),"autofocus":true,});$confirmRequest.danger;
        $confirmRequest.confirmLabel;
       }
     }
   }}
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {} }}
const ConfirmDialog__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type ConfirmDialog__SvelteComponent_ = InstanceType<typeof ConfirmDialog__SvelteComponent_>;
/*Ωignore_endΩ*/export default ConfirmDialog__SvelteComponent_;