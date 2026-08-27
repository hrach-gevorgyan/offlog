<script lang="ts">
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import MarkdownEditor from './MarkdownEditor.svelte';

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
              <div class="extra-block-body notes-wrap" in:slide={revealIn} out:slide={revealOut}>
                <MarkdownEditor bind:value={body} placeholderText="Notes… **bold**, *italic*, # heading, - list, `code`" />
                {#if body.length > NOTES_SOFT_LIMIT}
                  <div class="notes-counter">{body.length} characters</div>
                {/if}
                {#if similarNotesHint}<p class="dup-name-hint">{similarNotesHint}</p>{/if}
              </div>
            {/if}
          </div>
