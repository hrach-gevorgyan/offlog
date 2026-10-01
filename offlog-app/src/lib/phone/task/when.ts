import { localDateStr } from '../../utils';
import { shortDate } from '../format';

export function dateLabel(ymd: string, today = new Date()): string {
  return shortDate(ymd, today);
}

// "Later today": three hours from now, rounded up to the hour, as a local
// 'YYYY-MM-DDTHH:mm'. Null once that lands after 21:00 or past midnight —
// a reminder that late is not "later today" any more.
export function laterToday(now = new Date()): string | null {
  const t = new Date(now.getTime() + 3 * 3600e3);
  if (t.getMinutes() || t.getSeconds() || t.getMilliseconds()) t.setHours(t.getHours() + 1, 0, 0, 0);
  if (localDateStr(t) !== localDateStr(now) || t.getHours() > 21) return null;
  return `${localDateStr(t)}T${String(t.getHours()).padStart(2, '0')}:00`;
}
