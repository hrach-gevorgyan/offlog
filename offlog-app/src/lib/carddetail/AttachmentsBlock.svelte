<script lang="ts">
  import { slide } from 'svelte/transition';
  import { revealIn, revealOut } from '../motion';
  import type { TaskAttachment } from '../types';
  import { ATTACHMENT_MAX_PER_TASK } from '../db';
  import { formatAttachmentSize } from '../attachments';

  export let showAttachmentsBlock: boolean;
  export let attachments: TaskAttachment[];
  export let thumbnailUrls: Record<string, string>;
  export let attachmentBusy: boolean;
  export let attachmentError: string;
  export let openAttachment: (key: string, filename: string) => void;
  export let removeAttachment: (key: string) => void;
  export let onFilesPicked: (e: Event) => void;

  let attachFileInputEl: HTMLInputElement;
</script>

          <div class="extra-block">
            <button type="button" class="extra-block-toggle" on:click={() => showAttachmentsBlock = !showAttachmentsBlock} aria-expanded={showAttachmentsBlock}>
              <span class="field-label">
                Attachments{#if attachments.length} <span class="checklist-progress">{attachments.length}</span>{/if}
              </span>
              <svg class="section-chevron" class:open={showAttachmentsBlock} viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,1 7,5 2,9"/></svg>
            </button>
            {#if showAttachmentsBlock}
              <div class="extra-block-body attachments-field" in:slide={revealIn} out:slide={revealOut}>
                {#each attachments as a (a.key)}
                  <div class="attachment-row">
                    <button type="button" class="attachment-open" on:click={() => openAttachment(a.key, a.filename)} title="Download {a.filename}">
                      {#if thumbnailUrls[a.key]}
                        <img class="attachment-thumb" src={thumbnailUrls[a.key]} alt="" />
                      {:else}
                        <span class="attachment-file-icon" aria-hidden="true">
                          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1.5h6l4 4v9a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z"/><path d="M9 1.5v4h4"/></svg>
                        </span>
                      {/if}
                      <span class="attachment-name">{a.filename}</span>
                      <span class="attachment-size">{formatAttachmentSize(a.size)}</span>
                    </button>
                    <button type="button" class="checklist-remove" on:click={() => removeAttachment(a.key)} disabled={attachmentBusy} aria-label="Remove attachment {a.filename}">×</button>
                  </div>
                {/each}
                <button type="button" class="attach-file-btn" disabled={attachmentBusy || attachments.length >= ATTACHMENT_MAX_PER_TASK} on:click={() => attachFileInputEl.click()}>
                  {attachmentBusy ? 'Attaching…' : attachments.length >= ATTACHMENT_MAX_PER_TASK ? `Max ${ATTACHMENT_MAX_PER_TASK} attachments reached` : '+ Attach a file'}
                </button>
                <!-- No `accept` restriction -- any file type is attachable except
                     HEIC/HEIF (rejected in attachOneFile() with a clear message);
                     `accept` can't express a negation, so this intentionally lets
                     the OS picker show everything and relies on the JS check. -->
                <input
                  bind:this={attachFileInputEl}
                  type="file" multiple style="display:none"
                  on:change={onFilesPicked}
                />
                {#if attachmentError}<p class="dup-name-hint">{attachmentError}</p>{/if}
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
