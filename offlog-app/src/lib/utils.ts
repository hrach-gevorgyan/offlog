import { getTimeFormat24h } from '../config';

// Shared by TimeTravelView and TaskHistoryPanel — both render the same
// four changelog action types with independently-drifted hex values.
// CSS var()s here (not fixed hex) so these stay correct across light/dark
// instead of being a frozen snapshot of one theme.
export const ACTION_COLOR: Record<string, string> = {
  create: 'var(--success)', update: 'var(--accent)', move: 'var(--due-soon-ink)', delete: 'var(--danger)',
};

// Single source of truth for "how does a clock time render" across the
// whole app (Time Travel, reminders, last-synced, task history) so the
// Settings -> Appearance 24h/12h toggle (config.ts's getTimeFormat24h,
// same per-device-override pattern as week-start-day) actually covers
// every display site instead of just whichever one someone remembered
// to update.
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: getTimeFormat24h() ? '2-digit' : 'numeric', minute: '2-digit', hour12: !getTimeFormat24h() });
}

const TODAY = () => new Date().toISOString().slice(0, 10);

// B47 — `Date.getDay()` is 0-indexed from Sunday; this converts it to
// "days since the start of the week" for either week-start convention,
// so callers doing `d.getDate() - daysSinceWeekStart(d, monday)` get a
// correct start-of-week regardless of the setting.
export function daysSinceWeekStart(d: Date, mondayStart: boolean): number {
  return mondayStart ? (d.getDay() + 6) % 7 : d.getDay();
}

export function daysDiff(due: string): number {
  return Math.round((new Date(due).getTime() - new Date(TODAY()).getTime()) / 86400000);
}

// B5: relative-time formatting for "edited on <device>, 2h ago" in
// CardDetail's history panel and Settings' per-device last-seen list —
// distinct from the due-date-specific dueLabel/dueRelative above (which
// assume a date-only, possibly-future value; this takes a full ISO
// timestamp that's always in the past).
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dueLabel(due: string | null, fallback = ''): string {
  if (!due) return fallback;
  const days = daysDiff(due);
  const short = new Date(due + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days < 0) return `Overdue · ${short}`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return short;
}

export function dueLabelLong(due: string): string {
  const days = daysDiff(due);
  const short = new Date(due + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (days < 0) return `${Math.abs(days)}d overdue · ${short}`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return short;
}

export function dueRelative(due: string): string {
  const days = daysDiff(due);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

export type DueState = 'overdue' | 'soon' | 'normal' | 'none';

export function dueState(due: string | null): DueState {
  if (!due) return 'none';
  const days = daysDiff(due);
  if (days < 0) return 'overdue';
  if (days <= 1) return 'soon';
  return 'normal';
}

export function dueInk(due: string | null): string {
  if (!due) return 'var(--faint)';
  const days = daysDiff(due);
  if (days < 0) return 'var(--overdue-ink)';
  if (days <= 1) return 'var(--due-soon-ink)';
  return 'var(--muted)';
}

// A30 — was duplicated byte-for-byte in Sidebar.svelte and SettingsPanel.svelte
// (last-synced display). Same-day shows just the time, otherwise a short
// date + time.
export function fmtLastSynced(ts: string): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? fmtTime(d) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + fmtTime(d);
}

// A30 — was duplicated byte-for-byte in CardDetail.svelte and
// TaskHistoryPanel.svelte (full created/updated/history timestamps).
export function fmtFullTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + fmtTime(d);
}

export function filterTasks<T extends { title: string; column_id: string; priority: number; tags: string[] }>(
  tasks: T[],
  search: string,
  filterCol: string,
  filterPrio: number,
  filterTag: string,
): T[] {
  return tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCol && t.column_id !== filterCol) return false;
    if (filterPrio && t.priority !== filterPrio) return false;
    if (filterTag && !t.tags.includes(filterTag)) return false;
    return true;
  });
}
