///<reference types="svelte" />
;
import { createEventDispatcher } from 'svelte';
import CustomSelect from './CustomSelect.svelte';
import { getTimeFormat24h } from '../config';
function $$render() {

  
  
  

  // B50 — replaces native <input type="time"> (which renders as the bare
  // OS picker on Android, same reason CustomSelect replaced native
  // <select>) with two (or three, in 12h mode) themed CustomSelect
  // dropdowns sharing this app's existing picker look. Value/emit format
  // is always 'HH:MM' (24h, zero-padded), matching what <input
  // type="time"> already produced — every call site swaps in this
  // component with no format change needed. Only the *displayed* hour
  // dropdown (and an added AM/PM toggle) switches based on Settings ->
  // Appearance's 24h/12h choice (getTimeFormat24h) — found 2026-07-23:
  // this picker previously always showed a 00-23 dropdown regardless of
  // that setting.
  //
  // 2026-07-24: tried a hand-rolled scroll wheel, the timepicker-ui
  // library, and native <input type="time"> as replacements, in that
  // order — reverted every one (wheel: too rough visually; library:
  // ~117KB for one field; native: its OS popup can't be styled with CSS
  // at all and ignores the 12h/24h setting entirely, showing whatever
  // format the OS/browser locale picks). This dropdown version is the
  // only one that's simultaneously compact, fully CSS-themeable, and
  // respects the app's own setting — same conclusion the original B50
  // note already reached.
   let value = '09:00';
   let disabled = false/*Ωignore_startΩ*/;disabled = __sveltets_2_any(disabled);/*Ωignore_endΩ*/;
  // Forwarded straight to each CustomSelect (owner feedback, 2026-07-30) --
  // a picker sitting near the bottom of a scrollable panel (e.g. Quiet
  // hours) needs its dropdown to open upward or it renders clipped/
  // fighting the panel's own scroll instead of just showing above.
   let placement: 'up' | 'down' = 'down'/*Ωignore_startΩ*/;placement = __sveltets_2_any(placement);/*Ωignore_endΩ*/;

  const dispatch = createEventDispatcher<{ change: string }>();

  const pad = (n: number) => String(n).padStart(2, '0');
  const HOURS_24 = Array.from({ length: 24 }, (_, h) => ({ value: pad(h), label: pad(h) }));
  // Clock order (12, 1, 2, ... 11), not numeric — matches how a 12h
  // dropdown is normally read.
  const HOURS_12 = [12, ...Array.from({ length: 11 }, (_, i) => i + 1)].map(h => ({ value: pad(h), label: String(h) }));
  const PERIODS = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
  // Every minute, not 5-minute steps — matches what the native <input
  // type="time"> this replaced actually allowed (owner-reported,
  // 2026-07-16: 5-minute steps couldn't express an exact minute).
  const MINUTES = Array.from({ length: 60 }, (_, m) => ({ value: pad(m), label: pad(m) }));

  let  is24h = __sveltets_2_invalidate(() => getTimeFormat24h());
  let  [h, m] = __sveltets_2_invalidate(() => value.split(':'));
  let  hour24 = __sveltets_2_invalidate(() => +(h ?? '09'));
  let  period = __sveltets_2_invalidate(() => hour24 < 12 ? 'AM' : 'PM');
  let  hour12 = __sveltets_2_invalidate(() => pad(hour24 % 12 === 0 ? 12 : hour24 % 12));

  function onHour24(e: CustomEvent<string>) { dispatch('change', `${e.detail}:${m ?? '00'}`); }
  function onMinute(e: CustomEvent<string>) { dispatch('change', `${pad(hour24)}:${e.detail}`); }

  function to24(hour12Val: number, p: string): number {
    const base = hour12Val % 12; // 12 -> 0
    return p === 'PM' ? base + 12 : base;
  }
  function onHour12(e: CustomEvent<string>) {
    dispatch('change', `${pad(to24(+e.detail, period))}:${m ?? '00'}`);
  }
  function onPeriod(e: CustomEvent<string>) {
    dispatch('change', `${pad(to24(+hour12, e.detail))}:${m ?? '00'}`);
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`time-picker`,});
  if(is24h){
     { const $$_tceleSmotsuC1C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC1 = new $$_tceleSmotsuC1C({ target: __sveltets_2_any(), props: {        "options":HOURS_24,"value":pad(hour24),disabled,placement,}});$$_tceleSmotsuC1.$on("change", onHour24);}
     { svelteHTML.createElement("span", { "class":`time-sep`,});  }
     { const $$_tceleSmotsuC1C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC1 = new $$_tceleSmotsuC1C({ target: __sveltets_2_any(), props: {        "options":MINUTES,"value":m ?? '00',disabled,placement,}});$$_tceleSmotsuC1.$on("change", onMinute);}
  }else{
     { const $$_tceleSmotsuC1C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC1 = new $$_tceleSmotsuC1C({ target: __sveltets_2_any(), props: {        "options":HOURS_12,"value":hour12,disabled,placement,}});$$_tceleSmotsuC1.$on("change", onHour12);}
     { svelteHTML.createElement("span", { "class":`time-sep`,});  }
     { const $$_tceleSmotsuC1C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC1 = new $$_tceleSmotsuC1C({ target: __sveltets_2_any(), props: {        "options":MINUTES,"value":m ?? '00',disabled,placement,}});$$_tceleSmotsuC1.$on("change", onMinute);}
     { const $$_tceleSmotsuC1C = __sveltets_2_ensureComponent(CustomSelect); const $$_tceleSmotsuC1 = new $$_tceleSmotsuC1C({ target: __sveltets_2_any(), props: {        "options":PERIODS,"value":period,disabled,placement,}});$$_tceleSmotsuC1.$on("change", onPeriod);}
  }
 }


};
return { props: {value: value , disabled: disabled , placement: placement} as {value?: typeof value, disabled?: typeof disabled, placement?: 'up' | 'down'}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ change: string }>()} }}
const TimePicker__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type TimePicker__SvelteComponent_ = InstanceType<typeof TimePicker__SvelteComponent_>;
/*Ωignore_endΩ*/export default TimePicker__SvelteComponent_;