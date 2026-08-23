**What does this change and why?**

**Checklist**
- [ ] `npm run build` — zero Svelte warnings
- [ ] `npm run check` — svelte-check + tsc, clean
- [ ] `npm test` — passing
- [ ] `npx cap sync android` — only if this touches TypeScript, Vite,
      Capacitor or Tauri (CI does not run it; see MAINTENANCE.md)
- [ ] Verified in the browser (light and dark mode) if UI changed
- [ ] Relevant `docs/` file updated, if this changes architecture, a
      decision, or the roadmap
