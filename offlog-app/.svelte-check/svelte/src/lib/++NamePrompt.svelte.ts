///<reference types="svelte" />
;
import { createEventDispatcher } from 'svelte';
import { fade } from 'svelte/transition';
import { getDeviceName, setDeviceName, isNativePlatform, getSyncUrl, getWeekStartsMonday, setWeekStartsMonday, getTimeFormat24h, setTimeFormat24h } from '../config';
import { getThemeMode, setThemeMode, type ThemeMode } from './theme';
import { permissionState, requestPermission } from './notifications';
import { trapFocus } from './focusTrap';
import { dialogPop, scrimFade } from './motion';
function $$render() {
/*Ωignore_startΩ*/;let $permissionState = __sveltets_2_store_get(permissionState);/*Ωignore_endΩ*/
  
  
  
  
  
  
  

  // 'setupSync' fires only from step 2's "Set up sync" button — App.svelte
  // uses it to open Settings straight into the Sync tab. 'close' fires
  // whenever the flow actually ends (step 1's Skip, step 3's Done,
  // Escape/scrim-click on step 1 or 3).
  const dispatch = createEventDispatcher<{ close: void; setupSync: void }>();

  // Pre-filled with the same auto-generated default Settings already
  // shows ("PC" / "Android phone") — saving without changing it is a
  // no-op, same as skipping, just via a different button.
  let name = getDeviceName();

  // Owner feedback, 2026-07-21: don't put a standing "set up sync" button
  // in the sidebar footer for people who've never paired — instead offer
  // it once, right here, as step 2 of the same one-time prompt. Only
  // meaningful on native: desktop/web always have a real default sync URL
  // (see config.ts's DEFAULT_SYNC_URL), so "not configured" only exists
  // as a native/Android state.
  const offerSync = isNativePlatform() && !getSyncUrl();

  // Step 3 is a quick-preferences screen (theme/week-start/time-format +
  // a notification-permission ask) — same controls SettingsPanel.svelte
  // already exposes, just surfaced once up front instead of only
  // discoverable by opening Settings later. Shown on every platform
  // (unlike step 2, which is native-unpaired-only).
  let step: 1 | 2 | 3 = 1;

  let themeMode: ThemeMode = getThemeMode();
  function selectThemeMode(mode: ThemeMode) {
    themeMode = mode;
    setThemeMode(mode);
  }
  let weekStartsMonday = getWeekStartsMonday();
  function setWeekStart(monday: boolean) {
    weekStartsMonday = monday;
    setWeekStartsMonday(monday);
  }
  let timeFormat24h = getTimeFormat24h();
  function setTimeFormat(is24h: boolean) {
    timeFormat24h = is24h;
    setTimeFormat24h(is24h);
  }

  // Owner feedback, 2026-07-21: "Skip" means get out of the whole flow,
  // full stop, at every step — not "skip this one step, keep going."
  // Someone who declines naming the device or setting up sync almost
  // certainly doesn't want a 3rd screen either.
  function dismiss() {
    dispatch('close');
  }

  function next() {
    setDeviceName(name);
    step = offerSync ? 2 : 3;
  }

  function setupSync() {
    dispatch('setupSync');
  }

  // Owner feedback, 2026-07-21 (2nd round): step 2's decline should still
  // land on step 3's preferences — only step 1's "Skip" bails out of the
  // whole flow. Declining sync isn't the same as declining everything.
  function declineSync() {
    step = 3;
  }

  // Mirrors each step's own decline button, so Escape/scrim-click never
  // does something more drastic than the visible "Skip" would.
  function decline() {
    if (step === 2) { declineSync(); } else { dismiss(); }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); decline(); }
    if (e.key === 'Enter' && step === 1) { e.preventDefault(); next(); }
  }
;
async () => {

 { svelteHTML.createElement("svelte:window", {   "on:keydown":onWindowKeydown,});}


 { svelteHTML.createElement("div", {     "class":`prompt-scrim`,"on:click":decline,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }
if(step === 1){
   {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {       "class":`prompt-panel`,"role":`dialog`,"aria-modal":`true`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
     { svelteHTML.createElement("p", { "class":`prompt-title`,});      }
     { svelteHTML.createElement("p", { "class":`prompt-hint`,});                           }
    
     { svelteHTML.createElement("input", {        "class":`prompt-input`,"bind:value":name,"placeholder":`PC`,"autofocus":true,"enterkeyhint":`done`,});/*Ωignore_startΩ*/() => name = __sveltets_2_any(null);/*Ωignore_endΩ*/}
     { svelteHTML.createElement("div", { "class":`prompt-actions`,});
       { svelteHTML.createElement("button", {   "class":`skip-btn`,"on:click":dismiss,});  }
       { svelteHTML.createElement("button", {   "class":`save-btn`,"on:click":next,});  }
     }
   }}
} else if (step === 2){
   {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {       "class":`prompt-panel`,"role":`dialog`,"aria-modal":`true`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
     { svelteHTML.createElement("p", { "class":`prompt-title`,});    }
     { svelteHTML.createElement("p", { "class":`prompt-hint`,});
                                                    
     }
     { svelteHTML.createElement("p", { "class":`prompt-hint`,});           }
     { svelteHTML.createElement("div", { "class":`prompt-actions`,});
       { svelteHTML.createElement("button", {   "class":`skip-btn`,"on:click":declineSync,});  }
       { svelteHTML.createElement("button", {   "class":`save-btn`,"on:click":setupSync,});   }
     }
   }}
}else{
   {const $$action_0 = __sveltets_2_ensureAction(trapFocus(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {       "class":`prompt-panel`,"role":`dialog`,"aria-modal":`true`,});__sveltets_2_ensureTransition(dialogPop(svelteHTML.mapElementTag('div')));
     { svelteHTML.createElement("p", { "class":`prompt-title`,});     }
     { svelteHTML.createElement("p", { "class":`prompt-hint`,});             }

     { svelteHTML.createElement("div", { "class":`pref-row`,});
       { svelteHTML.createElement("span", { "class":`pref-label`,});  }
       { svelteHTML.createElement("div", { "class":`pref-toggle`,});
         { svelteHTML.createElement("button", {   "on:click":() => selectThemeMode('light'),});themeMode === 'light';  }
         { svelteHTML.createElement("button", {   "on:click":() => selectThemeMode('dark'),});themeMode === 'dark';  }
         { svelteHTML.createElement("button", {   "on:click":() => selectThemeMode('system'),});themeMode === 'system';  }
       }
     }

     { svelteHTML.createElement("div", { "class":`pref-row`,});
       { svelteHTML.createElement("span", { "class":`pref-label`,});   }
       { svelteHTML.createElement("div", { "class":`pref-toggle`,});
         { svelteHTML.createElement("button", {   "on:click":() => setWeekStart(false),});!weekStartsMonday;  }
         { svelteHTML.createElement("button", {   "on:click":() => setWeekStart(true),});weekStartsMonday;  }
       }
     }

     { svelteHTML.createElement("div", { "class":`pref-row`,});
       { svelteHTML.createElement("span", { "class":`pref-label`,});  }
       { svelteHTML.createElement("div", { "class":`pref-toggle`,});
         { svelteHTML.createElement("button", {   "on:click":() => setTimeFormat(false),});!timeFormat24h;  }
         { svelteHTML.createElement("button", {   "on:click":() => setTimeFormat(true),});timeFormat24h;  }
       }
     }

    if($permissionState !== 'granted' && $permissionState !== 'unsupported'){
       { svelteHTML.createElement("div", { "class":`pref-row`,});
         { svelteHTML.createElement("span", { "class":`pref-label-group`,});
           { svelteHTML.createElement("span", { "class":`pref-label`,});  }
           { svelteHTML.createElement("span", { "class":`pref-sublabel`,});     }
         }
         { svelteHTML.createElement("button", {   "class":`notif-btn`,"on:click":() => requestPermission(),});  }
       }
    }

     { svelteHTML.createElement("div", { "class":`prompt-actions`,});
       { svelteHTML.createElement("button", {   "class":`save-btn`,"on:click":dismiss,});  }
     }
   }}
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ close: void; setupSync: void }>()} }}
const NamePrompt__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type NamePrompt__SvelteComponent_ = InstanceType<typeof NamePrompt__SvelteComponent_>;
/*Ωignore_endΩ*/export default NamePrompt__SvelteComponent_;