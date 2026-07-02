# Offlog Roadmap

Baseline: **v3.4.0** (tag `v3.4.0`, 2026-07) — the current stable release.
Everything below is a candidate, not a commitment. Items are ordered roughly
by value-for-effort within each track. Before starting any item, re-check it
against the current code — this document describes intent, not state.

Two tracks, intentionally separate so a stability pass never gets mixed into
a feature branch:

---

## Shipped (Track A, v3.1.0 – v3.4.0)

A1 (persistent undo), A2 (changelog growth control), A3 (conflict resolution
UI), A4 (startup cost audit), A5 (sync robustness/dedup), and A7 (bundle
diet — ChangelogView lazy-loaded) shipped in v3.1.0. v3.1.1 followed up after
testing A1 at scale: added deleted-task retention and a real storage
breakdown in Settings. v3.4.0 shipped **A6 (automated tests)** — first
Vitest suite (`tests/db.test.ts`, 26 tests against `pouchdb-adapter-memory`)
covering CRUD, the "done = last column" convention across both queries that
rely on it, integrity check/repair, conflict resolution, retention pruning,
and a bootstrap smoke test. **It immediately paid for itself**: caught two
real bugs that had been silently shipping since v3.1.0 — conflict detection
never worked at all (`row.value.conflicts` isn't a real PouchDB field; it's
`row.doc._conflicts`), and resolving a conflict left one revision behind
uncleaned. Also shipped **A8 (further bundle diet)** — `CardDetail`'s history
panel is now lazy-loaded, and the `pouchdb-find` duplication question was
answered by measurement: ~51 KB raw / ~16.7 KB gzip, structural to the UMD-
core-plus-ESM-plugin loading strategy, not worth unwinding on its own.
Details in [TECH.md](offlog-app/TECH.md)'s per-version changelog entries.

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.

Nothing currently queued — A1 through A8 are all shipped. Re-populate this
section as new stability concerns come up (the conflict-detection bug found
by A6 is a reminder that untested code paths are the main remaining risk;
UI components still have zero test coverage).

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).

### B1. Recurring tasks
The most-requested class of personal-task feature. Local-first-friendly
design: a `recurrence` rule on the task (`daily/weekly/monthly` + interval);
on completion (move to last column), the app immediately creates the next
occurrence with shifted due/reminder dates. No background jobs needed —
creation happens at interaction time.

### B2. Subtasks / checklists
A lightweight `checklist: { text, done }[]` field on TaskDoc rendered in
CardDetail, with a "2/5" progress chip on Kanban cards and List rows.
Avoids the full complexity of nested tasks while covering most needs.

### B3. Space management
Spaces are seeded once and immutable in the UI (rename/recolor/add/reorder
all missing). A small "Manage spaces" section in Settings. The data layer
already supports it — this is UI only.

### B4. Task ↔ task links & markdown rendering
`body` is stored as markdown but rendered as plain text. Render it (a tiny
renderer, not a full editor), and support `[[task-title]]` linking with
click-to-open — the changelog already proves cross-referencing works.

### B5. Filters on Kanban + saved filters
Search/filter exists in List and Table only (a deliberate v2 scope cut, can
be revisited). Add the same filter bar to Kanban, then let any filter
combination be saved as a named view per project.

### B6. Notification actions
Android notifications are tap-to-open only. Add "Done" and "Snooze 1h"
action buttons (`@capacitor/local-notifications` supports action types) —
completing a task from the lock screen without opening the app.

### B7. Import/export v2
Current JSON export is a raw doc dump. Add: export a single project,
CSV export for tables, and a guided import that previews what will be
created/skipped before writing.

### B8. Multi-device polish
`Source` already distinguishes pc/pc2/mobile. Surface it: "edited on mobile,
2h ago" in CardDetail history, and a per-device last-seen list in Settings —
useful once sync spans 3+ devices.

---

## Sequencing suggestion

1. Track A is fully shipped (A1–A8). First feature: B1 or B3 (B3 is the
   smallest; B1 is the highest value).
2. As Track B features land, extend `tests/db.test.ts` for any new `db.ts`
   logic rather than letting coverage fall behind again.
3. Re-evaluate this document after each release; delete shipped items.
