# Offlog — Roadmap

**Open, needed and doable. Nothing else.**

The finite plan this app was built to is complete, so there are only two
kinds of open work left: what is ours to do, and what is waiting on
someone else. Those are the two sections below. There is no "later"
bucket — a maybe is not work, and keeping one here only grows the file.

Everything closed lives elsewhere, and is not repeated here:

| what | where |
|---|---|
| Why a choice was made, reversed, or refused | [decisions.md](decisions.md) |
| What happened, and old item ids (B39, C4…) | [archive/history.md](archive/history.md) |
| What shipped | [changelog.md](changelog.md) |
| When the next maintenance pass is due | [maintenance.md](maintenance.md) |

**This file is meant to shrink.** An entry that stops being actionable
moves out on the next maintenance pass — closed to decisions.md, parked to
archive/history.md. If nothing is left, the right state is an empty
section, not a backlog of ideas.

---

## Waiting on someone else

Nothing here is blocked on us.

- **C3, Play Store listing.** Signing key wired into CI, privacy policy
  done, listing assets ready. Waiting on Google's identity verification
  and review. One thing to answer before assuming a smooth listing: do the
  app's local-network sync calls attract extra review friction — Android's
  local-network permission prompts, or general policy scrutiny?
- **C5, landing page.** One plain GitHub Pages page. Not blocking anything.

## Ours to do

### Feature audits — usability, not test coverage

Every function in the app works, in the sense that it does not throw. That
is not the question. These audits ask whether each feature is worth having
in the shape it currently has, run the way a person actually uses it
rather than the way a test drives it. Each asks the same four things:

- **Real use** — walk the feature from a full workspace, not an empty
  database. Does the flow make sense end to end?
- **Edge cases a person hits** — not synthetic ones. The states real usage
  produces: two devices, a week away from the app, a deleted thing that
  something else still points at.
- **Is it earning its place** — a feature nobody reaches for is a
  liability. Removing one is a valid outcome, recorded in decisions.md.
- **Upgrade or leave alone** — if it is used but awkward, say precisely
  what would make it better, or record that it is fine as it is.

The precedent is the maintenance tool (24th pass): the Phase 1 checklist
found nothing there, and walking the feature as a user found three data
bugs, one of which silently discarded an edit. The checklist does not
substitute for this.

Ordered by what a wrong answer costs, not by effort. Three are done — sync
conflict handling, the trash/undo/retention lifecycle, and attachments.
Their outcomes, including what each deliberately does not do, are in
[decisions.md](decisions.md).

1. **Recurrence.** The code handles month-end and reminder shifting
   carefully; that is not the concern. The concern is whether the model
   matches what people mean: one doc that resets rather than a new card
   each time, "every N" combined with weekdays-only, and what a completed
   recurring task looks like in history. Is the interval control worth its
   complexity, or does daily use only ever want daily/weekly/monthly?

2. **What degrades over weeks.** The class that caught auto-backup
   silently stopping — nothing here breaks on a fresh install. Current
   suspects: the change-feed catch-up added in v6.7.0 and its 500-change
   fallback, sync retry across days rather than minutes, log growth
   against the 6-month prune, and reminder rescheduling after long uptime
   or a reboot.

Not on this list, deliberately: `focusLock.ts` is the only module with no
tests at all, but it is 25 defensive lines whose callers already filter
deleted and archived tasks. Coverage is not the ranking.
