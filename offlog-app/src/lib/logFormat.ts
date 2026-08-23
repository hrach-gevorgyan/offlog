// Shared plain-English formatting for `log:` changelog docs, so every view
// that renders history (TimeTravelView, TaskHistoryPanel) produces identical
// descriptions rather than each deriving its own drifting copy.

import { fmtTime } from './utils';

// A single field's before/after pair as updateTask() records it, and the
// changelog fields these formatters read off a `log:` doc. Every field is
// optional and most values are `unknown`: which keys a log entry carries
// depends on the mutation, and a value can be any JSON a task field holds.
export interface LogDiff { from?: unknown; to?: unknown }

export interface LogEntry {
  action?: string;
  ref?: unknown;
  field?: string;
  from?: unknown;
  to?: unknown;
  diffs?: Record<string, LogDiff>;
  task_title?: string;
  project_name?: string;
  space_name?: string;
  field_name?: string;
}

const FIELD_LABEL: Record<string, string> = {
  title: 'Title', body: 'Notes', priority: 'Priority',
  due_date: 'Due date', reminder_at: 'Reminder', remindOnDue: 'Remind on due date',
  tags: 'Tags', name: 'Name', columns: 'Statuses',
  pinned: 'Pinned', archived: 'Archived', column_id: 'Status',
  checklist: 'Checklist', custom_values: 'Custom fields',
  color: 'Color', icon: 'Icon', recurrence: 'Repeat', related: 'Related tasks',
  recurrenceInterval: 'Repeat interval', recurrenceWeekdaysOnly: 'Weekdays only',
};

const PRIO: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
export const ACTION_LABEL: Record<string, string> = { create: 'Created', update: 'Edited', move: 'Moved', delete: 'Deleted' };

// Booleans always read as plain Yes/No (not the same as "no value").
function fmtVal(field: string, val: unknown): string {
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (val == null || val === '') return '—';
  if (field === 'body') return 'updated';
  if (field === 'priority') return PRIO[val as number] ?? String(val);
  if (field === 'tags') return Array.isArray(val) ? (val.join(', ') || 'none') : String(val);
  if (field === 'columns') return Array.isArray(val) ? val.map((c: { name: string }) => c.name).join(', ') : String(val);
  if (field === 'checklist') return Array.isArray(val) ? `${val.length} item${val.length === 1 ? '' : 's'}` : 'updated';
  if (field === 'custom_values') return 'updated';
  if (field === 'recurrence') return val === 'daily' ? 'Daily' : val === 'weekly' ? 'Weekly' : val === 'monthly' ? 'Monthly' : String(val);
  if (field === 'due_date') return new Date(`${val as string}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (field === 'reminder_at') { const d = new Date(val as string); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + fmtTime(d); }
  if (Array.isArray(val)) return val.length ? `${val.length} item${val.length === 1 ? '' : 's'}` : 'none';
  if (typeof val === 'object') return 'updated';
  const s = String(val);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

export function describeField(field: string, from: unknown, to: unknown): string {
  if (field === 'pinned') return to ? 'Pinned' : 'Unpinned';
  if (field === 'archived') return to ? 'Archived' : 'Taken out of archive';
  if (field === 'due_date') return from == null ? `Due date set to ${fmtVal(field, to)}` : to == null ? 'Due date removed' : `Due date moved to ${fmtVal(field, to)}`;
  if (field === 'reminder_at') return to == null ? 'Reminder removed' : `Reminder set for ${fmtVal(field, to)}`;
  if (field === 'remindOnDue') return to ? 'Reminder now follows the due date' : 'Reminder no longer follows the due date';
  if (field === 'recurrence') return to == null ? 'Repeat turned off' : `Set to repeat ${fmtVal(field, to).toLowerCase()}`;
  if (field === 'tags') return `Tags changed to ${fmtVal(field, to)}`;
  if (field === 'priority') return `Priority changed to ${fmtVal(field, to)}`;
  if (field === 'title' || field === 'name') return `Renamed to "${to}"`;
  if (field === 'body') return 'Notes updated';
  if (field === 'checklist') return 'Checklist updated';
  if (field === 'custom_values') return 'Custom fields updated';
  if (field === 'columns') return 'Statuses updated';
  if (field === 'related') return 'Related tasks updated';
  return `${FIELD_LABEL[field] ?? field} changed`;
}

// Must not reuse fmtVal for this comparison: fmtVal collapses checklist and
// custom-field edits to a fixed display string, which would make every real
// edit there look like a no-op.
//
// undefined/null and an empty object/array count as the same "nothing here"
// state. db.ts's updateTask() applies the same rule when writing, but this
// display-layer filter is still needed so already-stored diffs of the shape
// {from: undefined, to: {}} don't show a false "Custom fields updated" /
// "Checklist updated" clause.
function isEmpty(v: unknown): boolean {
  return v == null || (typeof v === 'object' && Object.keys(v).length === 0);
}

export function hasRealChange(from: unknown, to: unknown): boolean {
  if (typeof from === 'boolean' || typeof to === 'boolean') return !!from !== !!to;
  if (isEmpty(from) && isEmpty(to)) return false;
  return JSON.stringify(from) !== JSON.stringify(to);
}

const MAX_CLAUSES = 3;

function fmtDiffs(diffs: Record<string, LogDiff>): string {
  const clauses = Object.entries(diffs)
    .filter(([, d]) => hasRealChange(d.from, d.to))
    .map(([field, d]) => describeField(field, d.from, d.to));
  if (clauses.length === 0) return 'Details updated';
  if (clauses.length > MAX_CLAUSES) {
    return clauses.slice(0, MAX_CLAUSES).join(' · ') + ` · +${clauses.length - MAX_CLAUSES} more change${clauses.length - MAX_CLAUSES === 1 ? '' : 's'}`;
  }
  return clauses.join(' · ');
}

export function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · ' + fmtTime(d);
}

// Derived from the ref id's own prefix (space:/project:/task:), the same
// convention db.ts relies on -- otherwise create/delete always read as
// "task" regardless of what was actually created or deleted.
export function entityLabel(log: LogEntry): string {
  if (typeof log.ref !== 'string') return 'task';
  if (log.ref.startsWith('project:')) return 'project';
  if (log.ref.startsWith('space:')) return 'space';
  if (log.ref.startsWith('field:')) return 'field';
  return 'task';
}

export function describeLog(log: LogEntry): string {
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

  // undoDelete() logs a single-field 'deleted' true->false update rather
  // than reusing the 'delete' action (reserved for the forward delete, whose
  // entity type varies by ref prefix). Without this case it falls through to
  // the generic field formatter below and shows a raw "deleted: Yes → No".
  if (log.field === 'deleted') return `Restored ${entityLabel(log)} ${who ?? ''}`.trim();

  if (log.field) {
    const label = FIELD_LABEL[log.field] ?? log.field;
    const from  = fmtVal(log.field, log.from);
    const to    = fmtVal(log.field, log.to);
    const on    = who ? ` on ${who}` : '';
    return from === '—' ? `${label} set to ${to}${on}` : `${label}: ${from} → ${to}${on}`;
  }

  return `Updated ${who ?? 'item'}`;
}
