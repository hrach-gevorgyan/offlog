# Offlog — Roadmap

**Open, needed and doable. Nothing else.**

There are only two kinds of open work: what is ours to do, and what is waiting on someone
else. Those are the two sections below. There is no "later" bucket — a maybe
is not work, and keeping one here only grows the file.

Everything closed lives elsewhere, and is not repeated here:

| what | where |
|---|---|
| Why a choice was made, reversed, or refused | [decisions.md](decisions.md) |
| What happened, and old item ids (B39, C4…) | [archive/history.md](archive/history.md) |
| What shipped | [changelog.md](changelog.md) |
| When the next maintenance pass is due | [maintenance.md](maintenance.md) |

**This file is meant to shrink.** An entry that stops being actionable moves
out — closed to decisions.md, parked to archive/history.md. A section with
nothing in it stays that way until real use puts something there.

---

## Waiting on someone else

- **C3, Play Store listing.** Signing key wired into CI, privacy policy
  done, listing assets ready. Waiting on Google's identity verification and
  review. Whether local-network sync draws extra review friction is an open
  question in decisions.md. The phone listing screenshots show `main`'s
  phone layout and need recapturing once the phone redesign merges.
- **C5, landing page.** One plain GitHub Pages page. Not blocking anything.

## Ours to do

- **Phone redesign (`redesign/full`).** Phone-only shell in
  `src/lib/phone/`; decisions and remaining items in
  [redesign/plan.md](redesign/plan.md). Merge to `main` when the owner signs
  off on the real build.
