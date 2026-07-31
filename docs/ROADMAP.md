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

## Next up — the last two, then development stops

**2026-07-31:** trimmed to just the two items below, plus C3 (Play
Store listing, above) clearing whenever Google gets to it. Once both
ship, that's the finite plan done — into maintenance mode (quarterly
passes, Dependabot batches, patch fixes only when daily use actually
hits something). Reordering needs an explicit owner call.

1. **Desktop tray-resident + global quick-capture shortcut.** Keep
   running in the system tray instead of quitting on window close, plus
   a global hotkey (e.g. Ctrl+Alt+O) that pops a small quick-add/quick-
   check window from anywhere, no need to have Offlog focused. Real
   background-persistence work (autostart, tray icon, close-to-tray vs.
   quit), Windows/Tauri-only. Also the thing that would make a live
   calendar-subscribe feed viable again if it ships (see DECISIONS.md).
   Medium-large.
2. **"Blocked by," not just "related."** Task linking (v6.7.0) only does
   loose "related" links — add a real dependency: this task can't start
   until that one's done. Focus view should skip a task that's still
   blocked, which it can't tell today. Medium.

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
