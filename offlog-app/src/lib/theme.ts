// B21 (dark mode follows OS) + B11 (high contrast mode). Kept separate from
// config.ts since these are pure presentation toggles applied directly to
// `document.body`, not app config read by db.ts/store.ts.

export type ThemeMode = 'light' | 'dark' | 'system';

const MODE_KEY = 'theme_mode';
const LEGACY_DARK_KEY = 'dark'; // pre-B21: presence alone meant "dark"
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
}

// Owner-reported, 2026-07-24: the desktop window's native title bar kept
// whatever theme Windows itself was set to, ignoring this app's own
// Light/Dark/System choice — a light in-app theme with a Windows-dark
// title bar (or the reverse) reads as visually broken. Tauri's window API
// can force the native chrome's theme independent of the OS setting;
// `!!(window as any).__TAURI_INTERNALS__` mirrors config.ts's isTauri()
// without importing it here (theme.ts intentionally has no app-config
// dependency — see this file's header comment). No-op everywhere else
// (web, Android) since only a real native window frame has this to sync.
function syncTauriWindowTheme(dark: boolean): void {
  if (!(window as any).__TAURI_INTERNALS__) return;
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
