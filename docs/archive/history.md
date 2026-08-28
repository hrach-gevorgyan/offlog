# Offlog — History

Two records, one file:

1. **[Releases](#releases)** — every release older than the newest ten in
   [../changelog.md](../changelog.md), one line each.
2. **[Roadmap items](#roadmap-items)** — the numbered items the roadmap
   once tracked, so an old cross-reference like "see B39" still resolves.

Maintenance passes live in
[maintenance.md](maintenance.md).

This is an index. Per-release detail is in
[../changelog.md](../changelog.md); why a choice was made is in
[../decisions.md](../decisions.md).

The roadmap was once organised into lettered tracks and, briefly, three
milestones. Both frameworks were dropped; the letters survive only as the
ID namespace below. Mesh sync (Track D) was declined outright — see
decisions.md.

---

## Releases

| Release | Summary |
|---|---|
| v6.5.0 | Hardening release, no new user-facing surface. Kanban card menu gained "Move to" status. Added `replication.test.ts`, `backupRestore.test.ts`, `perfGuard.test.ts`; total tests 279 → 569, each mutation-verified. `db.ts` split into `db/{core,entities,sync,tags,stats,maintenance}.ts`; `SettingsPanel.svelte`/`CardDetail.svelte` split into `settings/*`/`carddetail/*`, both verified by computed-style fingerprinting. Fully typed (any-casts 63→2 in the db layer, 42→0 elsewhere); build output verified byte-identical. `AgendaView` renamed from `DeadlinesView`. Fixed: `SettingsPanel`'s unguarded credential read; a `:global(button)` rule leaking into nested components; `analyzeImport()` undercounting `meta`/`tag_color` docs; a tombstone row crashing backup; `invokeTauri()` throwing synchronously off-Tauri; CodeQL extractor ordering; two stale `svelte-ignore` directives |
| v6.3.0 | Tray-resident desktop app (closing hides instead of quitting; tray menu; Ctrl+Alt+O); "Blocked by" task dependencies with cycle detection. Fixed: every backup containing an attachment was unrestorable (stubs with no bytes, PouchDB rejects the whole bulkDocs batch); automatic backups/retention only ran at app start, so a weeks-long tray session silently stopped backing up; the live change feed had no error handler and went permanently deaf after sleep/resume; a sync burst fired one reload per document; auto_compaction was off; Agenda never noticed midnight passing; a global-shortcut collision panicked on startup; a second launch forked a second NyxDB; reminders missed by over an hour were deleted without firing; removing/dragging a status column silently redefined done-ness; "Clear all" history had no confirmation |
| v6.2.1 | Maintenance pass (18th run), pulled forward at owner request. `App.svelte`'s `handleUndo()` was the one call site missing the audited try/catch + showError() invariant. Deduped `escapeHtml()` (was carried separately in GlobalSearch.svelte and UpdateModal.svelte) into utils.ts; fixed 14 stale GOAL.md/IDEAS.md references across 9 files |
| v6.2.0 | Custom recurrence intervals (every N days/weeks/months, weekdays-only); custom-field filtering in FilterBar and sortable custom-field columns in ListView; search now matches attachment filenames too. Repeat & reminder rewritten to a single select; Agenda month view got fixed row heights and a real anchored Today button. Fixed a generic `label` rule beating a higher-specificity class and a compact select trigger truncating "Not repeating" |
| v6.1.0 | Agenda month view — a real calendar grid with priority-coloured dots, title chips on wider viewports, tap-a-day to see its tasks and add one with that due date prefilled; `skipRecurrence()` to jump a recurring task to its next occurrence without logging a completion. Week view removed (already covered by List's "This week" grouping plus Month's drill-in). Fixed the month grid stretching to leave a blank gap before the day panel |
| v6.0.1 | Maintenance pass (17th run), right after v6.0.0: dead `getRecentlyModifiedTasks()` removed (orphaned by the 5.9.0 redesign), `GlobalSearch.svelte`'s hand-copied match-type union deduped against `db.ts`'s exported `TaskSearchMatch`, `npm audit` clean, build-output secret-leakage gate re-checked against a real `.env.local` |
| v6.0.0 | File attachments — any file except HEIC/HEIF, 10 MB each and 10 per task, images downscaled to ~1600px, bytes in PouchDB's native `_attachments` so they ride the existing sync; tag colour override with an Auto reset; Global Search matches checklist text and shows why a result matched. Monthly recurrence no longer overflows short months (Jan 31 rolled to Mar 3), and the mobile sidebar can no longer collapse into the desktop-only icon rail |
| v5.9.0 | Sidebar and CardDetail visual redesign: collapsible/resizable sidebar, CardDetail's optional fields consolidated under one manually-opened **Extras** panel, sync status shown by the sidebar footer icon's own colour instead of a separate dot and badge; Recent quick-resume and per-space project-count badge removed; CalendarPicker's popover no longer clipped inside the scrollable modal, and Dashboard/Focus/Agenda now clear `activeProjectId` |
| v5.8.3 | Maintenance pass (16th run): the Tauri notification path never got the `.catch(() => {})` fix the web path already had, so `updateTask()` failures were swallowed there; `TaskHistoryPanel.svelte` dropped its drifted hand-copies of `logFormat.ts` helpers (a missing rename case, a false "Checklist updated"); 6 module-internal symbols un-exported |
| v5.8.2 | Monthly Dependabot batch, all merged after green CI (`jsdom` 30, `svelte-check` 4.7.4, `@types/node` 26.1.2, `svelte` 5.56.8, `mdns-sd` 0.20.3, `actions/cache` 6) — no functional changes |
| v5.8.1 | C8 — the stored sync password is encrypted at rest per-platform instead of plain `localStorage` (a real CodeQL finding): Android Keystore via `capacitor-native-biometric`, Windows DPAPI via a new `secure_storage.rs` and two Tauri commands, plain web left as a documented dev/test-surface limitation; silent one-time migration off the old keys |
| v5.8.0 | `offlog-desktop` fully adopts NyxDB and drops real Apache CouchDB entirely — ~10x smaller installer, ~8x smaller install; two real NyxDB server bugs found live and fixed same-day; verified afterwards with a full scenario matrix (two-host detection, conflict create+resolve, offline/reconnect, uninstall/reinstall identity, multi-device merge). CouchDB-era naming cleaned out (`VITE_COUCH_*` → `VITE_SYNC_*`, `fetch-couchdb-win.ps1` → `fetch-nyxdb-win.ps1`); CodeQL least-privilege `permissions:` added to CI |
| v5.7.10 | TimePicker.svelte settled back to its B50 themed dropdown after trying and rejecting three replacements (scroll wheel, `timepicker-ui` npm lib, native `<input type="time">`) the same day — no functional change |
| v5.7.9 | Live-testing fallout from v5.7.6/5.7.7: reminder backlogs now stagger 15s apart instead of firing as a simultaneous burst; Kanban touch-drag and mouse-drag no longer share state (a stuck touch sequence could wedge drag entirely); desktop console-flash on launch fixed via redirecting the CouchDB sidecar's std handles; CustomFieldManager's field-type dropdown opens upward instead of off-screen; installer gained real branding + skipped the UAC prompt |
| v5.7.8 | Test release only -- version bump with no functional change, to exercise the new updater UX (v5.7.7) end-to-end from a real installed app |
| v5.7.7 | Desktop updater UX overhaul — real download progress, explicit restart prompt (no auto-restart), silent ~6h background check with a dismissible banner, `latest.json`'s release notes now pull from the real CHANGELOG row instead of being empty |
| v5.7.6 | Quiet hours (Settings → Notifications, queues reminders inside a configured window instead of firing) + a real 12h/24h display bug fix affecting TimePicker/CalendarPicker/CardDetail's reminder text |
| v5.7.5 | Milestone 1 complete: B61 (App Lock PIN confirmation required to change/remove), B62 (automatic local backup, rotated to 7), E3 (desktop auto-updater wired with real signing key). A32's 18 new UI component tests landed the same batch (suite to 204) |
| v5.7.4 | Second dependency maintenance batch (6 Dependabot PRs): Capacitor CLI/core/app/local-notifications patch bumps, `serde_json` patch bump, `rand` 0.9.5→0.10.2 needed a real code fix (`random_range` moved to a new `RngExt` trait, broke `sync_host.rs`'s pairing-credential generator); surfaced that `ci.yml` doesn't watch Cargo/Rust changes at all |
| v5.7.3 | Dependency maintenance batch: `uuid` forced to 11.1.1 via npm `overrides` (GHSA-w5hq-g745-h8pq); TypeScript 7.0.2 merged then reverted same day (broke `npx cap sync android`, invisible to build/tsc/test); `mdns-sd` 0.13.11→0.20.2, `tauri-winrt-notification` 0.7.3→0.8.1; `glib` 0.18.5 advisory recorded as accepted risk (no compatible fix upstream); `dependabot.yml` extended to watch offlog-desktop's Cargo deps |
| v5.7.2 | List view crash on zero-task project, undo-toast chaining bug, Time Travel mobile layout, Agenda "Tomorrow · Tomorrow" chip, faster edge-auto-scroll, view-restore moved to sessionStorage, landscape sidebar drawer fix, AndroidManifest.xml invalid-comment fix |
| v5.7.1 | CRITICAL: real dev credentials (`.env.local`) baked into a shipped production build via Vite's always-loaded env, leaking a real password in the public v5.7.0 APK — fixed via `import.meta.env.DEV` gating; plus a batch of onboarding/UTC-date/widget/drag fixes from the same live-testing session |
| v5.7.0 | A9 test coverage (`computeDropPosition()`/`runMaintenanceSteps()` extracted to testable pure functions) + B35 Focus/Dashboard "Daily Brief" integration + B59 unpaired-sync UX (3-step `NamePrompt.svelte` flow: device name, sync explainer, quick preferences) |
| v5.6.2 | Archived-project tasks leaking into every cross-project view — 6 query functions (`getDashboardData`, `searchAllTasks`, `getOpenTasksForFocusPicker`, `getAllActiveTasksWithReminders`, `getAllTasksDue`, `getRecentlyModifiedTasks`) now all require the task's own project to still be active |
| v5.6.1 | Maintenance pass (fourteenth run) — dead exports removed, `pouchdb`/`@capacitor/cli` dependency placement fixed, new `--toggle-knob` theme token, debounced duplicate/similarity checks; security/robustness checklist fully clean |
| v5.6.0 | Duplicate-name/content nudges (projects/spaces/tasks/checklist items/notes) — non-blocking hints only; also fixed a real Escape-vs-blur race that could silently create an empty project/space |
| v5.5.1 | S2 live-verified (180-doc dataset, mobile-then-PC merge) — real gap found and fixed: `scanConflicts()` now auto-resolves conflicts on the 4 fixed default-seed ids whenever one side is still the untouched pristine default |
| v5.5.0 | Sync-architecture hardening pass 1 — multiple-host LAN detection (`discovery.rs::browse_for_others()`, warns in Settings → Sync) and a stale-paired-host silent-failure fix (`staleHostAlert`, actionable "re-pair?" badge) |
| v5.4.6 | Maintenance pass (13th run): fixed a real `updateTask()` race via a per-task write queue in db.ts; extracted `resetTouchDragState()`; documented the debug-keystore-signed release build-type gate |
| v5.4.5 | Widget clicks getting stuck on the first-opened view (`closeAll()` made fully synchronous instead of relying on async `popstate`); widget preview size tightened to fill its frame |
| v5.4.4 | Fixed Android Studio's "Activity class ... does not exist" running `release` — unsigned build type, pointed at AGP's debug keystore for local-dev runnability |
| v5.4.3 | 5 more real bugs from a second live-device pass — widget picker preview text wrapping (new dedicated preview layout), widget taps overlapping instead of replacing (`modalStack.ts`'s `closeAll()`), drag-and-drop ghost card surviving `touchcancel`, Privacy Screen blocking all screenshots not just the recents preview (now a separate off-by-default toggle) |
| v5.4.2 | 7 real bugs from a full live-device pass — overlay-close reliability fallback, Settings Save unnecessary reload, Quick Add FAB over Settings, Focus done-state not shown, PIN input polish, splash logo, widget light-mode contrast |
| v5.4.1 | Maintenance pass (twelfth run) — fixed `hapticToggle()` firing before the task mutation was confirmed in 4 places (List/Focus/Deadlines/Kanban) |
| v5.4.0 | App Launcher (B57) — biometric "nothing enrolled" now jumps straight to Android's enrollment settings screen instead of just telling the user to go find it |
| v5.3.0 | Haptics (B58) — tactile feedback on checkbox/pin/checklist toggles and Kanban drag-and-drop, new shared `src/lib/haptics.ts` |
| v5.2.2 | Android cleanup, 6 items from a heavy audit: dead google-services classpath, unadapted scaffold tests, orphaned activity_main.xml, unused Gradle vars, unused widget color/string resources |
| v5.2.1 | Biometric toggle gated on PIN actually being set; regenerated splash screen from source-logo.svg (legacy pre-API-31 fallback had stale pre-rebrand mark); removed orphaned old icon-pipeline assets |
| v5.2.0 | Privacy Screen (B55, hides recent-apps preview when App Lock's PIN is set) + Clipboard copy button (B56, App Lock recovery code) |
| v5.1.0 | Biometric unlock (B54 second half) — opt-in fingerprint/face, sits alongside the PIN, never replaces it |
| v5.0.0 | App Lock (PIN + one-time recovery code), NLP Quick Add, recurring tasks, Time Travel journal (replaces Changelog), single-font consolidation (IBM Plex Mono removed) |
| v4.30.0 | Pre-public-release audit phase 1 (web), batches 1-10: 25+ real bugs across sync/CRUD/views/card-detail/settings/notifications/backup, all with build/tsc/test green per batch |
| v4.29.0 | Tauri CSP enabled; sidebar follows page theme; modal-stack root-cause fix (revived-instance stale requestClose, coalesced popstate); Ctrl+K command palette bugs (unexported nav functions, racing pushState) |
| v4.28.0 | Widget size reverted to correct 2×2 footprint; widget icon contrast fix; pairing success feedback on both phone/PC; seed-emptiness re-verification instead of trusting a cached flag |
| v4.27.0 | Android widget preview/color polish; modal-stack `closeOnBack()` idempotency fix (Quick Add "stops working after repeated use") |
| v4.26.0 | Settings redesign into consistent `.setting-group` cards + Advanced tab; Reduce Motion toggle; fixed mobile info-loss (project name hidden below ~700px in Dashboard/Deadlines/Focus) |
| v4.24.0 | C2 zero-config first-run empty states (Dashboard/Kanban); C10 plain-language pass on Restore/crash-recovery/pairing copy |
| v4.23.0 | B39 stable per-device id for history/device-list continuity across renames; B50 themed TimePicker replacing native time input; B48 Android widget light/dark split |
| v4.22.2 | Sync stability (E2): phone re-resolves the PC's stable CouchDB uuid instead of a fixed IP:port; dev/prod Tauri identity collision fixed; Android debug/release storage collision fixed via applicationIdSuffix |
| v4.22.1 | Maintenance pass (eighth run): missing try/catch on ChangelogView's "Clear all"; Tauri window minWidth/minHeight floor added; everything else audited clean |
| v4.22.0 | Week-start-day setting (B47, Sunday/Monday toggle for Agenda/DeadlinesView); full open/close animation pass (B51, new motion.ts); Tauri drag-drop fix (dragDropEnabled: false) |
| v4.21.0 | Card Detail redesign (B49): Due/Reminder collapsed into one "Schedule" row, Checklist/Custom fields/Notes as consistent card-rows, footer actions into one "⋯" menu; Kanban per-card quick-actions menu (B53) |
| v4.20.0 | Export/import redesign into Back up (scope selector) + Restore groups (B45); first-run device-name prompt via NamePrompt.svelte, skip and save equal-weight (B46) |
| v4.19.1 | Maintenance pass (seventh run, first to cover offlog-desktop/): consolidated duplicated isTauri()/invoke() detection into config.ts; everything else checked out clean |
| v4.19.0 | Track E (PC standalone app + embedded sync host) working end-to-end: mDNS discovery, pairing handshake, NSIS installer, Job Object hardening. C7 hardcoded-credential fallback removed from current source (git history still open). C2/C10 partial progress |
| v4.18.0 | Sync/Android reliability release (A32, A33, A34, A35): fixed sync falsely reporting "synced" (PouchDB combined-object error-swallowing), desktop sync's loopback-vs-LAN-IP default, silent Android reminders (missing notification channel), Export JSON/CSV/Project broken on Android (blob-download trick has no download manager in a Capacitor WebView) |
| v4.17.0 | New app icon (C8) applied everywhere, self-hosted fonts replacing Google Fonts CDN (C9) |
| v4.16.0 | Stabilization phase begins (B43, B44): Settings → Sync leads with a plain-language status sentence, raw URL field moved to Developer options; storage section leads with plain language instead of MB/quota jargon |
| v4.15.1 | Maintenance pass (sixth run): fixed a missing logChange() on createProjectFromTemplate(), 3 dark-mode contrast failures, an unguarded deep-link URL parse |
| v4.15.0 | Housekeeping release: real `.svelte` component test coverage begins (CardDetail save logic), seed drops from 4 spaces to 3, tags render on Kanban cards |
| v4.14.0 | Project templates ("Use a template…" copies status structure + optionally open tasks) and a notes-length soft counter on CardDetail |
| v4.12.2 | A31 visual/UX pass part 1: fixed Dashboard project-grid mobile overflow (`minmax(0,1fr)`), Focus view's FAB/Commit-button overlap at mobile widths |
| v4.12.1 | UI audit fixes: WCAG AA contrast fixes for --faint/--accent, new --on-accent token applied at 17 sites, consolidated ACTION_COLOR hex maps, scroll-shadow affordances on overflowing lists |
| v4.12.0 | Full codebase audit + docs-flow optimization (A30): fixed duplicated fmtLastSynced/timeAgo helpers, CardDetail collapsible-state remount bug, CustomSelect focus-on-open gap |
| v4.11.1 | Design-kit polish + PWA removal: Focus view solid cards, every native `<select>` converted to CustomSelect, CardDetail collapsible sections, PWA support dropped entirely |
| v4.11.0 | Kanban filters + checklists (B2, B18): shared FilterBar.svelte for both views, flat task checklist with a progress badge on Kanban/List |
| v4.10.1 | Maintenance pass (fourth run): fixed a real stored-XSS gap in GlobalSearch's highlight(), a missing logChange() on archiveProject()/unarchiveProject() |
| v4.10.0 | Dashboard weekly stats + command palette (B17, B9): "N completed this past week" line + Today panel, Ctrl+K now matches action commands too |
| v4.9.0 | Archive-adjacent housekeeping (B27, B32, B15): DB-wide archived-task count, whole-project archiving, new Archived Projects manager panel; fixed a native-select dark-mode readability bug |
| v4.8.0 | Visual/UX polish pass (B40, B41, B42, B37): sidebar 2×2 icon grid, Focus corkboard picker, Agenda full-width, Android widgets rebuilt to 3 static buttons; fixed a widget-stretch rendering bug |
| v4.7.0 | Perf validation + import/export v2 + Agenda week view (A10, A24, B4, B7): benchmark harness at 3,000-task scale (no perf cliff found), project/CSV export + guided import, Agenda week grid |
| v4.6.5 | UI polish patch: sidebar nav unified + Spaces/Projects merged into one collapsible tree, CardDetail condensed, List columns fixed, new custom CalendarPicker.svelte (B38) |
| v4.6.0 | Appearance + power-user pass (A11, B21, B11, B16, B19): Light/Dark/System theme, High Contrast toggle, global custom fields, revised bulk actions in List |
| v4.5.0 | Focus view (B35), draft: daily-commitment-lock (pick up to 3 tasks/day), round-robin-ranked picker, replaced a rejected auto-computed priority-list design |
| v4.4.2 | Second maintenance pass, clean codebase: fixed a missing try/catch+showError() gap in QuickAdd's createTask() call, documented a silent-catch write path |
| v4.4.1 | Light patch (A29): reworded a sync network-error message for clarity; fixed the B12 "remind on due date" checkbox rendering stacked instead of inline |
| v4.4.0 | Reminder-scheduling release (A12, B12): auto-derive `reminder_at` from due date + configurable default time; caught a real `catchUpWeb()` bug leaving stale reminders dangling forever |
| v4.3.0 | Storage-pressure release (A17, B14): explains quota, warns past 80% usage with cleanup pointers |
| v4.2.0 | Sync + device-identity release (A16, B13, B5, B22): free-form per-device names, "Devices seen recently," Sync on/off toggle, deterministic sync-error test coverage |
| v4.1.0 | The "3 widgets" release (A15, B20, B31): first modalStack test coverage, Agenda widget, Project list widget, shared native/JS bridge for both |
| v4.0.0 | Card-creation input-assistance (B25, B26): one-tap due-date shortcuts, tag autocomplete ranking project-local tags first |
| v3.9.8 | Three owner-reported fixes: Quick Add widget cold-start bug (A25), project view force-resetting to Kanban on refresh (A27), exact-alarm permission status/control in Settings (A28) |
| v3.9.7 | First maintenance.md pass: dropped 2 unused dependencies, extracted a shared `PinStar.svelte` from 3 duplicated inline SVGs |
| v3.9.6 | New brand icon regenerated across every platform surface (PWA, Android adaptive/legacy, notification icon, splash screens) from one SVG source |
| v3.9.5 | UX fixes: card detail no longer opens in title-edit mode, project view always lands on Kanban, List toolbar rebuilt as one guaranteed single row at every width |
| v3.9.0 | Sidebar rework at 20+ projects scale (A23), new Recent-tasks section (B23), project pinning (B34) |
| v3.8.5 | List view power customization (B36): saved filters, column selection/reordering, native horizontal scroll, multi-column sort |
| v3.8.0 | 4 correctness bugs fixed (A18–A22) plus List/Table merged into one view, rewritten with Table as the design baseline |
| v3.7.0 | Android hardware back-button handling (A14) + accessibility re-audit (A13) + notification actions (B3) + quick-capture widget (B10) |
| v3.6.0 | First sequencing-plan release: space management (B1), tag management (B6), full Settings redesign into category/detail layout |
| v3.5.0 | Settings conflict-list overflow fix, Android splash screen actually wired to the AndroidX SplashScreen API (was previously a no-op) |
| v3.4.0 | First test infrastructure (Vitest + `pouchdb-adapter-memory`, 26 tests) — caught 2 real previously-shipped bugs (conflict field, incomplete conflict resolution); further bundle diet |
| v3.3.0 | Redesigned bottom sidebar row, replaced every `window.confirm()` with a themed `ConfirmDialog`, consolidated Maintenance into one modal with progress |
| v3.2.0 | Trash promoted to a dedicated top-level view (previously embedded in Settings); "Optimize Storage" now actually calls `db.compact()` |
| v3.1.1 | Retention policy added for soft-deleted tasks (previously only logs had one); new storage-breakdown view in Settings |
| v3.1.0 | First Track A pass: persistent undo, changelog growth control, conflict resolution UI, faster startup, sync robustness (single replication guard), bundle diet |
| v3.0.1 | Code-quality pass — zero Svelte compiler warnings achieved; real ARIA semantics added throughout |
| v3.0.0 | Full brand color system rewrite (CSS custom properties only) + accessibility pass (keyboard shortcuts panel, focus-visible, keyboard-operable rows everywhere) |
| v2.9.2 | Three Android/Agenda fixes from a real device: duplicated overdue-duration text, wrong notification icon, exact-alarm permission explanation |
| v2.9.1 | Fixed Dashboard's overdue-tasks list including tasks already in their project's last column |
| v2.9.0 | Pre-3.0 hardening pass: real `pouchdb-find` indexing, in-memory task cache, crash recovery, error-handling audit, database integrity checker |
| v2.8.0 | Notifications shipped: `reminder_at` field, native Android scheduling + web best-effort fallback; sync reliability improvements (persistent `lastSynced`, offline detection, human-readable errors) |
| v2.7.2 | Fixed invisible Agenda badge counts (`currentColor` bug) and a broken "mark done" that didn't remove tasks from the Agenda list |
| v2.7.1 | Fixed inconsistent mobile header layout across views; fixed a Dashboard card text-overlap bug |
| v2.7.0 | Added PWA support via `vite-plugin-pwa` — installable, offline-capable web build |
| v2.6.5 | Fixed a z-index bug causing a gray "double overlay" look over the Changelog panel |
| v2.6.4 | Fixed mobile sidebar drawer staying open underneath Changelog/Settings, stacking two scrims |
| v2.6.3 | Extended the status-bar safe-area fix to every `position: fixed` full-screen element, not just `.layout` |
| v2.6.2 | Fixed app content (including the hamburger button) being hidden behind the new status-bar strip |
| v2.6.1 | Real fix for the Android status bar (2.6.0's approach was a no-op on targetSdk 36); regenerated all icons |
| v2.6.0 | (Superseded) First Android status-bar fix attempt — didn't work on Android 16 target |
| v2.5.0 | Brighter/higher-contrast palette, `duplicateTask()` + Duplicate button, consistent "Status" wording, FAB visibility fix |
| v2.4.1 | Extracted shared `utils.ts`, removed dead code, global `.scrim` class, error toast on failed DB writes |
| v2.4 | Dashboard set as home screen, responsive layouts, last-view persistence, first Android APK |

---

## Roadmap items

Outcome is the release it shipped in, or its final state. A few early
items were recorded by date rather than version; those are kept as dates
rather than guessed at.

### Track A — Performance & stability

| ID | Item | Outcome |
|---|---|---|
| A9 | UI component tests | 2026-07-21 |
| A10 | Large-dataset performance validation | v4.7.0 |
| A11 | Error-handling audit, pass 2 | v4.6.0 |
| A12 | Notification reliability audit | v4.4.0 |
| A13 | Accessibility re-audit for the newer components | v3.7.0 |
| A14 | Android hardware back-button handling | v3.7.0 |
| A15 | Widget/back-button regression coverage | v4.1.0 |
| A16 | Offline-queue robustness for sync | v4.2.0 |
| A17 | Storage-pressure handling | v4.3.0 |
| A18 | PWA not force-updating after a new version ships | v3.8.0 |
| A19 | First launch should always open Dashboard | v3.8.0 |
| A20 | List view attribute alignment still breaks with mixed deadlines | v3.8.0 |
| A21 | Visual check: tag overflow past 3 tags | v3.8.0 |
| A22 | Accidental "mark done" click has no undo | v3.8.0 |
| A23 | Sidebar scale test with 20+ projects | v3.9.0 |
| A24 | Version-over-version performance metrics | v4.7.0 |
| A25 | Quick Add widget opened the app but not Quick Add | v3.9.8 |
| A26 | PWA staleness / dev workflow | v4.11.1 |
| A27 | Project-view no longer force-resets to Kanban on every refresh | v3.9.8 |
| A28 | Exact-alarm ("Alarms & reminders") permission has no in-app status/control | v3.9.8 |
| A29 | "Cannot reach sync server" doesn't say why | v4.4.1 |
| A30 | Full codebase audit, cleanup, and documentation-flow optimization | v4.12.0 |
| A31 | Full cross-platform visual/UX review | v4.12.0, 2026-07-22 |
| A32 | Sync reports "synced" when devices aren't actually syncing | v4.18.0 |
| A33 | Android notifications fire silently, not fully functional | v4.18.0 |
| A34 | Export JSON doesn't work on Android | v4.18.0 |
| A35 | Desktop sync defaults to loopback, not a rememberable LAN IP | v4.18.0 |

### Track B — Features

| ID | Item | Outcome |
|---|---|---|
| B1 | Space management | v3.6.0 |
| B2 | Filters on Kanban + saved filters | v4.11.0 |
| B3 | Notification actions | v3.7.0 |
| B4 | Import/export v2 | v4.7.0 |
| B5 | Multi-device polish | v4.2.0 |
| B6 | Tag management | v3.6.0 |
| B7 | Calendar / week view for Agenda | v4.7.0 |
| B8 | Project templates | v4.14.0 |
| B9 | Command palette | v4.10.0 |
| B10 | Android quick-capture widget | v3.7.0 |
| B11 | High contrast mode | v4.6.0 |
| B12 | Auto-reminder from due date | v4.4.0 |
| B13 | Sync on/off toggle | v4.2.0 |
| B14 | Explain the storage quota number | v4.3.0 |
| B15 | Fold Maintenance into the Settings detail pane | v4.9.0 |
| B16 | Custom fields | v4.6.0 |
| B17 | Dashboard as a real home screen | v4.10.0 |
| B18 | Subtasks / checklists within a task | v4.11.0 |
| B19 | Bulk actions in List | v4.6.0 |
| B20 | Agenda widget | v4.1.0 |
| B21 | Dark mode follows OS setting | v4.6.0 |
| B22 | Named clients/devices | v4.2.0 |
| B23 | Sidebar: last modified cards | v3.9.0 |
| B24 | Seed data: 3 spaces, not 4 | v4.15.0 |
| B25 | Deadline quick-suggestions on new card | v4.0.0 |
| B26 | Tag autocomplete beyond the current project | v4.0.0 |
| B27 | Archived tasks are too hidden | v4.9.0 |
| B28 | Rethink "last column = done" | parked |
| B29 | Show tags on Kanban cards | v4.15.0 |
| B30 | Notes length guardrail | v4.14.0 |
| B31 | Third Android widget: project list | v4.1.0 |
| B32 | Archive a whole project | v4.9.0 |
| B33 | Sub-projects | parked |
| B34 | Project pinning | v3.9.0 |
| B35 | Focus view, and its follow-ups | v4.5.0, v5.7.0 |
| B36 | List view power customization | v3.8.5 |
| B37 | Android widgets, and their final polish | v4.8.0, 2026-07-21 |
| B38 | Custom calendar/date picker instead of the native one | v4.6.5 |
| B39 | Renaming a device (B22) leaves a stale "dead" entry | v4.23.0 |
| B40 | Sidebar bottom icon rail isn't readable | v4.8.0 |
| B41 | Focus view | v4.8.0 |
| B42 | Agenda doesn't use full screen width | v4.8.0 |
| B43 | Human-friendly sync settings + Developer options | v4.16.0 |
| B44 | Storage & quota copy, plain-language rewrite | v4.16.0 |
| B45 | Export/import UX redesign | v4.20.0 |
| B46 | First-run: ask for a device/user name | v4.20.0 |
| B47 | Week start day setting | v4.22.0 |
| B48 | Android widget: flatter, 2-color light/dark, no border highlight | v4.23.0 |
| B49 | Card Detail redesign | v4.21.0 |
| B50 | Custom time picker (extend B38 to reminder times) | v4.23.0 |
| B51 | Consistent animations everywhere | v4.22.0 |
| B52 | QR pairing | 2026-07-13 |
| B53 | Kanban card quick-actions menu | v4.21.0 |
| B54 | App lock (PIN + biometric) | 2026-07-19 |
| B55 | Privacy Screen | 2026-07-20 |
| B56 | Clipboard | 2026-07-20 |
| B57 | App Launcher | 2026-07-20 |
| B58 | Haptics | 2026-07-20 |
| B59 | Sidebar sync button hidden when unpaired + 3-step first-run flow | 2026-07-21 |
| B60 | Duplicate-name/content nudges | v5.6.0 |

### Track C — Public release & open source

| ID | Item | Outcome |
|---|---|---|
| C1 | Open-source the repository | 2026-07-22 |
| C2 | Zero-config first run, verified | v4.24.0 |
| C4 | F-Droid listing | declined |
| C6 | Brand & positioning pass | 2026-07-22 |
| C7 | Fix hardcoded CouchDB credentials | 2026-07-17 |
| C8 | New app icon, all platforms | v4.17.0 |
| C9 | Typography: ≤3 font families, self-hosted | v4.17.0 |
| C10 | Plain-language pass | 2026-07-21 |

### Track E — PC standalone app

| ID | Item | Outcome |
|---|---|---|
| E1 | PC app + embedded sync host | v4.19.0 |
| E2 | Re-resolve the PC host after pairing, not just at pairing time | v4.22.1 |

### Why the parked and declined ones stopped

- **B28, Rethink "last column = done"** — parked. The positional-done
  convention (`column_id === columns.at(-1)`) is a locked invariant (see
  decisions.md) with no multiple terminal states. Needs a real design
  conversation before any implementation. Parked with the feature-phase
  wind-down; revisit only if daily dogfooding proves the current rule
  actually hurts.
- **B33, Sub-projects** — parked. Nested project hierarchy. Touches the data
  model, every project-picker UI, and Dashboard/sidebar nesting — exactly
  the kind of architecture experiment the stabilization pivot exists to
  stop. Revisit post-release only if real daily use demands it.
- **Snooze** — parked, never numbered. One-tap defer to tomorrow or next
  week, extending the notification action to the task itself. Carried in
  roadmap.md's "Later" bucket for several versions without daily use ever
  asking for it, and moved here when that bucket was removed. Revisit only
  if real use demands it.
- **Import converters** — parked, never numbered. One-way Trello/ClickUp/
  Jira export conversion, never a live connection. Same story: an idea, not
  demand.
- **Voice input for Quick Add** — parked, never numbered. Platform
  speech-to-text into the existing parser, Android first. Same story.

- **C4, F-Droid listing** — declined. Distribution stays GitHub, a website,
  and Google Play. See decisions.md.
