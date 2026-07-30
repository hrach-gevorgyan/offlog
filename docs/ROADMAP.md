# Offlog Roadmap

Current version: [CHANGELOG.md](CHANGELOG.md), not restated here. Why a
choice was made: [DECISIONS.md](DECISIONS.md) (also open questions).
How the app works: [TECH.md](TECH.md). Shipped/declined/parked history:
[archive/roadmap-archive.md](archive/roadmap-archive.md).

**2026-07-30:** dropped the old "three milestones, then a Done
declaration" framework — it gated a version bump on Google's Play
Console review timeline, something nobody here controls. What shipped
under that framework: see the archive's "v6.0.0" entry. From here on,
this file just tracks what's actually still open, one step at a time.
No milestone ceremony, no forced sequencing beyond what genuinely
depends on something else.

## Mission

Free, open-source, local-first. No account, no telemetry, no
subscription, ever. A personal tool, built by one person for their own
use, given away as-is. No business model, none planned. One test for
any change: does it make Offlog nicer to use, or just bigger?

---

## Open — waiting on someone else, not on us

- **C3, Play Store listing.** Signing key wired into CI, privacy
  policy done, listing assets ready. Waiting on Google's Play Console
  identity verification and review — their calendar, not ours. Open
  question worth checking before assuming a smooth listing: does the
  app's local-network sync trigger extra review friction? See
  DECISIONS.md.
- **C3b, Windows code signing (SignPath).** Applied, declined for lack
  of public-visibility signals — not a rejection on merit, reapply
  welcome later. Free-program-only, permanently: if it's ever not free,
  it stays undone. Not blocking anything.
- **C5, landing page.** One plain GitHub Pages page. On hold, no energy
  for it right now. Not blocking anything.

## Next up — one at a time, no fixed order

A vetted backlog, not a schedule. Finish and ship one before starting
the next, same as v6.7.0 through v6.11.0 shipped one at a time.
Reordering needs an explicit owner call — this is priority-ranked, not
a bag of ideas.

1. **Snooze.** One tap on any task: defer to tomorrow or next week
   without opening the editor. Extends the existing notification
   "Snooze 1h" to the task itself. Small.
2. **Calendar sync (.ics feed).** Dated tasks as a local feed the OS
   calendar subscribes to and refreshes itself — not a one-shot export.
   No cloud. Small-medium.
3. **Checklist templates.** Save any task's checklist as a named
   template, insert into any task — same mechanism as project
   templates, one level down. Small.
4. **Import converters.** One-way import from Trello/ClickUp/Jira
   export files. A file conversion, not a live connection. Trello's
   JSON export first — most Kanban-shaped. Medium.
5. **Voice input for Quick Add.** Dictate instead of typing, platform
   speech-to-text feeding the existing parser, no cloud service of our
   own. Medium, Android-first.

Declined ideas (stale-task triage, daily shutdown ritual, weekly
review) aren't listed — don't re-propose them. A genuinely new idea
either slots in at the end after owner vetting, or goes to DECISIONS.md's
Open Questions unvetted.

**Parked permanently:** rethinking positional "done," sub-projects —
see archive for why.

## Bugfix / audit track — runs independently

- **Patch bump**: a real bug hit in daily use, or a reproducible user
  report. No feature work rides along.
- **Quarterly maintenance pass**: dependency audit, warning/lint sweep,
  doc-drift check — see [MAINTENANCE.md](MAINTENANCE.md). Ships as its
  own patch even with zero visible change.
- **Dependabot**: batched roughly monthly into whichever patch is next.
  A security advisory with a real fix ships immediately instead.

## iOS

Needs a Mac, Xcode, and Apple's $99/year account — the fee alone
contradicts the zero-cost stance, so this stays community-contribution-
only. The real zero-cost path onto an iPhone is the web build as a PWA
(Safari → Add to Home Screen), with real gaps: no widgets, no
lock-screen notification actions, LAN sync from a PWA is untested. If
this ever matters, the first step is testing the existing web build as
a PWA on a real iPhone, not building a native app.

---

## Declined, not just unstarted

- iOS as a native app, F-Droid, mesh sync, remote sync, accounts — all
  long-decided, see DECISIONS.md.
- Marketing/promotion beyond keeping README and the landing page
  current — not a roadmap item. Posting about Offlog anywhere is a
  mood, not a plan.

## Business model — none

No customers, no obligations. Never paywalled, never ad-supported,
never sells data. GitHub Sponsors/donations exist (`.github/FUNDING.yml`)
but aren't a plan. See DECISIONS.md.
