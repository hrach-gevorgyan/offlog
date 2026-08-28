import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Defense-in-depth against the {@html} sinks elsewhere in the app (all
// currently escape untrusted text, but a CSP means a future bug in one of
// those doesn't also hand an injected script a path to an external
// origin). Mirrors offlog-desktop's tauri.conf.json CSP -- connect-src
// stays open to any LAN host since the sync server address is
// user-configured, and img-src needs blob: for attachment thumbnails
// (URL.createObjectURL()). build-only: Vite's dev server relies on
// techniques (inline module eval, its own HMR websocket) a CSP this
// strict would break, and the dev server is never what ships.
// frame-ancestors is deliberately absent here: the CSP spec only honors it
// via a real HTTP header, never a <meta> tag -- Tauri desktop already
// enforces the equivalent through tauri.conf.json's own header-based CSP,
// so the meta version was a pure no-op that only produced a console
// warning on every launch.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self' http://*:* https://*:*; object-src 'none'; base-uri 'self'; form-action 'self'"

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    },
  }
}

export default defineConfig({
  plugins: [svelte(), cspPlugin()],
  base: './',
})
