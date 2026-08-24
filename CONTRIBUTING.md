# Contributing to Offlog

Offlog is a single-maintainer, self-hosted personal task manager — see
[docs/decisions.md](docs/decisions.md)'s manifesto for the mission and
the rest of that same file for why certain choices (no accounts, no
hosted backend, no F-Droid/iOS, no monetization) are closed questions
rather than open ones. Read those before proposing anything that
touches them.

**[CLAUDE.md](CLAUDE.md) is the real contributor guide** — architecture
rules, database invariants, theming rules, accessibility requirements,
and the release checklist all live there, written to work for both human
contributors and AI coding assistants. This file only covers the
practical mechanics of sending a change.

## Project status — read this first

Offlog is **actively maintained but feature-complete**. It is not
abandoned, and it is not archived — bugs get fixed, dependencies
get updated, security reports get answered. What it doesn't have is a
feature roadmap; see [docs/roadmap.md](docs/roadmap.md).

What that means for you:

- **Bug reports from real use are the most valuable thing you can
  send.** That's now the main way the app changes at all.
- **Feature ideas are welcome, but open an issue before writing code.**
  New features get judged against "does daily use actually demand
  this," which is a higher bar than "this would be a good feature."
  A quick issue gets you a straight yes/no before you spend a weekend
  on something that might be declined for scope reasons rather than
  quality ones.
- **Fixes, simplifications and code review** are always welcome with no
  preamble needed.

## Setup

Node.js 22+ required (CI pins 22; there is no `engines` field).

```bash
cd offlog-app
npm ci
npm run dev             # http://localhost:5173
```

Sync is optional — the app works fully offline with no setup. See the
[README](README.md#getting-started) for the `.env.local` sync config and
the desktop (`offlog-desktop/`, Tauri) build steps.

## Before opening a PR

```bash
cd offlog-app
npm run build            # must succeed with zero Svelte warnings
npm run check            # svelte-check + tsc, must be clean
npm test                 # must pass
```

Then verify the change visually in the browser (light **and** dark
mode) if it touches any UI.

### If your change touches build tooling, also run `cap sync`

```bash
npx cap sync android     # required for TypeScript/Vite/Capacitor/Tauri changes
```

**CI does not run this, and a green checkmark is not sufficient
evidence.** CI covers build, type-check and tests only. A dependency
bump can pass all three and still break the packaging path — TypeScript
7 did exactly that, passing every gate and then breaking
`npx cap sync android` on the next release tag, because the gates never
exercise Capacitor CLI's own config loader. This is a documented blind
spot; see [docs/maintenance.md](docs/maintenance.md).

If you touch anything under `offlog-desktop/`, also:

```bash
cd offlog-desktop
cargo build --manifest-path src-tauri/Cargo.toml   # zero warnings
cargo clippy --manifest-path src-tauri/Cargo.toml  # zero warnings
```

## What a good PR looks like

- Matches the existing code style: compact CSS, Svelte 5 with `on:`
  event syntax, TypeScript everywhere, no CSS framework.
- Comments explain *why*, not what the next line does — see `db.ts` for
  the existing convention. Where a comment records a bug that was
  actually hit, it stays; those comments are the project's memory.
- No new colors hardcoded outside the CSS custom properties in
  `src/app.css` (two narrow exceptions are documented in CLAUDE.md).
- Any new `db.ts` write path invalidates `_taskCache` and writes a
  `log:` changelog doc, matching every existing mutation.
- **New logic ships with a test.** `db.ts` logic goes in
  `tests/db.test.ts`; a component gets its own file alongside the
  existing ones. These suites have caught real bugs that were silently
  shipping — a broken conflict check, an incomplete conflict resolution,
  and a backup format that couldn't be restored.
- **Prove the test works by breaking the code.** Invert a condition or
  drop a guard, confirm *that* test fails, then revert. A test that still
  passes against broken code asserts nothing — rewrite or delete it.
  Judge a run by its exit code, not its summary: vitest prints "passed"
  and still exits 1 on an unhandled rejection.
- Every task-mutating call site is wrapped in `try/catch` +
  `showError()`. No silent failures — this is an audited invariant, and
  a regression on it is treated as a bug.
- Any change to a document affecting `docs/` is reflected there in the
  same PR — a change that isn't documented isn't finished, per
  CLAUDE.md's standing rule.

## Things that will get a PR sent back

Not to be discouraging — these are just the recurring ones, and all of
them are documented invariants rather than taste:

- Hard-deleting a task (`db.remove()`) instead of soft-deleting
  (`deleted: true`). Hard deletes break sync semantics.
- Treating "done" as a boolean. It's **positional** — a task is complete
  when its `column_id` equals its project's *last* column.
- Assigning the whole column object to `column_id` instead of
  `column.id`. Tasks silently vanish from Kanban while remaining valid,
  queryable documents.
- Calling `db.find()` without an explicit `limit` (it silently defaults
  to 25).
- Adding a second font family, or a third — the cap is three
  project-wide and currently one is in use.

## Reporting bugs / requesting features

Use the issue templates. If you're not sure whether something is a bug
or an intentional design choice, check
[docs/decisions.md](docs/decisions.md) first — several "why not X"
questions are already answered there, including ones that were tried
and reversed.

For anything security-related, **don't open a public issue** — see
[SECURITY.md](SECURITY.md) for private reporting.

## Forking

The project is built to be forked, and that's a genuinely supported
outcome rather than a consolation prize — if your needs diverge from
this app's deliberately narrow scope, a fork is often the right answer.
Fork the repo, point an AI coding assistant at it, have it read
`CLAUDE.md` and `docs/` for context, and describe what you want changed.
That's the same workflow this project was built with, and the
documentation exists specifically to make it work.

Note that the MIT license covers the **code only** — the Offlog name,
icon, wordmark and tagline are reserved separately. See
[docs/brand.md](docs/brand.md) §10 before naming your fork.
