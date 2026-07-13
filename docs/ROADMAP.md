# Offlog Roadmap

Current version: **v4.15.1**. Everything below is a candidate, not a
commitment. Items are ordered roughly by value-for-effort within each
track. Before starting any item, re-check it against the current code —
this document describes intent, not state.

**Shipped work lives in [CHANGELOG.md](CHANGELOG.md), not here.** This
file keeps only: open (unshipped) items with full detail, a one-line
pointer for shipped items (so old item numbers/cross-references still
resolve to something), and the forward-looking sequencing plan. For *why*
a non-obvious choice was made, see [DECISIONS.md](DECISIONS.md); for open
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
detail. It's a narrative, not a schedule. **Rewritten 2026-07-13 after an
owner direction-setting session**: the feature-building phase is declared
over — "enough experimenting and making only new features." The backlog's
big remaining architecture experiments (B33 sub-projects, B28 rethinking
positional-done) are parked, not scheduled. From here the work is
stabilization, human-friendliness, and shipping — see GOAL.md for what
"shipped" means.

1. **Now — dogfooding.** The owner starts using Offlog daily as his real
   task manager (it was always built for that — GOAL.md). Bugs and
   friction found in real use outrank everything in the backlog. This is
   also the honest stability test no audit can substitute for.
2. **Now, in parallel — make it speak human (Tracks B/C polish items).**
   Sync settings that don't require knowing what CouchDB is (B43), storage
   copy a non-technical person understands (B44), a proper icon (C8),
   self-hosted fonts (C9), and a plain-language pass over every string and
   document (C10). None of these are features; all of them are the gap
   between "works for its developer" and "works for a person."
3. **Then — the release gate (Track C core).** C7 credential fix
   (mandatory, blocks everything public), C2 zero-config first-run
   verification, then C1 GitHub, C5 landing page, C3 Play Store. This is
   the externally-visible "we made it" milestone.
4. **Then — the PC app as host (Track E).** GOAL.md's full vision: install
   a real PC app from the website, and it *is* the sync host — phones
   connect to it over home Wi-Fi with no CouchDB knowledge required. The
   single biggest remaining engineering item, deliberately after going
   public rather than blocking it (browser + Android + self-hosted CouchDB
   is a complete, honest offering for a v1).
5. **After that, there's no further destination.** Offlog stays a personal
   tool shared as open source — not a product growing toward a business.
   Maintenance passes continue; features return only when the owner
   personally wants one. Mesh sync and any form of monetization were both
   considered at length and explicitly declined (2026-07-03) — see
   DECISIONS.md.

Nothing above skips a step. A public repo with hardcoded credentials in its
history would undermine the entire premise — so the ordering here is a
real constraint, not just narrative flow.

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.
Shipped items: one-line pointer only — full detail in CHANGELOG.md.

### A9. UI component tests — FIRST SLICE SHIPPED in v4.15.0
`tests/db.test.ts`/`modalStack.test.ts`/`sync.test.ts` cover the database
and pure-logic layers only — every `.svelte` component had zero automated
coverage before this, caught only by manual browser verification.
`@testing-library/svelte` added; `CardDetail`'s save logic is the first
component covered (`tests/CardDetail.test.ts`, 5 tests) — the highest-risk
of the three originally-named targets since it's the one everyday-use path
where a save silently writing the wrong thing would be easy to miss.
Needed a real Vitest config fix to work at all: `resolve: { conditions:
['browser'] }` in `vitest.config.ts`, without which Svelte resolved to its
SSR build even under jsdom and any `onMount`/`onDestroy` component failed
outright — nothing had exercised that path before this.

**Still open**: `KanbanBoard`'s drag/drop position math (real HTML5 drag
events are notoriously hard to simulate reliably in jsdom — may need a
different testing approach, e.g. testing the position-calculation logic
in isolation rather than through simulated drag events) and `Sidebar`'s
Maintenance step orchestration (large dependency surface — depends on
`checkIntegrity`/`repairDatabase`/`pruneOldLogs`/sync state/storage
breakdown). Not re-scheduled to a specific version; same track as A9's
original scope.

### A10. Large-dataset performance validation — shipped in v4.7.0
Validated via A24's new benchmark harness (`npm run bench`) at 3,000 tasks
across 8 projects: `getDashboardData()` and `searchAllTasks()` stay
sub-millisecond (in-memory cache), `getTasksForProject()` (the one path
that queries PouchDB's Mango index directly, uncached) sits around 10ms —
no perf cliff found at this scale. Actual Svelte component render time
(Kanban/List) isn't measured — that needs A9's still-open component test
infrastructure first.

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
New `tests/perf.bench.ts` + `npm run bench` (Vitest's native `bench`,
separate from `npm test` — benchmarks are slow and not pass/fail). Times
`getDashboardData()`, `getTasksForProject()`, and `searchAllTasks()` at a
3,000-task stress scale. No hardcoded thresholds (absolute timings depend
on the machine); compare the printed numbers release to release.

### A25. Quick Add widget opened the app but not Quick Add — shipped in v3.9.8

### A26. PWA staleness / dev workflow needs a decision — resolved by removal in v4.11.1
The recurring staleness problem (a stale icon/design persisting after an
update, even after A18's forced `registration.update()` call) is moot: PWA
support was dropped outright rather than patched further (owner decision,
2026-07-12) — web is browser-only now, no installability/service worker.
See DECISIONS.md.

### A27. Project-view no longer force-resets to Kanban on every refresh — shipped in v3.9.8

### A28. Exact-alarm ("Alarms & reminders") permission has no in-app status/control — shipped in v3.9.8

### A29. "Cannot reach sync server" doesn't say why — shipped in v4.4.1

### A30. Full codebase audit, cleanup, and documentation-flow optimization — shipped in v4.12.0
Owner-directed pivot (2026-07-12). **Code side**: dead code — none found.
Duplicated logic fixed: `fmtLastSynced`/`fmtFullTimestamp` were byte-
identical across Sidebar/SettingsPanel and CardDetail/TaskHistoryPanel —
consolidated into `utils.ts`; `TrashView.svelte` reimplemented `timeAgo()`
instead of importing the existing export — fixed. A real bug was caught
and fixed: `CardDetail`'s collapsible-section state (`showChecklist`/
`showNotes`/`showCustomFieldsSection`) was plain `let`, not reset per
task — every call site now wraps `<CardDetail>` in `{#key task._id}` to
force a remount instead of risking stale collapse state carrying over.
Also fixed: `CustomSelect.svelte` didn't move focus into its popover on
mouse-click open, so arrow keys did nothing until manually tabbed in.
`ListView.svelte`/`SettingsPanel.svelte` remain oversized (875/896 lines)
— splitting them turned out to need a shared-style-layer decision first
(their categories/sections all lean on ~150 lines of CSS classes defined
once in the parent; extracting now would mean duplicating that CSS into
every new file, the opposite of this release's goal) — deferred, not
done. `npm audit`'s `uuid` advisory confirmed genuinely reachable
(`pouchdb-find` is actually bundled, unlike core `pouchdb` which is
UMD-only) but still not worth a breaking pouchdb downgrade. **Docs side**:
ROADMAP.md's own "shipped items get a one-line pointer, full detail in
CHANGELOG.md" rule was being ignored by ~15 items carrying full paragraphs
duplicating CHANGELOG.md nearly verbatim — trimmed, cutting this file from
607 to well under 500 lines. CLAUDE.md's doc-list synced to mention
MAINTENANCE.md/CHANGELOG-ARCHIVE.md. CLAUDE.md itself checked for PWA-
removal staleness — already clean, no gaps found.

### A31. Full cross-platform visual/UX review — DONE except Android (v4.12.1 + since)
Owner-directed (2026-07-12): a systematic visual pass over every page and
action (Dashboard, Kanban, List, Focus, Agenda, Settings, CardDetail, all
manager panels), not a spot-check — using the browser preview tools at
desktop + mobile widths, light + dark mode, screenshotting each and
reporting concrete issues plus suggested fixes toward "organic, readable,
understandable, compact, focused" design. Explicitly cross-platform:
findings need to hold up consistently across web and the Android build,
not just the desktop browser.

**Web coverage is now complete.** Desktop light-mode pass over Dashboard/
Kanban/List/CardDetail/Agenda(List+Week)/Focus/Settings(all 6 tabs)/
Search/Command Palette/Changelog/Trash/Space-Tag-CustomField managers/
List bulk-select/FilterBar popover/ConfirmDialog (danger variant), plus a
mobile (375px) pass and a dark-mode pass (the manager-panel/bulk-
select/FilterBar/ConfirmDialog round was screenshotted entirely in dark
mode). Testing used a realistic seeded dataset (10 projects with mixed
default and custom column sets, 100+ tasks) via `offlog-app/scripts/
seed-scenario.js` rather than a handful of sparse dummy rows.

Real bugs found and fixed along the way: a WCAG contrast failure
(`--faint`/`--accent`, new `--on-accent` token added, 17 call sites), a
duplicated `ACTION_COLOR` map consolidated, scroll-shadow affordances
added to 3 overflowing containers, Dashboard's project grid overflowing
at mobile widths (root cause: a bare `1fr` grid track's implicit `auto`
min-size doesn't clamp to its container — needed `minmax(0, 1fr)`), and
Focus view's fixed FAB overlapping its own Commit button footer at mobile
widths. The `.ok-btn.danger` confirm-dialog button was independently
verified correct (dark text via `--on-accent`, 6.29:1 contrast) — no
further issues found in the manager-panel/bulk-select/FilterBar/
ConfirmDialog round.

**Still open: Android is entirely unverified** — no `cap sync`, no
on-device/Studio check; this needs the owner directly, per CLAUDE.md's
Android-build rule (the assistant never runs Gradle). Everything else in
this item's original scope has been covered — closing web/desktop/mobile
coverage out, leaving only the Android leg open, picked up whenever the
owner runs a Studio check.

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
Shipped with one change from the original scope: fields are **global**
(one shared list across every project, managed from Settings → Organize →
Manage Custom Fields), not per-project on `ProjectDoc` — owner feedback
during implementation was that per-project definitions plus inline
add/remove in `CardDetail` made it too easy to end up with an unmanaged
sprawl of one-off fields. `TaskDoc.custom_values` stays keyed by field id.
`CardDetail` caps how many fields show by default (3), with a "show more"
toggle, so a project with several fields defined doesn't turn every card
into a long form.

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
The positional-done convention (`column_id === columns.at(-1)`) is a locked
invariant (see DECISIONS.md) — but it also means a project's last status is
*always* the done state, with no multiple terminal states. Needs a real
design conversation before any implementation; may stay exactly as-is
after that conversation. **Parked with the feature-phase wind-down**
(owner, 2026-07-13 — see Path to v1.0): revisit only if daily dogfooding
proves the current rule actually hurts, not on schedule.

### B29. Show tags on Kanban cards — shipped in v4.15.0

### B30. Notes length guardrail — shipped in v4.14.0

### B31. Third Android widget: project list — shipped in v4.1.0

### B32. Archive a whole project — shipped in v4.9.0

### B33. Sub-projects — PARKED (2026-07-13)
Nested project hierarchy — a project containing child projects. Genuinely
large: touches the data model (`ProjectDoc.space_id` becomes more like
`parent_id`), every view's project-picker UI, and Dashboard/sidebar
nesting. **Parked with the feature-phase wind-down** (owner, 2026-07-13 —
see Path to v1.0): exactly the kind of architecture experiment the
stabilization pivot exists to stop; revisit post-release only if real
daily use demands it.

### B34. Project pinning — shipped in v3.9.0

### B35. Focus view — draft shipped in v4.5.0, more planned
Shipped as a **daily commitment lock**: pick up to 3 open tasks/day,
ranked pinned > overdue > due-soon > priority with a "why" chip per
suggestion; lock is `localStorage`-only (not a PouchDB doc, deliberately
ephemeral/unsynced), clears on day rollover. Superseded an earlier
auto-computed read-only priority-list design the owner rejected live as
"not making sense." Full detail in CHANGELOG-ARCHIVE.md's v4.5.0 row.

**Still explicitly a draft — not yet closed out.** Confirmed next steps
(2026-07-08), not yet built:
- **Add task from within Focus** — currently you can only pick from
  existing open tasks; there's no quick-add entry point on this view.
- **Connect with Dashboard** — Focus and Dashboard currently don't
  reference each other at all; some link/summary between them is wanted,
  exact shape not yet decided.
- **A "Daily Brief" summary card** (Samsung Daily Brief-style) — a short
  auto-generated line ("3 overdue, 2 due today, last worked on Project X")
  at the top of Focus and/or Dashboard. Not scoped in detail yet: exact
  wording rules, where exactly it lives, and whether it's Focus-only or
  shared with Dashboard are all open.

No schema change so far (lock is localStorage-only) — the Dashboard-link
and Daily-Brief work may or may not require one; decide when those are
actually scoped.

### B36. List view power customization — shipped in v3.8.5

### B37. Android widgets — collapsed 3 into 1 combined widget — shipped in v4.8.0
Full detail in CHANGELOG.md v4.8.0. **Final visual sizing/spacing remains
an open, owner-driven polish pass** (blind XML tuning from chat hit
diminishing returns) — not scheduled as a future version, pick up
whenever convenient directly in Android Studio.

### B38. Custom calendar/date picker instead of the native one — shipped in v4.6.5
New `CalendarPicker.svelte` — a themed month-grid popover (+ a time-of-day
row when the field needs one), replacing the native `<input type="date">`/
`type="datetime-local">` in CardDetail's Due date and Reminder fields, the
only two call sites.

### B39. Renaming a device (B22) leaves a stale "dead" entry — OPEN, needs schema care
Real gap found right after B22/B5 shipped (2026-07-05): "Devices seen
recently" and `CardDetail` history are derived by scanning past changelog
entries for their literal `source` string — renaming a device only
changes what *new* entries say, so the old name lingers indefinitely as an
apparently-separate device. Proper fix needs a **stable per-install device
id** separate from the editable display name, plus a durable id→name
mapping (a new synced doc type, e.g. `device:<id>`, or widening `source`
to `{id, name}`) — a real schema addition, flagged as its own item because
it needs the same care as any schema change (see CLAUDE.md), not a quick
patch. Unscheduled.

### B40. Sidebar bottom icon rail isn't readable — shipped in v4.8.0

### B41. Focus view — full-space floating-card redesign — shipped in v4.8.0
Superseded by a further visual pass in v4.11.1 (plain solid cards) — see
CHANGELOG.md.

### B42. Agenda doesn't use full screen width — shipped in v4.8.0

### B43. Human-friendly sync settings + Developer options — OPEN (owner, 2026-07-13)
Settings → Sync is still written for IT people: a raw CouchDB URL field,
credential mechanics, replication jargon. Per GOAL.md, the final user
should only ever meet the word "CouchDB" in documentation, if at all.
Redesign: the main Sync pane speaks plainly ("Connect to your home
computer" / connection status / device name), and the technical machinery
(server URL, database name, anything with a footgun) moves into a new
**Developer options** sub-section — collapsed by default, worded so it's
clearly not for everyday use. Developer options is also the future home
for any other high-impact/dangerous toggles, keeping the rest of Settings
safe to explore freely. Pure UI/copy — no sync-logic changes.

### B44. Storage & quota copy, plain-language rewrite — OPEN (owner, 2026-07-13)
B14 (v4.3.0) added an explanation of the browser quota number, but owner
feedback says it still confuses: "quota," "MB used," and the browser-
assigned ceiling read as developer concepts. Rewrite Settings → Data's
storage section so a non-technical person gets the one thing that matters
("your data is tiny; nothing to worry about — here's roughly how much room
you're using") with the raw numbers demoted to a secondary detail, not the
headline. Copy-only.

---

## Track C — Public Release & Open Source

Goal: the mission above, made concrete. Unlike Track A/B, these aren't
paired into a version bump each — they're mostly one-time setup work, and
several can start independently of whatever A/B release is in flight.

### C1. Open-source the repository on GitHub
Push the existing local repo public: pick a license (leaning MIT), add
`LICENSE`, a `CONTRIBUTING.md`, issue templates, and a README written for
someone who has never seen this project before. Audit for anything that
assumes a local-only environment before it goes public. Blocked on **C7**
(credential cleanup) and a real stability/security pass — see DECISIONS.md.

### C2. Zero-config first run, verified
The architecture is already local-first with no required server, but this
needs to be *verified*: a fresh install, no CouchDB configured, should
never prompt for setup or imply something is missing. Audit first-run copy
(Settings → Sync especially) to state plainly that sync is optional.

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
the Android APK download. A separate, real PC standalone app (not a PWA)
is a future direction to scope, not this item — see DECISIONS.md.

### C6. Brand & positioning pass
A short pass over every public-facing document — README, store copy,
landing page copy — to make sure the "not competing, just likable" framing
from the Mission above comes through, written for humans discovering the
project.

### C7. Fix hardcoded CouchDB credentials — mandatory, blocks C1
`offlog-app/src/config.ts` hardcodes a real CouchDB password and LAN IP as
fallback defaults, present in git history too. **This must be fixed before
the repo goes public or any store listing goes live** — not optional. Also
the reason the repo stays private for now (see DECISIONS.md). Fix approach:
no real credentials in source at all, `.env.local`-only with no committed
fallback; may mean publishing to GitHub as fresh history rather than
pushing this repo's full log.

### C8. New app icon, all platforms — OPEN (owner, 2026-07-13)
One new icon — deliberately basic and simple — applied everywhere it
appears: web favicon/`<link rel="icon">`, Android launcher icon (mind the
hard-won gotchas: uninstall + Clean Project before reinstalling, launcher
caches aggressively), Android notification icon (must stay a white
silhouette with transparency or the OS substitutes a generic triangle),
store listing assets (feeds C3), landing page (feeds C5), and eventually
the PC app (Track E). Brand-color propagation rule in CLAUDE.md applies if
the icon changes the palette.

### C9. Typography: ≤3 font families, self-hosted — OPEN (owner, 2026-07-13)
Owner rule: the whole project uses at most 3 font families. Current state
already complies (2: Hanken Grotesk for UI, IBM Plex Mono for
metadata/labels) — so this item is mostly **enforcement plus one real
fix**: both families load from Google Fonts' CDN via `@import` in
`app.css`, meaning every app load makes a network request to Google. For
an app whose whole promise is local-first / offline / zero telemetry,
that's both a functional gap (no fonts offline on first uncached load) and
a privacy smell (Google sees every user's IP on every load). Bundle the
font files into the app (woff2 in `public/`, `@font-face` in app.css),
drop the CDN import, and record the ≤3-families rule in CLAUDE.md's style
conventions.

### C10. Plain-language pass: every string, every document — OPEN (owner, 2026-07-13)
The sibling of C6 (which covers public-facing *branding* copy): go through
every in-app string (buttons, hints, empty states, error messages,
Settings explainers) and every user-facing document (README, future
release notes) and rewrite anything a non-technical person would stumble
on. B43 and B44 are the two worst offenders and have their own items; this
is the sweep for everything else, and the standing rule going forward —
features, updates, and docs get written for humans first. Groundwork for
any future marketing/discoverability work: the app must describe itself in
the same plain language a stranger would search for.

---

## Track D — Mesh Sync — declined (2026-07-03)

Considered at length (device-mesh sync, no central server) and explicitly
declined. Full reasoning in DECISIONS.md — technical (Android background-
service limits, no relay for devices never on the same network) and
strategic (engineering cost not worth it for a single-user project with no
multi-device-users scale to reach). **CouchDB sync remains the permanent,
only sync transport.**

---

## Track E — PC standalone app as sync host (from GOAL.md, added 2026-07-13)

The largest gap between GOAL.md and this roadmap: the goal describes
"install the PC app from a website … the PC acts as the host and they sync
automatically over home Wi-Fi," but until now the only trace of a PC app
was open question Q6. Distinct from declined Track D: this is still
CouchDB-protocol replication with one fixed host — the PC — not a mesh;
the innovation is packaging, not a new sync transport.

### E1. Scope the PC app + embedded sync host — OPEN, needs its own scoping pass
Two halves, deliberately one item because GOAL.md treats them as one
product: (1) a real installable PC app (not a PWA — see DECISIONS.md);
technology question (Tauri vs Electron vs other, and whether the
PouchDB-as-UMD-global architecture survives the move) is QUESTIONS.md's
Q6. (2) The app embeds a CouchDB-replication-compatible server
(pouchdb-server/express-pouchdb class, or a Rust-side equivalent if
Tauri) so a phone pairs to the PC with no separate CouchDB install —
which is also what finally makes B43's human-friendly sync story fully
true rather than just better-worded. Deliberately sequenced **after**
going public (Path to v1.0 step 4): browser + Android + self-hosted
CouchDB is a complete, honest v1. Not scheduled to a version; scoping
conversation first, like B33/B28 would have needed.

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

Re-paired 2026-07-05 across the full remaining backlog; v4.6.0/v4.7.0
merged into one release 2026-07-08 (owner request — both were the next two
rows up, and there was no strong reason to keep them as two separate
version bumps). **Maintenance passes are scheduled explicitly** (owner,
2026-07-05): one ran after v4.4.0 (v4.4.2), one after **v4.7.0**, then
every 3 releases after that (v4.10.0, v4.13.0, …) — tracked the same way
in [MAINTENANCE.md](../MAINTENANCE.md). The v4.6.0/v4.7.0 merge shifts
every later release down by one version number, but by coincidence
(release-count-based cadence, not the raw version number) the maintenance
schedule still lands on v4.7.0/v4.10.0/v4.13.0 exactly as before — just
different backlog content sits at each of those numbers now. Track C runs
independently of version numbers: **C7 (credential fix) and C2 can start
any time**; **C1/C3/C5/C6 fit naturally once the app feels "finished
enough"** — realistically after this table's backlog has substantially
landed. Track D was declined outright and never entered sequencing. Full
shipped-release history (including several no-A/B-item light releases:
v3.8.5, v3.9.5, v3.9.6, v3.9.7, v4.4.1, v4.4.2) lives in
[CHANGELOG.md](CHANGELOG.md) — this table only shows what's still ahead.

| # | Release | Track A | Track B | Why paired |
|---|---|---|---|---|
| 1 | v4.5.0 | — | B35 (draft) | Focus view, alone — a genuinely new global view earns an undiluted release, same reasoning as B36's own v3.8.5. Shipped as a daily-commitment-lock draft; add-task/Dashboard-link/Daily-Brief still open, see B35. |
| 2 | v4.12.0 | A30 ✓ | — | Shipped — full codebase audit/cleanup/dead-code sweep plus a documentation-flow optimization pass, not a delta-scoped maintenance check. This release *is* the cycle's maintenance pass (merged in, not run separately). |
| — | v4.12.1 ✓ | A31 (web/desktop/mobile) ✓ | — | Shipped — accessibility contrast fixes, design-system token consolidation, and (across same-day follow-ups) a full mobile + dark-mode pass over every page and manager panel, catching real bugs (Dashboard grid overflow, Focus FAB/Commit-button overlap) and verifying the rest clean. A31's web-side scope is done — only Android verification remains, see A31's own entry. |
| 3 | v4.13.0 | A31 (Android leg) | — | Just the Android verification A31 still needs — owner runs `cap sync` + a Studio check whenever convenient. Small enough that it doesn't need to hold up whatever else lands in this release; fold it in opportunistically. |
| 4 | v4.14.0 ✓ | — | B8, B30 ✓ | Shipped — project templates ("New from template" copies a project's status structure and optionally its open tasks) and a notes-length soft counter. Shipped ahead of v4.13.0's Android leg, which is owner-paced and doesn't block anything else. |
| 5 | v4.15.0 ✓ | A9 (first slice) ✓ | B24, B29 ✓ | Shipped — real component tests begin (`CardDetail`'s save logic; `KanbanBoard`/`Sidebar` still uncovered, see A9's own entry), seed data trim, tags on Kanban cards. |
| 6 | v4.16.0 | — | B43, B44 | **Stabilization phase begins** (owner pivot, 2026-07-13 — B33/B28 parked, see their entries). The two "still speaks IT" fixes first, since they're what the owner hits daily while dogfooding: human-friendly sync settings + Developer options, plain-language storage copy. |
| 7 | v4.17.0 | — | C8, C9 | Visual identity for release: new icon everywhere + self-hosted fonts (kills the Google-CDN call every load makes). Both small, both prerequisites for C3/C5's assets. |
| 8 | v4.18.0 | — | C10 + C2 | Plain-language sweep over every remaining string/doc, paired with zero-config first-run verification — the same session naturally reads all the first-run copy anyway. Maintenance pass due after this ships. |
| 9 | (unversioned) | — | C7 → C1 → C5 → C3, C6 | The release gate, in dependency order: credential fix, then GitHub, landing page, Play Store, with the C6 branding pass alongside the public-facing assets. Not version-numbered work — mostly setup/audit outside the app. |
| — | *Maintenance pass* | — | — | Every-3-releases cadence: v4.12 → v4.15 ✓ (ran as v4.15.1) → **v4.18** → … |
| — | (unscheduled) | — | B39 | Fix stale device entries after a rename — needs its own schema-change care (stable device id + name mapping), not a quick pairing. |
| — | (parked) | — | B33, B28 | Sub-projects and rethinking positional-done — parked 2026-07-13 with the feature-phase wind-down; revisit post-release only if daily use demands it. |
| — | (post-release) | — | E1 | PC standalone app + embedded sync host — GOAL.md's endgame, deliberately after going public. Scoping conversation first. |

Within each release: land any Track A item first (or in the same PR as the
Track B item it protects/enables), then the Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land. Re-evaluate
this table after each release; delete shipped rows and re-pair whatever's
left if new items get added to either track in the meantime.
