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

  it('does not touch the native status bar off Android', async () => {
    const { applyTheme } = await import('../src/lib/theme');
    nativeOff();

    setMode('dark');
    applyTheme();
    await new Promise(r => setTimeout(r, 10));
    expect(setStyle).not.toHaveBeenCalled();
  });

  it('keeps the browser theme-color in step with the strip', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#000000');
    document.head.appendChild(meta);

    const { applyTheme } = await import('../src/lib/theme');

    setMode('dark');
    applyTheme();
    expect(meta.getAttribute('content')).toBe('#101218');

    setMode('light');
    applyTheme();
    expect(meta.getAttribute('content')).toBe('#fbfbfc');

    meta.remove();
  });
});
