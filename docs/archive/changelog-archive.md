# Offlog — Changelog Archive

Older releases, compressed to one line each (full detail lives in git —
each row references its tag, e.g. `git show v3.9.8`). Split out of
[../CHANGELOG.md](../CHANGELOG.md) 2026-07 once that file's recent-version
table grew large enough that loading it by default got expensive;
CHANGELOG.md keeps the newest ~10 releases in full detail and points here
for anything older. Nothing is lost — this is a compression of an
already-complete git history, not the only remaining record. Moved into
`docs/archive/` alongside `roadmap-archive.md` during the 2026-07-20 docs
restructuring (see DECISIONS.md) — this folder is where anything long-form
but no longer "current" goes, archived roughly weekly rather than left to
balloon the live docs.

This file also holds the full maintenance-pass history (moved from
MAINTENANCE.md's old in-file tracker, which is now docs/MAINTENANCE.md and
carries only the process instructions plus a one-line current pointer) —
see the "Maintenance pass log" section at the bottom.

| Version | Summary | Tag |
|---|---|---|
| 5.4.4 | Fixed Android Studio's "Activity class ... does not exist" running `release` — unsigned build type, pointed at AGP's debug keystore for local-dev runnability | `v5.4.4` |
| 5.4.5 | Widget clicks getting stuck on the first-opened view (`closeAll()` made fully synchronous instead of relying on async `popstate`); widget preview size tightened to fill its frame | `v5.4.5` |
| 5.4.6 | Maintenance pass (13th run): fixed a real `updateTask()` race via a per-task write queue in db.ts; extracted `resetTouchDragState()`; documented the debug-keystore-signed release build-type gate | `v5.4.6` |
| 4.22.1 | Maintenance pass (eighth run): missing try/catch on ChangelogView's "Clear all"; Tauri window minWidth/minHeight floor added; everything else audited clean | `v4.22.1` |
| 4.22.2 | Sync stability (E2): phone re-resolves the PC's stable CouchDB uuid instead of a fixed IP:port; dev/prod Tauri identity collision fixed; Android debug/release storage collision fixed via applicationIdSuffix | `v4.22.2` |
| 4.22.0 | Week-start-day setting (B47, Sunday/Monday toggle for Agenda/DeadlinesView); full open/close animation pass (B51, new motion.ts); Tauri drag-drop fix (dragDropEnabled: false) | `v4.22.0` |
| 4.23.0 | B39 stable per-device id for history/device-list continuity across renames; B50 themed TimePicker replacing native time input; B48 Android widget light/dark split | `v4.23.0` |
| 4.24.0 | C2 zero-config first-run empty states (Dashboard/Kanban); C10 plain-language pass on Restore/crash-recovery/pairing copy | `v4.24.0` |
| 4.26.0 | Settings redesign into consistent `.setting-group` cards + Advanced tab; Reduce Motion toggle; fixed mobile info-loss (project name hidden below ~700px in Dashboard/Deadlines/Focus) | `v4.26.0` |
| 4.27.0 | Android widget preview/color polish; modal-stack `closeOnBack()` idempotency fix (Quick Add "stops working after repeated use") | `v4.27.0` |
| 4.28.0 | Widget size reverted to correct 2×2 footprint; widget icon contrast fix; pairing success feedback on both phone/PC; seed-emptiness re-verification instead of trusting a cached flag | `v4.28.0` |
| 4.29.0 | Tauri CSP enabled; sidebar follows page theme; modal-stack root-cause fix (revived-instance stale requestClose, coalesced popstate); Ctrl+K command palette bugs (unexported nav functions, racing pushState) | `v4.29.0` |
| 4.30.0 | Pre-public-release audit phase 1 (web), batches 1-10: 25+ real bugs across sync/CRUD/views/card-detail/settings/notifications/backup, all with build/tsc/test green per batch | `v4.30.0` |
| 5.0.0 | App Lock (PIN + one-time recovery code), NLP Quick Add, recurring tasks, Time Travel journal (replaces Changelog), single-font consolidation (IBM Plex Mono removed) | `v5.0.0` |
| 5.1.0 | Biometric unlock (B54 second half) — opt-in fingerprint/face, sits alongside the PIN, never replaces it | `v5.1.0` |
| 4.21.0 | Card Detail redesign (B49): Due/Reminder collapsed into one "Schedule" row, Checklist/Custom fields/Notes as consistent card-rows, footer actions into one "⋯" menu; Kanban per-card quick-actions menu (B53) | `v4.21.0` |
| 4.20.0 | Export/import redesign into Back up (scope selector) + Restore groups (B45); first-run device-name prompt via NamePrompt.svelte, skip and save equal-weight (B46) | `v4.20.0` |
| 4.19.1 | Maintenance pass (seventh run, first to cover offlog-desktop/): consolidated duplicated isTauri()/invoke() detection into config.ts; everything else checked out clean | `v4.19.1` |
| 4.19.0 | Track E (PC standalone app + embedded sync host) working end-to-end: mDNS discovery, pairing handshake, NSIS installer, Job Object hardening. C7 hardcoded-credential fallback removed from current source (git history still open). C2/C10 partial progress | `v4.19.0` |
| 4.18.0 | Sync/Android reliability release (A32, A33, A34, A35): fixed sync falsely reporting "synced" (PouchDB combined-object error-swallowing), desktop sync's loopback-vs-LAN-IP default, silent Android reminders (missing notification channel), Export JSON/CSV/Project broken on Android (blob-download trick has no download manager in a Capacitor WebView) | `v4.18.0` |
| 4.17.0 | New app icon (C8) applied everywhere, self-hosted fonts replacing Google Fonts CDN (C9) | `v4.17.0` |
| 4.16.0 | Stabilization phase begins (B43, B44): Settings → Sync leads with a plain-language status sentence, raw URL field moved to Developer options; storage section leads with plain language instead of MB/quota jargon | `v4.16.0` |
| 4.15.1 | Maintenance pass (sixth run): fixed a missing logChange() on createProjectFromTemplate(), 3 dark-mode contrast failures, an unguarded deep-link URL parse | `v4.15.1` |
| 4.15.0 | Housekeeping release: real `.svelte` component test coverage begins (CardDetail save logic), seed drops from 4 spaces to 3, tags render on Kanban cards | `v4.15.0` |
| 4.14.0 | Project templates ("Use a template…" copies status structure + optionally open tasks) and a notes-length soft counter on CardDetail | `v4.14.0` |
| 4.12.2 | A31 visual/UX pass part 1: fixed Dashboard project-grid mobile overflow (`minmax(0,1fr)`), Focus view's FAB/Commit-button overlap at mobile widths | `v4.12.2` |
| 4.12.1 | UI audit fixes: WCAG AA contrast fixes for --faint/--accent, new --on-accent token applied at 17 sites, consolidated ACTION_COLOR hex maps, scroll-shadow affordances on overflowing lists | `v4.12.1` |
| 4.12.0 | Full codebase audit + docs-flow optimization (A30): fixed duplicated fmtLastSynced/timeAgo helpers, CardDetail collapsible-state remount bug, CustomSelect focus-on-open gap | `v4.12.0` |
| 4.11.1 | Design-kit polish + PWA removal: Focus view solid cards, every native `<select>` converted to CustomSelect, CardDetail collapsible sections, PWA support dropped entirely | `v4.11.1` |
| 4.11.0 | Kanban filters + checklists (B2, B18): shared FilterBar.svelte for both views, flat task checklist with a progress badge on Kanban/List | `v4.11.0` |
| 4.10.1 | Maintenance pass (fourth run): fixed a real stored-XSS gap in GlobalSearch's highlight(), a missing logChange() on archiveProject()/unarchiveProject() | `v4.10.1` |
| 4.10.0 | Dashboard weekly stats + command palette (B17, B9): "N completed this past week" line + Today panel, Ctrl+K now matches action commands too | `v4.10.0` |
| 4.9.0 | Archive-adjacent housekeeping (B27, B32, B15): DB-wide archived-task count, whole-project archiving, new Archived Projects manager panel; fixed a native-select dark-mode readability bug | `v4.9.0` |
| 4.8.0 | Visual/UX polish pass (B40, B41, B42, B37): sidebar 2×2 icon grid, Focus corkboard picker, Agenda full-width, Android widgets rebuilt to 3 static buttons; fixed a widget-stretch rendering bug | `v4.8.0` |
| 4.7.0 | Perf validation + import/export v2 + Agenda week view (A10, A24, B4, B7): benchmark harness at 3,000-task scale (no perf cliff found), project/CSV export + guided import, Agenda week grid | `v4.7.0` |
| 4.6.5 | UI polish patch: sidebar nav unified + Spaces/Projects merged into one collapsible tree, CardDetail condensed, List columns fixed, new custom CalendarPicker.svelte (B38) | `v4.6.5` |
| 4.6.0 | Appearance + power-user pass (A11, B21, B11, B16, B19): Light/Dark/System theme, High Contrast toggle, global custom fields, revised bulk actions in List | `v4.6.0` |
| 4.5.0 | Focus view (B35), draft: daily-commitment-lock (pick up to 3 tasks/day), round-robin-ranked picker, replaced a rejected auto-computed priority-list design | `v4.5.0` |
| 4.4.2 | Second maintenance pass, clean codebase: fixed a missing try/catch+showError() gap in QuickAdd's createTask() call, documented a silent-catch write path | `v4.4.2` |
| 4.4.1 | Light patch (A29): reworded a sync network-error message for clarity; fixed the B12 "remind on due date" checkbox rendering stacked instead of inline | `v4.4.1` |
| 4.4.0 | Reminder-scheduling release (A12, B12): auto-derive `reminder_at` from due date + configurable default time; caught a real `catchUpWeb()` bug leaving stale reminders dangling forever | `v4.4.0` |
| 4.3.0 | Storage-pressure release (A17, B14): explains quota, warns past 80% usage with cleanup pointers | `v4.3.0` |
| 4.2.0 | Sync + device-identity release (A16, B13, B5, B22): free-form per-device names, "Devices seen recently," Sync on/off toggle, deterministic sync-error test coverage | `v4.2.0` |
| 4.1.0 | The "3 widgets" release (A15, B20, B31): first modalStack test coverage, Agenda widget, Project list widget, shared native/JS bridge for both | `v4.1.0` |
| 4.0.0 | Card-creation input-assistance (B25, B26): one-tap due-date shortcuts, tag autocomplete ranking project-local tags first | `v4.0.0` |
| 3.9.8 | Three owner-reported fixes: Quick Add widget cold-start bug (A25), project view force-resetting to Kanban on refresh (A27), exact-alarm permission status/control in Settings (A28) | `v3.9.8` |
| 3.9.7 | First MAINTENANCE.md pass: dropped 2 unused dependencies, extracted a shared `PinStar.svelte` from 3 duplicated inline SVGs | `v3.9.7` |
| 3.9.6 | New brand icon regenerated across every platform surface (PWA, Android adaptive/legacy, notification icon, splash screens) from one SVG source | `v3.9.6` |
| 3.9.5 | UX fixes: card detail no longer opens in title-edit mode, project view always lands on Kanban, List toolbar rebuilt as one guaranteed single row at every width | `v3.9.5` |
| 3.9.0 | Sidebar rework at 20+ projects scale (A23), new Recent-tasks section (B23), project pinning (B34) | `v3.9.0` |
| 3.8.5 | List view power customization (B36): saved filters, column selection/reordering, native horizontal scroll, multi-column sort | `v3.8.5` |
| 3.8.0 | 4 correctness bugs fixed (A18–A22) plus List/Table merged into one view, rewritten with Table as the design baseline | `v3.8.0` |
| 3.7.0 | Android hardware back-button handling (A14) + accessibility re-audit (A13) + notification actions (B3) + quick-capture widget (B10) | `v3.7.0` |
| 3.6.0 | First sequencing-plan release: space management (B1), tag management (B6), full Settings redesign into category/detail layout | `v3.6.0` |
| 3.5.0 | Settings conflict-list overflow fix, Android splash screen actually wired to the AndroidX SplashScreen API (was previously a no-op) | `v3.5.0` |
| 3.4.0 | First test infrastructure (Vitest + `pouchdb-adapter-memory`, 26 tests) — caught 2 real previously-shipped bugs (conflict field, incomplete conflict resolution); further bundle diet | `v3.4.0` |
| 3.3.0 | Redesigned bottom sidebar row, replaced every `window.confirm()` with a themed `ConfirmDialog`, consolidated Maintenance into one modal with progress | `v3.3.0` |
| 3.2.0 | Trash promoted to a dedicated top-level view (previously embedded in Settings); "Optimize Storage" now actually calls `db.compact()` | `v3.2.0` |
| 3.1.1 | Retention policy added for soft-deleted tasks (previously only logs had one); new storage-breakdown view in Settings | `v3.1.1` |
| 3.1.0 | First Track A pass: persistent undo, changelog growth control, conflict resolution UI, faster startup, sync robustness (single replication guard), bundle diet | `v3.1.0` |
| 3.0.1 | Code-quality pass — zero Svelte compiler warnings achieved; real ARIA semantics added throughout | `v3.0.1` |
| 3.0.0 | Full brand color system rewrite (CSS custom properties only) + accessibility pass (keyboard shortcuts panel, focus-visible, keyboard-operable rows everywhere) | `v3.0.0` |
| 2.9.2 | Three Android/Agenda fixes from a real device: duplicated overdue-duration text, wrong notification icon, exact-alarm permission explanation | `v2.9.2` |
| 2.9.1 | Fixed Dashboard's overdue-tasks list including tasks already in their project's last column | `v2.9.1` |
| 2.9.0 | Pre-3.0 hardening pass: real `pouchdb-find` indexing, in-memory task cache, crash recovery, error-handling audit, database integrity checker | `v2.9.0` |
| 2.8.0 | Notifications shipped: `reminder_at` field, native Android scheduling + web best-effort fallback; sync reliability improvements (persistent `lastSynced`, offline detection, human-readable errors) | `v2.8.0` |
| 2.7.2 | Fixed invisible Agenda badge counts (`currentColor` bug) and a broken "mark done" that didn't remove tasks from the Agenda list | `v2.7.2` |
| 2.7.1 | Fixed inconsistent mobile header layout across views; fixed a Dashboard card text-overlap bug | `v2.7.1` |
| 2.7.0 | Added PWA support via `vite-plugin-pwa` — installable, offline-capable web build | `v2.7.0` |
| 2.6.5 | Fixed a z-index bug causing a gray "double overlay" look over the Changelog panel | `v2.6.5` |
| 2.6.4 | Fixed mobile sidebar drawer staying open underneath Changelog/Settings, stacking two scrims | `v2.6.4` |
| 2.6.3 | Extended the status-bar safe-area fix to every `position: fixed` full-screen element, not just `.layout` | `v2.6.3` |
| 2.6.2 | Fixed app content (including the hamburger button) being hidden behind the new status-bar strip | `v2.6.2` |
| 2.6.1 | Real fix for the Android status bar (2.6.0's approach was a no-op on targetSdk 36); regenerated all icons | `v2.6.1` |
| 2.6.0 | (Superseded) First Android status-bar fix attempt — didn't work on Android 16 target | `v2.6.0` |
| 2.5.0 | Brighter/higher-contrast palette, `duplicateTask()` + Duplicate button, consistent "Status" wording, FAB visibility fix | `v2.5.0` |
| 2.4.1 | Extracted shared `utils.ts`, removed dead code, global `.scrim` class, error toast on failed DB writes | `v2.4.1` |
| 2.4 | Dashboard set as home screen, responsive layouts, last-view persistence, first Android APK | `v2.4` |

<!-- New rows appended below by rotation from CHANGELOG.md; not chronological with the table above yet — fine, git tag is the source of truth -->
| 5.2.2 | Android cleanup, 6 items from a heavy audit: dead google-services classpath, unadapted scaffold tests, orphaned activity_main.xml, unused Gradle vars, unused widget color/string resources | `v5.2.2` |
| 5.4.0 | App Launcher (B57) — biometric "nothing enrolled" now jumps straight to Android's enrollment settings screen instead of just telling the user to go find it | `v5.4.0` |
| 5.4.1 | Maintenance pass (twelfth run) — fixed `hapticToggle()` firing before the task mutation was confirmed in 4 places (List/Focus/Deadlines/Kanban) | `v5.4.1` |
| 5.2.1 | Biometric toggle gated on PIN actually being set; regenerated splash screen from source-logo.svg (legacy pre-API-31 fallback had stale pre-rebrand mark); removed orphaned old icon-pipeline assets | `v5.2.1` |
| 5.2.0 | Privacy Screen (B55, hides recent-apps preview when App Lock's PIN is set) + Clipboard copy button (B56, App Lock recovery code) | `v5.2.0` |
| 5.3.0 | Haptics (B58) — tactile feedback on checkbox/pin/checklist toggles and Kanban drag-and-drop, new shared `src/lib/haptics.ts` | `v5.3.0` |
| 5.4.2 | 7 real bugs from a full live-device pass — overlay-close reliability fallback, Settings Save unnecessary reload, Quick Add FAB over Settings, Focus done-state not shown, PIN input polish, splash logo, widget light-mode contrast | `v5.4.2` |
| 5.4.3 | 5 more real bugs from a second live-device pass — widget picker preview text wrapping (new dedicated preview layout), widget taps overlapping instead of replacing (`modalStack.ts`'s `closeAll()`), drag-and-drop ghost card surviving `touchcancel`, Privacy Screen blocking all screenshots not just the recents preview (now a separate off-by-default toggle) | `v5.4.3` |

---

## Maintenance pass log

Full narrative history of every maintenance pass (process defined in
[../MAINTENANCE.md](../MAINTENANCE.md)), moved here from that file's old
in-place tracker so the instructions file stays instructions-only. Current
pointer (last pass / next due) lives at the top of MAINTENANCE.md, not
here — this is history, not state.

Last pass: v4.15.1 (2026-07-13 — sixth pass, delta-scoped since v4.12.0's
A30. Found/fixed a missing `logChange()` on `createProjectFromTemplate()`
(same bug class as the fourth pass's `archiveProject()` gap), 3 dark-mode
contrast failures from hardcoded `#fff` instead of a token (`Sidebar`
conflict-badge, `App.svelte` error-toast, `DeadlinesView`'s 4-variant
badge — the last needed a new `--ink-fixed-dark` token), and an unguarded
`new URL()` in the widget deep-link handler. Full report in this
conversation's transcript — no dead code, no new duplication, `npm audit`
unchanged from last pass).

Last pass: v4.19.1 (2026-07-19 — seventh run, after v4.18.0/v4.19.0 shipped.
First pass to cover `offlog-desktop/` (Track E's Tauri PC app) alongside
`offlog-app/` — see MAINTENANCE.md's own Phase 0/1/4/5 additions from the
same day. Found and fixed one real duplication: `isTauri()` detection and
the raw `window.__TAURI_INTERNALS__.invoke(...)` call pattern were each
independently re-declared/inlined across `config.ts` and
`SettingsPanel.svelte` (5+ call sites) — consolidated into `isTauri()`/
`invokeTauri()`, both exported from `config.ts`. Everything else checked
out clean — no dead code beyond one already-documented pending stub, no
unused Track E dependencies, `npm audit` unchanged, Rust `unsafe` blocks
limited to the expected `TerminateJobObject` FFI calls, no credential
values in any log line. `SettingsPanel.svelte`'s size (1141 lines) flagged
again but a split deliberately skipped — same shared-CSS blocker as the
v4.12.0 pass.)

Last pass: v4.22.1 (2026-07-15 — eighth run, delta-scoped since v4.19.1,
covering v4.20.0/v4.21.0/v4.22.0's changes). Found and fixed one real gap:
`ChangelogView.svelte`'s "Clear all" button was missing the audited
try/catch + `showError()` invariant. Also added a Tauri window
`minWidth`/`minHeight` floor (`offlog-desktop/src-tauri/tauri.conf.json`)
since none existed. The `motion.ts` animation migration (v4.22.0) audited
clean — no leftover unused `@keyframes`, all 7 exports/15 call sites
correct. `npm audit` unchanged (4 dev-tooling-only advisories, none
shipped). One correction to a preliminary finding: `pouchdb` npm package
looked unused in `src/` but is actually imported by `tests/setup.ts` —
left in place. Disabled CSP (`security.csp: null`) noted but deliberately
deferred to the same pre-public-release pass as C7, not fixed piecemeal
here.

Last pass: v4.25.0 (2026-07-16 — ninth run, covering the first real
desktop-dogfooding round: v4.23.0-v4.25.0's rapid iteration on
`offlog-desktop`'s notification/backup/startup fixes). Found and fixed
one real gap: `@tauri-apps/plugin-notification` (the npm package) had
zero remaining JS import sites after click/schedule logic was rebuilt on
a custom Rust command — removed from `package.json`. The Rust crate
`tauri-plugin-notification` stays (still registered for its
permission-check compatibility). Everything else audited clean: no dead
code from the several notifications.ts rewrites, all 6 new npm packages
and 6 new Rust crates from this arc genuinely used, `cargo check` zero
warnings, `npm audit --production` unchanged (same known uuid/pouchdb
advisory), no stray debug/temp files.

Last pass: v4.28.0 (2026-07-17 — tenth run, delta-scoped since v4.25.0,
covering v4.26.0-v4.28.0's settings redesign, Android widget polish, and
the modalStack.ts/seedIfEmpty fixes). Baselines all green (build/tsc/
test/cargo build). Found and fixed two real [SAFE] gaps: `notifications.ts`
re-declared its own inline Tauri-detection check instead of importing
`isTauri()` from `config.ts` (same duplication pattern the seventh pass
already consolidated elsewhere); `docs/TECH.md` was stale since v4.12.0
(version header, and its source file map was missing ~20 files added
since, including `SettingsPanel.svelte` itself after the v4.26.0
redesign pulled it out of `Sidebar.svelte`) — both fixed. Security
checklist all clean: XSS surface, deep-link handling, `unsafe` blocks,
credential logging, `npm audit` (20 vulns, all in build-tooling or the
test-only `pouchdb` package, none shipped) all unchanged/clean.
**Also completed alongside this pass, not part of the routine itself**:
C7's git-history piece (owner-directed) — two real credentials
(`offlog-app/src/config.ts`'s old hardcoded CouchDB password, and a
second username+password pair that had leaked into a committed
`.claude/settings.local.json`) purged from every one of the repo's 127
commits/71 tags via BFG Repo-Cleaner, verified by exhaustively scanning
every remaining git object afterward. See DECISIONS.md/ROADMAP.md C7 for
the full record.

Last pass: v5.0.0 (2026-07-20 — eleventh run, delta-scoped since v4.28.0,
covering v4.29.0/v4.30.0's pre-release audit batches plus the unreleased
Time Travel/NLP Quick Add/recurring-tasks/font-consolidation/App Lock work
bundled into this 5.0.0 cut). Baselines all green (build/tsc/test/cargo
build) after one real fix found at Phase 0: `TimeTravelView.svelte` had a
non-static `tabindex`/`role` pairing the Svelte a11y checker couldn't
verify at compile time, producing a build warning — fixed by giving the
non-clickable branch a static `role="listitem" tabindex="-1"` instead of
conditional `undefined`s. Phase 1 delta audit otherwise clean: no dangling
references survived the ChangelogView→TimeTravelView swap, Tauri CSP is
genuinely enabled (not just claimed — confirmed a real restrictive policy
in tauri.conf.json), App Lock/recovery-code secrets are salted-hashed and
never logged or stored in plaintext, no new `eval`/`Function`/raw
`innerHTML`, `{@html}` sites all either fixed internal constants or
properly escaped, and the audited try/catch+showError() invariant holds
across every new mutation call site (QuickAdd, Time Travel, recurring-task
reset path in db.ts). No dead code, no new duplication, no npm dependency
changes to reassess.

Last pass: v5.4.0 (2026-07-20 — twelfth run, delta-scoped since v5.0.0,
covering App Lock's biometric unlock (B54 second half), Privacy Screen +
Clipboard (B55/B56), a real bug fix (biometric toggle reachable with no
PIN set — now gated on `appLockEnabled` too), an Android splash-logo fix
(stale pre-rebrand mark on legacy pre-API-31 devices, new
`resources/generate-splash.cjs`), a 6-item Android cleanup (dead
google-services classpath, unadapted scaffold test files, orphaned
`activity_main.xml`, unused Gradle version vars, unused widget color/
string resources — all confirmed safe and removed), Haptics (B58), and
App Launcher (B57). Found and fixed one real [REVIEW] item: `hapticToggle()`
fired *before* the task mutation was confirmed in 4 places (List/Focus/
Deadlines' `markDone`, Kanban's `togglePin`) — inconsistent with the
drag-drop haptic calls, which correctly fire only after `updateTask`
succeeds; moved all 4 to fire after the `await` instead. Everything else
clean: all 5 new npm dependencies (`@capacitor/privacy-screen`,
`@capacitor/clipboard`, `@capacitor/haptics`, `@capacitor/app-launcher`,
`capacitor-native-biometric`) confirmed genuinely used, no plaintext
secrets in the 2 new localStorage flags, `clearAppLockPin()` correctly
clears the biometric flag too, no new `{@html}`/`eval`/`innerHTML`, `npm
audit` unchanged from prior passes (same dev-tooling/test-only
advisories). `SettingsPanel.svelte` flagged again at 1881 lines (was 1141
three passes ago) — same shared-CSS blocker, still deliberately deferred.

Last pass: v5.4.6 (2026-07-20 — thirteenth run, delta-scoped since v5.4.0,
covering v5.4.1-v5.4.5's rapid live-device bugfix batches). Baselines all
green (build/tsc/test/cargo build). Found and fixed one real race:
`notifications.ts`'s `fireWebNotification()` cleared `reminder_at` via an
un-awaited `updateTask(...).catch(()=>{})`; since `updateTask` was a plain
get-then-put with no compare-and-swap, a second concurrent `updateTask` on
the same task could read a stale rev and throw "Document update conflict"
— reproduced intermittently (~1/4 runs) in `tests/notifications.test.ts`.
Fixed at the root in `db.ts` by serializing all `updateTask()` calls per
task id through a small write queue (`updateTask` now chains onto
`updateTaskImpl` via `_taskWriteQueues`), rather than patching just the
one call site — 5/5 clean reruns of the previously-flaky test afterward.
Also extracted `KanbanBoard.svelte`'s repeated touch-drag-state reset into
one `resetTouchDragState()` helper, and added a release-checklist note in
CLAUDE.md flagging that the Android `release` build type is currently
signed with AGP's debug keystore (v5.4.4, local-dev convenience only) and
must not ship as a real Play Store build before C3's real signing key
exists. No dead code, no dependency changes, security checklist and `npm
audit` unchanged from prior passes.

Last pass: v5.6.1 (2026-07-21 — fourteenth run, off-cadence at owner
request; the schedule's next pass wasn't due until v5.7.0). Baseline
wasn't green at the start: `TimeTravelView.svelte` had a Svelte a11y
warning (`role`/`tabindex` both driven by the same ternary, which the
linter can't statically correlate) — fixed by splitting into static
`{#if clickable}` branches before analysis could begin. Four parallel
sub-audits (dead code/duplication, dependencies, error-handling/
performance, security/robustness) covered `offlog-app/` and
`offlog-desktop/src-tauri/`. Findings fixed: `utils.ts`'s unused
`dueState()`/`DueState` and `types.ts`'s unused `AnyDoc` removed;
`package.json`'s `pouchdb` moved from an unused `dependencies` entry to
`devDependencies` (real UMD-global standin needed by `tests/setup.ts`
under Vitest, never shipped in `dist`) and `@capacitor/cli` moved to
`devDependencies`; new `--toggle-knob` token replacing two hardcoded
`#ffffff` toggle-knob colors (`ListView.svelte`, `SettingsPanel.svelte`);
two drifted `SettingsPanel.svelte` modal-scrim opacities (`.35`, `.4`)
unified to the app's standard `.45`; `CardDetail.svelte`/`QuickAdd.svelte`'s
per-keystroke duplicate-title/similar-notes checks debounced 350ms
(`checkNotesSimilarity` was scanning every task's body app-wide on every
keystroke, unthrottled). Security/robustness checklist (XSS via
`{@html}`, deep-link handling, localStorage contents, Rust `unsafe`
blocks, pairing-code logging, `eval`/`innerHTML`, credential leakage into
errors/logs) came back fully clean, zero findings. Left deliberately
unfixed: `npm audit`'s one bundle-reachable advisory (`pouchdb-find`'s
transitive `uuid <11.1.1`, moderate) has no non-breaking upstream fix
yet — noted to watch, not acted on; `tauri-plugin-updater`'s heavier
dependency subtree (full second HTTP/TLS stack via reqwest/hyper/rustls)
is informational only, the official plugin working as intended. No
RISKY-tier findings; `offlog-desktop` baseline (`cargo build`) confirmed
green but the crate itself wasn't touched this pass. All fixes verified
live via browser preview (toggle-knob token, scrim opacity, Time Travel's
clickable/non-clickable split, debounce timers) in addition to the
build/tsc/test gates.
audit` unchanged from prior passes.
