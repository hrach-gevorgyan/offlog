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

### Milestone 1 — "Stable for me" — DONE 2026-07-23

B61 (App Lock PIN confirmation), E3 (desktop auto-updater, later
hardened across v5.7.6-5.7.10), B62 (automatic local backup), and A32
(UI test hardening) all shipped ahead of the end-of-August target —
full detail archived in
[archive/roadmap-archive.md](archive/roadmap-archive.md)'s "Milestone 1"
section. **Still-open owner action:** copy both the Android signing key
(`C:\Users\hrach\Offlog-signing\`) and the Tauri updater key
(`~/.tauri/offlog-updater.key`) somewhere off this machine — both are
permanent identities that can't be re-issued.

### Milestone 2 — "Installable by normal humans" (target: end of October 2026)

The one thing that actually matters for anyone else ever using this:
being findable and installable without knowing what "sideload" means.

- **C3 — Play Store listing.** The highest-leverage remaining item for
  other humans, because normal people will never install an APK from
  GitHub. Signing key already exists and is wired into CI. Remaining:
  a Play Console developer account (**$25 one-time — owner-approved
  cost, 2026-07-23**), store listing assets (icon exists; screenshots,
  short/full description from BRAND.md's copy), a privacy-policy page
  (trivial to write honestly: "no data is collected"), and Google's
  review process. Calendar time is mostly waiting on Google, not
  working.
- **C3b — Windows code signing via SignPath (owner-decided,
  2026-07-23).** Removes the Windows SmartScreen "unverified
  publisher" warning on the installer — free for qualifying open-source
  projects, evaluated against SignPath Foundation's actual eligibility
  list and Offlog is a clean fit (MIT, no proprietary deps, active,
  released, no telemetry — see DECISIONS.md for the full check).
  Needed before applying: GitHub MFA enabled, a short public "code
  signing policy" doc, a SignPath credit line, confirm installer binary
  metadata is set (already is, via `tauri.conf.json`). Then: apply,
  wait for Foundation review (days–weeks), wire the signing step into
  `release.yml` once approved. Android's Play Store warning is a
  separate, unrelated thing (solved by C3's $25 fee, not this).
- **C5 — Landing page.** A single plain GitHub Pages page using
  BRAND.md's tagline/copy, linking the Play Store listing (once live)
  and GitHub Releases. Deliberately after or alongside C3 so it has
  something better than an APK to link to. (~1 session.)
- **C8 — Encrypt the stored sync password at rest** (owner-decided,
  2026-07-27, resolving IDEAS.md's old Q1). Today the sync password
  lives in plain `localStorage` (`config.ts`'s `setSyncCredentials()`)
  — flagged by CodeQL as a real, if low-severity, finding; dismissed for
  now with that justification, not fixed yet. Needs a real design pass,
  not a quick patch: a key-derivation/storage strategy (Web Crypto API)
  and, likely, an unlock step tied into the existing App Lock PIN flow
  rather than a second separate secret. Scope this properly before
  starting — don't bolt on ad hoc encryption just to silence the alert.

**One-time owner action (5 minutes, browser, free on public repos):**
GitHub → Settings → Code security: enable **secret scanning** and
**push protection** (blocks a committed key/token before it lands —
the v5.7.1 incident class, at the git layer), and **dependency
review** on PRs. These were noted at the public flip and are still
unenabled. Beyond this, security improvement is B61 (milestone 1) and
the standing MAINTENANCE.md checklist — sync-transport encryption
(TLS on the LAN link) was considered and stays out: the manifesto's
stance is that home-Wi-Fi sync is private by scope, and self-signed
cert trust on Android would break the zero-config pairing promise for
marginal gain on a home network. Revisit only if a real user reports a
real hostile-LAN use case.

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
