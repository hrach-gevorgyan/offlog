// The day's Focus commitment lock, shared by FocusView.svelte and
// DashboardView.svelte's "Daily Brief" card so the parsing/date-staleness
// logic isn't duplicated. Deliberately NOT a PouchDB doc — this is ephemeral
// per-day UI state, not data worth syncing across devices.
import { localDateStr } from './utils';

const STORAGE_KEY = 'offlog_focus_lock';

export interface FocusLock { date: string; taskIds: string[] }

export function today(): string { return localDateStr(new Date()); }

export function loadFocusLock(): FocusLock | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const lock: FocusLock = JSON.parse(raw);
    return lock.date === today() ? lock : null; // stale day → treat as unset
  } catch { return null; }
}

export function saveFocusLock(lock: FocusLock | null) {
  if (lock) localStorage.setItem(STORAGE_KEY, JSON.stringify(lock));
  else localStorage.removeItem(STORAGE_KEY);
}
