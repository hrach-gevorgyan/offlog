import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

if ((window as any).Capacitor?.isNativePlatform?.()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#14162a' }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  }).catch(() => {});
}

export default app
