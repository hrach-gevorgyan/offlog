<script lang="ts">
  // One tag: rename (onto another tag = merge), colour, merge, remove.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { renameTag, deleteTagEverywhere, setTagColor } from '../../../db';
  import { reloadTasks, showError } from '../../../store';
  import { confirmAction } from '../../../confirm';
  import { TAG_PALETTE, hashTagColor, soften } from '../../../tagColors';
  import Sheet from '../../Sheet.svelte';
  import { showToast } from '../../nav';

  export let tag: string;
  export let items: { tag: string; count: number }[];
  export let overrides: Record<string, string>;

  const dispatch = createEventDispatcher<{ close: void; changed: void }>();
  let sheet: Sheet;

  $: count = items.find(i => i.tag === tag)?.count ?? 0;
  $: others = items.map(i => i.tag).filter(t => t !== tag).sort((a, b) => a.localeCompare(b));
  $: current = overrides[tag] ?? null;
  const tasks = (n: number) => `${n} task${n === 1 ? '' : 's'}`;
  // Tags are stored lowercase with dashes for spaces.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-');

  let name = tag;
  let done = false;

  async function rename() {
    const next = norm(name);
    if (!next || next === tag) { name = tag; return; }
    const merging = items.some(i => i.tag === next);
    if (merging) { await merge(next); return; }
    done = true;
    try {
      await renameTag(tag, next);
      await reloadTasks();
    } catch {
      done = false;
      name = tag;
      showError('Failed to rename tag. Please try again.');
      return;
    }
    sheet?.close();
    dispatch('changed');
    const old = tag;
    showToast(`Renamed to #${next}`, async () => {
      try {
        await renameTag(next, old);
        await reloadTasks();
      } catch { showError('Failed to rename tag. Please try again.'); }
    });
  }

  // Merging can't be split apart again, so it asks first.
  async function merge(into: string) {
    if (!(await confirmAction(`Merge #${tag} into #${into}? Its ${tasks(count)} will be tagged #${into} instead.`, { danger: true, confirmLabel: 'Merge' }))) { name = tag; return; }
    done = true;
    try {
      await renameTag(tag, into);
      await reloadTasks();
    } catch {
      done = false;
      name = tag;
      showError('Failed to rename tag. Please try again.');
      return;
    }
    sheet?.close();
    dispatch('changed');
    showToast(`Merged into #${into}`);
  }

  // Android back with the field focused fires no change event.
  onDestroy(() => {
    const next = norm(name);
    if (done || !next || next === tag || items.some(i => i.tag === next)) return;
    renameTag(tag, next).then(() => reloadTasks(), () => showError('Failed to rename tag. Please try again.'));
  });

  async function pickColor(c: string | null) {
    try {
      await setTagColor(tag, c);
      dispatch('changed');
    } catch {
      showError('Failed to update tag color. Please try again.');
    }
  }

  async function remove() {
    if (!(await confirmAction(`Remove #${tag} from ${tasks(count)}? This can't be undone.`, { danger: true, confirmLabel: 'Remove' }))) return;
    done = true;
    try {
      await deleteTagEverywhere(tag);
      await reloadTasks();
    } catch {
      done = false;
      showError('Failed to delete tag. Please try again.');
      return;
    }
    sheet?.close();
    dispatch('changed');
    showToast(`#${tag} removed everywhere`);
  }
</script>

<Sheet bind:this={sheet} title="#{tag}" on:close={() => dispatch('close')}>
  <input class="p-fld" bind:value={name} aria-label="Tag name" enterkeyhint="done" autocapitalize="off"
    on:change={rename} on:keydown={e => e.key === 'Enter' && e.currentTarget.blur()} />

  <div class="p-lab">Colour</div>
  <div class="sw" role="radiogroup" aria-label="Colour">
    <button role="radio" aria-checked={current === null} aria-label="Automatic" class="auto" class:on={current === null} on:click={() => pickColor(null)}>
      <span style:background={soften(hashTagColor(tag))}>A</span>
    </button>
    {#each TAG_PALETTE as c (c)}
      <button role="radio" aria-checked={current === c} aria-label="Colour {c}" class:on={current === c} on:click={() => pickColor(c)}>
        <span style:background={soften(c)}></span>
      </button>
    {/each}
  </div>

  {#if others.length}
    <div class="p-lab">Merge into</div>
    <div class="p-cpick">
      {#each others as o (o)}
        <button class="p-chip" on:click={() => merge(o)}>#{o}</button>
      {/each}
    </div>
  {/if}

  <div class="p-group"><button class="p-row danger" on:click={remove}>Remove from {tasks(count)}</button></div>
</Sheet>

<style>
  .sw { display: flex; flex-wrap: wrap; gap: 0; margin: 0 0 12px; }
  .sw button { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: none; border: 0; padding: 0; cursor: pointer; border-radius: 50%; }
  .sw span { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .sw .on span { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--text); }
  .auto span { font-size: var(--p-fs-xs); font-weight: 700; color: var(--text); }
</style>
