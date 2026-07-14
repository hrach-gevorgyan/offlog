<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getRecentLogs, clearLogs } from './db';
  import { closeOnBack } from './modalStack';
  import { trapFocus } from './focusTrap';
  import { ACTION_COLOR } from './utils';

  const dispatch = createEventDispatcher();
  const requestClose = closeOnBack(() => dispatch('close'));
  let logs: Awaited<ReturnType<typeof getRecentLogs>> = [];

  onMount(async () => { logs = await getRecentLogs(80); });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }

  const FIELD_LABEL: Record<string, string> = {
    title: 'Title', body: 'Notes', priority: 'Priority',
    due_date: 'Due date', reminder_at: 'Reminder', remindOnDue: 'Remind on due date',
    tags: 'Tags', name: 'Name', columns: 'Statuses',
    pinned: 'Pinned', archived: 'Archived', column_id: 'Status',
    checklist: 'Checklist', custom_values: 'Custom fields',
  };

  const PRIO: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
  const ACTION_LABEL: Record<string, string> = { create: 'Created', update: 'Edited', move: 'Moved', delete: 'Deleted' };

  // Readability fix (owner, 2026-07-19 — "some tech shit is there
  // especially boolean logic"): this used to treat `false` the same as
  // "no value" (both fell through to '—'), so an archived→unarchived
  // change and a genuinely-empty field looked identical, and a field
  // flipping to `true` fell through to raw `String(val)` ("true"
  // printed literally). Booleans now always read as plain Yes/No.
  function fmtVal(field: string, val: any): string {
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val == null || val === '') return '—';
    if (field === 'body') return 'updated';
    if (field === 'priority') return PRIO[val] ?? String(val);
    if (field === 'tags') return Array.isArray(val) ? (val.join(', ') || 'none') : String(val);
    if (field === 'columns') return Array.isArray(val) ? val.map((c: any) => c.name).join(', ') : String(val);
    if (field === 'checklist') return Array.isArray(val) ? `${val.length} item${val.length === 1 ? '' : 's'}` : 'updated';
    if (field === 'custom_values') return 'updated';
    if (field === 'due_date') return new Date(`${val}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (field === 'reminder_at') return new Date(val).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (Array.isArray(val)) return val.length ? `${val.length} item${val.length === 1 ? '' : 's'}` : 'none';
    if (typeof val === 'object') return 'updated';
    const s = String(val);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  // Readability fix, round 2 (owner, 2026-07-19 — "only created task is
  // understandable, other ones are too complicated for humans"): the old
  // `Field: A → B` chain, joined for every field a save touched, reads
  // like a database diff, not a sentence. Two changes:
  // 1) drop entries where the "before" and "after" render identically
  //    (e.g. undefined vs. explicit `false` both read "No" — not a real
  //    change the owner did, just a form always writing every field).
  // 2) phrase each real change as a short plain-English clause instead
  //    of a label/arrow pair, and cap how many clauses stack into one
  //    line before falling back to "and N more".
  function describeField(field: string, from: any, to: any): string {
    if (field === 'pinned') return to ? 'Pinned' : 'Unpinned';
    if (field === 'archived') return to ? 'Archived' : 'Taken out of archive';
    if (field === 'due_date') return from == null ? `Due date set to ${fmtVal(field, to)}` : to == null ? 'Due date removed' : `Due date moved to ${fmtVal(field, to)}`;
    if (field === 'reminder_at') return to == null ? 'Reminder removed' : `Reminder set for ${fmtVal(field, to)}`;
    if (field === 'remindOnDue') return to ? 'Reminder now follows the due date' : 'Reminder no longer follows the due date';
    if (field === 'tags') return `Tags changed to ${fmtVal(field, to)}`;
    if (field === 'priority') return `Priority changed to ${fmtVal(field, to)}`;
    if (field === 'title' || field === 'name') return `Renamed to "${to}"`;
    if (field === 'body') return 'Notes updated';
    if (field === 'checklist') return 'Checklist updated';
    if (field === 'custom_values') return 'Custom fields updated';
    if (field === 'columns') return 'Statuses updated';
    return `${FIELD_LABEL[field] ?? field} changed`;
  }

  // A field "really" changed if — for booleans — its truthiness flipped
  // (so undefined vs. explicit `false` count as the same, unchanged,
  // state), otherwise if its JSON representation differs. This must NOT
  // reuse fmtVal for the comparison: fmtVal collapses every checklist
  // edit to just an item count and every custom-field edit to the
  // literal string "updated" (by design, for display) — comparing those
  // display strings made every real checklist/custom-field change look
  // like a no-op and get filtered out, leaving nothing but the vague
  // "Details updated" fallback below.
  function hasRealChange(field: string, from: any, to: any): boolean {
    if (typeof from === 'boolean' || typeof to === 'boolean') return !!from !== !!to;
    return JSON.stringify(from) !== JSON.stringify(to);
  }

  const MAX_CLAUSES = 3;

  function fmtDiffs(diffs: Record<string, any>): string {
    const clauses = Object.entries(diffs)
      .filter(([field, d]: [string, any]) => hasRealChange(field, d.from, d.to))
      .map(([field, d]: [string, any]) => describeField(field, d.from, d.to));
    if (clauses.length === 0) return 'Details updated';
    if (clauses.length > MAX_CLAUSES) {
      return clauses.slice(0, MAX_CLAUSES).join(' · ') + ` · +${clauses.length - MAX_CLAUSES} more change${clauses.length - MAX_CLAUSES === 1 ? '' : 's'}`;
    }
    return clauses.join(' · ');
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

<svelte:window on:keydown={onWindowKeydown}/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="scrim" on:click|self={() => requestClose()}></div>

<div class="panel" use:trapFocus>
  <div class="panel-head">
    <span class="panel-title">Changelog</span>
    {#if logs.length > 0}
      <button class="clear-btn" on:click={async () => { await clearLogs(); logs = []; }}>Clear all</button>
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
  .source-pill.source-mobile { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }

  .log-time { font-family: var(--mono); font-size: 10.5px; color: var(--faint); flex-shrink: 0; }

  .empty { padding: 3rem; text-align: center; color: var(--faint); font-size: .88rem; }
</style>
