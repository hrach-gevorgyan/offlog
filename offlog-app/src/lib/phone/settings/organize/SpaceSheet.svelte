<script lang="ts">
  // One space: name, colour, icon, order, delete — or a new one (id null).
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { createSpace, updateSpace, reorderSpaces, deleteSpace, findSpacesByName } from '../../../db';
  import { showError } from '../../../store';
  import { confirmAction } from '../../../confirm';
  import type { SpaceDoc } from '../../../types';
  import { SPACE_ICONS, DEFAULT_SPACE_ICON_KEY } from '../../../spaceIcons';
  import { TAG_PALETTE, soften, colourName } from '../../../tagColors';
  import Sheet from '../../Sheet.svelte';
  import { showToast } from '../../nav';

  export let id: string | null;
  export let items: SpaceDoc[];
  // Live projects in this space (they move to Unsorted on delete).
  export let count = 0;

  const dispatch = createEventDispatcher<{ close: void; changed: void }>();
  let sheet: Sheet;

  // Eight calm hues; any other colour through the custom picker.
  const SWATCHES = [0, 2, 3, 8, 11, 14, 16, 22].map(i => TAG_PALETTE[i]);
  const DEFAULT_COLOR = TAG_PALETTE[16];
  const svgOf = (inner: string) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  $: idx = id ? items.findIndex(s => s._id === id) : -1;
  $: space = idx >= 0 ? items[idx] : null;

  // New-space draft; an existing space edits live.
  let name = id ? (items.find(s => s._id === id)?.name ?? '') : '';
  let newColor = DEFAULT_COLOR;
  let newIcon = DEFAULT_SPACE_ICON_KEY;
  $: color = space ? space.color : newColor;
  $: custom = !SWATCHES.some(c => same(c, color));
  $: icon = space ? (space.icon ?? DEFAULT_SPACE_ICON_KEY) : newIcon;

  // A hint only, never blocking.
  let dupHint = '';
  let dupSeq = 0;
  async function checkDuplicate() {
    const seq = ++dupSeq, trimmed = name.trim();
    if (!trimmed) { dupHint = ''; return; }
    try {
      const matches = await findSpacesByName(trimmed, id ?? undefined);
      if (seq === dupSeq) dupHint = matches.length ? `“${trimmed}” already exists.` : '';
    } catch { dupHint = ''; }
  }

  let input: HTMLInputElement;
  onMount(() => { if (!id) input?.focus(); });

  let renamed = false;
  async function rename() {
    const s = space, next = name.trim();
    if (!s || !next || next === s.name) { if (s && !next) name = s.name; return; }
    const old = s.name;
    renamed = true;
    try {
      await updateSpace(s._id, { name: next });
      dispatch('changed');
    } catch {
      name = old;
      showError('Could not rename space. Please try again.');
      return;
    }
    showToast(`Renamed to ${next}`, async () => {
      try { await updateSpace(s._id, { name: old }); } catch { showError('Could not rename space. Please try again.'); }
    });
  }
  // Android back with the field focused fires no change event.
  onDestroy(() => {
    const s = space, next = name.trim();
    if (renamed || !s || !next || next === s.name) return;
    updateSpace(s._id, { name: next }).catch(() => showError('Could not rename space. Please try again.'));
  });
  function typed() { renamed = false; checkDuplicate(); }

  async function setColor(c: string) {
    if (!space) { newColor = c; return; }
    try {
      await updateSpace(space._id, { color: c });
      dispatch('changed');
    } catch {
      showError('Could not recolor space. Please try again.');
    }
  }

  async function setIcon(key: string) {
    if (!space) { newIcon = key; return; }
    try {
      await updateSpace(space._id, { icon: key });
      dispatch('changed');
    } catch {
      showError('Could not change space icon. Please try again.');
    }
  }

  async function move(dir: -1 | 1) {
    const i = idx, j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const ids = items.map(s => s._id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await reorderSpaces(ids);
      dispatch('changed');
    } catch {
      showError('Could not reorder spaces. Please try again.');
    }
  }

  async function remove() {
    const s = space;
    if (!s) return;
    const moves = count ? ` Its ${count} project${count === 1 ? '' : 's'} move to Unsorted.` : '';
    if (!(await confirmAction(`Delete “${s.name}”?${moves}`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteSpace(s._id);
    } catch {
      showError('Could not delete space. Please try again.');
      return;
    }
    renamed = true;
    sheet?.close();
    dispatch('changed');
    showToast(`Deleted ${s.name}`);
  }

  let creating = false;
  async function create() {
    const n = name.trim();
    if (!n || creating) return;
    creating = true;
    try {
      await createSpace(n, newColor, newIcon);
    } catch {
      creating = false;
      showError('Could not create space. Please try again.');
      return;
    }
    sheet?.close();
    dispatch('changed');
  }
</script>

<Sheet bind:this={sheet} title={id ? 'Space' : 'New space'} on:close={() => dispatch('close')}>
  {#if id && !space}
    <p class="p-empty">This space no longer exists.</p>
  {:else}
    <input class="p-fld" bind:this={input} bind:value={name} placeholder="Space name" aria-label="Space name" enterkeyhint="done"
      on:input={typed}
      on:change={() => id && rename()}
      on:keydown={e => { if (e.key === 'Enter') { if (id) e.currentTarget.blur(); else create(); } }} />
    {#if dupHint}<p class="hint" role="status">{dupHint}</p>{/if}

    <div class="p-lab">Color</div>
    <div class="sw" role="radiogroup" aria-label="Color">
      {#each SWATCHES as c (c)}
        <button role="radio" aria-checked={same(color, c)} aria-label={colourName(c)} class:on={same(color, c)} on:click={() => setColor(c)}>
          <span style:background={soften(c)}></span>
        </button>
      {/each}
      <label class="custom" class:on={custom} title="Any colour">
        <input type="color" value={color} aria-label="Any colour" on:change={e => setColor(e.currentTarget.value)} />
        <span class:pick={!custom} style:background={custom ? soften(color) : null}></span>
      </label>
    </div>

    <div class="p-lab">Icon</div>
    <div class="icons" role="radiogroup" aria-label="Icon">
      {#each SPACE_ICONS as o (o.key)}
        <button role="radio" aria-checked={icon === o.key} aria-label="Icon {o.key}" class:on={icon === o.key} on:click={() => setIcon(o.key)}>{@html svgOf(o.svg)}</button>
      {/each}
    </div>

    {#if space}
      <div class="p-group">
        <button class="p-row" disabled={idx <= 0} on:click={() => move(-1)}>Move up</button>
        <button class="p-row" disabled={idx >= items.length - 1} on:click={() => move(1)}>Move down</button>
      </div>
      {#if space._id !== 'space:unsorted'}
        <div class="p-group"><button class="p-row danger" on:click={remove}>Delete space</button></div>
      {/if}
    {:else}
      <button class="p-go" disabled={!name.trim() || creating} on:click={create}>Add space</button>
    {/if}
  {/if}
</Sheet>

<style>
  .hint { font-size: var(--p-fs-s); color: var(--due-soon-ink); margin: -8px 4px 12px; }
  .sw { display: flex; flex-wrap: wrap; gap: 2px; margin: 0 0 12px; }
  .sw button, .custom { position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: none; border: 0; padding: 0; cursor: pointer; border-radius: 50%; }
  .sw span { width: 30px; height: 30px; border-radius: 50%; display: block; }
  .sw .on span { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--text); }
  .custom input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
  .custom span.pick { background: conic-gradient(from 0deg, var(--danger), var(--due-soon-ink), var(--success), var(--accent), var(--danger)); }
  .custom:focus-within span { outline: 2px solid var(--accent); outline-offset: 2px; }
  .icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 4px; margin: 0 0 14px; }
  .icons button { height: 44px; display: flex; align-items: center; justify-content: center; background: none; border: 0; border-radius: 10px; color: var(--muted); cursor: pointer; }
  .icons button:active { background: var(--col-bg); }
  .icons button.on { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-ink); }
  .icons :global(svg) { width: 20px; height: 20px; }
</style>
