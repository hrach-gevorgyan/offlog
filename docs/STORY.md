# Offlog — How It Got Built

**2026-07-01 → 2026-07-31. Thirty-one days. 481 commits. 107 releases.**

This is the honest account, written on the last day of development, before
the first day of use. It exists because everything else in `docs/` records
*what* was decided and *why* — and none of it records what it actually felt
like, or how close it came to going wrong.

---

## Act I — A document, and a wrong assumption

It started as a markdown file called `task-board-plan.md`, version 3. Not
version 1 — the plan had already been revised twice before a single line of
code existed. That turns out to be the first thing this project got right.

The plan was specific. Four "fronts" — Unsorted, Personal, Family, Work.
Projects inside fronts. Editable columns inside projects. Kanban, list, and
table views over the same data. PouchDB in the browser, **CouchDB on the
PC**, sync over home Wi-Fi only. No accounts, no fees, no AI, no telemetry.
A locked-decisions section so the spec couldn't drift mid-build.

It even had a risk table. Nine rows. Disk failure, cleartext on Wi-Fi, DHCP
address changes, CORS misconfiguration, Android IndexedDB flakiness,
unbounded changelog growth, orphaned tasks, clock skew.

Every one of those risks was real. Not one of them was the thing that nearly
broke the project.

The plan's opening instruction was to install CouchDB and get it reachable
from the phone's browser before writing any app code. *"Narrow and deep: a
working kanban board on the PC that syncs to its own CouchDB is the whole
hard part. Everything after is addition, not invention."*

That sentence was correct about the difficulty and wrong about the
destination. CouchDB would be ripped out entirely twenty-six days later.

---

## Act II — Velocity

The first three days produced 42 commits. Kanban, then list, then table,
then the data model hardening underneath all three. The plan's §9 build
order held: each step usable on its own, each one verified before the next.

Then the pace didn't stop. Spaces. Projects. Drag and drop. Fractional
positioning so reordering one card doesn't renumber the board. Soft-delete
with undo. A changelog doc for every mutation, which later became Time
Travel — the ability to look at what a task used to be.

Somewhere in here the app stopped being the plan and started being itself.
The plan said "table view." What shipped was List and Table **merged into
one view**, because building both revealed they were the same thing wearing
different clothes (`DECISIONS.md`, 2026-07-03). The plan said priority 1–3.
That survived. The plan said `Unsorted` would be a capture inbox. It became
a real space you can archive like any other, because pretending one space
is magic is a rule you have to remember, and the whole point was to not have
to remember things.

By July 13 the version number was in the 3.x range. By July 18, 4.x. The
Android app was real, sideloaded, syncing over the LAN. The thing worked.

**And then it nearly ended.**

---

## Act III — The password in the APK

On July 21, live-testing a real installed Android build, something looked
wrong: sync was pre-configured. To a server address the owner recognized.
With credentials already filled in.

Vite loads `.env.local` for **every** build mode — not just `npm run dev`.
The developer's own local sync URL, username, and password had been
compiled directly into the production bundle, into `dist/`, into the
shipped APK. A real password, in a real artifact, in a repo that was days
away from being made public.

The fix itself was small — gate the reads on `import.meta.env.DEV` so
Vite's minifier dead-code-eliminates the literal values out of any non-dev
build. Two lines. The comment explaining it in `config.ts` is fifteen lines
long, and it is still there, because the *fix* was two lines and the
*lesson* was not.

The cleanup was not small. Git history had to be rewritten with BFG Repo-
Cleaner to purge the credentials from every past commit. Then a full audit
before the repo could go public.

That incident is why `MAINTENANCE.md` now contains a permanent instruction
to grep the **built output**, not just the source, for anything from
`.env.local` — on every single maintenance pass, forever. A source-only
secret scan does not catch this class of bug. Nobody would have found it by
reading the code.

It got caught because someone installed the real thing on a real phone and
looked at it.

That is the whole lesson of this project, arriving early.

---

## Act IV — Deleting the foundation

The plan's very first build step was CouchDB. Apache CouchDB — the actual
Erlang server, installed as a Windows service, running from
`C:\Program Files\Apache CouchDB\`. Twenty-six days of work sat on top of
it. It was in the tech-stack table, the architecture diagram, the risk
table, the prerequisites, and the name of half the codebase's variables.

There was one problem: a **52.7 MB installer**, and **164 MB** installed,
for a personal task manager whose entire pitch was "install it and it just
works." The plan had cheerfully assumed a non-technical person would
install a database server. Reading that back in week four, it was obviously
absurd.

So the owner wrote their own database.

[NyxDB](https://github.com/hrach-gevorgyan/nyxdb) — a from-scratch Rust
reimplementation of CouchDB's replication protocol. Not a wrapper. A
reimplementation, by the same person, on the side, of the thing the entire
project depended on.

**It failed the first time.** July 27, round one: the protocol layer was
clean — zero changes needed in the app, the full test suite passed
including byte-for-byte conflict parity — but real-device pairing surfaced
a storage-directory collision with the old CouchDB path, a missing
working-directory call, a loopback-only bind address, an incomplete CORS
allowlist, and one sync failure that could not be root-caused before the
session ran out. **Reverted to CouchDB on `main`.** A full day of work,
undone.

Round two, the same day. The unresolved failure was reproduced in isolation
against a real NyxDB instance outside the app — and came back clean. It had
been a stale process from rapid rebuild cycles, not a protocol bug. Every
fix from attempt one carried forward. NyxDB's release-build logging
enabled, because debug-only logging was exactly what had made the first
diagnosis so slow.

Two genuine bugs were found in NyxDB itself and fixed upstream that day.
One of them — `_bulk_get` misreporting a live revision as deleted — hit on
**every real first-time device pairing**, because both devices
independently create the same fixed default-seed IDs before they ever sync.
The kind of bug you only find by actually pairing two real devices.

Result: **installer 52.7 MB → 4.98 MB. Installed 164 MB → 20.4 MB.**
Roughly 10x and 8x. The Apache CouchDB service on the machine became a
leftover, still dutifully running, holding a database last written July 24
and never again.

The plan's foundation had been replaced with something the author built
themselves, and the app above it didn't need to change at all. That is what
a good abstraction boundary earns you.

---

## Act V — The decision to stop

July 22. Eighty-two commits in a single day — the busiest of the entire
month.

And the entry written in `DECISIONS.md` that same day says this:

> After a month of full-intensity building, the owner called the pace
> unsustainable: Offlog isn't competing for organic attention in a market
> giants own, and continuing at sprint pace would end in burnout-
> abandonment, not a finished product.

The roadmap was restructured from an open-ended list into **a finite plan
with a defined end**. Not because the project failed. Because:

> the mission was always "a tool for its owner, given away as-is," and
> *being finished* is that mission succeeding.

This is the hinge of the whole story, and it's the least dramatic-looking
line in this document.

Every abandoned side project dies at exactly this point — the moment where
the excitement of building runs out and the discipline of finishing hasn't
started. The usual outcome is a repo that stops receiving commits with no
announcement, because there was never a definition of done to reach.

Offlog wrote one down. And then held to it — on the last day, three
perfectly good feature ideas (snooze, import converters, voice input) were
**deliberately cut off the roadmap** rather than built, so the list could
reach zero.

---

## Act VI — The unglamorous majority

Here is the part nobody puts in a launch post: **21 maintenance passes.**

Not features. Passes. Each one a structured audit against a written
checklist — dead code, duplicated logic, dependency audit, oversized
functions, naming drift, performance suspects, error-handling gaps,
security review, and a list of "recurring blind spots" that grew every time
the project shipped a bug bad enough to deserve a permanent rule.

That blind-spot list is the project's real memory:

- **Floating promises** — because a fire-and-forget `updateTask` caused a
  revision-conflict race and a flaky test that only failed under parallel
  load.
- **Date/time locality** — because one pass found **seven** places using
  UTC instead of the local calendar day. Agenda, Focus lock, overdue
  badges, exports. All wrong at midnight, all invisible in daylight.
- **Packaging paths, not just build/tsc/test** — because TypeScript 7
  passed every gate locally and then broke `npx cap sync android` on the
  next release tag.
- **Script exit paths** — because a PowerShell script succeeded completely
  and still exited 1 in CI, since robocopy's success codes lingered in
  `$LASTEXITCODE`.
- **Build-output secret leakage** — Act III, permanently.

Alongside that: a UI redesign of the sidebar and card detail. A font
removed for being one font too many. An animation harmonization pass that
found the same hover transition written as `.1s`, `.12s`, `.15s`, and
`.08s` across forty-odd places, and made them one value. A month view built
to replace a week view, then the week view deleted entirely — script,
markup, CSS, and every stale doc reference.

And the reworks. CardDetail's Repeat section was rebuilt **from scratch
five times** in one evening, each round responding to a screenshot and a
two-word verdict — *"UI horrible"*, *"still horrible"*, *"toggler is not
good"* — until it fit on one line at 375px with zero horizontal overflow.
The Month calendar's dots moved four times. The "Today" button was
repositioned three times, and the final fix was `top: calc(50% + 4px)`
because the container's padding was asymmetric.

None of this shows up in a feature list. All of it is the difference
between a demo and a thing you'll actually open tomorrow morning.

---

## Act VII — The last day

July 31. Both remaining features shipped: the desktop app became
tray-resident with a global `Ctrl+Alt+O`, and tasks learned to block other
tasks.

Then, instead of declaring victory, three maintenance cycles were run —
deliberately scoped **differently** rather than running one checklist three
times:

1. The standard audit. Found tidiness: a duplicated `escapeHtml`, three
   copy-pasted loaders, stale doc references.
2. **An adversarial data-loss audit.** *What could destroy his real data?*
3. **A long-run stability audit.** *What breaks after three weeks of never
   restarting?*

Cycle 1 found housekeeping. Cycles 2 and 3 found this:

> **Every backup containing an attachment was unrestorable.**

Exports wrote attachment *stubs* — metadata with no bytes. PouchDB rejects
an **entire** `bulkDocs` batch when it meets a stub it can't resolve. So one
attached photo, anywhere in the database, silently turned every backup file
into a brick that failed with nothing but *"Import failed. Please try
again."* Not degraded. Dead. Every space, project and task in the file,
unrecoverable through the app's own restore path.

The safety net had a hole in it the exact shape of the thing it was built to
catch. It had been that way for days. It was found roughly twelve hours
before the app became someone's real task manager.

And cycle 3 found that the tray feature shipped *that same morning* had
silently disabled automatic backups — they only ever ran at app startup,
which used to happen daily and, with close-to-tray, might now never happen
again. The app would have kept showing a reassuring "last backup" timestamp
for weeks.

Both fixed. Five round-trip tests written so neither can come back.

Also fixed that day: a global-shortcut collision that would panic the app
on startup; a second launch forking a second database server onto the same
port and data directory; reminders missed by more than an hour being
**deleted without ever firing**; dragging a status column silently
redefining "done" for an entire project with no warning; the live change
feed going permanently deaf after a laptop sleep with no error handler and
no restart.

`npm audit`: 2 → 0. Clippy: clean. Build warnings: zero, as they have been
enforced all month. 279 tests.

---

## What it cost

| | |
|---|---|
| Calendar days | 31 |
| Days with commits | 29 |
| Commits | 481 |
| Tagged releases | 107 (v2.4 → v6.3.0) |
| Busiest day | 82 commits (July 22) |
| App source | 19,159 lines (TS + Svelte + CSS) |
| Tests | 3,653 lines, 279 passing |
| Rust (desktop + sync host) | 1,061 lines |
| Documentation | 3,020 lines |
| Total churn | +90,513 / −34,256 across 324 files |
| Maintenance passes | 21 |
| Foundations replaced | 1 (CouchDB → NyxDB, self-authored) |
| Installer size | 52.7 MB → 4.98 MB |

**A third of all work was deletion.** 34,256 lines removed against 90,513
added. Week view, PWA support, IBM Plex Mono, mesh sync, automatic 3-way
conflict merge, an entire database server, and three features cut on the
final day. The project got good by subtraction at least as much as by
addition.

---

## What it's worth

Todoist charges for reminders and sync. TickTick charges yearly. Things 3
costs about $80 across Apple devices and has no Windows build at all. Every
one of them puts sync — the actual thing you wanted — behind the paywall,
because sync is the part that costs *them* money to run.

Offlog does Kanban, List, Agenda with a month calendar, Focus, attachments,
recurring tasks with real month-end and DST handling, custom fields, tags
with colors, reminders with quiet hours, App Lock with biometrics, full
change history, conflict resolution, soft-delete with undo, task
dependencies, and phone-to-PC sync over your own Wi-Fi with a database
server bundled inside the desktop app so you never once have to think about
running one.

No account. No subscription. No telemetry. Nobody can deprecate it,
price-hike it, or get acquired and shut it down.

Being honest: those products have polish, scale, mobile parity,
integrations, support teams, and millions of users. This is not "one person
beat Todoist in a month." This is **one person built the 10% of Todoist
they actually use, on terms nobody can revoke** — and then spent the last
day trying to break it on purpose before trusting it with anything real.

---

## The actual lesson

AI made this fast. 481 commits in 31 days is not a month of one person
typing, and pretending otherwise would be dishonest.

But speed was never the thing that made it *safe*.

What made it safe was: a spec locked before any code. A rule that every bug
bad enough to cost a day gets a permanent written invariant, in the same
commit as its fix. Twenty-one structured audits instead of vibes. Live
testing on real devices, which is how the credential leak, the shrunken
splash icon, the stuck modal, and the NyxDB pairing bugs were all found —
none of them by reading code. A decision log that records the reversals,
not just the wins. And on the last day, three audits scoped to ask *what
would hurt* rather than *what is untidy* — which is the only reason the
backup system got fixed before it was needed instead of after.

The owner's own summary, which is the truest line in this document:

> without my control checking and ideas it will be never success

That's right, and it's worth being precise about why. The AI wrote most of
the lines. It did not decide to rewrite the database, or to make the
roadmap finite, or to cut three features on the last day, or to install the
build on a real phone and notice the password sitting in it. It did not
know when to stop.

Direction, judgment, and knowing when finished is better than more — those
stayed human the whole way through.

---

## Where it ends

It doesn't end. It arrives.

From 2026-08-01, Offlog is its author's primary task manager. `ROADMAP.md`'s
"Next up" section is empty for the first time since July 1. What remains is
bugs found in real use, dependency batches, security reviews, and a slow
walk toward a Play Store listing that's waiting on Google, not on anyone
here.

The plan on July 1 said the goal was *a working kanban board on the PC that
syncs to its own CouchDB.*

Thirty-one days later there's a tray-resident Windows app and an Android
app sharing one task list over the home network, with no CouchDB anywhere
in it, and the most important thing that happened on the final day was
discovering the backups didn't work — and fixing them before it mattered.

That's not a launch. That's a landing.

---

*Written 2026-07-31, the last day of development.*
*See [DECISIONS.md](DECISIONS.md) for why, [TECH.md](TECH.md) for how,
[CHANGELOG.md](CHANGELOG.md) for when, and
[archive/changelog-archive.md](archive/changelog-archive.md) for all
twenty-one maintenance passes in full.*
