// Focus picker ranking, the same scoring and round-robin as FocusView.svelte:
// pinned and late outrank due-soon, which outranks priority alone, and the
// suggestions are drawn one per reason bucket in turn so they spread across
// reasons instead of collapsing to "the three latest tasks".
import type { TaskDoc } from '../../types';

export type Reason = 'pinned' | 'overdue' | 'due_soon' | 'priority';
export const REASON_ORDER: Reason[] = ['pinned', 'overdue', 'due_soon', 'priority'];

export function scoreAndReason(t: TaskDoc, today: string): { s: number; reason: Reason } {
  if (t.pinned) return { s: 1000, reason: 'pinned' };
  if (t.due_date) {
    const days = Math.floor((new Date(t.due_date).getTime() - new Date(today).getTime()) / 86400000);
    if (days < 0) return { s: 500 + Math.min(-days, 30), reason: 'overdue' };
    if (days === 0) return { s: 400, reason: 'due_soon' };
    if (days <= 3) return { s: 200 - days * 10, reason: 'due_soon' };
  }
  return { s: (t.priority ?? 1) * 20, reason: 'priority' };
}

// `suggested` keeps pick order; `rest` is everything else, best bucket first.
// Equal scores are shuffled with `rand` so no task is always first by accident;
// pass a per-task value that stays fixed across calls, or the order jumps on
// every refresh.
export function rankPicker<T extends TaskDoc>(tasks: T[], today: string, max: number, rand: (t: T) => number = () => Math.random()) {
  const scored = tasks.map(t => ({ t, ...scoreAndReason(t, today), r: rand(t) }));
  const buckets: Record<Reason, typeof scored> = { pinned: [], overdue: [], due_soon: [], priority: [] };
  scored.forEach(x => buckets[x.reason].push(x));
  REASON_ORDER.forEach(k => buckets[k].sort((a, b) => b.s - a.s || b.r - a.r));

  const suggested: { task: T; reason: Reason }[] = [];
  const cursors: Record<Reason, number> = { pinned: 0, overdue: 0, due_soon: 0, priority: 0 };
  while (suggested.length < max) {
    let any = false;
    for (const k of REASON_ORDER) {
      if (suggested.length >= max) break;
      const b = buckets[k];
      if (cursors[k] < b.length) { suggested.push({ task: b[cursors[k]++].t, reason: k }); any = true; }
    }
    if (!any) break;
  }
  const picked = new Set(suggested.map(x => x.task._id));
  const rest = REASON_ORDER.flatMap(k => buckets[k].map(x => x.t)).filter(t => !picked.has(t._id));
  return { suggested, rest };
}
