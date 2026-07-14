<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getDeviceName, setDeviceName } from '../config';
  import { trapFocus } from './focusTrap';
  import { dialogPop, scrimFade } from './motion';

  const dispatch = createEventDispatcher<{ close: void }>();

  // Pre-filled with the same auto-generated default Settings already
  // shows ("PC" / "Android phone") — saving without changing it is a
  // no-op, same as skipping, just via a different button.
  let name = getDeviceName();

  function save() {
    setDeviceName(name);
    dispatch('close');
  }

  function skip() {
    dispatch('close');
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); skip(); }
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="prompt-scrim" on:click|self={skip} transition:fade={scrimFade}></div>
<div class="prompt-panel" role="dialog" aria-modal="true" use:trapFocus transition:dialogPop>
  <p class="prompt-title">What should we call this device?</p>
  <p class="prompt-hint">Shows up on this device's own edits when synced with others — changelog entries, task history. You can change this later in Settings, or skip for now.</p>
  <!-- svelte-ignore a11y-autofocus -->
  <input class="prompt-input" bind:value={name} placeholder="PC" autofocus enterkeyhint="done" />
  <div class="prompt-actions">
    <button class="skip-btn" on:click={skip}>Skip</button>
    <button class="save-btn" on:click={save}>Save</button>
  </div>
</div>

<style>
  .prompt-scrim {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    z-index: 700;
  }

  .prompt-panel {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 701; width: min(360px, 90vw);
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0,0,0,.3);
    padding: 1.35rem 1.5rem;
  }

  .prompt-title { margin: 0 0 .4rem; font-size: .95rem; font-weight: 600; color: var(--text); }
  .prompt-hint { margin: 0 0 .9rem; font-size: .8rem; color: var(--muted); line-height: 1.5; }
  .prompt-input {
    width: 100%; box-sizing: border-box; padding: .5rem .7rem; margin-bottom: 1.2rem;
    border-radius: var(--radius-sm); border: 1px solid var(--border-strong);
    background: var(--bg); color: var(--text); font-size: .9rem;
  }
  .prompt-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

  .prompt-actions { display: flex; justify-content: flex-end; gap: .6rem; }
  .skip-btn, .save-btn {
    padding: .5rem 1rem; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--bg); color: var(--text);
    transition: background .12s, opacity .12s;
  }
  .skip-btn:hover { background: var(--hover); }
  .save-btn { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .save-btn:hover { opacity: .88; }
</style>
