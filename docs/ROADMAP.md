# Offlog Roadmap

Current version: **v4.28.0**. Everything below is a candidate, not a
commitment. Items are ordered roughly by value-for-effort within each
track. Before starting any item, re-check it against the current code —
this document describes intent, not state.

**Shipped work lives in [CHANGELOG.md](CHANGELOG.md)/
[CHANGELOG-ARCHIVE.md](CHANGELOG-ARCHIVE.md), not here.** This file keeps
only: open (unshipped) items with full detail, a one-line pointer for
shipped items (so old item numbers/cross-references still resolve to
something), and the forward-looking sequencing plan. For *why* a
non-obvious choice was made, see [DECISIONS.md](DECISIONS.md); for open
questions worth outside input, [QUESTIONS.md](QUESTIONS.md); for how the
app works today, [TECH.md](TECH.md).

## Mission

Offlog is free, open-source, and local-first — no account, no telemetry, no
subscription, ever. It's a personal tool: built by one person for their own
use, and given away as-is for anyone else who wants the same thing. There is
no business model and none is planned. The goal on this roadmap is making it
something a non-technical person can actually find and install without
knowing what "self-host CouchDB" means: an official listing (Play Store), a
public GitHub repo, a real license — not growing it into a product. Offlog
is not trying to out-feature Trello, Notion, ClickUp, or Jira, or Obsidian —
it isn't competing with them. Every roadmap item should be judged against
one question: does it make Offlog nicer for its owner to use, or does it
just make it bigger?

---

## Path to v1.0 — the whole story, even the parts that aren't realistic yet

This section exists so the destination is never buried under backlog
detail. It's a narrative, not a schedule.

1. **Track E, the PC app as host — done.** GOAL.md's full vision (a real
   PC app that *is* the sync host, phones connect over home Wi-Fi with no
   CouchDB knowledge required) is working end-to-end and shipped (E1, E2)
   — installer signing deliberately deferred, real annual cost, see E1.
2. **Now — the release gate (Track C core).** C7 (credential cleanup,
   including its git-history piece) and C2 (zero-config first-run) are
   both done — next up is C1 GitHub, C5 landing page, C3 Play Store. This
   is the externally-visible "we made it" milestone.
3. **In parallel wherever it doesn't compete with the release gate — make
   it speak human (Tracks B/C polish items).** A plain-language pass over
   every remaining string and document (C10) is the only piece still open
   here; B44/C8/C9 already shipped.
4. **After the release gate — dogfooding at scale.** The owner using
   Offlog daily, across both a real PC install and Android, is the
   honest stability test no audit can substitute for. Bugs and friction
   found in real use outrank everything in the backlog.
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

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.
Shipped items: one-line pointer only — full detail in CHANGELOG.md.

### A9. UI component tests — first slice shipped in v4.15.0, still growing
`tests/db.test.ts`/`modalStack.test.ts`/`sync.test.ts` cover the database
and pure-logic layers; `CardDetail`'s save logic is the first `.svelte`
component covered (`tests/CardDetail.test.ts`). **Still open**:
`KanbanBoard`'s drag/drop position math (hard to simulate reliably in
jsdom) and `Sidebar`'s Maintenance step orchestration — not scheduled to
a specific version.

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
(`offlog-app/scripts/seed-scenario.js`). **Still open: Android is
entirely unverified** — needs an owner Studio check, per CLAUDE.md's
Android-build rule (the assistant never runs Gradle).

### A32. Sync reports "synced" when devices aren't actually syncing — shipped pre-v4.18.0
`db.sync()`'s combined object silently swallowed retry errors under
`retry: true`, reporting every retry as a successful sync. Fixed in
`attachSyncHandlers()` (`db.ts`) by listening to `handler.push`/
`handler.pull` directly — covered by `tests/sync.test.ts`. This entry was
left marked OPEN long after the fix shipped; corrected 2026-07-15.

### A33. Android notifications fire silently, not fully functional — shipped in v4.18.0
### A34. Export JSON doesn't work on Android — shipped in v4.18.0
### A35. Desktop sync defaults to loopback, not a rememberable LAN IP — shipped in v4.18.0
Superseded by Track E (native PC app) as the real permanent fix for LAN-IP
drift — see E1/E2.

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).
Shipped items: one-line pointer only — full detail in CHANGELOG.md.

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

### B35. Focus view — draft shipped in v4.5.0, still open
Daily commitment lock: pick up to 3 open tasks/day, ranked pinned >
overdue > due-soon > priority. Lock is `localStorage`-only, clears on day
rollover. **Still explicitly a draft**, confirmed next steps not yet
built: add-task entry point within Focus, a Dashboard/Focus link, and a
"Daily Brief" summary card — none scoped in detail yet.

### B36. List view power customization — shipped in v3.8.5

### B37. Android widgets — collapsed 3 into 1 combined widget — shipped in v4.8.0
**Final visual sizing/spacing remains an open, owner-driven polish
pass** — pick up whenever convenient directly in Android Studio.

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
Settings → Appearance toggle (Sunday/Monday). **Timezone half of the
original scope deliberately not built**: the app uses device-local time
throughout with no UTC conversion layer, which is correct for a
single-device-local personal task manager (see DECISIONS.md) — revisit
only if that changes.

### B48. Android widget: flatter, 2-color light/dark, no border highlight — shipped in v4.23.0
Dropped `widget_background.xml`'s 1dp border stroke, and split
`colorWidget*` into a light default (`values/colors.xml`) and a dark
override (`values-night/colors.xml`) so the widget follows the OS's own
light/dark setting instead of being hardcoded dark — no `values-night/`
directory existed before this. Final visual result still needs an owner
Studio build to confirm on a real device; the widget-picker preview
"abnormal" rendering question was not investigated (likely an Android OS
preview quirk, not a code bug).

### B49. Card Detail redesign — shipped in v4.21.0
Mockup-validated over 4 iterations (see DECISIONS.md's List/Table merge
precedent for why). Due date + Reminder collapsed into one "Schedule"
row; Checklist/Custom fields/Notes restyled as consistent card-rows;
Delete/Archive/Duplicate/history consolidated into one "⋯" menu.

### B50. Custom time picker (extend B38 to reminder times) — shipped in v4.23.0
New `TimePicker.svelte` — two `CustomSelect.svelte` dropdowns (hour,
5-minute increments) — replaces the native `<input type="time">` in both
`CalendarPicker.svelte`'s time row and the Notifications default-
reminder-time field.

### B51. Consistent animations everywhere — shipped in v4.22.0
New `src/lib/motion.ts` (shared transition constants/custom functions)
applied across every panel/dialog/popover/toast/card/column that
previously snapped shut instantly or had no transition at all.
Deliberately not done: a Kanban↔List view crossfade (layout-regression
risk for low value).

### B52. QR pairing — DEFERRED (owner-directed, 2026-07-13)
Would have been throwaway work once Track E (native PC app) exists,
since that app generates/serves pairing info itself. Revisit only if
Track E's timeline had slipped badly — moot now that E1/E2 are shipped.

### B53. Kanban card quick-actions menu — shipped in v4.21.0

### B54. App lock (PIN) — shipped 2026-07-19; biometric unlock — NOT YET BUILT
PIN lock is done and fully verified (browser-testable, no platform
dependency): `config.ts` stores a salted-hash PIN per device, `AppLock.svelte`
gates the whole app behind it (`App.svelte`'s `inert` wrapper — not just
z-index — blocks Tab/screen-reader access to the app underneath, not only
the visual). Locks on cold launch plus after an idle/backgrounded timeout
(1/5/15/30 min, Settings → App Lock). UI gate only, not data encryption —
see DECISIONS.md.

Biometric (fingerprint/face) unlock is the deliberately-deferred second
half: no Capacitor plugin is wired in yet. There's no Ionic-official
biometric plugin (unlike `@capacitor/local-notifications` etc., all
already used elsewhere per DECISIONS.md's A25 preference for official
plugins) — picking a community one needs a real on-device Android Studio
test before it ships, which isn't possible from this environment. Do not
half-wire a disabled toggle for it in Settings in the meantime (CLAUDE.md:
no half-finished implementations) — build it as a real, working feature
in one pass once someone can test on an actual device.

---

## Track C — Public Release & Open Source

Goal: the mission above, made concrete. Unlike Track A/B, these aren't
paired into a version bump each — they're mostly one-time setup work, and
several can start independently of whatever A/B release is in flight.

### C1. Open-source the repository on GitHub — unblocked, not yet started
Push the existing local repo public: pick a license (leaning MIT), add
`LICENSE`, a `CONTRIBUTING.md`, issue templates, and a README written for
someone who has never seen this project before. Audit for anything that
assumes a local-only environment before it goes public. **C7 (credential
cleanup) is done** — this can start whenever the owner wants; still worth
a final security-audit pass first, see DECISIONS.md.

### C2. Zero-config first run, verified — audit complete as of v4.24.0
v4.19.0 fixed Android's first-run "not connected" message to point at
"Find my computer" instead of "Developer options." v4.24.0's audit
walked every screen a genuine fresh install (0 spaces/projects/tasks —
verified by clearing both PouchDB and localStorage, not just PouchDB,
since `SEEDED_KEY` gates the real auto-seed) would actually see: found
and fixed two real gaps, `DashboardView.svelte`'s project grid and
`KanbanBoard.svelte`'s board both had no empty-state message at all.
Everything else audited (Agenda, Focus, List, Trash, Changelog, tag/
custom-field/archived-project managers) already had reasonable copy.
Not "reopen if something new is added" — a genuinely fresh install now
has a plain-language message everywhere it can go.

### C3. Play Store listing
A signed release build (proper keystore), a Play Console developer
account, and store listing assets — icon, screenshots, descriptions, and a
privacy policy page. Copy should frame Offlog as a calm personal tool, not
pitch it against Trello/Notion/ClickUp/Jira by feature count.

### C4. F-Droid listing — declined
Considered and explicitly declined by the owner (2026-07-02): distribution
stays to GitHub + a website + Google Play; no iOS. See DECISIONS.md.

### C5. Public web landing page
A small, plain landing page (GitHub Pages is enough) linking to the web
app (browser-only, no install step now that PWA support was dropped) and
the Android APK download.

### C6. Brand & positioning pass
A short pass over every public-facing document — README, store copy,
landing page copy — to make sure the "not competing, just likable" framing
from the Mission above comes through, written for humans discovering the
project.

### C7. Fix hardcoded CouchDB credentials — fully closed, shipped 2026-07-17
`offlog-app/src/config.ts` used to hardcode a real CouchDB password as a
fallback default; `DEFAULT_COUCH_USER`/`DEFAULT_COUCH_PASS` now fall back
to `''` (fixed 2026-07-14). The git-history piece was the remaining
blocker on C1: the old password (and, found in the same pass, a second
username+password pair that had separately leaked into a committed
`.claude/settings.local.json`) was purged from every one of the repo's
127 commits and 71 tags using BFG Repo-Cleaner, then verified by
exhaustively scanning every remaining git object for both strings
(zero hits). Full record in DECISIONS.md. **C7 no longer blocks C1.**

### C8. New app icon, all platforms — shipped in v4.17.0
### C9. Typography: ≤3 font families, self-hosted — shipped in v4.17.0

### C10. Plain-language pass: every string, every document — PARTIAL SWEEP DONE, still open by design
The sibling of C6 (which covers public-facing *branding* copy): go through
every in-app string and every user-facing document and rewrite anything a
non-technical person would stumble on. v4.19.0's pass covered error
messages, empty states, and Maintenance/Data tab copy. v4.24.0's pass
covered the Restore section's "Import JSON" button and jargon hint text,
the crash-recovery screen's phrasing (raw error now labeled "Details:"
rather than leading with it), an awkward pairing-code sentence, and
desktop-web's Developer-options sync copy — all outside the deliberately-
technical Developer options block, per B43. README.md was checked and
deliberately left as developer-register copy (correct for its GitHub
audience, distinct from in-app copy — see C6 if that also needs a pass).
This item stays open by nature — pick up opportunistically as new strings
get added, not a one-time sweep to close out.

---

## Track D — Mesh Sync — declined (2026-07-03)

Considered at length (device-mesh sync, no central server) and explicitly
declined. Full reasoning in DECISIONS.md — technical (Android background-
service limits, no relay for devices never on the same network) and
strategic (engineering cost not worth it for a single-user project).
**CouchDB sync remains the permanent, only sync transport.**

---

## Track E — PC standalone app as sync host (from GOAL.md, added 2026-07-13)

GOAL.md describes "install the PC app from a website … the PC acts as the
host and they sync automatically over home Wi-Fi." Distinct from declined
Track D: this is still CouchDB-protocol replication with one fixed host —
the PC — not a mesh; the innovation is packaging, not a new sync
transport.

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
paired over mDNS, two-way sync with zero manual configuration. Full list
of real bugs found and fixed during this work lives in git history at
each fix site (`sync_host.rs`, `lib.rs`, `pairing.rs`, `db.ts`,
`config.ts`), not repeated here.

**Installer signing — deliberately deferred (owner decision,
2026-07-14), not blocking.** A code-signing certificate is a real annual
cost ($70-600/yr) and isn't required for Track E to be functionally done.
Shipping unsigned — Windows shows the standard SmartScreen prompt.
Revisit post-release only if it becomes real friction for actual users.

The desktop-web loopback fallback (A35) stays as-is for the plain
browser build — not removed.

### E2. Re-resolve the PC host after pairing, not just at pairing time — shipped in v4.22.1/v4.22.2
`discovery.ts`'s `pairWithHost()` wrote a fixed LAN IP into `setSyncUrl()`
at pairing time and never revisited it, so a DHCP lease change silently
broke sync. Fixed: the CouchDB server's own `uuid` (already in the mDNS
TXT record) is persisted as a stable identity; `watchForStaleHost()`
(`discovery.ts`, wired at `store.ts`'s `init()`) re-scans on sync failure
and silently updates the stored URL. Throttled to once per 5 minutes.
Android-only — the PC side is always the fixed sync target.

Two related root causes fixed in the same session: a **dev/prod Tauri
identity collision** (`app_data_dir()` didn't depend on
`debug_assertions`, so `cargo tauri dev` and a real install shared
`sync-host.json` — debug builds now get `sync-host.dev.json` and their
own isolated CouchDB copy under `target/debug/couchdb-dev`), and an
**Android debug/release storage collision** (both installed with the same
`applicationId` and overwrote each other's storage — debug builds now get
`applicationIdSuffix ".debug"`).

### E3. Desktop auto-updater — scaffolded, blocked on C1 (owner request, 2026-07-16)
`tauri-plugin-updater`/`tauri-plugin-process` are registered
(`src-tauri/src/lib.rs`) and a "Check for updates" control exists in
Settings → Maintenance (desktop-only), but `tauri.conf.json` deliberately
has no `plugins.updater` block yet — the plugin needs a real hosted
update manifest (GitHub Releases, once C1 makes the repo public) and a
pubkey from the owner's own `cargo tauri signer generate` (the private
key is password-protected; that password is the owner's to choose and
hold, not something this assistant generates or stores). Until that
config exists, checking for an update fails cleanly with a "couldn't
check right now" message — harmless, not reachable by a real user since
there's no public release to update from yet. Revisit at C1 time: add
the config block, wire a release pipeline that signs and publishes
`latest.json` + the installer.

---

## Business model — none, deliberately

Offlog has no business model and isn't getting one. Never paywalled, never
feature-gated, never ad-supported, never sells data. GitHub Sponsors / a
donation link is fine to add once public, but it's not a plan or a goal.
The Play Store listing stays free, no in-app purchase, ever. See
DECISIONS.md for the reasoning behind dropping the hosted-sync-relay idea
that used to live in this section.

---

## Open questions

Anything genuinely unresolved lives in [QUESTIONS.md](QUESTIONS.md), not
scattered inline here.

---

## Sequencing suggestion

**Maintenance passes run every 3 releases** — tracked in
[MAINTENANCE.md](../MAINTENANCE.md), not restated here. Track C runs
independently of version numbers: **C7 and C2 are both done**;
**C1/C3/C5/C6 fit naturally once the app feels "finished enough."**
Track D was declined outright and never entered sequencing.
Full shipped-release history lives in [CHANGELOG.md](CHANGELOG.md) /
[CHANGELOG-ARCHIVE.md](CHANGELOG-ARCHIVE.md) — this table only shows
what's still ahead or otherwise worth a pointer.

| # | Release | Notes |
|---|---|---|
| — | v4.19.0 → v4.22.2 | All shipped — see CHANGELOG.md for the per-release list. Track E (E1, E2) landed and is verified end-to-end; A32 was actually fixed pre-v4.18.0 (roadmap entry corrected 2026-07-15, was stale). |
| — | v4.23.0 ✓ | Shipped — B39 (stable per-install device id, fixes stale entries after a rename), B50 (custom `TimePicker.svelte` replacing native time inputs), B48 (Android widget follows system light/dark, flatter — needs an owner Studio check to confirm visually). |
| — | v4.24.0 ✓ | Shipped — C2 (zero-config first-run audit complete: fixed 2 real empty-state gaps in Dashboard/Kanban), C10 (plain-language pass on Restore/crash-recovery/pairing/sync copy — stays open by nature, not a one-time close-out). |
| — | v4.25.0 ✓ | Shipped — first real desktop dogfooding round. A long list of real bugs found and fixed (startup console window, blank-window delay, reinstall data corruption, notification scheduling/click-routing/permission-reporting, backup's broken save flow), E3 (updater) scaffolded but blocked on C1, a full security audit (one real fix — pairing brute-force lockout), and ~64MB trimmed off the bundled CouchDB. See CHANGELOG.md for the full breakdown — too much for one line here. |
| — | v4.26.0 → v4.28.0 ✓ | Shipped — Settings full redesign, mobile info-loss/header fixes, Android widget polish, a real modalStack.ts double-close bug, seedIfEmpty() hardening. **C7 fully closed** (2026-07-17): both the source-level fix and the git-history purge (BFG Repo-Cleaner, 127 commits/71 tags, verified) — see CHANGELOG.md for the per-release list. |
| — | (unversioned) | The release gate, remaining in dependency order: C1 (GitHub) → C5 (landing page) → C3 (Play Store), with C6 (branding pass) alongside the public-facing assets. C7 and C2 are both done. Not version-numbered work — mostly setup/audit outside the app. |
| — | (parked) | B28, B33 — rethinking positional-done and sub-projects; revisit post-release only if daily use demands it. |
| — | (open, unscoped) | B35's remaining draft items (Focus add-task, Dashboard link, Daily Brief); C2/C10 full sweeps; A9/A31's Android-only remainders. |

Within each release: land any Track A item first (or in the same PR as the
Track B item it protects/enables), then the Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land. Re-evaluate
this table after each release.
