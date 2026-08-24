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
- **Real-scale metrics and benchmarks.** It was never settled whether a
  single person's task manager accumulates enough data for scale to matter.
  There is now a real database in daily use to measure. Needs actual
  numbers, a benchmark that runs against them, and tests at the sizes those
  numbers suggest — not an assumption either way.

## Later — direction, not promises

Deprioritised, not declined. Only if daily use ever demands them:

- **Snooze** — one-tap defer to tomorrow or next week, extending the
  existing notification "Snooze 1h" to the task itself.
- **Import converters** — one-way Trello/ClickUp/Jira export conversion,
  not a live connection.
- **Voice input for Quick Add** — platform speech-to-text into the existing
  parser, Android first.
