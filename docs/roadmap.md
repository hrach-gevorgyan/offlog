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

State as of 3 Oct 2026.

---

## Waiting on someone else

- **C3, Play Store listing.** Release signing is wired into CI
  (`release.yml` writes `keystore.properties` from repo secrets) and the
  privacy policy is [privacy.md](privacy.md). Waiting on Google's identity
  verification and review. Whether local-network sync draws extra review
  friction is an open question in decisions.md. Before submitting, the
  listing draft and screenshots (kept outside the repo, in the git-ignored
  `brand kit/`) need redoing for the redesigned phone app: they still show
  `main`'s layout and use retired names ("Kanban", "Time Travel" instead of
  Board and History).
- **C5, landing page.** One plain GitHub Pages page. Not blocking anything.

## Ours to do

- **Merge `redesign/full` into `main`.** The phone shell
  (`src/lib/phone/`) is built, along with the shared vocabulary and the
  desktop pieces that changed with it (`src/lib/desktop/`,
  `src/lib/shared/`); decisions are in [redesign/plan.md](redesign/plan.md).
  Merge when the owner signs off on the real build on a phone, then release
  per CLAUDE.md's Release steps.
