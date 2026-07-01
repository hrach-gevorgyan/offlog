# Offlog — Technical Overview

This document describes the technology stack, architecture, data flow, and future roadmap. Written for anyone who wants to understand how the project works or continue developing it.

---

## Why This Project Exists

Offlog is a personal task management tool built to work exactly the way one person wants — no subscriptions, no cloud vendor lock-in, no unnecessary features. Everything runs locally. Sync is optional and goes through a self-hosted CouchDB server on the local network.

The goal was a fast, clean kanban board that works on both desktop (browser) and Android, shares the same database, and survives offline without any issues.

---

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| UI Framework | **Svelte 5** + TypeScript | Minimal overhead, reactive without a virtual DOM, excellent for local-first apps |
| Build Tool | **Vite** | Fast dev server, instant HMR, small production bundles |
| Local Database | **PouchDB** | IndexedDB-backed in-browser database with built-in CouchDB sync protocol |
| Sync Server | **CouchDB** | The reference implementation of the CouchDB replication protocol PouchDB speaks |
| Mobile Wrapper | **Capacitor 7** | Wraps the web app into a native Android APK with access to native APIs |
| Styling | **CSS Custom Properties** | Theme-aware (light/dark) without any CSS framework dependency |
| Fonts | **Hanken Grotesk** + **IBM Plex Mono** | Clean, readable, not overused |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                   UI Layer                   │
│  App.svelte → Sidebar + Board/List/Table     │
│  CardDetail ← user edits task               │
└────────────────────┬────────────────────────┘
                     │ reads/writes
┌────────────────────▼────────────────────────┐
│               Store Layer (store.ts)         │
│  Svelte writable stores: spaces, projects,   │
│  tasks, activeProject — reactive UI updates  │
└────────────────────┬────────────────────────┘
                     │ async calls
┌────────────────────▼────────────────────────┐
│               Database Layer (db.ts)         │
│  PouchDB (IndexedDB in browser,              │
│  LevelDB in Node)                            │
│  + Changelog writer                          │
│  + Undo delete buffer (in-memory)            │
└────────────────────┬────────────────────────┘
                     │ replication protocol
┌────────────────────▼────────────────────────┐
│           CouchDB (self-hosted)              │
│  192.168.x.x:5984/offlog                    │
│  All devices sync to this one database       │
└─────────────────────────────────────────────┘
```

---

## Data Model

All documents live in one PouchDB database (`offlog`). Document types are distinguished by `_id` prefix:

| Prefix | Type | Description |
|--------|------|-------------|
| `space:` | SpaceDoc | Top-level grouping (Unsorted, Personal, Work, Family) |
| `project:` | ProjectDoc | Task board inside a space. Contains column definitions |
| `task:` | TaskDoc | A single task card. Belongs to a project + column |
| `log:` | Log entry | Changelog record. Written on every create/update/move/delete |

### Key task fields
- `priority`: `1` (Low) / `2` (Medium) / `3` (High) — shown as colored left border
- `pinned`: boolean — pinned tasks sort to the top of every view
- `column_id`: which kanban column the task is in
- `deleted`: soft-delete flag (tasks are never hard-deleted from PouchDB to avoid sync conflicts)
- `created_at` / `updated_at`: ISO timestamps

---

## How Sync Works

1. On app load, `startSync()` starts a **live, bidirectional PouchDB sync** with the CouchDB server
2. Any local write is immediately replicated to CouchDB
3. Any remote change is received and triggers a store reload (via PouchDB `.changes()` listener)
4. Conflicts are resolved by PouchDB's default "last write wins" strategy — sufficient for single-user or low-contention use
5. The app works fully offline; sync resumes automatically when the connection returns

---

## Mobile (Android)

Capacitor wraps the built Vite output (`dist/`) into a WebView-based Android app. The web code runs identically inside WebView — same PouchDB, same sync, same UI.

The only mobile-specific adaptations:
- Touch drag on Kanban (HTML5 drag events don't fire on touch screens — uses `touchstart/touchmove/touchend` + `elementFromPoint`)
- `enterkeyhint` on inputs (shows GO/Done on the soft keyboard)
- Responsive CSS for narrow screens
- Source field is set to `'mobile'` instead of `'pc'` for changelog tracking

---

## Theme System

All colors are CSS custom properties defined in `app.css`:
- `:root` — light theme values
- `body.dark` — dark theme overrides

Dark mode is applied by adding/removing the `.dark` class on `<body>`. The class is set before the app renders (early script in `index.html`) to prevent a flash of light mode.

The sidebar always uses its own dark color scheme regardless of the page theme.

---

## What's Next (v2.0 Candidates)

These are planned features not yet implemented:

1. **Tag autocomplete improvements** — fuzzy match, not just prefix
2. **Android push notifications** — morning digest of today's tasks via Capacitor local notifications
3. **Archive completed tasks** — hide without deleting, accessible via filter
4. **Global search** — search across all projects simultaneously
5. **Dashboard page** — task counts, pinned tasks, overdue summary
6. **Card-level changelog** — show created/edited history inside CardDetail
7. **Quick-add button** — floating `+` accessible from any view with project picker
8. **Electron wrapper** — run as a native desktop window (no browser, no localhost URL)
9. **Undo restore persistence** — currently in-memory only; lost on page refresh
10. **Import JSON** — counterpart to the existing export backup feature
