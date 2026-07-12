import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Separate from vite.config.ts (which is production-only concerns: PWA
// manifest, base path) to keep the test runner config from ever leaking
// into the shipped build.
export default defineConfig({
  plugins: [svelte()],
  // A9: without this, Vite/Vitest resolves `svelte` via its default
  // (Node/SSR) export condition even under the jsdom test environment,
  // which fails hard on any component using onMount/onDestroy ("mount(...)
  // is not available on the server") — component tests need the browser
  // build specifically.
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    // jsdom disables localStorage for opaque origins (its default
    // about:blank) — db.ts/config.ts both read localStorage at module load,
    // so a real http origin is required or every test file fails to import.
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
});
