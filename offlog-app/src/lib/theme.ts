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
  syncTauriWindowTheme(dark);
  syncAndroidStatusBar(dark);
  syncBrowserThemeColor(dark);
}

// The strip behind Android's transparent status bar is CSS
// (--statusbar-fill), but the clock and icons drawn on top of it are the
// OS's, and only this API controls them. Style.Dark means "light content
// for a dark background" and Style.Light the reverse -- so the mapping is
// inverted from what the names suggest. Getting it wrong makes the icons
// the same colour as the strip and they disappear entirely.
function syncAndroidStatusBar(dark: boolean): void {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  }).catch(() => {});
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
