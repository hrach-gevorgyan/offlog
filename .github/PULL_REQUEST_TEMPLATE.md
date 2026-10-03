**What does this change and why?**

**Checklist** (run from `offlog-app/`; judge each by its exit code)
- [ ] `npm run build` — zero Svelte warnings
- [ ] `npm run check` — svelte-check + tsc, clean
- [ ] `npm test` — passing
- [ ] `npm run version:check` — only if this touches a version source
- [ ] `npx cap sync android` — only if this touches TypeScript, Vite,
      Capacitor or Tauri (CI does not run it; see maintenance.md)
- [ ] Every new task-mutating call site has `try/catch` + `showError()`
- [ ] Verified in the browser (light and dark mode) if UI changed — the
      desktop layout, and the phone shell at phone width if it is affected
- [ ] The `docs/` file this change touches is updated (see the table in
      CLAUDE.md)
