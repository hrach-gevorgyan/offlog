<script lang="ts">
  import { confirmRequest } from './confirm';

  function respond(v: boolean) {
    $confirmRequest?.resolve(v);
    confirmRequest.set(null);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!$confirmRequest) return;
    if (e.key === 'Escape') { e.preventDefault(); respond(false); }
    if (e.key === 'Enter')  { e.preventDefault(); respond(true); }
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

{#if $confirmRequest}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="confirm-scrim" on:click|self={() => respond(false)}></div>
  <div class="confirm-panel" role="alertdialog" aria-modal="true">
    <p class="confirm-msg">{$confirmRequest.message}</p>
    <div class="confirm-actions">
      <button class="cancel-btn" on:click={() => respond(false)}>{$confirmRequest.cancelLabel}</button>
      <!-- svelte-ignore a11y-autofocus -->
      <button class="ok-btn" class:danger={$confirmRequest.danger} on:click={() => respond(true)} autofocus>
        {$confirmRequest.confirmLabel}
      </button>
    </div>
  </div>
{/if}

<style>
  .confirm-scrim {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    z-index: 700; animation: fade .15s ease;
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

  .confirm-panel {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 701; width: min(360px, 90vw);
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0,0,0,.3);
    padding: 1.35rem 1.5rem;
    animation: pop .16s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes pop {
    from { opacity: 0; transform: translate(-50%,-50%) scale(.96); }
    to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  }

  .confirm-msg { margin: 0 0 1.2rem; font-size: .92rem; color: var(--text); line-height: 1.5; }

  .confirm-actions { display: flex; justify-content: flex-end; gap: .6rem; }
  .cancel-btn, .ok-btn {
    padding: .5rem 1rem; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--bg); color: var(--text);
    transition: background .12s, opacity .12s;
  }
  .cancel-btn:hover { background: var(--hover); }
  .ok-btn { background: var(--accent); border-color: var(--accent); color: #fff; }
  .ok-btn:hover { opacity: .88; }
  .ok-btn.danger { background: var(--danger); border-color: var(--danger); }
</style>
