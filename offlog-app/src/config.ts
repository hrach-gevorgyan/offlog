// Credentials come from .env.local (git-ignored via *.local).
// The sync URL is also stored in localStorage so it can be changed in-app.

const envUrl = import.meta.env.VITE_COUCH_URL as string | undefined;
const envUser = import.meta.env.VITE_COUCH_USER as string | undefined;
const envPass = import.meta.env.VITE_COUCH_PASS as string | undefined;

export const DEFAULT_SYNC_URL = envUrl ?? 'http://192.168.27.200:5984/offlog';
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
