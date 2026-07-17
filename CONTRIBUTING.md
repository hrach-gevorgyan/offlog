# Contributing to Offlog

Offlog is a single-maintainer, self-hosted personal task manager — see
[docs/GOAL.md](docs/GOAL.md) for the mission and
[docs/DECISIONS.md](docs/DECISIONS.md) for why certain choices (no
accounts, no hosted backend, no F-Droid/iOS, no monetization) are closed
questions rather than open ones. Read those before proposing anything
that touches them.

**[CLAUDE.md](CLAUDE.md) is the real contributor guide** — architecture
rules, database invariants, theming rules, accessibility requirements,
and the release checklist all live there, written to work for both human
contributors and AI coding assistants. This file only covers the
practical mechanics of sending a change.

## Setup

```bash
cd offlog-app
npm install
npm run dev             # http://localhost:5173
```

Sync is optional — the app works fully offline with no setup. See the
[README](README.md#getting-started) for the `.env.local` sync config and
the desktop (`offlog-desktop/`, Tauri) build steps.

## Before opening a PR

```bash
cd offlog-app
npm run build            # must succeed with zero Svelte warnings
npx tsc --noEmit -p .    # must be clean
npm test                 # must pass
```

Then verify the change visually in the browser (light **and** dark
mode) if it touches any UI.

## What a good PR looks like

- Matches the existing code style: compact CSS, Svelte 5 with `on:`
  event syntax, TypeScript everywhere, no CSS framework.
- Comments explain *why*, not what the next line does — see `db.ts` for
  the existing convention.
- No new colors hardcoded outside the CSS custom properties in
  `src/app.css` (two narrow exceptions are documented in CLAUDE.md).
- Any new `db.ts` write path invalidates `_taskCache` and writes a
  `log:` changelog doc, matching every existing mutation.
- Any change to a document affecting `docs/` is reflected there in the
  same PR — a change that isn't documented isn't finished, per
  CLAUDE.md's standing rule.

## Reporting bugs / requesting features

Use the issue templates. If you're not sure whether something is a bug
or an intentional design choice, check
[docs/DECISIONS.md](docs/DECISIONS.md) first — several "why not X"
questions are already answered there.

## Forking

The project is built to be forked. If you want your own feature set on
top of Offlog: fork the repo, point an AI coding assistant at it, have
it read `CLAUDE.md` and `docs/` for context, and describe what you want
changed. That's the same workflow this project was built with.
