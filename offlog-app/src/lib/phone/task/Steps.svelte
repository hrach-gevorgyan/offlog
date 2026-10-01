<script lang="ts">
  // A task's checklist: flat, not nested or reorderable.
  import { createEventDispatcher } from 'svelte';
  import { findDuplicateChecklistItems } from '../../utils';
  import { hapticToggle } from '../../haptics';
  import { I } from '../icons';

  type Step = { text: string; done: boolean };
  export let items: Step[];

  const dispatch = createEventDispatcher<{ change: Step[] }>();
  let draft = '';

  $: doneCount = items.filter(s => s.done).length;
  $: dupes = findDuplicateChecklistItems(items);

  function toggle(i: number) {
    hapticToggle();
    dispatch('change', items.map((s, j) => (j === i ? { ...s, done: !s.done } : s)));
  }
  function remove(i: number) { dispatch('change', items.filter((_, j) => j !== i)); }
  function add() {
    const text = draft.trim();
    draft = '';
    if (text) dispatch('change', [...items, { text, done: false }]);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }
</script>

<div class="p-sec" role="heading" aria-level="2">Steps{#if items.length}<span class="p-n">{doneCount} of {items.length}</span>{/if}</div>
<div class="p-group">
  {#each items as s, i}
    <div class="step" class:done={s.done}>
      <button class="tog" on:click={() => toggle(i)} aria-pressed={s.done} aria-label="{s.done ? 'Mark not done' : 'Mark done'}: {s.text}">
        <span class="chk" class:on={s.done}></span><span class="lbl">{s.text}</span>
      </button>
      <button class="x" on:click={() => remove(i)} aria-label="Remove step: {s.text}">{@html I.x}</button>
    </div>
  {/each}
  <div class="addrow" class:first={!items.length}>
    <span class="plus" aria-hidden="true">{@html I.plus}</span>
    <input class="add" bind:value={draft} on:keydown={onKey} on:blur={add} placeholder="Add a step" enterkeyhint="done" aria-label="Add a step" />
  </div>
</div>
{#if dupes.length}<p class="p-say warn">Repeated step{dupes.length > 1 ? 's' : ''}: {dupes.join(', ')}</p>{/if}

<style>
  .step { display: flex; align-items: center; padding: 0 6px 0 0; }
  .step + .step { border-top: 1px solid var(--border); }
  .tog { transition: background var(--dur-hover) var(--ease-hover); flex: 1; min-width: 0; display: flex; gap: 12px; align-items: center; padding: 12px 0 12px 16px; min-height: 48px; font: inherit; font-size: var(--p-fs-l); color: var(--text); background: none; border: 0; text-align: left; cursor: pointer; }
  .tog:active { background: var(--col-bg); }
  .lbl { min-width: 0; overflow-wrap: anywhere; }
  .done .lbl { color: var(--faint); text-decoration: line-through; }
  .chk { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; position: relative; box-sizing: border-box; border: 2px solid var(--check-ring); }
  /* The fill and tick pop in (decelerate) and leave faster (accelerate). */
  .chk { transition: background var(--dur-small-out) var(--ease-accelerate), border-color var(--dur-small-out) var(--ease-accelerate); }
  .chk::after { content: ''; position: absolute; left: 5px; top: 1.5px; width: 4.5px; height: 9px; border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg) scale(.4); opacity: 0; transition: transform var(--dur-small-out) var(--ease-accelerate), opacity var(--dur-small-out) var(--ease-accelerate); }
  .chk.on { background: var(--accent); border-color: var(--accent); transition: background var(--dur-small) var(--ease-decelerate), border-color var(--dur-small) var(--ease-decelerate); }
  .chk.on::after { transform: rotate(45deg) scale(1); opacity: 1; transition: transform var(--dur-small) var(--ease-decelerate), opacity var(--dur-small) var(--ease-decelerate); }
  .x { transition: background var(--dur-hover) var(--ease-hover); width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--faint); border-radius: 50%; flex-shrink: 0; background: none; border: 0; padding: 0; cursor: pointer; }
  .x :global(svg.i) { width: 16px; height: 16px; }
  .x:active { background: var(--col-bg); }
  /* The + sits where a step's check circle does, so typed text lines up with the step labels. */
  .addrow { position: relative; border-top: 1px solid var(--border); }
  .addrow.first { border-top: 0; }
  .plus { position: absolute; left: 16px; top: 50%; width: 20px; height: 20px; margin-top: -10px; display: flex; align-items: center; justify-content: center; color: var(--faint); pointer-events: none; }
  .plus :global(svg.i) { width: 18px; height: 18px; }
  .add { width: 100%; box-sizing: border-box; border: 0; background: none; color: var(--text); outline: none; font: inherit; font-size: var(--p-fs-l); padding: 13px 14px 13px 48px; }
  .add::placeholder { color: var(--faint); }
  .add:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
  .warn { color: var(--overdue-ink); margin-top: -6px; }
</style>
