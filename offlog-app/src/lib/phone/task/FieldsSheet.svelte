<script lang="ts">
  import { shortDate } from '../format';
  // Field definitions are managed in Settings; here a task only fills values,
  // keyed by field id so a rename never orphans them. Every type shares one
  // row: name left, value right, a muted "—" when empty.
  import type { TaskDoc, CustomFieldDef } from '../../types';
  import CalendarPicker from '../../CalendarPicker.svelte';
  import { I } from '../icons';


  export let task: TaskDoc;
  export let fields: CustomFieldDef[];
  export let save: (changes: Partial<TaskDoc>, err: string) => Promise<boolean>;

  $: values = task.custom_values ?? {};
  // The select field whose options are showing under its row.
  let choosing: string | null = null;

  function set(id: string, v: string | number | null) {
    if ((values[id] ?? null) === v) return;
    save({ custom_values: { ...values, [id]: v } }, 'Could not save the field. Please try again.');
  }

  function choose(id: string, v: string | null) {
    choosing = null;
    set(id, v);
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
        <span class="pick"><CalendarPicker value={(values[f.id] as string) ?? ''} bare placeholder="—" formatDate={shortDate} on:change={e => set(f.id, e.detail || null)} /></span>
      </div>
    {:else if f.type === 'select'}
      {@const v = (values[f.id] as string) ?? ''}
      <button class="p-row" aria-expanded={choosing === f.id} on:click={() => choosing = choosing === f.id ? null : f.id}>
        <span class="p-k"><span>{f.name}</span></span>
        <span class="p-v" class:set={!!v}>{v || '—'}</span>
      </button>
      {#if choosing === f.id}
        {#each f.options ?? [] as o}
          <button class="p-row opt" aria-pressed={o === v} on:click={() => choose(f.id, o)}>
            <span class="p-k"><span>{o}</span></span>
            {#if o === v}<span class="p-tick">{@html I.check}</span>{/if}
          </button>
        {/each}
        {#if v}
          <button class="p-row opt" on:click={() => choose(f.id, null)}><span class="p-k"><span>Clear</span></span></button>
        {/if}
      {/if}
    {:else}
      <label class="p-row">
        <span class="p-k"><span>{f.name}</span></span>
        <input class="val" type={f.type === 'number' ? 'number' : 'text'} inputmode={f.type === 'number' ? 'decimal' : undefined}
          value={values[f.id] ?? ''} placeholder="—"
          on:change={e => set(f.id, fromInput(f, e.currentTarget.value))} />
      </label>
    {/if}
  {/each}
</div>
<p class="p-say">Fields are added and renamed in Settings.</p>

<style>
  .fields { overflow: visible; }
  .fields div.p-row, .fields label.p-row { cursor: default; padding-top: 4px; padding-bottom: 4px; }
  .opt { padding-left: 32px; font-size: var(--p-fs-m); }
  .val {
    margin-left: auto; width: 52%; min-width: 0; min-height: 44px; box-sizing: border-box; text-align: right;
    font: inherit; font-size: var(--p-fs-m); font-weight: 500; color: var(--text); background: none; border: 0; padding: 6px 0;
  }
  .val::placeholder { color: var(--faint); font-weight: 400; }
  .val:focus { outline: none; box-shadow: 0 2px 0 var(--accent); }
  .pick { margin-left: auto; flex: 1; min-width: 0; font-size: var(--p-fs-m); font-weight: 500; }
</style>
