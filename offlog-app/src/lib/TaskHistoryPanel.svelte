<script lang="ts">
  import { getLogsForTask } from './db';

  export let taskId: string;

  let history: Awaited<ReturnType<typeof getLogsForTask>> = [];
  let loaded = false;
  getLogsForTask(taskId).then(h => { history = h; loaded = true; });

  const ACTION_COLOR: Record<string, string> = { create: '#4ade80', update: '#6366f1', move: '#d99a3b', delete: '#f87171' };
  const FIELD_LABEL: Record<string, string> = { title: 'Title', body: 'Notes', priority: 'Priority', due_date: 'Due date', reminder_at: 'Reminder', tags: 'Tags', column_id: 'Status', pinned: 'Pinned', archived: 'Archived' };
  const PRIO: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

  function fmtLogVal(field: string, val: any): string {
    if (val == null || val === '') return '—';
    if (field === 'priority') return PRIO[val] ?? String(val);
    if (field === 'tags') return Array.isArray(val) ? (val.join(', ') || '—') : String(val);
    const s = String(val);
    return s.length > 36 ? s.slice(0, 36) + '…' : s;
  }

  function describeLog(log: any): string {
    if (log.action === 'create') return 'Task created';
    if (log.action === 'delete') return 'Task deleted';
    if (log.action === 'move') return `Moved: "${log.from}" → "${log.to}"`;
    if (log.diffs) return Object.entries(log.diffs).map(([f, d]: [string, any]) => {
      const label = FIELD_LABEL[f] ?? f;
      return `${label}: ${fmtLogVal(f, d.from)} → ${fmtLogVal(f, d.to)}`;
    }).join(' · ');
    return 'Updated';
  }

  function fmtTs(ts: string): string {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="history">
  {#if !loaded}
    <div class="history-empty">Loading…</div>
  {:else if history.length === 0}
    <div class="history-empty">No history recorded.</div>
  {:else}
    {#each history as log (log._id)}
      <div class="history-row">
        <span class="h-pill" style="background:{ACTION_COLOR[log.action]}22; color:{ACTION_COLOR[log.action]}">{log.action}</span>
        <span class="h-desc">{describeLog(log)}</span>
        <span class="h-time">{fmtTs(log.ts)}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .history {
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    overflow: hidden; font-size: .78rem;
  }
  .history-empty { padding: 10px 12px; color: var(--faint); }
  .history-row {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 7px 10px; border-bottom: 1px solid var(--border);
  }
  .history-row:last-child { border-bottom: none; }
  .h-pill {
    font-family: var(--mono); font-size: .6rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em;
    padding: 1px 6px; border-radius: 4px; flex-shrink: 0; margin-top: 1px;
  }
  .h-desc { flex: 1; color: var(--text); line-height: 1.4; }
  .h-time { font-family: var(--mono); font-size: .6rem; color: var(--faint); flex-shrink: 0; white-space: nowrap; }
</style>
