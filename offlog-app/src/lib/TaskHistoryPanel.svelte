<script lang="ts">
  import { getLogsForTask } from './db';
  import { timeAgo, fmtFullTimestamp, ACTION_COLOR } from './utils';

  export let taskId: string;

  let history: Awaited<ReturnType<typeof getLogsForTask>> = [];
  let loaded = false;
  getLogsForTask(taskId).then(h => { history = h; loaded = true; });

  const FIELD_LABEL: Record<string, string> = {
    title: 'Title', body: 'Notes', priority: 'Priority', due_date: 'Due date',
    reminder_at: 'Reminder', remindOnDue: 'Remind on due date', tags: 'Tags',
    column_id: 'Status', pinned: 'Pinned', archived: 'Archived',
    checklist: 'Checklist', custom_values: 'Custom fields',
  };
  const PRIO: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

  // Readability fix (owner, 2026-07-19 — "some tech shit is there
  // especially boolean logic"): raw `true`/`false`, camelCase field
  // names, and stringified objects/arrays ("[object Object]" for
  // checklist/custom_values diffs) were all leaking straight into the
  // history panel unformatted. Every value shown here should read as a
  // sentence a non-technical person would write, not a field dump.
  function fmtLogVal(field: string, val: any): string {
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val == null || val === '') return '—';
    if (field === 'priority') return PRIO[val] ?? String(val);
    if (field === 'tags') return Array.isArray(val) ? (val.join(', ') || 'none') : String(val);
    if (field === 'checklist') return Array.isArray(val) ? `${val.length} item${val.length === 1 ? '' : 's'}` : 'updated';
    if (field === 'custom_values') return 'updated';
    if (field === 'due_date') return new Date(`${val}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (field === 'reminder_at') return new Date(val).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (Array.isArray(val)) return val.length ? `${val.length} item${val.length === 1 ? '' : 's'}` : 'none';
    if (typeof val === 'object') return 'updated';
    const s = String(val);
    return s.length > 36 ? s.slice(0, 36) + '…' : s;
  }

  const ACTION_LABEL: Record<string, string> = { create: 'Created', update: 'Edited', move: 'Moved', delete: 'Deleted' };

  // Readability fix, round 2 (owner, 2026-07-19 — "only created task is
  // understandable, other ones are too complicated for humans"): same
  // fix as logFormat.ts's fmtDiffs — drop no-op diff entries
  // (before/after render identically) and phrase each real change as a
  // short plain-English clause instead of "Field changed from A to B".
  function describeField(field: string, from: any, to: any): string {
    if (field === 'pinned') return to ? 'Pinned' : 'Unpinned';
    if (field === 'archived') return to ? 'Archived' : 'Taken out of archive';
    if (field === 'due_date') return from == null ? `Due date set to ${fmtLogVal(field, to)}` : to == null ? 'Due date removed' : `Due date moved to ${fmtLogVal(field, to)}`;
    if (field === 'reminder_at') return to == null ? 'Reminder removed' : `Reminder set for ${fmtLogVal(field, to)}`;
    if (field === 'remindOnDue') return to ? 'Reminder now follows the due date' : 'Reminder no longer follows the due date';
    if (field === 'tags') return `Tags changed to ${fmtLogVal(field, to)}`;
    if (field === 'priority') return `Priority changed to ${fmtLogVal(field, to)}`;
    if (field === 'title') return `Renamed to "${to}"`;
    if (field === 'body') return 'Notes updated';
    if (field === 'checklist') return 'Checklist updated';
    if (field === 'custom_values') return 'Custom fields updated';
    return `${FIELD_LABEL[field] ?? field} changed`;
  }

  // Must not reuse fmtLogVal for this comparison: fmtLogVal collapses
  // every checklist edit to just an item count and every custom-field
  // edit to the literal string "updated" (by design, for display) — so
  // comparing display strings made every real checklist/custom-field
  // change look like a no-op and get filtered, leaving only the vague
  // "Details updated" fallback below.
  function hasRealChange(field: string, from: any, to: any): boolean {
    if (typeof from === 'boolean' || typeof to === 'boolean') return !!from !== !!to;
    return JSON.stringify(from) !== JSON.stringify(to);
  }

  const MAX_CLAUSES = 3;

  function describeLog(log: any): string {
    if (log.action === 'create') return 'Task created';
    if (log.action === 'delete') return 'Task deleted';
    if (log.action === 'move') return `Moved from "${log.from}" to "${log.to}"`;
    if (log.diffs) {
      const clauses = Object.entries(log.diffs)
        .filter(([f, d]: [string, any]) => hasRealChange(f, d.from, d.to))
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
    <div class="history-empty">Loading…</div>
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
  .h-time-group { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
  .h-source {
    font-size: .58rem; color: var(--faint); font-weight: 600;
    text-transform: uppercase; letter-spacing: .03em; white-space: nowrap;
  }
  .h-time { font-family: var(--mono); font-size: .6rem; color: var(--faint); white-space: nowrap; }
</style>
