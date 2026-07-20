# Offlog Roadmap

Current version: **v5.4.6**. Everything below is a candidate, not a
commitment. Before starting any item, re-check it against the current
code — this document describes intent, not state.

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
  and C2 (zero-config first-run) are done. Still open, in dependency
  order: **C1 (GitHub) → C5 (landing page) → C3 (Play Store)**, with C6
  (branding pass) alongside the public-facing assets.
- **Plain-language pass — ongoing by design.** C10 stays open
  indefinitely (pick up opportunistically, not a one-time sweep).
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

### A9. UI component tests — still growing
`KanbanBoard`'s drag/drop position math (hard to simulate reliably in
jsdom) and `Sidebar`'s Maintenance step orchestration remain uncovered.
Not scheduled to a specific version.

### A31. Full cross-platform visual/UX review — Android leg still open
Desktop/web done. Android is entirely unverified — needs an owner Studio
check, per CLAUDE.md's Android-build rule (the assistant never runs
Gradle).

---

## Track B — Features (still open)

### B35. Focus view — still a draft
Add-task entry point within Focus, a Dashboard/Focus link, and a "Daily
Brief" summary card — none scoped in detail yet.

### B37. Android widget final polish — open, owner-driven
Final visual sizing/spacing — pick up whenever convenient directly in
Android Studio.

### B59. Hide/replace the sidebar sync button when no host is paired — new (2026-07-20)
Owner-flagged: `Sidebar.svelte`'s sync icon button renders unconditionally
regardless of pairing state, even for a mobile-only user who has never
paired a PC host and structurally cannot sync yet (see IDEAS.md's sync-
topology questions for the broader context this came out of). Low-risk,
self-contained UX fix: either hide the button until a host is paired, or
swap it for a "Set up sync" CTA when unpaired. Not yet implemented.

**Parked** (revisit post-release only if daily use demands it):
B28 (rethink "last column = done"), B33 (sub-projects) — both touch the
data model/UI broadly enough to need a real design conversation first;
see [archive/roadmap-archive.md](archive/roadmap-archive.md) for the
original reasoning.

---

## Track C — Public Release & Open Source (still open)

Goal: the mission above, made concrete. Unlike Track A/B, these aren't
paired into a version bump each — they're mostly one-time setup work.

### C1. Open-source the repository on GitHub — unblocked, not yet started
Push the existing local repo public: pick a license (leaning MIT), add
`LICENSE`, a `CONTRIBUTING.md`, issue templates, and a README written for
someone who has never seen this project before. Audit for anything that
assumes a local-only environment before it goes public. C7 (credential
cleanup) is done — this can start whenever the owner wants; still worth a
final security-audit pass first, see DECISIONS.md.

### C3. Play Store listing
A signed release build (**proper keystore — the current `release` build
type is signed with AGP's public debug keystore, see CLAUDE.md's release
checklist, must be replaced before this ships**), a Play Console developer
account, and store listing assets — icon, screenshots, descriptions, and a
privacy policy page. Copy should frame Offlog as a calm personal tool, not
pitch it against Trello/Notion/ClickUp/Jira by feature count.

### C5. Public web landing page
A small, plain landing page (GitHub Pages is enough) linking to the web
app (browser-only, no install step) and the Android APK download.

### C6. Brand & positioning pass
A short pass over every public-facing document — README, store copy,
landing page copy — to make sure the "not competing, just likable" framing
from the Mission above comes through, written for humans discovering the
project.

### C10. Plain-language pass: every string, every document — open by design
Go through every in-app string and every user-facing document and rewrite
anything a non-technical person would stumble on. Partial sweeps already
done (v4.19.0, v4.24.0 — see archive for detail). Stays open by nature —
pick up opportunistically as new strings get added, not a one-time sweep
to close out. The upcoming README/CLAUDE.md/TECH.md optimization pass
(see "Current status" above) is the next big chunk of this.

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
