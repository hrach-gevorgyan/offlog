<script lang="ts">
  // Field definitions are managed in Settings; here a task only fills values,
  // keyed by field id so a rename never orphans them.
  import type { TaskDoc, CustomFieldDef } from '../../types';
  import CalendarPicker from '../../CalendarPicker.svelte';

  export let task: TaskDoc;
  export let fields: CustomFieldDef[];
  export let save: (changes: Partial<TaskDoc>, err: string) => Promise<boolean>;

  $: values = task.custom_values ?? {};

  function set(id: string, v: string | number | null) {
    if ((values[id] ?? null) === v) return;
    save({ custom_values: { ...values, [id]: v } }, 'Could not save the field. Please try again.');
  }

  function fromInput(f: CustomFieldDef, raw: string): string | number | null {
    if (raw === '') return null;
    if (f.type === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : null; }
    return raw;
  }
</script>

<div class="p-group fields">
  {#each fields as f (f.id)}
    {#if f.type === 'date'}
      <!-- Not a <label>: a label re-clicks the picker's trigger and closes it again. -->
      <div class="p-row" role="group" aria-label={f.name}>
        <span class="p-k"><span>{f.name}</span></span>
        <span class="pick"><CalendarPicker value={(values[f.id] as string) ?? ''} placeholder="None" on:change={e => set(f.id, e.detail || null)} /></span>
      </div>
    {:else}
      <label class="p-row">
        <span class="p-k"><span>{f.name}</span></span>
        {#if f.type === 'select'}
          <select class="val" value={(values[f.id] as string) ?? ''} on:change={e => set(f.id, e.currentTarget.value || null)}>
            <option value="">None</option>
            {#each f.options ?? [] as o}<option value={o}>{o}</option>{/each}
          </select>
        {:else}
          <input class="val" type={f.type === 'number' ? 'number' : 'text'} inputmode={f.type === 'number' ? 'decimal' : undefined}
            value={values[f.id] ?? ''} placeholder="None"
            on:change={e => set(f.id, fromInput(f, e.currentTarget.value))} />
        {/if}
      </label>
    {/if}
  {/each}
</div>
<p class="p-say">Fields are added and renamed in Settings.</p>

<style>
  .fields { overflow: visible; }
  .fields .p-row { cursor: default; }
  .val {
    margin-left: auto; width: 52%; min-width: 0; box-sizing: border-box; text-align: right;
    font: inherit; font-size: 16px; color: var(--text); background: none; border: 0; padding: 6px 2px;
  }
  .val::placeholder { color: var(--faint); }
  .val:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 6px; }
  select.val { color: var(--accent); }
  .pick { margin-left: auto; width: 168px; flex-shrink: 0; }
</style>
