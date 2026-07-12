<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';

  // Native <select> renders as the bare OS picker on Android (a plain list
  // in a system sheet, no app styling at all) — jarring next to every other
  // overlay in the app, which is a themed panel. This is a themed dropdown
  // that looks and behaves the same on every platform. Keyboard-navigable
  // (Up/Down/Enter/Escape) and closes on an outside click; Escape here
  // stops propagation so it only closes this popover, not a parent modal
  // it happens to be opened inside of.
  export let options: { value: string; label: string; group?: string }[] = [];
  export let value: string;
  export let placeholder = 'Select…';
  export let placement: 'up' | 'down' = 'down';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  let open = false;
  let triggerEl: HTMLButtonElement;
  let panelEl: HTMLDivElement;
  let highlighted = 0;

  $: selected = options.find(o => o.value === value);
  $: grouped = groupOptions(options);

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
</script>

<svelte:window on:click={onWindowClick} />

<div class="custom-select">
  <button
    type="button"
    class="cs-trigger"
    class:cs-disabled={disabled}
    bind:this={triggerEl}
    {disabled}
    on:click={toggle}
    on:keydown={onTriggerKey}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span class="cs-value">{selected?.label ?? placeholder}</span>
    <svg class="cs-chevron" viewBox="0 0 10 6" width="10" height="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 5,5 9,1" /></svg>
  </button>

  {#if open}
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <div class="cs-panel" class:placement-up={placement === 'up'} bind:this={panelEl} role="listbox" tabindex="-1" on:keydown={onPanelKey}>
      {#each grouped as [group, opts] (group)}
        {#if group}<div class="cs-group-label">{group}</div>{/if}
        {#each opts as o (o.value)}
          {@const idx = options.indexOf(o)}
          <button
            type="button"
            class="cs-option"
            class:selected={o.value === value}
            class:highlighted={idx === highlighted}
            role="option"
            aria-selected={o.value === value}
            on:click={() => choose(o)}
            on:mouseenter={() => highlighted = idx}
          >{o.label}</button>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .custom-select { position: relative; width: 100%; }

  .cs-trigger {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: .45rem .6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font-size: .88rem; font-family: inherit;
    cursor: pointer; text-align: left; transition: border-color .12s;
  }
  .cs-trigger:hover { border-color: var(--border-strong); }
  .cs-trigger.cs-disabled { opacity: .5; cursor: default; }
  .cs-trigger:focus-visible, .cs-trigger[aria-expanded="true"] { outline: none; border-color: var(--accent); }
  .cs-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cs-chevron { flex-shrink: 0; opacity: .6; }

  .cs-panel {
    position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 20;
    background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    box-shadow: 0 12px 32px rgba(0,0,0,.22); max-height: 240px; overflow-y: auto;
    padding: .3rem; display: flex; flex-direction: column; gap: 1px;
    animation: cs-pop .12s cubic-bezier(0.4,0,0.2,1) both;
  }
  .cs-panel.placement-up { top: auto; bottom: calc(100% + 6px); }
  @keyframes cs-pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

  .cs-group-label {
    font-family: var(--mono); font-size: .62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--faint); padding: .35rem .5rem .15rem;
  }
  .cs-option {
    display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer;
    padding: .4rem .55rem; border-radius: 6px; font-size: .85rem; color: var(--text);
  }
  .cs-option.highlighted { background: var(--hover); }
  .cs-option.selected { color: var(--accent); font-weight: 600; }
</style>
