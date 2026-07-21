# Offlog Roadmap — Archive

Everything shipped, declined, parked, or otherwise no longer "current" —
moved out of [../ROADMAP.md](../ROADMAP.md) during the 2026-07-20 docs
restructuring so the live roadmap only carries what's still ahead. Nothing
here is lost history — full per-release detail lives in
[../CHANGELOG.md](../CHANGELOG.md) / [changelog-archive.md](changelog-archive.md);
this file keeps the *roadmap-shaped* record (item numbers, why something
was parked/declined) so old cross-references (e.g. "see B39") still
resolve to something. Archive weekly, or whenever ROADMAP.md's still-open
section starts accumulating shipped items again — don't let this
restructuring be a one-time event.

---

## Path to v1.0 — the story so far

1. **Track E, the PC app as host — done.** A real PC app that *is* the
   sync host, phones connect over home Wi-Fi with no CouchDB knowledge
   required, working end-to-end and shipped (E1, E2) — installer signing
   deliberately deferred, real annual cost, see E1 below.
2. **Release gate (Track C core) — mostly done.** C7 (credential cleanup,
   including its git-history piece) and C2 (zero-config first-run) are
   both done. C1 (GitHub), C5 (landing page), C3 (Play Store) remain —
   see current ROADMAP.md.
3. **Plain-language pass (Track B/C polish) — mostly done.** B44/C8/C9
   shipped; C10 stays open by design (see current ROADMAP.md).
4. **After the release gate — dogfooding at scale.** Not started as a
   distinct phase yet; folded into ongoing daily use already underway.
5. **After that, there's no further destination.** Offlog stays a personal
   tool shared as open source — not a product growing toward a business.
   Maintenance passes continue; features return only when the owner
   personally wants one. Mesh sync and any form of monetization were both
   considered at length and explicitly declined (2026-07-03) — see
   DECISIONS.md.

A public repo with hardcoded credentials in its history would have
undermined the entire premise — C7 was a real, non-negotiable gate on
step 2, not just narrative flow. Now closed.

---

## Track A — Performance & Stability (shipped items)

### A9. UI component tests — fully shipped 2026-07-21
`tests/db.test.ts`/`modalStack.test.ts`/`sync.test.ts` cover the database
and pure-logic layers; `CardDetail`'s save logic is the first `.svelte`
component covered (`tests/CardDetail.test.ts`). The two remaining pieces
(KanbanBoard's drag math, the Maintenance orchestration) were both hard
to test as-written — not because the logic was untestable, but because
it lived inline inside DOM event handlers / a 1900+-line component.
Extracted into pure functions (`computeDropPosition()`,
`runMaintenanceSteps()`, both in db.ts) instead of attempting a full
jsdom drag simulation or a heavy component mount — see CHANGELOG.md's
v5.7.0 row.

### A10. Large-dataset performance validation — shipped in v4.7.0
### A11. Error-handling audit, pass 2 — shipped in v4.6.0
### A12. Notification reliability audit — shipped in v4.4.0
### A13. Accessibility re-audit for the newer components — shipped in v3.7.0
### A14. Android hardware back-button handling — shipped in v3.7.0
### A15. Widget/back-button regression coverage — shipped in v4.1.0
### A16. Offline-queue robustness for sync — shipped in v4.2.0
### A17. Storage-pressure handling — shipped in v4.3.0
### A18. PWA not force-updating after a new version ships — shipped in v3.8.0
### A19. First launch should always open Dashboard — shipped in v3.8.0
### A20. List view attribute alignment still breaks with mixed deadlines — shipped in v3.8.0
### A21. Visual check: tag overflow past 3 tags — shipped in v3.8.0
### A22. Accidental "mark done" click has no undo — shipped in v3.8.0
### A23. Sidebar scale test with 20+ projects — shipped in v3.9.0
### A24. Version-over-version performance metrics — shipped in v4.7.0
### A25. Quick Add widget opened the app but not Quick Add — shipped in v3.9.8
### A26. PWA staleness / dev workflow — resolved by dropping PWA support entirely in v4.11.1 (see DECISIONS.md)
### A27. Project-view no longer force-resets to Kanban on every refresh — shipped in v3.9.8
### A28. Exact-alarm ("Alarms & reminders") permission has no in-app status/control — shipped in v3.9.8
### A29. "Cannot reach sync server" doesn't say why — shipped in v4.4.1
### A30. Full codebase audit, cleanup, and documentation-flow optimization — shipped in v4.12.0

### A31. Full cross-platform visual/UX review — web/desktop done in v4.12.0/v4.12.1, Android leg still open
Systematic visual pass (desktop light+dark, mobile 375px) over every page
and manager panel, using a realistic seeded dataset
(`offlog-app/scripts/seed-scenario.js`). Still open (see current
ROADMAP.md): Android is entirely unverified.

### A32. Sync reports "synced" when devices aren't actually syncing — shipped pre-v4.18.0
`db.sync()`'s combined object silently swallowed retry errors under
`retry: true`, reporting every retry as a successful sync. Fixed in
`attachSyncHandlers()` (`db.ts`) by listening to `handler.push`/
`handler.pull` directly — covered by `tests/sync.test.ts`.

### A33. Android notifications fire silently, not fully functional — shipped in v4.18.0
### A34. Export JSON doesn't work on Android — shipped in v4.18.0

### A35. Desktop sync defaults to loopback, not a rememberable LAN IP — shipped in v4.18.0
Superseded by Track E (native PC app) as the real permanent fix for LAN-IP
drift — see E1/E2.

---

## Track B — Features (shipped/parked items)

### B1. Space management — shipped in v3.6.0
### B2. Filters on Kanban + saved filters — shipped in v4.11.0
### B3. Notification actions — shipped in v3.7.0
### B4. Import/export v2 — shipped in v4.7.0
### B5. Multi-device polish — shipped in v4.2.0
### B6. Tag management — shipped in v3.6.0
### B7. Calendar / week view for Agenda — shipped in v4.7.0
### B8. Project templates — shipped in v4.14.0
### B9. Command palette — shipped in v4.10.0
### B10. Android quick-capture widget — shipped in v3.7.0
### B11. High contrast mode — shipped in v4.6.0
### B12. Auto-reminder from due date — shipped in v4.4.0
### B13. Sync on/off toggle — shipped in v4.2.0
### B14. Explain the storage quota number — shipped in v4.3.0
### B15. Fold Maintenance into the Settings detail pane — shipped in v4.9.0

### B16. Custom fields — shipped in v4.6.0
Shipped **global** (one shared list across projects, Settings → Organize),
not per-project as originally scoped — owner feedback during
implementation was that per-project fields sprawled unmanageably.

### B17. Dashboard as a real home screen — shipped in v4.10.0
### B18. Subtasks / checklists within a task — shipped in v4.11.0
### B19. Bulk actions in List — shipped in v4.6.0
### B20. Agenda widget — shipped in v4.1.0
### B21. Dark mode follows OS setting — shipped in v4.6.0
### B22. Named clients/devices — shipped in v4.2.0
### B23. Sidebar: last modified cards — shipped in v3.9.0
### B24. Seed data: 3 spaces, not 4 — shipped in v4.15.0
### B25. Deadline quick-suggestions on new card — shipped in v4.0.0
### B26. Tag autocomplete beyond the current project — shipped in v4.0.0
### B27. Archived tasks are too hidden — shipped in v4.9.0

### B28. Rethink "last column = done" — PARKED (2026-07-13)
The positional-done convention (`column_id === columns.at(-1)`) is a
locked invariant (see DECISIONS.md) with no multiple terminal states.
Needs a real design conversation before any implementation. Parked with
the feature-phase wind-down; revisit only if daily dogfooding proves the
current rule actually hurts.

### B29. Show tags on Kanban cards — shipped in v4.15.0
### B30. Notes length guardrail — shipped in v4.14.0
### B31. Third Android widget: project list — shipped in v4.1.0
### B32. Archive a whole project — shipped in v4.9.0

### B33. Sub-projects — PARKED (2026-07-13)
Nested project hierarchy. Touches the data model, every project-picker
UI, and Dashboard/sidebar nesting — exactly the kind of architecture
experiment the stabilization pivot exists to stop. Revisit post-release
only if real daily use demands it.

### B34. Project pinning — shipped in v3.9.0

### B35. Focus view — draft shipped in v4.5.0, fully shipped 2026-07-21
Daily commitment lock: pick up to 3 open tasks/day, ranked pinned >
overdue > due-soon > priority. Lock is `localStorage`-only, clears on day
rollover. Remaining draft items closed out: the global Quick Add FAB
already covered "add a task from Focus" (confirmed present on every
view); a new "Daily Brief" card on Dashboard (reading a new shared
`focusLock.ts` module) covers both the Dashboard/Focus link and the
summary-card ask in one — see CHANGELOG.md's v5.7.0 row.

### B36. List view power customization — shipped in v3.8.5

### B37. Android widgets — collapsed 3 into 1 combined widget — shipped in v4.8.0
Final visual sizing/spacing polish confirmed directly in Android Studio,
owner-verified 2026-07-21 — fully closed.

### B38. Custom calendar/date picker instead of the native one — shipped in v4.6.5

### B39. Renaming a device (B22) leaves a stale "dead" entry — shipped in v4.23.0
Added a stable per-install id (`getDeviceId()`, `config.ts`) stamped as a
new `source_id` field on every log doc alongside the existing `source`
display name. `getDeviceLastSeen()` groups by `source_id`, falling back
to the literal `source` string for log entries written before this field
existed — additive-only, no migration needed.

### B40. Sidebar bottom icon rail isn't readable — shipped in v4.8.0
### B41. Focus view — full-space floating-card redesign — shipped in v4.8.0
### B42. Agenda doesn't use full screen width — shipped in v4.8.0
### B43. Human-friendly sync settings + Developer options — shipped in v4.16.0
### B44. Storage & quota copy, plain-language rewrite — shipped in v4.16.0
### B45. Export/import UX redesign — shipped in v4.20.0
### B46. First-run: ask for a device/user name — shipped in v4.20.0

### B47. Week start day setting — shipped in v4.22.0
Settings → Appearance toggle (Sunday/Monday). Timezone half of the
original scope deliberately not built: the app uses device-local time
throughout with no UTC conversion layer, which is correct for a
single-device-local personal task manager (see DECISIONS.md) — revisit
only if that changes.

### B48. Android widget: flatter, 2-color light/dark, no border highlight — shipped in v4.23.0
Dropped `widget_background.xml`'s 1dp border stroke, and split
`colorWidget*` into a light default (`values/colors.xml`) and a dark
override (`values-night/colors.xml`) so the widget follows the OS's own
light/dark setting instead of being hardcoded dark.

### B49. Card Detail redesign — shipped in v4.21.0
Mockup-validated over 4 iterations (see DECISIONS.md's List/Table merge
precedent for why). Due date + Reminder collapsed into one "Schedule"
row; Checklist/Custom fields/Notes restyled as consistent card-rows;
Delete/Archive/Duplicate/history consolidated into one "⋯" menu.

### B50. Custom time picker (extend B38 to reminder times) — shipped in v4.23.0
### B51. Consistent animations everywhere — shipped in v4.22.0

### B52. QR pairing — DEFERRED (owner-directed, 2026-07-13)
Would have been throwaway work once Track E (native PC app) exists,
since that app generates/serves pairing info itself. Moot now that
E1/E2 are shipped.

### B53. Kanban card quick-actions menu — shipped in v4.21.0

### B54. App lock (PIN + biometric) — shipped 2026-07-19; biometric added 2026-07-20
PIN lock: `config.ts` stores a salted-hash PIN per device, `AppLock.svelte`
gates the whole app behind it. Locks on cold launch plus after an
idle/backgrounded timeout (1/5/15/30 min, Settings → App Lock). UI gate
only, not data encryption — see DECISIONS.md. "Forgot PIN" is a one-time
recovery code shown once at PIN setup, salted-hash stored like the PIN
itself — see DECISIONS.md for the full reasoning behind why a plain
confirm-and-clear button was rejected. Biometric unlock (fingerprint/
face) sits alongside the PIN, opt-in, Android only, via
`capacitor-native-biometric` — see DECISIONS.md.

### B55. Privacy Screen — hide app content in the recent-apps switcher — shipped 2026-07-20
`@capacitor/privacy-screen`, called at launch and on every PIN/toggle
change. A separate, explicit, OFF-by-default toggle (Settings → App Lock
→ Privacy screen) since Android's FLAG_SECURE blocks all screenshots
while foregrounded, not just the recents-switcher snapshot.

### B56. Clipboard — one-tap copy on the recovery code — shipped 2026-07-20
### B57. App Launcher — deep-link to biometric enrollment — shipped 2026-07-20, on-device confirmation still pending
### B58. Haptics — tactile feedback on checkbox/drag — shipped 2026-07-20

---

## Track C — Public Release & Open Source (closed items)

### C7. Fix hardcoded CouchDB credentials — fully closed, shipped 2026-07-17
`offlog-app/src/config.ts` used to hardcode a real CouchDB password as a
fallback default; `DEFAULT_COUCH_USER`/`DEFAULT_COUCH_PASS` now fall back
to `''` (fixed 2026-07-14). The git-history piece — the old password (and
a second username+password pair that had separately leaked into a
committed `.claude/settings.local.json`) — was purged from every one of
the repo's 127 commits and 71 tags using BFG Repo-Cleaner, then verified
by exhaustively scanning every remaining git object for both strings
(zero hits). Full record in DECISIONS.md.

### C2. Zero-config first run, verified — audit complete as of v4.24.0
v4.19.0 fixed Android's first-run "not connected" message to point at
"Find my computer" instead of "Developer options." v4.24.0's audit
walked every screen a genuine fresh install would actually see: found
and fixed two real gaps, `DashboardView.svelte`'s project grid and
`KanbanBoard.svelte`'s board both had no empty-state message at all.
Everything else audited (Agenda, Focus, List, Trash, Changelog, tag/
custom-field/archived-project managers) already had reasonable copy.

### C4. F-Droid listing — declined
Considered and explicitly declined by the owner (2026-07-02): distribution
stays to GitHub + a website + Google Play; no iOS. See DECISIONS.md.

### C8. New app icon, all platforms — shipped in v4.17.0
### C9. Typography: ≤3 font families, self-hosted — shipped in v4.17.0

---

## Track D — Mesh Sync — declined (2026-07-03)

Considered at length (device-mesh sync, no central server) and explicitly
declined. Full reasoning in DECISIONS.md — technical (Android background-
service limits, no relay for devices never on the same network) and
strategic (engineering cost not worth it for a single-user project).
CouchDB sync remains the permanent, only sync transport.

---

## Track E — PC standalone app as sync host (shipped items)

### E1. PC app + embedded sync host — shipped in v4.19.0
`offlog-desktop/` (Tauri — see DECISIONS.md for why Tauri over
alternatives) wraps `offlog-app/dist` and embeds a CouchDB sidecar
(`src-tauri/src/sync_host.rs`) that self-configures port/credentials on
first launch, is hardened with a Windows Job Object so the process tree
dies with the app on any exit path, advertises itself over mDNS
(`src-tauri/src/discovery.rs`), and pairs phones via a single-use
expiring-code handshake (`src-tauri/src/pairing.rs` +
`offlog-app/src/lib/discovery.ts`). Ships as a real NSIS installer.
Verified end-to-end on real hardware: installed app, real Android phone
paired over mDNS, two-way sync with zero manual configuration.

Installer signing deliberately deferred (owner decision, 2026-07-14) — a
code-signing certificate is a real annual cost ($70-600/yr) and isn't
required for Track E to be functionally done. Shipping unsigned — Windows
shows the standard SmartScreen prompt. Revisit post-release only if it
becomes real friction for actual users. The desktop-web loopback fallback
(A35) stays as-is for the plain browser build.

### E2. Re-resolve the PC host after pairing, not just at pairing time — shipped in v4.22.1/v4.22.2
`discovery.ts`'s `pairWithHost()` wrote a fixed LAN IP into `setSyncUrl()`
at pairing time and never revisited it, so a DHCP lease change silently
broke sync. Fixed: the CouchDB server's own `uuid` (already in the mDNS
TXT record) is persisted as a stable identity; `watchForStaleHost()`
(`discovery.ts`, wired at `store.ts`'s `init()`) re-scans on sync failure
and silently updates the stored URL. Throttled to once per 5 minutes.
Android-only — the PC side is always the fixed sync target.

Two related root causes fixed in the same session: a dev/prod Tauri
identity collision (`app_data_dir()` didn't depend on `debug_assertions`,
so `cargo tauri dev` and a real install shared `sync-host.json` — debug
builds now get `sync-host.dev.json` and their own isolated CouchDB copy),
and an Android debug/release storage collision (both installed with the
same `applicationId` and overwrote each other's storage — debug builds
now get `applicationIdSuffix ".debug"`).

---

## Old sequencing table (v4.19.0 → v5.4.0)

| # | Release | Notes |
|---|---|---|
| — | v4.19.0 → v4.22.2 | Track E (E1, E2) landed and verified end-to-end; A32 was actually fixed pre-v4.18.0. |
| — | v4.23.0 ✓ | B39 (stable per-install device id), B50 (custom TimePicker), B48 (Android widget follows system light/dark). |
| — | v4.24.0 ✓ | C2 (zero-config first-run audit complete), C10 (plain-language pass on Restore/crash-recovery/pairing/sync copy). |
| — | v4.25.0 ✓ | First real desktop dogfooding round — long list of real bugs fixed, E3 (updater) scaffolded but blocked on C1, a full security audit, ~64MB trimmed off bundled CouchDB. |
| — | v4.26.0 → v4.28.0 ✓ | Settings full redesign, mobile info-loss/header fixes, Android widget polish, modalStack.ts double-close bug, seedIfEmpty() hardening. C7 fully closed (2026-07-17). |
| — | v4.29.0 → v5.0.0 ✓ | Time Travel, NLP Quick Add, recurring tasks, font consolidation (Hanken Grotesk only), App Lock (PIN). |
| — | v5.2.0 → v5.4.5 ✓ | Privacy Screen, Clipboard, App Launcher, Haptics, biometric unlock, Android cleanup, widget/overlay bug-fix batches from live-device testing rounds. |
| — | (parked) | B28, B33 — rethinking positional-done and sub-projects; revisit post-release only if daily use demands it. |
