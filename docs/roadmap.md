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

State as of 4 Oct 2026.

---

## Waiting on someone else

- **C3, Play Store listing.** Release signing is wired into CI
  (`release.yml` writes `keystore.properties` from the `release`
  environment's secrets) and the
  privacy policy is [privacy.md](privacy.md). Waiting on Google's identity
  verification and review. Whether local-network sync draws extra review
  friction is an open question in decisions.md. Before submitting, the
  listing draft and its screenshots (kept outside the repo, in the
  git-ignored `brand kit/`) were redone on 3 Oct 2026 for the redesigned
  phone app, with a `play-ready/` set at the 2:1 ratio Play requires.

## Ours to do

- **Windows without the SmartScreen warning, at no cost.** decisions.md
  rules out a paid certificate and SignPath declined us, so the search is
  for a free way to distribute instead. Two routes to evaluate, smallest
  first; check each one's current terms before starting:
  1. **winget** (`winget install Offlog`). An installer winget downloads
     doesn't carry the browser's download mark, so SmartScreen doesn't
     step in, and unsigned installers are accepted. Each release is a pull
     request to `microsoft/winget-pkgs`, which `release.yml` could open
     with `wingetcreate`. The website download stays as it is.
  2. **Microsoft Store, as MSIX.** The Store signs the package itself, and
     registration is free for individual developers. Needs an MSIX build
     (tauri-bundler doesn't make one), the self-updater off in that build
     since the Store updates it, and a check that the bundled NyxDB server
     and network discovery work inside an MSIX package.
