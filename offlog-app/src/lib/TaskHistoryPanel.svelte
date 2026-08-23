<script lang="ts">
  import { getLogsForTask } from './db';
  import { timeAgo, fmtFullTimestamp, ACTION_COLOR } from './utils';
  import { describeField, hasRealChange } from './logFormat';

  export let taskId: string;

  let history: Awaited<ReturnType<typeof getLogsForTask>> = [];
  let loaded = false;
  getLogsForTask(taskId).then(h => { history = h; loaded = true; });

  const ACTION_LABEL: Record<string, string> = { create: 'Created', update: 'Edited', move: 'Moved', delete: 'Deleted' };

  // FIELD_LABEL/describeField/hasRealChange used to be duplicated here
  // (drifted from logFormat.ts's copy — this file's describeField was
  // missing the 'name' rename case and hasRealChange was missing the
  // isEmpty() no-op filter logFormat.ts already got in its 2026-07-18
  // fix, so a no-op checklist/custom_values diff could still show a
  // false "Checklist updated"/"Custom fields updated" here after
  // TimeTravelView had already stopped showing it). Now imported from
  // logFormat.ts, the single source both views share — this panel keeps
  // its own simpler describeLog()/MAX_CLAUSES join below since its
  // create/move/delete phrasing is intentionally different (task-scoped,
  // no entity-type/who context needed).
  const MAX_CLAUSES = 3;

  function describeLog(log: any): string {
    if (log.action === 'create') return 'Task created';
    if (log.action === 'delete') return 'Task deleted';
    if (log.action === 'move') return `Moved from "${log.from}" to "${log.to}"`;
    if (log.diffs) {
      const clauses = Object.entries(log.diffs)
        .filter(([, d]: [string, any]) => hasRealChange(d.from, d.to))
        .map(([f, d]: [string, any]) => describeField(f, d.from, d.to));
      if (clauses.length === 0) return 'Details updated';
      if (clauses.length > MAX_CLAUSES) {
        return clauses.slice(0, MAX_CLAUSES).join('; ') + `; +${clauses.length - MAX_CLAUSES} more change${clauses.length - MAX_CLAUSES === 1 ? '' : 's'}`;
      }
      return clauses.join('; ');
    }
    return 'Task updated';
  }

</script>

<div class="history">
  {#if !loaded}
    <div class="history-empty"><span class="spinner"></span>Loading…</div>
  {:else if history.length === 0}
    <div class="history-empty">No history recorded.</div>
  {:else}
    {#each history as log (log._id)}
      <div class="history-row">
        <span class="h-pill" style="background:color-mix(in srgb, {ACTION_COLOR[log.action]} 13%, transparent); color:{ACTION_COLOR[log.action]}">{ACTION_LABEL[log.action] ?? log.action}</span>
        <span class="h-desc">{describeLog(log)}</span>
        <span class="h-time-group">
          {#if log.source}<span class="h-source">{log.source}</span>{/if}
          <span class="h-time" title={fmtFullTimestamp(log.ts)}>{timeAgo(log.ts)}</span>
        </span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .history {
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    overflow: hidden; font-size: .78rem;
  }
  .history-empty { display: flex; align-items: center; gap: 8px; padding: 10px 12px; color: var(--faint); }
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
  .h-time-group { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
  .h-source {
    font-size: .58rem; color: var(--faint); font-weight: 600;
    text-transform: uppercase; letter-spacing: .03em; white-space: nowrap;
  }
  .h-time { font-family: var(--mono); font-size: .6rem; color: var(--faint); white-space: nowrap; }
</style>
