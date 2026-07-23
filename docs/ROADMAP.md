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

### Milestone 1 — "Stable for me" — DONE 2026-07-23 (target was end of August 2026)

The app is fully trustworthy for the owner's own daily use, and keeps
itself updated without manual effort. Grew from two items to four on
owner request 2026-07-22 (health-score review) — all stability-class,
none of it feature growth. All four shipped ahead of target:

- **B61 — Require current PIN to change/remove App Lock. Done
  2026-07-23.** New `ConfirmPinGate.svelte` (a small reusable
  component, deliberately not inline SettingsPanel state, so the flow
  is unit-testable without mounting the whole panel — 6 tests in
  `ConfirmPinGate.test.ts`, suite now 197): both Change PIN and
  Remove PIN now require the current PIN first, like any password
  change. Entering the PIN *is* the confirmation for removal — the
  old confirmAction() dialog was dropped rather than stacked on top
  (its warning text moved into the gate's message). Initial PIN setup
  never gates (there's nothing to prove yet). Verified live in the
  browser: wrong PIN shows an error and clears the field, correct PIN
  passes through to the change form / removal, Cancel and Escape back
  out. Ships with the next version bump (bundled with the rest of
  milestone 1, not tagged alone).
- **E3 — Desktop auto-updater. Done 2026-07-23.** Owner ran `cargo
  tauri signer generate` and provided the public key (private key +
  password kept by the owner, never seen by the assistant, per
  `lib.rs`'s own comment on why that generation had to be manual).
  `tauri.conf.json`'s placeholder pubkey/endpoint replaced with the
  real key and `github.com/hrach-gevorgyan/offlog/releases/latest/
  download/latest.json`. `release.yml`'s Windows job now passes
  `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` (owner added both as repo
  secrets) so `tauri-action` signs the installer and produces
  `latest.json` automatically; falls back to an unsigned build if
  those secrets are ever absent, same safety pattern as the Android
  keystore. Draft release now attaches `.sig`/`latest.json` alongside
  the installer/APK. Verified: valid JSON/YAML, `offlog-desktop` still
  builds clean. Next real release tag will be the first to actually
  exercise the signed update path end-to-end.
- **B62 — Automatic local backup. Done 2026-07-23.** New
  `autoBackup.ts`: on app start, at most once every ~20h, silently
  writes a full JSON snapshot to app-private storage and rotates to
  the newest 7 — desktop via `@tauri-apps/plugin-fs`
  (`appDataDir()/auto-backups/`), Android via `@capacitor/filesystem`
  (`Directory.Data/auto-backups/`), no-op on plain web (no reliable
  silent local-file API there, and it's a dev/test surface anyway).
  Answers "what if PouchDB storage corrupts / a profile gets wiped /
  Android storage gets cleared" — previously "hope sync had a second
  copy." Settings → Backup & Storage gets a new on-by-default toggle +
  "last backup" hint, reusing `fmtLastSynced()`'s existing time
  formatting. 7 new pure-logic tests (`isBackupDue`/`filesToDelete`,
  suite now 204); the actual filesystem calls aren't mockable
  meaningfully in Vitest, so verified live instead (toggle persists to
  localStorage, correct "not this browser preview" copy shown on web).
- **A32 — UI test hardening. Done 2026-07-23** (18 new component
  tests, suite now 191): `AppLock.test.ts` (correct/wrong PIN,
  digit-only filter, 3-strike cooldown gates the verifier,
  Escape-never-dismisses, recovery-code flow), `QuickAdd.test.ts`
  (full type → real nlpParse → createTask pipeline: default routing,
  priority/tags, @project match, quoted parse-off, empty-title no-op,
  failure keeps panel open), and `CardDetail.test.ts` extended with
  the discard/delete half of its scope (Cancel and Escape write
  nothing; Delete is confirm-gated, soft-deletes and reloads on
  confirm, does nothing on decline, and surfaces a visible error on
  failure — the audited no-silent-failure invariant, now pinned).
  Bonus real catch: db.test.ts's dashboard test built "today" via UTC
  `toISOString()` — failed only when run after midnight local, the
  exact date-locality blind-spot class MAINTENANCE.md codifies; app
  code was already correct, the test was the last UTC holdout. The
  one intentionally-out-of-scope piece: B61's confirm-current-PIN
  flow gets its AppLock tests written in B61's own session (can't
  test what doesn't exist yet); delete/undo *toast* UI (inline in
  App.svelte) stays untested by choice — mounting the whole app shell
  in jsdom is brittleness, not coverage, and its logic (including the
  chained-toast regression) is already pinned in db.test.ts.

**Still-open owner action, no session needed:** copy both
`C:\Users\hrach\Offlog-signing\` (Android) and
`~/.tauri/offlog-updater.key` (desktop, generated 2026-07-23) somewhere
off this machine (USB stick, private cloud — anywhere). Both are
permanent identities — Android's key can never be re-issued once used
for a real Play Store submission, and the Tauri key is what every
future signed update depends on. Each currently exists on exactly one
disk.

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
