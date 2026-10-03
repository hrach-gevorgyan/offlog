<script lang="ts">
  import { fly } from 'svelte/transition';
  import { popIn, popOut } from './motion';
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import TimePicker from './TimePicker.svelte';
  import { fmtTime } from './utils';
  import { getWeekStartsMonday, getDefaultReminderTime } from '../config';

  // Themed calendar/date picker replacing the native OS one (desktop; the
  // phone picks on phone/Month.svelte). Two value formats, chosen by `withTime`:
  //   withTime=false: 'YYYY-MM-DD'       (as <input type=date>)
  //   withTime=true:  'YYYY-MM-DDTHH:mm' (as <input type=datetime-local>)
  // Emits 'change' with the new string in that same format; the parent
  // owns the actual field (due_date/reminder_at).
  export let value: string = '';
  export let withTime = false;
  export let disabled = false;
  export let placeholder = 'Select date…';
  // Off where the parent already offers its own date shortcuts.
  export let shortcuts = true;

  const dispatch = createEventDispatcher<{ change: string }>();

  let open = false;
  let wrapEl: HTMLDivElement;
  let triggerEl: HTMLButtonElement;
  let popoverEl: HTMLDivElement;
  // .cal-popover is position:fixed with JS-measured coordinates: an
  // absolutely-positioned popover is clipped by any ancestor with
  // overflow:hidden/auto (e.g. a scrollable modal panel). Flips to open
  // upward when there's no room below.
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
  function fromToday(days: number): Date { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return d; }

  $: selected = parseDate(value);
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  // Re-sync the visible month to the selected date only while opening —
  // otherwise navigating to another month while picking a time (withTime)
  // keeps snapping back to the selected date's month.
  $: if (open) { const d = selected ?? new Date(); viewYear = d.getFullYear(); viewMonth = d.getMonth(); }

  // A new reminder starts at the default reminder time.
  const defTime = getDefaultReminderTime();
  let timeVal = defTime;
  $: timeVal = withTime && value.length >= 16 ? value.slice(11, 16) : timeVal;
  const TIMES = [...new Set(['09:00', defTime, '13:00', '18:00'])].sort();
  // Any other time is typed in the time box, which shows on its own when
  // the value already holds one.
  let typing = false;
  $: showTimeBox = typing || !TIMES.includes(timeVal);

  function toggle() {
    if (disabled) return;
    open = !open;
    if (open) { typing = false; positionPopover(); }
  }
  function close() { open = false; }

  // Re-measure on month navigation: a 5-week vs 6-week month changes the
  // grid's height, and so whether it still fits below the trigger.
  function prevMonth() { if (viewMonth === 0) { viewMonth = 11; viewYear -= 1; } else viewMonth -= 1; positionPopover(); }
  function nextMonth() { if (viewMonth === 11) { viewMonth = 0; viewYear += 1; } else viewMonth += 1; positionPopover(); }

  const monday = getWeekStartsMonday();
  function buildCells(year: number, month: number): (Date | null)[] {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + (monday ? 6 : 0)) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }
  $: cells = buildCells(viewYear, viewMonth);

  function pick(d: Date) {
    const dateStr = fmtDate(d);
    dispatch('change', withTime ? `${dateStr}T${timeVal}` : dateStr);
    if (!withTime) open = false;
    else positionPopover();
  }

  function setTime(t: string) {
    timeVal = t;
    const base = selected ?? new Date();
    dispatch('change', `${fmtDate(base)}T${timeVal}`);
  }

  function clear() { dispatch('change', ''); open = false; }

  // Shortcuts that land on the same day keep only the first.
  const SHORTCUTS = ((): { label: string; date: Date }[] => {
    const dow = new Date().getDay();
    const all = [
      { label: 'Today', date: fromToday(0) },
      { label: 'Tomorrow', date: fromToday(1) },
      { label: 'Next Monday', date: fromToday((8 - dow) % 7 || 7) },
      { label: 'In a week', date: fromToday(7) },
    ];
    return all.filter((s, i) => all.findIndex(o => isSameDay(o.date, s.date)) === i);
  })();

  function onDocClick(e: MouseEvent) {
    if (open && wrapEl && !wrapEl.contains(e.target as Node)) close();
  }
  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') { e.preventDefault(); close(); }
  }
  // Capture phase, so the Escape is marked handled before the bubble-phase
  // window listener of the modal this picker sits in (registered earlier,
  // so it would otherwise run first) sees it and closes the modal too.
  function onWindowKeydownCapture(e: KeyboardEvent) {
    if (open && e.key === 'Escape') e.preventDefault();
  }
  onMount(() => document.addEventListener('click', onDocClick, true));
  onDestroy(() => document.removeEventListener('click', onDocClick, true));

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = monday ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const timeLabel = (t: string) => fmtTime(new Date(`1970-01-01T${t}`));

  $: dateText = !selected ? '' : selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  $: displayLabel = !selected ? placeholder
    : withTime ? `${dateText}, ${timeLabel(timeVal)}`
    : dateText;
</script>

<svelte:window on:keydown={onWindowKeydown} on:keydown|capture={onWindowKeydownCapture} />

<div class="cal-field" bind:this={wrapEl}>
  <button type="button" class="cal-trigger" class:has-value={!!value} class:open bind:this={triggerEl} on:click={toggle} {disabled} aria-haspopup="dialog" aria-expanded={open}>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5"/><line x1="2" y1="6.5" x2="14" y2="6.5"/><line x1="5.5" y1="1.5" x2="5.5" y2="4.5"/><line x1="10.5" y1="1.5" x2="10.5" y2="4.5"/>
    </svg>
    <span>{displayLabel}</span>
  </button>

  {#if open}
    <div class="cal-popover" bind:this={popoverEl} style={popoverStyle} in:fly={popIn} out:fly={popOut}>
      {#if shortcuts}
      <div class="cal-chips" role="group" aria-label="Shortcuts">
        {#each SHORTCUTS as s (s.label)}
          <button type="button" class="cal-chip" class:on={!!selected && isSameDay(s.date, selected)} on:click={() => pick(s.date)}>{s.label}</button>
        {/each}
      </div>
      {/if}
      <div class="cal-header">
        <button type="button" class="cal-nav" on:click={prevMonth} aria-label="Previous month">‹</button>
        <span class="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" class="cal-nav" on:click={nextMonth} aria-label="Next month">›</button>
      </div>
      <div class="cal-dow">{#each DOW as d}<span>{d}</span>{/each}</div>
      <div class="cal-grid">
        {#each cells as cell}
          {#if cell}
            <button
              type="button"
              class="cal-day"
              class:today={isSameDay(cell, new Date())}
              class:selected={selected && isSameDay(cell, selected)}
              on:click={() => pick(cell)}
            ><span>{cell.getDate()}</span></button>
          {:else}
            <span class="cal-day-empty"></span>
          {/if}
        {/each}
      </div>
      {#if withTime}
        <div class="cal-time-row">
          <span class="cal-time-label">Time</span>
          <div class="cal-times" role="group" aria-label="Time">
            {#each TIMES as t (t)}
              <button type="button" class="cal-time" class:on={!showTimeBox && timeVal === t} on:click={() => { typing = false; setTime(t); }}>{timeLabel(t)}</button>
            {/each}
            <button type="button" class="cal-time" class:on={showTimeBox} aria-label="Another time" aria-pressed={showTimeBox} on:click={() => { typing = !typing; positionPopover(); }}>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>
            </button>
          </div>
        </div>
        {#if showTimeBox}
          <div class="cal-time-box"><TimePicker value={timeVal} on:change={(e) => setTime(e.detail)} /></div>
        {/if}
      {/if}
      {#if value || withTime}
        <div class="cal-footer">
          {#if value}<button type="button" class="cal-footer-btn cal-footer-btn-clear" on:click={clear}>Clear</button>{/if}
          {#if withTime}<button type="button" class="cal-footer-btn cal-footer-btn-done" on:click={close}>Done</button>{/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cal-field { position: relative; }
  .cal-trigger {
    display: flex; align-items: center; gap: .45rem; width: 100%;
    padding: .38rem .5rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--faint);
    font-size: .84rem; font-family: 'Hanken Grotesk', sans-serif; cursor: pointer;
    transition: border-color var(--dur-hover) var(--ease-hover);
  }
  .cal-trigger svg { flex-shrink: 0; opacity: .8; }
  .cal-trigger span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
  .cal-trigger.has-value { color: var(--text); }
  .cal-trigger.open, .cal-trigger:hover { border-color: var(--accent); }
  .cal-trigger:disabled { opacity: .55; cursor: default; }

  /* position:fixed with JS-measured top/left (see positionPopover());
     absolute positioning would be clipped by scrollable ancestors. */
  .cal-popover {
    position: fixed; z-index: 220;
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    box-shadow: 0 12px 36px rgba(0,0,0,.18); padding: 12px; width: 318px;
    /* Sits inside field labels; none of their lettering applies here. */
    text-transform: none; letter-spacing: normal; font-family: 'Hanken Grotesk', sans-serif;
  }
  .cal-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .cal-chip, .cal-time {
    padding: .3rem .6rem; border: 0; border-radius: 999px; background: var(--col-bg); color: var(--text);
    font: inherit; font-size: .76rem; font-weight: 600; cursor: pointer;
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .cal-chip:hover, .cal-time:hover { background: var(--hover); }
  .cal-chip.on, .cal-time.on { background: var(--accent); color: var(--on-accent); }
  .cal-header { display: flex; align-items: center; justify-content: space-between; padding: 2px 0 6px; }
  .cal-nav {
    background: none; border: none; cursor: pointer; color: var(--muted);
    font-size: 1.05rem; line-height: 1; width: 28px; height: 28px; border-radius: 50%;
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .cal-nav:hover { background: var(--hover); color: var(--text); }
  .cal-month-label { font-size: .88rem; font-weight: 700; color: var(--text); letter-spacing: -.01em; }

  .cal-dow { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 2px; }
  .cal-dow span { text-align: center; font-size: .66rem; font-weight: 600; color: var(--faint); padding: 3px 0; }

  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
  .cal-day {
    height: 36px; display: flex; align-items: center; justify-content: center;
    background: none; border: none; padding: 0; cursor: pointer; font: inherit; color: var(--text);
  }
  .cal-day span {
    width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: .8rem; font-variant-numeric: tabular-nums;
    transition: background var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover);
  }
  .cal-day:hover span { background: var(--hover); }
  .cal-day.today span { box-shadow: inset 0 0 0 1.5px var(--accent); color: var(--accent); font-weight: 700; }
  .cal-day.selected span { background: var(--accent); color: var(--on-accent); font-weight: 700; box-shadow: none; }
  .cal-day-empty { height: 36px; }

  .cal-time-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--border); }
  .cal-time-label { font-size: .78rem; color: var(--muted); }
  .cal-times { display: flex; flex-wrap: wrap; gap: 5px; }
  .cal-time { display: inline-flex; align-items: center; font-variant-numeric: tabular-nums; }
  .cal-time-box { margin-top: 8px; }

  .cal-footer { display: flex; justify-content: space-between; margin-top: 10px; }
  .cal-footer-btn {
    padding: .3rem .4rem; border: 0; border-radius: var(--radius-sm); background: none;
    font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer;
    transition: background var(--dur-hover) var(--ease-hover);
  }
  .cal-footer-btn:hover { background: var(--hover); }
  .cal-footer-btn-clear { color: var(--danger); }
  .cal-footer-btn-done { color: var(--accent); margin-left: auto; }
</style>
