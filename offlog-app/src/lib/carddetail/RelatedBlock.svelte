<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import type { TaskDoc } from '../types';

  export let showRelatedBlock: boolean;
  export let relatedTasks: TaskDoc[];
  export let relatedInput: string;
  export let relatedSuggestions: TaskDoc[];
  export let projectNameFor: (t: TaskDoc) => string;
  export let addRelated: (otherId: string) => void;
  export let removeRelated: (otherId: string) => void;

  const dispatch = createEventDispatcher<{ openRelated: string }>();
</script>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showRelatedBlock = !showRelatedBlock} aria-expanded={showRelatedBlock}>
              <span class="field-label">
                Related{#if relatedTasks.length} <span class="checklist-progress">{relatedTasks.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showRelatedBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showRelatedBlock}
              <div class="extra-block-body related-field" in:slide={revealIn} out:slide={revealOut}>
                {#each relatedTasks as rt (rt._id)}
                  <div class="related-row" class:related-deleted={rt.deleted}>
                    {#if rt.deleted}
                      <span class="related-title">{rt.title} (deleted)</span>
                    {:else}
                      <button type="button" class="related-title related-title-link" on:click={() => dispatch('openRelated', rt._id!)}>{rt.title}</button>
                    {/if}
                    <span class="related-proj">{projectNameFor(rt)}</span>
                    <button type="button" class="checklist-remove" on:click={() => removeRelated(rt._id!)} aria-label="Remove link">×</button>
                  </div>
                {/each}
                <input
                  class="checklist-input"
                  bind:value={relatedInput}
                  placeholder="Link another task…"
                />
                {#if relatedSuggestions.length}
                  <div class="tag-suggestions">
                    {#each relatedSuggestions as s (s._id)}
                      <button type="button" class="tag-suggestion" on:mousedown|preventDefault={() => addRelated(s._id!)}>{s.title} <span class="related-proj">{projectNameFor(s)}</span></button>
                    {/each}
                  </div>
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
