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

### Q3. Privacy policy content when there is genuinely nothing to disclose
Store listings require a privacy policy page even for an app that collects
zero telemetry. **What's the right, honest content for that page** that
doesn't either (a) read as suspiciously sparse to a reviewer, or (b)
accidentally imply more data handling than actually happens (e.g. because
of boilerplate legal language that doesn't fit a truly local-only app)?

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

## Post-Done feature candidates (owner-curated brainstorm, 2026-07-22)

Per ROADMAP.md's final plan these are **not** milestone work — they're
the pre-vetted shortlist for maintenance mode, so when daily use demands
something it's already been thought through. Curated together with the
owner from a larger brainstorm; everything the owner declined (stale-task
triage, daily shutdown ritual, weekly review — "so much statistics from
every app, now this one?? no") is deliberately not listed, don't
re-propose those.

**Owner-accepted, roughly by expected value:**

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

**iOS reality check (owner asked, 2026-07-22):** a native iOS build
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

Each question above is meant to be copy-pasted on its own to another AI,
a forum, or a person whose judgment is trusted, without needing this whole
repo as context. If an answer emerges, record the resolution in
[DECISIONS.md](DECISIONS.md) (if it settles something permanently) or
update the relevant [ROADMAP.md](ROADMAP.md) section directly (e.g. S1-S6
resolving into a real Track E item), and remove or mark the question here
as resolved — don't let answered questions linger alongside genuinely open
ones.
