# Offlog

Version 3.9.7 · A free, open-source, local-first task management app.
No account, no telemetry, no subscription, ever. Runs in the browser and
as a native Android app. Sync is optional and never required.

Offlog isn't trying to out-feature Trello, Notion, ClickUp, or Jira — it
isn't competing with them. It's a personal tool, built by one person for
their own use and given away as-is for anyone else who wants the same
thing: no account, no telemetry, no business model, not even a paid tier.
Full mission and planned work: [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Features

- **Spaces & Projects** — organize work into colored spaces, each containing multiple projects
- **Multiple views** — Kanban board, list, table, and agenda (deadlines) per project
- **Dashboard** — overview of all projects with pinned and overdue tasks at a glance
- **Quick Add** — Ctrl+N anywhere to create a task with space/project selector; a home-screen widget on Android
- **Global Search** — Ctrl+K to search across all tasks instantly
- **Card detail** — full task editor with notes, priority, due date, tags, status, and changelog
- **Duplicate task** — one click to clone a card into the same status
- **Dark mode** — toggle persisted to localStorage
- **Sync** — live CouchDB replication (optional); works fully offline without it, with offline detection, retry status, and conflict reporting
- **Reminders** — set a reminder time per task, independent of due date; native notifications on Android with "Done"/"Snooze 1h" actions right from the lock screen
- **Undo & Recycle** — soft-delete with undo, plus a full Recycle view with restore/delete-forever
- **Android hardware back button** — closes whatever modal/panel is open, the way it should
- **Accessibility** — keyboard-operable throughout, focus trapping in every modal, visible focus rings
- **Android APK** packaged with Capacitor, and an **installable PWA** for the web build
- **Database maintenance** — a Check Database / Repair Issues tool scans for and fixes orphaned tasks/projects, invalid status references, and unresolved sync conflicts

Full version-by-version history: [docs/CHANGELOG.md](docs/CHANGELOG.md).

---

## Getting Started

```bash
cd offlog-app
npm install
npm run dev              # http://localhost:5173
```

Sync is optional — the app works fully offline with no setup. To enable
sync, create `offlog-app/.env.local`:

```
VITE_COUCH_URL=http://192.168.x.x:5984/offlog
VITE_COUCH_USER=youruser
VITE_COUCH_PASS=yourpass
```

Build for web (`npm run build`, output in `offlog-app/dist/`) or Android
(`npx cap sync android` then build via Android Studio or Gradle) — full
build/deploy steps, environment details, and the CouchDB setup snippet are
in [docs/TECH.md](docs/TECH.md).

---

## Documentation

Everything beyond this pitch lives in [docs/](docs/):

| Document | What's in it |
|---|---|
| [docs/TECH.md](docs/TECH.md) | Architecture, data model, sync internals, theme tokens |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned work and the public-release path |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why non-obvious architectural choices were made |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Full version history |
| [docs/QUESTIONS.md](docs/QUESTIONS.md) | Open questions worth outside input |
| [CLAUDE.md](CLAUDE.md) | Contributor guide/rules for humans and AI assistants |

## License

Not yet decided/applied — tracked in [docs/ROADMAP.md](docs/ROADMAP.md)'s
Track C (a permissive license, leaning MIT, is planned ahead of any public
release).
