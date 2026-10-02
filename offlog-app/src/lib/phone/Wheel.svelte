<script lang="ts">
  // One scroll wheel: the item that snaps to the middle is the value. Arrow
  // keys step it for keyboard users; tapping an item scrolls it into the middle.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let items: { value: number; label: string }[];
  export let value: number;
  export let label: string;

  // Must match .it's height below.
  const ITEM = 44;
  const dispatch = createEventDispatcher<{ change: number }>();
  let el: HTMLDivElement;
  $: index = Math.max(0, items.findIndex(i => i.value === value));

  onMount(() => { el.scrollTop = index * ITEM; });

  // Read where the wheel came to rest once scrolling pauses; reading on every
  // scroll event would flick the value through each item it passes.
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() { clearTimeout(settleTimer); settleTimer = setTimeout(settle, 90); }
  function settle() {
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
    if (items[i].value !== value) { value = items[i].value; dispatch('change', value); }
  }
  onDestroy(() => clearTimeout(settleTimer));

  function go(i: number) {
    i = Math.min(items.length - 1, Math.max(0, i));
    el.scrollTo?.({ top: i * ITEM, behavior: 'smooth' });
    if (items[i].value !== value) { value = items[i].value; dispatch('change', value); }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); go(index + 1); }
  }
</script>

<div class="wheel" bind:this={el} on:scroll={onScroll} on:keydown={onKey} tabindex="0"
  role="spinbutton" aria-label={label} aria-valuenow={value} aria-valuetext={items[index]?.label}>
  <div class="pad"></div>
  {#each items as it, i (it.value)}
    <button class="it" class:on={i === index} tabindex="-1" on:click={() => go(i)}>{it.label}</button>
  {/each}
  <div class="pad"></div>
</div>

<style>
  .wheel {
    height: 220px; overflow-y: auto; scroll-snap-type: y mandatory; scrollbar-width: none; overscroll-behavior: contain;
    -webkit-mask-image: linear-gradient(transparent, black 30%, black 70%, transparent);
    mask-image: linear-gradient(transparent, black 30%, black 70%, transparent);
  }
  .wheel::-webkit-scrollbar { display: none; }
  .pad { height: 88px; }
  .it {
    display: flex; align-items: center; justify-content: center; width: 100%; height: 44px; scroll-snap-align: center;
    border: 0; background: none; padding: 0; cursor: pointer; font: inherit; font-size: 22px; color: var(--faint);
    font-variant-numeric: tabular-nums; transition: color var(--dur-hover) var(--ease-hover), font-size var(--dur-hover) var(--ease-hover);
  }
  .it.on { font-size: 30px; font-weight: 600; color: var(--text); }
</style>
