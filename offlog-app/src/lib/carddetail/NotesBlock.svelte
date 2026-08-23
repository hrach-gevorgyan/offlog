<script lang="ts">
  import { slide } from 'svelte/transition';

  export let showNotesBlock: boolean;
  export let body: string;
  export let similarNotesHint: string;
  export let NOTES_SOFT_LIMIT: number;
</script>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showNotesBlock = !showNotesBlock} aria-expanded={showNotesBlock}>
              <span class="field-label">Notes (markdown)</span>
              <svg class="section-chevron" class:open={showNotesBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showNotesBlock}
              <div class="extra-block-body notes-wrap" transition:slide={{ duration: 160 }}>
                <textarea class="notes-textarea" bind:value={body} rows="4" placeholder="Notes…"></textarea>
                {#if body.length > NOTES_SOFT_LIMIT}
                  <div class="notes-counter">{body.length} characters</div>
                {/if}
                {#if similarNotesHint}<p class="dup-name-hint">{similarNotesHint}</p>{/if}
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
  textarea {
    flex: 1; resize: vertical; min-height: 90px;
    padding: .55rem .65rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--bg); color: var(--text);
    font-family: 'Hanken Grotesk', sans-serif; font-size: .85rem; line-height: 1.5;
  }
  textarea:focus { outline: none; border-color: var(--accent); background: var(--surface); }
</style>
