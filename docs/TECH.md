# Offlog — Technical Documentation

Version 4.28.0 · Local-first task management for browser, Android, and PC (Tauri)

> Contributor conventions, invariants, and the release checklist live in
> [CLAUDE.md](../CLAUDE.md). Planned work (including the public-release path
> and security posture) lives in [ROADMAP.md](ROADMAP.md);
> why non-obvious choices were made in [DECISIONS.md](DECISIONS.md);
> version history in [CHANGELOG.md](CHANGELOG.md). This file documents how
> the system currently works — mission/pitch lives in the root [README.md](../README.md),
> not duplicated here.

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| UI Framework | **Svelte 5** + TypeScript | Reactive without virtual DOM, minimal bundle size |
| Build Tool | **Vite 8** | Instant HMR, fast production builds |
| Local Database | **PouchDB 9** | IndexedDB in browser, speaks CouchDB replication protocol |
| Sync Server | **CouchDB** | Self-hosted, optional. App works fully offline without it |
| Mobile Wrapper | **Capacitor 7** | Wraps Vite build into a WebView-based Android APK |
| Desktop Wrapper | **Tauri 2** (`offlog-desktop/`) | Wraps the same Vite build into a Windows app; embeds a CouchDB sync host — see "Desktop (Tauri)" below |
| Notifications | **@capacitor/local-notifications** (native) / Web Notification API | Task reminders — see below |
| Styling | **CSS Custom Properties** | Light/dark theme without any CSS framework |
| Fonts | Hanken Grotesk (only) | IBM Plex Mono removed 2026-07-19; `--mono` (labels/timestamps' uppercase treatment) now points at the same face |

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│                     UI Layer                       │
│  App.svelte                                        │
│    ├── Sidebar.svelte   (spaces / project nav)     │
│    ├── DashboardView    (home — overview)          │
│    ├── FocusView        (daily commitment lock)    │
│    ├── KanbanBoard      (drag-and-drop columns)    │
│    ├── ListView         (sortable + filterable)    │
│    ├── DeadlinesView    (agenda: list + week grid) │
│    ├── CardDetail       (task editor modal)        │
│    ├── QuickAdd         (Ctrl+N fast-add)          │
│    ├── GlobalSearch     (Ctrl+K cross-project)     │
│    ├── SettingsPanel    (6-tab settings)           │
│    └── TimeTravelView   (journal: log: by day)     │
└────────────────────┬──────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────┐
│              Store Layer  (store.ts)               │
│  Svelte writable stores: spaces, projects, tasks   │
│  activeSpaceId, activeProjectId                    │
│  Persisted to localStorage; reload on DB change    │
└────────────────────┬──────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────┐
│            Database Layer  (db.ts)                 │
│  PouchDB (IndexedDB in browser)                    │
│  · All CRUD operations for spaces/projects/tasks   │
│  · Changelog writer (every mutation → log: doc)   │
│  · Undo buffer: last 10 deleted tasks in-memory   │
│  · CouchDB live sync (optional)                   │
└────────────────────┬──────────────────────────────┘
                     │  replication protocol
┌────────────────────▼──────────────────────────────┐
│          CouchDB  (self-hosted, optional)           │
│  Single database: offlog                           │
│  All devices sync through one node                 │
└───────────────────────────────────────────────────┘
```

---

## Source File Map

All paths below are relative to `offlog-app/` (the app source root):

```
src/
  App.svelte              Root: view routing, keyboard shortcuts, undo toast stack
  app.css                 Global CSS, all custom property tokens (light + dark)
  config.ts               CouchDB URL + credentials (from .env.local)
  main.ts                 Svelte mount entry point

  lib/
    db.ts                 All PouchDB operations + sync + changelog
    store.ts              Svelte stores — the only reactive state layer
    types.ts              TypeScript interfaces: SpaceDoc, ProjectDoc, TaskDoc, Column
    constants.ts          Priority colors, priority labels, default column definitions
    utils.ts              Shared pure functions: dueLabel, dueState, dueInk, filterTasks
    theme.ts              Light/Dark/System mode, high contrast, reduce motion
    motion.ts             Shared Svelte transition params/functions (panels, popovers, toasts)
    modalStack.ts         Back-button/Escape close ordering for every overlay (closeOnBack())
    discovery.ts          Track E: mDNS host discovery + pairing handshake (Android side)
    confirm.ts            confirmAction() — promise-based wrapper around ConfirmDialog
    commands.ts           Command palette (Ctrl+K) action list
    spaceIcons.ts          The 25-icon space-icon picker set + resolver
    focusTrap.ts           use:trapFocus action shared by every modal/panel
    logFormat.ts           Plain-English log: doc formatting (describeLog/fmt/entityLabel),
                            used by TimeTravelView.svelte (extracted from the old
                            ChangelogView.svelte, which it replaced — see its own git history)
    nlpParse.ts             parseQuickAdd() — local regex-based NLP for QuickAdd.svelte
                            (dates/times/#tags/!priority/@project out of free-typed text,
                            no network call — see DECISIONS.md for why not an LLM call)
    PinStar.svelte        The shared task-pin star icon (used by CardDetail/Kanban/List)

    Sidebar.svelte              Left nav: spaces, projects, sync indicator, dark toggle
    DashboardView.svelte        Home screen: project cards grid + pinned/overdue panels
    FocusView.svelte            Daily commitment lock (pick up to 3 tasks) + corkboard picker
    KanbanBoard.svelte          Drag-and-drop kanban (mouse + touch)
    ListView.svelte             List/Table view with search, filter, sort, archive
    FilterBar.svelte            Shared Kanban/List search+filter row
    DeadlinesView.svelte        Agenda: flat list (Overdue/Today/This Week/Later) + week-grid view
    CardDetail.svelte           Full task editor modal with history
    TaskHistoryPanel.svelte     Lazy-loaded change history for one task
    QuickAdd.svelte             Ctrl+N fast-add modal (Space / Project selector); live-parses
                                 the title via nlpParse.ts for dates/times/#tags/!priority/
                                 @project, shown as chips, stripped from the saved title; a "?"
                                 button opens an inline syntax cheat-sheet (a local popover
                                 like CustomSelect's dropdown, not a closeOnBack()-tracked modal)
    GlobalSearch.svelte         Ctrl+K debounced search across all tasks
    TimeTravelView.svelte       Log: docs grouped by local calendar day, most recent first,
                                 click a task entry to open it — replaced the old
                                 ChangelogView.svelte (2026-07-18: two views reading the same
                                 log: data was redundant; this kept the richer one — day
                                 grouping, further-back pagination, click-to-open — and folded
                                 in ChangelogView's per-row detail (project name, device/
                                 source pill, Clear all) that the day-grouped version launched
                                 without). Opened from Sidebar's bottom icon row, same slot
                                 Changelog used to occupy — not a primary Dashboard/Focus/
                                 Agenda-style view, it's a history *utility*.
    SettingsPanel.svelte        Settings — 6 tabs (View & Accessibility, Notifications, Sync,
                                 Organize, Backup & Storage, Advanced), standalone panel (moved
                                 out of Sidebar.svelte in the v4.26.0 redesign)
    TrashView.svelte            Recycle bin for soft-deleted tasks
    SpaceManager.svelte         Manage spaces (Settings → Organize)
    TagManager.svelte           Manage tags (Settings → Organize)
    CustomFieldManager.svelte   Manage global custom fields (Settings → Organize)
    ArchivedProjectsManager.svelte  Manage archived projects (Settings → Organize)
    CustomSelect.svelte         Themed dropdown, replaces every native <select>
    CalendarPicker.svelte       Themed date picker, replaces native <input type="date">
    TimePicker.svelte           Themed time picker, replaces native <input type="time">
    ConfirmDialog.svelte        Themed confirm() replacement, driven by confirm.ts
    NamePrompt.svelte           First-run "name this device" prompt
    AppLock.svelte              PIN lock screen (B54) -- mounted at App.svelte's root,
                                 gated by config.ts's isAppLockEnabled(). Deliberately
                                 does NOT use modalStack.ts's closeOnBack() (Escape must
                                 not dismiss a lock screen); App.svelte makes the rest of
                                 the app `inert` (not just visually covered) while locked
```

---

## Data Model

All documents live in one PouchDB database named `offlog`. The `_id` prefix acts as the document type:

| ID prefix | Type | Key fields |
|---|---|---|
| `space:` | SpaceDoc | `name`, `color`, `position` |
| `project:` | ProjectDoc | `space_id`, `name`, `columns[]`, `default_view` |
| `task:` | TaskDoc | `project_id`, `column_id` (status), `title`, `body`, `priority`, `due_date`, `tags`, `pinned`, `deleted`, `archived`, `recurrence` |
| `log:` | LogEntry | `ref` (task id), `action`, `diffs`, `timestamp` |

### Key conventions

- **Soft delete**: tasks get `deleted: true`, never hard-removed (avoids sync conflicts)
- **Archive**: tasks get `archived: true`, filtered from normal views, restorable
- **Duplicate**: `duplicateTask(id)` in `db.ts` clones a task into the same status column with `" (copy)"` appended to the title, a fresh `_id`, reset `pinned`/`archived`, and new timestamps
- **Priority**: `1` Low · `2` Medium · `3` High — shown as left border color (see palette below)
- **Pinned**: always sorts to top of any view
- **Source**: `'pc'` or `'mobile'` — set on write, used in changelog
- **"Status" vs "Column"**: internally, a project's stages are stored as `Column[]` on `columns` and each task references one via `column_id` — this is a legacy internal name. Every user-facing label calls it "Status" (e.g. "+ Status", "Rename status"); only variable/field names still say "column"
- **Recurrence**: `recurrence?: 'daily' | 'weekly' | 'monthly' | null` on TaskDoc — no custom interval by design (v1 scope). One task object per series, matching Todoist/Google Tasks/Microsoft To Do/Apple Reminders — **not** a new card per completion (tried first, reverted same day on owner feedback: "now we have two task with same name"). `db.ts`'s `updateTask()` detects a move into the project's last column (the positional "done" check); if the task is recurring, `computeRecurrenceReset()`'s fields win over the caller's `changes` and the *same* task is written back into the first column with due_date advanced from the *original* due_date (not from today, so a late completion doesn't drift the schedule) and checklist items reset to unchecked, all in one write. The log entry still records the real transition ("moved to Done, due date advanced to X") even though the task itself never rests there. `ListView.svelte`'s mark-done undo snapshots due_date/reminder_at/checklist too, not just column_id, since undoing a recurring completion has to revert all of them.

---

## Performance & Reliability (v2.9.0)

A pre-3.0 hardening pass — no new user-facing features, just making the existing ones fast and resilient at scale.

### Real database indexing

`pouchdb-find` is a listed dependency, but the global `PouchDB` object (loaded as a UMD script in `index.html`, core-only) never actually had it registered — `db.createIndex`/`db.find` didn't exist on it despite the type references. `db.ts` now imports `pouchdb-find` as an ES module and calls `PouchDB.plugin(PouchDBFind)` against the global constructor before first use.

`getTasksForProject()` — the single hottest read in the app, called on every project switch and every reload — now queries through a real Mango index on `['type', 'project_id']` via `db.find()` instead of scanning every task in the database and filtering in JS. Measured on an isolated 5,000-task synthetic database (never touching the real synced data): **~831ms per full-scan-and-filter query vs. ~90ms via the indexed `find()`** for a single project's tasks — roughly 9x faster, and the gap widens the larger the total task count grows, since the old approach re-scanned *every* task in the database on *every* call regardless of which project was asked for.

**Bug caught during that same benchmark**: `pouchdb-find`'s `db.find()` silently defaults to a **25-result limit** when none is specified. Without an explicit `limit: 100000` in the query, any project past 25 tasks would have had its later tasks silently vanish from the board. Caught by comparing result counts against the old full-scan implementation during benchmarking — not from any user report — before it shipped.

### In-memory task cache

Cross-cutting reads — global search, the Dashboard, the Agenda, tag autocomplete — all need *every* task in the database, not just one project's, so an index can't reduce that to less than a full scan. `getAllTasksRaw()` in `db.ts` caches that full scan in memory and every one of those functions now reads from it instead of re-querying and re-parsing IndexedDB on every call (previously: every keystroke in Global Search re-ran a full `allDocs` scan).

Invalidation is centralized in `subscribe()` — the same function every live sync change and local reload already flows through — plus directly inside every task-writing function (`createTask`, `updateTask`, `duplicateTask`, `unarchiveTask`, `undoDelete`, `deleteProject`, `wipeAndReseed`, `importJSON`) as a safety net against any read-after-write race where a cached read could otherwise run before the async live-changes listener has invalidated it.

### Reduced redundant renders

- `store.ts`'s `activeProjectId` subscription used to independently re-fetch and set `tasks` on every project switch *and* skip-fire once immediately on module load (duplicating what `init()`'s own `reload()` already does moments later). Simplified to reuse the existing `reloadTasks()` helper and skip that redundant first firing.
- Fixed a stray `syncState.listeners` subscription in `Sidebar.svelte` that was never cleaned up on unmount (harmless in practice since the sidebar is a permanent singleton, but incorrect hygiene that would leak on any future refactor that could remount it).
- Removed a leftover dynamic `import('../lib/db')` in `Sidebar.svelte`'s `exportJSON()` — `db` is already statically imported everywhere else in the file, so the dynamic import only existed to trigger Vite's `INEFFECTIVE_DYNAMIC_IMPORT` warning on every build for no benefit.

### Crash recovery & error handling

- `App.svelte`'s `onMount` now wraps `init()` in a try/catch. If startup fails (corrupted IndexedDB, storage quota exceeded, etc.) the app shows a dedicated recovery screen with the error message and a Retry button instead of hanging on "Loading…" forever with no explanation.
- `main.ts` registers `window.addEventListener('unhandledrejection'/'error', ...)` as a last-resort net — any error that would otherwise fail silently (a click that does nothing, a promise rejection nobody awaited) now at least surfaces the existing red error toast instead of leaving the UI in an unexplained broken state.
- Audited every remaining task-mutating call site without error handling (several in `KanbanBoard.svelte`: quick-add, card drag-drop, column rename/add/remove/reorder, archive-column, touch drag; a couple in `ListView.svelte` and `DeadlinesView.svelte`'s "mark done"; `Sidebar.svelte`'s create/delete project and export) and wrapped each in try/catch + `showError()`, consistent with the pattern already used in `CardDetail.svelte`.

### Database integrity checker + repair utility

New in `db.ts`: `checkIntegrity()` scans every document and reports:
- orphaned projects (pointing to a missing space)
- orphaned tasks (pointing to a missing project)
- tasks referencing a status/column id that no longer exists on their project
- projects with zero statuses (flagged for manual review only — inventing default statuses for a project the user configured a specific way would be too destructive to do silently)
- unresolved sync conflicts (documents with `_conflicts`)

`repairDatabase()` applies safe, well-understood fixes for everything except the zero-statuses case: orphaned tasks/projects get reassigned to the Unsorted space (or archived if even that's missing), invalid status references reset to the project's first status, and conflicts are resolved by removing the losing revisions.

Both are exposed as **Check Database** / **Repair Issues** buttons in a new Maintenance section of Settings (`SettingsPanel.svelte`) — report only by default, repair requires an explicit confirm.

---

## Shared Utilities  (`utils.ts`)

All date-formatting and filter logic is centralized here — no duplication across views:

| Export | Used by |
|---|---|
| `dueLabel(due, fallback)` | ListView |
| `dueLabelLong(due)` | DashboardView, DeadlinesView |
| `dueRelative(due)` | DeadlinesView |
| `dueState(due)` | ListView |
| `dueInk(due)` | ListView |
| `filterTasks(tasks, search, col, prio, tag)` | ListView |

---

## Testing & Dev Workflows

### Generating test/dummy data

**For a full realistic scenario** (fresh project setup, or whenever you want
one command to populate everything at once): `offlog-app/scripts/seed-scenario.js`
is a ready-made, paste-into-DevTools-console script — 10 projects (1
archived), 60 active tasks (15 archived) spread across random
statuses/tags/priorities/deadlines, 6 soft-deleted tasks, and a small
fraction with notes or a checklist. Usage is documented in the file's own
header comment. Safe to re-run; every doc it creates is tagged `dummy`
(tasks) or titled `(dummy)` (projects) for easy identification/bulk-removal,
and it never touches pre-existing data.

**For anything smaller/more targeted**, write directly against the PouchDB
instance in the browser (`new PouchDB('offlog')` — it's a global, reachable
from `preview_eval` or the browser console) rather than driving the UI one
task at a time. Tag generated docs (e.g. `tags: ['dummy']`) so they're
identifiable and easy to bulk-remove later. Spread across every existing
project **and** across each project's actual statuses (fetch real column ids
first — CLAUDE.md's `column_id` invariant applies here too: assign
`column.id`, never the whole column object). Reload the page after writing so

### Resetting to a fresh state (do this after every test round)

Dev/test state accumulates silently release over release if it's never
torn down — E2's dev/prod identity-collision bug (ROADMAP.md) was
literally found *because of* exactly this kind of buildup. Run a reset
before any "does this look right for a brand-new user" check, not just
when something looks broken:

- **Desktop (`offlog-desktop`)**: `powershell -ExecutionPolicy Bypass -File
  offlog-desktop/scripts/reset-dev-env.ps1` — wipes the debug build's
  isolated CouchDB copy and its `sync-host.dev.json` identity. Add
  `-IncludeRelease` only if you're deliberately testing a from-scratch
  real install and are OK losing its local config too. Never touches
  `vendor/couchdb-win/` itself (the pristine downloaded binaries) or any
  real synced data.
- **Web/browser**: in DevTools console, `new PouchDB('offlog').destroy()
  .then(() => localStorage.clear())`, then reload — this is also the
  right way to reproduce a genuine first-run (localStorage's `SEEDED_KEY`
  gates the real auto-seed of 3 starter spaces; clearing PouchDB alone
  without localStorage produces an artificial zero-spaces state that
  doesn't happen on a real fresh install).
- **Android**: `adb shell pm clear com.offlog.app.debug` for a debug
  build, or uninstall/reinstall via Android Studio for a true fresh
  install (same "owner runs Android Studio" rule as any other Android
  verification step).
the live `subscribe()` change feed and in-memory task cache pick it up.

### `tests/setup.ts`'s Node/localStorage workaround

`tests/db.test.ts` (Vitest, `vitest.config.ts`) covers `db.ts`'s pure/query
logic against `pouchdb-adapter-memory`. `tests/setup.ts` stubs the global
`PouchDB` (normally the UMD script) and works around a Node/jsdom conflict:
Node 20+'s own experimental `localStorage` global shadows jsdom's, so rather
than fighting over which one wins, `setup.ts` installs a tiny in-memory
polyfill instead. The `db` instance is a module-level singleton reused
across the whole test file, same as in the real app — tests get isolation
from a `beforeEach` that wipes every doc, not from a fresh instance.

---

## How Sync Works

1. `startSync()` in `db.ts` starts a **live bidirectional PouchDB sync** with CouchDB
2. Any local write replicates to CouchDB immediately
3. Any remote change fires a PouchDB `.changes()` event → `store.ts` reloads all data
4. The app works fully offline; sync resumes automatically on reconnect
5. Sync URL is set in the sidebar settings panel and stored in `localStorage`; on the Tauri desktop app it's resolved automatically instead — see "Desktop (Tauri)" below for why that default differs from plain desktop web

### Sync reliability (v2.8.0)

`syncState` in `db.ts` tracks more than just idle/syncing/error:

- **`lastSynced` persists across restarts** — written to `localStorage` (`offlog_last_synced`) on every successful sync, hydrated on module load. Previously this was in-memory only, so the sidebar showed "Not synced yet" after every app restart even if the last sync had succeeded moments before closing.
- **Real offline detection** — `window.addEventListener('online'/'offline', ...)` sets a dedicated `'offline'` status, distinct from `'error'`. When a sync error occurs while `navigator.onLine` is false, it's reported as offline rather than a misleading server/auth error (which is what it would otherwise look like). Coming back online immediately triggers `syncNow()`.
- **Human-readable errors** — `describeSyncError()` maps raw PouchDB/fetch errors (401/403, 404, network failures) to short, actionable text instead of a raw `Error: ...` object dump.
- **Retry count** — `syncState.retryCount` increments on each consecutive sync error (PouchDB's own `retry: true` already retries automatically; this just surfaces how many attempts have failed so far in the sidebar, e.g. "Cannot reach sync server (retry 3)").
- **Conflict reporting** — `scanConflicts()` runs after every successful sync via `db.allDocs({ conflicts: true })`, counting documents with unresolved conflicting revisions. Surfaced as a small warning badge in the sidebar when count > 0. This is *reporting only* — no resolution UI, by design (kept out of scope; PouchDB's default deterministic "last write wins" conflict resolution still applies underneath).

---

## Theme System — Brand Colors (v3.0)

All colors are CSS custom properties in `app.css` — no hardcoded colors anywhere else in the app, including Android native theming:

- `:root` — light theme
- `body.dark` — dark theme overrides
- `color: var(--text)` is set on `body` so it cascades everywhere
- `Sidebar.svelte`'s `.sidebar` follows the page theme via `--sidebar-bg` like every other surface (used to be pinned dark regardless of theme; changed 2026-07-17 on owner feedback that light mode deserved a light sidebar, not a dark panel stapled onto a light page)
- Derived tints (hover states, translucent highlights, badge backgrounds) use `color-mix(in srgb, var(--accent) X%, transparent)` instead of separately hardcoded rgba() values tied to whatever the accent used to be

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#F6F7F9` | `#181A20` | page background |
| `--surface` | `#FFFFFF` | `#242934` | cards, panels |
| `--sidebar-bg` | `#FBFBFC` | `#101218` | sidebar (theme-aware since 2026-07-17; was pinned dark before) |
| `--statusbar-fill` | `#101218` | `#101218` | Android status-bar strip fill only — fixed dark in both themes, paired with `main.ts`'s unconditional light-icon status bar style; do not point this at `--sidebar-bg` |
| `--col-bg` | `#ECEEF2` | `#1E222C` | Kanban column fill |
| `--border` | `#E2E4EA` | `#2F3542` | hairlines |
| `--border-strong` | `#C7CBD6` | `#3F4657` | scrollbar thumb, stronger dividers |
| `--hover` | `#ECEEF2` | `#2A2F3A` | row/button hover |
| `--text` | `#1F2937` | `#F3F4F6` | primary ink |
| `--muted` | `#4B5563` | `#A3A9B7` | secondary ink |
| `--faint` | `#6B7280` | `#8B93A5` | tertiary ink, placeholders |
| `--accent` | `#5457E0` | `#818CF8` | indigo — buttons, active states, links |
| `--on-accent` | `#FFFFFF` | `#181A20` | text/icon color for anything on an `--accent`/`--overdue-ink`/`--due-soon-ink`/`--faint` background — these all swap lightness per theme the same way `--accent` does |
| `--ink-fixed-dark` | `#181A20` | `#181A20` | text color for anything on a `--success` background — fixed (not overridden in dark mode) since `--success` is bright in both themes, unlike the tokens `--on-accent` covers |
| `--danger` | `#DC2626` | `#F87171` | destructive actions |
| `--success` | `#22C55E` | `#4ADE80` | done states, sync-ok indicator, "this week" agenda group |

The same accent (`#6366F1`) drives the `<meta name="theme-color">` in `index.html`, Android's `colorPrimary`/`colorAccent` (`android/app/src/main/res/values/colors.xml`), and the notification icon color (`capacitor.config.ts`) — one brand color across web and native app, updated in one place if it ever changes again.

Dark mode is applied before the app renders (early `<script>` in `index.html`) to prevent flash of light mode.

**Gotcha (historical)**: `SettingsPanel.svelte`'s `.settings-panel` (a
standalone panel since the v4.26.0 redesign — it used to live inside
`Sidebar.svelte`) is a DOM **sibling** of the sidebar, not a descendant.
Before 2026-07-17 this meant it read page-level tokens while the sidebar
had its own pinned-dark overrides — worth documenting then, since a fix
attempt could easily have gone the wrong direction. Now that the sidebar
also just follows the page theme, both surfaces behave the same way and
this is no longer a special case — noted here only so the DOM
relationship itself (sibling, not descendant) isn't rediscovered as a
surprise later.

---

## View Persistence

The last active view is saved to `localStorage` key `offlog_view` as `{ view: 'dashboard' | 'agenda' | 'project', projectId }`. On load, `App.svelte` restores it. Active space/project IDs are also saved separately so the sidebar highlights the right item.

---

## Notifications (v2.8.0)

`src/lib/notifications.ts` is a single module handling both platforms, kept deliberately decoupled from `db.ts` in one direction only (`notifications.ts` imports `db.ts` for the reschedule query; `db.ts` never imports `notifications.ts`, avoiding any circular-import risk).

### Reminder field

`TaskDoc.reminder_at: string | null` — an absolute ISO timestamp, independent of `due_date`. Set via a `datetime-local` input in `CardDetail.svelte`; converted to/from local time explicitly (not `toISOString().slice(0,16)`, which would silently shift the displayed time to UTC) via a small `isoToLocalInput()` helper.

### Scheduling model: cancel-all-then-reschedule-from-scratch

Rather than tracking every individual create/update/delete/complete call site, `rescheduleAll()` is called once from `store.ts`'s `reload()` — which already runs after every local mutation and every incoming sync change. Each call:

1. Fetches all active (non-deleted, non-archived, not-in-last-column) tasks with a future `reminder_at` via `getAllActiveTasksWithReminders()` in `db.ts`
2. Cancels everything currently scheduled
3. Re-schedules from that fresh list

This is simple and self-healing — a task that's completed, deleted, archived, or has its reminder cleared just stops appearing in the query, so its notification is naturally cancelled on the next reload without any special-casing at the UI layer. At personal-task-manager scale (dozens to low hundreds of tasks) this is cheap enough to not need finer-grained diffing.

### Native (Android) — genuinely fires while fully closed

Uses `@capacitor/local-notifications`, which hands scheduling off to the OS (`AlarmManager`), so reminders fire even if the app process isn't running. Task ids (strings) are hashed to a deterministic 32-bit integer (`numericId()`) since the plugin requires numeric notification ids. Clicking a notification fires `localNotificationActionPerformed`, which sets `pendingOpenTaskId` — `App.svelte` watches this store and opens `CardDetail` for that task via `getTaskById()` + a lookup in the already-loaded `projects` store.

Requires `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, and `RECEIVE_BOOT_COMPLETED` in `AndroidManifest.xml` (added in this version).

### Web — best-effort, not a substitute for a push server

There is no push backend behind this app, so genuinely-closed-browser notifications aren't possible on web without one (a deliberate scope decision — this app is local-first with an optional self-hosted CouchDB, not a hosted service that could run a push relay). What's implemented instead:

- **`setTimeout`-based scheduling** while the tab is open (covers the common case of leaving the app open in the background)
- **Catch-up on load** — `catchUpWeb()` fires notifications immediately for any reminder that became due within the last hour while the app was closed, so a missed reminder isn't silently lost forever, just delayed until next open
- Clicking a web notification focuses the window and sets the same `pendingOpenTaskId` store used by the native path

Notification permission is requested lazily — either from the inline hint shown in `CardDetail` when a reminder is set but permission isn't granted yet, or from the new **Notifications** section in Settings (`SettingsPanel.svelte`), never proactively on app load.

---

## Mobile (Android)

Capacitor wraps the Vite `dist/` output into a WebView Android app. The web code runs identically — same PouchDB, same sync, same UI.

Mobile-specific adaptations:
- **Touch drag on Kanban**: HTML5 drag events don't fire on touch — uses `touchstart/touchmove/touchend` + `document.elementFromPoint`
- **`enterkeyhint`** on inputs: shows GO/Done on soft keyboard
- **Responsive CSS**: breakpoints at 900px, 768px, 600px, 440px
- **Source field**: `'mobile'` instead of `'pc'` for changelog tracking
- **Status bar** (v2.6.1): targetSdk 36 (Android 16) enforces edge-to-edge display; `StatusBar.setBackgroundColor()` is a hard no-op above API 35 regardless of what color is passed (confirmed by reading `@capacitor/status-bar`'s Android source — `shouldSetStatusBarColor()` returns `false` unconditionally once `targetSdk > 35`). Fighting this by trying to set a background color (the v2.6.0 approach) silently failed, leaving the system's default status bar with our light icon style on top — invisible icons on a light background. The fix embraces edge-to-edge instead: `main.ts` calls `StatusBar.setOverlaysWebView({ overlay: true })` (content draws behind the transparent status bar, standard for modern Android) and `StatusBar.setStyle({ style: Style.Dark })` for light/white icons (this call is *not* gated by the edge-to-edge check, so it still works). A colored strip (`.status-bar-fill` in `App.svelte`) is painted behind the transparent status bar using `height: env(safe-area-inset-top)` and `background: var(--sidebar-bg)`, so the (now-transparent) system icons sit on a dark background and stay visible. Requires `viewport-fit=cover` in the `index.html` viewport meta tag for `env(safe-area-inset-top)` to resolve to a nonzero value on notched/edge-to-edge devices — Capacitor's WebView bridge supplies the actual inset automatically once that's set

Build steps:
```bash
npm run build
npx cap sync android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android && .\gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Desktop (Tauri) — `offlog-desktop/`

Track E (ROADMAP.md E1). A sibling project to `offlog-app/`, not a
subfolder of it — `offlog-desktop/src-tauri/tauri.conf.json`'s
`frontendDist` points at `offlog-app/dist`, so it wraps the exact same
build Android and the browser use, unmodified. Same PouchDB-as-UMD-global
loading, same sync code, same UI — the only new code is Rust, and it
never touches the frontend's own logic.

**Embedded sync host** (`src-tauri/src/sync_host.rs`): on first launch,
generates a random port + admin password + Erlang node identity, persists
them (`app_data_dir()/sync-host.json`), rewrites the bundled CouchDB's
`local.ini`/`local.d`/`vm.args`, and spawns it as a child process — a
non-technical user never sees the word CouchDB. Binaries come from
`scripts/fetch-couchdb-win.ps1` (checksum-pinned, gitignored
`vendor/couchdb-win/`, not committed) since Apache doesn't publish
official Windows binaries itself. A Windows Job Object
(`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, `win32job` crate) keeps the whole
`couchdb.cmd` → `erl.exe` process tree tied to the app's own lifetime, on
every exit path (normal close, crash, force-kill) — killing only the
directly-tracked child process reliably leaves `erl.exe` orphaned,
LAN-reachable with real credentials, since it's a grandchild, not a
child.

**Discovery + pairing** (`src-tauri/src/discovery.rs`,
`src-tauri/src/pairing.rs`, `offlog-app/src/lib/discovery.ts`): the PC
advertises `_offlog._tcp` over mDNS (uuid + a pairing port in the TXT
record, deliberately zero credentials over the air) so a phone finds it
with no typed IP. Pairing itself is a separate one-endpoint HTTP server
(`tiny_http`) — the PC shows a 6-digit, single-use, 5-minute-expiry code;
the phone posts it to get real credentials back once. `config.ts`'s
`getSyncCredentials()`/`setSyncCredentials()` (localStorage-backed, same
pattern as the sync URL) replaced the old fixed `COUCH_USER`/`COUCH_PASS`
constants, which could never match a per-install random password.

**Sync-URL resolution is genuinely three-way**, not two — easy to get
wrong (it was, for most of a day): Android has no way to guess an
address, defaults to `''`. Plain desktop web assumes a manually-installed
CouchDB on the standard port, defaults to `127.0.0.1:5984`. The Tauri
app is neither — its embedded sidecar binds a random port, never 5984 —
so it needs `config.ts`'s `initTauriSyncDefaults()`, called at app boot
before `startSync()`, to resolve the real address via the async
`get_sync_info` Tauri command. Falling through to the desktop-web
default instead silently points the Tauri app at whatever else happens
to be listening on 5984.

Build steps:
```bash
cd offlog-app && npm run build            # produces the dist/ offlog-desktop wraps
cd ../offlog-desktop
powershell -ExecutionPolicy Bypass -File scripts/fetch-couchdb-win.ps1   # once, or after bumping its pinned version
cargo tauri build   # → src-tauri/target/release/bundle/nsis/*.exe
```

**Content Security Policy** (`tauri.conf.json`'s `app.security.csp`, enabled
2026-07-17, previously `null`): `script-src 'self'` (the one inline
`<script>` `index.html` used to have, for pre-paint dark-mode flash
prevention, moved to `public/theme-init.js` so it stays same-origin
instead of needing `'unsafe-inline'`); `style-src 'self' 'unsafe-inline'`
(`'unsafe-inline'` is required — several components set dynamic
`style="background:{color}"` attributes for per-space/per-priority
colors, e.g. `DashboardView.svelte`'s `.prio-bar`, and CSP has no way to
allow only those); `connect-src 'self' http://*:*` (required, not just a
convenience — sync/pairing targets are LAN addresses/ports discovered at
runtime via mDNS or the embedded sidecar's random port; CSP source lists
don't support CIDR ranges, so there's no way to scope the host tighter
than "any host over plain HTTP" without breaking the LAN-discovery model
the app is built around. **The `:*` matters and was originally missing**:
a bare `http://*` in CSP means "any host, default port (80) only" — it
does not imply "any port." Since every real sync target uses a
non-default port, that first version silently broke all sync while
looking otherwise correct, caught by a live post-enable click-through,
not by any static check); `img-src 'self'`,
`font-src 'self'` (self-hosted fonts only, no CDN); `object-src 'none'`,
`frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Net
effect: blocks loading/executing any remote script, blocks embedding in
a frame, blocks form submission or `<base>` hijacking to another origin
— contained even if something managed to inject markup, while still
allowing the app's genuine dynamic behavior (LAN sync, per-item colors).

---

## Version History

See [CHANGELOG.md](CHANGELOG.md) — the single source of truth for version
history (previously duplicated here and in the root README.md; consolidated
2026-07 to remove the duplication).
