# Offlog

A free, open-source, local-first task manager. No account, no telemetry,
no subscription, ever. Runs in the browser, as a native Android app, and
as a Windows desktop app — all three share the exact same codebase and
sync with each other over your own network. (Current version:
[docs/CHANGELOG.md](docs/CHANGELOG.md) — not restated here so this page
doesn't go stale every release.)

---

## Why this exists

Every existing task manager either locks a feature you need behind a paid
tier, or splits the features you actually use across two or three
different apps because no single one covers all of them. And almost all
of them sync through *someone else's* cloud by default — which means your
task list lives on a server you don't control, whether or not you ever
agreed to that trade-off.

Offlog was built to have exactly the features one person wanted and
nothing they didn't, syncing only across devices they own — a phone and a
PC on the same Wi-Fi — never to an unknown cloud. It started as a
personal tool, but the sync model works just as well for a small,
trusted, co-located group: a family, a small team, or one office sharing
a single board over the same network. It is **not** a remote/multi-tenant
product — there are no accounts, no per-user permissions, and syncing
only ever happens on the same local network. See
[docs/DECISIONS.md](docs/DECISIONS.md)'s opening manifesto for the exact
scope and why it stops there.

It's also built in the open, on purpose. Every decision — including the
ones that got reversed — is written down:
[docs/DECISIONS.md](docs/DECISIONS.md) (the mission, plus why the
non-obvious choices were made, including the ones an outsider would
reasonably ask "why not just—"), [docs/ROADMAP.md](docs/ROADMAP.md)
(what's planned and why), [docs/TECH.md](docs/TECH.md) (the real
architecture), and a full [docs/CHANGELOG.md](docs/CHANGELOG.md) going
back to the first release.

**How it's built, in plain terms.** Offlog runs on one shared codebase —
there's no separate "web team" and "mobile team," it's the exact same
Svelte app wrapped three different ways (browser, Android via Capacitor,
Windows via Tauri). Your data lives in a local database on each device
(PouchDB) and, when sync is turned on, two devices exchange changes
directly using CouchDB's replication protocol. Your phone finds your PC
automatically on the same Wi-Fi using mDNS (the same kind of "no typed IP
address" discovery your printer or Chromecast uses) — you tap "Find my
computer," confirm a 6-digit code shown on the PC once, and the two are
paired. No cloud service sits in the middle at any point.

**Built in about a month, solo, with AI as the primary developer.** This
project started as a personal tool and as a demonstration of what one
person can build with Claude doing the hands-on-keyboard engineering
while every idea, UI decision, priority call, and round of testing came
from a single owner acting as product manager and QA. The codebase is
documented specifically so that setup works for anyone forking it: point
an AI assistant at the repo, have it read [CLAUDE.md](CLAUDE.md) and
`docs/`, and ask it to add a feature or change something to fit your own
vision — the same workflow this project was built with.

## Features

Built up over 170+ commits of real daily use — some features
came from the original plan, plenty came from just noticing something
was missing while using the app for real. Full detail on all of it:
[docs/CHANGELOG.md](docs/CHANGELOG.md) (recent releases) and
[docs/archive/changelog-archive.md](docs/archive/changelog-archive.md)
(everything older, one line per release).

**Core task management**
- Spaces & Projects — organize work into colored spaces, each holding
  multiple projects, each with its own set of statuses
- Kanban, List, Table, and Agenda (deadline-focused) views per project,
  with saved filters, column selection/reordering, and multi-column sort
  in List/Table
- Focus view — a daily-commitment lock: pick up to 3 tasks for the day
  from a round-robin-ranked picker, instead of an auto-computed priority
  list nobody trusts
- Checklists with a progress badge, tags with project-local
  autocomplete, custom fields (global, not per-project)
- Card detail — full task editor: notes with a length counter, priority,
  due date, reminder time (independent of due date), status, checklist,
  custom fields, and a per-card changelog of every change made to it
- One-tap due-date shortcuts on task creation; Duplicate task; project
  templates (copy a status structure, optionally with its open tasks)
- Dashboard — every project at a glance, pinned tasks, overdue tasks,
  a weekly "N completed this past week" summary
- Quick Add (Ctrl+N) and Global Search (Ctrl+K) from anywhere, plus a
  command palette that matches actions, not just tasks
- Undo & Recycle — soft-delete everywhere with undo, a full Recycle view
  with restore/delete-forever, and a configurable retention policy

**Sync — this is the core idea, not a bolt-on**

Local phone-to-PC (and PC-to-PC) sync was the entire reason this project
started: one task list, always current, on every device you own, without
handing it to a cloud provider. Most self-hosted, local-first apps stop at
"sync is possible if you set up your own server" — that's a real barrier
for anyone who isn't comfortable running one. Offlog's Windows app *is*
the server: it bundles CouchDB, configures itself on first launch, and
your phone finds it on the network automatically. The technical pieces
(CouchDB replication, mDNS discovery, a paired-handshake credential
exchange) aren't novel on their own — packaging all three together so a
non-technical person never sees any of them is the actual point.

- Live bidirectional replication over CouchDB's protocol — a write on
  one device shows up on the other in real time whenever both are
  reachable on the same network
- The Windows desktop app **bundles CouchDB itself** — nothing to
  install separately, no server admin knowledge required. On first
  launch it silently generates its own random port, admin password, and
  database identity, and runs CouchDB as a managed background process
  the whole time the app is open
- Your phone discovers the PC automatically over mDNS (`_offlog._tcp`)
  and pairs with a one-time 6-digit code shown on the PC — no manually
  typing an IP address, no shared credentials sent over the air until
  pairing actually happens, and the code locks out after repeated wrong
  guesses
- If your PC's address changes (DHCP renewal, router reboot), the phone
  automatically re-resolves it on the next failed sync instead of
  requiring a manual re-pair
- The app works fully offline with zero setup if you never turn sync on;
  offline detection, human-readable sync errors, and a conflict
  resolution UI mean a lost connection is visible and recoverable, never
  silent data loss
- Free-form per-device names with a stable underlying device id, plus a
  "Devices seen recently" list

Everything above stays **LAN-only by design** — see
[docs/DECISIONS.md](docs/DECISIONS.md) for why remote/away-from-home
sync and per-user accounts were deliberately kept out of scope.

**Two phones, no PC, want to share data?** Not supported — a phone can't
be the sync host (see DECISIONS.md's mesh-sync entry for why). Export/
Import (Settings → Backup & Storage) is the way to move data between two
phones that will never share a PC host.

**Moving your PC to a new computer?** The sync host's identity and all
its data live under one folder (`%APPDATA%\com.offlog.app\` on Windows —
verified to survive a normal uninstall/reinstall, so this is only needed
for an actual hardware change), not scattered across the install. Copy
that whole folder to the new machine before first launching Offlog there,
and every phone already paired with the old PC reconnects with no
re-pairing needed, since the port/credentials/database identity all come
along unchanged.

**Android app — tested and working on a real device**
- Native app via Capacitor, actively used day to day, not just built and
  shelved
- Home-screen widgets for Quick Add, a read-only Agenda, and a Project
  list, for getting a task in or checking what's due without opening the
  app
- Native notifications with "Done"/"Snooze 1h" actions right from the
  lock screen
- Hardware back button closes whatever modal/panel is open, the way it
  should
- Not yet on Google Play — planned; see "Getting the apps" below

**Windows desktop app — the intended "app for humans"**
- Native app via Tauri, wrapping the same web build unmodified, with an
  embedded CouchDB sync host (see Sync above)
- Native Windows notifications with click-to-open and working scheduled
  reminders (not just a browser notification fallback)
- Native "Save As" dialogs for backup/export instead of a silent no-op
  browser download inside a WebView

**Small footprint, on purpose.** Both the Android and Windows apps have
gone through repeated cleanup passes specifically to stay small and
light — dead code removed, unused dependencies dropped, ~64MB of unused
CouchDB internals stripped from the bundled binaries, bundle-size checks
as part of the release routine. This isn't accidental; a maintenance
pass runs every few releases specifically to catch bloat and regressions
before they ship (see [docs/MAINTENANCE.md](docs/MAINTENANCE.md)).

**Data, backup, and integrity**
- Full Back up (with a scope selector) / Restore flow, JSON and CSV
  export
- A Check Database / Repair Issues tool that finds and fixes orphaned
  tasks/projects, invalid status references, and unresolved sync
  conflicts
- Storage-pressure warnings past 80% usage with cleanup pointers,
  `db.compact()` wired to an actual "Optimize Storage" action

**Appearance & accessibility**
- Light / Dark / System theme, a High Contrast toggle, a Reduce Motion
  toggle that's actually read by every animation in the app
- Keyboard-operable throughout: focus trapping in every modal, visible
  focus rings, a keyboard shortcuts panel, Escape closes everything
- WCAG AA contrast audited and fixed across the palette

No paid tier, no feature ever held back behind one — see
[docs/DECISIONS.md](docs/DECISIONS.md)'s manifesto for why.

## Which build is "the app" for you

- **Windows desktop app** is the intended app for a normal, non-technical
  person — install it, it bundles its own sync server, no setup beyond
  opening it. This is the one meant to eventually have a signed,
  one-click installer; that's not funded yet (this may end up being a
  project very few people ever look at, and that's fine — it's built for
  real use either way, not for an audience).
- **Android app** is the same idea for a phone — a normal app once it's
  on Google Play (planned, not live yet); side-loading the APK works
  today for anyone comfortable with that.
- **Web build** (`npm run dev`) is mainly a development/testing surface
  at this point — useful for contributing or trying the app in a
  browser, not the primary way it's meant to be used day to day.
- **Update mechanism** for the desktop and Android apps still needs
  proper wiring (an auto-updater is scaffolded but unconfigured on
  desktop; Android will get normal Play Store update behavior once it's
  published) — tracked in [docs/ROADMAP.md](docs/ROADMAP.md).

## Built and QA'd like a real product, not a prototype

Every release goes through the same checklist before it ships: a clean
production build with **zero compiler warnings**, a clean type check, a
full automated test suite, and manual verification in both light and
dark mode. On top of that, a dedicated maintenance pass runs every few
releases specifically to catch dead code, missing error handling,
accessibility regressions, and security gaps — logged in
[docs/MAINTENANCE.md](docs/MAINTENANCE.md). Before the codebase's public release,
it went through a full security audit and a complete git-history
credential purge (see [docs/DECISIONS.md](docs/DECISIONS.md)'s "Public
release" section for exactly what was found and how it was fixed) — this
project takes "stable and safe to actually rely on" as a hard
requirement, not an afterthought.

## Getting Started

Everything below is run from a terminal — there's no GUI installer setup
for development. You're free to use a graphical Git/npm tool if you
prefer one, but every step here has a plain command-line equivalent so
nothing requires one.

**What you need installed**, depending on what you're building:

| Target | Requires |
|---|---|
| Web build | [Node.js](https://nodejs.org/) 20+ (includes npm) |
| Android build | Above, plus [Android Studio](https://developer.android.com/studio) (JDK bundled with it) |
| Windows desktop build | Above, plus [Rust](https://rustup.rs/) + [Tauri's prerequisites](https://tauri.app/start/prerequisites/) |

**Web app** (works fully offline, no setup):

```bash
cd offlog-app
npm install
npm run dev              # http://localhost:5173
```

To enable sync, create `offlog-app/.env.local`:

```
VITE_COUCH_URL=http://192.168.x.x:5984/offlog
VITE_COUCH_USER=youruser
VITE_COUCH_PASS=yourpass
```

Build for web (`npm run build`, output in `offlog-app/dist/`) or Android
(`npx cap sync android` then build via Android Studio or Gradle).

**Windows desktop app** — a sibling project at `offlog-desktop/` (Tauri),
wraps the same web build and embeds a CouchDB sync host (fully
self-contained — no separate CouchDB install needed, even for
development):

```bash
cd offlog-desktop
cargo tauri dev
```

Full build/deploy steps, environment details, and the complete
architecture (including exactly how the mDNS discovery and pairing
handshake work) are in [docs/TECH.md](docs/TECH.md).

## Documentation

Everything beyond this pitch lives in [docs/](docs/):

| Document | What's in it |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | Manifesto (why this project exists) + why non-obvious choices were made |
| [docs/TECH.md](docs/TECH.md) | Architecture, data model, sync internals, theme tokens |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Current status and still-open planned work |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Recent version history in full detail |
| [docs/archive/changelog-archive.md](docs/archive/changelog-archive.md) | Older releases, one line each, plus the full maintenance-pass log |
| [docs/archive/roadmap-archive.md](docs/archive/roadmap-archive.md) | Shipped/declined/parked roadmap history |
| [docs/IDEAS.md](docs/IDEAS.md) | Open questions and un-committed ideas worth outside input |
| [CLAUDE.md](CLAUDE.md) | Contributor guide/rules for humans and AI assistants |

## Contributing

This was built solo, so there's a real, honest wishlist of help that
would move it forward — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup
and PR mechanics, but in short, the most valuable contributions right
now are:

- Turning the desktop and Android builds into properly packaged,
  signed, distributable releases (installer signing, a real update
  mechanism, Play Store publishing)
- An iOS build — there's currently no bandwidth to open that front
  solo, so this is entirely open for someone who wants to take it on
- CI/automation for the build/test/release pipeline, which today is run
  by hand
- General ideas, fixes, and code review — if something looks like it
  could be simpler, safer, or better structured, that feedback is
  genuinely wanted, not just accepted

The codebase is deliberately structured to be forkable and AI-legible —
[CLAUDE.md](CLAUDE.md) documents the invariants an assistant (or a
human) needs to know before changing `db.ts`, the theming system, or
Android platform code.

## License

MIT — see [LICENSE](LICENSE).
