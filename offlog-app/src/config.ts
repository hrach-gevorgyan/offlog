// Credentials come from .env.local (git-ignored via *.local).
// The sync URL is also stored in localStorage so it can be changed in-app.

const envUrl = import.meta.env.VITE_COUCH_URL as string | undefined;
const envUser = import.meta.env.VITE_COUCH_USER as string | undefined;
const envPass = import.meta.env.VITE_COUCH_PASS as string | undefined;

// Owner-reported real bug (2026-07-13): this used to fall back to a
// hardcoded real LAN IP. That address goes stale the moment the sync
// host's IP changes (DHCP, router restart, new network) — and worse, a
// fresh install or reinstall wipes localStorage, silently reverting to
// this same wrong hardcoded address with no indication anything was
// misconfigured (the exact failure that just happened: a phone reinstall
// silently pointed sync at a year-old IP instead of showing "not
// connected"). Falls back to empty now — startSync()/syncNow() treat an
// empty URL as "not configured" and skip attempting a connection
// entirely, and Settings' Sync tab already has a friendly "Not connected
// to another device yet" state for exactly this (B43). Set VITE_COUCH_URL
// in .env.local (git-ignored) for your own convenience if you want your
// own builds to default to your current server instead of typing it in
// once after install.
export const DEFAULT_SYNC_URL = envUrl ?? '';
export const COUCH_USER = envUser ?? 'offlog';
export const COUCH_PASS = envPass ?? 'REDACTED_CREDENTIAL';

export function getSyncUrl(): string {
  return localStorage.getItem('offlog_sync_url') ?? DEFAULT_SYNC_URL;
}

export function setSyncUrl(url: string) {
  localStorage.setItem('offlog_sync_url', url);
}

// B22: `source` on every doc used to be a fixed 'pc' | 'pc2' | 'mobile'
// enum — not enough once there's more than one PC or phone in play. Now a
// free-form per-device name, generated once on first run and editable in
// Settings; stored (and everywhere `source` already showed up) as plain
// text instead. Kept in its own localStorage key, not reusing
// offlog_sync_url's pattern, since this identifies the device rather than
// configuring where it syncs to.
const DEVICE_NAME_KEY = 'offlog_device_name';

function defaultDeviceName(): string {
  const isAndroid = (window as any).Capacitor?.getPlatform?.() === 'android';
  return isAndroid ? 'Android phone' : 'PC';
}

export function getDeviceName(): string {
  const stored = localStorage.getItem(DEVICE_NAME_KEY);
  if (stored) return stored;
  const generated = defaultDeviceName();
  localStorage.setItem(DEVICE_NAME_KEY, generated);
  return generated;
}

export function setDeviceName(name: string) {
  const trimmed = name.trim();
  localStorage.setItem(DEVICE_NAME_KEY, trimmed || defaultDeviceName());
}

// B13: explicit sync on/off, independent of the configured URL — clearing
// the URL to "pause" sync also drops the server config, which isn't what
// "stop syncing for a while" should mean. Defaults to enabled (true) so
// existing installs keep syncing exactly as before until someone opts out.
const SYNC_ENABLED_KEY = 'offlog_sync_enabled';

export function isSyncEnabled(): boolean {
  return localStorage.getItem(SYNC_ENABLED_KEY) !== 'false';
}

export function setSyncEnabled(enabled: boolean) {
  localStorage.setItem(SYNC_ENABLED_KEY, String(enabled));
}

// B12: "remind me on the due date" derives reminder_at from due_date at
// this time-of-day, so the exact date+time doesn't need picking twice for
// the common case. Per-device (not synced) — a phone and a PC may
// reasonably want a different default nudge time, same reasoning as
// B36's per-device localStorage choices.
const DEFAULT_REMINDER_TIME_KEY = 'offlog_default_reminder_time';

export function getDefaultReminderTime(): string {
  return localStorage.getItem(DEFAULT_REMINDER_TIME_KEY) ?? '09:00';
}

export function setDefaultReminderTime(time: string) {
  localStorage.setItem(DEFAULT_REMINDER_TIME_KEY, time);
}
