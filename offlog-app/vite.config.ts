import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered manually in main.ts, gated to web only — the Android
      // Capacitor build already bundles assets natively, so a service
      // worker there is redundant and risks caching stale JS across
      // APK updates instead of picking up the newly installed version.
      injectRegister: false,
      includeAssets: ['pouchdb.js', 'icons.svg'],
      manifest: {
        name: 'Offlog',
        short_name: 'Offlog',
        description: 'Local-first task management — spaces, projects, kanban, and agenda that work fully offline.',
        theme_color: '#181a20',
        background_color: '#181a20',
        display: 'standalone',
        start_url: './',
        scope: './',
        orientation: 'portrait-primary',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built app shell only. Never intercept CouchDB sync
        // requests (XHR/fetch to the configured sync URL) — those must
        // always hit the network live; PouchDB's own IndexedDB storage
        // already handles the offline data layer independently of this SW.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: 'index.html',
        runtimeCaching: [],
      },
    }),
  ],
  base: './',
})
