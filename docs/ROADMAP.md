# Offlog Roadmap

Baseline: **v3.8.0** (tag `v3.8.0`, 2026-07) — the current stable release.
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

## Shipped (Track A, v3.1.0 – v3.8.0; Track B, v3.6.0 – v3.7.0)

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
(quick-capture home-screen widget)**. v3.8.0 shipped four correctness bugs
(**A18** PWA force-update, **A19** first-launch Dashboard fallback, **A20**
List view mobile CSS cascade order, **A22** mark-done undo) alongside an
owner-requested rewrite that merged List and Table into one view — see
DECISIONS.md for why the merged view uses Table as its design baseline.
Full details in [CHANGELOG.md](CHANGELOG.md)'s per-version entries.

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

### A15. Widget/back-button regression coverage — shipped in v4.1.0
`tests/modalStack.test.ts` covers the LIFO stack order, `discardTop()` vs
`requestClose()`, and confirms `requestClose()` only ever delegates to
`history.back()` (never pops the stack directly — see the module's own
header comment on why that would desync it). One real gotcha hit while
writing these: jsdom's `history.back()` doesn't reliably fire a
`popstate` event the way real browsers eventually do, so a naive
`beforeEach` cleanup loop waiting on it spun forever and OOM'd the test
runner — worked around by making each test self-balance its own
push/pop pairs instead of relying on cross-test reset, and by testing
`requestClose()`'s actual contract (delegates to `history.back()`) via a
spy rather than waiting on navigation timing vitest can't control.

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

### A18. PWA not force-updating after a new version ships — shipped in v3.8.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.8.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A19. First launch should always open Dashboard — shipped in v3.8.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.8.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A20. List view attribute alignment still breaks with mixed deadlines — shipped in v3.8.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.8.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A21. Visual check: tag overflow past 3 tags — shipped in v3.8.0
Resolved as a side effect of the List/Table merge rewrite: tags now wrap
onto extra lines (`.cell-tags { flex-wrap: wrap }`) instead of clipping or
truncating. See [CHANGELOG.md](CHANGELOG.md)'s v3.8.0 entry. Number kept
(not renumbered/removed) so the sequencing table below stays accurate.

### A22. Accidental "mark done" click has no undo — shipped in v3.8.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.8.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A23. Sidebar scale test with 20+ projects — done in v3.9.0
Tested live by seeding (then removing) 22 dummy projects. It did **not**
hold up navigably as originally built — the whole sidebar scrolled as one
column, so Dashboard/Agenda/Spaces nav scrolled out of view once the
project list got long. Fixed: `.sidebar` no longer scrolls itself; only
`.projects-section` (`flex:1; min-height:0; overflow-y:auto`) does, so the
top nav and bottom sync/footer bar stay pinned regardless of project count.

### A24. Version-over-version performance metrics
Nothing currently measures whether a given release made the app faster or
slower — A10's large-dataset validation needs measurement infrastructure
anyway; formalize it into a small benchmark harness (Kanban/List/Table
render time, `getDashboardData()` latency, Global Search responsiveness)
that can be re-run release to release, not just once, to catch which
specific change made a part of the app heavier.

### A25. Quick Add widget opened the app but not Quick Add — shipped in v3.9.8
Root cause: `MainActivity.onCreate()` forwarded the widget's launch intent
to the webview via a custom `getBridge().triggerJSEvent("offlogQuickAdd", …)`
call, fired synchronously during native `onCreate()` — well before the
WebView had loaded far enough for `App.svelte`'s `onMount` listener to
exist, so on a cold start (app not already running) the event was lost
and tapping the widget just opened the app to Dashboard. Fixed by
switching to `@capacitor/app`'s own launch-URL handling instead:
`getLaunchUrl()` (read once at startup, covers cold start) plus an
`appUrlOpen` listener (covers warm start — Capacitor's own Bridge already
forwards `onNewIntent()` to every installed plugin, no custom native
forwarding code needed at all). `MainActivity.java`'s custom intent
handling was removed entirely as a result.

### A26. PWA staleness / dev workflow needs a decision — NOT started (harder, needs owner input)
Owner-reported: the installable PWA build repeatedly shows a stale
icon/design after an update, even after A18 (v3.8.0) added a forced
`registration.update()` call. Also flagged: confusion between the two
local dev ports (`5173` = `npm run dev`, no real service worker; `4174`
= `npm run preview`, added mid-session purely as a debugging aid to
exercise the *real* PWA/SW lifecycle — not a second "way to run the
app," and removed from `.claude/launch.json` now that its purpose is
written down here instead). The recurring staleness itself is the real
issue and needs an owner decision, not just another patch: options
range from a visible "update available, tap to refresh" banner (surfaces
the problem instead of silently retrying), to `registerType: 'prompt'`
instead of `'autoUpdate'` in `vite-plugin-pwa` (trades silent updates for
an explicit user-controlled refresh), to reducing what's precached so a
stale cache has less surface area, to reconsidering how much the
installable-PWA path is worth versus the Android APK as the primary
"real app" experience. Needs a scoping conversation before implementation.

### A27. Project-view no longer force-resets to Kanban on every refresh — shipped in v3.9.8
`currentView` was reset to `'kanban'` by a blanket reactive statement
keyed on `$activeProjectId` — which also fires when `onMount` restores
the last-open project from `localStorage` after a page refresh, so
reloading mid-List-view silently bounced back to Kanban. Kanban-as-
default only makes sense for a *deliberate* "go to this project" action
(sidebar/space click, dashboard project card). Fixed with an explicit
`goToProject()` helper called only from those navigation sites; the
Kanban/List choice itself is now also persisted in `offlog_view`
(`mode` field) and restored alongside the project id, so a refresh
returns you to exactly where you were.

### A28. Exact-alarm ("Alarms & reminders") permission has no in-app status/control — shipped in v3.9.8
Android splits notification scheduling into two separate grants:
`POST_NOTIFICATIONS` (can the app notify at all — already surfaced) and
the "Alarms & reminders" special app access (can it schedule an *exact*-
time alarm via `AlarmManager` — since Android 12, with no runtime prompt
dialog, only a system settings toggle). Without it, a reminder still
"fires," just batched into the OS's next low-power wakeup window,
sometimes minutes late, with nothing in the UI explaining why. Settings
→ Notifications previously only had a passive paragraph telling the
user to go find the toggle themselves. `@capacitor/local-notifications`
(already a dependency, v8.2.0) exposes exactly the needed API —
`checkExactNotificationSetting()` / `changeExactNotificationSetting()`
(the latter deep-links straight to the OS screen) — now wired up as a
live granted/denied status with an Enable button, re-checked every time
Settings opens (in case the user just came back from that screen).

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
afterthought next to Kanban/List/Table. Concretely: a brief last-week
performance summary (tasks completed, busiest project) and today's
upcoming tasks alongside the existing pinned/overdue panels — Agenda stays
unchanged, this is a glance-level preview, not a duplicate of it. Should
stay fast and calm, not a cluttered analytics page — the goal is "open the
app, immediately know what to do," not a dashboard for its own sake.

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

### B20. Agenda widget — shipped in v4.1.0
A second home-screen widget alongside B10's Quick Add — read-only,
showing the next 3 due tasks (`getAllTasksDue()`, same query/ordering as
the Agenda view). Turned out to need more than "reuse the AppWidgetProvider/
RemoteViews plumbing" implied: task data lives entirely in the WebView's
JS-side PouchDB, which native widget code has no access to at all — there
was no native DB a periodic `updatePeriodMillis` timer could re-query.
Built a small shared JS→native bridge instead (`OffologWidgetPlugin.java`,
an app-local Capacitor plugin registered directly in `MainActivity`, not
an npm package): `src/lib/widgetBridge.ts` computes the widget's data and
pushes it after every `store.ts` `reload()` (init + every live sync/local
change — the same place `rescheduleAll()` already runs from), the plugin
persists it to `SharedPreferences` and immediately asks
`AppWidgetManager` to redraw every instance. `updatePeriodMillis="0"`
(disabled) — a periodic poll would just re-render the same stale data
between pushes, so push-on-change is strictly better here. Tapping the
widget opens the Agenda view via `com.offlog.app://agenda`, same deep-link
pattern as B10's Quick Add.

### B21. Dark mode follows OS setting
Dark mode is currently a manual toggle only. Add a "Follow system" option
(default) alongside explicit Light/Dark, reading `prefers-color-scheme` on
both Android and PC/web, while keeping the existing manual override for
anyone who wants to diverge from the OS setting.

### B22. Named clients/devices
`Source` currently only distinguishes `pc`/`pc2`/`mobile` — not enough
once there's more than one PC or more than one phone in play. Let a device
be given a real name (e.g. "Work Laptop", "Hrach's Phone") on first
sync/setup, stored and surfaced everywhere `Source` currently shows up
(changelog, B5's multi-device polish).

### B23. Sidebar: last modified cards — shipped in v3.9.0
A small "recent" section in the sidebar surfacing the last modified
tasks across all projects, for quickly resuming whatever was just being
worked on without navigating back to its project. Shipped showing 2 (not
3 as originally scoped — trimmed after a live visual review), opening
the task's `CardDetail` directly.

### B24. Seed data: 3 spaces, not 4
`seedIfEmpty()`/`wipeAndReseed()` currently create Unsorted, Personal,
Family, and Work. Drop Family from the default seed — not every user has
one, and a space nobody asked for is clutter, not a feature. Down to
Unsorted, Personal, Work.

### B25. Deadline quick-suggestions on new card — shipped in v4.0.0
`CardDetail`'s due-date field (QuickAdd has no due-date field at all, by
design — it's a title+project-only fast-add) now has one-tap relative
shortcuts (Today, Tomorrow, 1 week, 1 month) alongside the existing date
picker, with the matching shortcut highlighted when it equals the
current due date.

### B26. Tag autocomplete beyond the current project — shipped in v4.0.0
`CardDetail`'s tag suggestions now rank tags already used in *this*
project first, with a clearly separated "Other tags" secondary group for
everywhere-else tags, rather than one flat undifferentiated list.
`getAllTags()` in `db.ts` gained an optional `projectId` filter.

### B27. Archived tasks are too hidden
Archived tasks are currently only reachable via a toggle inside List view
— easy to forget exists. Worth surfacing archived-task counts somewhere
more visible (Dashboard, project header) so "where did that task go" has
an obvious answer.

### B28. Rethink "last column = done"
The positional-done convention (`column_id === columns.at(-1)`) is a
locked invariant (see DECISIONS.md) for good reason — but it also means a
project's last status is *always* the done state, with no way to mark a
different column as "done" or have multiple terminal states. Needs a real
design conversation before any implementation — this may stay exactly as
it is after that conversation, but it hasn't been deliberately revisited
since it was first decided.

### B29. Show tags on Kanban cards
Tags currently render in List and Table but not on Kanban cards
themselves — add them (compact, matching the existing chip style) so
Kanban isn't the one view where tag context is invisible.

### B30. Notes length guardrail
`CardDetail`'s notes field is unbounded markdown free text — add a soft
length guardrail (a visible counter past some threshold, not a hard block)
so it stays "notes on a task," not an invitation to write a full document
inside a task card.

### B31. Third Android widget: project list — shipped in v4.1.0
Completes the "3 widgets" set — up to 4 projects, each row tapping
straight into that project (`com.offlog.app://project?id=<id>`, resolved
in `App.svelte` against the loaded `projects` store the same way the
localStorage view-restore already guards against a since-deleted
project). Shares `OffologWidgetPlugin`/`widgetBridge.ts` with B20 rather
than each widget getting its own bridge. Scoped down from "quick actions
(open, maybe quick-add-to-this-project)" to just open — RemoteViews rows
support one `PendingIntent` each with no per-row secondary action without
a full `RemoteViewsService`/adapter, which would be a lot of native
plumbing for a "maybe."

### B32. Archive a whole project
Today only individual tasks can be archived — there's no way to archive
an entire project at once (as distinct from deleting it, which is
destructive). Add a project-level archive action that archives the
project and, by default, its non-completed tasks, restorable the same way
individual archived tasks are.

### B33. Sub-projects
Nested project hierarchy — a project containing child projects, not just
a flat space → project → task structure. Genuinely large: touches the
data model (`ProjectDoc.space_id` becomes more like `parent_id`), every
view's project-picker UI, and Dashboard/sidebar nesting display. Needs its
own scoping pass before estimation, not a quick add.

### B34. Project pinning — shipped in v3.9.0
Same mechanism as existing task pinning (`pinned` field, always-sorts-to-
top), applied to projects — pin a project to the top of the sidebar/space
list for the ones actively being worked, same UX pattern already proven
for tasks.

### B35. Focus view — concept only, to be designed with the owner
A possible third project view alongside Kanban and List, working name
"Focus" (owner, 2026-07-03, raised while rewriting the List view). No
committed definition yet — the stated intent is to imagine it together
before scoping anything. Directional sketch to start that conversation
from: where Kanban answers "what's the state of everything" and List
answers "let me scan/sort the data," Focus would answer "what should I be
doing right now" — a deliberately small, calm surface (e.g. today's due +
pinned + one next task) rather than another way to render the full task
table. **Do not implement from this description** — it needs a real design
session with the owner first.

### B36. List view power customization — shipped in v3.8.5
Direction set by the owner (2026-07-03) right after the List/Table merge
and the from-scratch List rewrite. All seven pieces below shipped together
in v3.8.5, all per-device via `localStorage` (not per-project, not
synced — a phone and a PC may reasonably want different columns/filters):

- **Saved filters** — name and persist the current search/status/priority/
  tag combination per project, reapply or delete from a "Filters" menu.
- **Column selection** — show/hide Status, Priority, Due, Tags, Created,
  Updated, Device via a "Columns" menu.
- **Column reordering** — drag any column header to rearrange; order
  persists. A drag shows a left/right edge indicator on the header being
  dragged over, so it's visible which side of that column the dragged one
  will land on before you drop.
- **Native horizontal scrolling** — replaces the old responsive tiers
  entirely (no more hiding tags/status/priority at narrower widths). The
  grid sizes to its natural content width and the container scrolls once
  that's wider than available space — it does **not** cap at some fixed
  width just because it can scroll; on a wide screen with few columns
  visible, there's no scrollbar and no forced empty gap either.
- **No text truncation, guaranteed** — nothing in the grid ellipsizes.
  Long titles/status names make the row (and the whole scroll area) wider
  instead of clipping.
- **Multi-column sort** — **plain click** sorts by that column alone
  (replaces whatever sort was active); **Shift+click** adds it as a
  secondary/tertiary tiebreaker instead of replacing. Each sorted header
  shows an arrow, and — only once more than one column is active — a
  small number after the arrow (e.g. `↑2`) marking its position in the
  tiebreak order. Documented in-app via each header's tooltip, since nothing
  about a plain header button visually suggests Shift+click is possible.
  **Tags is not sortable** (no single ordering for a list of tags) — its
  header can still be dragged to reorder, just doesn't respond to a click;
  its tooltip says so explicitly rather than silently doing nothing.
- **More columns** — Created date, Updated date, and Device (`source`)
  joined Status/Priority/Due/Tags as togglable columns, all shown as full
  dates (month/day/year — no reason to abbreviate away the year now that
  nothing truncates and horizontal scroll exists for overflow).

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
A short pass over every public-facing document — README, store copy,
landing page copy, and any doc a stranger might actually read (not the
AI/contributor-facing ones like CLAUDE.md/DECISIONS.md) — to make sure the
"not competing, just likable" framing from the Mission above actually
comes through, written for humans discovering the project, not for
whoever's maintaining it. Description text should sell the feeling of
using Offlog, not a feature-parity checklist against bigger tools.

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

Re-paired 2026-07-03 from scratch across the entire unshipped backlog (13
Track A items, 30 Track B items) — the old v3.8.0–v4.0.0 pairing is
superseded entirely by the table below, not layered on top of it. Every
item unshipped at re-pairing time is placed exactly once, plus **B36**
(added later the same day) slotted into a new **v3.8.5** as a deliberate
exception to the pairing convention — see that row for why. **B35 (Focus
view) remains unscheduled** — it needs an owner design session before it
can be scoped into any release. Track C runs
independently of version numbers: **C7 (credential fix) and C2 can start
any time**, since they're documentation/verification/security work that
barely touches app code; **C1/C3/C5/C6 fit naturally once the app feels
"finished enough" to represent well in a public listing** — realistically
after this table's backlog has substantially landed. Track D (mesh sync)
was declined outright and never entered sequencing.

| # | Release | Track A | Track B | Why paired |
|---|---|---|---|---|
| — | v3.6.0 (shipped) | A9 | B1, B6 | Small, self-contained "manage X in Settings" screens — good first target for A9's new component-testing setup. |
| — | v3.7.0 (shipped) | A13, A14 | B3, B10 | Android-focused release — native-only surface (notification actions, home-screen widget) alongside the accessibility/back-button work that shaped it. |
| — | v3.8.0 (shipped) | A18, A19, A20, A21, A22 | — | Four user-visible correctness bugs (PWA not force-updating, wrong first-launch view, list-view alignment regression, an accidental-click with no safety net) plus the List/Table merge rewrite, which also resolved A21 (tag overflow) as a side effect. |
| — | v3.8.5 (shipped) | — | B36 | **Deliberately not a full A+B paired cycle** — owner request to treat this as a lighter, faster commit rhythm for List-view customization landing in pieces (filters, column selection/reorder, horizontal scroll, no-truncation guarantee, multi-column sort, more columns) rather than one big release. |
| — | v3.9.0 (shipped) | A23 | B23, B34 | All sidebar-focused. A23's scale test (seeded 22 dummy projects) found a real bug — the sidebar scrolled as one block and top nav disappeared — fixed alongside B23 (recent tasks) and B34 (pinning), plus a full visual pass on the sidebar per live feedback. |
| — | v4.0.0 (shipped) | — | B25, B26 | Both are card-creation input-assistance — deadline shortcuts and smarter tag autocomplete, same "make adding a task faster" investment. |
| — | v4.1.0 (shipped) | A15 | B20, B31 | The "3 widgets" release. A15's back-button/widget test coverage underpins all native surface — building the second and third widget in the same release extends that coverage to both immediately. |
| 1 | v4.2.0 | A16 | B13, B5, B22 | Sync + device-identity is one theme: robustness testing, the pause toggle, and per-device naming/multi-device polish all touch the same sync/device state. |
| 2 | v4.3.0 | A17 | B14 | Storage-pressure handling and explaining the quota number — same screen, same data. |
| 3 | v4.4.0 | A12 | B12 | Auto-reminder derivation adds exactly the DST/timezone-sensitive scheduling code A12 is auditing for — build it under audit, not after. |
| 4 | v4.5.0 | — | B21, B11 | Both are Settings → Appearance additions (system-follow dark mode, high contrast) — same screen, same review context. |
| 5 | v4.6.0 | A10, A24 | B4, B7 | Perf validation and the new benchmark harness (A24 formalizes what A10 needs anyway), tested against the two heaviest new features left. |
| 6 | v4.7.0 | A11 | B16, B19 | Custom fields and bulk actions are the two largest remaining new-mutation surfaces — audit error handling while building them, not after. |
| 7 | v4.8.0 | — | B27, B32, B15 | Archive-adjacent cleanup: archived-task discoverability, whole-project archive, and folding Maintenance into Settings — all housekeeping surfaces. |
| 8 | v4.9.0 | — | B17, B9 | Dashboard (now with weekly stats) and command palette — the two navigation-hub upgrades to the app's main surface. |
| 9 | v4.10.0 | — | B2, B18 | Kanban filters and subtasks/checklists — both card/board-level additions, same view layer. |
| 10 | v4.11.0 | — | B8, B30 | Final small-feature pair: project templates and a notes-length guardrail — leftover cleanup, no strong shared theme. |
| 11 | v4.12.0 | — | B33, B28 | Saved for last, deliberately isolated: sub-projects and rethinking "done = last column" are the two biggest open architecture questions left — each needs its own scoping conversation, not a feature-pairing shortcut. |
| — | (unscheduled) | — | B35 | Focus view — needs an owner design session before it can be scoped into a release at all. |

Within each release: land any Track A item first (or in the same PR as the
Track B item it protects/enables), then the Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land — don't let
coverage fall behind again. Re-evaluate this table after each release;
delete shipped rows and re-pair whatever's left if new items get added to
either track in the meantime. v3.8.5 is the one deliberate exception to
the pairing convention — see its row above.
