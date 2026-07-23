<script lang="ts">
  import { fade } from 'svelte/transition';
  import { trapFocus } from './focusTrap';
  import { dialogPop, scrimFade } from './motion';
  import { updateState, showUpdateModal, downloadUpdate, installUpdate } from './updateChecker';

  // Desktop-only (App.svelte only mounts this behind isTauri()). Shows
  // whichever phase updateChecker.ts's state machine is in — 'available'
  // (offer to download, with release notes), 'downloading' (progress
  // bar), 'ready' (offer to restart), or 'error'. Closing via Escape/
  // scrim/Later never cancels an in-flight download or a completed one —
  // it just hides the modal; the next open (banner click or "Check for
  // updates") picks up wherever the state machine actually is.
  function close() { showUpdateModal.set(false); }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if $showUpdateModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="update-scrim" on:click|self={close} transition:fade={scrimFade}></div>
  <div class="update-panel" role="dialog" aria-modal="true" use:trapFocus transition:dialogPop>
    {#if $updateState.phase === 'available'}
      <p class="update-title">Offlog {$updateState.version} is available</p>
      {#if $updateState.body}
        <pre class="update-notes">{$updateState.body}</pre>
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
    padding: 1.35rem 1.5rem;
  }
  .update-title { margin: 0 0 .6rem; font-size: .95rem; font-weight: 600; color: var(--text); }
  .update-notes {
    margin: 0 0 .9rem; padding: .6rem .7rem; max-height: 200px; overflow-y: auto;
    font-family: inherit; white-space: pre-wrap; font-size: .8rem; line-height: 1.5;
    color: var(--muted); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .update-hint { margin: 0 0 .9rem; font-size: .8rem; color: var(--muted); line-height: 1.5; }
  .progress-track {
    height: 8px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border);
    overflow: hidden; margin-bottom: .5rem;
  }
  .progress-fill { height: 100%; background: var(--accent); transition: width .15s ease; }
  .update-actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: .3rem; }
  .later-btn, .primary-btn {
    padding: .5rem 1rem; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--bg); color: var(--text);
    transition: background .12s, opacity .12s;
  }
  .later-btn:hover { background: var(--hover); }
  .primary-btn { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .primary-btn:hover { opacity: .88; }
</style>
