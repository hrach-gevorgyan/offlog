<p align="center">
  <img src="docs/images/readme-banner.png" alt="Offlog — off the cloud, still logged." width="700">
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-5457E0?style=flat-square"></a>
  <a href="https://github.com/hrach-gevorgyan/offlog/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/hrach-gevorgyan/offlog?style=flat-square&color=5457E0"></a>
  <a href="https://github.com/hrach-gevorgyan/offlog/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/hrach-gevorgyan/offlog/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/hrach-gevorgyan/offlog/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/hrach-gevorgyan/offlog?style=flat-square&color=5457E0"></a>
  <img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/hrach-gevorgyan/offlog?style=flat-square&color=5457E0">
  <a href="https://github.com/hrach-gevorgyan/offlog/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/hrach-gevorgyan/offlog/total?style=flat-square&color=5457E0"></a>
</p>

<p align="center">
  <img alt="Svelte" src="https://img.shields.io/badge/Svelte-FF3E00?style=flat-square&logo=svelte&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-FFC131?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Capacitor" src="https://img.shields.io/badge/Capacitor-119EFF?style=flat-square&logo=capacitor&logoColor=white">
  <img alt="PouchDB" src="https://img.shields.io/badge/PouchDB-E2041B?style=flat-square&logo=apachecouchdb&logoColor=white">
</p>

# Offlog

**Your tasks. Your devices. Nobody else's.**
*Off the cloud, still logged.*

A free, open-source, local-first task manager. No account, no telemetry,
no subscription, ever. Runs in the browser, as a native Android app, and
as a Windows desktop app — all three share the exact same codebase and
sync with each other over your own network. (Current version: the
badge above, always live — [docs/CHANGELOG.md](docs/CHANGELOG.md) for
what changed.)

**Jump to:** [Screenshots](#screenshots) ·
[Why this exists](#why-this-exists) · [Features](#features) ·
[Getting the apps](#getting-the-apps) ·
[Getting Started](#getting-started) · [FAQ](#faq) ·
[Documentation](#documentation) · [Contributing](#contributing)

## Screenshots

Real captures from a real build — no mockups, no Lorem Ipsum.

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-dashboard-desktop.png" alt="Dashboard view">
      <br><sub><b>Dashboard</b> — every project at a glance, pinned and overdue tasks up front</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-kanban-desktop.png" alt="Kanban board view">
      <br><sub><b>Kanban</b> — drag-and-drop columns, per-card due dates, tags, and checklist progress</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-list-desktop.png" alt="List view">
      <br><sub><b>List</b> — sortable columns, saved filters, multi-column sort</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-focus-desktop.png" alt="Focus view">
      <br><sub><b>Focus</b> — pick up to 3 tasks for today, ranked pinned → overdue → due-soon</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-carddetail-desktop.png" alt="Task detail panel over the Agenda calendar view">
      <br><sub><b>Task detail</b> — full editor over Agenda's month calendar</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-search-desktop.png" alt="Global search / command palette">
      <br><sub><b>Search (Ctrl+K)</b> — one box for tasks, notes, checklist text, and commands</sub>
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/images/screenshot-kanban-desktop-dark.png" alt="Kanban board view in dark mode" width="640">
  <br><sub>Light or dark — every screen, not just a toggle that half-works</sub>
</p>

---

## Why this exists

One shared Svelte codebase, wrapped three ways (browser, Android,
Windows). Each device keeps its own local database; turn sync on and
your phone and PC talk to each other directly over your own Wi-Fi — no
cloud service ever sits in the middle, no account to create, no
feature held back behind a paywall. It works fully offline either way.

It started as a personal tool, and the same sync model works just as
well for a small, trusted, co-located group — a family, a small team,
one office sharing a board over the same network. It is **not** a
remote/multi-tenant product: no per-user permissions, no accounts, and
sync only ever happens on the same local network. See
[docs/DECISIONS.md](docs/DECISIONS.md)'s opening manifesto for the
exact scope and why it stops there.

Built in the open, on purpose — every decision, including the ones
that got reversed, is written down: [docs/DECISIONS.md](docs/DECISIONS.md)
(why, including the "why not just—" questions), [docs/ROADMAP.md](docs/ROADMAP.md)
(what's planned), [docs/TECH.md](docs/TECH.md) (the real architecture),
and a full [docs/CHANGELOG.md](docs/CHANGELOG.md) back to the first
release.

**Status: feature-complete, actively maintained, and in daily use.**
Built over July 2026; since 2026-08-01 it's the author's own primary
task manager. Bugs get fixed, dependencies get updated, security reports
get answered — what it doesn't have is a feature roadmap. New features
are judged against real daily use rather than a backlog, so open an
issue before building one. [docs/STORY.md](docs/STORY.md) is the honest
account of how it got built — including the month the foundation was
thrown out and rewritten, and the backup bug caught twelve hours before
it mattered.

## Features

Full detail lives in [docs/CHANGELOG.md](docs/CHANGELOG.md) (recent
releases) and [docs/archive/history.md](docs/archive/history.md)
(everything older, one line each).

**Core**
- **Spaces and projects** — coloured spaces, each holding projects, each
  with its own statuses
- **Two views per project** — Kanban and a table-shaped List, with saved
  filters and multi-column sort
- **Agenda** — deadlines across every project, as a grouped list
  (overdue / today / this week / later) or a month calendar
- **Focus** — pick up to 3 tasks for the day. A deliberate commitment,
  not an auto-computed list nobody trusts. Blocked tasks don't appear
- **Rich task cards** — notes, priority, due date, reminder (independent
  of the due date), checklist, custom fields, tags, file attachments,
  and a per-card history of every change
- **Dependencies** — mark a task "blocked by" another and it stays out
  of Focus until the blocker is done. Circular chains are refused, not
  silently created
- **Recurring tasks** — one task resets in place instead of spawning
  duplicates, and handles month-end and DST correctly
- **Quick Add (Ctrl+N)** and **Global Search (Ctrl+K)** from anywhere —
  search covers titles, notes, tags, checklists and attachment names,
  and tells you where it matched
- **Undo everywhere** — soft delete with undo, a Recycle view, and a
  retention policy you control

**Sync — the reason this exists**

One task list, current on every device you own, without handing it to a
cloud provider. Most local-first apps stop at "sync is possible if you
run your own server", which is a real barrier for anyone who doesn't
want to. Offlog's Windows app *is* the server: it bundles
[NyxDB](https://github.com/hrach-gevorgyan/nyxdb) (a small,
self-authored CouchDB-protocol server), configures itself on first
launch, and your phone finds it automatically.

The pieces — replication, mDNS discovery, a paired credential handshake
— aren't novel individually. Packaging them so nobody has to see any of
them is the point.

- Live two-way replication whenever both devices are on the same network
- Your phone finds the PC over mDNS and pairs with a **one-time 6-digit
  code** — no typing IP addresses, no credentials sent before pairing
- If the PC's address changes, the phone re-resolves it automatically
  rather than making you re-pair
- Works fully offline with zero setup if you never turn sync on; errors
  are readable and conflicts are recoverable, never silent data loss

**LAN-only by design** — see [docs/DECISIONS.md](docs/DECISIONS.md) for
why remote sync and user accounts are out of scope.

**Windows** — the intended app for daily use
- Lives in the system tray; closing tucks it away so reminders keep
  firing and your phone keeps syncing
- `Ctrl+Alt+O` from anywhere brings it to the front
- Native notifications and native Save As dialogs
- Auto-update with an in-app changelog and an explicit restart prompt

**Android**
- Native app via Capacitor, used daily on a real device
- Home-screen widgets for Quick Add, Agenda, and projects
- Notifications with Done / Snooze actions from the lock screen
- Hardware back button closes whatever is open, as it should

**Data and integrity**
- Backup and restore with a scope selector; JSON and CSV export.
  Backups include attachments, custom fields and tag colours — a restore
  brings back the workspace, not just the task text
- Automatic local backups, last 7 kept, whether or not you think about it
- Check Database / Repair Issues for orphaned tasks, invalid statuses
  and unresolved conflicts
- Storage warnings past 80%, with a real Optimize Storage action

**Appearance and accessibility**
- Light / Dark / System, High Contrast, and a Reduce Motion toggle every
  animation actually respects
- Keyboard-operable throughout: focus trapping, visible focus rings,
  Escape closes everything
- WCAG AA contrast audited across the palette

No paid tier, and no feature ever held back behind one — see
[docs/DECISIONS.md](docs/DECISIONS.md)'s manifesto for why.

## Getting the apps

Download the latest Windows installer and Android APK from
[GitHub Releases](https://github.com/hrach-gevorgyan/offlog/releases).

Windows will warn you on first install because the installer isn't
code-signed. Paid certificates aren't a path this project will take;
desktop updates are verified by cryptographic signature instead, so a
tampered or corrupt download is rejected. Android shows its own
side-loading warning until the Play Store listing is live. Just make
sure you're downloading from this repo's own Releases page, not a
mirror.

**Windows** is the intended app for day-to-day use — bundles its own
sync server, nothing else to install, and checks for updates
automatically, with an in-app changelog and an explicit restart prompt
(it never restarts itself behind your back). Update downloads are
verified against a cryptographic signature before they're installed.
**Android** works the same way via side-loaded APK today,
Play Store (with its own auto-update) once published. The **web build**
(`npm run dev`) is a dev/test surface, not the primary way to use the
app.

## Built like a real product, not a prototype

Every release: zero-warning production build, clean type check, full
test suite (569 of them), manual light/dark verification — enforced by
CI. 22 structured maintenance passes, each working
through a written checklist of blind spots earned from real shipped
bugs (see [docs/MAINTENANCE.md](docs/MAINTENANCE.md)). Went through a
full security audit and git-history credential purge before going
public (see [docs/DECISIONS.md](docs/DECISIONS.md)'s "Public release"
section).

The last three of those passes ran on the final day, deliberately
scoped to ask *what could destroy real data* and *what breaks after
weeks without a restart* rather than *what's untidy* — which is how a
backup system that couldn't restore any backup containing an attachment
got found and fixed before it was ever needed. That story is in
[docs/STORY.md](docs/STORY.md).

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
VITE_SYNC_URL=http://192.168.x.x:5984/offlog
VITE_SYNC_USER=youruser
VITE_SYNC_PASS=yourpass
```

Build for web (`npm run build`, output in `offlog-app/dist/`) or Android
(`npx cap sync android` then build via Android Studio or Gradle).

**Windows desktop app** — a sibling project at `offlog-desktop/` (Tauri),
wraps the same web build and embeds a NyxDB sync host (fully
self-contained — no separate server install needed, even for
development):

```bash
cd offlog-desktop
cargo tauri dev
```

Full build/deploy steps, environment details, and the complete
architecture (including exactly how the mDNS discovery and pairing
handshake work) are in [docs/TECH.md](docs/TECH.md).

## FAQ

**Is any of my data sent anywhere?**
No. There is no account, no telemetry, and no server this project runs.
The only network traffic is sync between your own devices on your own
network, and an update check on desktop you can turn off.

**Two phones and no PC — can they sync to each other?**
No. Only the Windows app acts as the syncing computer phones connect to
(see [docs/DECISIONS.md](docs/DECISIONS.md)'s mesh-sync entry for why).
Use Backup and Restore to move data between two phones that will never
share a PC.

**Can I sync when I'm away from home?**
No, by design. Sync only happens on the same local network. Remote sync
would mean either a hosted service or exposing a server to the internet,
and both are out of scope.

**Why does Windows warn me when installing?**
The installer isn't code-signed. Paid certificates aren't a path this
project will take. Updates are verified by signature instead.

**I'm moving to a new computer — how do I bring everything?**
Everything Offlog needs lives in one folder: `%APPDATA%\com.offlog.app\`.
Copy it to the new PC before opening Offlog there for the first time, and
every phone that was already paired reconnects on its own. (You don't
need this for a reinstall on the same machine — data survives that.)

**Do I have to use sync at all?**
No. The app is fully usable on one device with sync switched off, and
that needs no setup whatsoever.

## Documentation

Everything beyond this pitch lives in [docs/](docs/):

| Document | What's in it |
|---|---|
| [docs/STORY.md](docs/STORY.md) | How it actually got built, written on the last day of development — the plan, the rewrite, the near-misses |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Manifesto, open questions worth outside input, and why non-obvious choices were made |
| [docs/TECH.md](docs/TECH.md) | Architecture, data model, sync internals, theme tokens, release/signing pipeline |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Current status and still-open planned work |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Recent version history in full detail (maintainer-level) |
| [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) | The same releases in plain language — what actually changed for you |
| [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | The maintenance-pass checklist, including the blind spots earned by real shipped bugs |
| [docs/PRIVACY.md](docs/PRIVACY.md) | Privacy policy (short, because the app collects nothing) |
| [docs/archive/history.md](docs/archive/history.md) | Older releases, one line each |
| [docs/archive/history.md](docs/archive/history.md) | Shipped/declined/parked roadmap history |
| [docs/BRAND.md](docs/BRAND.md) | Tagline/pitch/voice/visual-identity reference, plus trademark/fork usage terms |
| [CLAUDE.md](CLAUDE.md) | Contributor guide/rules for humans and AI assistants |

## Contributing

Built in about a month, solo, with Claude doing the hands-on-keyboard
engineering while every idea, UI decision, and round of testing came
from a single owner acting as product manager and QA — the codebase is
documented (`CLAUDE.md` + `docs/`) specifically so an AI assistant (or a
human) can pick it up the same way for a fork.

**Before opening a feature PR:** the app is feature-complete on purpose
— see [docs/ROADMAP.md](docs/ROADMAP.md). Feature ideas are welcome, but
they're judged against "does daily use actually demand this," which is a
higher bar than "this would be good." Open an issue first and you'll get
a straight yes/no before spending real time on it.

There's also a genuine wishlist — see
[CONTRIBUTING.md](CONTRIBUTING.md) for setup and PR mechanics, but in
short, the most valuable contributions are:

- Real code-signing (Windows) and Google Play publishing — the build/
  release pipeline is already automated (see
  [docs/TECH.md](docs/TECH.md)'s CI section), what's missing is the paid
  credentials themselves and someone to own that ongoing cost/process
- An iOS build — there's currently no bandwidth to open that front
  solo, so this is entirely open for someone who wants to take it on
- **Bug reports from real use** — the single most useful thing, and now
  the main way the project changes at all
- Fixes and code review — if something looks like it could be simpler,
  safer, or better structured, that feedback is genuinely wanted, not
  just tolerated

The codebase is deliberately structured to be forkable and AI-legible —
[CLAUDE.md](CLAUDE.md) documents the invariants an assistant (or a
human) needs to know before changing `db.ts`, the theming system, or
Android platform code.

## License

MIT — see [LICENSE](LICENSE).
