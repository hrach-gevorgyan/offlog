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

Nothing. The five feature audits are done — sync conflict handling, the
trash/undo/retention lifecycle, attachments, recurrence, and what degrades
over weeks. What each found, and what each deliberately does not do, is in
[decisions.md](decisions.md).

An empty section is the correct state for this file, not an invitation to
refill it. The next entry should come from something that actually happened
in use.
