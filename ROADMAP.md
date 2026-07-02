# Offlog Roadmap

Baseline: **v3.5.0** (tag `v3.5.0`, 2026-07) — the current stable release.
Everything below is a candidate, not a commitment. Items are ordered roughly
by value-for-effort within each track. Before starting any item, re-check it
against the current code — this document describes intent, not state.

Two tracks, intentionally separate so a stability pass never gets mixed into
a feature branch:

---

## Shipped (Track A, v3.1.0 – v3.5.0)

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
screen that was never actually wired to the real SplashScreen API. Details
in [TECH.md](offlog-app/TECH.md)'s per-version changelog entries.

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

### A13. Accessibility re-audit for the newer components
The last a11y pass (v3.0) predates `ConfirmDialog`, the Maintenance modal,
and `TrashView` — none of the three trap focus, and `ConfirmDialog` in
particular (a real modal blocking the whole app) should trap Tab cycling
and return focus to the triggering element on close, not just handle
Escape/Enter as it does now.

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).

### B1. Space management
Spaces are seeded once and immutable in the UI (rename/recolor/add/reorder
all missing). A small "Manage spaces" section in Settings. The data layer
already supports it — this is UI only.

### B2. Filters on Kanban + saved filters
Search/filter exists in List and Table only (a deliberate v2 scope cut, can
be revisited). Add the same filter bar to Kanban, then let any filter
combination be saved as a named view per project.

### B3. Notification actions
Android notifications are tap-to-open only. Add "Done" and "Snooze 1h"
action buttons (`@capacitor/local-notifications` supports action types) —
completing a task from the lock screen without opening the app.

### B4. Import/export v2
Current JSON export is a raw doc dump. Add: export a single project,
CSV export for tables, and a guided import that previews what will be
created/skipped before writing.

### B5. Multi-device polish
`Source` already distinguishes pc/pc2/mobile. Surface it: "edited on mobile,
2h ago" in CardDetail history, and a per-device last-seen list in Settings —
useful once sync spans 3+ devices.

### B6. Tag management
Tags are free-form strings entered per-task with no way to see or manage
them globally — a typo'd tag lives forever as a distinct tag. A "Manage
tags" section in Settings: list every tag with its usage count, rename
(rewrites the tag across all tasks), merge two tags into one, or delete a
tag from every task at once.

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

### B10. Android quick-capture widget
A home-screen widget or Android App Shortcut that opens straight to
`QuickAdd` (or even accepts a title via the OS share sheet) — capturing a
task without a full app launch. Native-only; no web/PWA equivalent needed
since desktop already has Ctrl+N.

---

## Sequencing suggestion

1. **A9 (UI tests) first** — Track A's own automated-testing item (A6)
   proved its value immediately; the same argument applies to the
   components, which still have zero coverage.
2. Then A11 (error-handling audit) — cheap, and the newest features
   (Trash, Maintenance) are the least likely to have been audited yet.
3. First feature: B1 (smallest, self-contained) or B6 (tag management,
   similarly small and a real day-to-day quality-of-life gap).
4. As Track B features land, extend `tests/db.test.ts` for any new `db.ts`
   logic rather than letting coverage fall behind again.
5. Re-evaluate this document after each release; delete shipped items.
