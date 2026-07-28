# Offlog — Open Questions & Ideas

Genuinely unresolved questions and un-committed ideas, meant to be
shareable as-is with another AI or a human for outside input — each one
states the situation, what's already been decided around it, and what's
actually being asked. Not a task list (see [ROADMAP.md](ROADMAP.md) for
that), and not a decisions log (see [DECISIONS.md](DECISIONS.md) for
things already settled) — these are things nobody has a confident answer
to yet. Replaces the old QUESTIONS.md (merged in 2026-07-20).

If you're an AI or a person reading this cold: Offlog is a free,
open-source, local-first personal task manager (Svelte + PouchDB +
Capacitor). No accounts, no telemetry, ever. Full context in
[DECISIONS.md](DECISIONS.md)'s manifesto and [TECH.md](TECH.md) if you
need it — but each question below should be answerable from the question
itself.

---

## Sync topology (raised 2026-07-20, owner's "big idea" scenario review)

Context: today's model is one fixed host (whichever PC runs
`offlog-desktop`), phones as clients. Full verification narrative for
all of these lives in `docs/archive/` git history if ever needed again —
just the current status here:

- **S1. Two PC hosts on one LAN** — still open. Detection-only warning
  shipped (`discovery.rs`'s `browse_for_others()` + Settings → Sync
  warning); no "join as client" mode built, same tradeoff mesh sync's
  decline already weighed. Revisit only on real demand.
- **S2. Mobile-only for weeks, then a PC pairs later** — closed, verified
  live with a realistic heavily-edited dataset, zero data loss. Found and
  fixed a real bug in the same pass: `scanConflicts()` now auto-resolves
  conflicts on the 4 fixed default-seed ids when one side is provably
  still pristine, instead of leaving a coin-flip winner.
- **S3. Two phones, no PC** — closed, intentional (mesh sync declined).
  Export/Import is the answer; documented in README's Sync section.
- **S4. Host machine wiped/replaced** — closed, verified live: identity +
  data both live under `app_data_dir`, survive a full uninstall/reinstall
  byte-for-byte, no re-pairing needed. Also fixed: a phone whose paired
  host genuinely vanished used to silently time out forever — now shows
  an actionable "re-pair?" badge (`discovery.ts`'s `reresolveHost()`).
- **S5. Intentional host migration (new PC)** — closed, same answer as
  S4 (copy `app_data_dir`, no wizard needed). Documented in README.
- **S6. Host offline while 3+ phones diverge** — closed, verified live:
  the sync protocol correctly tracks all branches, zero data loss. One
  real, still-current limitation confirmed (not a new bug): a genuine
  3-way conflict only surfaces the first losing revision for review, but
  resolving discards all losing revisions — the other device's edit is
  silently lost too. Not worth a smarter N-way UI for how rare this is
  (see DECISIONS.md's 3-way-merge entry); if it ever becomes a real
  complaint, extend `getConflicts()` to list every losing revision.

---

## Distribution

### Q2. Play Store policy risk for a task-manager app with local network requests
The app makes local network calls (sync to a LAN address).
**Does this trigger any Play Store review friction** (Android's
`CHANGE_NETWORK_STATE`/local network permission prompts introduced in
recent Android versions, or general policy scrutiny of apps that make
local-network calls) that should be researched before assuming a smooth
listing process?

---

## Scale

### Q4. Is large-dataset validation (A10) actually a realistic risk?
A10 already shipped a validation pass (see archive/roadmap-archive.md),
but the owner remains skeptical a single-person task manager will ever
accumulate enough data for it to matter again. **Is there real-world data
(from comparable local-first personal tools) on how large a single user's
task/log dataset actually gets over multiple years** — informing whether
this deserves any further priority, or is safe to consider closed?

---

## Post-Done feature backlog — moved to ROADMAP.md (2026-07-28)

The owner-vetted maintenance-mode shortlist (snooze, .ics export,
checklist templates, import converters, voice input, distraction-
minimal pass, task linking, attachments, recurrence robustness, unified
search) is committed backlog, not an open question — it now lives in
[ROADMAP.md](ROADMAP.md)'s "Future versions" section (mapped to
`v6.1.0`-`v6.10.0`, 2026-07-28) instead of here.

Each question above is meant to be copy-pasted on its own to another AI,
a forum, or a person whose judgment is trusted, without needing this whole
repo as context. If an answer emerges, record the resolution in
[DECISIONS.md](DECISIONS.md) (if it settles something permanently) or
update the relevant [ROADMAP.md](ROADMAP.md) section directly (e.g. S1-S6
resolving into a real Track E item), and remove or mark the question here
as resolved — don't let answered questions linger alongside genuinely open
ones.
