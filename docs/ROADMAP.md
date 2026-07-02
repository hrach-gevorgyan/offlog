# Offlog Roadmap

Baseline: **v3.7.0** (tag `v3.7.0`, 2026-07) — the current stable release.
Everything below is a candidate, not a commitment. Items are ordered roughly
by value-for-effort within each track. Before starting any item, re-check it
against the current code — this document describes intent, not state.

Related documents: [TECH.md](TECH.md) (how it works today),
[DECISIONS.md](DECISIONS.md) (why non-obvious choices were made),
[CHANGELOG.md](CHANGELOG.md) (version history), [QUESTIONS.md](QUESTIONS.md)
(open questions worth outside input). A separate VISION.md used to carry
long-horizon direction (mesh sync, a business model); it was folded into
this file (2026-07), and that direction was itself considered and declined
shortly after (2026-07-03) — see DECISIONS.md for the reasoning.

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
(quick-capture home-screen widget)**. Full details in
[CHANGELOG.md](CHANGELOG.md)'s per-version entries.

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
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A14. Android hardware back-button handling — shipped in v3.7.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A15. Widget/back-button regression coverage
v3.7.0 added real native surface — `modalStack.ts`'s history-backed overlay
stack, the notification action buttons, and the home-screen widget — with
zero automated coverage, only manual/browser verification. `modalStack.ts`
in particular is pure JS with no Svelte or DOM dependency beyond
`window.history`/`popstate`, so it's a cheap first target: a unit test can
verify the LIFO stack order and `discardTop()` vs `requestClose()` behavior
without spinning up a component at all.

### A16. Offline-queue robustness for sync
A5 (v3.1.0) fixed sync running two replications at once, but nothing has
deliberately tested a genuinely flaky connection — dropped mid-replication,
reconnecting with a partial write in flight. Different failure mode than
A5's fix; worth simulating deliberately (e.g. killing the network mid-sync
in dev tools) rather than waiting for a real report of a stuck or corrupted
sync state.

### A17. Storage-pressure handling
Nothing today handles `navigator.storage.estimate()` actually approaching
quota — worth deciding what graceful degradation even looks like for a
local-first app (warn before writes start failing? nothing else to do?)
before it's a real user complaint rather than a hypothetical, similar in
spirit to A10's large-dataset validation but specifically about running
low on space rather than running slow.

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).

### B1. Space management — shipped in v3.6.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.6.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### B2. Filters on Kanban + saved filters
Search/filter exists in List and Table only (a deliberate v2 scope cut, can
be revisited). Add the same filter bar to Kanban, then let any filter
combination be saved as a named view per project.

### B3. Notification actions — shipped in v3.7.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### B4. Import/export v2
Current JSON export is a raw doc dump. Add: export a single project,
CSV export for tables, and a guided import that previews what will be
created/skipped before writing.

### B5. Multi-device polish
`Source` already distinguishes pc/pc2/mobile. Surface it: "edited on mobile,
2h ago" in CardDetail history, and a per-device last-seen list in Settings —
useful once sync spans 3+ devices.

### B6. Tag management — shipped in v3.6.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.6.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

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
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

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

### B16. Custom fields
Tasks currently have a fixed shape (title, body, priority, due date,
reminder, tags, pinned) — no way to add a project-specific field (e.g.
"URL", "Estimate", "Client"). Add a per-project custom field definition
(name + type: text/number/date/select) stored on `ProjectDoc`, rendered in
`CardDetail` after the built-in fields, and as extra columns in Table view.
Keep it opt-in and simple — this is the kind of feature that can easily
balloon into a mini database builder; resist that, a handful of typed
fields per project is the ceiling, not a schema editor.

### B17. Dashboard as a real home screen
`DashboardView.svelte` is already the default landing view, but it's thin —
worth deliberately investing in it as *the* first thing a user sees, not an
afterthought next to Kanban/List/Table. Candidates: a genuine "what needs
attention today" summary instead of raw counts, a quick-glance per-space
breakdown, and surfacing recently-completed tasks for a sense of progress.
Should stay fast and calm, not a cluttered analytics page — the goal is
"open the app, immediately know what to do," not a dashboard for its own
sake.

### B18. Subtasks / checklists within a task
`CardDetail` has a free-text markdown body but no structured checklist —
a natural fit given the notes field already exists. A simple `checklist:
{ text: string; done: boolean }[]` array on `TaskDoc`, rendered as tappable
checkboxes in `CardDetail`, with a small "3/5 done" progress indicator
surfaced on the card itself in Kanban/List/Table.

### B19. Bulk actions in List/Table
Every task action today is one-at-a-time. Add multi-select (checkbox per
row, shift-click range select) to List and Table views, with a bulk action
bar for move-to-status, add/remove tag, and delete — the same underlying
`updateTask()`/`deleteTask()` calls, just looped with one `reloadTasks()`
at the end instead of per-task.

### B20. Agenda widget
A second home-screen widget alongside B10's Quick Add — read-only, showing
the next 2-3 due tasks via the same `getAllTasksDue()` query already used
by the Agenda view. Reuses the `AppWidgetProvider`/RemoteViews plumbing
B10 already established; the main new work is `updatePeriodMillis`-driven
refresh (Quick Add's widget never needed to update itself after creation,
this one does whenever the underlying data changes).

---

## Track C — Public Release & Open Source

Goal: the mission above, made concrete. Unlike Track A/B, these aren't
paired into a version bump each — they're mostly one-time setup work, and
several can start independently of whatever A/B release is in flight.

### C1. Open-source the repository on GitHub
Push the existing local repo public: pick a license (leaning MIT — the
goal is people freely using and forking this, not enforcing copyleft
against anyone), add `LICENSE`, a `CONTRIBUTING.md`, issue templates, and a
README written for someone who has never seen this project before, not
just this local CLAUDE.md-oriented one. Audit for anything that assumes a
local-only environment (paths, comments referencing internal-only context)
before it goes public. Blocked on **C7** (credential cleanup) and a real
stability/security pass — see the note there and in DECISIONS.md.

### C2. Zero-config first run, verified
The architecture is already local-first with no required server, but this
needs to be *verified*, not assumed: a fresh install, no CouchDB configured,
should never prompt for setup or imply something is missing. Audit
first-run copy (Settings → Sync especially) to state plainly that sync is
optional, not a "you should really configure this" nag.

### C3. Play Store listing
A signed release build (proper keystore, not the debug one), a Play
Console developer account, and store listing assets — icon, screenshots,
short/long description, and a privacy policy page (required even with zero
telemetry — "we collect nothing" still needs to be a page). Copy should
frame Offlog as a calm personal tool, not pitch it against Trello/Notion/
ClickUp/Jira by feature count.

### C4. F-Droid listing — declined
Considered and explicitly declined by the owner (2026-07-02): Offlog isn't
being positioned as "an app that needs to be in every store." Distribution
stays to GitHub + a website + Google Play; no iOS. See DECISIONS.md.
Number kept (not reused) so it's clear this was a decision, not an
oversight.

### C5. Public web install landing page
For anyone who'd rather not go through an app store: a small, plain
landing page (GitHub Pages is enough) with a single "Install" / "Add to
Home Screen" button for the existing PWA build — no jargon, no setup
explanation needed for the common case.

### C6. Brand & positioning pass
A short pass over README/store copy/landing page copy to make sure the
"not competing, just likable" framing from the Mission above actually
comes through — description text should sell the feeling of using Offlog,
not a feature-parity checklist against bigger tools.

### C7. Fix hardcoded CouchDB credentials — mandatory, blocks C1
`offlog-app/src/config.ts` hardcodes a real CouchDB password and LAN IP as
fallback defaults, present in git history too. **This must be fixed before
the repo goes public or any store listing goes live** — not optional, not
best-effort. Also the reason the repo stays private for now (see
DECISIONS.md): going public happens only after this is fixed *and* the app
has had a real stability/security pass. Fix approach: no real credentials
in source at all, `.env.local`-only with no committed fallback; if the
existing local repo's history matters to keep, this may mean publishing to
GitHub as fresh history rather than pushing this repo's full log — decide
at the time based on how much of the commit history is worth keeping
public vs. how much scrubbing it needs.

---

## Track D — Mesh Sync — declined (2026-07-03)

Considered at length (device-mesh sync: every device also acts as a
server, paired via QR code, no central server required) and explicitly
declined by the owner. Number kept, not reused, so this reads as a
considered decision rather than an oversight — same pattern as C4.

Two independent reasons closed it, not just one:
- **Technical**: the design depended on each Android device running a
  background CouchDB-compatible HTTP server, reachable even while the app
  isn't in the foreground. The closest real precedent, Syncthing-Android,
  only manages this via a foreground service with a permanent notification
  plus the user manually exempting it from battery optimization — and
  Android 15 now caps that class of foreground service at 6 hours of
  background runtime per 24-hour period, so the platform is getting more
  restrictive over time, not less. Separately, two devices that are never
  on the same network can't sync peer-to-peer without some kind of relay,
  which contradicts the "no server Offlog operates" pitch this track was
  built on.
- **Strategic**: Offlog is a single-user personal project with no
  business model and no plan to build one (see below) — the engineering
  cost (native background-service work, a mandatory security review,
  N-way conflict testing across 3+ devices) isn't worth it for a feature
  that mainly matters at a multi-device-users scale this project doesn't
  have and isn't trying to reach.

**CouchDB sync remains the permanent, only sync transport** — self-hosted,
already works today, not going anywhere. Full reasoning: DECISIONS.md.

---

## Business model — none, deliberately

Offlog has no business model and isn't getting one. It's a personal tool,
built by the owner for their own use and given away as free, open-source
software because someone else might want the same thing — not a product
being positioned for revenue.

- **Never paywalled, never feature-gated, never ad-supported, never sells
  data** — not negotiable, and there's no "optional paid convenience
  layer" planned either, unlike some comparable local-first tools
  (Obsidian, Standard Notes, Bitwarden) that do sell one.
- **GitHub Sponsors / a simple donation link** is fine to add once the
  repo is public, if people want to use it — but it's not a plan, a goal,
  or something to build product around, just a door left open.
- **The Play Store listing stays free**, no in-app purchase, ever.

See DECISIONS.md (2026-07-03) for the reasoning behind dropping the
hosted-sync-relay idea that used to live in this section.

---

## Open questions

Anything genuinely unresolved — technical feasibility, business-model
specifics, security tradeoffs — that would benefit from an outside AI's or
human's opinion lives in [QUESTIONS.md](QUESTIONS.md), not scattered inline
here. Check there before assuming an item above is fully settled.

---

## Sequencing suggestion

The original 5:10 Track A:B split below is fully paired through v4.0.0.
A15–A17 and B11–B20 (added while reshaping Settings in v3.6.0 and while
scoping the app's growth beyond v4.0.0) aren't slotted into a release yet —
re-pair them alongside whichever future items land, rather than
force-fitting them into the table below. Track C runs independently of
version numbers: **C7 (credential fix) and C2 can start now**, in parallel
with v3.8.0, since they're documentation/verification/security work that
barely touches app code; **C1/C3/C5/C6 fit naturally once the app feels
"finished enough" to represent well in a public listing** — realistically
after v4.0.0, once the current Track A/B backlog has landed. Track D (mesh
sync) was declined outright (see above) and never entered sequencing.

| Release | Track A | Track B | Why paired |
|---|---|---|---|
| **v3.6.0** | A9 — UI component tests | B1 — Space management, B6 — Tag management | Both features are small, self-contained "manage X in Settings" screens — same shape, low risk, a good first target to exercise the new component-testing setup from A9 before anything more complex. |
| **v3.7.0** (shipped) | A13 — Accessibility re-audit, A14 — Android hardware back-button handling | B3 — Notification actions, B10 — Android quick-capture widget | An Android-focused release — both features are native-only surface (notification action buttons, home-screen widget). A14 (found during v3.6.0's Settings redesign) folded in here since it's squarely Android interaction plumbing, same as A13's focus on the newest interactive elements. **Moved ahead of the original v3.7.0** per owner request to prioritize Android work first. |
| **v3.8.0** | A11 — Error-handling audit, pass 2 | B2 — Kanban filters, B9 — Command palette | Both add many new mutation/action call sites — auditing the try/catch + `showError()` invariant first makes it a live checklist while building these, not a separate pass done after the fact. |
| **v3.9.0** | A10 — Large-dataset performance validation | B7 — Calendar/week view, B4 — Import/export v2 | Both features are data-volume-sensitive (a new heavier render view, bulk export/import) — validating performance at scale in the same cycle catches regressions before they ship, not after. |
| **v4.0.0** | A12 — Notification reliability audit | B5 — Multi-device polish, B8 — Project templates | A12 and B5 both deal with sync/timing edge cases (DST, timezones, multi-device drift) — natural fit. B8 closes out the roadmap; the milestone bump to v4.0.0 marks the whole current plan shipped. |

Within each release: land the Track A item first (or in the same PR as the
first Track B item it protects/enables), then the two Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land — don't let
coverage fall behind again. Re-evaluate this table after each release;
delete shipped rows and re-pair whatever's left if new items get added to
either track in the meantime.
