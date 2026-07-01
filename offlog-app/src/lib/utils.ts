const TODAY = () => new Date().toISOString().slice(0, 10);

export function daysDiff(due: string): number {
  return Math.round((new Date(due).getTime() - new Date(TODAY()).getTime()) / 86400000);
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
