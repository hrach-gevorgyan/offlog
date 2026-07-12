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
}

// If a service worker from a previous PWA-enabled build is still
// registered in someone's browser, unregister it so the web build goes
// back to a plain, always-fresh page load — otherwise a stale cached
// build could keep being served indefinitely with no way to force-update.
if (!isNative && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
}

export default app
