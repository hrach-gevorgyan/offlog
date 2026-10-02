import { localDateStr } from '../utils';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysFrom(today: string, due: string): number {
  return Math.round((new Date(due + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 864e5);
}

// The phone's one date wording ("Sun 4 Oct"), with the year only when it
// isn't this year — a date a year out must not read as this year.
export function shortDate(iso: string, today = new Date()): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  const s = `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? s : `${s} ${d.getFullYear()}`;
}

export type DueTone = 'late' | 'today' | '';

// The date pill on a phone card. A finished task's date is history: it is
// never "late" (done is positional, so the caller decides).
export function duePill(due: string | null | undefined, done = false, today = localDateStr(new Date())): { text: string; tone: DueTone } | null {
  if (!due) return null;
  const n = daysFrom(today, due);
  if (n < 0 && !done) return { text: n === -1 ? '1 day late' : n < -30 ? '30+ days late' : `${-n} days late`, tone: 'late' };
  if (n === 0) return { text: 'Today', tone: 'today' };
  if (n === 1) return { text: 'Tomorrow', tone: '' };
  if (n > 1 && n < 7) return { text: WD[new Date(due + 'T12:00:00').getDay()], tone: '' };
  return { text: shortDate(due, new Date(today + 'T12:00:00')), tone: '' };
}

export function greeting(hour = new Date().getHours()): string {
  return hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}
