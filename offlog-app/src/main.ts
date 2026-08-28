import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { showError } from './lib/store'
import { isTauri } from './config'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// On desktop, console.error() only ever reaches the WebView's own devtools
// console -- nothing forwards it into Offlog.log, the one place a real
// crash is diagnosable after the fact on an installed build (see
// tauri-plugin-log's own comment in lib.rs). @tauri-apps/plugin-log talks
// to that same Rust-side log target already registered there; this just
// gives the frontend a way to write into it too. Native/web have no such
// log file, so this stays desktop-only, and never blocks showing the toast
// on a failure to reach it.
function logToDesktopFile(message: string) {
  if (!isTauri()) return;
  import('@tauri-apps/plugin-log').then(({ error }) => error(message)).catch(() => {});
}

// Crash recovery net: an uncaught error or rejected promise anywhere in the
// app would otherwise fail silently (stuck spinner, a click that does
// nothing) with no signal to the user. Surface it as the existing error
// toast instead of leaving the UI in an unexplained broken state.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  logToDesktopFile(`Unhandled rejection: ${e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason)}`);
  showError('Something went wrong. Please try again.');
});
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error ?? e.message);
  logToDesktopFile(`Uncaught error: ${e.error instanceof Error ? (e.error.stack ?? e.error.message) : String(e.error ?? e.message)}`);
  showError('Something went wrong. Please try again.');
});

const isNative = window.Capacitor?.isNativePlatform?.();

if (isNative) {
  // Android 15+ (targetSdk 35+) enforces edge-to-edge and ignores
  // StatusBar.setBackgroundColor() — it's a no-op there. Instead we
  // let the WebView draw behind the status bar (overlay: true) and
  // paint our own colored strip in the safe-area inset via CSS
  // (see .status-bar-fill in App.svelte).
  //
  // The icon style is NOT set here: it has to follow the theme, so
  // theme.ts's applyTheme() owns it and re-applies on every change.
  import('@capacitor/status-bar').then(({ StatusBar }) => {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
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
