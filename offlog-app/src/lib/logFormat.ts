// Shared plain-English formatting for `log:` changelog docs — extracted
// from the old ChangelogView.svelte (2026-07-18, since replaced by
// TimeTravelView.svelte) so the Time Travel journal view can render the
// exact same descriptions instead of re-deriving its own, drifting copy
// over time. See git history predating the rename for the readability
// passes that shaped this logic.

export const FIELD_LABEL: Record<string, string> = {
  title: 'Title', body: 'Notes', priority: 'Priority',
  due_date: 'Due date', reminder_at: 'Reminder', remindOnDue: 'Remind on due date',
  tags: 'Tags', name: 'Name', columns: 'Statuses',
  pinned: 'Pinned', archived: 'Archived', column_id: 'Status',
  checklist: 'Checklist', custom_values: 'Custom fields',
};

const PRIO: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
export const ACTION_LABEL: Record<string, string> = { create: 'Created', update: 'Edited', move: 'Moved', delete: 'Deleted' };

// Booleans always read as plain Yes/No (not the same as "no value").
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

// See the pre-rename ChangelogView.svelte's own comment history for why this can't
// reuse fmtVal for the comparison (fmtVal collapses checklist/custom-
// field edits to a fixed display string, which would make every real
// edit there look like a no-op).
//
// undefined/null and an empty object/array count as the same "nothing
// here" state -- same fix as db.ts's updateTask() (2026-07-18), kept
// here too as a display-layer filter so log docs written before that fix
// (which already have a stored {from: undefined, to: {}}-shaped diff)
// also stop showing a false "Custom fields updated"/"Checklist updated"
// clause, not just newly-written ones.
function isEmpty(v: any): boolean {
  return v == null || (typeof v === 'object' && Object.keys(v).length === 0);
}

function hasRealChange(field: string, from: any, to: any): boolean {
  if (typeof from === 'boolean' || typeof to === 'boolean') return !!from !== !!to;
  if (isEmpty(from) && isEmpty(to)) return false;
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

export function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Derived from the ref id's own prefix, same convention CLAUDE.md
// documents db.ts relying on everywhere else -- create/delete otherwise
// always read as "task" regardless of what was actually created/deleted.
export function entityLabel(log: any): string {
  if (typeof log.ref !== 'string') return 'task';
  if (log.ref.startsWith('project:')) return 'project';
  if (log.ref.startsWith('space:')) return 'space';
  if (log.ref.startsWith('field:')) return 'field';
  return 'task';
}

export function describeLog(log: any): string {
  const who = log.task_title ? `"${log.task_title}"`
    : log.project_name ? `"${log.project_name}"`
    : log.space_name ? `"${log.space_name}"`
    : log.field_name ? `"${log.field_name}"`
    : null;

  if (log.action === 'create') return `Created ${entityLabel(log)} ${who ?? ''}`.trim();
  if (log.action === 'delete') return `Deleted ${entityLabel(log)} ${who ?? ''}`.trim();

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
