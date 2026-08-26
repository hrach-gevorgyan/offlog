# Offlog — Roadmap

**This file holds only work that is both needed and doable** — things
actually going to happen. A settled "no", a reversed choice, or the
reasoning behind any of it lives in [decisions.md](decisions.md), not
here. Maintenance cadence lives in [maintenance.md](maintenance.md).

Current version: [changelog.md](changelog.md). Shipped, declined and
parked history: [archive/history.md](archive/history.md).

Organised as **Now / Next / Later**. Nothing here is dated, and nothing in
Later is a promise.

Offlog has been in daily use since 2026-08-01, and the finite plan it was
built to is complete — see decisions.md's "The roadmap is finite". What is
in Next below is a deliberate new direction chosen from real use, not a
backlog that was never finished.

---

## Now — waiting on someone else, not on us

- **C3, Play Store listing.** Signing key wired into CI, privacy policy
  done, listing assets ready. Waiting on Google's identity verification and
  review. Worth checking before assuming a smooth listing: does local
  network sync attract extra review friction? See decisions.md.
- **C5, landing page.** One plain GitHub Pages page. On hold, not blocking
  anything.

## Next — nothing planned

Mesh sync was the one planned direction and it is now closed: a design pass
measured it against real Android behaviour and found phone-to-phone sync
impossible on every available route. The reasoning is in decisions.md's
mesh entry.

Bugs found in daily use drive change. Features aren't planned
in advance and aren't refused either: the bar is "does daily use actually
demand this", usually answered by living with the app rather than
imagining it.

## Also open

- **Play Store policy check for local-network sync.** Do the app's local
  network calls attract review friction — Android's local-network
  permission prompts, or general policy scrutiny? Research before assuming
  a smooth C3 listing.
- **Real-scale metrics and benchmarks.** Whether one person's task manager
  accumulates enough data for scale to matter is still unanswered, and
  cannot be answered yet — there is no database with real volume in it. The
  measuring tool exists (`offlog-desktop/scripts/db-metrics/`) and reports
  counts, size percentiles, attachment bytes and revision depth from any
  host.

  Existing coverage is already ahead of real use: `perfGuard.test.ts`
  exercises 400 tasks across 8 projects and asserts round-trip counts rather
  than timings, so it catches the regressions that matter at a size daily
  use has not reached. Re-measure and revisit only when one of these is
  true, not on a schedule:
  - more than 400 active tasks, so perfGuard stops representing reality
  - more than ~5,000 `log:` docs surviving the 6-month prune
  - attachments past a few tens of MB, where sync time starts to show

## Feature audits — usability, not test coverage

Every function in the app works in the sense that it does not throw. That
is not the question. These are audits of whether each feature is worth
having in the shape it currently has, run the way a person actually uses
it rather than the way a test drives it. Each asks the same four things:

- **Real use** — walk the feature as someone with a full workspace would,
  not from an empty database. Does the flow make sense end to end?
- **Edge cases a person hits** — not synthetic ones. The states real usage
  produces: two devices, a week away from the app, a deleted thing that
  something else still points at.
- **Is it earning its place** — a feature nobody reaches for is a
  liability. Removing one is a valid outcome and belongs in decisions.md.
- **Upgrade or leave alone** — if it is used but awkward, say precisely
  what would make it better, or record that it is fine as it is.

The precedent is the maintenance-tool audit (24th pass): the checklist
sweep found nothing there, and walking the feature as a user found three
data bugs, one of which silently discarded an edit. Cycle 1 does not
substitute for this.

Ordered by what a wrong answer costs, not by effort.

1. **Sync conflict handling.** The highest-stakes decision in the app: it
   picks which of two real edits survives. Does a person ever understand
   what the Resolve-conflicts screen is showing them, and can they tell
   the two versions apart well enough to choose? What does
   `autoResolvePristineDefaultConflicts()` settle without asking, and is
   every one of those cases genuinely safe to settle silently? Newly
   relevant: `checkIntegrity()` now defers every conflict here rather than
   resolving any itself, so this screen is the only route.

2. **Trash, undo and retention as one lifecycle.** Delete, restore, delete
   forever, empty trash, and the automatic 3-month prune are one story to
   a user and four separate functions in code. Does undo reach far enough
   to be trusted? What happens restoring a task whose project is gone?
   Does anyone understand that trash empties itself after three months --
   and should it? The prune is already known to strand inbound links.

3. **Attachments.** Whether the feature is pleasant at all: adding,
   viewing, replacing, removing, and what a 10MB cap feels like when you
   hit it. Whether attachments make sync or backup slow enough to notice,
   and whether the storage figures shown in Settings mean anything to a
   person. Least-covered surface of the four, and the backup path has had
   a real bug here before.

4. **Recurrence.** The code handles month-end and reminder shifting
   carefully; that is not the concern. The concern is whether the model
   matches what people mean: one doc that resets rather than a new card
   each time, "every N" combined with weekdays-only, and what a completed
   recurring task looks like in history. Is the interval control worth its
   complexity, or does daily use only ever want daily/weekly/monthly?

5. **What degrades over weeks.** The class that caught auto-backup
   silently stopping -- nothing here breaks on a fresh install. Current
   suspects: the change-feed catch-up added in v6.7.0 and its 500-change
   fallback, sync retry behaviour across days rather than minutes, log
   growth against the 6-month prune, and reminder rescheduling after long
   uptime or a device reboot.

Not on this list, deliberately: `focusLock.ts` is the only module with no
tests at all, but it is 25 defensive lines whose callers already filter
deleted and archived tasks. Coverage is not the ranking.

---

## Later — direction, not promises

Deprioritised, not declined. Only if daily use ever demands them:

- **Snooze** — one-tap defer to tomorrow or next week, extending the
  existing notification "Snooze 1h" to the task itself.
- **Import converters** — one-way Trello/ClickUp/Jira export conversion,
  not a live connection.
- **Voice input for Quick Add** — platform speech-to-text into the existing
  parser, Android first.
