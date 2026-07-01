# Offlog — Technical Documentation

Version 2.7.2 · Local-first task management for browser and Android

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
4. Conflicts: PouchDB default "last write wins" — sufficient for single-user use
5. The app works fully offline; sync resumes automatically on reconnect
6. Sync URL is set in the sidebar settings panel and stored in `localStorage`

---

## Theme System

All colors are CSS custom properties in `app.css`:

- `:root` — light theme
- `body.dark` — dark theme overrides
- `color: var(--text)` is set on `body` so it cascades everywhere

Dark mode is applied before the app renders (early `<script>` in `index.html`) to prevent flash of light mode. The sidebar always uses a dark color scheme regardless of page theme.

Key tokens: `--bg`, `--surface`, `--col-bg`, `--text`, `--muted`, `--faint`, `--border`, `--accent`, `--danger`, `--overdue-bg/ink`, `--due-soon-bg/ink`

### v2.5 palette refresh

The v2.4.x palette used near-identical tones for `--bg` and `--col-bg`, which made Kanban status columns visually blend into the empty page — they *were* stretching to fill the available width (flex-grow was always working correctly), but low contrast made filled space look empty. v2.5 raises contrast and saturation:

| Token | v2.4.x (light) | v2.5 (light) |
|---|---|---|
| `--col-bg` | `#edf0f7` (barely distinct from `--bg`) | `#e7ebfb` (clearly indigo-tinted) |
| `--accent` | `#2d6be4` (flat blue) | `#6d5ef5` (vivid violet-blue) |
| `--sidebar-bg` | `#1a1e27` (plain gray-navy) | `#14162a` (deeper indigo-black) |

Priority colors (`constants.ts`) moved from muted grays/ochres to saturated Tailwind-style tones: Low `#34D399` (emerald), Medium `#FBBF24` (amber), High `#F43F5E` (rose). Dark mode received matching contrast increases (`--col-bg: #232842`, `--accent: #8b7bff`).

---

## View Persistence

The last active view is saved to `localStorage` key `offlog_view` as `{ view: 'dashboard' | 'agenda' | 'project', projectId }`. On load, `App.svelte` restores it. Active space/project IDs are also saved separately so the sidebar highlights the right item.

---

## PWA (Web)

`vite.config.ts` configures `vite-plugin-pwa` in `generateSW` mode, which produces at build time:

- `dist/manifest.webmanifest` — app name, `theme_color`/`background_color` (`#14162a`, matching the sidebar), `display: 'standalone'`, and icons (both `any` and `maskable` purpose, reusing the same flattened-navy `icon-192.png`/`icon-512.png` used everywhere else — see icon section above)
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

## Known Limitations / Future Work

| Area | Note |
|---|---|
| Undo buffer | In-memory only — lost on page refresh |
| Conflict resolution | Last-write-wins — fine for single user, not multi-user |
| No Kanban filter | Search/filter only available in List and Table views (by design — not planned) |
| No bulk actions | No multi-select / bulk move or delete (not planned) |
| No recurring tasks | Not planned |
| Android app icon | As of v2.6.1, web + Android use the same source (`C:\Users\hrach\Downloads\new_icon.png`, flattened onto navy `#14162a` for legacy/web use, kept transparent with a safe-zone-padded copy for the adaptive icon foreground layer). This may still be a placeholder pending final branding |
| Android-specific bugs (backlog) | Project delete (×) requiring long-press, and the soft-keyboard "Go" action not submitting — need testing on an actual device/emulator, tracked for a future mobile-focused pass |

---

## Version History

| Version | Changes |
|---|---|
| **2.7.2** | Fixed the Agenda "badge-count" (task count next to OVERDUE/THIS WEEK/LATER labels) rendering invisible — `background: currentColor` on `.badge-count` always reads the *element's own* `color` property, which the same rule also set to `var(--surface)` (white), so the pill was white-on-white regardless of the parent label's intended color. Each label variant now gets an explicit `background` (`.overdue-label .badge-count`, etc.) instead of relying on `currentColor`. Also fixed "Mark done" (the circle next to each Agenda task) appearing to do nothing: `getAllTasksDue()` in `db.ts` returned every task with a due date regardless of whether it was already sitting in its project's last ("Completed") column, so clicking mark-done correctly moved the task there in the database, but it never left the Agenda list — zero visible feedback. The query now fetches projects, resolves each task's last-column ID, and excludes already-completed tasks (also now excludes archived tasks, which it hadn't before). Additionally, the service worker's default update check only runs on a fresh navigation — an installed PWA that's brought back to the foreground without being fully closed first can sit on a stale cached build. Added a `visibilitychange` listener in `main.ts` that calls the update-check function whenever the tab/app regains focus, so new builds are picked up without requiring a manual close-and-reopen |
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
