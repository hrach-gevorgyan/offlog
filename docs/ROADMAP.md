# Offlog Roadmap

Current version: [CHANGELOG.md](CHANGELOG.md). Why a choice was made, and
open questions: [DECISIONS.md](DECISIONS.md). How the app works:
[TECH.md](TECH.md). Shipped, declined and parked history:
[archive/roadmap-archive.md](archive/roadmap-archive.md).

Organised as **Now / Next / Later**. Nothing here is dated, and nothing in
Later is a promise.

## Status: in use, not closed

Offlog has been finished and in daily use by its author since 2026-08-01.
Finished is not the same as closed:

- **Finished** — the planned work is done. Nothing is queued or promised.
- **Not closed** — bugs hit in real use get fixed, dependencies get
  updated, security gets reviewed.
- **New work needs a real trigger** — something wanted while genuinely
  using the app, or a security issue. Not an idea, and not a feature
  another task manager happens to have.

An empty Next is the goal being met, not the project stalling.

## Mission

Free, open-source, local-first. No account, no telemetry, no subscription,
ever. A personal tool, built by one person for their own use, given away
as-is. No business model, none planned. One test for any change: does it
make Offlog nicer to use, or just bigger?

---

## Now — waiting on someone else, not on us

- **C3, Play Store listing.** Signing key wired into CI, privacy policy
  done, listing assets ready. Waiting on Google's identity verification and
  review. Worth checking before assuming a smooth listing: does local
  network sync attract extra review friction? See DECISIONS.md.
- **C5, landing page.** One plain GitHub Pages page. On hold, not blocking
  anything.

## Next — empty

Bugs found in daily use are now the main driver of change. Features aren't
planned in advance, but they aren't refused either: the bar is "does daily
use actually demand this", which usually has to be answered by living with
the app rather than imagining it. Anything clearing that bar lands here.

## Later — direction, not promises

Deprioritised, not declined. Only if daily use ever demands them:

- **Snooze** — one-tap defer to tomorrow or next week, extending the
  existing notification "Snooze 1h" to the task itself.
- **Import converters** — one-way Trello/ClickUp/Jira export conversion,
  not a live connection.
- **Voice input for Quick Add** — platform speech-to-text into the existing
  parser, Android first.

**Parked permanently:** rethinking positional "done", sub-projects. See the
archive for why.

## Maintenance track

Runs independently of the above.

- **Patch release** — a real bug from daily use, or a reproducible report.
  No feature work rides along.
- **Maintenance pass** — cadence and process live in
  [MAINTENANCE.md](MAINTENANCE.md), which holds the current pointer. Ships
  as its own patch even with zero visible change.
- **Dependabot** — batched roughly monthly into the next patch. A security
  advisory with a real fix ships immediately instead.

## iOS

Needs a Mac, Xcode, and Apple's $99/year account — the fee alone
contradicts the zero-cost stance, so this stays community-contribution
only. The realistic zero-cost path onto an iPhone is the web build as a PWA
(Safari → Add to Home Screen), with real gaps: no widgets, no lock-screen
notification actions, and LAN sync from a PWA is untested. If this ever
matters, the first step is testing the existing web build on a real iPhone,
not building a native app.

## Declined

iOS as a native app, F-Droid, mesh sync, remote sync, accounts, and Windows
code signing are all settled — see [DECISIONS.md](DECISIONS.md). Declined
feature ideas (stale-task triage, daily shutdown ritual, weekly review,
checklist templates) aren't listed individually; don't re-propose them.

Marketing beyond keeping the README and landing page current isn't a
roadmap item.

## Business model — none

No customers, no obligations. Never paywalled, never ad-supported, never
sells data. GitHub Sponsors exists (`.github/FUNDING.yml`) but isn't a
plan. See [DECISIONS.md](DECISIONS.md).
