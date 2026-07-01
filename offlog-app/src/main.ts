import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

if ((window as any).Capacitor?.isNativePlatform?.()) {
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

export default app
