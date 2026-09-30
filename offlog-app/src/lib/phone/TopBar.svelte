<script lang="ts">
  import { back, actions } from './nav';
  import { I } from './icons';

  export let title: string;
  export let sub = '';
  // A tab's first screen has no back arrow and carries the Settings gear.
  export let root = false;
</script>

<header class="bar">
  {#if !root}<button class="ib back" on:click={back} aria-label="Back">{@html I.back}</button>{/if}
  <h1 class:root>{title}</h1>
  <span class="acts">
    <slot />
    {#if root}<button class="ib" on:click={() => actions.openSettings()} aria-label="Settings">{@html I.gear}</button>{/if}
  </span>
</header>
{#if sub}<p class="sub"><slot name="sub-lead" />{sub}</p>{/if}

<style>
  .bar { display: flex; align-items: center; gap: 4px; min-height: 60px; }
  h1 { flex: 1; min-width: 0; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  h1.root { margin-left: 2px; }
  .acts { display: flex; gap: 2px; flex-shrink: 0; }
  .ib, .acts :global(.ib) {
    width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: none; border: 0; padding: 0; cursor: pointer; color: var(--muted);
  }
  .back { margin-left: -10px; color: var(--text); }
  .back :global(svg) { width: 24px; height: 24px; }
  .ib:active, .acts :global(.ib:active) { background: var(--col-bg); }
  .acts :global(.ib.on) { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .sub { font-size: 14px; color: var(--faint); margin: -6px 2px 16px; display: flex; align-items: center; gap: 6px; }
</style>
