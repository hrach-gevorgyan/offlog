# Offlog Roadmap — The Final Plan

See [CHANGELOG.md](CHANGELOG.md) for the current version — the single
source of truth, not restated here since it drifts. For *why* a
non-obvious choice was made, see [DECISIONS.md](DECISIONS.md) (also the
project's manifesto); for open questions, [IDEAS.md](IDEAS.md); for how
the app works today, [TECH.md](TECH.md). Everything shipped, declined,
or parked lives in [archive/roadmap-archive.md](archive/roadmap-archive.md).

**What changed 2026-07-22 (owner decision):** after a month of
full-intensity building, this roadmap was restructured from an
open-ended candidate list into a *finite* plan with a defined end
state. Offlog is not chasing growth, virality, or a market position —
the giants own that battlefield and competing there was never the
mission (see DECISIONS.md). The mission this plan serves: **make the
app genuinely done — stable and complete for its owner's daily use,
and installable by any normal human who happens to want the same
thing — then stop building and just use it.** Being finished is the
goal, not a failure state.

## Mission (unchanged)

Offlog is free, open-source, and local-first — no account, no telemetry,
no subscription, ever. A personal tool, built by one person for their own
use, given away as-is for anyone who wants the same thing. No business
model, none planned. Judged by one question: does a change make Offlog
nicer for its owner to use, or does it just make it bigger?

---

## The Path to Done

Three milestones, then maintenance mode. Deadlines are deliberately
loose — month-level targets to keep momentum without recreating the
last month's unsustainable pace. Slipping a target is fine; adding new
scope is what's not fine. **Nothing gets added to these milestones.**
A new idea either replaces something of equal size, waits for
maintenance mode's bar ("does it annoy me in daily use?"), or goes to
IDEAS.md and probably stays there.

### Milestone 1 — "Stable for me" (target: end of August 2026)

The app is fully trustworthy for the owner's own daily use, and keeps
itself updated without manual effort. Two items, both small:

- **B61 — Require current PIN to change/remove App Lock.** The one
  known real security gap: anyone holding the unlocked device can
  silently disable App Lock. Confirm the current PIN first, like any
  password change anywhere. (~1 session.)
- **E3 — Desktop auto-updater.** Already scaffolded; needs the owner to
  run `cargo tauri signer generate` (free, minutes), then wiring the
  pubkey + GitHub Releases endpoint into `tauri.conf.json` and the
  release workflow. Payoff: future releases reach the owner's own PC
  with zero manual reinstalls — this directly reduces all future
  maintenance effort, which is why it's in milestone 1. (~1 session
  plus the owner's keygen.)

### Milestone 2 — "Installable by normal humans" (target: end of October 2026)

The one thing that actually matters for anyone else ever using this:
being findable and installable without knowing what "sideload" means.

- **C3 — Play Store listing.** The highest-leverage remaining item for
  other humans, because normal people will never install an APK from
  GitHub. Signing key already exists and is wired into CI. Remaining:
  a Play Console developer account ($25 one-time), store listing
  assets (icon exists; screenshots, short/full description from
  BRAND.md's copy), a privacy-policy page (trivial to write honestly:
  "no data is collected"), and Google's review process. Calendar time
  is mostly waiting on Google, not working.
- **C5 — Landing page.** A single plain GitHub Pages page using
  BRAND.md's tagline/copy, linking the Play Store listing (once live)
  and GitHub Releases. Deliberately after or alongside C3 so it has
  something better than an APK to link to. (~1 session.)

### Milestone 3 — "Done" (whenever 1 and 2 are done — no separate work)

Not a work item; a declaration with a checklist:

1. Milestones 1 and 2 shipped.
2. Version bumped to **v6.0.0** — the "done" release, tagged and
   published like any other, release notes saying exactly what this
   document says: the app is complete.
3. This file rewritten one last time to a short "maintenance mode"
   statement (the rules below), with everything else archived.
4. The README gains one honest line: Offlog is complete software —
   maintained, not growing.

**"Done" does not mean abandoned.** It means the definition of success
stops being "shipped something this week" and becomes "it keeps
working."

---

## Maintenance mode (the rules after Done)

- **Dependencies:** batch Dependabot PRs roughly **monthly**, not
  per-alert. Security advisories with a real fix available are the only
  interrupt-driven exception.
- **Maintenance pass:** quarterly (replacing the every-3-releases
  cadence, since releases become rare) — same process in
  [MAINTENANCE.md](MAINTENANCE.md).
- **Bug fixes:** when something annoys the owner in daily use, or a
  real user files a reproducible issue. No proactive feature work.
- **New features:** only if daily use *demands* one — the bar is "this
  friction bothers me every day," not "this would be nice." Ideas that
  don't clear the bar go to [IDEAS.md](IDEAS.md) without guilt.
- **Parked permanently unless daily use demands them:** B28 (rethink
  positional "done"), B33 (sub-projects) — see archive for reasoning.
  These do not block Done.

---

## What was deliberately cut from the plan (2026-07-22)

Recorded here so future sessions don't resurrect them as "still open":

- **Command Palette same-name disambiguation** (B60 follow-up) —
  declined; small surface, never bitten in real use. Archived with B60.
- **Marketing/promotion beyond C3+C5** (social posts, HN, outreach) —
  explicitly not part of Done. If the owner ever feels like posting
  somewhere, that's a mood, not a roadmap item.
- **iOS, F-Droid, mesh sync, remote sync, accounts** — all long-decided
  (DECISIONS.md); listed once more only because "final plan" is where
  someone would look for them.

---

## Business model — none, deliberately

Unchanged, and part of what makes maintenance mode sustainable: no
customers means no obligations. Never paywalled, never ad-supported,
never sells data. GitHub Sponsors/donations exist (FUNDING.yml) but are
not a plan. See DECISIONS.md.

---

## Sequencing note

Within what remains: B61 before or with E3 (both milestone 1), C3
before C5 (milestone 2). Maintenance passes per
[MAINTENANCE.md](MAINTENANCE.md)'s pointer until Done, quarterly after.
Extend `tests/db.test.ts` for any new `db.ts` logic as always.
