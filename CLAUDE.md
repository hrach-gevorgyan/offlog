# Offlog — Contributor Guide (AI & Human)

This file is the entry point for anyone (AI assistant or human) making
changes — it stays at the repo root deliberately, since AI tooling only
auto-loads a CLAUDE.md found there. Everything else lives in
[docs/](docs/): [docs/TECH.md](docs/TECH.md) (architecture),
[docs/ROADMAP.md](docs/ROADMAP.md) (planned work and the public-release
path),
[docs/DECISIONS.md](docs/DECISIONS.md) (why non-obvious choices were made),
[docs/CHANGELOG.md](docs/CHANGELOG.md) (version history), and
[docs/QUESTIONS.md](docs/QUESTIONS.md) (open questions). User-facing pitch
is the root [README.md](README.md).

**Mandatory, not optional: read the relevant document(s) above before
making any change or moving forward on a request, and revise whichever of
them your change affects afterward** — including shrinking or deleting
content that's become stale, not just adding to it. A change that isn't
reflected in the docs it affects isn't finished. This applies to every
document in this list, every session, no exceptions.

**Before proposing "why not just do X differently" — check
docs/DECISIONS.md first.** Several non-obvious choices (PouchDB-as-UMD-
global, CouchDB over any hosted backend, soft-delete-only, positional
"done", no F-Droid/iOS, no paywall ever) have already been debated and
closed with reasons recorded there. Don't re-open them without new
information.

## Token/effort discipline (owner flagged this directly, 2026-07-03 — read this)

Previous sessions burned tokens rebuilding, restarting preview servers, and
narrating far more than the work needed. Concretely:

- **Batch fixes, then verify once.** Don't rebuild + restart the preview
  server + clear the service worker after every individual change. Make
  all the edits for the current task, *then* run one build/verify pass.
- **Don't reflexively spin up a live browser check for every tweak.**
  Reserve `preview_start`/screenshots for changes whose correctness can't
  be confirmed by reading the code (real layout/visual questions) — a
  straightforward logic fix doesn't need a live round-trip to prove itself.
- **Read narrowly.** Use `Grep`/an `offset`+`limit` `Read` instead of
  reading a whole file when only a section is relevant.
- **Keep responses terse.** State the result, not a running narration of
  intermediate steps. No restating what was just done in a summary if the
  tool output already showed it.
- **Commit messages: 2-4 lines is usually enough.** Skip the multi-
  paragraph rationale in the commit body when the "why" already lives in a
  code comment or a docs/ file — link to it instead of repeating it.
- **If a preview browser/server gets stuck, restart once and move on** —
  don't retry the same stuck screenshot/eval call repeatedly.

## What this is

A **single-user, local-first** task manager. Svelte 5 + TypeScript + Vite,
PouchDB (IndexedDB) for storage, optional live sync to a self-hosted CouchDB,
Capacitor 7 for the Android build, vite-plugin-pwa for the installable web build.
There is deliberately **no backend, no accounts, no telemetry** — everything
works fully offline and the only network call is CouchDB replication.

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
below). Dev environment is **Windows** —
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
  No silent failures — this is an established, audited invariant (v2.9.0).

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
  `include_docs: true` too). A real bug shipped in v3.1.0 checking the wrong
  field, caught by `tests/db.test.ts`'s manufactured-conflict test in v3.4.0.
  When resolving a conflict, every revision in `_conflicts` needs an explicit
  `db.remove(id, rev)` — including the one whose content you adopted, since
  adopting content by writing a new revision does not remove its old leaf.

## Generating test/dummy data

When asked to add dummy records for manual testing, write directly against
the PouchDB instance in the browser (`new PouchDB('offlog')` — it's a global,
reachable from `preview_eval` or the browser console) rather than driving the
UI one task at a time. Tag generated docs (e.g. `tags: ['dummy']`) so they're
identifiable and easy to bulk-remove later. Spread across every existing
project **and** across each project's actual statuses (fetch real column ids
first — see the `column_id` pitfall above). Reload the page after writing so
the live `subscribe()` change feed and in-memory task cache pick it up.

## Theming rules

- **All colors are CSS custom properties** in `src/app.css` (`:root` light,
  `body.dark` dark). The full token table is in `docs/TECH.md` → "Theme System"
  — this is the only copy; don't duplicate it into README.md.
- **Never hardcode a hex/rgba color in a component**, with two exceptions:
  pure-black shadows/scrims (`rgba(0,0,0,.x)`) and the sidebar's local
  translucent white overrides (it is pinned always-dark by design).
- Derived tints use `color-mix(in srgb, var(--token) X%, transparent)` —
  never a separately hardcoded rgba of the token's current value.
- Semantic tokens: `--accent` (indigo), `--danger`, `--success`,
  `--overdue-bg/ink`, `--due-soon-bg/ink`. Add a token rather than a literal
  if a new semantic color is needed, and add it to **both** light and dark
  blocks plus the table in `docs/TECH.md`.
- Brand color changes must also propagate to: `index.html` `<meta theme-color>`,
  `vite.config.ts` PWA manifest, `capacitor.config.ts` `iconColor`, and
  `android/.../values/colors.xml`.
- `Sidebar.svelte`'s `.settings-panel` is a DOM **sibling** of the sidebar, not
  a descendant — it inherits page-level tokens, not the sidebar's dark
  overrides. Don't "fix" this by adding local palette overrides there.

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

`tests/db.test.ts` (Vitest, `vitest.config.ts`) covers `db.ts`'s pure/query
logic against `pouchdb-adapter-memory` — `tests/setup.ts` stubs the global
`PouchDB` (normally the UMD script) and a Node-global-localStorage conflict
(Node 20+'s own experimental `localStorage` shadows jsdom's; sidestepped
with a tiny in-memory polyfill rather than fighting over which one wins).
The `db` instance is a module-level singleton reused across the whole test
file, same as in the real app — tests get isolation from a `beforeEach` that
wipes every doc, not from a fresh instance. When adding a new `db.ts`
function with any non-trivial logic, add a test here before shipping —
this suite already caught two real bugs (broken conflict detection, an
incomplete conflict resolution) that had been silently shipping. UI
components have no test coverage yet; that's still manual/browser-preview
verification.

## Android / PWA gotchas (hard-won — read before touching)

- **Status bar**: targetSdk 36 is edge-to-edge; `StatusBar.setBackgroundColor()`
  is a hard no-op. The working approach is the `.status-bar-fill` strip in
  App.svelte + `env(safe-area-inset-top)` padding. Details in docs/TECH.md.
- **Notification icons** must be white silhouettes with transparency, or
  Android silently substitutes a generic triangle.
- **Service worker is web-only** (`main.ts` gates on `Capacitor.isNativePlatform()`).
  Never register it in the Android build — it would serve stale JS across APK updates.
- `position: fixed` full-screen elements bypass `.layout` and need their own
  `padding-top: env(safe-area-inset-top)`.
- Android launcher icon changes: uninstall the app before reinstalling, and
  Clean Project — the launcher caches icons aggressively.
- **Prefer an official `@capacitor/*` plugin's own mechanism over a custom
  native bridge event, when one exists.** A25 (ROADMAP.md) is the concrete
  lesson: the Quick Add widget used to forward its launch intent via a
  hand-rolled `getBridge().triggerJSEvent(...)` call in `MainActivity`,
  which fired before the WebView had a listener attached — losing the
  event on every cold start. `@capacitor/app`'s `getLaunchUrl()` +
  `appUrlOpen` listener does the same job correctly, because Capacitor's
  own Bridge already handles the timing/replay problem for its own
  plugins' events. Same idea applies broadly: check whether
  `@capacitor/local-notifications`, `@capacitor/app`, etc. already expose
  the native capability you're about to hand-roll (see A28's
  `checkExactNotificationSetting()`/`changeExactNotificationSetting()`
  for another example) before writing custom Java.

## Project status & direction

- **This repo has no git remote and is not on GitHub yet — deliberately.**
  The owner decided (2026-07-02) to go public only once the app is stable
  and security-audited. Do not add a remote, push, or suggest making the
  repo public without an explicit owner request. See DECISIONS.md.
- **Known pre-public-release blocker**: `offlog-app/src/config.ts` has a
  hardcoded CouchDB password and LAN IP, also present throughout git
  history. The owner's explicit decision: fix this **as the last step
  before any public release**, tracked in docs/ROADMAP.md's Track C — not
  urgent for day-to-day work, but never let a public-facing change (a
  landing page, a public repo push) go out before this is fixed.
- **Security is presently minimal by design** (no login, no encryption at
  rest, unencrypted CouchDB sync) — this is an accepted local-first
  tradeoff for now, not an oversight, but it is explicitly *not* audited
  or hardened yet. Treat any future feature that would expand the network
  attack surface with the same caution — mesh/device-to-device sync was
  considered and explicitly declined (2026-07-03) for exactly this reason
  among others; see DECISIONS.md.
- **Business model**: none, deliberately. Offlog is a personal tool the
  owner built for their own use and gives away as open source — it stays
  free forever with no paywall, no ads, and no monetization plan of any
  kind, not even an optional paid layer. Don't propose monetization ideas
  unless the owner raises it again. See DECISIONS.md.
- **Distribution target**: GitHub (source) + a website + Google Play.
  F-Droid and iOS are explicitly out of scope (owner decision, 2026-07-02) —
  don't propose either without the owner raising it first.

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

1. `npm run build` — must succeed with **zero warnings**
2. `npx tsc --noEmit -p .` — clean
3. `npm test` — clean
4. Verify visually in the browser preview (light **and** dark mode)
5. Bump version in **both** `package.json` and
   `android/app/build.gradle` (`versionCode` +1, `versionName`) —
   even though Android isn't being synced/built this release
6. Add a new entry to `docs/CHANGELOG.md` — the single source of truth for
   version history (do not duplicate it back into TECH.md or README.md)
7. Commit (`feat:`/`fix:` prefix, version in subject) and tag `vX.Y.Z`
8. **Never push, sync to Android, build the APK, or commit palette/visual
   changes without the owner's explicit confirmation/request**

## Style conventions

- Match existing code: compact CSS (one-line related properties), Svelte 5
  with `on:` event syntax, TypeScript everywhere, no CSS framework.
- Comments explain **constraints and why**, not what the next line does.
  The codebase has a strong tradition of comments documenting non-obvious
  invariants (see db.ts) — follow it.
- User-facing wording: statuses are called **"Status"**, never "Column"
  (internal field names still say `column_id` — that's a frozen legacy name).
- Dates in docs are absolute (e.g. "2026-07"), not relative.

## Maintenance routine (mandatory)
- Cadence: a maintenance pass **every 3 minor versions**, tracked in
  [MAINTENANCE.md](MAINTENANCE.md)'s tracker (process lives there too).
  Currently on an explicit owner-set schedule (2026-07-05): the v4.4.0
  pass ran (v4.4.2), next due **after v4.7.0**, then the every-3 cadence
  resumes from there (v4.10.0, v4.13.0, …) — also marked inline in
  docs/ROADMAP.md's sequencing table.
- Check the tracker **when bumping the version during a release**
  (checklist step 5) — not on every session start, that's wasted tokens.
  If the release just shipped matches "Next pass due," tell the owner:
  "A maintenance pass is due (last: vX, current: vY). Run it now? (see
  MAINTENANCE.md)" — and don't start one without confirmation.
- When a pass completes, update the tracker: Last pass = current
  version, Next pass due = the next scheduled point per the cadence above.
- Maintenance passes never add features and never touch doc schema,
  PouchDB/CouchDB sync logic, storage format, soft-delete semantics, or
  the positional-"done" rule without explicit owner approval.
