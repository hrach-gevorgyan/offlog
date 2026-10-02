import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// The Android status bar's icons are drawn by the OS, not by the WebView,
// so only this plugin controls them. The strip's colour is CSS
// (--statusbar-fill) and the icon style is native -- they have to agree or
// the icons become invisible against their own background. Nothing else
// covers that pairing, and it can't be seen in jsdom, so assert the call.
const setStyle = vi.fn(() => Promise.resolve());
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle, setOverlaysWebView: vi.fn(() => Promise.resolve()) },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTheme: vi.fn(() => Promise.resolve()) }) }));

const nativeOn = () => {
  (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
};
const nativeOff = () => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
};

// applyTheme() reads the mode from localStorage via getThemeMode().
const setMode = (m: string) => localStorage.setItem('theme_mode', m);

describe('theme — native status bar', () => {
  beforeEach(() => {
    setStyle.mockClear();
    localStorage.clear();
    document.body.className = '';
  });
  afterEach(nativeOff);

  it('asks for light icons in dark mode and dark icons in light mode', async () => {
    const { applyTheme } = await import('../src/lib/theme');
    nativeOn();

    setMode('dark');
    applyTheme();
    await vi.waitFor(() => expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' }));

    setStyle.mockClear();
    setMode('light');
    applyTheme();
    await vi.waitFor(() => expect(setStyle).toHaveBeenCalledWith({ style: 'LIGHT' }));
  });

  it('over the phone hero: hero-coloured strip with light icons, back to the theme after', async () => {
    const { setStatusBarOnHero } = await import('../src/lib/theme');
    nativeOn();
    setMode('light');
    setStatusBarOnHero(true);
    // The strip follows only once the native icons have switched.
    expect(document.body.classList.contains('statusbar-hero')).toBe(false);
    await vi.waitFor(() => expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' }));
    await vi.waitFor(() => expect(document.body.classList.contains('statusbar-hero')).toBe(true));
    setStyle.mockClear();
    setStatusBarOnHero(false);
    await vi.waitFor(() => expect(setStyle).toHaveBeenCalledWith({ style: 'LIGHT' }));
    await vi.waitFor(() => expect(document.body.classList.contains('statusbar-hero')).toBe(false));
  });

  it('no hero tint where the strip has no height (older WebViews), so the clock stays dark on light', async () => {
    const { setStatusBarOnHero } = await import('../src/lib/theme');
    nativeOn();
    setMode('light');
    setStatusBarOnHero(false);
    const strip = document.createElement('div');
    strip.className = 'status-bar-fill'; // jsdom: offsetHeight 0, like an inset-less WebView
    document.body.appendChild(strip);
    setStyle.mockClear();
    setStatusBarOnHero(true);
    expect(document.body.classList.contains('statusbar-hero')).toBe(false);
    await new Promise(r => setTimeout(r, 10));
    expect(setStyle).not.toHaveBeenCalledWith({ style: 'DARK' });
    strip.remove();
  });

  it('a band claim tints the strip on top of the hero, and releasing it hands the strip back', async () => {
    const { setStatusBarOnHero, claimStatusBar } = await import('../src/lib/theme');
    nativeOff();
    setStatusBarOnHero(true);
    expect(document.body.classList.contains('statusbar-hero')).toBe(true);
    const c = claimStatusBar({ fill: 'blue', lightIcons: true });
    expect(document.body.classList.contains('statusbar-band')).toBe(true);
    expect(document.body.style.getPropertyValue('--statusbar-band')).toBe('blue');
    // Home leaving after the project claimed must not undo the project's tint.
    setStatusBarOnHero(false);
    expect(document.body.classList.contains('statusbar-band')).toBe(true);
    setStatusBarOnHero(true);
    c.release();
    expect(document.body.classList.contains('statusbar-band')).toBe(false);
    expect(document.body.classList.contains('statusbar-hero')).toBe(true);
    setStatusBarOnHero(false);
    expect(document.body.classList.contains('statusbar-hero')).toBe(false);
  });

  it('does not touch the native status bar off Android', async () => {
    const { applyTheme } = await import('../src/lib/theme');
    nativeOff();

    setMode('dark');
    applyTheme();
    await new Promise(r => setTimeout(r, 10));
    expect(setStyle).not.toHaveBeenCalled();
  });

  it('the in-app Reduce motion switch puts body.reduce-motion on, which zeroes the CSS durations', async () => {
    const { setReduceMotion } = await import('../src/lib/theme');
    setReduceMotion(true);
    expect(document.body.classList.contains('reduce-motion')).toBe(true);
    setReduceMotion(false);
    expect(document.body.classList.contains('reduce-motion')).toBe(false);
  });

  it('keeps the browser theme-color in step with the strip', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#000000');
    document.head.appendChild(meta);

    const { applyTheme } = await import('../src/lib/theme');

    setMode('dark');
    applyTheme();
    expect(meta.getAttribute('content')).toBe('#181a20');

    setMode('light');
    applyTheme();
    expect(meta.getAttribute('content')).toBe('#f6f7f9');

    meta.remove();
  });
});
