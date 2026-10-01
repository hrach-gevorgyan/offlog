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

<div class="p-sec">Steps{#if items.length}<span class="p-n">{doneCount} of {items.length}</span>{/if}</div>
<div class="p-group">
  {#each items as s, i}
    <div class="step" class:done={s.done}>
      <button class="tog" on:click={() => toggle(i)} aria-pressed={s.done} aria-label="{s.done ? 'Mark not done' : 'Mark done'}: {s.text}">
        <span class="chk" class:on={s.done}></span><span class="lbl">{s.text}</span>
      </button>
      <button class="x" on:click={() => remove(i)} aria-label="Remove step: {s.text}">{@html I.x}</button>
    </div>
  {/each}
  <input class="add" class:first={!items.length} bind:value={draft} on:keydown={onKey} on:blur={add} placeholder="Add a step" enterkeyhint="done" aria-label="Add a step" />
</div>
{#if dupes.length}<p class="p-say warn">Repeated step{dupes.length > 1 ? 's' : ''}: {dupes.join(', ')}</p>{/if}

<style>
  .step { display: flex; align-items: center; padding: 0 6px 0 0; }
  .step + .step { border-top: 1px solid var(--border); }
  .tog { flex: 1; min-width: 0; display: flex; gap: 12px; align-items: center; padding: 12px 0 12px 16px; min-height: 48px; font: inherit; font-size: var(--p-fs-l); color: var(--text); background: none; border: 0; text-align: left; cursor: pointer; }
  .tog:active { background: var(--col-bg); }
  .lbl { min-width: 0; overflow-wrap: anywhere; }
  .done .lbl { color: var(--faint); text-decoration: line-through; }
  .chk { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; position: relative; box-sizing: border-box; border: 2px solid color-mix(in srgb, var(--faint) 60%, transparent); }
  .chk.on { background: var(--accent); border-color: var(--accent); }
  .chk.on::after { content: ''; position: absolute; left: 5px; top: 1.5px; width: 4.5px; height: 9px; border: solid var(--on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg); }
  .x { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: var(--faint); border-radius: 50%; flex-shrink: 0; background: none; border: 0; padding: 0; cursor: pointer; }
  .x :global(svg.i) { width: 16px; height: 16px; }
  .x:active { background: var(--col-bg); }
  .add { width: 100%; box-sizing: border-box; border: 0; border-top: 1px solid var(--border); background: none; color: var(--text); outline: none; font: inherit; font-size: var(--p-fs-l); padding: 13px 14px 13px 48px; }
  .add.first { border-top: 0; }
  .add::placeholder { color: var(--faint); }
  .add:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
  .warn { color: var(--overdue-ink); margin-top: -6px; }
</style>
