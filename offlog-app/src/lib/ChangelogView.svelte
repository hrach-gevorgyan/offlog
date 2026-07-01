<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getRecentLogs, clearLogs } from './db';

  const dispatch = createEventDispatcher();
  let logs: Awaited<ReturnType<typeof getRecentLogs>> = [];

  onMount(async () => { logs = await getRecentLogs(80); });

  const ACTION_COLOR: Record<string, string> = {
    create: '#5f9b6a', update: '#4f7bc4', move: '#d99a3b', delete: '#b0432e',
  };

  const FIELD_LABEL: Record<string, string> = {
    title: 'Title', body: 'Notes', priority: 'Priority',
    due_date: 'Due date', tags: 'Tags', name: 'Name', columns: 'Statuses',
  };

  const PRIO: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

  function fmtVal(field: string, val: any): string {
    if (val == null || val === '' || val === false) return '—';
    if (field === 'body') return 'updated';
    if (field === 'priority') return PRIO[val] ?? String(val);
    if (field === 'tags') return Array.isArray(val) ? (val.join(', ') || '—') : String(val);
    if (field === 'columns') return Array.isArray(val) ? val.map((c: any) => c.name).join(', ') : String(val);
    const s = String(val);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  function fmtDiffs(diffs: Record<string, any>): string {
    return Object.entries(diffs).map(([field, d]: [string, any]) => {
      const label = FIELD_LABEL[field] ?? field;
      const from  = fmtVal(field, d.from);
      const to    = fmtVal(field, d.to);
      return from === '—' ? `${label} set to ${to}` : `${label}: ${from} → ${to}`;
    }).join(' · ');
  }

  function fmt(ts: string) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function describe(log: any): string {
    const who = log.task_title ? `"${log.task_title}"` : log.project_name ? `"${log.project_name}"` : null;

    if (log.action === 'create') return `Created task ${who ?? ''}`.trim();
    if (log.action === 'delete') return `Deleted task ${who ?? ''}`.trim();

    if (log.action === 'move') {
      let text = `Moved ${who ?? 'task'} from "${log.from ?? '?'}" → "${log.to ?? '?'}"`;
      if (log.diffs && Object.keys(log.diffs).length) text += ' · ' + fmtDiffs(log.diffs);
      return text;
    }

    if (log.diffs) return fmtDiffs(log.diffs) + (who ? ` on ${who}` : '');

    if (log.field) {
      const label = FIELD_LABEL[log.field] ?? log.field;
      const from  = fmtVal(log.field, log.from);
      const to    = fmtVal(log.field, log.to);
      const on    = who ? ` on ${who}` : '';
      return from === '—' ? `${label} set to ${to}${on}` : `${label}: ${from} → ${to}${on}`;
    }

    return `Updated ${who ?? 'item'}`;
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => dispatch('close')}></div>

<div class="panel">
  <div class="panel-head">
    <span class="panel-title">Changelog</span>
    {#if logs.length > 0}
      <button class="clear-btn" on:click={async () => { await clearLogs(); logs = []; }}>Clear all</button>
    {/if}
    <button class="close-btn" on:click={() => dispatch('close')}>✕</button>
  </div>

  <div class="log-list">
    {#if logs.length === 0}
      <div class="empty">No changes logged yet.</div>
    {:else}
      {#each logs as log (log._id)}
        <div class="log-row">
          <span class="action-pill" style="background:{ACTION_COLOR[log.action] ?? '#a39c90'}22; color:{ACTION_COLOR[log.action] ?? '#a39c90'}">{log.action}</span>
          <div class="log-main">
            <span class="log-desc">{describe(log)}</span>
            {#if log.project_name}<span class="log-project">{log.project_name}</span>{/if}
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
    animation: slideIn .38s cubic-bezier(0.4,0,0.2,1) both;
  }
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

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
  .source-pill.source-mobile { background: rgba(93,155,255,.12); color: var(--accent); }

  .log-time { font-family: var(--mono); font-size: 10.5px; color: var(--faint); flex-shrink: 0; }

  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }
</style>
