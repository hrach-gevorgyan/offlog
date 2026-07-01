# Offlog

A local-first task management app built with Svelte 5, PouchDB, and Capacitor. Runs in the browser and as a native Android app. Syncs to CouchDB when available.

---

## Features

- **Spaces & Projects** — organize work into colored spaces, each containing multiple projects
- **Multiple views** — Kanban board, list, table, and agenda (deadlines) per project
- **Dashboard** — overview of all projects with pinned and overdue tasks at a glance
- **Quick Add** — Ctrl+N anywhere to create a task with space/project selector
- **Global Search** — Ctrl+K to search across all tasks instantly
- **Card detail** — full task editor with notes, priority, due date, tags, columns, and changelog
- **Dark mode** — toggle persisted to localStorage
- **Sync** — live CouchDB replication (optional); works fully offline without it
- **Undo** — soft-delete with in-memory undo buffer (last 10 deletions)
- **Android APK** — packaged with Capacitor 7

---

## Tech Stack

| Layer | Tool |
|---|---|
| UI framework | Svelte 5 + TypeScript |
| Build tool | Vite |
| Local database | PouchDB (UMD global via `public/pouchdb.js`) |
| Remote sync | CouchDB |
| Mobile wrapper | Capacitor 7 |
| Styling | CSS custom properties (no framework) |

---

## Project Structure

```
offlog-app/
  src/
    App.svelte          # Root layout, keyboard shortcuts, undo toast, view routing
    config.ts           # CouchDB URL + credentials (reads from .env.local)
    lib/
      db.ts             # All PouchDB operations + CouchDB sync + changelog
      store.ts          # Svelte stores (spaces, projects, tasks, active IDs)
      types.ts          # TypeScript interfaces for all document types
      constants.ts      # Priority colors, labels, default columns
      Sidebar.svelte    # Space/project nav, dark mode toggle, sync indicator
      DashboardView.svelte   # Home screen — project cards + pinned/overdue
      KanbanBoard.svelte     # Drag-and-drop kanban with touch support
      ListView.svelte        # Sortable/filterable task list
      TableView.svelte       # Compact table view
      DeadlinesView.svelte   # Agenda — all tasks with due dates
      CardDetail.svelte      # Full task editor modal
      QuickAdd.svelte        # Ctrl+N fast-add modal
      GlobalSearch.svelte    # Ctrl+K search modal
      ChangelogView.svelte   # Full activity log
  android/              # Capacitor Android project
  public/
    pouchdb.js          # PouchDB UMD bundle
  .env.local            # VITE_COUCH_URL, VITE_COUCH_USER, VITE_COUCH_PASS
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- (Optional) CouchDB instance for sync
- (Optional) Android Studio + JDK for APK builds

### Install & Run

```bash
cd offlog-app
npm install
npm run dev
```

App runs at `http://localhost:5173`.

### Environment Variables

Create `offlog-app/.env.local`:

```
VITE_COUCH_URL=http://192.168.x.x:5984/offlog
VITE_COUCH_USER=youruser
VITE_COUCH_PASS=yourpass
```

Sync is optional — the app works fully offline without these set.

### Build Web

```bash
cd offlog-app
npm run build
# Output in offlog-app/dist/
```

### Build Android APK

```bash
cd offlog-app
npm run build
npx cap sync android

# Set JAVA_HOME if needed:
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

cd android
.\gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Data Model

All documents live in a single PouchDB database (`offlog`). Documents are typed by an `type` field:

```
SpaceDoc    _id: "space:<key>"     — colored workspace container
ProjectDoc  _id: "project:<key>"  — belongs to a space, has kanban columns
TaskDoc     _id: "task:<nanoid>"  — belongs to a project, has priority/due/tags
LogEntry    _id: "log:<nanoid>"   — immutable changelog entry per task mutation
```

Soft-delete: tasks get `deleted: true` (filtered from all queries). Archive: `archived: true`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+N | Quick add task |
| Ctrl+K | Global search |
| Escape | Close any modal |

---

## Default Data

On first launch (empty database), the app seeds:

- **Unsorted** space (gray)
- **Personal** space (green)
- **Family** space (amber)
- **Work** space (blue)
- **Draft** project inside Unsorted

---

## CouchDB Setup (optional)

```bash
# Create database
curl -X PUT http://admin:pass@localhost:5984/offlog

# Create app user
curl -X PUT http://admin:pass@localhost:5984/_users/org.couchdb.user:offlog \
  -H "Content-Type: application/json" \
  -d '{"name":"offlog","password":"yourpass","roles":[],"type":"user"}'

# Grant access
curl -X PUT http://admin:pass@localhost:5984/offlog/_security \
  -H "Content-Type: application/json" \
  -d '{"admins":{"names":[],"roles":[]},"members":{"names":["offlog"],"roles":[]}}'
```

The app syncs live via `PouchDB.sync()` with auto-reconnect on connection loss.
