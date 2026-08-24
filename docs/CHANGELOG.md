# Changelog

All notable changes to Offlog are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**This is the maintainer record** — implementation detail, file names and
root causes. For what ships to users in plain language, see
[RELEASE_NOTES.md](RELEASE_NOTES.md); that file is what the GitHub Release
body is generated from.

The newest 10 releases are kept here in full. Older ones are compressed to
one line each in
[archive/changelog-archive.md](archive/changelog-archive.md). When this list
exceeds 10 releases, move the oldest into the archive.

---

## [6.5.0] — 2026-08-24

A hardening release: no new surface, a far stronger base under it.

### Added
- Kanban card menu now offers **Move to** statuses — the keyboard and touch
  path to a column change that previously existed only as drag-and-drop.
  Reuses `onCardListDrop`'s write path, so a menu move and a drag move are
  the same operation.
- `replication.test.ts` — PouchDB's real replicator between two databases:
  convergence, soft-delete propagation, attachment bytes, conflict creation
  and both resolutions, first-pair seed collision.
- `backupRestore.test.ts` — a real database through export → wipe → restore.
- `perfGuard.test.ts` — gates read-path cost by counting database
  round-trips, never wall-clock time.

### Changed
- **Tests 279 → 569.** Every component with real logic now has one. Each
  was mutation-verified; tests that survived their mutation were rewritten
  or deleted rather than kept for the count.
- **`db.ts` split** (2,191 lines) into a barrel over
  `db/{core,entities,sync,tags,stats,maintenance}.ts`, with all 107
  exported names preserved so no call site changed.
- **`SettingsPanel.svelte`** 2,056 → 1,530 lines into `settings/*`, and
  **`CardDetail.svelte`** 1,432 → 1,137 into `carddetail/*`. Both verified
  by fingerprinting the computed styles of every rendered element before
  and after.
- **Fully typed.** 63 `any` in the db layer down to 2 justified ones, and
  42 → 0 elsewhere, removing casts the typings never needed. The
  `row.doc._conflicts` invariant is now compiler-enforced rather than
  comment-enforced. Emitted JavaScript verified byte-identical across all
  53 build assets.
- `AgendaView` renamed from `DeadlinesView` to match the name used
  everywhere else.
- CI workflows now cancel superseded in-flight runs for the same ref.

### Fixed
- `SettingsPanel`'s `onMount` credential read had no `try/catch`, unlike
  `saveSettings`' guarded read of the same call — a secure-storage failure
  escaped as an unhandled rejection. This also made CI red while the suite
  printed "540 passed", since vitest exits non-zero on an unhandled error.
- A `:global(button)` rule reached into nested `CustomSelect` and
  `CalendarPicker` internals and restyled them, where the scoped original
  never had. Caught only by computed-style comparison — the DOM structure
  and element counts were identical.
- `analyzeImport()` counted `meta` and `tag_color` documents as skipped
  while `importJSON()` imported them, so the preview shown before a restore
  under-reported it.
- An `allDocs` row can carry no document (a deletion tombstone); reading
  `_id` off one threw mid-backup, so a single tombstone could take the
  whole Back up action down.
- `invokeTauri()` asserted Tauri's IPC global rather than rejecting
  off-Tauri, throwing synchronously past any caller's `.catch`.
- CodeQL's `java-kotlin` job configured its extractor before the JDK was
  installed and so never uploaded a fresh analysis, leaving stale alerts
  open.
- Two `svelte-ignore` directives suppressed warnings that no longer
  applied.

---

## [6.3.0] — 2026-07-31

The last feature release, and the hardening pass behind it.

### Added
- **Tray-resident desktop app.** Closing the window hides it instead of
  quitting; tray menu with Show / Quick Add / Settings / Start on login /
  Quit, and `Ctrl+Alt+O` from anywhere landing on Dashboard.
- **"Blocked by" task dependencies** (`TaskDoc.blocked_by`) — a real
  directional dependency, distinct from the non-directional `related`.
  Direct and transitive cycle detection, a done/not-done pill in
  CardDetail, a lock badge on Kanban cards, and Focus excluding still-
  blocked tasks outright.

### Fixed
- **Every backup containing an attachment was unrestorable.** Exports wrote
  attachment *stubs* with no bytes, and PouchDB rejects an entire
  `bulkDocs` batch on a `missing_stub` — so one attached photo silently
  turned each backup file into a brick reporting only "Import failed."
  Backups now inline attachment bytes; restores drop unresolvable stubs
  rather than failing wholesale, fall back to per-document writes when a
  batch is rejected, no longer filter out `meta`/`tag_color` documents, and
  normalize malformed documents instead of importing them.
- Automatic backups and both retention prunes only ran at app *start*, so a
  weeks-long tray-resident session silently stopped backing up while still
  reporting a recent timestamp. Now hourly.
- The live change feed had no `error` handler and never restarted, going
  permanently deaf after a sleep/resume.
- A sync burst fired one full reload *per document*; now debounced with
  last-writer-wins.
- `auto_compaction` was off, so deleting a 10 MB attachment freed no disk.
- Agenda never noticed midnight passing.
- A global-shortcut collision panicked the app on startup.
- A second launch forked a second NyxDB onto the same port and data
  directory.
- Reminders missed by more than an hour were deleted without ever firing;
  the window is now 24 hours.
- Removing or dragging a status column silently redefined done-ness
  project-wide with no warning.
- "Clear all" history had no confirmation.

### Security
- `npm audit` 2 advisories → 0. Clippy clean.

---

## [6.2.1] — 2026-07-31

Maintenance pass (18th run), pulled forward at owner request.

### Fixed
- `App.svelte`'s `handleUndo()` was the one call site missing this
  codebase's audited `try/catch` + `showError()` invariant — an undo
  failure surfaced nothing.

### Changed
- Deduped an identical `escapeHtml()` carried separately in
  `GlobalSearch.svelte` and `UpdateModal.svelte` into `utils.ts`.
- Fixed 14 stale `GOAL.md` / `IDEAS.md` references across 9 files, left
  over from an earlier documentation consolidation.

---

## [6.2.0] — 2026-07-31

### Added
- Custom recurrence intervals — every N days/weeks/months — plus a
  weekdays-only option. Both purely additive to `TaskDoc`.
- Custom-field filtering in `FilterBar`: a list of `{fieldId, value}`
  filters ANDed together, wired through List, Kanban and saved filters.
- Sortable custom-field columns in `ListView` (text/date/select via
  `localeCompare`, numbers numerically).
- Search now also matches attachment filenames.

### Changed
- CardDetail's Repeat & reminder section rewritten to a single select with
  no separate enable checkbox, tuned to fit one line at a real 375px width.
- Agenda month view: uniform fixed row heights instead of each week sizing
  to its busiest day, dots moved to each cell's top-right, a percentage
  side gutter, and the Today button anchored with a real `top`.

### Fixed
- A generic `label { flex-direction: column }` rule silently beat a
  higher-specificity class.
- A compact select trigger shrank its own dropdown panel, truncating "Not
  repeating".

---

## [6.1.0] — 2026-07-31

### Added
- **Agenda month view** — a real calendar grid with priority-coloured dots,
  title chips on wider viewports, and tap-a-day to see its tasks and add
  one with that due date prefilled.
- `skipRecurrence()` — jump a recurring task to its next occurrence
  ("Skip this one") without logging a completion or moving its column.

### Removed
- Week view. Its only real value — seeing the current week by day — is
  already covered by List's "This week" grouping plus Month's drill-in.

### Fixed
- The month grid stretched to fill leftover flex space, leaving a blank gap
  before the day panel.

---

## [6.0.1] — 2026-07-30

Maintenance pass (17th run), pulled forward right after v6.0.0.

### Removed
- `getRecentlyModifiedTasks()` — dead code, orphaned since the 5.9.0
  redesign removed the Sidebar "Recent" section it fed.

### Changed
- `GlobalSearch.svelte` re-declared its own match-type union instead of
  importing the already-exported `TaskSearchMatch` from `db.ts`. Deduped.

### Security
- `npm audit` 0 vulnerabilities. Build-output secret-leakage gate
  re-checked against a real `.env.local` — clean.

---

## [6.0.0] — 2026-07-30

### Added
- **File attachments.** Images, PDFs, spreadsheets or any file except
  HEIC/HEIF, capped at 10 MB per file and 10 per task. Images are
  downscaled to ~1600px and re-encoded to JPEG client-side before saving.
  Bytes live in PouchDB's native `_attachments` on the task document, so
  attachments ride the existing sync with no new code.
- **Tag colour override** — a swatch picker in Settings → Organize, with an
  "Auto" reset back to the deterministic hash colour.
- Global Search now also matches checklist item text, and shows *why* a
  result matched when the title alone doesn't contain the query.

### Fixed
- Monthly recurrence overflowed past shorter months — a task due Jan 31
  rolled to Mar 3 instead of Feb 28/29. `advanceDate()` now clamps to the
  target month's real last day. DST shifting and long-offline-gap
  completion were audited and confirmed already correct.
- The mobile sidebar could be collapsed into the desktop-only icon rail.

---

## [5.9.0] — 2026-07-29

Sidebar and CardDetail visual redesign.

### Added
- Collapsible and resizable sidebar.

### Changed
- CardDetail's optional fields (Repeat/Reminder, Checklist, Custom Fields,
  Related, Notes) consolidated under one manually-opened **Extras** panel
  instead of scattered always-visible blocks.
- Sidebar gains an icon-only footer row shared between collapsed and
  expanded modes; sync status is shown by the icon's own colour rather than
  a separate dot and badge, and clicking it opens Settings' Sync category
  instead of triggering a sync.
- Active-state highlighting unified and toned down across nav, space and
  project rows.

### Removed
- The Recent quick-resume section and the per-space project-count badge.

### Fixed
- `CalendarPicker`'s popover was clipped inside CardDetail's new scrollable
  modal; now `position: fixed` with measured coordinates.
- Dashboard, Focus and Agenda never cleared `activeProjectId`, so the
  sidebar kept highlighting the last-open project while viewing them.

---

## [5.8.3] — 2026-07-28

Maintenance pass (16th run).

### Fixed
- `fireTauriNotification()` and `catchUpTauri()`'s stale-reminder branch
  both silently swallowed `updateTask()` failures via a bare
  `.catch(() => {})` — the same bug class behind an earlier rev-conflict
  race and a flaky test. The Tauri path never received the fix the web path
  already had.
- `TaskHistoryPanel.svelte` carried hand-copied duplicates of
  `logFormat.ts`'s helpers, which had already drifted: a missing rename
  case, and a missing no-op filter that let a false "Checklist updated"
  appear. Now imports the shared logic.

### Changed
- Removed `export` from 6 module-internal symbols, each hand-verified
  rather than trusted from tooling output.

---

## [5.8.2] — 2026-07-28

### Changed
- Monthly Dependabot batch, all merged after green CI: `jsdom`
  29.1.1 → 30.0.0, `svelte-check` 4.7.3 → 4.7.4, `@types/node`
  26.1.1 → 26.1.2, `svelte` 5.56.7 → 5.56.8, `mdns-sd` 0.20.2 → 0.20.3,
  `actions/cache` 4 → 6. No functional changes.

---

[6.5.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.3.0...v6.5.0
[6.3.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.2.1...v6.3.0
[6.2.1]: https://github.com/hrach-gevorgyan/offlog/compare/v6.2.0...v6.2.1
[6.2.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.1.0...v6.2.0
[6.1.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.0.1...v6.1.0
[6.0.1]: https://github.com/hrach-gevorgyan/offlog/compare/v6.0.0...v6.0.1
[6.0.0]: https://github.com/hrach-gevorgyan/offlog/compare/v5.9.0...v6.0.0
[5.9.0]: https://github.com/hrach-gevorgyan/offlog/compare/v5.8.3...v5.9.0
[5.8.3]: https://github.com/hrach-gevorgyan/offlog/compare/v5.8.2...v5.8.3
[5.8.2]: https://github.com/hrach-gevorgyan/offlog/compare/v5.8.1...v5.8.2
