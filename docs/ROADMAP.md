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
  friction bothers me every day," not "this would be nice." Pull from
  the vetted backlog below first; genuinely new ideas that don't clear
  the bar go to [IDEAS.md](IDEAS.md) without guilt.
- **Parked permanently unless daily use demands them:** B28 (rethink
  positional "done"), B33 (sub-projects) — see archive for reasoning.
  These do not block Done.

---

## Post-Done backlog (pre-vetted, maintenance-mode only, 2026-07-22)

Not milestone work, not scheduled — the pre-vetted shortlist for
maintenance mode, so when daily use demands something it's already been
thought through instead of re-litigated from scratch. Curated with the
owner from a larger brainstorm; everything declined (stale-task triage,
daily shutdown ritual, weekly review — "so much statistics from every
app, now this one?? no") is deliberately not listed here, don't
re-propose those. Pull the next one only when daily use actually demands
it, per the maintenance-mode rule above — roughly ordered by expected
value:

- **"Not today" snooze.** One tap on any task: defer to tomorrow / next
  week without opening the editor. Snooze exists today only as the
  notification action's "Snooze 1h" — this extends the idea to the task
  itself, guilt-free. Small.
- **Calendar (.ics) export.** Dated tasks as a local .ics file/feed the
  OS calendar reads — deadlines next to real appointments, no cloud.
  Small-medium.
- **Checklist templates.** Reusable checklists (packing list, grocery
  run) — save any task's checklist as a named template, insert into any
  task. Same mechanism as the existing project templates, one level
  down. Small.
- **Import converters (very popular tools only).** One-way import from
  Trello / ClickUp / Jira export files into Offlog's model. This is the
  owner's accepted flavor of "integration" — a one-time file conversion,
  not a live connection, so it doesn't violate the no-integrations
  stance in DECISIONS.md's manifesto. Medium (per-tool mapping work,
  Trello's JSON export first — it's the most kanban-shaped).
- **Voice input for Quick Add.** Dictate a task instead of typing —
  platform speech-to-text (Android's built-in recognizer / Web Speech
  API where available) feeding the existing NLP regex parser, no cloud
  service of our own. Medium; Android-first.
- **Distraction-minimal interface pass.** Owner's framing: every
  productivity app (ours included) accumulates too many on-screen
  things; the create-work-complete lifecycle should be the whole
  visible surface. Not a feature — a *reduction* pass: audit every
  view for chrome that doesn't serve the current task, possibly a
  "minimal mode" toggle. Large-ish in judgment, small in code.
- **Task linking & dependencies.** "This task blocks that one" /
  related-task links. Real value, but touches the data model — same
  caution class as parked B28/B33: needs a design conversation first,
  not a casual add.
- **File attachments (with size optimization).** PouchDB supports
  binary attachments natively and they replicate over the existing
  sync — but storage growth and sync payload on phones is the real
  concern, so images would need client-side downscale/compression on
  attach. Medium-large; the one item here with real storage-cost risk.
- **Recurrence robustness pass.** Recurring tasks already exist
  (db.ts's reset-in-place model) — owner's ask is the quality bar:
  "smart due dates, reminders, and recurrence that don't break."
  A dedicated test/edge-case pass (month-end dates, DST, skipped
  occurrences while offline) rather than new behavior.
- **Unified search.** Global Search already covers tasks — extend to
  notes/checklist contents so one search box finds everything in-app.
  (The "connected tools" half of the original idea is out of scope —
  no live connections, per the manifesto; imported data becomes normal
  Offlog data and is searched like everything else.)

**iOS reality check** (owner asked, 2026-07-22): a native iOS build
needs a Mac, Xcode, and Apple's $99/year developer account, plus App
Store review — the yearly fee alone contradicts the zero-cost stance,
so it stays community-contribution-only per DECISIONS.md. The realistic
zero-cost path onto an iPhone is the **web build as a PWA**: Safari →
Add to Home Screen gives an installable, offline-capable app icon, and
iOS 16.4+ supports web push notifications. Real limitations: no
widgets, no lock-screen notification actions, and LAN sync from a PWA
needs the phone's browser to reach the PC host over plain http (mixed-
content/local-network rules make this finicky, untested). If iOS ever
matters, the first step is one evening of testing the existing web
build as a PWA on a real iPhone — not opening a native front.

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
