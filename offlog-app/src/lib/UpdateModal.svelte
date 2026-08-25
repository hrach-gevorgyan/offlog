<script lang="ts">
  import { fade } from 'svelte/transition';
  import { scrimIn, scrimOut, dialogIn, dialogOut } from './motion';
  import { trapFocus } from './focusTrap';
  import { updateState, showUpdateModal, downloadUpdate, installUpdate } from './updateChecker';
  import { escapeHtml } from './utils';

  // Desktop-only (App.svelte mounts it behind isTauri()). Renders
  // whichever phase updateChecker.ts's state machine is in: 'available',
  // 'downloading', 'ready', or 'error'. Closing via Escape/scrim/Later
  // only hides the modal — it never cancels an in-flight or completed
  // download; the next open picks up wherever the state machine is.
  function close() { showUpdateModal.set(false); }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // Minimal renderer for the restricted Markdown subset release-notes.md
  // is allowed to use: `### Heading` and `- bullet` lines, nothing else.
  // Every piece of text is escaped because the result goes through
  // {@html}.
  //
  // Both bullets and paragraphs soft-wrap across several source lines, and
  // Markdown treats a following non-blank line as a continuation. So a run
  // of consecutive non-blank lines is ONE <li> or ONE <p>, joined by
  // spaces -- emitting a block per source line splits a wrapped sentence
  // into fragments. Only a blank line, a heading or a new bullet ends the
  // block that is open.
  function renderNotes(body: string): string {
    const lines = body.split('\n');
    let html = '';
    let inList = false;
    let lastLiText = '';
    let lastPText = '';
    const flushLi = () => { if (lastLiText) { html += `<li>${lastLiText}</li>`; lastLiText = ''; } };
    const closeList = () => { if (inList) { flushLi(); html += '</ul>'; inList = false; } };
    const flushP = () => { if (lastPText) { html += `<p>${lastPText}</p>`; lastPText = ''; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { closeList(); flushP(); continue; }
      const heading = line.match(/^###\s+(.*)/);
      if (heading) { closeList(); flushP(); html += `<p class="notes-heading">${escapeHtml(heading[1])}</p>`; continue; }
      const bullet = line.match(/^[-*]\s+(.*)/);
      if (bullet) {
        flushP();
        flushLi();
        if (!inList) { html += '<ul>'; inList = true; }
        lastLiText = escapeHtml(bullet[1]);
        continue;
      }
      if (inList) { lastLiText += ' ' + escapeHtml(line); continue; }
      lastPText += (lastPText ? ' ' : '') + escapeHtml(line);
    }
    closeList();
    flushP();
    return html;
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if $showUpdateModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="update-scrim" on:click|self={close} in:fade={scrimIn} out:fade={scrimOut}></div>
  <div class="update-panel" role="dialog" aria-modal="true" use:trapFocus in:dialogIn out:dialogOut>
    {#if $updateState.phase === 'available'}
      <p class="update-title">Offlog {$updateState.version} is available</p>
      {#if $updateState.body}
        <div class="update-notes">{@html renderNotes($updateState.body)}</div>
      {/if}
      <div class="update-actions">
        <button class="later-btn" on:click={close}>Later</button>
        <button class="primary-btn" on:click={downloadUpdate}>Update</button>
      </div>
    {:else if $updateState.phase === 'downloading'}
      <p class="update-title">Downloading {$updateState.version}…</p>
      <div class="progress-track">
        <div class="progress-fill" style="width: {$updateState.progress ?? 0}%"></div>
      </div>
      <p class="update-hint">{$updateState.progress ?? 0}%</p>
    {:else if $updateState.phase === 'ready'}
      <p class="update-title">Offlog {$updateState.version} is downloaded</p>
      <p class="update-hint">Restart now to install it, or keep working — it'll still be ready to install next time you check.</p>
      <div class="update-actions">
        <button class="later-btn" on:click={close}>Later</button>
        <button class="primary-btn" on:click={installUpdate}>Restart to install</button>
      </div>
    {:else if $updateState.phase === 'error'}
      <p class="update-title">Update failed</p>
      <p class="update-hint">{$updateState.error}</p>
      <div class="update-actions">
        <button class="primary-btn" on:click={close}>Close</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .update-scrim {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    z-index: 700;
  }
  .update-panel {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 701; width: min(400px, 90vw);
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0,0,0,.3);
    padding: 1.5rem 1.6rem 1.6rem;
  }
  .update-title { margin: 0 0 .9rem; font-size: .95rem; font-weight: 600; color: var(--text); }
  .update-notes {
    margin: 0 0 1.1rem; padding: .7rem .8rem; max-height: 200px; overflow-y: auto;
    font-size: .8rem; line-height: 1.5;
    color: var(--muted); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .update-notes :global(p) { margin: 0 0 .5rem; }
  .update-notes :global(p:last-child) { margin-bottom: 0; }
  .update-notes :global(.notes-heading) { color: var(--text); font-weight: 600; margin-top: .7rem; }
  .update-notes :global(.notes-heading:first-child) { margin-top: 0; }
  .update-notes :global(ul) { margin: 0 0 .5rem; padding-left: 1.1rem; }
  .update-notes :global(ul:last-child) { margin-bottom: 0; }
  .update-notes :global(li) { margin-bottom: .3rem; }
  .update-notes :global(li:last-child) { margin-bottom: 0; }
  .update-hint { margin: 0 0 1.1rem; font-size: .8rem; color: var(--muted); line-height: 1.5; }
  .progress-track {
    height: 8px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border);
    overflow: hidden; margin-bottom: .5rem;
  }
  .progress-fill { height: 100%; background: var(--accent); transition: width var(--dur-small) var(--ease-standard); }
  .update-actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: .8rem; }
  .later-btn, .primary-btn {
    padding: .5rem 1rem; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--bg); color: var(--text);
    transition: background var(--dur-hover) var(--ease-hover), opacity var(--dur-hover) var(--ease-hover);
  }
  .later-btn:hover { background: var(--hover); }
  .primary-btn { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .primary-btn:hover { opacity: .88; }
</style>
