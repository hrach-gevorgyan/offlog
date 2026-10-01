<script lang="ts">
  // Filter a project's board and list. Choices are a draft until "Show N
  // tasks"; a saved filter applies at once. Mount behind a {#key} bumped per open.
  import { createEventDispatcher } from 'svelte';
  import type { CustomFieldDef, ProjectDoc, TaskDoc } from '../../types';
  import { PRIORITY_LABEL } from '../../constants';
  import { applyFilter, activeCount, loadSaved, saveFilter, deleteSaved, EMPTY, type Filter } from './filter';
  import { I } from '../icons';
  import Sheet from '../Sheet.svelte';

  export let project: ProjectDoc;
  export let tasks: TaskDoc[];
  export let filter: Filter;
  export let customFields: CustomFieldDef[] = [];
  // List keeps its search in its own field, which Clear leaves alone.
  export let list = false;

  const dispatch = createEventDispatcher<{ apply: Filter; close: void }>();
  let sheet: Sheet;
  let draft: Filter = { ...filter, fields: filter.fields.map(f => ({ ...f })) };
  let saved = loadSaved(project._id);
  let name = '';

  const PRIOS: (1 | 2 | 3)[] = [3, 2, 1];
  $: tags = [...new Set(tasks.flatMap(t => t.tags))].sort();
  // Only fields some task here has a value for, each with the values in use.
  $: fieldValues = customFields
    .map(f => ({ f, values: [...new Set(tasks.map(t => t.custom_values?.[f.id]).filter(v => v !== undefined && v !== null && v !== '').map(String))].sort() }))
    .filter(x => x.values.length);
  $: n = applyFilter(tasks, draft).length;
  $: dirty = activeCount(draft) > 0 || (!list && !!draft.search);

  const pick = <K extends 'col' | 'tag'>(k: K, v: string) => { draft = { ...draft, [k]: draft[k] === v ? '' : v }; };
  const pickPrio = (v: number) => { draft = { ...draft, prio: draft.prio === v ? 0 : v }; };
  const fieldValue = (id: string) => draft.fields.find(f => f.fieldId === id)?.value ?? '';
  function pickField(id: string, v: string) {
    const rest = draft.fields.filter(f => f.fieldId !== id);
    draft = { ...draft, fields: fieldValue(id) === v ? rest : [...rest, { fieldId: id, value: v }] };
  }

  function apply(f: Filter) { dispatch('apply', f); sheet.close(); }
  function save() {
    const nm = name.trim();
    if (!nm) return;
    saved = saveFilter(project._id, nm, draft);
    name = '';
  }
</script>

<Sheet bind:this={sheet} title="Filter" on:close={() => dispatch('close')}>
  {#if saved.length}
    <div class="p-lab">Saved</div>
    <div class="p-cpick">
      {#each saved as s (s.name)}
        <span class="saved">
          <button class="p-chip" on:click={() => apply(s.filter)}>{s.name}</button>
          <button class="del" aria-label="Delete filter {s.name}" on:click={() => (saved = deleteSaved(project._id, s.name))}>{@html I.x}</button>
        </span>
      {/each}
    </div>
  {/if}

  <div class="p-lab">Status</div>
  <div class="p-cpick">
    {#each project.columns as c (c.id)}
      <button class="p-chip" class:on={draft.col === c.id} aria-pressed={draft.col === c.id} on:click={() => pick('col', c.id)}>{c.name}</button>
    {/each}
  </div>

  <div class="p-lab">Priority</div>
  <div class="p-cpick">
    {#each PRIOS as v}
      <button class="p-chip" class:on={draft.prio === v} aria-pressed={draft.prio === v} on:click={() => pickPrio(v)}>{PRIORITY_LABEL[v]}</button>
    {/each}
  </div>

  {#if tags.length}
    <div class="p-lab">Tags</div>
    <div class="p-cpick">
      {#each tags as g}
        <button class="p-chip" class:on={draft.tag === g} aria-pressed={draft.tag === g} on:click={() => pick('tag', g)}>#{g}</button>
      {/each}
    </div>
  {/if}

  {#each fieldValues as { f, values } (f.id)}
    <div class="p-lab">{f.name}</div>
    <div class="p-cpick">
      {#each values as v}
        <button class="p-chip" class:on={fieldValue(f.id) === v} aria-pressed={fieldValue(f.id) === v} on:click={() => pickField(f.id, v)}>{v}</button>
      {/each}
    </div>
  {/each}

  {#if draft.search}<p class="p-say">Also matching “{draft.search}”.</p>{/if}

  <button class="p-go" on:click={() => apply(draft)}>Show {n} {n === 1 ? 'task' : 'tasks'}</button>
  {#if dirty}<button class="p-row center" on:click={() => apply({ ...EMPTY, search: list ? draft.search : '' })}>Clear</button>{/if}

  <div class="p-lab save-lab">Save this filter</div>
  <div class="save">
    <input class="p-fld" bind:value={name} placeholder="Name this filter" aria-label="Filter name" on:keydown={e => e.key === 'Enter' && save()} />
    <button class="p-tbtn" disabled={!name.trim()} on:click={save}>Save</button>
  </div>
</Sheet>

<style>
  .saved { display: inline-flex; align-items: center; }
  .del { width: 44px; height: 44px; margin-left: -6px; display: flex; align-items: center; justify-content: center; background: none; border: 0; padding: 0; color: var(--faint); cursor: pointer; border-radius: 50%; }
  .del:active { background: var(--col-bg); }
  .del :global(svg.i) { width: 15px; height: 15px; }
  .center { justify-content: center; font-weight: 600; color: var(--accent); }
  .save-lab { margin-top: 18px; }
  .save { display: flex; gap: 8px; align-items: flex-start; }
  .save .p-fld { flex: 1; }
  .save .p-tbtn { margin-top: 4px; }
</style>
