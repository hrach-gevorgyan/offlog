// Credentials come from .env.local (git-ignored via *.local).
// The sync URL is also stored in localStorage so it can be changed in-app.

import { writable } from 'svelte/store';

// Vite loads `.env.local` for EVERY build mode, not just `npm run dev`, so
// without this `import.meta.env.DEV` gate a developer's own sync URL and
// credentials would be compiled into production bundles (and from there into
// the shipped APK/installer). `import.meta.env.DEV` is statically known at
// build time, so gating on it lets the minifier dead-code-eliminate the
// literal secret values out of any non-dev build entirely.
const envUrl = import.meta.env.DEV ? (import.meta.env.VITE_SYNC_URL as string | undefined) : undefined;
const envUser = import.meta.env.DEV ? (import.meta.env.VITE_SYNC_USER as string | undefined) : undefined;
const envPass = import.meta.env.DEV ? (import.meta.env.VITE_SYNC_PASS as string | undefined) : undefined;

// Android is the only Capacitor-native platform this project ships, so
// "native platform" and "Android" are the same thing here in practice.
export function isNativePlatform(): boolean {
  return !!window.Capacitor?.isNativePlatform?.();
}

// The presence of Tauri's IPC global is the platform check; invokeTauri()
// below is the single call site that reaches through it.
export function isTauri(): boolean {
  return !!window.__TAURI_INTERNALS__;
}

export function invokeTauri<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Every caller is expected to gate on isTauri(); rejecting off-Tauri
  // keeps a missed gate a handled promise rejection rather than a
  // TypeError thrown synchronously out of the call site.
  const ipc = window.__TAURI_INTERNALS__;
  if (!ipc) return Promise.reject(new Error('Not running under Tauri'));
  return ipc.invoke(cmd, args);
}

// Never hardcode a LAN IP as the fallback: it goes stale the moment the sync
// host's address changes, and a reinstall wipes localStorage, silently
// reverting to that wrong address with no sign anything is misconfigured.
//
// Three distinct cases:
//   - Android/native: no way to guess a working address — falls back to ''
//     ("not configured"). startSync()/syncNow() treat that as a no-op, and
//     Settings' Sync tab shows "Not connected to another device yet".
//   - Plain desktop web: the PC is the host, so a manually-installed sync
//     server runs on the same machine as the browser tab on the standard
//     CouchDB-protocol port — loopback:5984 is structurally correct.
//   - Tauri desktop: easy to conflate with desktop web since both are "not
//     Capacitor", but its embedded NyxDB sidecar binds a random port chosen
//     fresh per install, never 5984. Falling through to the desktop-web
//     branch would point it at whatever else is listening on 5984 and report
//     "synced" against the wrong database. No synchronous default is possible
//     (the real port is only knowable via the async get_sync_info Tauri
//     command), so it falls back to '' like Android and is resolved by
//     initTauriSyncDefaults() below before the first sync attempt.
const DEFAULT_SYNC_URL = envUrl ?? (typeof window !== 'undefined' && !isNativePlatform() && !isTauri() ? 'http://127.0.0.1:5984/offlog' : '');

// Called once at app boot (store.ts's initApp(), before startSync()) — if
// this is the Tauri desktop app and no URL has been explicitly configured,
// points it at its own embedded sidecar instead of guessing. Must never
// override an explicit choice someone already made (e.g. pairing with, or
// manually configuring, a different machine).
export async function initTauriSyncDefaults(): Promise<void> {
  if (!isTauri()) return;
  const saved = localStorage.getItem('offlog_sync_url');
  if (saved && saved !== 'http://127.0.0.1:5984/offlog') return;
  try {
    const info = await invokeTauri<{ port: number; user: string; password: string }>('get_sync_info');
    setSyncUrl(`http://127.0.0.1:${info.port}/offlog`);
    await setSyncCredentials(info.user, info.password);
  } catch {
    // sidecar not ready yet or invoke failed — leave whatever was
    // there (possibly the stale 5984 default); next launch retries.
  }
}

// The desktop app's embedded sidecar spawns its own host without checking
// whether another Offlog host already exists on the LAN, so two PCs on one
// network become two independent islands. This does not change that (a
// "join as client instead" mode is deliberately not built); it only surfaces
// what the Rust side's one-time startup scan found so Settings can warn.
// Polled a few times after launch rather than once immediately: the scan
// only runs after the embedded NyxDB has finished booting, and calling too
// early returns an empty list, which is not the same as "no other host".
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

// The PC app's pairing handshake generates a random password per install, so
// a fixed user/password baked into the JS bundle could never match every PC a
// device might sync to. Credentials are per-device, stored like the URL.
//
// No credential may ever be hardcoded here as a fallback.
// VITE_SYNC_USER/VITE_SYNC_PASS come from `.env.local` only (git-ignored) for
// local dev; everyone else gets '' until they pair or type credentials in,
// the same "not configured yet" semantics DEFAULT_SYNC_URL uses above.
// Settings shows "Not connected" for an empty URL, and an empty password
// fails auth cleanly (401).
const DEFAULT_SYNC_USER = envUser ?? '';
const DEFAULT_SYNC_PASS = envPass ?? '';

// The sync password is a real secret (a paired device's actual credential),
// unlike the URL/port above -- stored encrypted at rest where a real
// platform primitive exists for it:
//   - Tauri (Windows): DPAPI-encrypted, via offlog-desktop's
//     store_sync_secret/get_sync_secret commands (secure_storage.rs) --
//     tied to the current Windows user account, transparent, no prompt.
//   - Android: Keystore-backed, via the already-installed
//     capacitor-native-biometric plugin's setCredentials/getCredentials
//     (AES/GCM, unlockedDeviceRequired -- no biometric prompt needed at
//     sync time, just requires the device to have been unlocked since
//     boot).
//   - Plain web: no OS-level secure-storage primitive exists in a browser,
//     and this build is a dev/test surface rather than the primary way to
//     use the app -- kept as plain localStorage. An accepted limitation;
//     don't invent fake protection for it (an app-level "encryption" key
//     sitting in localStorage next to the ciphertext protects against
//     nothing).
const LEGACY_SYNC_USER_KEY = 'offlog_sync_user';
const LEGACY_SYNC_PASS_KEY = 'offlog_sync_pass';
const BIOMETRIC_SYNC_SERVER = 'offlog-sync';

async function migrateLegacyCredentialsIfNeeded(): Promise<void> {
  // Migrates credentials out of the old plaintext localStorage keys. Only
  // Tauri/Android have a *different* place to move them to -- on plain web
  // setSyncCredentials() writes right back to these same keys, so deleting
  // them unconditionally after "migrating" would erase the value there.
  if (!isTauri() && !isNativePlatform()) return;
  const user = localStorage.getItem(LEGACY_SYNC_USER_KEY);
  const pass = localStorage.getItem(LEGACY_SYNC_PASS_KEY);
  if (user === null && pass === null) return;
  await setSyncCredentials(user ?? '', pass ?? '');
  localStorage.removeItem(LEGACY_SYNC_USER_KEY);
  localStorage.removeItem(LEGACY_SYNC_PASS_KEY);
}

export async function getSyncCredentials(): Promise<{ user: string; pass: string }> {
  await migrateLegacyCredentialsIfNeeded();

  if (isTauri()) {
    try {
      const secret = await invokeTauri<{ user: string; pass: string } | null>('get_sync_secret');
      if (secret) return secret;
    } catch {
      // command unavailable (older build) or nothing stored yet -- fall
      // through to the "not configured" default below.
    }
    return { user: DEFAULT_SYNC_USER, pass: DEFAULT_SYNC_PASS };
  }

  if (isNativePlatform()) {
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const creds = await NativeBiometric.getCredentials({ server: BIOMETRIC_SYNC_SERVER });
      return { user: creds.username, pass: creds.password };
    } catch {
      // nothing stored yet (first run / never paired) -- same
      // "not configured" default the old localStorage miss used.
      return { user: DEFAULT_SYNC_USER, pass: DEFAULT_SYNC_PASS };
    }
  }

  return {
    user: localStorage.getItem(LEGACY_SYNC_USER_KEY) ?? DEFAULT_SYNC_USER,
    pass: localStorage.getItem(LEGACY_SYNC_PASS_KEY) ?? DEFAULT_SYNC_PASS,
  };
}

export async function setSyncCredentials(user: string, pass: string): Promise<void> {
  if (isTauri()) {
    await invokeTauri('store_sync_secret', { user, pass });
    return;
  }
  if (isNativePlatform()) {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    await NativeBiometric.setCredentials({ username: user, password: pass, server: BIOMETRIC_SYNC_SERVER });
    return;
  }
  localStorage.setItem(LEGACY_SYNC_USER_KEY, user);
  localStorage.setItem(LEGACY_SYNC_PASS_KEY, pass);
}

// `source` on every doc is a free-form per-device name, generated once on
// first run and editable in Settings. Kept in its own localStorage key
// rather than alongside the sync config, since it identifies the device
// rather than configuring where it syncs to.
const DEVICE_NAME_KEY = 'offlog_device_name';

function defaultDeviceName(): string {
  const isAndroid = window.Capacitor?.getPlatform?.() === 'android';
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

// The display name is user-editable, so it can't identify a device on its
// own — renaming it would make old and new log entries look like two
// separate devices. This id is generated once, persisted, and never changes
// even if the name does; logChange() stamps it on every log doc as
// `source_id`, and lookups group by this id first, falling back to the
// literal `source` string for log entries written before it existed.
const DEVICE_ID_KEY = 'offlog_device_id';

export function getDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

// A first-run prompt asks for this device's name once, ever. Set whether the
// user names it or skips — skipping is as valid a choice as naming it.
// Separate key from DEVICE_NAME_KEY, since getDeviceName() auto-generates a
// default on first call and so can't signal "has this device been asked yet."
const NAME_PROMPTED_KEY = 'offlog_name_prompted';

export function hasShownNamePrompt(): boolean {
  return localStorage.getItem(NAME_PROMPTED_KEY) === '1';
}

export function markNamePromptShown() {
  localStorage.setItem(NAME_PROMPTED_KEY, '1');
}

// Explicit sync on/off, independent of the configured URL — clearing the URL
// to "pause" sync would also drop the server config, which isn't what "stop
// syncing for a while" should mean.
const SYNC_ENABLED_KEY = 'offlog_sync_enabled';

export function isSyncEnabled(): boolean {
  const stored = localStorage.getItem(SYNC_ENABLED_KEY);
  if (stored !== null) return stored !== 'false';
  // Default to enabled only where there is actually something to sync with
  // (a real saved URL, or desktop/web's structural loopback default). An
  // unconditional `true` would make a never-paired native device — whose
  // getSyncUrl() is '' — show a misleading "Sync enabled" toggle and a
  // "Save & restart sync" button for something never configured.
  return !!getSyncUrl();
}

export function setSyncEnabled(enabled: boolean) {
  localStorage.setItem(SYNC_ENABLED_KEY, String(enabled));
}

// "Remind me on the due date" derives reminder_at from due_date at this
// time-of-day, so the exact date+time doesn't need picking twice in the
// common case. Per-device (not synced) — a phone and a PC may reasonably
// want a different default nudge time.
const DEFAULT_REMINDER_TIME_KEY = 'offlog_default_reminder_time';

export function getDefaultReminderTime(): string {
  return localStorage.getItem(DEFAULT_REMINDER_TIME_KEY) ?? '09:00';
}

export function setDefaultReminderTime(time: string) {
  localStorage.setItem(DEFAULT_REMINDER_TIME_KEY, time);
}

// Master in-app toggle for task reminders, independent of the OS-level
// notification permission -- which can only ever be *granted* from inside the
// app, since no platform lets you programmatically revoke it (hence Settings'
// "Enable" button having no "Disable" counterpart). This flag is the actual
// on/off switch: rescheduleAll() (notifications.ts) treats it as "no tasks to
// schedule" when off, cancelling anything already pending.
const NOTIFICATIONS_ENABLED_KEY = 'offlog_notifications_enabled';

export function getNotificationsEnabled(): boolean {
  const raw = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

export function setNotificationsEnabled(enabled: boolean) {
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

// Quiet hours: reminders due inside this local wall-clock window queue
// until the window ends instead of firing (notifications.ts's
// applyQuietHours). `start`/`end` are 'HH:MM' 24h strings (same storage
// format TimePicker/CalendarPicker already use) — start > end means the
// window wraps past midnight (e.g. 22:00 -> 07:00), the common case.
export interface QuietHours { enabled: boolean; start: string; end: string; }
const QUIET_HOURS_KEY = 'offlog_quiet_hours';
const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: '22:00', end: '07:00' };

export function getQuietHours(): QuietHours {
  try {
    const raw = localStorage.getItem(QUIET_HOURS_KEY);
    return raw ? { ...DEFAULT_QUIET_HOURS, ...JSON.parse(raw) } : DEFAULT_QUIET_HOURS;
  } catch {
    return DEFAULT_QUIET_HOURS;
  }
}

export function setQuietHours(q: QuietHours) {
  localStorage.setItem(QUIET_HOURS_KEY, JSON.stringify(q));
}

// Desktop-only: whether updateChecker.ts's unattended background check
// runs at all. On by default, but someone deliberately staying on a
// stable version they like should be able to turn it off entirely — the
// manual "Check for updates" button in Settings always works regardless
// of this setting.
const AUTO_UPDATE_CHECK_KEY = 'offlog_auto_update_check';

export function getAutoUpdateCheckEnabled(): boolean {
  const stored = localStorage.getItem(AUTO_UPDATE_CHECK_KEY);
  return stored === null ? true : stored === 'true';
}

export function setAutoUpdateCheckEnabled(enabled: boolean) {
  localStorage.setItem(AUTO_UPDATE_CHECK_KEY, String(enabled));
}

// Week-start preference, consumed by Agenda's Month view (day-of-week column
// order) and AgendaView's "this week" grouping — neither may assume a
// Sunday start (note `getDay()` is 0-indexed from Sunday). Per-device, like
// the reminder time above: a display preference, not data, so it doesn't sync.
//
// There is deliberately no timezone setting. The app uses the device's local
// time throughout (`new Date()`, no UTC conversion layer anywhere), which is
// correct for a local single-user task manager; a timezone setting would only
// matter if a due date had to mean the same instant across devices in
// different zones.
const WEEK_STARTS_MONDAY_KEY = 'offlog_week_starts_monday';

export function getWeekStartsMonday(): boolean {
  // Defaults to Monday, overridable per-device in Settings -> Appearance.
  const stored = localStorage.getItem(WEEK_STARTS_MONDAY_KEY);
  return stored === null ? true : stored === 'true';
}

export function setWeekStartsMonday(monday: boolean) {
  localStorage.setItem(WEEK_STARTS_MONDAY_KEY, String(monday));
}

// Same per-device override pattern as WEEK_STARTS_MONDAY_KEY above.
// Defaults to 24h display rather than following the browser/OS locale
// (unlike most locale-driven formatting elsewhere in the app) — 12h AM/PM is the override, not the default.
const TIME_FORMAT_24H_KEY = 'offlog_time_format_24h';

export function getTimeFormat24h(): boolean {
  const stored = localStorage.getItem(TIME_FORMAT_24H_KEY);
  return stored === null ? true : stored === 'true';
}

export function setTimeFormat24h(is24h: boolean) {
  localStorage.setItem(TIME_FORMAT_24H_KEY, String(is24h));
}

// Tactile feedback on checkbox/drag/toggle actions. Defaults ON (unlike App
// Lock's biometric, which defaults off as a security-relevant opt-in) — this
// is pure polish with no downside to a first-time user; the toggle exists for
// the minority who find it distracting, the same role Reduce Motion plays for
// animation. Android only —
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

// App lock: a PIN gate on the UI, not data encryption. Per-device, like
// every other setting in this file — the PIN never syncs, so a phone and a
// PC can have different PINs, or one locked and the other not. Stores a
// salted hash, not the plaintext PIN: not a real cryptographic secret
// either way, but a random salt + SHA-256 costs nothing.
const APP_LOCK_HASH_KEY = 'offlog_app_lock_hash';
const APP_LOCK_SALT_KEY = 'offlog_app_lock_salt';
const APP_LOCK_TIMEOUT_KEY = 'offlog_app_lock_timeout_minutes';
// A self-written reminder ("my old street address"), not a secret question
// with a verified answer — there's no server to check an answer against, so
// a real Q&A flow would just be a second PIN typed in plaintext for no extra
// security. Optional, shown on the lock screen so someone who forgot their
// PIN can jog their own memory before reaching for full recovery below.
const APP_LOCK_HINT_KEY = 'offlog_app_lock_hint';

// Recovery code: a random code shown to the user exactly ONCE, at the moment
// they first set a PIN — they save it themselves. "Forgot PIN" on the lock
// screen must require this code, never just a confirm dialog: a bypass
// reachable with zero knowledge isn't a lock at all. Requiring a secret that
// was only ever shown once is the closest thing to a real recovery route
// achievable with no accounts or server. Only the salted hash is stored, same
// as the PIN itself; the plaintext code is returned once from setAppLockPin()
// below and never persisted anywhere.
const APP_LOCK_RECOVERY_HASH_KEY = 'offlog_app_lock_recovery_hash';
const APP_LOCK_RECOVERY_SALT_KEY = 'offlog_app_lock_recovery_salt';

// Biometric unlock sits alongside the PIN and never replaces it — the PIN
// stays the only thing that can set/change/remove the lock or drive recovery.
// This is only a faster unlock path, opt-in per device via Settings (Android
// only). No new secret is stored: the OS holds the enrolled biometric, and
// this flag just remembers whether the user opted in on this device.
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

// A PIN on the lock screen still leaks a full screenshot preview of open
// tasks in Android's recent-apps switcher: the OS snapshots whatever was on
// screen the instant the app backgrounds, before AppLock.svelte can cover it.
// @capacitor/privacy-screen closes that gap by dimming that snapshot.
//
// Kept a separate, explicit, OFF-by-default toggle rather than auto-enabling
// with the PIN: Android's FLAG_SECURE (what PrivacyScreen.enable() sets)
// blocks ALL screenshots while the app is foregrounded, not just the
// recents-switcher snapshot, and there is no way to have one without the
// other. Only offered once a PIN exists.
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

// The sync server's own `uuid` (returned by the pairing handshake, also
// broadcast unauthenticated in the mDNS TXT record) is a stable identity for
// "the PC I paired with" that survives an IP/port change, unlike the stored
// `sync_url`. Persisted alongside credentials so discovery.ts can re-resolve
// the current address for the same uuid when the stored URL stops working,
// instead of the device being stuck on a stale LAN address.
const PAIRED_HOST_UUID_KEY = 'offlog_paired_host_uuid';

export function getPairedHostUuid(): string | null {
  return localStorage.getItem(PAIRED_HOST_UUID_KEY);
}

export function setPairedHostUuid(uuid: string) {
  localStorage.setItem(PAIRED_HOST_UUID_KEY, uuid);
}
