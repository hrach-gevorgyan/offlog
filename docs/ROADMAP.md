# Offlog Roadmap

Current version: **v4.10.0**. Everything below is a candidate, not a
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
detail. It's a narrative, not a schedule.

1. **Right now (Track A + B):** keep the app trustworthy and close real
   feature gaps, in small paired releases (see Sequencing below). This is
   the only part of the roadmap with real short-term commitments.
2. **In parallel, whenever there's spare attention (Track C, starting
   now):** get honest about what "ready for a stranger to install" means —
   fix the hardcoded credentials, verify zero-config first run actually
   holds, prepare the public GitHub repo and a Play Store listing. Most of
   this is documentation/audit work, not new features, and doesn't have to
   wait for Track A/B to finish.
3. **Once the app feels finished enough to represent well publicly:** go
   public. GitHub repo, website, Play Store listing. This is the concrete,
   externally-visible "we made it" milestone — everything before this
   point is preparation for it.
4. **After that, there's no further destination.** Offlog is a personal
   tool, built for the owner's own use and shared as open source for
   anyone who wants the same thing — not a product being grown toward a
   business or a bigger platform. The plan past step 3 is just: keep
   building whatever Track B features the owner personally still wants,
   keep Track A's trustworthiness work going, and stop there. Mesh sync
   and any form of monetization were both considered at length and
   explicitly declined (2026-07-03) — see DECISIONS.md.

Nothing above skips a step. A public repo with hardcoded credentials in its
history would undermine the entire premise — so the ordering here is a
real constraint, not just narrative flow.

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.
Shipped items: one-line pointer only — full detail in CHANGELOG.md.

### A9. UI component tests — OPEN
`tests/db.test.ts`/`modalStack.test.ts`/`sync.test.ts` cover the database
and pure-logic layers only — every `.svelte` component has zero automated
coverage, caught only by manual browser verification. Start with
`@testing-library/svelte` for the components with the most non-obvious
logic: `KanbanBoard`'s drag/drop position math, `CardDetail`'s save/diff
logic, and `Sidebar`'s Maintenance step orchestration. **Note**: v3.6.0's
CHANGELOG entry and the old sequencing table mis-labeled that release's
`tests/db.test.ts` growth as "A9" — it wasn't; no real component test has
ever landed. Scheduled for v4.13.0.

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

### A26. PWA staleness / dev workflow needs a decision — OPEN, needs owner input
Owner-reported: the installable PWA build repeatedly shows a stale
icon/design after an update, even after A18's forced `registration.update()`
call. Needs an owner decision, not just another patch: options range from
a visible "update available, tap to refresh" banner, to `registerType:
'prompt'` instead of `'autoUpdate'` in `vite-plugin-pwa`, to reducing what's
precached, to reconsidering how much the installable-PWA path is worth
versus the Android APK as the primary "real app" experience. Unscheduled —
needs a scoping conversation before implementation.

### A27. Project-view no longer force-resets to Kanban on every refresh — shipped in v3.9.8

### A28. Exact-alarm ("Alarms & reminders") permission has no in-app status/control — shipped in v3.9.8

### A29. "Cannot reach sync server" doesn't say why — shipped in v4.4.1

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).
Shipped items: one-line pointer only — full detail in CHANGELOG.md.

### B1. Space management — shipped in v3.6.0

### B2. Filters on Kanban + saved filters — OPEN
Search/filter exists in List only (a deliberate v2 scope cut, can be
revisited). Add the same filter bar to Kanban, then let any filter
combination be saved as a named view per project. Scheduled for v4.11.0.

### B3. Notification actions — shipped in v3.7.0

### B4. Import/export v2 — shipped in v4.7.0
Export a single project (JSON), export all tasks (CSV, one-way — not
re-importable), and a guided import: pick a file, see counts of what
will be created per type (and what's unrecognized/skipped) before
confirming, instead of writing on file-select.

### B5. Multi-device polish — shipped in v4.2.0

### B6. Tag management — shipped in v3.6.0

### B7. Calendar / week view for Agenda — shipped in v4.7.0
List/Week toggle (per-device, localStorage), with prev/next/Today
navigation. Week grid uses thin priority-colored left-border task rows
rather than individual bordered chips — an earlier boxed-chip version was
cramped and hard to scan at 7-columns-in-900px, redone as a plain compact
list-per-day instead. Same underlying `getAllTasksDue()` query as the
list mode.

### B8. Project templates — OPEN
"New from template" duplicates an existing project's status structure (and
optionally its non-completed tasks) into a fresh project. Builds directly
on the existing `duplicateTask()` pattern, applied at the project level.
Scheduled for v4.12.0.

### B9. Command palette — shipped in v4.10.0
Folded into the existing Ctrl+K `GlobalSearch` overlay rather than a
separate shortcut/component — a new `commands.ts` defines a small fixed
list (go to Dashboard/Focus/Agenda, Quick Add, toggle theme, toggle high
contrast, open Settings/Changelog/Deleted, Sync Now), matched by the same
plain substring matching `searchAllTasks()` already uses (no fuzzy library
added). Commands and task results share one combined keyboard-navigable
list, commands first. Settings/Changelog/Deleted are opened via a
`bind:this` ref into `Sidebar.svelte` rather than lifting that modal state
up — its `openSettings`/`openChangelog`/`openTrash` functions are already
plain top-level bindings Svelte exposes to a bound instance for free.

### B10. Android quick-capture widget — shipped in v3.7.0

### B11. High contrast mode — shipped in v4.6.0

### B12. Auto-reminder from due date — shipped in v4.4.0

### B13. Sync on/off toggle — shipped in v4.2.0

### B14. Explain the storage quota number — shipped in v4.3.0

### B15. Fold Maintenance into the Settings detail pane — shipped in v4.9.0
`MaintenanceModal.svelte`'s step list/progress bar/Run button now render
directly inside Settings → Maintenance's own detail pane — the component
was deleted and its logic moved inline into `SettingsPanel.svelte`, no more
modal-on-top-of-a-modal.

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
`getDashboardData()` (db.ts) now also returns `completedLast7Days`,
`busiestProjectName`, and `todayTasks` — surfaced as a "N completed this
past week · busiest: X" line under the header, and a new "Today" panel
alongside the existing Pinned/Overdue ones. "Completed" reuses the
existing positional last-column check plus `updated_at` within 7 days,
not log docs — the move-action log only stores the target column's
*name*, not its id, which would be fragile against renames; the tradeoff
noted in a code comment is that `updated_at` bumps on any edit, so a task
completed earlier but merely edited within the window could
false-positive, acceptable for a glance-level stat.

### B18. Subtasks / checklists within a task — OPEN
`CardDetail` has free-text markdown but no structured checklist. A simple
`checklist: { text: string; done: boolean }[]` array on `TaskDoc`, rendered
as tappable checkboxes, with a "3/5 done" progress indicator surfaced on
the card itself in Kanban/List. Scheduled for v4.11.0.

### B19. Bulk actions in List — shipped in v4.6.0
Shipped with a different UX than originally scoped, after two rounds of
owner feedback: no shift-click range-select (dropped entirely — plain
per-row toggling only); row checkboxes are hidden by default and only
appear once "Select" mode is turned on, merged into the existing Columns
dropdown (a "Select rows" switch at the top of that popover) rather than
a separate always-visible toolbar button; and the bulk action bar itself
is trimmed to move-to-status, change-priority, and add-tag only — no
remove-tag, no bulk delete.

### B20. Agenda widget — shipped in v4.1.0

### B21. Dark mode follows OS setting — shipped in v4.6.0

### B22. Named clients/devices — shipped in v4.2.0

### B23. Sidebar: last modified cards — shipped in v3.9.0

### B24. Seed data: 3 spaces, not 4 — OPEN
`seedIfEmpty()`/`wipeAndReseed()` currently create Unsorted, Personal,
Family, and Work. Drop Family from the default seed. Down to Unsorted,
Personal, Work. Scheduled for v4.13.0.

### B25. Deadline quick-suggestions on new card — shipped in v4.0.0

### B26. Tag autocomplete beyond the current project — shipped in v4.0.0

### B27. Archived tasks are too hidden — shipped in v4.9.0
Dashboard's header now shows a DB-wide archived-task count next to the
active-task summary. List view's own "Archived" toggle button now carries
a live per-project count badge too (`archivedTasksRaw` loads regardless of
whether the section is expanded), so the count is visible before you ever
open it.

### B28. Rethink "last column = done" — OPEN, needs owner design session
The positional-done convention (`column_id === columns.at(-1)`) is a locked
invariant (see DECISIONS.md) — but it also means a project's last status is
*always* the done state, with no multiple terminal states. Needs a real
design conversation before any implementation; may stay exactly as-is
after that conversation. Scheduled for v4.14.0 (deliberately isolated).

### B29. Show tags on Kanban cards — OPEN
Tags currently render in List but not on Kanban cards themselves — add
them (compact, matching the existing chip style). Scheduled for v4.13.0.

### B30. Notes length guardrail — OPEN
`CardDetail`'s notes field is unbounded markdown — add a soft length
guardrail (a visible counter past some threshold, not a hard block).
Scheduled for v4.12.0.

### B31. Third Android widget: project list — shipped in v4.1.0

### B32. Archive a whole project — shipped in v4.9.0
`ProjectDoc` gets an `archived?: boolean` field. `archiveProject()` soft-
archives the project doc and bulk-archives its non-done tasks (positional
"done" check via `columns.at(-1)`); `getProjects()` excludes archived
projects, `getArchivedProjects()` lists them. Deliberately **not** a
sidebar icon — the sidebar was already called out as visually overloaded
once (v4.6.5) — instead it's a new **Archived Projects** manager panel
(`ArchivedProjectsManager.svelte`), opened from Settings → Organize
alongside Manage Spaces/Tags/Custom Fields, with an archive picker, a
restore list, and (owner-requested mid-build) a direct Delete action per
archived project so a project doesn't have to be restored first just to
delete it. Restoring a project only un-hides the project itself — the
tasks it swept up restore individually via List view's existing per-task
archive toggle, same as any other archived task.

### B33. Sub-projects — OPEN, needs its own scoping pass
Nested project hierarchy — a project containing child projects. Genuinely
large: touches the data model (`ProjectDoc.space_id` becomes more like
`parent_id`), every view's project-picker UI, and Dashboard/sidebar
nesting. Scheduled for v4.14.0 (deliberately isolated).

### B34. Project pinning — shipped in v3.9.0

### B35. Focus view — draft shipped in v4.5.0, more planned
Working name "Focus" (owner, 2026-07-03). Direction confirmed 2026-07-05:
where Kanban answers "what's the state of everything" and List answers
"let me scan/sort the data," Focus answers "what should I be doing right
now."

**Superseded design note**: the first scope (an auto-computed, capped
priority list — pinned → overdue → due-today → one "up next" backfill,
read-only, no picking) was built, then the owner rejected it live
(2026-07-08): "not making sense, we need a really focus space" — a passive
ranked list didn't feel different enough from Agenda. Replaced same day
with a **daily commitment lock**, which is what actually shipped:

- Global nav item beside Dashboard/Agenda (unchanged from original scope).
- Each day, pick up to 3 open tasks into a commitment. The picker ranks
  candidates by a scoring function (pinned > overdue > due-soon > priority)
  but round-robins across those reason-buckets rather than taking a flat
  top-3-by-score — otherwise an overdue-heavy backlog suggests 3 overdue
  tasks every morning with zero variety. The 3 suggested rows are
  visually highlighted (border/tint) and labeled with *why* (colored
  chip: Pinned/Overdue/Due soon/High priority), not a bare star — reason
  matters more than rank when deciding what to commit to.
- The lock is `{date, taskIds}` in `localStorage['offlog_focus_lock']`,
  **not a PouchDB doc** — deliberately ephemeral, per-device, unsynced.
  A stale commitment on one device shouldn't leak into another, and it
  isn't data worth carrying through backup/restore.
- Once locked, only those tasks show (mark-done via the normal positional
  last-column move) until each is done or the day rolls over (date
  compare against the stored lock, not a timer).
- Commit action is a sticky footer button, not scrolled-to — the v1 draft
  buried it at the bottom of a long picker list, fixed same session.

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
Superseded scope: the original plan was a visual-design pass over the
existing 3 separate widgets (Quick Add, Agenda, Project list), each
getting its own icon/identity — a first attempt at exactly that (per-
widget dark-theme palette + distinct icons, keeping all 3 as separate
widgets) still looked like "3 variations of one card" once actually seen
on a home screen (owner feedback, live screenshot, 2026-07-09), because
the real problem was the 3-separate-cards structure, not the palette.

Replaced with a full redesign, then simplified further mid-session per
direct owner feedback: the first combined-widget draft had a tappable
"brief" text area (overdue/due-today counts, opens Agenda) above the
button row — owner then asked to drop all text entirely ("no text
information, just 3 buttons"). Shipped shape: **3 static buttons, no
dynamic data at all** — a wide accent-colored "Focus" pill (icon+label,
primary action) plus 2 small circular buttons (Quick Add, Dashboard).
`OffologWidgetProvider.java` replaces the 3 old provider classes; the
entire JS→native data-push pipeline (`OffologWidgetPlugin`,
`widgetBridge.ts`, the `store.ts` call) was deleted outright rather than
left unused, since a fully static widget has nothing to push. Palette
matches app.css's dark-mode tokens (colorWidgetBg/Surface/Border/Accent/
Text in colors.xml, kept in sync with `docs/TECH.md`'s Theme System
table). New URL hosts `focus`/`dashboard` added to `App.svelte`'s
`handleWidgetUrl()` and the manifest's intent filter.

**Real structural bug found and fixed along the way**: the widget kept
rendering as a huge stretched card regardless of `minWidth`/`minHeight`/
`resizeMode` tuning, because the visible card background was painted on
the widget's full allocated frame — and a launcher's actual placed grid
cell can be far larger than the declared minimum (Android has no way to
force an exact size). Fixed by making the outer widget frame fully
transparent (`match_parent`, no background) and putting the dark card on
an *inner* `wrap_content` child instead — the "floating compact card on
a transparent frame" pattern most polished Android widgets actually use,
which makes the visible card size independent of whatever grid space the
launcher grants.

**Final visual sizing/spacing is an open, owner-driven polish pass** —
blind XML tuning from chat (no emulator/build access here, per the
standing "never run Gradle" rule) hit diminishing returns; the owner now
has Android Studio open and can iterate on real on-device rendering far
faster directly. Not scheduled as a future version — pick up whenever
convenient.

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
Redesigned as a 2×2 grid (Changelog/Deleted top row, Settings/Sync bottom
row per owner's requested order) with icon+label pairs restored — each
cell now has enough width for a readable label again, which the earlier
1×4 icon-only row didn't. Deleted's count moved from a floating corner
badge into inline text ("Deleted · 9") after owner feedback that the
badge looked inconsistent with the other buttons.

### B41. Focus view — full-space floating-card redesign — shipped in v4.8.0
The picker now uses the full available width as a "corkboard" of
flex-wrapped note cards (not literal absolute-random positioning — that
would break click targets/tab order/responsiveness) with 3 size tiers and
a small deterministic per-card tilt (hashed from task id, so it's stable
across re-renders, not re-randomized every reactive update). Suggested
tasks render at the largest size with an accent border. Locked/committed
tasks still render as a plain list — the floating-card treatment is
specific to the picking step, not the "now do these" step.

### B42. Agenda doesn't use full screen width — shipped in v4.8.0
Removed the `max-width: 900px` cap from Agenda's list-mode body; the
week-grid mode already had no such cap.

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

### C5. Public web install landing page
A small, plain landing page (GitHub Pages is enough) with a single
"Install" / "Add to Home Screen" button for the existing PWA build.

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

---

## Track D — Mesh Sync — declined (2026-07-03)

Considered at length (device-mesh sync, no central server) and explicitly
declined. Full reasoning in DECISIONS.md — technical (Android background-
service limits, no relay for devices never on the same network) and
strategic (engineering cost not worth it for a single-user project with no
multi-device-users scale to reach). **CouchDB sync remains the permanent,
only sync transport.**

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
| — | *Maintenance pass* | — | — | Every-3-releases cadence continues: v4.4 → v4.7 → **v4.10** → v4.13 → … |
| 2 | v4.11.0 | — | B2, B18 | Kanban filters and subtasks/checklists — both card/board-level additions, same view layer. |
| 3 | v4.12.0 | — | B8, B30 | Project templates and a notes-length guardrail — leftover cleanup, no strong shared theme. |
| 4 | v4.13.0 | A9 | B24, B29 | Housekeeping release: real component tests (A9, finally), tested directly against two small, low-risk feature additions landing in the same release (seed data trim, tags on Kanban cards). |
| 5 | v4.14.0 | — | B33, B28 | Saved for last, deliberately isolated: sub-projects and rethinking "done = last column" are the two biggest open architecture questions left — each needs its own scoping conversation, not a feature-pairing shortcut. |
| — | *Maintenance pass* | — | — | Every-3-releases cadence: v4.10 → **v4.13** → v4.16 → … (re-check: this pairing shift may nudge the exact number — re-verify against the cadence when v4.10.0 actually ships) |
| — | (unscheduled) | A26 | — | PWA staleness / dev workflow — needs an owner decision on direction before it can be scoped into a release at all. |
| — | (unscheduled) | — | B39 | Fix stale device entries after a rename — needs its own schema-change care (stable device id + name mapping), not a quick pairing. |

Within each release: land any Track A item first (or in the same PR as the
Track B item it protects/enables), then the Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land. Re-evaluate
this table after each release; delete shipped rows and re-pair whatever's
left if new items get added to either track in the meantime.
