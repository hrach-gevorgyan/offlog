# Offlog

Personal task board — local-first, syncs via CouchDB, wraps as Android app via Capacitor.

---

## What It Is

Offlog is a private kanban/list/table task manager built for one person (or a small team sharing a CouchDB instance). All data is stored locally in PouchDB — the app works fully offline. When a sync server is available, changes replicate automatically in the background.

---

## PC Setup

### Requirements
- Node.js 18+
- A running CouchDB instance (optional, for sync)

### Install & Run

```bash
cd offlog-app
npm install
npm run dev
```

App opens at `http://localhost:5173`

### Build for production

```bash
npm run build
# output in offlog-app/dist/
```

---

## Sync Setup (CouchDB)

1. Install CouchDB on your server or local machine
2. Create a database called `offlog`
3. Create a user with access to that database
4. Copy `.env.local.example` to `.env.local` and fill in your values:

```env
VITE_COUCH_URL=http://192.168.1.100:5984
VITE_COUCH_DB=offlog
VITE_COUCH_USER=youruser
VITE_COUCH_PASS=yourpassword
```

Sync starts automatically when the app loads. Status indicator is visible in the sidebar (green = connected, blue = syncing, red = error).

---

## Android Build

### Requirements
- Android Studio installed
- Java 17+
- Node.js 18+

### Steps

```bash
# 1. Build the web app
cd offlog-app
npm run build

# 2. Sync to Android
npx cap sync android

# 3. Open in Android Studio
npx cap open android
```

In Android Studio: **Build → Generate Signed APK** (or run directly on device via USB).

### Icon generation (if icon changes)

```bash
# From offlog-app/ directory
node assets/process-icon.cjs          # processes icon-source.png
npx @capacitor/assets generate --android
```

---

## Project Structure

```
offlog-app/
├── src/
│   ├── App.svelte              # Root layout, view routing, undo toast
│   ├── app.css                 # Global CSS variables (light + dark theme)
│   ├── config.ts               # Reads .env.local for CouchDB URL/credentials
│   └── lib/
│       ├── types.ts            # TypeScript interfaces (TaskDoc, ProjectDoc, etc.)
│       ├── constants.ts        # Shared constants (priority colors/labels)
│       ├── db.ts               # PouchDB operations, sync, changelog, undo buffer
│       ├── store.ts            # Svelte stores (projects, tasks, active selection)
│       ├── Sidebar.svelte      # Left nav, spaces, projects, settings panel
│       ├── KanbanBoard.svelte  # Kanban view with drag & drop (mouse + touch)
│       ├── ListView.svelte     # List view with sort/filter
│       ├── TableView.svelte    # Spreadsheet-style table view
│       ├── CardDetail.svelte   # Task detail side panel
│       ├── DeadlinesView.svelte # Agenda — all tasks with due dates
│       └── ChangelogView.svelte # Recent change history panel
├── public/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── pouchdb.js              # PouchDB UMD bundle (loaded as global)
├── assets/                     # Icon source files and processing script
├── android/                    # Capacitor Android project
├── capacitor.config.ts
└── .env.local                  # CouchDB credentials (not committed)
```

---

## Git Tags

| Tag | Description |
|-----|-------------|
| `v1.0` | First stable release — all Plan.md items complete |
| `v1.1` | Code cleanup + pin tasks, undo delete, tag autocomplete, timestamps |
