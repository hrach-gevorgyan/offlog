# Offlog — Contributor Guide

A **single-user, local-first** task manager: no backend, no accounts, no
telemetry. Everything works offline; the only network call is optional sync
replication to a self-hosted NyxDB (or any CouchDB-protocol server).

Svelte 5 + TypeScript + PouchDB, wrapped by Tauri (Windows) and Capacitor
(Android). `offlog-desktop/` is a sibling project, not a subfolder — it wraps
`offlog-app/dist` unmodified.

## Docs

Read the one your change touches, and update it in the same session — a
change not reflected in the doc it affects isn't finished.

| file | read before |
|---|---|
| [docs/tech.md](docs/tech.md) | architecture, data model, sync internals, Android platform behaviour |
| [docs/decisions.md](docs/decisions.md) | any "why not X instead" or scope/direction question |
| [docs/roadmap.md](docs/roadmap.md) | starting planned work or sequencing it |
| [docs/brand.md](docs/brand.md) | any public-facing copy; also forks, name/icon reuse, trademark questions |
| [docs/changelog.md](docs/changelog.md), [docs/release-notes.md](docs/release-notes.md) | release time only |
| [docs/maintenance.md](docs/maintenance.md) | running a maintenance pass |

Roadmap holds only work that's both needed and doable. Something that turns
out not to be doable moves to decisions.md with the reasoning; an unresolved
question goes to decisions.md's Open Questions. Don't let roadmap accumulate
maybes.

Several choices are already closed with recorded reasons — PouchDB as a UMD
global, a self-hosted CouchDB-protocol backend, soft-delete-only, positional
"done", no F-Droid or iOS, no paywall ever. Check decisions.md before
reopening one.

## Commands

From `offlog-app/` (Node 22+):

```bash
npm run dev      # localhost:5173
npm run build    # → dist/, must be warning-free
npm run check    # svelte-check + tsc
npm test         # vitest
npx cap sync android   # after build; run freely
```

Dev environment is Windows — prefer POSIX-safe scripts, and ignore git's
LF→CRLF warnings.

**Never run a Gradle or APK build, even when asked to verify Android
changes.** The owner builds in Android Studio; CI builds releases. Run
`cap sync`, confirm the code reads right, and say a Studio rebuild is needed.

## Layer rules

```
UI components (.svelte) → store.ts → db.ts → PouchDB
                        ↘ db.ts directly is OK, but reload via store after
notifications.ts → db.ts   (one direction; db.ts must never import it)
```

- `store.ts` is the only reactive state layer. Components hold no task lists
  beyond derived/local view state.
- After a mutation from a component, call `reloadTasks()` — or rely on the
  live `subscribe()` feed if the write goes through sync.
- Every task-mutating call site is wrapped in `try/catch` + `showError()`.
  No silent failures; this is an audited invariant.

**Any component calling `closeOnBack()` (see `modalStack.ts`) must be mounted
behind a `{#key}` that changes on every real open** — not just gated by
`{#if showX}`. A fast close-then-reopen can flip `showX` back to true while
the outro is still animating; Svelte reverses the outro into a fresh intro on
the *same instance* instead of recreating it. `closeOnBack()` only runs at
setup, so the revived instance holds an already-spent `requestClose` and has
no history entry: permanently stuck open, with a working-looking Escape and
scrim that silently do nothing. Bump a counter per open and fold it in —
`{#key task._id + ':' + openSession}`, as in `Sidebar.svelte` and
`KanbanBoard.svelte`.

**Splitting a component's markup into children**: move the parent's CLASS
rules to `:global()` under a parent-owned wrapper, but keep bare ELEMENT
rules (`button`, `label`, `textarea`) scoped and copy them into each child.
A `:global(button)` also matches nested components' internal buttons
(CustomSelect, CalendarPicker) and silently restyles them. Verify by
fingerprinting computed styles of every rendered element before and after —
matching element counts prove nothing; that regression had identical DOM.

**A pure type change must emit byte-identical JavaScript.** Hash the build
assets before and after, normalising the content-hash out of the filename.
No `as unknown as X`, no `@ts-expect-error`, no runtime guards added to
satisfy the compiler.

## Database invariants (db.ts)

`db.ts` is a barrel over `src/lib/db/` — `core.ts` (instance, indexes, task
cache, `logChange`, `subscribe`), `entities.ts` (spaces, projects, tasks,
blocked-by, attachments, undo, trash), `sync.ts`, `tags.ts`, `stats.ts`,
`maintenance.ts`. **Always import from `./db`**, never a `db/` module
directly. Dependencies run one way: `core` ← `entities` ← {`sync`, `tags`,
`stats`, `maintenance`}. Projects and tasks share a module deliberately —
`updateTask` needs a project's columns while `deleteProject` cascades into
tasks, so splitting them would be a cycle.

- **PouchDB is a UMD global** from `index.html` (`public/pouchdb.js`),
  core-only. Plugins like `pouchdb-find` need an explicit
  `PouchDB.plugin(...)`; importing is not enough.
- `db.find()` **silently defaults to 25 results** — always pass `limit`.
- **Soft delete only** for tasks (`deleted: true`); never `db.remove()` a task
  except in `deleteProject`/`wipeAndReseed`. Hard deletes break sync.
- **`_taskCache` must be invalidated** (`invalidateTaskCache()`) inside every
  function that writes a task doc, on top of the central invalidation in
  `subscribe()`. New write path → add the invalidation.
- **"Done" is positional**: a task is complete when its `column_id` equals the
  **last** column of its project (`columns.at(-1)`). There is no `done`
  boolean. Agenda, overdue counts and reminders all rely on this.
- **Ordering** uses fractional positions (`posBetween`) — insert between
  neighbours without renumbering.
- Every mutation writes a `log:` doc via `logChange()` (action ∈
  create/update/move/delete).
- Document `_id` prefixes are the type system: `space:` / `project:` /
  `task:` / `log:`. Range scans depend on them — never change them.
- **`column_id` is a string id, not the column object.** Assigning
  `p.columns[i]` instead of `p.columns[i].id` makes tasks vanish from Kanban
  while remaining valid, queryable docs.
- **Conflict info lives on `row.doc._conflicts`, never
  `row.value.conflicts`** — the latter has never existed in PouchDB.
  `db.allDocs({conflicts:true})` also needs `include_docs: true`. When
  resolving, every revision in `_conflicts` needs its own
  `db.remove(id, rev)` — including the one whose content you adopted, since
  writing a new revision doesn't remove its old leaf.

## Testing

`tests/db.test.ts` covers `db.ts` against `pouchdb-adapter-memory`. Every
component with real logic has a test file using `@testing-library/svelte`
against mocked `db`/`store`/`config`: mock the module, render, `fireEvent`,
assert the write's exact arguments. Purely presentational children
(`settings/*`, `carddetail/*`, `PinStar`) are covered through their parents;
`App.svelte` has none.

In order of how often they save you:

1. **Judge a run by its exit code, not its summary.** Vitest prints
   "569 passed" and still exits 1 on an unhandled rejection. `npx vitest run;
   echo $?`
2. **A test that survives a mutation asserts nothing.** Break the source,
   confirm THAT test fails, revert. If it still passes, rewrite or delete it.
3. **Cover the failure path** — every mutating call site must surface
   `showError()`.
4. **Assert invariance, not absolute numbers.** `perfGuard.test.ts` counts
   database round-trips, never wall-clock time. Growth is the regression.
5. **Test the real thing where the risk is real.** `replication.test.ts` runs
   PouchDB's actual replicator between two databases; `backupRestore.test.ts`
   takes a real database through export → wipe → restore.

Gotchas: a deleted doc's tombstone outranks an incoming rev-1 for the same
id, so replication tests need ids nothing has deleted; `vi.mock` factories
are hoisted above every `const`, so a factory needing a store must create it
inside and import it back.

## Theming

- **All colors are CSS custom properties** in `src/app.css` (`:root` light,
  `body.dark` dark). Token table is in tech.md — the only copy.
- **Never hardcode a hex/rgba in a component**; the one exception is
  pure-black shadows and scrims. Derived tints use
  `color-mix(in srgb, var(--token) X%, transparent)`.
- A new semantic color gets a token in **both** blocks plus the tech.md table.
- Brand color changes must also reach `index.html`'s `<meta theme-color>`,
  `capacitor.config.ts`'s `iconColor`, and `android/.../values/colors.xml`.

## Accessibility (build must stay warning-free)

- `npm run build` emits zero Svelte compiler warnings. Fix warnings properly
  rather than adding `svelte-ignore`.
- Anything clickable is a real `<button>` (with `aria-label` if icon-only), or
  `role="button" tabindex="0"` + Enter/Space when a button element genuinely
  can't be used.
- Never `outline: none` on `:focus` without a replacement — the global
  `:focus-visible` rule in app.css handles keyboard rings.
- Every modal closes on Escape. Hover-only controls need a visible touch
  fallback.
- Remaining `svelte-ignore` uses are load-bearing, in four categories:
  scrim click-to-close, intentional `a11y-autofocus` on inline editors,
  drag-and-drop handlers on Kanban columns, and `role="option"` rows whose
  key handling lives on the owning input.

## Android gotchas

- **Status bar**: targetSdk 36 is edge-to-edge; `StatusBar.setBackgroundColor()`
  is a hard no-op. Use the `.status-bar-fill` strip in App.svelte plus
  `env(safe-area-inset-top)` padding.
- **Notification icons** must be white silhouettes with transparency, or
  Android substitutes a generic triangle.
- `position: fixed` full-screen elements bypass `.layout` and need their own
  `padding-top: env(safe-area-inset-top)`.
- Launcher icon changes need an uninstall plus Clean Project — the launcher
  caches icons aggressively.
- **Home-screen widget `PendingIntent`/flag changes need the widget removed
  and re-added**, not just the app reinstalled. `offlog_widget_info.xml` sets
  `updatePeriodMillis="0"`, so `OffologWidgetProvider.onUpdate()` — where the
  PendingIntents are built — only runs when an instance is first placed. A
  widget already on the home screen keeps stale PendingIntents until re-added
  or the device reboots.
- **Prefer an official `@capacitor/*` plugin's own mechanism over a custom
  native bridge event** when one exists (decisions.md, A25).

## Style

- Match existing code: compact CSS, Svelte 5 `on:` event syntax, TypeScript
  everywhere, no CSS framework.
- Statuses are called **"Status"** in user-facing wording, never "Column" —
  `column_id` is a frozen internal name. Dates in docs are absolute.
- **Max 3 font families project-wide; currently 1**, Hanken Grotesk,
  self-hosted from `public/fonts/` (never a CDN). `--mono` still
  exists as a token for uppercase/letter-spaced labels but points at the same
  face; don't add a second `@font-face`.
- Comments state **the rule, not the story.** A comment earns its place by
  telling a future editor something that stops them breaking the code: a
  non-obvious constraint, a surprising API behaviour, or why a line that looks
  wrong is deliberate.

  Do not write dates, owner attributions or quotes, ticket ids, version
  archaeology, or an account of what was tried and reverted. That history
  already lives in git; a comment describing a decision's history gets read as
  its current rationale.
  - Bad: `// redesign/v6: was bare floating text (owner feedback: "awful")`
  - Good: *(nothing — the code shows a pill; there is no rule here)*
  - Good: `// column.id, never the column object — a task whose column_id`
    `// doesn't match any column vanishes from Kanban while staying a`
    `// valid, queryable doc.`

## Working style

- **Batch edits, then verify once.** Don't rebuild and restart the preview
  after every individual change.
- **Reserve live browser checks for real visual questions** — a logic fix
  doesn't need a round-trip to prove itself.
- Read narrowly (`Grep`, or `Read` with offset/limit) and use a subagent for
  open-ended exploration.
- Keep responses terse; commit messages are 2–4 lines.

## Release

1. `npm run build`, `npm run check`, `npm test` — all clean, judged by exit
   code
2. Verify visually in light **and** dark mode
3. Bump the version in `package.json`, `android/app/build.gradle`
   (`versionCode` +1, `versionName`) and
   `offlog-desktop/src-tauri/tauri.conf.json` — all three, every release
4. Add a `docs/changelog.md` entry (Keep a Changelog format) **and** a
   `docs/release-notes.md` entry in plain language with its **In short**
   block. Both, always — they're written for different readers. Nothing
   user-visible still gets a one-line entry; the extraction script needs one.
5. Check maintenance.md's current pointer. If a pass is due, say so and wait
   for confirmation — don't start one.
6. Commit (`feat:`/`fix:`, version in the subject) and tag `vX.Y.Z`
7. After a real test round, reset to a fresh state —
   `offlog-desktop/scripts/reset-dev-env.ps1` plus the browser/Android steps
   in tech.md. Dev state accumulates silently otherwise.

**Never push, build the APK, or commit palette/visual changes without the
owner's explicit request.** The Android `release` build type currently points
at AGP's public debug keystore so Studio's Run button works locally — a real
key must be wired in before any Play Store packaging (roadmap C3).
