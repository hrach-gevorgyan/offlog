# Offlog Roadmap

**This file holds only work that is both needed and doable** — things
actually going to happen. A settled "no", a reversed choice, or the
reasoning behind any of it lives in [DECISIONS.md](DECISIONS.md), not
here. Maintenance cadence lives in [MAINTENANCE.md](MAINTENANCE.md).

Current version: [CHANGELOG.md](CHANGELOG.md). Shipped, declined and
parked history: [archive/history.md](archive/history.md).

Organised as **Now / Next / Later**. Nothing here is dated, and nothing in
Later is a promise.

Offlog has been finished and in daily use since 2026-08-01 — see
DECISIONS.md's "The roadmap is finite" for why that is the goal being met
rather than the project stalling.

---

## Now — waiting on someone else, not on us

- **C3, Play Store listing.** Signing key wired into CI, privacy policy
  done, listing assets ready. Waiting on Google's identity verification and
  review. Worth checking before assuming a smooth listing: does local
  network sync attract extra review friction? See DECISIONS.md.
- **C5, landing page.** One plain GitHub Pages page. On hold, not blocking
  anything.

## Next — empty

Bugs found in daily use are the main driver of change now. Features aren't
planned in advance and aren't refused either: the bar is "does daily use
actually demand this", which usually has to be answered by living with the
app rather than imagining it. Anything clearing that bar lands here.

## Later — direction, not promises

Deprioritised, not declined. Only if daily use ever demands them:

- **Snooze** — one-tap defer to tomorrow or next week, extending the
  existing notification "Snooze 1h" to the task itself.
- **Import converters** — one-way Trello/ClickUp/Jira export conversion,
  not a live connection.
- **Voice input for Quick Add** — platform speech-to-text into the existing
  parser, Android first.
