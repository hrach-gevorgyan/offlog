// Credentials come from .env.local (git-ignored via *.local).
// The sync URL is also stored in localStorage so it can be changed in-app.

const envUrl = import.meta.env.VITE_COUCH_URL as string | undefined;
const envUser = import.meta.env.VITE_COUCH_USER as string | undefined;
const envPass = import.meta.env.VITE_COUCH_PASS as string | undefined;

function isNativePlatform(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

// Owner-reported real bug (2026-07-13): this used to fall back to a
// hardcoded real LAN IP, which goes stale the moment the sync host's IP
// changes (DHCP, router restart, new network) — and a fresh install or
// reinstall wipes localStorage, silently reverting to that same wrong
// address with no indication anything was misconfigured (exactly what
// happened: a phone reinstall silently pointed sync at a year-old IP).
//
// The fix has two parts. On Android/native, there's no way to guess a
// working address — falls back to '' ("not configured"); startSync()/
// syncNow() treat that as a no-op, and Settings' Sync tab already shows
// a friendly "Not connected to another device yet" for it (B43).
//
// On desktop web, though, a real default *is* structurally guaranteed
// correct: this app's architecture is "the PC is the host" (GOAL.md) —
// CouchDB runs on the same machine as the browser tab — so loopback
// (127.0.0.1) is always right, unlike a remembered LAN IP, which can
// silently stop being this machine's address. Unlike the old bug, this
// isn't a guess that can go stale: loopback is loopback forever,
// regardless of DHCP, routers, or networks. Only applies when nothing
// was explicitly configured (no VITE_COUCH_URL, no saved value) — an
// explicit choice (e.g. syncing to a different machine's CouchDB) is
// never overridden.
export const DEFAULT_SYNC_URL = envUrl ?? (typeof window !== 'undefined' && !isNativePlatform() ? 'http://127.0.0.1:5984/offlog' : '');

export function getSyncUrl(): string {
  return localStorage.getItem('offlog_sync_url') ?? DEFAULT_SYNC_URL;
}

export function setSyncUrl(url: string) {
  localStorage.setItem('offlog_sync_url', url);
}

// Track E's pairing handshake (offlog-desktop/src-tauri/src/pairing.rs):
// the PC app generates a random password per install, so a fixed
// COUCH_USER/COUCH_PASS baked into the JS bundle can never match every
// PC a device might sync to. Credentials are now per-device, stored the
// same way the URL already is, with the env-var values (this repo's own
// dev CouchDB, or a self-hoster's manually-configured one) as the
// fallback for any install that hasn't paired or been given credentials
// explicitly — same fallback shape as DEFAULT_SYNC_URL above, so an
// existing install with nothing stored yet keeps syncing exactly as
// before this change.
const DEFAULT_COUCH_USER = envUser ?? 'offlog';
const DEFAULT_COUCH_PASS = envPass ?? 'REDACTED_CREDENTIAL';

export function getSyncCredentials(): { user: string; pass: string } {
  return {
    user: localStorage.getItem('offlog_sync_user') ?? DEFAULT_COUCH_USER,
    pass: localStorage.getItem('offlog_sync_pass') ?? DEFAULT_COUCH_PASS,
  };
}

export function setSyncCredentials(user: string, pass: string) {
  localStorage.setItem('offlog_sync_user', user);
  localStorage.setItem('offlog_sync_pass', pass);
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
