// B21 (dark mode follows OS) + B11 (high contrast mode). Kept separate from
// config.ts since these are pure presentation toggles applied directly to
// `document.body`, not app config read by db.ts/store.ts.

export type ThemeMode = 'light' | 'dark' | 'system';

const MODE_KEY = 'theme_mode';
const LEGACY_DARK_KEY = 'dark'; // pre-B21: presence alone meant "dark"
const CONTRAST_KEY = 'high_contrast';

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

export function isEffectivelyDark(mode: ThemeMode = getThemeMode()): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark());
}

export function applyTheme(): void {
  document.body.classList.toggle('dark', isEffectivelyDark());
  document.body.classList.toggle('high-contrast', getHighContrast());
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
