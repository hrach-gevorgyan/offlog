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
  cost, 2026-07-23; identity verification pending as of 2026-07-28**)
  and Google's review process — calendar time is mostly waiting on
  Google, not working. **Privacy policy done** —
  [docs/PRIVACY.md](PRIVACY.md), 2026-07-28 (resolves IDEAS.md's old
  Q3, see DECISIONS.md); use the GitHub-rendered page as the Play
  Console URL until C5's landing page exists. **Listing copy/assets
  prepped and Play-ready** — `brand kit/Kit/play-store-listing.md`
  (not tracked in git, local-only per `.gitignore`) has the short/full
  description draft; icon, feature graphic (re-exported to exactly
  1024×500, 24-bit, 2026-07-28), and mobile screenshots
  (`Mobile - Screenshots/play-ready/`, padded to a safe ≈2:1 ratio
  without cropping content, 2026-07-28) all meet Play Console's size/
  format requirements.
- **C5 — Landing page.** A single plain GitHub Pages page using
  BRAND.md's tagline/copy, linking the Play Store listing (once live)
  and GitHub Releases. Deliberately after or alongside C3 so it has
  something better than an APK to link to. (~1 session.) **On hold,
  owner has no energy for it right now (2026-07-29)** — not blocking
  anything else, pick up whenever.

GitHub secret scanning, push protection, and dependency review are
**already enabled** (owner confirmed 2026-07-29 — done, not tracked
here anymore). Beyond this, security improvement is B61 (milestone 1) and
the standing MAINTENANCE.md checklist — sync-transport encryption
(TLS on the LAN link) was considered and stays out: the manifesto's
stance is that home-Wi-Fi sync is private by scope, and self-signed
cert trust on Android would break the zero-config pairing promise for
marginal gain on a home network. Revisit only if a real user reports a
real hostile-LAN use case.

**C3b — Windows code signing via SignPath, decoupled from Milestone 2
(owner clarification, 2026-07-29).** Not required for "Installable by
normal humans" or for Done — Android (C3) is the real distribution
path for normal humans; the Windows SmartScreen warning is a nice-to-
remove, not a blocker. **Free-program-only, permanently** — the whole
point of SignPath over a paid cert was avoiding a recurring fee (see
DECISIONS.md); if SignPath isn't free for this project, this stays
undone rather than ever paying for a certificate. **Applied
2026-07-28, declined 2026-07-29** for insufficient public-visibility
signals, reapplication explicitly welcomed later — see DECISIONS.md.
Pick up again whenever it's free to (public repo + some organic
traction), no schedule, not gating anything else.

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

## Future versions (the rules after Done, restructured 2026-07-28)

**Owner decision, 2026-07-28:** replace the open-ended "pull one only
when it annoys me" maintenance-mode rule with two explicit, parallel
release tracks, so post-Done work has a real shape instead of living as
an unscheduled backlog. This does **not** reopen the finite-plan
mission or the "no growth for growth's sake" bar (a feature still has
to earn its slot — see each item's own reasoning below) — it just gives
the vetted backlog a version number instead of a vague "someday."

### Feature track — one backlog item per minor version

Each `v6.X.0` ships exactly one item below, in this order (still the
owner-vetted priority ranking from 2026-07-22 — reorder only with an
explicit owner decision, don't re-litigate the ranking casually).
Calendar timing stays loose (no monthly quota) — a slot ships when the
owner is ready to build it, not on a schedule.

- **v6.1.0 — "Not today" snooze.** One tap on any task: defer to
  tomorrow / next week without opening the editor. Snooze exists today
  only as the notification action's "Snooze 1h" — this extends the idea
  to the task itself, guilt-free. Small.
- **v6.2.0 — Calendar sync (.ics feed).** Renamed from "export"
  (owner clarification, 2026-07-29) — dated tasks as a local .ics feed
  the OS calendar subscribes to and refreshes on its own schedule, not
  a one-shot file the user re-exports by hand. Deadlines next to real
  appointments, no cloud. Small-medium.
- **v6.3.0 — Checklist templates.** Reusable checklists (packing list,
  grocery run) — save any task's checklist as a named template, insert
  into any task. Same mechanism as the existing project templates, one
  level down. Small.
- **v6.4.0 — Import converters (very popular tools only).** One-way
  import from Trello / ClickUp / Jira export files into Offlog's model.
  The owner's accepted flavor of "integration" — a one-time file
  conversion, not a live connection, so it doesn't violate the
  no-integrations stance in DECISIONS.md's manifesto. Medium (per-tool
  mapping work, Trello's JSON export first — it's the most
  kanban-shaped).
- **v6.5.0 — Voice input for Quick Add.** Dictate a task instead of
  typing — platform speech-to-text (Android's built-in recognizer / Web
  Speech API where available) feeding the existing NLP regex parser, no
  cloud service of our own. Medium; Android-first.
- **v6.6.0 — Distraction-minimal interface pass — DONE (owner call,
  2026-07-29), satisfied by the 5.9.0 Sidebar + CardDetail redesign.**
  CardDetail's optional fields (Repeat/Reminder, Checklist, Custom
  Fields, Related, Notes) consolidated under one manually-opened
  "Extras" panel instead of always-visible blocks; Recent quick-resume
  section and per-space project-count badge removed; active-state
  highlighting unified/toned down across nav/space/project rows.
- **v6.7.0 — Task linking — DONE 2026-07-28** (pulled forward ahead of
  v6.0.0 at owner request). Related-only, non-directional links (no
  blocks/blocked-by dependency semantics — scoped down from the
  original idea after the required design conversation; full reasoning
  in DECISIONS.md). `TaskDoc.related?: string[]`, forward-only storage
  with the reverse direction computed at read time
  (`db.ts`'s `getRelatedTasks()`), immediate-write
  `linkRelatedTask()`/`unlinkRelatedTask()`, `CardDetail.svelte`'s new
  "Related" section with search-to-link. 7 new `tests/db.test.ts`
  cases. Verified live, not just via tests. **Follow-up same day**: the
  first cut (list-only, no click-through) tested as not actually useful
  — added navigate-on-click from the Related list and a link-icon badge
  on Kanban cards/List rows so a task's links are visible without
  opening it speculatively.
- **v6.8.0 — File attachments (with size optimization) — DONE
  2026-07-29, on `feature/file-attachments` pending owner review before
  merge.** Single database, not two — considered and deliberately
  rejected a separate `offlog_attachments` db (would have solved
  auto-backup duplication more thoroughly but added a second
  independent sync channel/lifecycle; see DECISIONS.md). Bytes live in
  PouchDB's own `_attachments` map on the task doc (`TaskDoc.attachments`
  is just the small loggable/diffable metadata --filename/content_type/
  size/added_at-- keyed by `att:<id>`, not filename), so it rides the
  existing sync/replication with zero new sync code and dedupes
  unchanged content by digest automatically. Formats: jpg/png/webp/svg/
  pdf/txt/csv/json/yaml/xml/md/docx/xlsx, 10MB/file cap, HEIC/HEIF
  explicitly rejected (v1 scope). Images are downscaled to ~1600px
  longest side and re-encoded to JPEG client-side before upload
  (`CardDetail.svelte`'s `downscaleImage()`) -- the one thing that
  actually shrinks a modern phone photo; a generic zip/compress pass
  was considered and rejected for every other format since jpg/webp/pdf/
  docx/xlsx are already internally compressed (compressing compressed
  data does ~nothing). B62's auto-backup needed no change: its existing
  `db.allDocs({include_docs:true})` call (no `attachments:true`) already
  excludes attachment bytes, so the 7-day rotation doesn't duplicate
  them -- attachments' real safety net is sync to a second device, same
  as everything else in this app. New `attachments.ts` (format
  allowlist/size cap/mime map, shared by db.ts and CardDetail.svelte),
  `db.ts`'s `addAttachment()`/`deleteAttachment()`/`getAttachmentBlob()`
  (reuse `updateTask()`'s existing per-doc write-queue via a new shared
  `queueTaskWrite()`, so concurrent attach calls on the same task can't
  race into a write conflict), CardDetail's new "Attachments" Extras
  block, Settings' storage breakdown gained an attachment count/size
  line. 8 new `tests/db.test.ts` cases. Verified live (add/thumbnail/
  delete, both text and image paths).
- **v6.9.0 — Recurrence robustness pass — DONE 2026-07-29.** Real bug
  found and fixed: `db.ts`'s `advanceDate()` used plain
  `d.setMonth(d.getMonth()+1)` for monthly recurrence, which overflows
  into the month after next when the day doesn't exist there (Jan 31 +
  1 month rolled to Mar 3, skipping February's occurrence entirely) —
  now clamps to the target month's real last day. DST: reminder
  shifting already worked correctly (shifts by the same wall-clock
  delta the due date moved, so local time-of-day is preserved across a
  spring-forward/fall-back boundary) — confirmed, not changed. Offline
  gaps: recurrence only ever advances once per explicit completion,
  never a wall-clock catch-up loop, so a task left uncompleted for
  months just shows very overdue and advances once on completion, same
  as any late completion — confirmed, not changed. 8 new
  `tests/db.test.ts` cases (month-end clamping across leap/non-leap/
  year-end, DST invariant, long-offline-gap single-advance).
- **v6.10.0 — Unified search — DONE 2026-07-29.** Title/tags/body
  ("Notes") were already searched — added checklist item text
  (`db.ts`'s `taskSearchMatch()`/`TaskSearchMatch`). `searchAllTasks()`
  now also returns `matchedIn` so `GlobalSearch.svelte` can show *why*
  a result surfaced when the title itself doesn't contain the query
  ("Matched in Notes" / "Matched in Checklist" — tags already got
  their own visible row). 6 new `tests/db.test.ts` cases. Verified
  live. (The "connected tools" half of the original idea stayed out of
  scope — no live connections, per the manifesto; imported data becomes
  normal Offlog data and is searched like everything else.)
- **v6.11.0 — Tag color picker — DONE 2026-07-29.** Added 2026-07-28
  from the `redesign/v6` branch's Kanban work (deterministic hash-to-
  palette color so the same tag always looks the same); this shipped
  the manual override. New `tag:<name>` doc (`TagColorDoc` in
  `types.ts`) holding just `{ color }`, `db.ts`'s `getTagColorOverrides()`/
  `setTagColor()`, falling back to `tagColors.ts`'s shared hash when no
  override exists. Rename/delete (`renameTag`/`deleteTagEverywhere`)
  carry or clean up the override doc accordingly. Picker UI is a color-
  dot + swatch row in `TagManager.svelte` (Settings -> Organize -> Manage
  Tags); `KanbanBoard.svelte`'s card tag chips read the same override
  map, live-reloaded on any db change. 4 new `tests/db.test.ts` cases.
  Verified live, not just via tests.

Curated with the owner from a larger brainstorm; everything declined
(stale-task triage, daily shutdown ritual, weekly review — "so much
statistics from every app, now this one?? no") is deliberately not
listed here, don't re-propose those. A genuinely new idea that comes up
later either slots in at the end (v6.11.0 onward) after owner vetting,
or goes to [IDEAS.md](IDEAS.md) unvetted.

**Parked permanently, not on the version list:** B28 (rethink
positional "done"), B33 (sub-projects) — see archive for reasoning.
These do not block any feature-track version.

### Bugfix / audit track — patch versions, independent of the feature track

Runs in parallel on its own trigger, never bundled into a feature
version's scope:

- **`v6.X.1`, `.2`, ... (patch bump):** a real bug the owner hits in
  daily use, or a reproducible issue a real user files. No proactive
  feature work rides along in the same release.
- **Quarterly maintenance pass** (replacing the old every-3-releases
  cadence, since releases were expected to slow down): same process as
  [MAINTENANCE.md](MAINTENANCE.md) — dependency audit, warning/lint
  sweep, doc-drift check. Ships as its own patch version even with zero
  user-visible change (RELEASE_NOTES.md's "No visible changes" entry
  covers this case).
- **Dependabot:** batch PRs roughly **monthly**, folded into whichever
  patch version is next — not a release trigger on its own. A security
  advisory with a real fix available is the one interrupt-driven
  exception (ships immediately as its own patch, doesn't wait for the
  monthly batch).

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
