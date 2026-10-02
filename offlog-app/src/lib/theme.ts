// Dark mode (with a follow-the-OS option) and high contrast mode. Kept
// separate from config.ts since these are pure presentation toggles applied
// directly to `document.body`, not app config read by db.ts/store.ts.

export type ThemeMode = 'light' | 'dark' | 'system';

const MODE_KEY = 'theme_mode';
const LEGACY_DARK_KEY = 'dark'; // legacy key: presence alone meant "dark"
const CONTRAST_KEY = 'high_contrast';
const REDUCE_MOTION_KEY = 'reduce_motion';

function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

// One-time migration from the old boolean-only scheme: a user who had
// explicitly turned dark mode on keeps seeing dark (not silently switched
// to system-follow), but anyone who never touched it gets the new default.
export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(MODE_KEY) as ThemeMode | null;
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  const migrated: ThemeMode = localStorage.getItem(LEGACY_DARK_KEY) ? 'dark' : 'system';
  localStorage.setItem(MODE_KEY, migrated);
  localStorage.removeItem(LEGACY_DARK_KEY);
  return migrated;
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(MODE_KEY, mode);
  applyTheme();
}

export function getHighContrast(): boolean {
  return !!localStorage.getItem(CONTRAST_KEY);
}

export function setHighContrast(on: boolean): void {
  if (on) localStorage.setItem(CONTRAST_KEY, '1');
  else localStorage.removeItem(CONTRAST_KEY);
  applyTheme();
}

// Manual override on top of the OS-level `prefers-reduced-motion` media
// query, for someone who finds motion distracting but hasn't (or can't)
// change that system setting. motion.ts's transition exports read this to
// zero out their durations.
export function getReduceMotion(): boolean {
  return !!localStorage.getItem(REDUCE_MOTION_KEY);
}

export function setReduceMotion(on: boolean): void {
  if (on) localStorage.setItem(REDUCE_MOTION_KEY, '1');
  else localStorage.removeItem(REDUCE_MOTION_KEY);
  applyTheme();
}

export function prefersReducedMotion(): boolean {
  return getReduceMotion() || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function isEffectivelyDark(mode: ThemeMode = getThemeMode()): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark());
}

export function applyTheme(): void {
  const dark = isEffectivelyDark();
  document.body.classList.toggle('dark', dark);
  document.body.classList.toggle('high-contrast', getHighContrast());
  // Zeroes every --dur-* token (app.css), so CSS transitions honour the
  // in-app switch too, not only motion.ts's Svelte transitions.
  document.body.classList.toggle('reduce-motion', getReduceMotion());
  syncTauriWindowTheme(dark);
  syncAndroidStatusBar(dark || onHero);
  syncBrowserThemeColor(dark);
}

// A coloured band running up under the status bar (the phone Home's hero, a
// project's band) gives the strip its colour (body.statusbar-hero /
// .statusbar-band in app.css) and, on a dark band, light OS icons. Screens
// claim the strip; the most recent live claim wins and releasing it hands the
// strip back to the one below, so a screen that leaves after the next one has
// claimed (an outro still running) can't undo it. Switched in one step with
// the icon style for the same lockstep reason as the theme itself.
export interface StripTint { fill?: string; lightIcons: boolean }
interface Claim { tint: StripTint | null }
const claims: Claim[] = [];
const hero: Claim = { tint: null };
let applied = 'off', onHero = false, suppressed = false;
export function setStatusBarOnHero(on: boolean): void {
  if (!claims.includes(hero)) { if (!on) return; claims.push(hero); }
  hero.tint = on ? { lightIcons: true } : null;
  syncHero();
}
export function claimStatusBar(tint: StripTint | null): { set(t: StripTint | null): void; release(): void } {
  const c: Claim = { tint };
  claims.push(c);
  syncHero();
  return {
    set(t) { c.tint = t; syncHero(); },
    release() { const i = claims.indexOf(c); if (i >= 0) claims.splice(i, 1); syncHero(); },
  };
}
// While something opaque covers the app (the lock screen), the hero tint
// would leave light icons on a light strip.
export function setStatusBarSuppressed(on: boolean): void { suppressed = on; syncHero(); }
// Older Android WebViews (before Chrome 140) report no top inset, so the
// strip is 0px tall and the status area keeps the system's light colour;
// switching to light icons there would make the clock vanish. Only tint when
// the strip actually has height.
function stripVisible(): boolean {
  const el = document.querySelector<HTMLElement>('.status-bar-fill');
  return !el || el.offsetHeight > 0;
}
// The native icon switch lands ~100ms after the call, so the strip's colour
// waits for it: switching the CSS first leaves white icons on a light strip
// (or dark on hero) for a few frames on every Home <-> screen transition.
function syncHero(): void {
  const top = claims.at(-1)?.tint ?? null;
  const on = !!top && !suppressed && stripVisible();
  const key = on ? `${top!.fill ?? 'hero'}|${top!.lightIcons}` : 'off';
  if (key === applied) return;
  applied = key;
  onHero = on && top!.lightIcons;
  const fill = on ? top!.fill : undefined;
  const apply = () => {
    if (applied !== key) return;
    const b = document.body;
    b.classList.toggle('statusbar-hero', on);
    b.classList.toggle('statusbar-band', !!fill);
    if (fill) b.style.setProperty('--statusbar-band', fill); else b.style.removeProperty('--statusbar-band');
  };
  const native = syncAndroidStatusBar(isEffectivelyDark() || onHero);
  if (native) native.then(apply); else apply();
}

// The strip behind Android's transparent status bar is CSS
// (--statusbar-fill), but the clock and icons drawn on top of it are the
// OS's, and only this API controls them. Style.Dark means "light content
// for a dark background" and Style.Light the reverse -- so the mapping is
// inverted from what the names suggest. Getting it wrong makes the icons
// the same colour as the strip and they disappear entirely.
// Resolves once the native style has been applied (never rejects); null off
// Android.
function syncAndroidStatusBar(dark: boolean): Promise<void> | null {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  return import('@capacitor/status-bar').then(({ StatusBar, Style }) =>
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {}),
  ).catch(() => {});
}

// Browser/PWA chrome equivalent of the strip above: mobile browsers paint
// their toolbar with this colour, so a fixed dark value looks wrong in
// light mode. Kept in step with --statusbar-fill's two values.
function syncBrowserThemeColor(dark: boolean): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#181a20' : '#f6f7f9');
}

// The desktop window's native title bar otherwise follows the OS theme and
// ignores this app's Light/Dark/System choice, which reads as visually broken
// when the two disagree. Tauri's window API can force the native chrome's
// theme independent of the OS setting. `!!window.__TAURI_INTERNALS__`
// mirrors config.ts's isTauri() without importing it — theme.ts intentionally
// has no app-config dependency. No-op on web and Android, which have no
// native window frame to sync.
function syncTauriWindowTheme(dark: boolean): void {
  if (!window.__TAURI_INTERNALS__) return;
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    getCurrentWindow().setTheme(dark ? 'dark' : 'light').catch(() => {});
  }).catch(() => {});
}

// Only fires while mode is 'system' — an explicit Light/Dark choice must
// not silently flip when the OS theme changes underneath it.
export function watchSystemTheme(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (getThemeMode() === 'system') applyTheme(); };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
