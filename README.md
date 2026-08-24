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
sync with each other over your own network.

**Jump to:** [Screenshots](#screenshots) · [Why](#why-this-exists) ·
[What it does](#what-it-does) · [Status](#status) · [Install](#install) ·
[Build from source](#build-from-source) · [FAQ](#faq) ·
[Docs](#documentation) · [Contributing](#contributing)

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

Every task manager I tried wanted a subscription for things that should
be free — a due date, a reminder, more than three projects. The ones that
didn't were overloaded instead, buried under features built for a growth
chart rather than for me. And all of them wanted my data on their
servers.

That last one has no workaround. A task list is a fairly complete map of
a person's life, and I didn't want mine living on a company's
infrastructure, one business-model change away from becoming their asset.

Offlog is the opposite of all three: the basics are free because
everything is free, the feature list stays small on purpose, and your
data never leaves the machines you own. Your phone and your PC talk to
each other directly over your own Wi-Fi — no cloud in the middle, no
account, nothing held back behind a paywall. It works fully offline
either way.

It's a personal tool, given away as-is. The same model works for a small
trusted group on one network — a family, a couple of people in one office
— but it is **not** a multi-tenant product: no per-user permissions, no
accounts, and sync only ever happens on your own local network.

---

## What it does

**Organising**
- Spaces hold projects; each project has its own statuses
- **Kanban** and **List** views per project, with saved filters and
  multi-column sort
- **Agenda** — deadlines across every project, as a grouped list or a
  month calendar
- **Focus** — pick up to 3 tasks for today. A deliberate commitment, not
  an auto-generated list nobody trusts

**Tasks that hold real detail**
- Notes, priority, due date, a reminder independent of it, checklists,
  tags, custom fields, and file attachments up to 10 MB
- **Dependencies** — mark a task blocked by another and it stays out of
  Focus until the blocker is done. Circular chains are refused
- **Recurring tasks** reset in place instead of spawning duplicates, and
  handle month-end and DST correctly
- Every change to a task is recorded, so you can see its history

**Finding things**
- **Ctrl+K** searches titles, notes, tags, checklist text and attachment
  filenames — and tells you where it matched
- **Ctrl+N** adds a task from anywhere, parsing dates, `#tags`,
  `!priority` and `@project` out of what you type

**Not losing things**
- Soft delete with undo everywhere, plus a recycle bin
- Backup and restore including attachments, custom fields and tag
  colours — a restore brings back the workspace, not just the text
- Automatic local backups, last 7 kept
- A database check-and-repair tool for orphaned tasks and invalid states

**Sync — the actual point**

Most local-first apps stop at "sync works if you run your own server."
That's a real barrier for anyone who doesn't want to. Offlog's Windows
app **is** the server: it bundles
[NyxDB](https://github.com/hrach-gevorgyan/nyxdb) — a small
CouchDB-protocol server written for this project — configures itself on
first launch, and your phone finds it automatically over the network.

Pairing is a **six-digit code** shown on the PC. No typed IP addresses,
no credentials sent before pairing, and if your PC's address changes the
phone re-finds it instead of making you pair again.

**Everywhere else**
- Light, dark, high contrast, and a reduce-motion setting every animation
  actually respects
- Keyboard-operable throughout; WCAG AA contrast
- **Android**: home-screen widgets, notification actions, hardware back
  button
- **Windows**: lives in the tray, `Ctrl+Alt+O` from anywhere, native
  notifications and save dialogs, automatic updates

---

## Status

**In daily use since 1 August 2026, and actively maintained.**

The plan it was built to is complete — that was the goal, not a stopping
point. Bugs found in real use get fixed, dependencies get updated,
security reports get answered.

Every release runs a zero-warning build, a clean type check and **569
tests** through CI. The project has been through 22 structured
maintenance audits, each working a written checklist of blind spots
earned from real shipped bugs.

**What's next:** today one PC has to be the host, so the workspace is
unreachable whenever that machine is off. Removing that — peer-to-peer
sync with no single required machine — is the current direction. See
[docs/roadmap.md](docs/roadmap.md).

New features aren't planned in advance, but they aren't refused either.
The bar is "does daily use actually demand this", which usually has to be
answered by living with the app rather than imagining it. Open an issue
before building one.

---

## Install

Download the latest Windows installer and Android APK from
[GitHub Releases](https://github.com/hrach-gevorgyan/offlog/releases).

Windows will warn you on first install because the installer isn't
code-signed. Paid certificates aren't a path this project will take;
desktop updates are verified by cryptographic signature instead, so a
tampered or corrupt download is rejected. Android shows its own
side-loading warning until the Play Store listing is live. Download from
this repo's own Releases page, not a mirror.

**Windows** is the intended app for daily use — it bundles its own sync
server, needs nothing else installed, and updates itself with an in-app
changelog and an explicit restart prompt. **Android** works the same way
via the APK today, Play Store once published. The **web build** is a
development surface, not the primary way to use the app.

---

## Build from source

Everything runs from a terminal.

| Target | Needs |
|---|---|
| Web | [Node.js](https://nodejs.org/) 22+ |
| Android | above, plus [Android Studio](https://developer.android.com/studio) |
| Windows desktop | above, plus [Rust](https://rustup.rs/) and [Tauri's prerequisites](https://tauri.app/start/prerequisites/) |

```bash
cd offlog-app
npm ci
npm run dev              # http://localhost:5173
```

That's the whole setup — the app works fully offline with no sync
configured. To point it at a sync server, create `offlog-app/.env.local`:

```
VITE_SYNC_URL=http://192.168.x.x:5984/offlog
VITE_SYNC_USER=youruser
VITE_SYNC_PASS=yourpass
```

Build for web with `npm run build`, or for Android with
`npx cap sync android` followed by a build in Android Studio.

The Windows app is a sibling project that wraps the same web build and
embeds its own sync host — nothing separate to install, even in
development:

```bash
cd offlog-desktop
cargo tauri dev
```

Full architecture, including how discovery and pairing work, is in
[docs/tech.md](docs/tech.md).

---

## FAQ

**Is any of my data sent anywhere?**
No. There is no account, no telemetry, and no server this project runs.
The only network traffic is sync between your own devices on your own
network, and a desktop update check you can turn off.

**Two phones and no PC — can they sync to each other?**
Not today. Only the Windows app acts as the host that phones connect to.
Removing that limitation is exactly what's on
[the roadmap](docs/roadmap.md). Until then, use Backup and Restore to
move data between phones.

**Can I sync when I'm away from home?**
No, by design. Sync only happens on the same local network. Remote sync
would mean either a hosted service or exposing a server to the internet,
and both are out of scope.

**Why does Windows warn me when installing?**
The installer isn't code-signed. Paid certificates aren't a path this
project will take. Updates are verified by signature instead.

**I'm moving to a new computer — how do I bring everything?**
Everything lives in one folder: `%APPDATA%\com.offlog.app\`. Copy it to
the new PC before opening Offlog there, and every phone that was already
paired reconnects on its own. You don't need this for a reinstall on the
same machine.

**Do I have to use sync at all?**
No. The app is fully usable on one device with sync off, and that needs
no setup whatsoever.

---

## Support

- **Bug or question** — open an
  [issue](https://github.com/hrach-gevorgyan/offlog/issues). Bug reports
  from real use are the most useful thing you can send, and now the main
  way this project changes.
- **Security** — don't open a public issue. See
  [SECURITY.md](SECURITY.md) for private reporting.
- **Before a feature request** — check
  [docs/decisions.md](docs/decisions.md). Several "why doesn't it do X"
  questions are already answered there, including choices that were tried
  and reversed.

---

## Documentation

| Document | What's in it |
|---|---|
| [docs/decisions.md](docs/decisions.md) | Manifesto, and why non-obvious choices were made |
| [docs/tech.md](docs/tech.md) | Architecture, data model, sync internals, theme tokens |
| [docs/roadmap.md](docs/roadmap.md) | Current status and planned work |
| [docs/changelog.md](docs/changelog.md) | Version history, maintainer-level detail |
| [docs/release-notes.md](docs/release-notes.md) | The same releases in plain language |
| [docs/maintenance.md](docs/maintenance.md) | The audit checklist, including blind spots earned from real bugs |
| [docs/privacy.md](docs/privacy.md) | Privacy policy — short, because the app collects nothing |
| [docs/brand.md](docs/brand.md) | Voice, visual identity, and trademark/fork terms |
| [docs/archive/history.md](docs/archive/history.md) | Older releases and the roadmap items behind them |
| [docs/archive/maintenance.md](docs/archive/maintenance.md) | What every maintenance audit found |
| [CLAUDE.md](CLAUDE.md) | Contributor guide for humans and AI assistants |

---

## Contributing

This was built solo in about a month, with an AI doing most of the
hands-on engineering while every idea, UI decision and round of testing
came from one person acting as product manager and QA. The codebase is
documented (`CLAUDE.md` plus `docs/`) specifically so an assistant — or a
human — can pick it up the same way for a fork.

The most valuable contributions, in order:

- **Bug reports from real use.** The main way this project changes.
- **Fixes, simplifications and code review.** If something could be
  simpler, safer or better structured, that's genuinely wanted.
- **An iOS build.** There's no bandwidth to open that front solo, so it's
  entirely open to someone who wants it. See
  [docs/decisions.md](docs/decisions.md) for why it isn't planned work.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and PR mechanics, and
open an issue before writing a feature — you'll get a straight yes or no
before spending real time on it.

---

## License

MIT — see [LICENSE](LICENSE).

The code is MIT. The **name, icon and tagline are not** — a fork is
welcome, under its own name. See [docs/brand.md](docs/brand.md)'s
trademark section.
