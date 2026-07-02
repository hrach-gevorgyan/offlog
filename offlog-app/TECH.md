# Offlog — Technical Documentation

Version 3.7.0 · Local-first task management for browser and Android

> Contributor conventions, invariants, and the release checklist live in
> [CLAUDE.md](../CLAUDE.md). Planned work lives in [ROADMAP.md](../ROADMAP.md).
> This file documents how the system currently works.

---

## Why This Project Exists

Offlog is a personal task management tool built to work exactly the way one person wants — no subscriptions, no cloud vendor lock-in, no unnecessary features. Everything runs locally in the browser or on Android. Sync is optional and goes through a self-hosted CouchDB server on the local network.

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
│    ├── TableView        (compact grid)             │
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

    Sidebar.svelte         Left nav: spaces, projects, sync indicator, dark toggle
    DashboardView.svelte   Home screen: project cards grid + pinned/overdue panels
    KanbanBoard.svelte     Drag-and-drop kanban (mouse + touch)
    ListView.svelte        List view with search, filter, sort, archive
    TableView.svelte       Compact grid view with sortable columns
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
| `dueLabel(due, fallback)` | ListView, TableView |
| `dueLabelLong(due)` | DashboardView, DeadlinesView |
| `dueRelative(due)` | DeadlinesView |
| `dueState(due)` | ListView |
| `dueInk(due)` | TableView |
| `filterTasks(tasks, search, col, prio, tag)` | ListView, TableView |

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

| Version | Changes |
|---|---|
| **3.7.0** | Android-focused release — roadmap A13 (accessibility re-audit) + A14 (hardware back-button handling) + B3 (notification actions) + B10 (quick-capture app shortcut), reordered ahead of the original v3.7.0 per owner request. **A14**: new `modalStack.ts` — every overlay (`ConfirmDialog`, `TrashView`, `ChangelogView`, `SpaceManager`, `TagManager`, `SettingsPanel`, `MaintenanceModal`, `QuickAdd`, `GlobalSearch`, `CardDetail`) pushes one `history` entry on open via `closeOnBack()`; the hardware/gesture back button (and browser back) now pops it via a single shared `popstate` listener that calls whichever close callback is on top of the stack, LIFO. `App.svelte` dynamically imports `@capacitor/app` (no-op on web) and delegates to `window.history.back()` when there's somewhere to go back to, otherwise lets Capacitor exit/minimize the app normally. Two race conditions surfaced and were fixed live: (1) the mobile sidebar drawer's close previously also routed through history, but tapping a nav item closes the drawer *and* opens another overlay in the same tick — `history.back()` resolves asynchronously via `popstate` while the new overlay's `pushState()` runs synchronously, so the two interleaved and the new overlay silently failed to open; fixed by leaving the drawer's close as a plain state flip with no history involvement (documented as deliberate in `App.svelte`). (2) `GlobalSearch` opening a result's `CardDetail` had the same issue; added `discardTop()` to `modalStack.ts` — removes this layer's stack entry with no `history.back()` navigation, for "replaced by another overlay" as opposed to "dismissed outright." **A13**: new `focusTrap.ts` (`use:trapFocus` action) applied to all ten overlay components above — traps Tab/Shift+Tab cycling within the panel and restores focus to the triggering element on close, none of which happened before. **B3**: `notifications.ts` registers a `REMINDER_ACTIONS` action type (`@capacitor/local-notifications`) with "Done" and "Snooze 1h" buttons on every scheduled reminder; the `localNotificationActionPerformed` listener now branches on `action.actionId` — `done` moves the task to its project's last column (the same positional "done" rule used everywhere else), `snooze` pushes `reminder_at` out one hour, anything else falls through to the existing tap-to-open behavior. **B10**: a static Android App Shortcut ("Quick Add", long-press the launcher icon) resolves a `com.offlog.app://quickadd` intent, matched by a new `<intent-filter>` on `MainActivity` and forwarded to the webview as a plain `offlogQuickAdd` window event via `Bridge.triggerJSEvent()` — `App.svelte` listens for it and opens `QuickAdd` directly, skipping the full app launch flow. Also fixed two owner-reported issues found during review: the List view's tag/status/due-date columns were plain flex siblings, so a variable number of tag chips shifted the status and due-date columns sideways by a different amount on every row; `.task-row` is now a fixed 5-column CSS grid (circle/title/tags/status/due), each column a stable width regardless of tag count. And `QuickAdd`'s project picker was a native `<select>`, which renders as a bare unstyled OS list sheet on Android; replaced with a new `CustomSelect.svelte` — a themed, keyboard-navigable dropdown (grouped by space, Up/Down/Enter/Escape, click-outside-to-close) matching every other overlay's styling |
| **3.6.0** | First paired release from the sequencing plan: roadmap A9 (UI component test infrastructure) + B1 (Space management) + B6 (Tag management). `tests/db.test.ts` grew from 26 to 35 tests, adding coverage for the new `createSpace`/`updateSpace`/`reorderSpaces`/`deleteSpace` and `getTagCounts`/`renameTag`/`deleteTagEverywhere` functions in `db.ts`. New `SpaceManager.svelte` (rename/recolor/reorder/delete spaces — "Unsorted" can't be deleted, its projects reassign there like `repairDatabase()` already does for orphans) and `TagManager.svelte` (rename — which merges if the target tag already exists — and delete a tag across every task at once), both lazy-loaded slide-in panels opened from Settings. **Full Settings redesign**, prompted by direct feedback that the flat single-column list of sections had become cluttered: extracted `SettingsPanel.svelte` and `MaintenanceModal.svelte` out of `Sidebar.svelte` entirely, into a category/detail layout — desktop shows a left nav rail + content pane side by side; mobile (<640px) shows the category list first, then a full-width detail view with an on-screen "‹ Back" button. The mobile pattern was a deliberate choice after confirming (via grep) that the app has no Android hardware back-button handling anywhere — a real two-column layout would have been unusably cramped on a ~360-400px phone, and relying on the hardware back button to navigate between categories would have exited the app instead (tracked as new roadmap item A14). As a side effect of the extraction, the main JS bundle dropped from ~205 KB to ~77 KB, since `db.ts` now loads as a separately-chunked module pulled in by the lazy settings panels rather than being force-bundled into the eager main chunk |
| 3.5.0 | Two fixes surfaced by owner testing of v3.4.0's now-working conflict detection, plus an Android launch-experience fix. (1) `.settings-panel` had no `max-height`/`overflow-y` — once the (correctly, for the first time) populated conflict list grew past ~5 items, the panel overflowed both the top and bottom of the viewport with the header and Cancel/Save buttons pushed off-screen and unreachable. Capped at `min(85vh, 720px)` with internal scroll; verified live by resolving a real conflict through the UI. (2) The Android splash screen was never actually wired to the AndroidX SplashScreen API — `styles.xml`'s `AppTheme.NoActionBarLaunch` only set the legacy `android:background`, which `Theme.SplashScreen` (the `androidx.core.splashscreen` compat theme already a dependency) doesn't read at all. On API 31+ (targetSdk 36 puts nearly every real device here), Android was silently falling back to a plain white background with a default-scaled icon regardless of what `drawable/splash.png` contained — a jarring white flash into a charcoal-branded app, likely what read as "animations not so good." Fixed by setting `windowSplashScreenBackground`/`windowSplashScreenAnimatedIcon`/`postSplashScreenTheme` properly and calling `SplashScreen.installSplashScreen(this)` in `MainActivity.onCreate()` (required for correct behavior below API 31, and keeps the splash visible until WebView content is actually ready instead of dismissing early). Also regenerated the splash source images (`assets/splash.png`, `assets/splash-dark.png`) with the current charcoal brand background (`#181a20`) and centered logo, replacing the old default white-background splash asset — verified only splash PNGs changed (launcher icons were byte-identical after regeneration, confirmed via `git status`) |
| 3.4.0 | Roadmap items A6 (automated tests) and A8 (further bundle diet). **A6**: first test infrastructure in the project — Vitest + `pouchdb-adapter-memory` (`vitest.config.ts`, `tests/setup.ts`, `npm test`), 26 tests in `tests/db.test.ts` covering `posBetween`, project/task CRUD, the 25-result `getTasksForProject()` truncation risk, undo/Deleted (`getRecentlyDeleted`/`getAllDeletedTasks`/`undoDelete`/`deleteForever`/`emptyTrash`), the "done = last column" convention (verified independently in both `getAllTasksDue()` and `getDashboardData()` — the two queries have no shared helper enforcing it, only convention), `checkIntegrity`/`repairDatabase`, sync conflict resolution, `importJSON` validation, log/trash retention pruning, and a bootstrap smoke test (`seedIfEmpty()`). **Two real, previously-shipped bugs were caught and fixed in the process**: (1) `scanConflicts()`, `checkIntegrity()`, and `getConflicts()` all read `row.value.conflicts` from `db.allDocs({conflicts:true})` — that field has never existed in PouchDB's API (conflicts are only ever attached to `row.doc._conflicts`), so the conflict-count badge and conflict detection have been silently non-functional since they shipped in v3.1.0; fixed to read `row.doc._conflicts` (and `scanConflicts()` now passes the `include_docs:true` that field requires, which it was also missing). (2) `resolveConflict()`'s "keep other" path never removed the adopted revision's own old leaf, so choosing a side didn't fully resolve the conflict — it left one conflicting revision behind. **A8**: `CardDetail`'s history panel is now a dynamic import (`TaskHistoryPanel.svelte`, its own ~2 KB chunk) instead of always being in the main bundle. Investigated the `pouchdb-find` duplication question by temporarily disabling its import and diffing the build: it accounts for **~51 KB raw / ~16.7 KB gzipped** of the main chunk, structurally duplicating utility code already present in the separately-loaded `public/pouchdb.js` UMD bundle — this is inherent to the "UMD core + ESM plugin" loading strategy (see the top-of-file comment in `db.ts` for why that split exists) and not something a small fix resolves; eliminating it would mean dropping the UMD script entirely, a larger architectural change intentionally left out of scope here |
| 3.3.0 | Redesigned the bottom sidebar row and native-dialog replacement, based on direct feedback on v3.2.0: the "Changelog / Recycle" two-row layout was cramped and the storage cleanup button lacked explanation. Now a single row of three compact icon+label buttons (Changelog / Deleted / Settings) with a proper gear icon (was accidentally a sunburst) and a quiet muted count instead of a bright notification-style badge. Recycle was also renamed once more to "Deleted" per feedback that "Recycle" still read oddly as a label. Replaced every `window.confirm()` call app-wide (task delete, project delete, remove status, archive column, delete-forever, empty Recycle — 6 call sites) with a themed in-app `ConfirmDialog.svelte` (+ `confirm.ts`'s promise-based `confirmAction()`), matching the app's surface/border/radius tokens instead of the unstyled native browser popup. Consolidated Check Database / Repair Issues / Optimize Storage (previously three separate, under-explained Settings buttons) into one Maintenance modal that runs all five steps in order — check, repair, prune history, prune trash, compact — with a live progress bar and a per-step outcome note, so "what does this button actually do" has a concrete on-screen answer. Removed the now-dead `optimizeStorage()` combinator in `db.ts` (superseded by the step-by-step orchestration in `Sidebar.svelte`) |
| 3.2.0 | Trash is now a dedicated top-level view (new `TrashView.svelte`, nav entry between Agenda and the space list, with a live item-count badge), not a list embedded in Settings — feedback after v3.1.1 was that a growing "Recently Deleted" list didn't belong in a settings panel. Shows every deleted task (not just the last 10), with per-task Restore and permanent Delete Forever, plus a top-level "Empty Trash". New `getAllDeletedTasks()`, `deleteForever()`, `emptyTrash()` in `db.ts`; `getRecentlyDeleted()` still exists but now only backs the 5-second undo toast. Settings' Maintenance section also got a real rework: "Clean Up Now" (which only removed doc *records*, not the actual on-disk space they occupied) is now "Optimize Storage" — a new `optimizeStorage()` runs the existing retention prunes *and* calls `db.compact()`, which is the step that actually reclaims space from old PouchDB/IndexedDB revisions |
| 3.1.1 | Two follow-ups to A1/A2 raised after testing v3.1.0's "Recently Deleted" list at scale (verified live with 50 dummy tasks across all 5 projects, 25 soft-deleted): confirmed the list correctly stays capped at 10 rows regardless of how many tasks are deleted — `getRecentlyDeleted(10)` was always bounded, this wasn't a bug. But the underlying soft-deleted docs themselves had no retention policy (unlike logs, which already had one from A2) — unbounded growth risk of the same kind. Added `pruneOldDeletedTasks()` (3-month retention, shorter than the 6-month log window since "Recently Deleted" already only ever surfaces the last 10 regardless of age) and `maybePruneOldDeletedTasks()`, wired into `store.ts`'s `init()` alongside the log pruning call. Also added `getStorageBreakdown()` — Settings' existing "X MB used" line is real but not actionable (it can't say *what's* using the space); Data now shows a doc-count breakdown (active/archived/deleted tasks, history entries) with the retention windows stated inline, plus a manual "Clean Up Now" button in Maintenance that runs both retention policies immediately instead of waiting for their weekly schedule |
| 3.1.0 | First roadmap pass — Track A (Performance & Stability) items A1, A2, A3, A4, A5, A7. **A1 persistent undo**: the in-memory `_undoBuffer` array (lost on refresh) is gone; `getRecentlyDeleted()` queries soft-deleted tasks directly from the database instead, so undo survives a page reload. Settings gained a "Recently Deleted" list (last 10) with per-task Restore, independent of the 5-second toast. **A2 changelog growth control**: `getLogsForTask()` now queries through the existing `idx-type-ref` Mango index instead of scanning every `log:` doc; added `pruneOldLogs()` (6-month retention) called at most once a week via `maybePruneOldLogs()` in `store.ts`'s `init()`. **A3 conflict resolution UI**: new `getConflicts()`/`resolveConflict()` in `db.ts` — Settings shows each conflicted document's current vs. other revision (with update timestamps) and lets the user pick a winner, instead of the previous reporting-only badge plus a blunt "discard everything but current" repair. **A4 startup**: `seedIfEmpty()` now short-circuits on a `localStorage` flag after the first successful seed instead of re-querying `getSpaces()` on every launch forever; `store.ts`'s `reload()` fetches spaces/projects/tasks with `Promise.all` instead of sequentially (tasks only ever depended on the already-known `activeProjectId`, not on the other two); `init()` runs `initIndexes()` and `seedIfEmpty()` concurrently since neither depends on the other. **A5 sync robustness**: `syncNow()` used to open a second, fully independent `db.sync()` replication running concurrently with the live one from `startSync()` — both hitting the same remote at once. It now cancels and replaces the live handler in place (shared `attachSyncHandlers()`), so exactly one replication runs at a time. Added `syncState.lastErrorAt`, surfaced in Settings as "Last error at HH:MM: <message>". **A7 bundle diet**: `ChangelogView.svelte` is now a dynamic `import()` behind the "Changelog" button instead of a static import always bundled into the main chunk — it now ships as its own ~3.5 KB chunk, loaded only when opened |
| 3.0.1 | Code-quality cleanup pass — zero Svelte compiler warnings remain. Converted every clickable `<span>` that was suppressing a11y warnings into a real `<button>` with an `aria-label` (Agenda/List "mark done" circles, CardDetail tag-remove and tag-suggestion chips, Kanban status-rename pencil), gave the search results proper `listbox`/`option` ARIA semantics (keyboard nav already lived on the input), and made the dark-mode toggle a labeled `role="switch"`. Added a `--success` token (light `#22c55e` / dark `#4ade80`) and replaced the last scattered hardcoded greens (sync-ok indicator, "This week" agenda label/badge/chip, List done-circle) plus the remaining rgba() literal indicator shadows with `var(--success)`/`color-mix()`. Removed stale `svelte-ignore` comments that no longer suppressed anything |
| 3.0.0 | **Brand color system**: full palette rewrite (soft neutral-gray background, indigo accent — see Theme System above) applied via CSS custom properties only, replacing hardcoded colors that had drifted out of sync across `Sidebar.svelte`, `DeadlinesView.svelte`, `ListView.svelte`, `GlobalSearch.svelte`, `ChangelogView.svelte`, and `CardDetail.svelte` since as far back as the v2.4.x palette. Also removed a fully dead duplicate hardcoded palette block on `Sidebar.svelte`'s `.settings-panel` (verified via DOM structure that the panel is a sibling of `<aside>`, not a descendant, so it was never actually shadowed by the sidebar's dark overrides and had simply drifted). Propagated to the PWA manifest, `<meta name="theme-color">`, Android `colorPrimary`/`colorAccent`, and the notification icon color. **Usability pass**: keyboard shortcuts panel (press `?`), Escape closes any open modal, `:focus-visible` outline restored app-wide for keyboard navigation (many components had `outline: none` on `:focus`, which also silently strips keyboard focus indicators), keyboard-operable task rows/cards across Kanban/List/Table/Dashboard/Agenda (`role="button" tabindex="0"` + Enter/Space handling), sidebar active-state and hover language unified (space nav and top-level nav now share the same accent-tinted active style), Kanban column-action buttons (rename/archive/remove) no longer invisible on touch devices (were hover-only via `opacity: 0`) |
| 2.9.2 | Three Android/Agenda fixes reported directly from a real device. (1) The Agenda's Overdue chip showed the duration twice ("63d overdue · 63d overdue · Wed, Apr 29") — `dueLabelLong()` already embeds "Xd overdue" internally, but the template also called `dueRelative()` (which returns the same "Xd overdue" text) and concatenated both; removed the redundant `dueRelative()` call for the overdue row specifically (the "this week"/"later" rows were already correct, since `dueLabelLong()` omits the relative prefix for non-overdue dates). (2) Notifications showed a generic system alert-triangle icon instead of the app's icon — Android status bar icons must be a plain white silhouette with transparency; the app's full-color launcher icon doesn't qualify and Android silently substitutes a fallback. Generated a proper monochrome mountain-glyph icon (`assets/notification-icon.svg` → `ic_stat_notify.png` at all densities) and configured `LocalNotifications.smallIcon`/`iconColor` in `capacitor.config.ts`. (3) User asked why reminders didn't fire until manually enabling "Alarms & reminders" in Android settings — traced to `@capacitor/local-notifications`'s own Android implementation: it already gracefully falls back to inexact (`AlarmManager.set`) delivery when `canScheduleExactAlarms()` is false, rather than crashing, but inexact delivery under Android's Doze/battery restrictions can be delayed by several minutes. This is an OS-level restriction the app can't bypass without a custom native settings-intent (out of scope for this session, needs on-device testing); added a clear explanation in Settings instead of leaving it as an unexplained manual step |
| 2.9.1 | Fixed `getDashboardData()`'s `overdueTasks` list showing tasks that were overdue but already sitting in their project's last ("Completed") column. `byProject[...].overdue` (the per-project count shown on each project card) already excluded them via a `column_id !== lastColId` check, but the flat `overdueTasks` array used for the "⚠ Overdue" panel never applied that same filter — an inconsistency between the two, not a new bug introduced by any prior change. Verified with a throwaway task: appears in the list while active, disappears once moved to the last column |
| 2.9.0 | Pre-3.0 hardening pass — see Performance & Reliability section above. Real `pouchdb-find` indexing (the plugin was never actually registered against the global PouchDB, despite being a dependency — found and fixed), an in-memory task cache invalidated centrally, a caught-before-shipping `db.find()` default-25-result-limit bug, crash recovery (App.svelte error boundary + global unhandled-rejection net), error handling audited and filled in across every remaining unguarded mutation, and a new database integrity checker + repair utility in Settings. Also cleaned up several leftover test-data cards that earlier notification testing had accidentally left in the real synced database, and fixed a Dashboard bug where `DashboardView.svelte`'s `.task-proj` project-name badge had no `max-width` — a long project name (e.g. "Just testing purpose") could squeeze the flexible `.task-title` down to near-zero width in the narrow 320px right column, making the task's actual title invisible and the project name look like it had taken its place |
| 2.8.0 | **Notifications**: new `reminder_at` field on tasks (independent of `due_date`), set via a `datetime-local` picker in CardDetail. Android uses `@capacitor/local-notifications` — fires even while the app is fully closed, via native OS scheduling. Web uses the Notification API with `setTimeout` scheduling (best-effort, requires the tab/PWA to be running) plus a 1-hour catch-up check on load for reminders missed while closed. Clicking a notification opens the task via a new `pendingOpenTaskId` store. Scheduling uses a simple cancel-all-then-reschedule-from-scratch model on every store reload rather than tracking individual mutation sites — see Notifications section above. **Sync reliability**: `lastSynced` now persists across app restarts (was in-memory only), real offline detection via `navigator.onLine` + online/offline events (distinct from generic sync errors), human-readable error messages instead of raw error dumps, a visible retry-attempt count, and conflict-count reporting in the sidebar (reporting only, no resolution UI) |
| 2.7.2 | Fixed the Agenda "badge-count" (task count next to OVERDUE/THIS WEEK/LATER labels) rendering invisible — `background: currentColor` on `.badge-count` always reads the *element's own* `color` property, which the same rule also set to `var(--surface)` (white), so the pill was white-on-white regardless of the parent label's intended color. Each label variant now gets an explicit `background` (`.overdue-label .badge-count`, etc.) instead of relying on `currentColor`. Also fixed "Mark done" (the circle next to each Agenda task) appearing to do nothing: `getAllTasksDue()` in `db.ts` returned every task with a due date regardless of whether it was already sitting in its project's last ("Completed") column, so clicking mark-done correctly moved the task there in the database, but it never left the Agenda list — zero visible feedback. The query now fetches projects, resolves each task's last-column ID, and excludes already-completed tasks (also now excludes archived tasks, which it hadn't before). Additionally, the service worker's default update check only runs on a fresh navigation — an installed PWA that's brought back to the foreground without being fully closed first can sit on a stale cached build. Added a `visibilitychange` listener in `main.ts` that calls the update-check function whenever the tab/app regains focus, so new builds are picked up without requiring a manual close-and-reopen |
| 2.7.1 | Fixed inconsistent mobile header layout: Dashboard and Agenda rendered the hamburger menu in its own near-empty row above the title (via a wrapper in `App.svelte`), while the project/Kanban view has always shown hamburger + title inline in one compact row. Moved the hamburger button into `DashboardView.svelte` and `DeadlinesView.svelte` themselves (dispatching a `menu` event that `App.svelte` listens for), matching the project view's header pattern exactly. Also fixed a card-overlap bug on Dashboard surfaced by testing at narrow widths: `.project-grid`'s `grid-auto-rows: 130px` was a hard fixed height, so a card whose stats wrapped to two lines (task count + overdue badge) had its text overflow and overlap the title above; changed to `minmax(130px, auto)` |
| 2.7.0 | Added PWA support via `vite-plugin-pwa` — installable web app manifest + Workbox service worker precaching the app shell (JS/CSS/HTML/icons) for full offline use on desktop. Service worker registration is manual and web-only (skipped entirely on Android, where Capacitor already bundles assets natively); see PWA section above for the reasoning |
| 2.6.5 | Fixed the real cause of the "gray hover" over Changelog — reported on both PC and mobile. It was a z-index bug from the v2.4.1 `.scrim` consolidation: the shared global `.scrim` class (app.css) is `z-index: 400`, but `ChangelogView`'s own `.panel` was left at `z-index: 301` — *below* the scrim — so the semi-transparent dark overlay rendered on top of the panel, dimming/graying its content. Bumped to `z-index: 402` (matching the pattern used by `GlobalSearch` at 401 and `QuickAdd` at 501, both already correctly above the scrim) |
| 2.6.4 | Fixed a gray/dark double-overlay when opening Changelog or Settings from the mobile sidebar drawer. The "Dashboard", "Agenda", and project buttons all call `dispatch('navigate')`, which `App.svelte` uses to close the mobile sidebar (`sidebarOpen = false`) — but the "↩ Changelog" and "⚙ Settings" buttons never did, so the mobile drawer (with its own `.mobile-scrim`) stayed open underneath whatever modal was opened on top of it, and the two semi-transparent scrims stacked into a visibly darker/grayer overlay. Both buttons now dispatch `navigate` too |
| 2.6.3 | The 2.6.2 fix only patched `.layout` (the main desktop-flow container). Any UI that renders as its own `position: fixed` full-screen element — bypassing `.layout` entirely — still started at `y=0` and got its top cropped by the status-bar strip: the mobile sidebar drawer (`Sidebar.svelte`, `@media max-width:768px`), `CardDetail`'s edit panel, and `ChangelogView`'s panel. Added `padding-top: env(safe-area-inset-top)` (additive to each element's existing top padding) to all three. `QuickAdd` (bottom-anchored) and `GlobalSearch` (`top: 15vh`, already well clear of any status bar height) didn't need changes |
| 2.6.2 | Fixed the top of the app (including the sidebar hamburger button) being hidden behind the new colored status-bar strip. The v2.6.1 fix added `.status-bar-fill` at `z-index: 10000` but never pushed the actual app content down to make room for it — `.layout` started at `y=0` same as the strip, so the strip covered it. Added `padding-top: env(safe-area-inset-top)` + `box-sizing: border-box` to `.layout` so content now starts below the strip instead of under it |
| 2.6.1 | Real fix for the Android status bar (v2.6.0's approach was a no-op on targetSdk 36 — see explanation above); regenerated all icons (web + Android) from a new source image, with a properly safe-zone-padded adaptive icon foreground so circular/squircle launcher masks don't clip the artwork |
| 2.6.0 | (Superseded) Attempted Android status bar color fix via `setBackgroundColor()` — didn't work on Android 16 target; regenerated Android launcher icons from the *previous* `assets/icon-*.png` source, which turned out to itself be stale/mismatched vs. the actual web icon; fixed Dashboard pinned/overdue task rows having no click handler at all (`CardDetail` now opens on click, matching every other view) — this fix was correct and remains |
| 2.5.0 | Brighter/higher-contrast color palette (see above), `duplicateTask()` + Duplicate button in CardDetail, "Status" wording used consistently in all remaining UI strings, FAB hides behind any open modal/sidebar |
| 2.4.1 | Extracted `utils.ts` (shared date/filter helpers), removed dead `Counter.svelte`, fixed remaining `any` types, global `.scrim` class, error toast on failed DB writes |
| 2.4 | Dashboard set as home screen, responsive Dashboard/Agenda layouts, last-view persistence across refresh, Android APK + custom launcher icon, DB reseed to 4 spaces + Draft project |
