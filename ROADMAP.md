# Offlog Roadmap

Baseline: **v3.0.1** (tag `v3.0.1`, 2026-07) — the declared stable release.
Everything below is a candidate, not a commitment. Items are ordered roughly
by value-for-effort within each track. Before starting any item, re-check it
against the current code — this document describes intent, not state.

Two tracks, intentionally separate so a stability pass never gets mixed into
a feature branch:

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.

### A1. Persistent undo buffer
The undo buffer for deleted tasks is in-memory only — a refresh right after a
delete loses the undo. Since tasks are soft-deleted anyway (`deleted: true`),
undo can be rebuilt from the database: a "recently deleted" query (last N
deleted, ordered by `updated_at`) replaces the in-memory array entirely.
*Low effort, removes a real data-loss feeling.*

### A2. Changelog growth control
`log:` docs accumulate forever and `getLogsForTask()` scans **all** logs and
filters in JS. Two steps: (1) route the per-task history query through the
already-created `idx-type-ref` Mango index; (2) add a retention policy —
compact logs older than N months into nothing (they're already viewable
nowhere past 80 entries). *The single biggest long-term scale risk.*

### A3. Conflict resolution UI
Conflicts are detected and counted (sidebar badge) but resolution is
last-write-wins with losing revisions kept forever. A minimal resolution
panel in Settings: list conflicted docs, show both versions' title/updated_at,
pick a winner. Repair already deletes losing revs — this just adds choice.

### A4. Startup cost audit
`init()` runs seed check + full reload + index creation serially on every
launch. Measure, then: skip `seedIfEmpty` once seeded (localStorage flag),
parallelize the space/project/task fetches (already `Promise.all`-able),
defer `rescheduleAll` off the critical path. Target: interactive < 300ms on
mid-range Android.

### A5. Sync robustness under bad networks
`retry: true` handles disconnects, but there is no backoff visibility and
`syncNow()` creates a second concurrent replication alongside the live one.
Dedupe (cancel/restart the live sync instead), and surface "last error at
<time>" in Settings for diagnosing flaky LAN sync.

### A6. Automated tests
There are none. Priority order: (1) unit tests for `db.ts` pure logic
(`posBetween`, integrity check/repair, import validation) against
`pouchdb-adapter-memory`; (2) the "done = last column" rule across
agenda/dashboard/reminders — it's duplicated in three queries and only
convention keeps them aligned; (3) a smoke test that boots the app headless.
*Do this before any large Track B feature.*

### A7. Bundle diet
193 KB main chunk. PouchDB is the bulk and already external; the quick wins
are lazy-loading `ChangelogView`/`CardDetail` history and checking whether
`pouchdb-find`'s ES import duplicates code already in the UMD bundle.

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

1. **A6 (tests) first** — everything else gets safer.
2. Then A1 + A2 (cheap, real risk reduction).
3. First feature: B1 or B3 (B3 is the smallest; B1 is the highest value).
4. Re-evaluate this document after each release; delete shipped items.
