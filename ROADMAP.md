# Offlog Roadmap

Baseline: **v3.1.1** (tag `v3.1.1`, 2026-07) — the current stable release.
Everything below is a candidate, not a commitment. Items are ordered roughly
by value-for-effort within each track. Before starting any item, re-check it
against the current code — this document describes intent, not state.

Two tracks, intentionally separate so a stability pass never gets mixed into
a feature branch:

---

## Shipped (Track A, v3.1.0 – v3.1.1)

A1 (persistent undo), A2 (changelog growth control), A3 (conflict resolution
UI), A4 (startup cost audit), A5 (sync robustness/dedup), and A7 (bundle
diet — ChangelogView lazy-loaded) shipped in v3.1.0. v3.1.1 followed up after
testing A1 at scale (50 dummy tasks, 25 deleted): the "Recently Deleted" list
was already correctly capped at 10 rows, but the underlying soft-deleted docs
had no retention policy — added one (3-month window), plus a real storage
breakdown in Settings (doc counts, not just a raw MB figure) and a manual
"Clean Up Now" button. Details in [TECH.md](offlog-app/TECH.md)'s v3.1.0/
v3.1.1 changelog entries. A6 (automated tests) remains open below — it was
deliberately sequenced first in the original plan but got deprioritized when
this batch shipped together; still the highest-leverage next step before
further changes to `db.ts`.

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.

### A6. Automated tests
There are none. Priority order: (1) unit tests for `db.ts` pure logic
(`posBetween`, integrity check/repair, import validation) against
`pouchdb-adapter-memory`; (2) the "done = last column" rule across
agenda/dashboard/reminders — it's duplicated in three queries and only
convention keeps them aligned; (3) a smoke test that boots the app headless.
*Do this before any large Track B feature.*

### A8. Further bundle diet
ChangelogView is now lazy-loaded (v3.1.0). Main chunk is still ~196 KB.
Remaining candidates: lazy-load `CardDetail`'s history panel specifically
(it's already behind `{#if showHistory}` but that doesn't split the bundle
on its own — needs a dynamic import like ChangelogView got), and check
whether `pouchdb-find`'s ES import duplicates code already present in the
UMD `pouchdb.js` bundle.

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

1. **A6 (tests) next** — the stability batch shipped without them; they're
   now the highest-leverage thing before touching `db.ts` again (the
   conflict-resolution and log-pruning code added in v3.1.0 has no coverage).
2. Then A8 if bundle size becomes a real complaint (currently not urgent).
3. First feature: B1 or B3 (B3 is the smallest; B1 is the highest value).
4. Re-evaluate this document after each release; delete shipped items.
