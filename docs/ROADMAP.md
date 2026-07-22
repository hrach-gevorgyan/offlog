# Offlog Roadmap

See [CHANGELOG.md](CHANGELOG.md) for the current version — the single
source of truth, not restated here since it drifts (this line used to
say v5.4.6 while the repo was actually on v5.6.x, caught 2026-07-22).
Everything below is a candidate, not a commitment. Before starting any
item, re-check it against the current code — this document describes
intent, not state.

**This file keeps only what's still open**: current status, next-release
candidates, and remaining work. Everything shipped, declined, or parked
lives in [archive/roadmap-archive.md](archive/roadmap-archive.md) (full
per-release detail in [CHANGELOG.md](CHANGELOG.md) /
[archive/changelog-archive.md](archive/changelog-archive.md)) — archive
into it roughly weekly, or whenever this file's still-open section starts
accumulating shipped items again, so it doesn't regrow into the mess it
was cleaned out of on 2026-07-20. For *why* a non-obvious choice was
made, see [DECISIONS.md](DECISIONS.md) (also the project's manifesto —
what Offlog is and why); for open, unresolved questions and ideas not yet
committed to, see [IDEAS.md](IDEAS.md); for how the app works today,
[TECH.md](TECH.md).

## Mission

Offlog is free, open-source, and local-first — no account, no telemetry, no
subscription, ever. It's a personal tool: built by one person for their own
use, and given away as-is for anyone else who wants the same thing. There is
no business model and none is planned (see [DECISIONS.md](DECISIONS.md)).
The goal on this roadmap is making it something a non-technical person can
actually find and install without knowing what "self-host CouchDB" means:
an official listing (Play Store), a public GitHub repo, a real license —
not growing it into a product. Offlog is not trying to out-feature Trello,
Notion, ClickUp, or Jira, or Obsidian — it isn't competing with them. Every
roadmap item should be judged against one question: does it make Offlog
nicer for its owner to use, or does it just make it bigger?

---

## Current status

- **Track E (PC app as sync host) — done.** Working end-to-end and
  shipped; see archive for E1/E2 detail.
- **Release gate (Track C core) — in progress.** C7 (credential cleanup)
  and C2 (zero-config first-run) are done; LICENSE/CONTRIBUTING.md/issue
  templates already exist (C1 was previously mis-tracked as "not
  started" — corrected 2026-07-21). Owner-confirmed sequencing
  2026-07-21: Android verification (A31) → final security/personal-info
  sweep → C10 (plain-language pass) → create the GitHub repo private →
  full check there → flip to public. **Progress: the security/personal-
  info sweep is done** (one finding — a personal LAN IP hardcoded in a
  `network_security_config.xml` comment — **fixed 2026-07-21**, comment
  now genericized; the older-git-history copy in
  `.claude/settings.local.json`'s pre-purge commits is left as-is,
  deliberately — a full history rewrite + force-push on a remote that
  already has tags and a Release is a real destructive operation, not
  worth it for a private, non-exploitable LAN address) **and the GitHub
  repo has been created
  (private), full commit history + all 78 version tags pushed, repo
  hygiene done (SECURITY.md, FUNDING.yml, default branch renamed
  master→main, Wiki/Projects disabled, Dependabot triaged — 16 of 17
  flagged advisories are `@capacitor/cli`'s build-only tooling, the 1
  real one is the already-known `pouchdb-find`/`uuid` advisory with no
  upstream fix), and a first GitHub Release (v5.7.0) published** with a
  Windows installer and a testing-signed Android APK (built via a
  one-off owner-authorized Gradle run — found and fixed a real bug in
  the process: an XML comment with a literal `--`, invalid per spec,
  broke a clean `assembleRelease`; harmless under Android Studio's
  incremental build, which is why it was never caught before). **C10
  done 2026-07-21** (see its own entry below). **2026-07-22: CI/release
  automation added** — `.github/workflows/ci.yml` runs type-check/build/
  tests on every push+PR; `release.yml` builds the Android APK and
  Windows Tauri installer automatically on a version tag push and drops
  both into a draft GitHub Release. **The real Play Store signing key
  was also generated** (stored outside the repo, never committed) and
  wired into `build.gradle` — the release build type now uses it
  whenever `keystore.properties` is present (CI writes this from repo
  secrets), falling back to the debug keystore otherwise so local
  Android Studio builds are unaffected. **v5.7.2 published as the first
  release built by this pipeline**, real-key-signed APK confirmed via
  `apksigner` to carry the real certificate fingerprint. Extensive live
  Android device testing happened in the same session (widget behavior,
  remote WebView debugging, mobile layout fixes) — **A31's Android leg
  can be considered substantially covered**, though not a single
  from-scratch fresh-install pass. Still remaining before the
  private→public flip: that fresh-install pass, and the owner's explicit
  go-ahead per CLAUDE.md. C5 (landing page) and C6 (branding pass) are
  explicitly deferred together — when picked back up, C6 gets full focus
  in that same step, not squeezed in alongside C1. C3 (Play Store
  submission itself — the signing key exists now, but a Play Console
  developer account and store listing assets are still needed) and E3
  (desktop auto-updater — needs its own separate free signing key via
  `cargo tauri signer generate`, not done yet) are still "later," after
  the public flip.
- **C10 (plain-language pass) — done 2026-07-21.** See its own entry below.
- **Docs restructuring — done 2026-07-20.** GOAL.md merged into
  DECISIONS.md as its opening manifesto; QUESTIONS.md merged into
  IDEAS.md; ROADMAP.md/CHANGELOG.md trimmed to current-only, history
  moved to `docs/archive/`; MAINTENANCE.md moved to `docs/` and stripped
  to instructions-only.
- **Plain-language pass on README/TECH.md — done 2026-07-20.** Fixed
  stale hardcoded version stamps, added honest "why this matters" framing
  to README's sync section (the packaging is the real innovation, not the
  individual technologies). CLAUDE.md left as-is — its density is
  hard-won invariants, not marketing copy.
- **Sync-architecture hardening (first pass) — done 2026-07-20.** Two
  additive, non-destructive fixes from IDEAS.md's sync-topology
  questions: (1) S1 — `offlog-desktop` now does a one-time LAN scan at
  startup and warns in Settings → Sync if another Offlog host is
  detected, instead of silently coexisting with zero signal; (2) S4 — a
  real bug fix, `discovery.ts`'s stale-host re-resolve used to silently
  give up forever when it saw a *different* host's uuid instead of the
  paired one; now surfaces an actionable "re-pair?" state instead.
  Neither touches the actual replication path (`db.ts`'s `sync()` call) —
  see DECISIONS.md for why a bigger rethink (a new sync protocol, a
  client/host election system) isn't the right call here.
- **S2 verified live + a real bug fixed — done 2026-07-20.** Paired a real
  `offlog-desktop` host against a realistic 180-doc dataset; replication
  itself is sound (zero data loss). Found and fixed a real gap:
  `clearLocalSeedBeforeFirstPair()` only protected a device with zero
  tasks, so a phone with real history still forked genuine conflicts on
  the 4 fixed default-seed ids against a host's own independently-seeded
  copies. `scanConflicts()` now auto-resolves those specific conflicts
  whenever one side is still provably the untouched default — see
  IDEAS.md's S2 entry (closed) for the full writeup.
- **S4 verified live — done 2026-07-20.** Simulated a real uninstall/
  reinstall (deleted the resource-dir binary bundle, kept `app_data_dir`);
  identity and data both survived byte-for-byte identical — a previously-
  paired phone needs zero re-pairing after a normal reinstall. See
  IDEAS.md's S4 entry (closed) for the full writeup.
- **S3/S5 documented — done 2026-07-20.** Both stated plainly in
  README.md's Sync section now (two-phones-no-PC, and moving-to-a-new-
  computer) instead of only being discoverable by hitting the wall.
- **S6 verified live — done 2026-07-20.** 3 origin-isolated real app
  instances, genuinely offline, all edited the same task differently,
  then reconnected together against one real host. Storage layer handled
  it correctly (zero data loss, deterministic winner, both losing
  revisions preserved). Confirmed a real but narrow, already-documented
  limitation: resolving a 3-way conflict via the normal flow silently
  discards the one losing edit that was never shown for review — not
  fixed (see DECISIONS.md's declined 3-way-merge entry for why), but now
  empirically confirmed rather than assumed. See IDEAS.md's S6 entry.
- **All of this session's sync-topology scenarios (S1-S6) are now either
  fixed, verified, or reduced to a documentation task** — see IDEAS.md
  for the full per-scenario record.
- **Next up:** the still-open verification/docs items above, then a
  final bug/cleanup sweep before the actual GitHub push.

---

## Track A — Performance & Stability (still open)

### A9. UI component tests — shipped 2026-07-21
Both previously-uncovered pieces extracted into pure, directly-testable
functions instead of requiring a full jsdom drag simulation or component
mount: `computeDropPosition()` (KanbanBoard's drag math, 5 tests) and
`runMaintenanceSteps()` (the Maintenance orchestration — actually lives in
SettingsPanel.svelte, not Sidebar as this item's name assumed; 3 tests).
See CHANGELOG.md's v5.7.0 row.

### A31. Full cross-platform visual/UX review — done 2026-07-22
Desktop/web done earlier. Android leg closed by the same real-device
round that verified the public v5.7.4 release: installed the actual
Release APK on real hardware, confirmed sync pairing/replication both
directions.

---

## Track B — Features (still open)

### B35. Focus view — shipped 2026-07-21
Add-task entry point: already covered by the existing global Quick Add
FAB, confirmed reachable from Focus like every other view — no new UI
needed. Dashboard/Focus link + "Daily Brief" summary card: new shared
`focusLock.ts` module (moved out of FocusView.svelte) lets Dashboard read
today's commitment lock too; a new card shows "N of M done" (or a prompt
to pick, if not started) and links straight to Focus. See CHANGELOG.md's
v5.7.0 row.

### B37. Android widget final polish — shipped, owner-verified 2026-07-21
Final visual sizing/spacing confirmed directly in Android Studio.

### B59. Hide the sidebar sync button when no host is paired — revised 2026-07-21
Native/Android only (desktop web's default sync URL is always
structurally real even before setup, so "no URL configured" isn't a
meaningful unpaired signal there). First shipped as a "Set up sync"
button replacing the sync icon; owner feedback same day: an unpaired
device has nothing to show there, so the footer should just stay a
compact 3 buttons (Time Travel / Recycle / Settings), no 4th slot at
all. Re-checked on every sync-state change so the footer's 4th slot
reappears the moment pairing succeeds.

The sync invite, and the once-ever post-first-run prompt it lives in
(`NamePrompt.svelte`), grew into a 3-step flow the same session:
1. **Device name** — "Skip" exits the *entire* flow (owner feedback:
   declining a name means "get me out," full stop — the later steps
   don't get offered either).
2. **Sync offer** (native + unpaired only) — explains sync in one
   sentence; "Set up sync" opens Settings straight into the Sync tab
   (`SettingsPanel.svelte`'s new `initialCategory` prop); "Skip" moves
   on to step 3 rather than exiting (2nd round of owner feedback:
   declining *sync specifically* isn't the same as declining
   everything — the preferences step is still worth offering). Escape/
   scrim-click mirror whichever decline behavior the current step's own
   button has, so they never do something more drastic than what's
   visibly offered.
3. **Quick preferences** (every platform) — theme (Light/Dark/System),
   week-starts-on, time format, and (if not already granted) a compact
   "Notifications" row (label + muted sublabel on the left, an "Enable"
   button on the right, matching the other rows' row layout — an
   earlier stacked/left-aligned version looked visually broken and was
   redone), all wired to the exact same getters/setters
   `SettingsPanel.svelte` uses so nothing's duplicated. Changes apply
   live, same as Settings; a single "Done" closes it.

### B60. Duplicate-name/content nudges — shipped 2026-07-20
Owner-reported after spotting a real duplicate "Draft" project. Non-
blocking hints (never a hard rule) for: duplicate project/space names
(Sidebar's "+ New project", SpaceManager's "+ New space", cross-space on
purpose), duplicate task titles within one project (Quick Add,
CardDetail), exact-duplicate checklist items (CardDetail), and fuzzy
similar-notes detection via a local word-overlap check, no network call
(CardDetail). Global Search now disambiguates same-named projects with a
space qualifier; Quick Add's project picker already grouped by space.
Also fixed a real, separate bug found while testing this: Escape on the
new-project/new-space inputs could still silently create an empty
project/space because Escape's cancel and the input's blur-triggered
auto-save could both fire independently.
**Not built, could be a follow-up**: Command Palette doesn't yet
disambiguate same-named projects the way Global Search now does — lower
priority since it's a smaller, less-often-flat-listed surface.

### B61. Require current PIN to change/remove App Lock — not built yet, next up
Owner-reported, 2026-07-21: changing or removing the App Lock PIN
currently doesn't ask for the *current* PIN first — anyone with the
device unlocked (which is the normal state while using the app) can
silently disable or replace App Lock. Should behave like changing a
password anywhere else: confirm the current PIN before allowing a
change or removal. Explicitly deferred by the owner, not part of the
current update — next real feature item once picked back up.

**Parked** (revisit post-release only if daily use demands it):
B28 (rethink "last column = done"), B33 (sub-projects) — both touch the
data model/UI broadly enough to need a real design conversation first;
see [archive/roadmap-archive.md](archive/roadmap-archive.md) for the
original reasoning.

---

## Track C — Public Release & Open Source (still open)

Goal: the mission above, made concrete. Unlike Track A/B, these aren't
paired into a version bump each — they're mostly one-time setup work.

### C1. Open-source the repository on GitHub — done, repo is public (flipped 2026-07-22)
`LICENSE` (MIT), `CONTRIBUTING.md`, and `.github/ISSUE_TEMPLATE/` +
`PULL_REQUEST_TEMPLATE.md` all already exist and are current — this
entry previously said "not yet started," which was stale; corrected
2026-07-21. C7 (credential cleanup, git-history purge) is done. Done
2026-07-21: the dedicated pre-push security/personal-info sweep (broader
than C7's credential-only scope — one low-severity finding, a personal
LAN IP in `network_security_config.xml`'s comment, fixed the same day;
the same IP also sits in older git history of
`.claude/settings.local.json`'s pre-purge commits, deliberately left
as-is — a full history rewrite is a real destructive operation on a
remote that now has tags and a Release, not worth it for a private,
non-exploitable address); C10 (plain-language pass, see its own entry);
the GitHub repo `hrach-gevorgyan/offlog` created **private** with `origin`
added and the full local history + all 78 version tags pushed (default
branch renamed `master`→`main`, old `master` deleted). Repo hygiene
done: `SECURITY.md` (private vulnerability reporting instead of a
public issue or personal email; also documents the known/accepted
Dependabot advisories), `FUNDING.yml` (GitHub Sponsors + Buy Me a
Coffee), Wiki/Projects disabled, stale root `assets/` folder (pre-v2.6
icon source, superseded by 3 later icon redesigns) removed. **First
GitHub Release published: v5.7.0**, with a Windows installer and a
testing-signed Android APK (explicitly labeled "not the official
release, sideload at your own risk" in the release notes — real Play
Store signing is C3, separately tracked). Building that APK required a
one-off owner-authorized Gradle run (normally assistant-prohibited, see
CLAUDE.md) and surfaced a real bug: `widget_offlog_preview.xml` had a
literal `--` inside an XML comment (invalid per spec) that silently
passed Android Studio's incremental build but hard-failed a clean
`assembleRelease` — fixed. **Flipped to public 2026-07-22**, after
owner verification: downloaded and installed both the v5.7.4 Windows
installer and Android APK from a real GitHub Release on real hardware,
confirmed sync pairs and replicates correctly in both directions.
Pre-flip sanity check (separate from C7's original purge) confirmed
clean: no `.env*` file ever committed in git history, no keystore/
credential files tracked, current `dist/` build free of leaked
secrets, and the `import.meta.env.DEV` gate from the v5.7.1 incident
still intact in source. A31 (Android verification) is now covered by
this same real-device round. Still open: both installers trigger OS
"unverified publisher" warnings (Windows SmartScreen, Android unknown-
sources) — expected until C3's real signing/Play Store publishing
lands, documented plainly in the README's new "Getting the apps"
section rather than left unexplained.

### C3. Play Store listing
**Real signing key generated 2026-07-22** (PKCS12, RSA 2048, 30-year
validity) — stored at `C:\Users\hrach\Offlog-signing\`, deliberately
outside the repo, not committed anywhere, not yet wired into
`build.gradle`'s release signingConfig (still the debug keystore for now,
per CLAUDE.md's release checklist — wiring the real key in is the next
step, done only when actually ready to submit, not before). Owner has the
password and backup instructions in that folder's README.txt. Still
needed: wiring the key into `build.gradle`, a Play Console developer
account ($25 one-time fee, separate from key generation), and store
listing assets — icon, screenshots, descriptions, and a privacy policy
page. Copy should frame Offlog as a calm personal tool, not pitch it
against Trello/Notion/ClickUp/Jira by feature count.

### C5. Public web landing page
A small, plain landing page (GitHub Pages is enough) linking to the web
app (browser-only, no install step) and the Android APK download.

### C6. Brand & positioning pass
A short pass over every public-facing document — README, store copy,
landing page copy — to make sure the "not competing, just likable" framing
from the Mission above comes through, written for humans discovering the
project.

### C10. Plain-language pass: every string, every document — done 2026-07-21
A survey (in-app strings + docs changed since the 2026-07-20 pass) found
3 real spots: README's "two phones, no PC" and "moving your PC" sections
used "sync host"/"identity"/"port·credentials·database identity" jargon
(reworded, raw folder path demoted to a parenthetical); Settings →
Advanced's "Self-hosted CouchDB connection" section renamed "Manual
server connection (advanced)" with a hint pointing back at normal
pairing instead of assuming self-hosting literacy; `pairWithHost`'s
"did not advertise a pairing port" error (shown raw on a pairing
failure) reworded to a plain "update the app" message. Everything else
surveyed (onboarding copy, `showError()` call sites project-wide, the
Sync tab's main flow) was already plain-language — no changes needed.
Stays open by nature going forward per its original framing (partial
sweeps already done at v4.19.0, v4.24.0) — pick up opportunistically as
new strings get added, this was the one-time pre-push catch-up pass.

---

## Track E — PC standalone app as sync host (still open)

### E3. Desktop auto-updater — scaffolded, blocked on C1
`tauri-plugin-updater`/`tauri-plugin-process` are registered and a "Check
for updates" control exists in Settings → Maintenance (desktop-only), but
`tauri.conf.json` deliberately has no `plugins.updater` block yet — needs
a real hosted update manifest (GitHub Releases, once C1 makes the repo
public) and a pubkey from the owner's own `cargo tauri signer generate`.
Revisit at C1 time.

---

## Business model — none, deliberately

Offlog has no business model and isn't getting one. Never paywalled, never
feature-gated, never ad-supported, never sells data. GitHub Sponsors / a
donation link is fine to add once public, but it's not a plan or a goal.
The Play Store listing stays free, no in-app purchase, ever. See
DECISIONS.md for the reasoning.

---

## Open questions and ideas

Anything genuinely unresolved — including the sync-topology scenarios
(multiple PC hosts, mobile-only-then-add-a-PC, mobile-to-mobile without a
PC) raised 2026-07-20 — lives in [IDEAS.md](IDEAS.md), not scattered
inline here.

---

## Sequencing

**Maintenance passes run every 3 releases** — tracked in
[MAINTENANCE.md](MAINTENANCE.md)'s current-pointer line, not restated
here. Track C runs independently of version numbers: **C7 and C2 are
done**; **C1/C3/C5/C6 fit naturally once the app feels "finished
enough."** Full shipped-release history lives in
[CHANGELOG.md](CHANGELOG.md) / [archive/changelog-archive.md](archive/changelog-archive.md);
full roadmap history (everything shipped/declined/parked) lives in
[archive/roadmap-archive.md](archive/roadmap-archive.md).

Within each release: land any Track A item first (or in the same PR as the
Track B item it protects/enables), then the Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land. Re-evaluate
this file after each release, and archive shipped items out of it roughly
weekly.
