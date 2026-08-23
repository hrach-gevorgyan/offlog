///<reference types="svelte" />
;
import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
import TimePicker from './TimePicker.svelte';
import { fmtTime } from './utils';
function $$render() {

  
  
  

  // B38 — custom calendar/date picker instead of the native OS one.
  // Two value formats, chosen by `withTime`:
  //   withTime=false: plain 'YYYY-MM-DD' (matches <input type=date>)
  //   withTime=true:  'YYYY-MM-DDTHH:mm' (matches <input type=datetime-local>,
  //                   which is what CardDetail's reminder_at is kept in)
  // Emits 'change' with the new string in that same format — the parent
  // still owns the actual field (due_date/reminder_at), same as the
  // native inputs it replaces.
   let value: string = ''/*Ωignore_startΩ*/;value = __sveltets_2_any(value);/*Ωignore_endΩ*/;
   let withTime = false/*Ωignore_startΩ*/;withTime = __sveltets_2_any(withTime);/*Ωignore_endΩ*/;
   let disabled = false/*Ωignore_startΩ*/;disabled = __sveltets_2_any(disabled);/*Ωignore_endΩ*/;
   let placeholder = 'Select date…';

  const dispatch = createEventDispatcher<{ change: string }>();

  let open = false;
  let wrapEl: HTMLDivElement;
  let triggerEl: HTMLButtonElement;
  let popoverEl: HTMLDivElement;
  // Owner feedback, 2026-07-30 (found via CardDetail's move to a
  // capped-height centered modal): .cal-popover used to be a plain
  // absolutely-positioned child, which gets clipped by any ancestor
  // with overflow:hidden/auto once it extends past that ancestor's box
  // -- exactly what CardDetail's own scrollable .panel does. Same fix
  // as ListView.svelte's .col-menu--fixed: position:fixed with JS-
  // measured coordinates escapes that clipping entirely, flipping to
  // open upward if there's no room below.
  let popoverStyle = '';
  async function positionPopover() {
    await tick();
    if (!triggerEl || !popoverEl) return;
    const r = triggerEl.getBoundingClientRect();
    const pr = popoverEl.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + pr.height > window.innerHeight - 8) {
      top = Math.max(8, r.top - pr.height - 6);
    }
    let left = r.left;
    if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
    if (left < 8) left = 8;
    popoverStyle = `top:${top}px; left:${left}px;`;
  }

  function parseDate(v: string): Date | null {
    if (!v) return null;
    const [y, m, d] = v.slice(0, 10).split('-').map(Number);
    if (!y) return null;
    return new Date(y, m - 1, d);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  function fmtDate(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  let  selected = __sveltets_2_invalidate(() => parseDate(value));
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  // Re-sync the visible month to the selected date only when opening, not
  // on every keystroke-level reactivity — otherwise navigating to a
  // different month while picking a time (withTime) would keep snapping
  // back to the currently-selected date's month.
  ;() => {$: if (open) { const d = selected ?? new Date(); viewYear = d.getFullYear(); viewMonth = d.getMonth(); }}

  let timeVal = '09:00';
  $: timeVal = __sveltets_2_invalidate(() => withTime && value.length >= 16 ? value.slice(11, 16) : timeVal);

  function toggle() {
    if (disabled) return;
    open = !open;
    if (open) positionPopover();
  }
  function close() { open = false; }

  // Re-measure on month navigation too -- a 5-week vs 6-week month
  // changes the grid's height, which can change whether it still fits
  // below the trigger.
  function prevMonth() { if (viewMonth === 0) { viewMonth = 11; viewYear -= 1; } else viewMonth -= 1; positionPopover(); }
  function nextMonth() { if (viewMonth === 11) { viewMonth = 0; viewYear += 1; } else viewMonth += 1; positionPopover(); }

  function buildCells(year: number, month: number): (Date | null)[] {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }
  let  cells = __sveltets_2_invalidate(() => buildCells(viewYear, viewMonth));

  function pick(d: Date) {
    const dateStr = fmtDate(d);
    dispatch('change', withTime ? `${dateStr}T${timeVal}` : dateStr);
    if (!withTime) open = false;
  }

  function onTimeChange(e: CustomEvent<string>) {
    timeVal = e.detail;
    const base = selected ?? new Date();
    dispatch('change', `${fmtDate(base)}T${timeVal}`);
  }

  function clear() { dispatch('change', ''); open = false; }
  function goToday() { pick(new Date()); }

  function onDocClick(e: MouseEvent) {
    if (open && wrapEl && !wrapEl.contains(e.target as Node)) close();
  }
  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') { e.preventDefault(); close(); }
  }
  onMount(() => document.addEventListener('click', onDocClick, true));
  onDestroy(() => document.removeEventListener('click', onDocClick, true));

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  let  displayLabel = __sveltets_2_invalidate(() => !selected ? placeholder
    : withTime ? `${selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${fmtTime(new Date(`1970-01-01T${timeVal}`))}`
    : selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
;
async () => {

 { svelteHTML.createElement("svelte:window", {   "on:keydown":onWindowKeydown,});}

 { const $$_div0 = svelteHTML.createElement("div", {  "class":`cal-field`,});wrapEl = $$_div0;
   { const $$_button1 = svelteHTML.createElement("button", {         "type":`button`,"class":`cal-trigger`,"on:click":toggle,disabled,});!!value;open;triggerEl = $$_button1;
     { svelteHTML.createElement("svg", {               "viewBox":`0 0 16 16`,"width":`14`,"height":`14`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
        { svelteHTML.createElement("rect", {         "x":`2`,"y":`3`,"width":`12`,"height":`11`,"rx":`1.5`,});}  { svelteHTML.createElement("line", {       "x1":`2`,"y1":`6.5`,"x2":`14`,"y2":`6.5`,});}  { svelteHTML.createElement("line", {       "x1":`5.5`,"y1":`1.5`,"x2":`5.5`,"y2":`4.5`,});}  { svelteHTML.createElement("line", {       "x1":`10.5`,"y1":`1.5`,"x2":`10.5`,"y2":`4.5`,});}
     }
     { svelteHTML.createElement("span", {});displayLabel; }
   }

  if(open){
     { const $$_div1 = svelteHTML.createElement("div", {    "class":`cal-popover`,"style":popoverStyle,});popoverEl = $$_div1;
       { svelteHTML.createElement("div", { "class":`cal-header`,});
         { svelteHTML.createElement("button", {       "type":`button`,"class":`cal-nav`,"on:click":prevMonth,"aria-label":`Previous month`,});  }
         { svelteHTML.createElement("span", { "class":`cal-month-label`,});MONTH_NAMES[viewMonth]; viewYear; }
         { svelteHTML.createElement("button", {       "type":`button`,"class":`cal-nav`,"on:click":nextMonth,"aria-label":`Next month`,});  }
       }
       { svelteHTML.createElement("div", { "class":`cal-dow`,});  for(let d of __sveltets_2_ensureArray(DOW)){ { svelteHTML.createElement("span", {});d; }} }
       { svelteHTML.createElement("div", { "class":`cal-grid`,});
          for(let cell of __sveltets_2_ensureArray(cells)){
          if(cell){
             { svelteHTML.createElement("button", {         "type":`button`,"class":`cal-day`,"on:click":() => pick(cell),});isSameDay(cell, new Date());selected && isSameDay(cell, selected);cell.getDate(); }
          }else{
             { svelteHTML.createElement("span", { "class":`cal-day-empty`,}); }
          }
        }
       }
      if(withTime){
         { svelteHTML.createElement("div", { "class":`cal-time-row`,});
           { const $$_rekciPemiT3C = __sveltets_2_ensureComponent(TimePicker); const $$_rekciPemiT3 = new $$_rekciPemiT3C({ target: __sveltets_2_any(), props: {    "value":timeVal,}});$$_rekciPemiT3.$on("change", onTimeChange);}
         }
      }
       { svelteHTML.createElement("div", { "class":`cal-footer`,});
         { svelteHTML.createElement("button", {     "type":`button`,"class":`cal-footer-btn`,"on:click":goToday,});  }
        if(value){ { svelteHTML.createElement("button", {     "type":`button`,"class":`cal-footer-btn cal-footer-btn-clear`,"on:click":clear,});  }}
       }
     }
  }
 }


};
return { props: {value: value , withTime: withTime , disabled: disabled , placeholder: placeholder} as {value?: string, withTime?: typeof withTime, disabled?: typeof disabled, placeholder?: typeof placeholder}, exports: {}, bindings: "", slots: {}, events: {...__sveltets_2_toEventTypings<{ change: string }>()} }}
const CalendarPicker__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type CalendarPicker__SvelteComponent_ = InstanceType<typeof CalendarPicker__SvelteComponent_>;
/*Ωignore_endΩ*/export default CalendarPicker__SvelteComponent_;