<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  // B38 — custom calendar/date picker instead of the native OS one.
  // Two value formats, chosen by `withTime`:
  //   withTime=false: plain 'YYYY-MM-DD' (matches <input type=date>)
  //   withTime=true:  'YYYY-MM-DDTHH:mm' (matches <input type=datetime-local>,
  //                   which is what CardDetail's reminder_at is kept in)
  // Emits 'change' with the new string in that same format — the parent
  // still owns the actual field (due_date/reminder_at), same as the
  // native inputs it replaces.
  export let value: string = '';
  export let withTime = false;
  export let disabled = false;
  export let placeholder = 'Select date…';

  const dispatch = createEventDispatcher<{ change: string }>();

  let open = false;
  let wrapEl: HTMLDivElement;

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
  // Re-sync the visible month to the selected date only when opening, not
  // on every keystroke-level reactivity — otherwise navigating to a
  // different month while picking a time (withTime) would keep snapping
  // back to the currently-selected date's month.
  $: if (open) { const d = selected ?? new Date(); viewYear = d.getFullYear(); viewMonth = d.getMonth(); }

  let timeVal = '09:00';
  $: timeVal = withTime && value.length >= 16 ? value.slice(11, 16) : timeVal;

  function toggle() { if (!disabled) open = !open; }
  function close() { open = false; }

  function prevMonth() { if (viewMonth === 0) { viewMonth = 11; viewYear -= 1; } else viewMonth -= 1; }
  function nextMonth() { if (viewMonth === 11) { viewMonth = 0; viewYear += 1; } else viewMonth += 1; }

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

  function onTimeChange() {
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
    : withTime ? `${selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${timeVal}`
    : selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div class="cal-field" bind:this={wrapEl}>
  <button type="button" class="cal-trigger" class:has-value={!!value} class:open on:click={toggle} {disabled}>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5"/><line x1="2" y1="6.5" x2="14" y2="6.5"/><line x1="5.5" y1="1.5" x2="5.5" y2="4.5"/><line x1="10.5" y1="1.5" x2="10.5" y2="4.5"/>
    </svg>
    <span>{displayLabel}</span>
  </button>

  {#if open}
    <div class="cal-popover">
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
          <input type="time" bind:value={timeVal} on:change={onTimeChange} />
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
    transition: border-color .12s;
  }
  .cal-trigger svg { flex-shrink: 0; opacity: .8; }
  .cal-trigger span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
  .cal-trigger.has-value { color: var(--text); }
  .cal-trigger.open, .cal-trigger:hover { border-color: var(--accent); }
  .cal-trigger:disabled { opacity: .55; cursor: default; }

  .cal-popover {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 220;
    background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    box-shadow: 0 12px 32px rgba(0,0,0,.2); padding: 10px; width: 232px;
  }
  .cal-header { display: flex; align-items: center; justify-content: space-between; padding: 2px 2px 8px; }
  .cal-nav {
    background: none; border: none; cursor: pointer; color: var(--muted);
    font-size: 1rem; line-height: 1; padding: 3px 8px; border-radius: 6px;
    transition: background .12s, color .12s;
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
    font-size: .78rem; color: var(--text); transition: background .1s, color .1s;
  }
  .cal-day:hover { background: var(--hover); }
  .cal-day.today { color: var(--accent); font-weight: 700; }
  .cal-day.selected { background: var(--accent); color: #fff; font-weight: 600; }
  .cal-day-empty { aspect-ratio: 1; }

  .cal-time-row { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .cal-time-row input {
    width: 100%; padding: .35rem .5rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--bg); color: var(--text);
    font-size: .82rem; font-family: 'Hanken Grotesk', sans-serif;
  }
  .cal-time-row input:focus { outline: none; border-color: var(--accent); }

  .cal-footer { display: flex; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .cal-footer-btn {
    flex: 1; padding: .3rem 0; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .76rem; font-weight: 500; cursor: pointer;
    transition: background .12s;
  }
  .cal-footer-btn:hover { background: var(--hover); }
  .cal-footer-btn-clear { color: var(--danger); }
</style>
