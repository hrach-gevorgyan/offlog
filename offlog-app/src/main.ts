import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

const isNative = (window as any).Capacitor?.isNativePlatform?.();

if (isNative) {
  // Android 15+ (targetSdk 35+) enforces edge-to-edge and ignores
  // StatusBar.setBackgroundColor() — it's a no-op there. Instead we
  // let the WebView draw behind the status bar (overlay: true) and
  // paint our own colored strip in the safe-area inset via CSS
  // (see .status-bar-fill in App.svelte), then just set icon color.
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  }).catch(() => {});
} else {
  // Register the PWA service worker on web only. Skipped on Android
  // since Capacitor already bundles assets natively — a service
  // worker there would only risk serving stale cached JS across
  // APK updates.
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({ immediate: true });
    // The browser's default SW update check only fires on a fresh
    // navigation, so an installed/standalone PWA that's just brought
    // back to the foreground (not fully closed+reopened) can sit on a
    // stale cached build indefinitely. Re-check whenever the tab/app
    // regains focus so new builds are picked up without the user
    // needing to manually close and reopen it.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') updateSW();
    });
  }).catch(() => {});
}

export default app
