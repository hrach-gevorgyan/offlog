import { writable } from 'svelte/store';
import { localDateStr, daysSinceWeekStart } from '../../utils';

// The day picked in Agenda's Month mode while it is showing, else null —
// so the shell's + button can prefill that day's due date.
export const agendaDay = writable<string | null>(null);

// Whole weeks covering the month `offset` months from `now`'s month.
export function monthGrid(offset: number, mondayFirst: boolean, now = new Date()) {
  const anchor = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
  const lead = daysSinceWeekStart(anchor, mondayFirst);
  const len = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((lead + len) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), 1 - lead + i, 12);
    return { iso: localDateStr(d), day: d.getDate(), inMonth: d.getMonth() === anchor.getMonth() };
  });
  return { anchor, days };
}

// Last day of the week containing `now`, as YYYY-MM-DD.
export function endOfWeek(mondayFirst: boolean, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  d.setDate(d.getDate() + (6 - daysSinceWeekStart(d, mondayFirst)));
  return localDateStr(d);
}
