// Credentials come from .env.local (git-ignored via *.local).
// The sync URL is also stored in localStorage so it can be changed in-app.

const envUrl = import.meta.env.VITE_COUCH_URL as string | undefined;
const envUser = import.meta.env.VITE_COUCH_USER as string | undefined;
const envPass = import.meta.env.VITE_COUCH_PASS as string | undefined;

function isNativePlatform(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

// Maintenance pass (2026-07-19): exported so SettingsPanel.svelte doesn't
// re-declare its own copy of this check, and pairs with invokeTauri()
// below so every `window.__TAURI_INTERNALS__.invoke(...)` call site
// shares one `as any` cast instead of five independent ones.
export function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

export function invokeTauri<T = any>(cmd: string): Promise<T> {
  return (window as any).__TAURI_INTERNALS__.invoke(cmd);
}

// Owner-reported real bug (2026-07-13): this used to fall back to a
// hardcoded real LAN IP, which goes stale the moment the sync host's IP
// changes (DHCP, router restart, new network) — and a fresh install or
// reinstall wipes localStorage, silently reverting to that same wrong
// address with no indication anything was misconfigured (exactly what
// happened: a phone reinstall silently pointed sync at a year-old IP).
//
// The fix has three parts now. On Android/native, there's no way to
// guess a working address — falls back to '' ("not configured");
// startSync()/syncNow() treat that as a no-op, and Settings' Sync tab
// already shows a friendly "Not connected to another device yet" for
// it (B43).
//
// On plain desktop web, a real default *is* structurally guaranteed
// correct: this app's architecture is "the PC is the host" (GOAL.md) —
// a manually-installed CouchDB runs on the same machine as the browser
// tab, on its standard port — so loopback:5984 is always right there.
//
// The Tauri desktop app (Track E) is a THIRD case, easy to conflate
// with plain desktop web since both are "not Capacitor" -- but its
// embedded CouchDB sidecar (sync_host.rs) binds a random port, chosen
// fresh per install, never 5984. Falling through to the desktop-web
// branch above silently pointed the Tauri app at port 5984 regardless
// -- whatever happened to be listening there (a completely unrelated,
// separately-installed CouchDB, in the case that surfaced this) rather
// than its own sidecar. Caught live: the Tauri app reported "synced"
// successfully against the wrong database the whole time, since a
// real CouchDB really was answering on 5984, just not the right one.
// No synchronous default is possible here (the real port is only
// knowable via the async get_sync_info Tauri command) -- falls back to
// '' like Android, resolved by initTauriSyncDefaults() below before
// the first sync attempt.
export const DEFAULT_SYNC_URL = envUrl ?? (typeof window !== 'undefined' && !isNativePlatform() && !isTauri() ? 'http://127.0.0.1:5984/offlog' : '');

// Called once at app boot (store.ts's initApp(), before startSync()) --
// if this is the Tauri desktop app and nothing has been explicitly
// configured yet (no saved URL, meaning either a fresh install or an
// install still carrying the old wrong 5984 default from before this
// fix), points it at its own embedded sidecar instead of guessing.
// Never overrides an explicit choice someone already made (e.g.
// pairing with, or manually configuring, a different machine).
export async function initTauriSyncDefaults(): Promise<void> {
  if (!isTauri()) return;
  const saved = localStorage.getItem('offlog_sync_url');
  if (saved && saved !== 'http://127.0.0.1:5984/offlog') return;
  try {
    const info = await invokeTauri<{ port: number; user: string; password: string }>('get_sync_info');
    setSyncUrl(`http://127.0.0.1:${info.port}/offlog`);
    setSyncCredentials(info.user, info.password);
  } catch {
    // sidecar not ready yet or invoke failed -- leave whatever was
    // there (possibly the stale 5984 default); next launch retries.
  }
}

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
// same way the URL already is.
//
// C7 (ROADMAP.md Track C, mandatory release-gate item): this used to
// fall back to a real hardcoded password when nothing was configured
// -- present in git history too, a real public-repo blocker on its own,
// independent of pairing. No real credential lives in source at all now
// -- VITE_COUCH_USER/VITE_COUCH_PASS come from `.env.local` only
// (git-ignored, never committed) for local dev against a manually-
// configured CouchDB; anyone else gets '' until they pair or type
// credentials in manually, same "not configured yet" semantics
// DEFAULT_SYNC_URL already uses for native/Tauri above -- Settings
// already shows a friendly "Not connected" for an empty URL, and an
// empty password just fails auth cleanly (401) rather than silently
// working against a hardcoded default that shouldn't exist.
const DEFAULT_COUCH_USER = envUser ?? '';
const DEFAULT_COUCH_PASS = envPass ?? '';

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

// B46: a lightweight first-run prompt asks for this device's name once,
// ever — regardless of whether the user names it or skips (skipping is as
// valid a choice as naming it, per C2's zero-config-first-run principle,
// so this flag is set either way, not only on save). Separate key from
// DEVICE_NAME_KEY itself, since getDeviceName() already silently
// auto-generates a default the first time it's called — that alone can't
// signal "has this device actually been asked yet."
const NAME_PROMPTED_KEY = 'offlog_name_prompted';

export function hasShownNamePrompt(): boolean {
  return localStorage.getItem(NAME_PROMPTED_KEY) === '1';
}

export function markNamePromptShown() {
  localStorage.setItem(NAME_PROMPTED_KEY, '1');
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
