# Offlog Roadmap

See [CHANGELOG.md](CHANGELOG.md) for the current version — the single
source of truth, not restated here since it drifts. For *why* a
non-obvious choice was made, see [DECISIONS.md](DECISIONS.md) (also the
project's manifesto); for open questions, [IDEAS.md](IDEAS.md); for how
the app works today, [TECH.md](TECH.md). Everything shipped, declined,
or parked lives in [archive/roadmap-archive.md](archive/roadmap-archive.md).

**What changed 2026-07-30 (owner decision):** dropped the "three
milestones, then a Done declaration" framework this file used from
2026-07-22 through v6.0.0 — it had accreted its own overhead (gating a
version bump on Google's Play Console review timeline, outside anyone's
control). Full reasoning and what shipped under the old framework:
[archive/roadmap-archive.md](archive/roadmap-archive.md)'s "v6.0.0"
entry. Going forward, this file just tracks what's actually still
open, worked one step at a time — no milestone ceremony, no forced
sequencing beyond what genuinely depends on something else.

## Mission (unchanged)

Offlog is free, open-source, and local-first — no account, no telemetry,
no subscription, ever. A personal tool, built by one person for their own
use, given away as-is for anyone who wants the same thing. No business
model, none planned. Judged by one question: does a change make Offlog
nicer for its owner to use, or does it just make it bigger?

---

## Open — waiting on something outside this repo

Nothing to actively build here; just tracking status.

- **C3 — Play Store listing.** Everything on our side is ready (signing
  key wired into CI, privacy policy done, listing copy/assets Play-
  ready). Waiting on Google's Play Console identity verification and
  review — calendar time, not work.
- **C3b — Windows code signing (SignPath).** Applied 2026-07-28,
  declined 2026-07-29 for insufficient public-visibility signals
  (stars/forks/discussion) — not a rejection on merit, reapplication
  explicitly welcomed once the repo has some organic traction. **Free-
  program-only, permanently** — if SignPath isn't free for this
  project, this stays undone rather than ever paying for a certificate.
  See DECISIONS.md.
- **C5 — Landing page.** A single plain GitHub Pages page, linking the
  Play Store listing (once live) and GitHub Releases. On hold — no
  energy for it right now, not blocking anything else, pick up whenever.

## Next up — one at a time, no fixed order

A vetted backlog, not a schedule. Pick one when there's energy for it;
finish and ship it before starting the next, same as v6.7.0 through
v6.11.0 were built one at a time rather than in parallel. Reorder only
with an explicit owner decision — this list is priority-ranked, not
just a bag of ideas.

- **Snooze.** One tap on any task: defer to tomorrow / next week
  without opening the editor. Extends the notification action's
  "Snooze 1h" to the task itself. Small.
- **Calendar sync (.ics feed).** Dated tasks as a local .ics feed the
  OS calendar subscribes to and refreshes on its own schedule — not a
  one-shot export. No cloud. Small-medium.
- **Checklist templates.** Save any task's checklist as a named
  template (packing list, grocery run), insert into any task — same
  mechanism as project templates, one level down. Small.
- **Import converters.** One-way import from Trello/ClickUp/Jira export
  files into Offlog's model — a file conversion, not a live connection
  (doesn't violate the no-integrations stance in DECISIONS.md).
  Trello's JSON export first (most Kanban-shaped). Medium.
- **Voice input for Quick Add.** Dictate a task instead of typing —
  platform speech-to-text feeding the existing NLP parser, no cloud
  service of our own. Medium, Android-first.

Curated with the owner from a larger brainstorm; everything declined
(stale-task triage, daily shutdown ritual, weekly review) is
deliberately not listed here — don't re-propose those. A genuinely new
idea either slots in at the end after owner vetting, or goes to
[IDEAS.md](IDEAS.md) unvetted.

**Parked permanently, not on this list:** B28 (rethink positional
"done"), B33 (sub-projects) — see archive for reasoning.

## Bugfix / audit track — runs independently of the above

- **Patch bump:** a real bug the owner hits in daily use, or a
  reproducible issue a real user files. No proactive feature work rides
  along in the same release.
- **Quarterly maintenance pass**: dependency audit, warning/lint sweep,
  doc-drift check — see [MAINTENANCE.md](MAINTENANCE.md). Ships as its
  own patch version even with zero user-visible change.
- **Dependabot:** batch PRs roughly monthly, folded into whichever patch
  version is next. A security advisory with a real fix available ships
  immediately as its own patch instead of waiting for the batch.

## iOS reality check

A native iOS build needs a Mac, Xcode, and Apple's $99/year developer
account, plus App Store review — the yearly fee contradicts the
zero-cost stance, so it stays community-contribution-only (see
DECISIONS.md). The realistic zero-cost path onto an iPhone is the web
build as a PWA (Safari → Add to Home Screen); real limitations apply
(no widgets, no lock-screen notification actions, LAN sync from a PWA
is untested). If iOS ever matters, the first step is testing the
existing web build as a PWA on a real iPhone, not opening a native
front.

---

## What's declined, not just unstarted

Recorded here so it doesn't get re-proposed:

- **iOS, F-Droid, mesh sync, remote sync, accounts** — long-decided,
  see DECISIONS.md.
- **Marketing/promotion** (social posts, HN, outreach) beyond keeping
  README/the landing page current — not a roadmap item; if the owner
  ever feels like posting somewhere, that's a mood, not a plan.

## Business model — none, deliberately

No customers means no obligations. Never paywalled, never ad-supported,
never sells data. GitHub Sponsors/donations exist (FUNDING.yml) but are
not a plan. See DECISIONS.md.
