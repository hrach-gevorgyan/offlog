// B35 — the day's Focus commitment lock, extracted out of FocusView.svelte
// so DashboardView.svelte's new "Daily Brief" card (B35) can read the same
// state without duplicating the parsing/date-staleness logic. Deliberately
// NOT a PouchDB doc, still — this is ephemeral per-day UI state, not data
// worth syncing across devices (see FocusView.svelte's own original
// comment on this).
const STORAGE_KEY = 'offlog_focus_lock';

export interface FocusLock { date: string; taskIds: string[] }

export function today(): string { return new Date().toISOString().slice(0, 10); }

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
