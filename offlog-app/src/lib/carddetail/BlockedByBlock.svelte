<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import type { TaskDoc } from '../types';
  import { isBlockerResolved } from '../db';

  export let showBlockedByBlock: boolean;
  export let blockingTasks: TaskDoc[];
  export let unresolvedBlockers: TaskDoc[];
  export let lastColByProject: Record<string, string | undefined>;
  export let blockedByInput: string;
  export let blockedBySuggestions: TaskDoc[];
  export let projectNameFor: (t: TaskDoc) => string;
  export let addBlockedBy: (otherId: string) => void;
  export let removeBlockedBy: (otherId: string) => void;

  const dispatch = createEventDispatcher<{ openRelated: string }>();
</script>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showBlockedByBlock = !showBlockedByBlock} aria-expanded={showBlockedByBlock}>
              <span class="field-label">
                Blocked by{#if blockingTasks.length} <span class="checklist-progress" class:blocked-badge-active={unresolvedBlockers.length}>{blockingTasks.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showBlockedByBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showBlockedByBlock}
              <div class="extra-block-body related-field" in:slide={revealIn} out:slide={revealOut}>
                {#each blockingTasks as bt (bt._id)}
                  {@const resolved = isBlockerResolved(bt, lastColByProject)}
                  <div class="related-row" class:related-deleted={bt.deleted}>
                    {#if bt.deleted}
                      <span class="related-title">{bt.title} (deleted)</span>
                    {:else}
                      <button type="button" class="related-title related-title-link" on:click={() => dispatch('openRelated', bt._id!)}>{bt.title}</button>
                    {/if}
                    <span class="blocked-status" class:blocked-status-done={resolved}>{resolved ? 'Done' : 'Not done'}</span>
                    <span class="related-proj">{projectNameFor(bt)}</span>
                    <button type="button" class="checklist-remove" on:click={() => removeBlockedBy(bt._id!)} aria-label="Remove dependency">×</button>
                  </div>
                {/each}
                <input
                  class="checklist-input"
                  bind:value={blockedByInput}
                  placeholder="This task can't start until…"
                />
                {#if blockedBySuggestions.length}
                  <div class="tag-suggestions">
                    {#each blockedBySuggestions as s (s._id)}
                      <button type="button" class="tag-suggestion" on:mousedown|preventDefault={() => addBlockedBy(s._id!)}>{s.title} <span class="related-proj">{projectNameFor(s)}</span></button>
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
