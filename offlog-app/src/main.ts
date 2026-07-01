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
    registerSW({ immediate: true });
  }).catch(() => {});
}

export default app
