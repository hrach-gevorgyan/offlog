# Offlog Roadmap

Current version: [CHANGELOG.md](CHANGELOG.md), not restated here. Why a
choice was made: [DECISIONS.md](DECISIONS.md) (also open questions).
How the app works: [TECH.md](TECH.md). Shipped/declined/parked history:
[archive/roadmap-archive.md](archive/roadmap-archive.md).

## Status: in use, not closed

**As of 2026-08-01, Offlog is finished and in daily use by its author.**
That is not the same as closed, and the difference matters:

- **Finished** means the planned work is done. `Next up` is empty. No
  feature is queued, in progress, or promised.
- **Not closed** means the repo stays alive. Bugs hit in real daily use
  get fixed. Dependencies get updated. Security gets reviewed. The Play
  Store listing keeps moving, slowly, on Google's schedule.
- **New work needs a real trigger** — something wanted while genuinely
  using the app, or a security issue. Not an idea, not a feature someone
  else's task manager has, not a "wouldn't it be nice."

So the ongoing shape of this project, indefinitely, is: bugfixes,
dependency batches, security revisions, and the Play Store. That's it.
If a real need shows up in daily use, it gets built. If it doesn't,
nothing does — and that's the plan working, not the plan stalling.

How it got here: [STORY.md](STORY.md).

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

## Next up — nothing. Development is done.

**2026-07-31 — the finite plan is closed.** Both remaining items shipped
in v6.3.0 (desktop tray-resident + global quick-capture shortcut, and
"Blocked by" task dependencies), followed by three maintenance cycles
specifically aimed at the things that break under real daily use rather
than on a fresh install. From 2026-08-01 the author uses Offlog as their
own primary task manager, and the project is in **maintenance mode**:

- Bugs hit in actual daily use get fixed. Nothing else does.
- Quarterly maintenance passes and Dependabot batches continue (see the
  bugfix/audit track below) — that's upkeep, not development.
- **New features are not planned, and proposing them is not a
  contribution to this project.** "Does daily use demand it?" is the
  only question that reopens this section, and the answer has to come
  from months of real use, not from an idea.

The one thing still genuinely open is C3 (Play Store listing, above),
and that's waiting on Google, not on any work here.

**Deprioritized, not declined — future ideas if daily use ever demands
them, not part of the finite plan** (moved off this list 2026-07-31 to
keep it down to just the two items above): Snooze (one-tap defer to
tomorrow/next week, extending the existing notification "Snooze 1h" to
the task itself), Import converters (one-way Trello/ClickUp/Jira export
file conversion, not a live connection), Voice input for Quick Add
(platform speech-to-text into the existing parser, Android-first).

Declined ideas (stale-task triage, daily shutdown ritual, weekly
review, checklist templates) aren't listed — don't re-propose them.

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
