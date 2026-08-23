///<reference types="svelte" />
;
import { fade } from 'svelte/transition';
import { scrimFade } from './motion';
import { createEventDispatcher, onMount, tick } from 'svelte';
import { verifyAppLockPin, clearAppLockPin, getAppLockHint, verifyAppLockRecoveryCode, hasAppLockRecoveryCode, isAppLockBiometricEnabled, isNativePlatform } from '../config';
import { trapFocus } from './focusTrap';
function $$render() {

  
  
  
  
  

  // Deliberately does NOT use modalStack.ts's closeOnBack() — every other
  // overlay in the app is dismissible via Escape/back/scrim-click by
  // design, but a lock screen that closes on Escape isn't a lock. The only
  // ways out are a correct PIN or the explicit "Forgot PIN" reset below.
  const dispatch = createEventDispatcher<{ unlocked: void }>();

  let pin = '';
  let error = false;
  let wrongCount = 0;
  let cooldown = false;
  let inputEl: HTMLInputElement;
  let showHint = false;
  let showRecovery = false;
  let recoveryCode = '';
  let recoveryError = '';
  let recoverySaving = false;
  const hint = getAppLockHint();
  const recoveryExists = hasAppLockRecoveryCode();
  const biometricEnabled = isNativePlatform() && isAppLockBiometricEnabled();
  let biometricBusy = false;

  onMount(async () => {
    await tick();
    inputEl?.focus();
    if (biometricEnabled) tryBiometric();
  });

  // Fires automatically on mount, and again from the "Try again" link —
  // a cancelled/failed attempt is not a wrong PIN, so it never triggers
  // the shake/error state below. The PIN input stays usable the whole
  // time; biometric is just a faster path on top of it, never a
  // replacement (owner, 2026-07-20 — see config.ts's own comment).
  async function tryBiometric() {
    if (biometricBusy) return;
    biometricBusy = true;
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const available = await NativeBiometric.isAvailable();
      if (!available.isAvailable) return;
      await NativeBiometric.verifyIdentity({ reason: 'Unlock Offlog', title: 'Unlock Offlog' });
      dispatch('unlocked');
    } catch {
      // Cancelled, failed, or lockout — fall through to the PIN screen.
    } finally {
      biometricBusy = false;
    }
  }

  async function submit() {
    if (cooldown || !pin) return;
    const ok = await verifyAppLockPin(pin);
    if (ok) {
      dispatch('unlocked');
      return;
    }
    error = true;
    wrongCount++;
    pin = '';
    // A light throttle, not real rate-limiting — this gates a UI, not a
    // vault (see DECISIONS.md), so the point is just to slow down idle
    // guessing, not withstand a determined attacker.
    if (wrongCount >= 3) {
      cooldown = true;
      setTimeout(() => { cooldown = false; wrongCount = 0; }, 3000);
    }
    setTimeout(() => { error = false; }, 400);
    await tick();
    inputEl?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
  }

  function onPinInput(e: Event) {
    // Digits only — a PIN, not a general password field.
    pin = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
  }

  // v1 shipped this as a plain confirm-and-clear — owner feedback,
  // 2026-07-19: "it is just removing pin... like when there is wall as
  // block of road but in middle there is door u just open and go". Right:
  // a bypass reachable with zero knowledge isn't a lock. Now requires the
  // one-time recovery code shown at PIN setup (config.ts) — a real
  // route back in, not a button. Still no server/account to verify
  // identity against (see DECISIONS.md), so this is the strongest recovery
  // achievable without one: possessing a secret only ever shown once.
  async function submitRecovery() {
    if (recoverySaving || !recoveryCode.trim()) return;
    recoverySaving = true;
    const ok = await verifyAppLockRecoveryCode(recoveryCode);
    recoverySaving = false;
    if (!ok) {
      recoveryError = 'That code doesn’t match.';
      return;
    }
    clearAppLockPin();
    dispatch('unlocked');
  }

  function onRecoveryKey(e: KeyboardEvent) {
    if (e.key === 'Enter') submitRecovery();
  }
;
async () => {

 {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {    "class":`lock-screen`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
  if(showRecovery){
     { svelteHTML.createElement("div", {  "class":`lock-card`,});!!recoveryError;
       { svelteHTML.createElement("div", { "class":`lock-title`,});    }
      if(recoveryExists){
         { svelteHTML.createElement("div", { "class":`lock-sub lock-sub-wide`,});
                         
                           
          
         }
         { svelteHTML.createElement("input", {               "type":`text`,"autocomplete":`off`,"class":`lock-input lock-input-code`,"placeholder":`XXXXX-XXXXX`,"bind:value":recoveryCode,"on:keydown":onRecoveryKey,"aria-label":`Recovery code`,});/*Ωignore_startΩ*/() => recoveryCode = __sveltets_2_any(null);/*Ωignore_endΩ*/}
        if(recoveryError){ { svelteHTML.createElement("div", { "class":`lock-hint lock-hint-error`,});recoveryError; }}
         { svelteHTML.createElement("div", { "class":`lock-confirm-row`,});
           { svelteHTML.createElement("button", {   "class":`lock-cancel`,"on:click":() => { showRecovery = false; recoveryError = ''; recoveryCode = ''; },});  }
           { svelteHTML.createElement("button", {     "class":`lock-submit`,"on:click":submitRecovery,"disabled":!recoveryCode.trim() || recoverySaving,});  }
         }
      }else{
         { svelteHTML.createElement("div", { "class":`lock-sub lock-sub-wide`,});
                          
                        
            
         }
         { svelteHTML.createElement("button", {   "class":`lock-cancel`,"on:click":() => showRecovery = false,});  }
      }
     }
  }else{
     { svelteHTML.createElement("div", {  "class":`lock-card`,});error;
       { svelteHTML.createElement("div", {   "class":`lock-icon`,"aria-hidden":`true`,});
         { svelteHTML.createElement("svg", {               "viewBox":`0 0 24 24`,"width":`28`,"height":`28`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});  { svelteHTML.createElement("rect", {         "x":`4`,"y":`11`,"width":`16`,"height":`10`,"rx":`2`,});}  { svelteHTML.createElement("path", { "d":`M8 11V7a4 4 0 0 1 8 0v4`,});} }
       }
       { svelteHTML.createElement("div", { "class":`lock-title`,});   }
       { svelteHTML.createElement("div", { "class":`lock-sub`,});     }

       { const $$_input2 = svelteHTML.createElement("input", {                      "type":`password`,"inputmode":`numeric`,"autocomplete":`off`,"class":`lock-input`,"placeholder":`PIN`,"value":pin,"on:input":onPinInput,"on:keydown":onKey,"disabled":cooldown,"aria-label":`PIN`,});inputEl = $$_input2;}

      if(cooldown){
         { svelteHTML.createElement("div", { "class":`lock-hint lock-hint-error`,});          }
      }

       { svelteHTML.createElement("button", {     "class":`lock-submit`,"on:click":submit,"disabled":!pin || cooldown,});  }

      if(biometricEnabled){
         { svelteHTML.createElement("button", {     "class":`lock-forgot`,"on:click":tryBiometric,"disabled":biometricBusy,});   }
      }
      if(hint){
        if(showHint){
           { svelteHTML.createElement("div", { "class":`lock-hint`,}); hint; }
        }else{
           { svelteHTML.createElement("button", {   "class":`lock-forgot`,"on:click":() => showHint = true,});  }
        }
      }
       { svelteHTML.createElement("button", {   "class":`lock-forgot`,"on:click":() => showRecovery = true,});  }
     }
  }
 }}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ unlocked: void }>()} }}
const AppLock__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type AppLock__SvelteComponent_ = InstanceType<typeof AppLock__SvelteComponent_>;
/*Ωignore_endΩ*/export default AppLock__SvelteComponent_;