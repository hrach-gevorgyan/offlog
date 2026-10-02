import { readable } from 'svelte/store';
import { localDateStr } from './utils';

// Next local midnight built from calendar fields, never `now + 24h`: a DST
// day is 23 or 25 hours long.
export function msUntilNextLocalMidnight(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
}

// The local calendar date (YYYY-MM-DD). Anything that labels or groups by
// "today" must read this reactively, or it keeps yesterday's date after
// midnight until something else happens to re-render it.
// One timer app-wide: it exists only while something is subscribed. Timers
// stall while a laptop or phone sleeps, so waking re-checks immediately;
// set() ignores an unchanged string, so re-checks are free.
export const today = readable(localDateStr(new Date()), set => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    set(localDateStr(new Date()));
    clearTimeout(timer);
    timer = setTimeout(check, msUntilNextLocalMidnight() + 50);
  };
  const onWake = () => { if (!document.hidden) check(); };
  check();
  document.addEventListener('visibilitychange', onWake);
  // Capacitor's Cordova layer dispatches 'resume' on document on native.
  document.addEventListener('resume', onWake);
  window.addEventListener('focus', onWake);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onWake);
    document.removeEventListener('resume', onWake);
    window.removeEventListener('focus', onWake);
  };
});

// Runs `fn` on each date change after subscribing, not for the current day:
// for screens that already loaded on mount and only need a reload at rollover.
export function onNewDay(fn: (day: string) => void): () => void {
  let first = true;
  return today.subscribe(day => { if (first) first = false; else fn(day); });
}
