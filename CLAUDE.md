# Offlog — Contributor Guide (AI & Human)

This file is the entry point for anyone (AI assistant or human) making
changes — it stays at the repo root deliberately, since AI tooling only
auto-loads a CLAUDE.md found there. Everything else lives in
[docs/](docs/): [docs/DECISIONS.md](docs/DECISIONS.md) (opens with the
project's manifesto — why this project exists and what it's ultimately
for, deliberately no version/timeline, see ROADMAP.md for that — then a
log of why non-obvious choices were made; merged GOAL.md into this file
2026-07-20), [docs/TECH.md](docs/TECH.md) (architecture),
[docs/ROADMAP.md](docs/ROADMAP.md) (current status and still-open work
only — shipped/declined/parked history lives in
[docs/archive/roadmap-archive.md](docs/archive/roadmap-archive.md)),
[docs/CHANGELOG.md](docs/CHANGELOG.md) (newest ~10 releases — older ones
plus the full maintenance-pass log compressed into
[docs/archive/changelog-archive.md](docs/archive/changelog-archive.md)),
and [docs/IDEAS.md](docs/IDEAS.md) (open questions and un-committed ideas;
merged the old QUESTIONS.md 2026-07-20). The maintenance-pass process
lives in [docs/MAINTENANCE.md](docs/MAINTENANCE.md) (instructions only —
its one-line current-pointer is checked at a version bump, not every
session — see below; the full pass-by-pass history lives in
docs/archive/changelog-archive.md). User-facing pitch is the root
[README.md](README.md).

**Mandatory, not optional: read the relevant document(s) above before
making any change or moving forward on a request, and revise whichever of
them your change affects afterward** — including shrinking or deleting
content that's become stale, not just adding to it. A change that isn't
reflected in the docs it affects isn't finished. This applies to every
document in this list, every session, no exceptions.

**When to read which doc** (so "the relevant document(s)" isn't a blanket
read-everything every time):
- **DECISIONS.md's manifesto** — before any scope/direction question
  ("should this be a feature," "should this need an account/server,"
  multi-user/remote-sync proposals) — check it lines up with the stated
  mission before proposing.
- **TECH.md** — touching architecture, the data model, sync internals, or
  Android platform behavior.
- **ROADMAP.md** — starting a roadmap item, or making sequencing/scheduling
  decisions. Archive shipped items into `docs/archive/roadmap-archive.md`
  roughly weekly, or whenever the still-open section starts accumulating
  shipped items again — don't let it regrow into a wall of history.
- **DECISIONS.md's decisions log** — before any "why not X instead," or
  touching storage/sync/business-model/distribution choices.
- **IDEAS.md** — only when the task is itself one of the open
  questions/ideas, or a new one worth recording comes up.
- **CHANGELOG.md** — only at release time (the version-bump step), not per
  code change. Move the oldest row into `docs/archive/changelog-archive.md`
  once the table exceeds 10 rows.
- **MAINTENANCE.md** — only when running an actual maintenance pass, or
  checking whether one is due at a version bump (its current-pointer line
  says last pass/next due — don't re-read the archive's full history for
  this check).

**Before proposing "why not just do X differently" — check
docs/DECISIONS.md first.** Several non-obvious choices (PouchDB-as-UMD-
global, CouchDB over any hosted backend, soft-delete-only, positional
"done", no F-Droid/iOS, no paywall ever) have already been debated and
closed with reasons recorded there. Don't re-open them without new
information.

## Token/effort discipline

Standing practice, not a one-off note — previous sessions burned tokens
rebuilding, restarting preview servers, and narrating far more than the
work needed. Concretely:

- **Batch fixes, then verify once.** Don't rebuild + restart the preview
  server + clear the service worker after every individual change. Make
  all the edits for the current task, *then* run one build/verify pass.
- **Don't reflexively spin up a live browser check for every tweak.**
  Reserve `preview_start`/screenshots for changes whose correctness can't
  be confirmed by reading the code (real layout/visual questions) — a
  straightforward logic fix doesn't need a live round-trip to prove itself.
- **Read narrowly.** Use `Grep`/an `offset`+`limit` `Read` instead of
  reading a whole file when only a section is relevant.
- **Rotating a CHANGELOG.md row into docs/archive/changelog-archive.md**:
  don't re-read either file in full every release. `Grep` for the row
  you're moving (or the archive's table-header line) to confirm the
  anchor text, then use a targeted `Edit` on each file — never a full-file
  `Read`+`Write` round trip for what's a one-row move. Only touch the
  archive at all when CHANGELOG.md's row count actually exceeds 10; most
  releases don't need a rotation. Same pattern for
  docs/ROADMAP.md ↔ docs/archive/roadmap-archive.md, done roughly weekly
  rather than per-release.
- **Keep responses terse.** State the result, not a running narration of
  intermediate steps. No restating what was just done in a summary if the
  tool output already showed it.
- **Commit messages: 2-4 lines is usually enough.** Skip the multi-
  paragraph rationale in the commit body when the "why" already lives in a
  code comment or a docs/ file — link to it instead of repeating it.
- **If a preview browser/server gets stuck, restart once and move on** —
  don't retry the same stuck screenshot/eval call repeatedly.
- **Use a subagent for open-ended codebase exploration** (the `Explore` or
  `general-purpose` agent) instead of reading many files into the main
  session directly — keeps the main context window free for the actual edit.
- **Run `/compact` at the end of a shipped version**, not mid-task —
  compacting mid-implementation risks losing in-progress reasoning.
- **Use `/clear` between unrelated concerns** instead of letting one
  session run long across topics that don't share context.

## What this is

A **single-user, local-first** task manager with deliberately **no backend,
no accounts, no telemetry** — everything works fully offline and the only
network call is optional CouchDB replication. Full tech stack table in
[docs/TECH.md](docs/TECH.md).

## Commands

```bash
cd offlog-app
npm run dev             # dev server at http://localhost:5173
npm run build           # production build → dist/  (must be warning-free, see below)
npx tsc --noEmit -p .   # type check
npm test                # vitest — db.ts unit tests against pouchdb-adapter-memory
npx cap sync android    # copy dist/ into the Android project (run after build)
```

Android APK: `cd android && .\gradlew assembleDebug` (set
`JAVA_HOME` to Android Studio's JBR first) — **owner-only, run by them in
Android Studio; never invoke this as the assistant** (see Release checklist
below).

**`offlog-desktop/`** is a sibling project (Tauri, Track E — ROADMAP.md
E1), not a subfolder of `offlog-app/` — it wraps `offlog-app/dist`
unmodified and embeds a CouchDB sync host. Its own build/architecture
detail lives in `docs/TECH.md`'s "Desktop (Tauri)" section; don't
duplicate it here. `cargo build`/`cargo tauri build`/`cargo tauri dev`
are fine for the assistant to run (unlike the Android APK build above)
— there's no equivalent "owner-only" restriction for it.

Dev environment is **Windows** —
prefer POSIX-safe commands in scripts, and expect LF→CRLF warnings from git
(harmless, don't "fix" them).

## Layer rules (who may talk to whom)

```
UI components (.svelte) → store.ts → db.ts → PouchDB
                        ↘ db.ts directly for reads/mutations is OK,
                          but ALWAYS reload via store helpers afterwards
notifications.ts → db.ts   (one direction only; db.ts must never import notifications.ts)
```

- `store.ts` is the only reactive state layer. Components never hold their own
  copy of task lists beyond derived/local view state.
- After any task mutation from a component, call `reloadTasks()` (or rely on the
  live `subscribe()` change feed if the write goes through sync).
- Every task-mutating call site must be wrapped in `try/catch` + `showError()`.
  No silent failures — an established, audited invariant.
- **Any component that calls `closeOnBack()` (see `modalStack.ts`) must be
  mounted behind a `{#key}` that changes on every real open** — not just
  gated by `{#if showX}`. A fast close-then-reopen of the same overlay can
  toggle `showX` false→true again while Svelte's outro for the previous
  show is still animating; Svelte then *reverses* that outro into a fresh
  intro on the same component instance instead of destroying and
  recreating it. `closeOnBack()` only runs once, at that instance's setup,
  so the revived instance's `requestClose` is the original — already
  spent — one, and no new history-stack entry exists for it either:
  permanently stuck open, with a working-looking Escape/scrim/back that
  silently does nothing (found 2026-07-17 in Changelog under rapid
  clicking; see `modalStack.ts`'s own header comment for the full trace).
  Bump a counter on every open and fold it into the key, e.g.
  `{#key task._id + ':' + openSession}` — see `Sidebar.svelte`'s
  `changelogSession`/`trashSession`/`settingsSession` or
  `KanbanBoard.svelte`'s `detailOpenSession` for the pattern.

## Database invariants (db.ts)

- **PouchDB is a UMD global** loaded via `index.html` (`public/pouchdb.js`),
  core-only. Plugins (e.g. `pouchdb-find`) must be registered explicitly with
  `PouchDB.plugin(...)` — importing them is not enough.
- `db.find()` **silently defaults to 25 results** — always pass an explicit
  `limit`. This has bitten us before.
- **Soft delete only** for tasks (`deleted: true`); never `db.remove()` a task
  except in `deleteProject`/`wipeAndReseed`. Hard deletes break sync semantics.
- **`_taskCache` must be invalidated** (`invalidateTaskCache()`) inside every
  function that writes a task doc, in addition to the central invalidation in
  `subscribe()`. If you add a new write path, add the invalidation.
- **"Done" is positional**: a task is considered complete when its `column_id`
  equals the **last** column of its project (`columns.at(-1)`). There is no
  `done` boolean. Agenda, dashboard overdue counts, and reminders all rely on
  this — apply the same rule in any new query.
- **Ordering** uses fractional positions (`posBetween`) — insert between
  neighbors without renumbering.
- Every mutation writes a `log:` changelog doc via `logChange()`. New mutation
  types should follow the same pattern (action ∈ create/update/move/delete).
- Document `_id` prefixes are the type system: `space:` / `project:` / `task:` /
  `log:`. Range scans depend on these prefixes — never change them.
- **`column_id` is a string id, not the column object.** A test-data script
  writing `p.columns[i % p.columns.length]` from a raw project doc assigns
  the whole `{id, name}` object — tasks silently vanish from Kanban (they
  don't match any column) while still being valid, queryable docs. Always
  assign `column.id`, not `column`.
- **Conflict info lives on `row.doc._conflicts`, never on `row.value.conflicts`.**
  The latter has never existed in PouchDB's API — `db.allDocs({conflicts:true})`
  only attaches `_conflicts` to the fetched doc (which requires
  `include_docs: true` too). Covered by `tests/db.test.ts`'s manufactured-
  conflict test. When resolving a conflict, every revision in `_conflicts`
  needs an explicit `db.remove(id, rev)` — including the one whose content
  you adopted, since adopting content by writing a new revision does not
  remove its old leaf.

## Generating test/dummy data

Write directly against the PouchDB browser global, don't drive the UI one
task at a time — full recipe in [docs/TECH.md](docs/TECH.md)'s "Testing &
Dev Workflows" section.

## Theming rules

- **All colors are CSS custom properties** in `src/app.css` (`:root` light,
  `body.dark` dark). The full token table is in `docs/TECH.md` → "Theme System"
  — this is the only copy; don't duplicate it into README.md.
- **Never hardcode a hex/rgba color in a component** — the one exception
  is pure-black shadows/scrims (`rgba(0,0,0,.x)`). `Sidebar.svelte`
  follows the page theme via `--sidebar-bg` like everything else (used
  to be pinned always-dark; changed 2026-07-17 on owner feedback) —
  don't reintroduce a local dark override there.
- Derived tints use `color-mix(in srgb, var(--token) X%, transparent)` —
  never a separately hardcoded rgba of the token's current value.
- Semantic tokens: `--accent` (indigo), `--danger`, `--success`,
  `--overdue-bg/ink`, `--due-soon-bg/ink`. Add a token rather than a literal
  if a new semantic color is needed, and add it to **both** light and dark
  blocks plus the table in `docs/TECH.md`.
- Brand color changes must also propagate to: `index.html` `<meta theme-color>`,
  `capacitor.config.ts` `iconColor`, and `android/.../values/colors.xml`.
- Known theming gotcha in `Sidebar.svelte`'s settings panel — see
  [docs/TECH.md](docs/TECH.md)'s Theme System section before touching it.

## Accessibility rules (enforced — build must stay warning-free)

- `npm run build` currently emits **zero Svelte compiler warnings**. Keep it
  that way; fix warnings properly instead of adding `svelte-ignore`.
- Anything clickable is a real `<button>` (with `aria-label` if icon-only),
  or has `role="button" tabindex="0"` + Enter/Space keydown when a button
  element genuinely can't be used (e.g. rows containing other buttons).
- Never `outline: none` on `:focus` without a replacement — the global
  `:focus-visible` rule in app.css provides keyboard focus rings; don't defeat it.
- Every modal/panel closes on Escape. Hover-only controls need a visible
  fallback on touch (see the Kanban column-action `@media (max-width: 768px)`
  pattern).
- Legitimate remaining `svelte-ignore` uses: scrim click-to-close (Escape is
  the keyboard path) and intentional `a11y-autofocus` on inline editors.

## Testing

`tests/db.test.ts` (Vitest) covers `db.ts`'s pure/query logic against
`pouchdb-adapter-memory` — see [docs/TECH.md](docs/TECH.md)'s "Testing &
Dev Workflows" for how `tests/setup.ts` shims PouchDB/localStorage. When
adding a new `db.ts` function with any non-trivial logic, add a test here
before shipping — this suite already caught two real bugs (broken conflict
detection, an incomplete conflict resolution) that had been silently
shipping. UI components have no test coverage yet; that's still manual/
browser-preview verification.

## Android gotchas (hard-won — read before touching)

- **Status bar**: targetSdk 36 is edge-to-edge; `StatusBar.setBackgroundColor()`
  is a hard no-op. The working approach is the `.status-bar-fill` strip in
  App.svelte + `env(safe-area-inset-top)` padding. Details in docs/TECH.md.
- **Notification icons** must be white silhouettes with transparency, or
  Android silently substitutes a generic triangle.
- `position: fixed` full-screen elements bypass `.layout` and need their own
  `padding-top: env(safe-area-inset-top)`.
- Android launcher icon changes: uninstall the app before reinstalling, and
  Clean Project — the launcher caches icons aggressively.
- **Prefer an official `@capacitor/*` plugin's own mechanism over a custom
  native bridge event, when one exists.** Check before writing custom
  Java — see [docs/DECISIONS.md](docs/DECISIONS.md)'s A25 entry for the
  concrete bug this rule comes from.

## Project status & direction

Full reasoning behind all of this lives in
[docs/DECISIONS.md](docs/DECISIONS.md) — the directives below are the
actionable rules, kept short on purpose:

- **No git remote yet, repo not public.** Don't add a remote, push, or
  suggest making it public without an explicit owner request.
- **Never let a public-facing change ship before the config.ts credential
  fix** (tracked in docs/ROADMAP.md's Track C, item C7) — not urgent for
  day-to-day work, but a hard gate on anything public-facing.
- **Security is minimal by design, not yet audited.** Treat any feature
  that would expand the network attack surface with the same caution
  applied when mesh sync was declined.
- **No business model, ever — don't propose monetization** unless the
  owner raises it again.
- **Distribution stays GitHub + a website + Google Play** — don't propose
  F-Droid or iOS without the owner raising it first.

## Release checklist

Day-to-day work happens on the PC/web build. **Android sync
(`npx cap sync android`) is a manual, owner-requested step — do not run it
as part of a routine release.** Bump the Android version numbers alongside
the web ones so they stay in sync for whenever a sync/build is actually
requested.

**Never run a Gradle/APK build (`gradlew assembleDebug` or similar) —
ever, even when asked to verify Android changes.** The owner always builds
and runs via Android Studio directly (2026-07-05). If Android-side changes
need verification, `npx cap sync android` (copies `dist/` into the Android
project so Android Studio picks up the latest code) is as far as this
goes — confirm it compiles/looks right by reading the code and running
`cap sync`, then say a Studio rebuild is needed to actually test it,
rather than invoking Gradle.

**The Android `release` build type's `signingConfig` currently points at
AGP's public debug keystore** (set in v5.4.4 purely so Android Studio's Run
button can install a `release`-type build locally) — this is not a real
release signing key. Before any actual Play Store packaging/distribution,
a real key must be generated and wired in first (tracked in
docs/ROADMAP.md's Track C, item C3 — Play Store); don't let a
debug-keystore-signed `release` APK go out as a real release build.

1. `npm run build` — must succeed with **zero warnings**
2. `npx tsc --noEmit -p .` — clean
3. `npm test` — clean
4. Verify visually in the browser preview (light **and** dark mode)
5. Bump version in `package.json`, `android/app/build.gradle`
   (`versionCode` +1, `versionName`), **and**
   `offlog-desktop/src-tauri/tauri.conf.json`'s `version` — even on
   releases where Android/desktop aren't being synced/built, so all
   three stay in sync for whenever a build actually is requested
6. Add a new entry to `docs/CHANGELOG.md` — the single source of truth for
   version history (do not duplicate it back into TECH.md or README.md)
7. Commit (`feat:`/`fix:` prefix, version in subject) and tag `vX.Y.Z`
8. **Never push, sync to Android, build the APK, or commit palette/visual
   changes without the owner's explicit confirmation/request**
9. **After any real test round (not every commit), reset to a fresh
   state** — `offlog-desktop/scripts/reset-dev-env.ps1` for the desktop
   dev CouchDB/config, plus the browser/Android reset steps in
   [docs/TECH.md](docs/TECH.md)'s "Resetting to a fresh state" section.
   Dev state silently accumulates release over release otherwise — E2's
   dev/prod identity-collision bug was found because of exactly that.

## Style conventions

- Match existing code: compact CSS (one-line related properties), Svelte 5
  with `on:` event syntax, TypeScript everywhere, no CSS framework.
- Comments explain **constraints and why**, not what the next line does.
  The codebase has a strong tradition of comments documenting non-obvious
  invariants (see db.ts) — follow it.
- User-facing wording: statuses are called **"Status"**, never "Column"
  (internal field names still say `column_id` — that's a frozen legacy name).
- Dates in docs are absolute (e.g. "2026-07"), not relative.
- **Max 3 font families project-wide.** Currently 1: Hanken Grotesk, for
  everything — IBM Plex Mono was removed 2026-07-19 (owner feedback: a
  second, monospace typeface on metadata labels like "Status"/"Priority"
  next to Hanken Grotesk everywhere else read as inconsistent). `--mono`
  in `app.css` still exists as its own CSS variable — used by ~20
  components for a label's uppercase/letter-spacing/size treatment — but
  now points at the same Hanken Grotesk face; don't reintroduce a second
  `@font-face` there. Self-hosted from `offlog-app/public/fonts/` via
  `@font-face` (not Google Fonts' CDN — see C9 in ROADMAP.md for why),
  latin subset only. If a new font is ever needed, download and
  self-host it the same way; don't reach for a CDN `@import`.

## Maintenance routine (mandatory)
- Cadence: a maintenance pass **every 3 minor versions**. The current
  Last-pass/Next-pass-due state lives **only** in
  [docs/MAINTENANCE.md](docs/MAINTENANCE.md)'s one-line current-pointer
  (process/phases live there too; full pass-by-pass narrative history is
  in docs/archive/changelog-archive.md, not restated here) — don't restate
  specific version numbers here, they'll drift out of sync.
- Check the pointer **when bumping the version during a release**
  (checklist step 5) — not on every session start, that's wasted tokens.
  If the release just shipped matches "Next pass due," tell the owner:
  "A maintenance pass is due (last: vX, current: vY). Run it now? (see
  docs/MAINTENANCE.md)" — and don't start one without confirmation.
- When a pass completes, update docs/MAINTENANCE.md's current-pointer line
  (Last pass = current version, Next pass due = next scheduled point), and
  append the pass's narrative to docs/archive/changelog-archive.md.
- Maintenance passes never add features and never touch doc schema,
  PouchDB/CouchDB sync logic, storage format, soft-delete semantics, or
  the positional-"done" rule without explicit owner approval.
