// The date and reminder choices quick add and the task screen both offer:
// one list, so the two never drift apart.
import { dateFromToday, isoToLocalInput } from '../carddetail/helpers';
import { getDefaultReminderTime } from '../../config';
import { fmtTime } from '../utils';
import { laterToday } from './task/when';

export function dueShortcuts(now = new Date()): { label: string; date: string }[] {
  const dow = now.getDay();
  return [
    { label: 'Today', date: dateFromToday(0) },
    { label: 'Tomorrow', date: dateFromToday(1) },
    { label: 'Next Monday', date: dateFromToday((8 - dow) % 7 || 7) },
    { label: 'In a week', date: dateFromToday(7) },
    { label: 'In a month', date: dateFromToday(0, 1) },
  ].filter((s, i, all) => all.findIndex(o => o.date === s.date) === i)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Local 'YYYY-MM-DDTHH:mm' presets still ahead of now, earliest first.
export function reminderPresets(): { at: string; label: string }[] {
  const defTime = getDefaultReminderTime();
  const timeLabel = (hhmm: string) => fmtTime(new Date(`1970-01-01T${hhmm}`));
  const nowLocal = isoToLocalInput(new Date().toISOString());
  const later = laterToday();
  return [
    ...(later ? [{ at: later, label: `Later today at ${timeLabel(later.slice(11))}` }] : []),
    { at: `${dateFromToday(0)}T${defTime}`, label: `Today at ${timeLabel(defTime)}` },
    { at: `${dateFromToday(0)}T18:00`, label: `This evening at ${timeLabel('18:00')}` },
    { at: `${dateFromToday(1)}T${defTime}`, label: `Tomorrow at ${timeLabel(defTime)}` },
  ].filter((p, i, all) => p.at > nowLocal && all.findIndex(q => q.at === p.at) === i)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}
