// Credentials come from .env.local (git-ignored via *.local).
// The sync URL is also stored in localStorage so it can be changed in-app.

import { writable } from 'svelte/store';

const envUrl = import.meta.env.VITE_COUCH_URL as string | undefined;
const envUser = import.meta.env.VITE_COUCH_USER as string | undefined;
const envPass = import.meta.env.VITE_COUCH_PASS as string | undefined;

// Exported (was module-private) so SettingsPanel.svelte can gate the
// biometric-unlock note to Android only — this project ships no other
// Capacitor-native platform (see GOAL.md/DECISIONS.md: no iOS), so
// "native platform" and "Android" are the same thing here in practice.
export function isNativePlatform(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

// Maintenance pass (2026-07-19): exported so SettingsPanel.svelte doesn't
// re-declare its own copy of this check, and pairs with invokeTauri()
// below so every `window.__TAURI_INTERNALS__.invoke(...)` call site
// shares one `as any` cast instead of five independent ones.
export function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

export function invokeTauri<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return (window as any).__TAURI_INTERNALS__.invoke(cmd, args);
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
// with plain desktop web since both are "not Capacitor" — but its
// embedded CouchDB sidecar (sync_host.rs) binds a random port, chosen
// fresh per install, never 5984. Falling through to the desktop-web
// branch above silently pointed the Tauri app at port 5984 regardless
// — whatever happened to be listening there (a completely unrelated,
// separately-installed CouchDB, in the case that surfaced this) rather
// than its own sidecar. Caught live: the Tauri app reported "synced"
// successfully against the wrong database the whole time, since a
// real CouchDB really was answering on 5984, just not the right one.
// No synchronous default is possible here (the real port is only
// knowable via the async get_sync_info Tauri command) — falls back to
// '' like Android, resolved by initTauriSyncDefaults() below before
// the first sync attempt.
export const DEFAULT_SYNC_URL = envUrl ?? (typeof window !== 'undefined' && !isNativePlatform() && !isTauri() ? 'http://127.0.0.1:5984/offlog' : '');

// Called once at app boot (store.ts's initApp(), before startSync()) —
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
    // sidecar not ready yet or invoke failed — leave whatever was
    // there (possibly the stale 5984 default); next launch retries.
  }
}

// S1 (docs/IDEAS.md's sync-topology questions, 2026-07-20): the desktop
// app's embedded sidecar never checked whether another Offlog host
// already exists on the LAN before spawning its own -- two PCs on one
// network silently become two independent islands with no warning. This
// doesn't change that (a real "join as client instead" mode is a much
// bigger feature, deliberately not built), it only surfaces what the
// Rust side's one-time startup scan (discovery.rs's browse_for_others())
// found, so Settings can show a warning. Polled a couple of times after
// launch rather than once immediately, since the scan itself only runs
// after the embedded CouchDB has finished booting (a few seconds) --
// calling this too early just gets an empty list, which is not the same
// as "no other host exists".
export const otherHostsDetected = writable<{ uuid: string; name: string }[]>([]);

export async function checkForOtherHosts(): Promise<void> {
  if (!isTauri()) return;
  try {
    const hosts = await invokeTauri<{ uuid: string; name: string }[]>('get_detected_other_hosts');
    if (hosts.length) otherHostsDetected.set(hosts);
  } catch {
    // command unavailable (older build) or invoke failed -- non-critical,
    // just skip the warning this launch.
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
// — present in git history too, a real public-repo blocker on its own,
// independent of pairing. No real credential lives in source at all now
// — VITE_COUCH_USER/VITE_COUCH_PASS come from `.env.local` only
// (git-ignored, never committed) for local dev against a manually-
// configured CouchDB; anyone else gets '' until they pair or type
// credentials in manually, same "not configured yet" semantics
// DEFAULT_SYNC_URL already uses for native/Tauri above — Settings
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

// B39: the display name is user-editable and used to be the *only* thing
// identifying a device — renaming it left every past log entry stamped
// with the old name forever, so "Devices seen recently" and card history
// showed the old and new names as if they were two separate devices.
// This id is generated once, persisted, and never changes even if the
// name does; logChange() stamps it alongside `source` (the display name)
// on every new log doc as a new `source_id` field, and lookups group by
// this id first, falling back to the literal `source` string for log
// entries written before this field existed.
const DEVICE_ID_KEY = 'offlog_device_id';

export function getDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
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

// B47 — Agenda's week view and DeadlinesView's "this week" grouping
// assumed a fixed Sunday week start (`d.getDate() - d.getDay()`, and
// `getDay()` is 0-indexed from Sunday). Per-device, like the reminder
// time above — this is a personal display preference, not data, so it
// doesn't need to sync.
//
// Timezone was the other half of B47's original scope, deliberately
// NOT built: the app already uses the device's local time throughout
// (`new Date()`, no UTC conversion layer anywhere in db.ts) which is
// correct for a single-device-local personal task manager per
// DECISIONS.md — a timezone *setting* only matters if a due date needs
// to mean the same instant across devices in different zones, which
// isn't a real scenario for how this app is used. Revisit only if an
// owner actually hits that case.
const WEEK_STARTS_MONDAY_KEY = 'offlog_week_starts_monday';

export function getWeekStartsMonday(): boolean {
  // Owner preference, 2026-07-16: default to Monday rather than Sunday
  // (still overridable per-device in Settings -> Appearance, B47).
  const stored = localStorage.getItem(WEEK_STARTS_MONDAY_KEY);
  return stored === null ? true : stored === 'true';
}

export function setWeekStartsMonday(monday: boolean) {
  localStorage.setItem(WEEK_STARTS_MONDAY_KEY, String(monday));
}

// Same per-device override pattern as WEEK_STARTS_MONDAY_KEY above.
// Owner preference, 2026-07-18: default to 24h display rather than
// following the browser/OS locale (unlike most locale-driven formatting
// elsewhere in the app) — 12h AM/PM is the override, not the default.
const TIME_FORMAT_24H_KEY = 'offlog_time_format_24h';

export function getTimeFormat24h(): boolean {
  const stored = localStorage.getItem(TIME_FORMAT_24H_KEY);
  return stored === null ? true : stored === 'true';
}

export function setTimeFormat24h(is24h: boolean) {
  localStorage.setItem(TIME_FORMAT_24H_KEY, String(is24h));
}

// B58 (ROADMAP.md): tactile feedback on checkbox/drag/toggle actions.
// Defaults ON (unlike App Lock's biometric, which defaults off because
// it's a security-relevant opt-in) — this is pure polish with no
// downside to a first-time user, matching how haptics ship by default in
// most native apps; the toggle exists for the minority who find it
// distracting, same role as Reduce Motion for animation. Android only —
// haptics.ts checks isNativePlatform() itself, this flag alone doesn't
// gate platform.
const HAPTICS_KEY = 'offlog_haptics_enabled';

export function isHapticsEnabled(): boolean {
  const stored = localStorage.getItem(HAPTICS_KEY);
  return stored === null ? true : stored === 'true';
}

export function setHapticsEnabled(enabled: boolean): void {
  localStorage.setItem(HAPTICS_KEY, String(enabled));
}

// App lock: a PIN gate on the UI, not data encryption — see DECISIONS.md
// for why. Per-device, like every other setting in this file: the PIN
// itself never syncs, so a phone and a PC can have different PINs, or one
// locked and the other not. Stores a salted hash, not the plaintext PIN —
// this isn't a real cryptographic secret either way (it only gates the
// UI), but there's no reason to leave the literal PIN sitting in
// localStorage when a random salt + SHA-256 costs nothing.
const APP_LOCK_HASH_KEY = 'offlog_app_lock_hash';
const APP_LOCK_SALT_KEY = 'offlog_app_lock_salt';
const APP_LOCK_TIMEOUT_KEY = 'offlog_app_lock_timeout_minutes';
// A self-written reminder ("my old street address"), not a secret
// question with a verified answer — there's no server to check an
// answer against, so a real Q&A flow would just be a second PIN typed
// in plaintext for no extra security. Optional, shown on the lock
// screen so someone who forgot their PIN can jog their own memory
// before reaching for full recovery below (owner, 2026-07-19).
const APP_LOCK_HINT_KEY = 'offlog_app_lock_hint';

// Recovery code: a random code shown to the user exactly ONCE, at the
// moment they first set a PIN — they save it themselves (password
// manager, notes, written down). "Forgot PIN" on the lock screen requires
// this code, not a button click. First version just let "Forgot PIN"
// clear the lock outright with a plain confirm dialog — owner feedback,
// 2026-07-19: "it is just removing pin... like when there is wall as
// block of road but in middle there is door u just open and go". That's
// right: a bypass reachable with zero knowledge isn't a lock at all. This
// is the closest thing to a real recovery *route* achievable with no
// accounts/server (see GOAL.md) — it requires possessing a secret that
// was only ever shown once, not just intent. Only the salted hash is
// ever stored, same as the PIN itself; the plaintext code is returned
// once from setAppLockPin() below and never persisted anywhere.
const APP_LOCK_RECOVERY_HASH_KEY = 'offlog_app_lock_recovery_hash';
const APP_LOCK_RECOVERY_SALT_KEY = 'offlog_app_lock_recovery_salt';

// Biometric unlock: sits alongside the PIN, never replaces it (owner,
// 2026-07-20) — the PIN stays the only thing that can set/change/remove
// the lock or drive recovery. This is just a faster unlock path on top,
// opt-in per device via Settings (Android only — no Capacitor biometric
// plugin ships an iOS build here since this project doesn't ship iOS, see
// GOAL.md/DECISIONS.md). No new secret to store — the OS itself holds
// the enrolled biometric, this flag only remembers whether the user opted
// in on this device.
const APP_LOCK_BIOMETRIC_KEY = 'offlog_app_lock_biometric_enabled';

// Excludes visually-ambiguous characters (0/O, 1/I/L) since this gets
// hand-copied onto paper or typed back in under pressure.
function randomRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `${part()}-${part()}`;
}

// crypto.subtle needs a secure context — true for the dev server, the
// deployed HTTPS site, and Capacitor/Tauri's own WebView schemes, but
// falls back to a plain (much weaker, still not plaintext) hash rather
// than making the whole feature throw if some embedding context doesn't
// have it. Given the UI-gate-only threat model this protects, that
// fallback is an acceptable degradation, not a security hole.
async function hashWithSalt(salt: string, pin: string): Promise<string> {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pin));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  const s = salt + pin;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return String(h >>> 0);
}

export function isAppLockEnabled(): boolean {
  return !!localStorage.getItem(APP_LOCK_HASH_KEY);
}

// Returns the plaintext recovery code ONLY the first time a PIN is set
// (transitioning disabled -> enabled) — a "Change PIN" on an
// already-enabled lock reuses the existing recovery code rather than
// silently invalidating whatever the user already saved. Returns null
// when no new code was generated (nothing new for the caller to show).
export async function setAppLockPin(pin: string, hint?: string): Promise<{ recoveryCode: string | null }> {
  const salt = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
  const hash = await hashWithSalt(salt, pin);
  localStorage.setItem(APP_LOCK_SALT_KEY, salt);
  localStorage.setItem(APP_LOCK_HASH_KEY, hash);
  if (hint?.trim()) localStorage.setItem(APP_LOCK_HINT_KEY, hint.trim());
  else localStorage.removeItem(APP_LOCK_HINT_KEY);

  let recoveryCode: string | null = null;
  if (!localStorage.getItem(APP_LOCK_RECOVERY_HASH_KEY)) {
    recoveryCode = randomRecoveryCode();
    const rSalt = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
    const rHash = await hashWithSalt(rSalt, recoveryCode);
    localStorage.setItem(APP_LOCK_RECOVERY_SALT_KEY, rSalt);
    localStorage.setItem(APP_LOCK_RECOVERY_HASH_KEY, rHash);
  }
  return { recoveryCode };
}

export function getAppLockHint(): string | null {
  return localStorage.getItem(APP_LOCK_HINT_KEY);
}

export function hasAppLockRecoveryCode(): boolean {
  return !!localStorage.getItem(APP_LOCK_RECOVERY_HASH_KEY);
}

export function clearAppLockPin(): void {
  localStorage.removeItem(APP_LOCK_HASH_KEY);
  localStorage.removeItem(APP_LOCK_SALT_KEY);
  localStorage.removeItem(APP_LOCK_HINT_KEY);
  localStorage.removeItem(APP_LOCK_RECOVERY_HASH_KEY);
  localStorage.removeItem(APP_LOCK_RECOVERY_SALT_KEY);
  localStorage.removeItem(APP_LOCK_BIOMETRIC_KEY);
  localStorage.removeItem(PRIVACY_SCREEN_KEY);
}

export function isAppLockBiometricEnabled(): boolean {
  return localStorage.getItem(APP_LOCK_BIOMETRIC_KEY) === 'true';
}

export function setAppLockBiometricEnabled(enabled: boolean): void {
  if (enabled) localStorage.setItem(APP_LOCK_BIOMETRIC_KEY, 'true');
  else localStorage.removeItem(APP_LOCK_BIOMETRIC_KEY);
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  const salt = localStorage.getItem(APP_LOCK_SALT_KEY);
  const storedHash = localStorage.getItem(APP_LOCK_HASH_KEY);
  if (!salt || !storedHash) return false;
  return (await hashWithSalt(salt, pin)) === storedHash;
}

export async function verifyAppLockRecoveryCode(code: string): Promise<boolean> {
  const salt = localStorage.getItem(APP_LOCK_RECOVERY_SALT_KEY);
  const storedHash = localStorage.getItem(APP_LOCK_RECOVERY_HASH_KEY);
  if (!salt || !storedHash) return false;
  return (await hashWithSalt(salt, code.trim().toUpperCase())) === storedHash;
}

// Idle/background timeout before the lock screen reappears — launch
// (fresh page load / cold app start) always locks regardless of this,
// see App.svelte's onMount.
export function getAppLockTimeoutMinutes(): number {
  const stored = localStorage.getItem(APP_LOCK_TIMEOUT_KEY);
  return stored ? Number(stored) : 5;
}

export function setAppLockTimeoutMinutes(minutes: number): void {
  localStorage.setItem(APP_LOCK_TIMEOUT_KEY, String(minutes));
}

// B55 (ROADMAP.md): a PIN on the lock screen still leaks a full
// screenshot preview of open tasks in Android's recent-apps switcher —
// the OS snapshots whatever was on screen the instant the app
// backgrounds, before AppLock.svelte gets a chance to cover it. Privacy
// Screen (@capacitor/privacy-screen) closes that gap by dimming the
// content in that snapshot instead.
//
// v5.4.2 correction (owner-reported live testing, 2026-07-21): this
// originally auto-enabled whenever a PIN was set, no separate control —
// but Android's FLAG_SECURE (what PrivacyScreen.enable() actually sets)
// blocks ALL screenshots while the app is foregrounded, not just the
// recents-switcher snapshot; there's no way to have one without the
// other. Silently taking away the ability to screenshot the app the
// moment someone turns on App Lock is too big a side effect to bundle
// in automatically — now a separate, explicit, OFF-by-default toggle
// (Settings → App Lock), independent of whether a PIN is set. Still only
// shown once a PIN exists (no reason to offer it otherwise), same as
// biometric.
const PRIVACY_SCREEN_KEY = 'offlog_privacy_screen_enabled';

export function isPrivacyScreenEnabled(): boolean {
  return localStorage.getItem(PRIVACY_SCREEN_KEY) === 'true';
}

export function setPrivacyScreenEnabled(enabled: boolean): void {
  if (enabled) localStorage.setItem(PRIVACY_SCREEN_KEY, 'true');
  else localStorage.removeItem(PRIVACY_SCREEN_KEY);
}

// Call after any change to the PIN (set, remove) or the toggle itself, as
// well as once at launch, so it never drifts out of sync.
export async function syncPrivacyScreen(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { PrivacyScreen } = await import('@capacitor/privacy-screen');
    if (isAppLockEnabled() && isPrivacyScreenEnabled()) await PrivacyScreen.enable();
    else await PrivacyScreen.disable();
  } catch {
    // Best-effort — privacy screen is a hardening layer on top of the
    // PIN, not the PIN itself, so a plugin failure here shouldn't block
    // using the app.
  }
}

// E2 (ROADMAP.md) — the CouchDB server's own `uuid` (returned by
// pairing.rs's handshake, also broadcast unauthenticated in the mDNS TXT
// record per discovery.rs) is a stable identity for "the PC I paired
// with" that survives an IP/port change, unlike the frozen `sync_url`
// itself. Persisted alongside credentials so discovery.ts can re-resolve
// the current address for this same uuid when the stored URL stops
// working, instead of the phone being stuck on a stale LAN IP forever.
const PAIRED_HOST_UUID_KEY = 'offlog_paired_host_uuid';

export function getPairedHostUuid(): string | null {
  return localStorage.getItem(PAIRED_HOST_UUID_KEY);
}

export function setPairedHostUuid(uuid: string) {
  localStorage.setItem(PAIRED_HOST_UUID_KEY, uuid);
}
