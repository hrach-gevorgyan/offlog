<script lang="ts">
  // One custom field: name, type, options, remove — or a new one (field null).
  import { createEventDispatcher, onMount } from 'svelte';
  import { addCustomFieldDef, updateCustomFieldDef, removeCustomFieldDef, getCustomFieldUsageCount } from '../../../db';
  import { showError } from '../../../store';
  import { confirmAction } from '../../../confirm';
  import type { CustomFieldDef } from '../../../types';
  import Sheet from '../../Sheet.svelte';
  import { showToast } from '../../nav';

  export let field: CustomFieldDef | null;

  const dispatch = createEventDispatcher<{ close: void; changed: void }>();
  let sheet: Sheet;
  const TYPES: [CustomFieldDef['type'], string][] = [['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['select', 'Select']];

  const editing = !!field;
  let name = field?.name ?? '';
  let type: CustomFieldDef['type'] = field?.type ?? 'text';
  let options = (field?.options ?? []).join(', ');
  const parse = (s: string) => s.split(',').map(o => o.trim()).filter(Boolean);

  let input: HTMLInputElement;
  onMount(() => { if (!editing) input?.focus(); });

  let busy = false;
  async function save() {
    const n = name.trim();
    if (!n || busy) return;
    const opts = type === 'select' ? parse(options) : undefined;
    busy = true;
    try {
      if (field) await updateCustomFieldDef(field.id, { name: n, type, options: opts });
      else await addCustomFieldDef(n, type, opts);
    } catch {
      busy = false;
      showError(field ? 'Failed to update field. Please try again.' : 'Failed to add field. Please try again.');
      return;
    }
    sheet?.close();
    dispatch('changed');
    if (field) {
      const old = field;
      showToast('Field saved', async () => {
        try { await updateCustomFieldDef(old.id, { name: old.name, type: old.type, options: old.options }); }
        catch { showError('Failed to update field. Please try again.'); }
      });
    }
  }

  async function remove() {
    const f = field;
    if (!f || busy) return;
    busy = true;
    try {
      const n = await getCustomFieldUsageCount(f.id);
      const usage = n > 0 ? ` Its value is erased from ${n} task${n === 1 ? '' : 's'}.` : '';
      if (!(await confirmAction(`Remove “${f.name}”?${usage}`, { danger: true, confirmLabel: 'Remove' }))) return;
      await removeCustomFieldDef(f.id);
    } catch {
      showError('Failed to remove field. Please try again.');
      return;
    } finally {
      busy = false;
    }
    sheet?.close();
    dispatch('changed');
    showToast(`Removed ${f.name}`);
  }
</script>

<Sheet bind:this={sheet} title={editing ? 'Field' : 'New field'} on:close={() => dispatch('close')}>
  <input class="p-fld" bind:this={input} bind:value={name} placeholder="Field name" aria-label="Field name" enterkeyhint="done"
    on:keydown={e => e.key === 'Enter' && save()} />

  <div class="p-lab">Type</div>
  <div class="p-cpick" role="radiogroup" aria-label="Type">
    {#each TYPES as [k, label] (k)}
      <button class="p-chip" role="radio" aria-checked={type === k} class:on={type === k} on:click={() => (type = k)}>{label}</button>
    {/each}
  </div>

  {#if type === 'select'}
    <div class="p-lab">Options</div>
    <input class="p-fld" bind:value={options} placeholder="Comma-separated" aria-label="Options" enterkeyhint="done"
      on:keydown={e => e.key === 'Enter' && save()} />
  {/if}

  <button class="p-go" disabled={!name.trim() || busy} on:click={save}>{editing ? 'Save' : 'Add field'}</button>

  {#if editing}
    <div class="p-group rm"><button class="p-row danger" disabled={busy} on:click={remove}>Remove field</button></div>
  {/if}
</Sheet>

<style>
  .rm { margin-top: 14px; }
</style>
