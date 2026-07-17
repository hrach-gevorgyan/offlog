<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { getRecentLogs, clearLogs } from './db';
  import { showError } from './store';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import { ACTION_COLOR } from './utils';
  import { panelFly, scrimFade } from './motion';
  import { describeLog as describe, entityLabel, fmt, ACTION_LABEL } from './logFormat';

  const dispatch = createEventDispatcher();
  const requestClose = closeOnBack(() => dispatch('close'));
  let logs: Awaited<ReturnType<typeof getRecentLogs>> = [];

  onMount(async () => { logs = await getRecentLogs(80); });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }
</script>

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()} transition:fade={scrimFade}></div>

<div class="panel" use:trapFocus transition:fly={panelFly}>
  <div class="panel-head">
    <span class="panel-title">Changelog</span>
    {#if logs.length > 0}
      <button class="clear-btn" on:click={async () => { try { await clearLogs(); logs = []; } catch { showError('Failed to clear the changelog.'); } }}>Clear all</button>
    {/if}
    <button class="close-btn" on:click={() => requestClose()}>✕</button>
  </div>

  <div class="log-list">
    {#if logs.length === 0}
      <div class="empty">No changes logged yet.</div>
    {:else}
      {#each logs as log (log._id)}
        <div class="log-row">
          <span class="action-pill" style="background:color-mix(in srgb, {ACTION_COLOR[log.action] ?? '#a39c90'} 13%, transparent); color:{ACTION_COLOR[log.action] ?? '#a39c90'}">{ACTION_LABEL[log.action] ?? log.action}</span>
          <div class="log-main">
            <span class="log-desc">{describe(log)}</span>
            <!-- Skipped for a project's own create/delete entry -- its
                 name is already the main description's subject, this
                 badge would just repeat it right below. -->
            {#if log.project_name && entityLabel(log) !== 'project'}<span class="log-project">{log.project_name}</span>{/if}
          </div>
          <span class="source-pill source-{log.source ?? 'pc'}">{log.source ?? 'pc'}</span>
          <span class="log-time">{fmt(log.ts)}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* .scrim is defined globally in app.css */

  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 100vw);
    background: var(--surface); border-left: 1px solid var(--border);
    box-shadow: -8px 0 32px rgba(0,0,0,.15); z-index: 402;
    display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top, 0px);
  }

  .panel-head {
    display: flex; align-items: center; gap: 8px;
    padding: 20px 24px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .panel-title { font-size: 16px; font-weight: 700; flex: 1; letter-spacing: -.015em; }

  .clear-btn {
    background: none; border: 1px solid var(--border-strong); border-radius: 6px;
    cursor: pointer; font-size: 11.5px; font-weight: 500; color: var(--muted);
    padding: 4px 10px; transition: color .12s, border-color .12s;
  }
  .clear-btn:hover { color: var(--danger); border-color: var(--danger); }

  .close-btn {
    background: none; border: none; cursor: pointer; font-size: 14px;
    color: var(--faint); padding: 4px 6px; border-radius: 6px;
    transition: color .12s, background .12s;
  }
  .close-btn:hover { color: var(--text); background: var(--hover); }

  .log-list { flex: 1; overflow-y: auto; padding: 12px 0; }

  .log-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 24px; border-bottom: 1px solid var(--border); font-size: 13px;
  }
  .log-row:last-child { border-bottom: none; }

  .action-pill {
    font-family: var(--mono); font-size: 10px; font-weight: 500;
    letter-spacing: .04em; text-transform: uppercase;
    padding: 2px 7px; border-radius: 5px; flex-shrink: 0; margin-top: 1px;
  }

  .log-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .log-desc { color: var(--text); white-space: normal; line-height: 1.45; word-break: break-word; }
  .log-project { font-family: var(--mono); font-size: 10px; color: var(--faint); }

  .source-pill {
    font-family: var(--mono); font-size: 9.5px; font-weight: 600;
    letter-spacing: .05em; text-transform: uppercase;
    padding: 2px 7px; border-radius: 5px; flex-shrink: 0;
    background: var(--col-bg); color: var(--muted);
  }
  .source-pill.source-mobile { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }

  .log-time { font-family: var(--mono); font-size: 10.5px; color: var(--faint); flex-shrink: 0; }

  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }
</style>
