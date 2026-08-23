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

// Shared by GlobalSearch (sync-derived, untrusted title text) and
// UpdateModal (own release-notes text) — both feed a `{@html}` sink and
// must escape first, since both were carrying an identical inline copy.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Local calendar date. Never use toISOString().slice(0,10) for this: it is
// UTC and lands on the wrong day for anyone off UTC (west of UTC during the
// local evening, east of UTC during the local early morning), which disagrees
// with how due_date itself is stored (db.ts's local-date convention) during
// the offset-sized daily window where the two calendar dates differ.
// Every day-boundary calculation in the app must go through this one
// implementation — db.ts imports it from here rather than keeping its own
// copy (and this file must never import db.ts, to keep that acyclic).
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = () => localDateStr(new Date());

// `Date.getDay()` is 0-indexed from Sunday; this converts it to
// "days since the start of the week" for either week-start convention,
// so callers doing `d.getDate() - daysSinceWeekStart(d, monday)` get a
// correct start-of-week regardless of the setting.
export function daysSinceWeekStart(d: Date, mondayStart: boolean): number {
  return mondayStart ? (d.getDay() + 6) % 7 : d.getDay();
}

function daysDiff(due: string): number {
  return Math.round((new Date(due + 'T00:00:00').getTime() - new Date(TODAY() + 'T00:00:00').getTime()) / 86400000);
}

// Relative-time formatting for "edited on <device>, 2h ago" in CardDetail's
// history panel and Settings' per-device last-seen list — distinct from the
// due-date-specific dueLabel/dueRelative above (which assume a date-only,
// possibly-future value; this takes a full ISO timestamp always in the past).
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

// Plain weekday+date, no relative wording ("Today"/"Tomorrow"/"Nd overdue")
// -- for pairing next to dueRelative() without producing "Tomorrow ·
// Tomorrow" (both functions independently collapse day===1 to the same
// literal word).
export function dueDateShort(due: string): string {
  return new Date(due + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function dueRelative(due: string): string {
  const days = daysDiff(due);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

export function dueInk(due: string | null): string {
  if (!due) return 'var(--faint)';
  const days = daysDiff(due);
  if (days < 0) return 'var(--overdue-ink)';
  if (days <= 1) return 'var(--due-soon-ink)';
  return 'var(--muted)';
}

// Last-synced display, shared by Sidebar.svelte and SettingsPanel.svelte.
// Same-day shows just the time, otherwise a short date + time.
export function fmtLastSynced(ts: string): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? fmtTime(d) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + fmtTime(d);
}

// Full created/updated/history timestamps, shared by CardDetail.svelte and
// TaskHistoryPanel.svelte.
export function fmtFullTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + fmtTime(d);
}

// A lightweight "did you mean to do this" nudge for accidental duplicates
// (e.g. two independently-seeded devices merging), never a blocking rule —
// same-name projects/spaces/tasks and similar notes are all legitimate.

// Pure, local word-overlap similarity (Jaccard over normalized word sets):
// no network call, no new dependency. Notes are often the most sensitive text
// in the app, and "is this similar to that" doesn'''t need a network round-trip
// to answer well enough for a soft hint.
export function wordOverlapSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const setA = words(a), setB = words(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return shared / new Set([...setA, ...setB]).size;
}

// Exact-duplicate check for a task's checklist — cheap, unambiguous
// (unlike notes, a checklist item is short enough that "similar" isn't
// a useful signal, only "identical" is). Returns the duplicated text
// values (case-insensitive, trimmed), not indices, since CardDetail just
// needs to know *what* text repeats to show a hint.
export function findDuplicateChecklistItems(items: { text: string }[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    const key = item.text.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) dupes.add(item.text.trim());
    seen.add(key);
  }
  return [...dupes];
}

export interface CustomFieldFilter { fieldId: string; value: string }

export function filterTasks<T extends {
  title: string; column_id: string; priority: number; tags: string[];
  custom_values?: Record<string, string | number | null>;
}>(
  tasks: T[],
  search: string,
  filterCol: string,
  filterPrio: number,
  filterTag: string,
  // Exact-match filters against custom field values, same "dropdown of
  // currently-used values" shape as the tag filter above, but a *list*:
  // every entry must match (AND), the same way stacking Status + Tag +
  // Priority does. Defaulted so call sites that don't pass it are unaffected.
  customFieldFilters: CustomFieldFilter[] = [],
): T[] {
  return tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCol && t.column_id !== filterCol) return false;
    if (filterPrio && t.priority !== filterPrio) return false;
    if (filterTag && !t.tags.includes(filterTag)) return false;
    for (const f of customFieldFilters) {
      if (f.fieldId && f.value && String(t.custom_values?.[f.fieldId] ?? '') !== f.value) return false;
    }
    return true;
  });
}
