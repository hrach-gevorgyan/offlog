import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { showError } from './lib/store'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// Crash recovery net: an uncaught error or rejected promise anywhere in the
// app would otherwise fail silently (stuck spinner, a click that does
// nothing) with no signal to the user. Surface it as the existing error
// toast instead of leaving the UI in an unexplained broken state.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  showError('Something went wrong. Please try again.');
});
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error ?? e.message);
  showError('Something went wrong. Please try again.');
});

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
    // registerSW()'s returned function is a no-op in 'autoUpdate' mode —
    // it only sends a skip-waiting message in 'prompt' mode (see
    // vite-plugin-pwa's client/build/register.js: `if (!auto)
    // sendSkipWaitingMessage()`). Calling it here never actually asked
    // the browser to check for a new service worker, so an installed/
    // standalone PWA brought back to the foreground could sit on a stale
    // build indefinitely (A18) — visibilitychange fired, but nothing it
    // called did anything. The actual fix is forcing a real update check
    // via the registration itself; the existing autoUpdate reload-on-
    // activate listener (already wired up inside registerSW) then fires
    // normally once a new worker is found and installed.
    registerSW({ immediate: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker?.getRegistration().then(reg => reg?.update()).catch(() => {});
      }
    });
  }).catch(() => {});
}

export default app
