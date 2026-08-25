<script lang="ts">
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import type { CustomFieldDef } from '../types';
  import CalendarPicker from '../CalendarPicker.svelte';
  import CustomSelect from '../CustomSelect.svelte';

  export let showCustomFieldsBlock: boolean;
  export let customFields: CustomFieldDef[];
  export let visibleFields: CustomFieldDef[];
  export let customValues: Record<string, string | number | null>;
  export let showAllFields: boolean;
  export let VISIBLE_FIELD_CAP: number;
</script>

            <div class="extra-block">
              <button type="button" class="extra-block-toggle" on:click={() => showCustomFieldsBlock = !showCustomFieldsBlock} aria-expanded={showCustomFieldsBlock}>
                <span class="field-label">Custom fields</span>
                <svg class="section-chevron" class:open={showCustomFieldsBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
              </button>
              {#if showCustomFieldsBlock}
                <div class="extra-block-body custom-fields" in:slide={revealIn} out:slide={revealOut}>
                  {#each visibleFields as field (field.id)}
                    <label class="custom-field-label">
                      {field.name}
                      {#if field.type === 'select'}
                        <CustomSelect
                          options={[{ value: '', label: '—' }, ...(field.options ?? []).map(o => ({ value: o, label: o }))]}
                          value={(customValues[field.id] as string) ?? ''}
                          on:change={(e) => customValues[field.id] = e.detail || null}
                        />
                      {:else if field.type === 'date'}
                        <CalendarPicker value={(customValues[field.id] as string) ?? ''} on:change={(e) => customValues[field.id] = e.detail || null} />
                      {:else}
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          bind:value={customValues[field.id]}
                        />
                      {/if}
                    </label>
                  {/each}
                  {#if customFields.length > VISIBLE_FIELD_CAP}
                    <button type="button" class="add-field-btn" on:click={() => showAllFields = !showAllFields}>
                      {showAllFields ? 'Show fewer fields' : `Show ${customFields.length - VISIBLE_FIELD_CAP} more field${customFields.length - VISIBLE_FIELD_CAP > 1 ? 's' : ''}`}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>

<style>
  /* Base element styles live here, not in CardDetail's :global block:
     a :global() element selector also matches nested components'
     internals (CustomSelect, CalendarPicker), which the scoped
     original never did. */
  button {
    padding: .38rem .8rem; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); cursor: pointer;
    background: var(--surface); color: var(--text); font-size: .82rem; font-weight: 500;
  }
  label {
    display: flex; flex-direction: column; gap: .22rem;
    font-family: var(--mono); font-size: .62rem; letter-spacing: .05em;
    text-transform: uppercase; color: var(--faint);
  }
</style>
