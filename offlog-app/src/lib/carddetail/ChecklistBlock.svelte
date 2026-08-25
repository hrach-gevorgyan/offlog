<script lang="ts">
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';

  export let showChecklistBlock: boolean;
  export let checklist: { text: string; done: boolean }[];
  export let checklistInput: string;
  export let duplicateChecklistItems: string[];
  export let toggleChecklistItem: (i: number) => void;
  export let removeChecklistItem: (i: number) => void;
  export let addChecklistItem: () => void;
  export let onChecklistKey: (e: KeyboardEvent) => void;
</script>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showChecklistBlock = !showChecklistBlock} aria-expanded={showChecklistBlock}>
              <span class="field-label">
                Checklist{#if checklist.length} <span class="checklist-progress">{checklist.filter(i => i.done).length}/{checklist.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showChecklistBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showChecklistBlock}
              <div class="extra-block-body checklist-field" in:slide={revealIn} out:slide={revealOut}>
                {#each checklist as item, i}
                  <div class="checklist-row">
                    <button type="button" class="checklist-check" class:done={item.done} on:click={() => toggleChecklistItem(i)} aria-label={item.done ? 'Mark not done' : 'Mark done'}>
                      {#if item.done}✓{/if}
                    </button>
                    <span class="checklist-text" class:done={item.done}>{item.text}</span>
                    <button type="button" class="checklist-remove" on:click={() => removeChecklistItem(i)} aria-label="Remove item">×</button>
                  </div>
                {/each}
                <input
                  class="checklist-input"
                  bind:value={checklistInput}
                  placeholder="Add item…"
                  enterkeyhint="done"
                  on:keydown={onChecklistKey}
                  on:blur={() => setTimeout(addChecklistItem, 150)}
                />
                {#if duplicateChecklistItems.length}
                  <p class="dup-name-hint">Repeated item{duplicateChecklistItems.length > 1 ? 's' : ''}: {duplicateChecklistItems.join(', ')}</p>
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
</style>
