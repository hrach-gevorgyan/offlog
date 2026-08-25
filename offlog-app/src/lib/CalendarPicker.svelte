<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import TimePicker from './TimePicker.svelte';
  import { fmtTime } from './utils';

  // Themed calendar/date picker replacing the native OS one.
  // Two value formats, chosen by `withTime`:
  //   withTime=false: 'YYYY-MM-DD'       (as <input type=date>)
  //   withTime=true:  'YYYY-MM-DDTHH:mm' (as <input type=datetime-local>)
  // Emits 'change' with the new string in that same format; the parent
  // owns the actual field (due_date/reminder_at).
  export let value: string = '';
  export let withTime = false;
  export let disabled = false;
  export let placeholder = 'Select date…';

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

  $: selected = parseDate(value);
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  // Re-sync the visible month to the selected date only while opening —
  // otherwise navigating to another month while picking a time (withTime)
  // keeps snapping back to the selected date's month.
  $: if (open) { const d = selected ?? new Date(); viewYear = d.getFullYear(); viewMonth = d.getMonth(); }

  let timeVal = '09:00';
  $: timeVal = withTime && value.length >= 16 ? value.slice(11, 16) : timeVal;

  function toggle() {
    if (disabled) return;
    open = !open;
    if (open) positionPopover();
  }
  function close() { open = false; }

  // Re-measure on month navigation: a 5-week vs 6-week month changes the
  // grid's height, and so whether it still fits below the trigger.
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
  $: cells = buildCells(viewYear, viewMonth);

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

  $: displayLabel = !selected ? placeholder
    : withTime ? `${selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${fmtTime(new Date(`1970-01-01T${timeVal}`))}`
    : selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div class="cal-field" bind:this={wrapEl}>
  <button type="button" class="cal-trigger" class:has-value={!!value} class:open bind:this={triggerEl} on:click={toggle} {disabled}>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5"/><line x1="2" y1="6.5" x2="14" y2="6.5"/><line x1="5.5" y1="1.5" x2="5.5" y2="4.5"/><line x1="10.5" y1="1.5" x2="10.5" y2="4.5"/>
    </svg>
    <span>{displayLabel}</span>
  </button>

  {#if open}
    <div class="cal-popover" bind:this={popoverEl} style={popoverStyle}>
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
            >{cell.getDate()}</button>
          {:else}
            <span class="cal-day-empty"></span>
          {/if}
        {/each}
      </div>
      {#if withTime}
        <div class="cal-time-row">
          <TimePicker value={timeVal} on:change={onTimeChange} />
        </div>
      {/if}
      <div class="cal-footer">
        <button type="button" class="cal-footer-btn" on:click={goToday}>Today</button>
        {#if value}<button type="button" class="cal-footer-btn cal-footer-btn-clear" on:click={clear}>Clear</button>{/if}
      </div>
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
    background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    box-shadow: 0 12px 32px rgba(0,0,0,.2); padding: 10px; width: 232px;
  }
  .cal-header { display: flex; align-items: center; justify-content: space-between; padding: 2px 2px 8px; }
  .cal-nav {
    background: none; border: none; cursor: pointer; color: var(--muted);
    font-size: 1rem; line-height: 1; padding: 3px 8px; border-radius: 6px;
  }
  .cal-nav:hover { background: var(--hover); color: var(--text); }
  .cal-month-label { font-size: .82rem; font-weight: 700; color: var(--text); letter-spacing: -.01em; }

  .cal-dow {
    display: grid; grid-template-columns: repeat(7, 1fr);
    margin-bottom: 2px;
  }
  .cal-dow span {
    text-align: center; font-family: var(--mono); font-size: .6rem;
    color: var(--faint); text-transform: uppercase; padding: 3px 0;
  }

  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .cal-day {
    aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
    background: none; border: none; border-radius: 6px; cursor: pointer;
    font-size: .78rem; color: var(--text);
  }
  .cal-day:hover { background: var(--hover); }
  .cal-day.today { color: var(--accent); font-weight: 700; }
  .cal-day.selected { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .cal-day-empty { aspect-ratio: 1; }

  .cal-time-row { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }

  .cal-footer { display: flex; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .cal-footer-btn {
    flex: 1; padding: .3rem 0; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .76rem; font-weight: 500; cursor: pointer;
  }
  .cal-footer-btn:hover { background: var(--hover); }
  .cal-footer-btn-clear { color: var(--danger); }
</style>
