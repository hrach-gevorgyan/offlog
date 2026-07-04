# Offlog — Technical Documentation

Version 4.1.0 · Local-first task management for browser and Android

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
| Notifications | **@capacitor/local-notifications** (native) / Web Notification API | Task reminders — see below |
| PWA | **vite-plugin-pwa** (Workbox) | Installable, offline-capable desktop/web app — see below |
| Styling | **CSS Custom Properties** | Light/dark theme without any CSS framework |
| Fonts | Hanken Grotesk + IBM Plex Mono | Sans for UI, mono for timestamps and labels |

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│                     UI Layer                       │
│  App.svelte                                        │
│    ├── Sidebar.svelte   (spaces / project nav)     │
│    ├── DashboardView    (home — overview)          │
│    ├── KanbanBoard      (drag-and-drop columns)    │
│    ├── ListView         (sortable + filterable)    │
│    ├── DeadlinesView    (agenda by due date)       │
│    ├── CardDetail       (task editor modal)        │
│    ├── QuickAdd         (Ctrl+N fast-add)          │
│    ├── GlobalSearch     (Ctrl+K cross-project)     │
│    └── ChangelogView    (full activity log)        │
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
    PinStar.svelte        The shared task-pin star icon (used by CardDetail/Kanban/List)

    Sidebar.svelte         Left nav: spaces, projects, sync indicator, dark toggle
    DashboardView.svelte   Home screen: project cards grid + pinned/overdue panels
    KanbanBoard.svelte     Drag-and-drop kanban (mouse + touch)
    ListView.svelte        List view with search, filter, sort, archive
    DeadlinesView.svelte   Agenda grouped by: Overdue / Today / This Week / Later
    CardDetail.svelte      Full task editor modal with history
    QuickAdd.svelte        Ctrl+N fast-add modal (Space / Project selector)
    GlobalSearch.svelte    Ctrl+K debounced search across all tasks
    ChangelogView.svelte   Full activity log (last 80 entries)
```

---

## Data Model

All documents live in one PouchDB database named `offlog`. The `_id` prefix acts as the document type:

| ID prefix | Type | Key fields |
|---|---|---|
| `space:` | SpaceDoc | `name`, `color`, `position` |
| `project:` | ProjectDoc | `space_id`, `name`, `columns[]`, `default_view` |
| `task:` | TaskDoc | `project_id`, `column_id` (status), `title`, `body`, `priority`, `due_date`, `tags`, `pinned`, `deleted`, `archived` |
| `log:` | LogEntry | `ref` (task id), `action`, `diffs`, `timestamp` |

### Key conventions

- **Soft delete**: tasks get `deleted: true`, never hard-removed (avoids sync conflicts)
- **Archive**: tasks get `archived: true`, filtered from normal views, restorable
- **Duplicate**: `duplicateTask(id)` in `db.ts` clones a task into the same status column with `" (copy)"` appended to the title, a fresh `_id`, reset `pinned`/`archived`, and new timestamps
- **Priority**: `1` Low · `2` Medium · `3` High — shown as left border color (see palette below)
- **Pinned**: always sorts to top of any view
- **Source**: `'pc'` or `'mobile'` — set on write, used in changelog
- **"Status" vs "Column"**: internally, a project's stages are stored as `Column[]` on `columns` and each task references one via `column_id` — this is a legacy internal name. Every user-facing label calls it "Status" (e.g. "+ Status", "Rename status"); only variable/field names still say "column"

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

Both are exposed as **Check Database** / **Repair Issues** buttons in a new Maintenance section of Settings (`Sidebar.svelte`) — report only by default, repair requires an explicit confirm.

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

## How Sync Works

1. `startSync()` in `db.ts` starts a **live bidirectional PouchDB sync** with CouchDB
2. Any local write replicates to CouchDB immediately
3. Any remote change fires a PouchDB `.changes()` event → `store.ts` reloads all data
4. The app works fully offline; sync resumes automatically on reconnect
5. Sync URL is set in the sidebar settings panel and stored in `localStorage`

### Sync reliability (v2.8.0)

`syncState` in `db.ts` tracks more than just idle/syncing/error:

- **`lastSynced` persists across restarts** — written to `localStorage` (`offlog_last_synced`) on every successful sync, hydrated on module load. Previously this was in-memory only, so the sidebar showed "Not synced yet" after every app restart even if the last sync had succeeded moments before closing.
- **Real offline detection** — `window.addEventListener('online'/'offline', ...)` sets a dedicated `'offline'` status, distinct from `'error'`. When a sync error occurs while `navigator.onLine` is false, it's reported as offline rather than a misleading server/auth error (which is what it would otherwise look like). Coming back online immediately triggers `syncNow()`.
- **Human-readable errors** — `describeSyncError()` maps raw PouchDB/fetch errors (401/403, 404, network failures) to short, actionable text instead of a raw `Error: ...` object dump.
- **Retry count** — `syncState.retryCount` increments on each consecutive sync error (PouchDB's own `retry: true` already retries automatically; this just surfaces how many attempts have failed so far in the sidebar, e.g. "Cannot reach sync server (retry 3)").
- **Conflict reporting** — `scanConflicts()` runs after every successful sync via `db.allDocs({ conflicts: true })`, counting documents with unresolved conflicting revisions. Surfaced as a small warning badge in the sidebar when count > 0. This is *reporting only* — no resolution UI, by design (kept out of scope; PouchDB's default deterministic "last write wins" conflict resolution still applies underneath).

---

## Theme System — Brand Colors (v3.0)

All colors are CSS custom properties in `app.css` — no hardcoded colors anywhere else in the app, including the PWA manifest and Android native theming:

- `:root` — light theme
- `body.dark` — dark theme overrides
- `color: var(--text)` is set on `body` so it cascades everywhere
- Component-local overrides (e.g. `Sidebar.svelte`'s `.sidebar`, which is always dark regardless of page theme) redeclare the same variable names in their own scope rather than hardcoding values, so they stay in sync with any future palette change
- Derived tints (hover states, translucent highlights, badge backgrounds) use `color-mix(in srgb, var(--accent) X%, transparent)` instead of separately hardcoded rgba() values tied to whatever the accent used to be

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#F6F7F9` | `#181A20` | page background |
| `--surface` | `#FFFFFF` | `#242934` | cards, panels |
| `--sidebar-bg` | `#181A20` | `#101218` | sidebar (always dark) |
| `--col-bg` | `#ECEEF2` | `#1E222C` | Kanban column fill |
| `--border` | `#E2E4EA` | `#2F3542` | hairlines |
| `--border-strong` | `#C7CBD6` | `#3F4657` | scrollbar thumb, stronger dividers |
| `--hover` | `#ECEEF2` | `#2A2F3A` | row/button hover |
| `--text` | `#1F2937` | `#F3F4F6` | primary ink |
| `--muted` | `#4B5563` | `#A3A9B7` | secondary ink |
| `--faint` | `#9CA3AF` | `#6B7280` | tertiary ink, placeholders |
| `--accent` | `#6366F1` | `#818CF8` | indigo — buttons, active states, links |
| `--danger` | `#DC2626` | `#F87171` | destructive actions |
| `--success` | `#22C55E` | `#4ADE80` | done states, sync-ok indicator, "this week" agenda group |

The same accent (`#6366F1`) drives the PWA `theme_color`/`background_color` (`vite.config.ts`), the `<meta name="theme-color">` in `index.html`, Android's `colorPrimary`/`colorAccent` (`android/app/src/main/res/values/colors.xml`), and the notification icon color (`capacitor.config.ts`) — one brand color across web, installed PWA, and native app, updated in one place if it ever changes again.

Dark mode is applied before the app renders (early `<script>` in `index.html`) to prevent flash of light mode.

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

- **`setTimeout`-based scheduling** while the tab/PWA process is alive (covers the common case of leaving the app open or installed and running in the background)
- **Catch-up on load** — `catchUpWeb()` fires notifications immediately for any reminder that became due within the last hour while the app was closed, so a missed reminder isn't silently lost forever, just delayed until next open
- Clicking a web notification focuses the window and sets the same `pendingOpenTaskId` store used by the native path

Notification permission is requested lazily — either from the inline hint shown in `CardDetail` when a reminder is set but permission isn't granted yet, or from the new **Notifications** section in Settings (`Sidebar.svelte`), never proactively on app load.

---

## PWA (Web)

`vite.config.ts` configures `vite-plugin-pwa` in `generateSW` mode, which produces at build time:

- `dist/manifest.webmanifest` — app name, `theme_color`/`background_color` (`#181a20`, matching the sidebar), `display: 'standalone'`, and icons (both `any` and `maskable` purpose)
- `dist/sw.js` + `dist/workbox-*.js` — a Workbox service worker that precaches the built JS/CSS/HTML/icons (`globPatterns: ['**/*.{js,css,html,svg,png,ico}']`) so the app shell loads instantly offline
- `dist/registerSW.js` is **not** auto-injected (`injectRegister: false`) — registration is manual, see below

### Why registration is manual and web-only

`src/main.ts` checks `Capacitor.isNativePlatform()` first:
- **Native (Android)**: skip service worker entirely. Capacitor already bundles all assets into the APK and serves them via its own virtual `https://` scheme — a service worker there is redundant and risks serving stale cached JS across APK updates instead of the freshly installed version.
- **Web**: `import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))`. `registerType: 'autoUpdate'` means new builds activate automatically on next load rather than requiring a manual "update available" prompt.

### What the service worker does *not* touch

`runtimeCaching: []` — the service worker only precaches the static build shell. It never intercepts CouchDB sync requests (XHR/fetch to the configured sync URL) or any other runtime network call. PouchDB's own IndexedDB storage already provides the actual offline data layer completely independently of the service worker; the SW's only job is making the *app shell itself* (JS/CSS/HTML) installable and loadable with zero network, which browsers didn't previously get (only the Capacitor/Android build did).

### Result

The web build is now installable (browser "Install app" prompt / add-to-home-screen) and works fully offline on desktop, closing the gap where "local-first" previously only fully applied to the Android build.

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

## Version History

See [CHANGELOG.md](CHANGELOG.md) — the single source of truth for version
history (previously duplicated here and in the root README.md; consolidated
2026-07 to remove the duplication).
