# Offlog Roadmap

Baseline: **v3.7.0** (tag `v3.7.0`, 2026-07) — the current stable release.
Everything below is a candidate, not a commitment. Items are ordered roughly
by value-for-effort within each track. Before starting any item, re-check it
against the current code — this document describes intent, not state.

Two tracks, intentionally separate so a stability pass never gets mixed into
a feature branch:

---

## Shipped (Track A, v3.1.0 – v3.7.0; Track B, v3.6.0 – v3.7.0)

A1–A8 (persistent undo, changelog growth control, conflict resolution,
startup cost audit, sync robustness/dedup, automated tests, bundle diet ×2)
shipped across v3.1.0–v3.4.0. A6 (automated tests) is worth calling out
specifically: the first Vitest suite (`tests/db.test.ts`, 26 tests against
`pouchdb-adapter-memory`) **immediately paid for itself**, catching two real
bugs that had been silently shipping since v3.1.0 — conflict detection never
worked at all (`row.value.conflicts` isn't a real PouchDB field; it's
`row.doc._conflicts`), and resolving a conflict left one revision behind
uncleaned. v3.5.0 followed up with the fallout from conflict detection
finally working: a Settings panel layout bug (no scroll cap, so a populated
conflict list pushed the header/buttons off-screen) and an Android splash
screen that was never actually wired to the real SplashScreen API. v3.6.0
shipped the first Track B items — **B1 (Space management)** and **B6 (Tag
management)** — alongside a full Settings redesign (category/detail layout,
responsive down to phone widths) that wasn't originally scoped but became
necessary once B1/B6 exposed how cluttered the old flat Settings page had
become; discovering the app has no Android hardware back-button handling
anywhere (now tracked as A14) directly shaped that redesign's mobile
navigation pattern. v3.7.0 followed up as an Android-focused release:
**A13 (focus-trap accessibility)** and **A14 (hardware back-button
handling)** shipped alongside **B3 (notification actions)** and **B10
(quick-capture app shortcut)** — see TECH.md's v3.7.0 entry. Details in
[TECH.md](offlog-app/TECH.md)'s per-version changelog entries.

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.

### A9. UI component tests
`tests/db.test.ts` only covers the database layer — every `.svelte`
component has zero automated coverage, caught only by manual browser
verification. Start with `@testing-library/svelte` for the components with
the most non-obvious logic: `KanbanBoard`'s drag/drop position math,
`CardDetail`'s save/diff logic, and `Sidebar`'s Maintenance step
orchestration (the exact kind of multi-step async flow that's easy to
silently break with a future refactor).

### A10. Large-dataset performance validation
Manual testing so far has gone up to ~150 tasks (the 50-dummy-task batches
used for Trash/Maintenance testing). Nothing has verified behavior at the
scale a multi-year single-user database could realistically reach —
1,000–5,000 tasks, thousands of log entries. Script a one-time stress
seed, then measure: Kanban/List/Table render time, `getDashboardData()`
latency, and Global Search responsiveness per keystroke. Fix whatever's
worst before it becomes an actual user complaint instead of a hypothetical.

### A11. Error-handling audit, pass 2
The try/catch + `showError()` invariant was last audited in v2.9.0 — every
task-mutating call site added since then (Trash's restore/delete-forever/
empty, the Maintenance modal's five-step flow, `ConfirmDialog` consumers)
needs the same audit applied fresh, since new features are exactly where
this invariant tends to quietly lapse.

### A12. Notification reliability audit
Reminder scheduling (`notifications.ts`) has never been tested across DST
transitions, device timezone changes, or the app being closed for several
days then reopened. `catchUpWeb()`'s 1-hour catch-up window and the native
Android exact-alarm fallback are both plausible sources of missed or
duplicate reminders under those conditions — worth deliberately testing
rather than waiting for a real missed reminder to report it.

### A13. Accessibility re-audit for the newer components — shipped in v3.7.0
See [TECH.md](offlog-app/TECH.md)'s v3.7.0 changelog entry. Number kept
(not renumbered/removed) so the sequencing table below stays accurate.

### A14. Android hardware back-button handling — shipped in v3.7.0
See [TECH.md](offlog-app/TECH.md)'s v3.7.0 changelog entry. Number kept
(not renumbered/removed) so the sequencing table below stays accurate.

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).

### B1. Space management — shipped in v3.6.0
See [TECH.md](offlog-app/TECH.md)'s v3.6.0 changelog entry. Number kept
(not renumbered/removed) so the sequencing table below stays accurate.

### B2. Filters on Kanban + saved filters
Search/filter exists in List and Table only (a deliberate v2 scope cut, can
be revisited). Add the same filter bar to Kanban, then let any filter
combination be saved as a named view per project.

### B3. Notification actions — shipped in v3.7.0
See [TECH.md](offlog-app/TECH.md)'s v3.7.0 changelog entry. Number kept
(not renumbered/removed) so the sequencing table below stays accurate.

### B4. Import/export v2
Current JSON export is a raw doc dump. Add: export a single project,
CSV export for tables, and a guided import that previews what will be
created/skipped before writing.

### B5. Multi-device polish
`Source` already distinguishes pc/pc2/mobile. Surface it: "edited on mobile,
2h ago" in CardDetail history, and a per-device last-seen list in Settings —
useful once sync spans 3+ devices.

### B6. Tag management — shipped in v3.6.0
See [TECH.md](offlog-app/TECH.md)'s v3.6.0 changelog entry. Number kept
(not renumbered/removed) so the sequencing table below stays accurate.

### B7. Calendar / week view for Agenda
The Agenda groups by Overdue/Today/This Week/Later as flat lists. A
week-grid view (7 columns, tasks placed under their due date) alongside the
existing list view gives a different, genuinely useful way to see workload
distribution — toggle between the two, same underlying `getAllTasksDue()`
query.

### B8. Project templates
"New from template" duplicates an existing project's status structure (and
optionally its non-completed tasks) into a fresh project — useful for
recurring project shapes (e.g. a monthly checklist) without recreating
statuses by hand every time. Builds directly on the existing
`duplicateTask()` pattern, applied at the project level.

### B9. Command palette
Ctrl+K currently does global task search only. Extend `GlobalSearch` (or a
new overlay sharing its shortcut) to also match action commands by fuzzy
name — "dark mode", "new project", "settings", "export" — so power users
can drive the whole app from the keyboard without memorizing separate
shortcuts for everything.

### B10. Android quick-capture widget — shipped in v3.7.0
See [TECH.md](offlog-app/TECH.md)'s v3.7.0 changelog entry. Number kept
(not renumbered/removed) so the sequencing table below stays accurate.

### B11. High contrast mode
A third `body` theme class alongside light/dark, raising border/text
contrast ratios throughout — same token-driven approach as the existing
palette (add the values to `app.css`, no component changes needed if every
color already routes through a CSS custom property). Toggled from Settings
→ Appearance, next to the existing dark mode switch. Raised while reshaping
Settings in v3.6.0.

### B12. Auto-reminder from due date
Right now a reminder (`reminder_at`) is a fully separate field the user
sets manually, independent of `due_date`. Add an optional "remind me on the
due date" toggle in `CardDetail` that derives `reminder_at` from `due_date`
at a configurable time-of-day (a new Settings → Notifications default, e.g.
"9:00 AM"), instead of requiring the exact date+time to be picked twice for
the common case of "just remind me the day it's due."

### B13. Sync on/off toggle
Settings → Sync currently only has the CouchDB URL field — there's no way
to temporarily disable sync without clearing the URL (which drops the
configured server entirely). Add an explicit on/off toggle that calls
`startSync()`/cancels `_syncHandler` without touching the stored URL, for
"stop syncing for a while" without losing the configuration.

### B14. Explain the storage quota number
Settings → Data shows the raw `navigator.storage.estimate()` output
("X MB used / Y MB quota") with no context — the quota figure in particular
is a browser-assigned ceiling most users have never encountered and don't
know how to interpret. Add a short inline explanation (e.g. "quota is set
by your browser based on available disk space, not by Offlog") and clarify
whether approaching it matters (it doesn't, in practice, until real disk
pressure — PouchDB/IndexedDB storage for a single-user task list is tiny
relative to typical quotas).

### B15. Fold Maintenance into the Settings detail pane
v3.6.0 gave Maintenance its own modal-on-top-of-a-modal (Settings →
Maintenance → "Run Maintenance" opens `MaintenanceModal.svelte` layered on
top). Now that Settings itself has a proper category/detail structure,
review whether Maintenance's step list, progress bar, and Run button can
render directly in the Maintenance category's detail pane instead of a
second overlay — one less layer, and it's no longer clearly justified now
that Settings has real internal navigation of its own.

---

## Sequencing suggestion

The original 5:10 Track A:B split below is fully paired through v4.0.0.
B11–B15 (added while reshaping Settings in v3.6.0) aren't slotted into a
release yet — re-pair them alongside whichever future A items land, rather
than force-fitting them into the table below.

| Release | Track A | Track B | Why paired |
|---|---|---|---|
| **v3.6.0** | A9 — UI component tests | B1 — Space management, B6 — Tag management | Both features are small, self-contained "manage X in Settings" screens — same shape, low risk, a good first target to exercise the new component-testing setup from A9 before anything more complex. |
| **v3.7.0** (shipped) | A13 — Accessibility re-audit, A14 — Android hardware back-button handling | B3 — Notification actions, B10 — Android quick-capture widget | An Android-focused release — both features are native-only surface (notification action buttons, app shortcut). A14 (found during v3.6.0's Settings redesign) folded in here since it's squarely Android interaction plumbing, same as A13's focus on the newest interactive elements. **Moved ahead of the original v3.7.0** per owner request to prioritize Android work first. |
| **v3.8.0** | A11 — Error-handling audit, pass 2 | B2 — Kanban filters, B9 — Command palette | Both add many new mutation/action call sites — auditing the try/catch + `showError()` invariant first makes it a live checklist while building these, not a separate pass done after the fact. |
| **v3.9.0** | A10 — Large-dataset performance validation | B7 — Calendar/week view, B4 — Import/export v2 | Both features are data-volume-sensitive (a new heavier render view, bulk export/import) — validating performance at scale in the same cycle catches regressions before they ship, not after. |
| **v4.0.0** | A12 — Notification reliability audit | B5 — Multi-device polish, B8 — Project templates | A12 and B5 both deal with sync/timing edge cases (DST, timezones, multi-device drift) — natural fit. B8 closes out the roadmap; the milestone bump to v4.0.0 marks the whole current plan shipped. |

Within each release: land the Track A item first (or in the same PR as the
first Track B item it protects/enables), then the two Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land — don't let
coverage fall behind again. Re-evaluate this table after each release;
delete shipped rows and re-pair whatever's left if new items get added to
either track in the meantime.
