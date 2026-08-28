# Changelog

All notable changes to Offlog are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**This is the maintainer record** — implementation detail, file names and
root causes. For what ships to users in plain language, see
[release-notes.md](release-notes.md); that file is what the GitHub Release
body is generated from.

The newest 10 releases are kept here in full. Older ones are compressed to
one line each in
[archive/history.md](archive/history.md). When this list
exceeds 10 releases, move the oldest into the archive.

---

## [6.10.0] — 2026-08-28

A massive, multi-agent human/product-usability audit across every app
surface (18 dimensions, adversarially verified) drove most of this release:
23 confirmed findings fixed, from a stuck-forever search spinner to a
misleading data-loss confirm dialog. The largest single change reverses
Attachments/Related/Blocked-by from immediate-write to batched-into-Save,
matching every other field on the card.

### Added
- `getCustomFieldUsageCount()` — the custom-field delete confirm now states
  how many tasks would lose their value, same as tag delete already did.
- A real desktop notification-permission check
  (`check_desktop_notification_setting`, via `ToastNotificationManager`) —
  Settings no longer claims reminders are "Enabled" when Windows has
  actually blocked Offlog's toasts.

### Changed
- **Attachments, Related, and Blocked-by are batched into Save**, not
  immediate-write. Picking a file or linking a task now only edits the
  card locally; Cancel/Escape discards it like every other field, and Save
  replays the diff as real writes. A blocked-by cycle is now caught at
  Save time instead of at pick time.
- The 5 stacked Settings mini-modals (Connect a device, Resolve conflicts,
  Maintenance, Restore from backup, Save your recovery code) now trap
  keyboard focus and carry `role="dialog"`; `focusTrap.ts` stops
  propagation on the Tab it handles so a nested trap can't leak to the one
  behind it.
- Notification-permission functions (`requestPermission`,
  `checkExactAlarmPermission`, `requestExactAlarmPermission`) now catch
  their own plugin-call rejections instead of leaving every call site
  responsible for it.
- Restore-from-backup's preview now says explicitly that it isn't a full
  revert — anything created, changed, or deleted since the backup stays as
  it is.
- The PC-side pairing code now visibly expires after 5 minutes instead of
  sitting there dead with no cue once its real TTL passes.
- Time Travel's entries now sit inside a real `role="list"` with a
  labeled count, instead of orphan `role="listitem"`s with no list
  ancestor.

### Fixed
- A search failure left the spinner running forever with no error and no
  way out — now caught and surfaced.
- Custom field delete claimed values were "kept but hidden"; the code
  actually erased them from every task. Copy (and a stale code comment)
  now say what really happens.
- Closing a card any way but Save silently discarded every edit; some
  fields saved immediately while others didn't, with no warning either
  way — see batching change above.
- Archiving the currently-open project left the board silently blank
  instead of clearing `activeProjectId`.
- Renaming a tag onto an existing name silently merged the two on blur,
  less guarded than plain delete.
- The activity log rendered raw `blocked_by changed` instead of a human
  label.
- Android hardware/gesture Back exited the app instead of closing the
  open sidebar drawer.
- PIN-lock shake and checklist-check-pop animations used literal
  durations, so Reduce Motion never reached them.
- Storage-full attachment failures looked like any other generic error,
  with "try again" as actively wrong advice.
- Kanban's quick-add-card and + Status forms silently closed on an empty
  submit, as if Cancel had been clicked — they now just stay open.
- A corrupt/invalid backup file surfaced a raw `JSON.parse` `SyntaxError`
  instead of a plain-language message; "Choose backup file" also stayed
  clickable while a previous import was still running.
- Various accessibility gaps: collapsed sidebar nav buttons and Kanban
  column archive/remove buttons had no `aria-label`; GlobalSearch's arrow
  navigation didn't scroll the selection into view or announce it via
  `aria-activedescendant`.
- 25th maintenance pass: a handful of dead/unused exports, a `MaintStatus`
  naming collision between two modules, a stale `windows`-crate comment.

## [6.9.0] — 2026-08-28

Notes gets real live markdown; Card Detail's tag colors, spacing, and
recurrence controls get a round of retouches; and a sixth feature audit —
the Settings menu, walked live rather than read as code — turns up an
Escape-key bug that could lose a PIN mid-entry, a footer that lied about
what Cancel/Save did, and a long tail of smaller UX gaps across Sync,
Notifications, App Lock, and Backup & Storage.

### Added
- **Notes renders markdown live, in one pane**, instead of a Write/Preview
  tab toggle. A CodeMirror 6 editor (`MarkdownEditor.svelte`,
  `markdownLiveView.ts`) decorates bold/italic/strikethrough/headings/code/
  blockquotes/lists/links/rules inline as you type — formatting marks (`**`,
  `#`, `` ` ``) stay visible but dimmed, never hidden. Replaces the earlier
  `marked`+`DOMPurify` render-on-preview approach; both dependencies are
  gone, since there's no `{@html}` sink left to sanitize for.
- **Tag chip colors expanded to a 24-color palette**, hue-ordered, at 45%
  tint (`var(--radius-sm)` chips, not a full pill — matches Notion/GitHub's
  small-rounded-rectangle convention rather than a Material filter-chip
  shape). `ensureFreshTagColor()` now avoids handing a new tag a color
  that's already in heavy use, checking both persisted tags and the current
  card's own not-yet-saved ones.
- **Repeat & Reminder's interval collapses behind "Customize"** for the
  ordinary every-1 case — reads as a plain sentence ("every week") instead
  of an always-visible number input — with a next-occurrence preview
  computed through the same `advanceDate()` math a real save uses, so it
  can't drift from what saving actually produces. Customize/Weekdays/Skip
  now share one pill design instead of a mix of a bare text link and two
  differently-styled buttons.
- **The EXTRAS summary balances onto two lines** (`balanceIntoTwoLines()`)
  instead of wrapping naively wherever the text happens to run out of room.
- **Settings' "Reset test data"** (debug-only) now confirms through the
  app's own `confirmAction()`, danger-styled, instead of the browser's
  native `confirm()` — and its button gets the same `var(--danger)`
  treatment as every other irreversible-delete control in the app, instead
  of looking like "Check for updates."
- **Sync's connection status visually distinguishes "connected" from
  "nothing configured yet"** — the `ok` tone was already computed but never
  rendered differently from `muted` until now.
- **Restore's preview shows which file you actually picked** — name and
  modified time, not just aggregate counts — since the app itself produces
  several similarly-named backups on one device (daily auto-backups, manual
  full/per-project exports).
- Pairing a device now reports "couldn't reach that computer" for a network
  failure instead of a raw `fetch()` `TypeError`; an Android scan that
  finds nothing says so instead of the button silently reverting; "Devices
  seen recently" and the conflict modal both mark which entry is this
  device; PIN setup filters non-digit input live and shows "Doesn't match
  yet" before Save is clicked; the Sync tab signposts where Advanced's
  manual server fields live; Notifications' disclosure sections slide
  open/closed like every other one in the app instead of snapping.

### Fixed
- **Escape during PIN entry closed all of Settings**, discarding whatever
  was typed, instead of backing out of just that step.
  `onWindowKeydown` special-cased every other in-panel sub-flow (connect,
  conflicts, maintenance, import preview) but not `showPinForm` or
  `pinGateMode`. `ConfirmPinGate`'s own Escape handler needed
  `stopPropagation()` too — without it, the same keystroke both correctly
  cancelled the gate *and* reached the window handler and closed Settings,
  since the gate's own `dispatch('cancel')` had already nulled
  `pinGateMode` before the event finished bubbling. Covered by a
  regression test.
- **The footer Cancel/Save buttons were live on every Settings tab, but
  only ever meant something on one.** Verified by reproduction: toggling
  Theme and High Contrast, then clicking Cancel, left both changes in
  place — every tab but Advanced-with-Sync-on already writes its controls
  straight to their store on click. A first fix replaced the footer with a
  single "Close" everywhere else; reverted after real user feedback that a
  missing Save button reads as "did my change even take?", not as
  "nothing to save here." Save is shown on every tab again; Cancel stays
  Advanced-only, where there's actually something to discard.

### Changed
- `CustomSelect` gained an optional per-option color dot (used by Priority).
- `advanceDate()` moved from `db/entities.ts` to `utils.ts` — a pure
  function with no DB access, now shared by the real recurrence advance and
  the Repeat block's preview instead of each keeping its own copy.
- jsdom test noise silenced: `HTMLCanvasElement.prototype.getContext` and
  `HTMLAnchorElement.prototype.click` (the download trigger) are stubbed in
  `tests/setup.ts`, matching its existing animate/matchMedia/scrollIntoView
  pattern — no more "Not implemented" lines in every test run.
- A long tail of Settings copy/consistency fixes, all owner-reviewed and
  selected from a ranked UX audit rather than applied wholesale: Organize's
  content-free "Manage" section title became "Workspace" with a hint under
  every row (not just Custom Fields); the quiet-hours toggle reads "Delay
  reminders until quiet hours end" instead of "Queue…"; the healthy-storage
  headline dropped its jokey tone; the Connect-a-device modal's primary
  actions moved into a pinned footer, matching every other modal-within-
  Settings, and desktop pairing success gets the same explicit "Done" close
  Android's already had.

---

## [6.8.0] — 2026-08-26

Five feature audits — sync conflicts, the trash/undo/retention lifecycle,
attachments, recurrence, and what only breaks after weeks. Each walked the
feature as a user rather than as a test suite. Twelve defects, one of them
data-losing on every shipping platform.

### Added
- **The conflict screen shows what it is asking you to choose between.** It
  rendered a device name and a timestamp per side; `getConflicts()` already
  held both documents in full and the UI threw everything but the metadata
  away. Every differing field is now listed per version, with bookkeeping
  (`_rev`, `updated_at`, `source`) excluded and absent-vs-empty not counted
  as a difference. Statuses read as a chain, checklists as items and counts,
  custom values by field name; related and blocked-by show a count.
- **Every competing version is offered, not just the first.**
  `resolveConflict()` removes them all, so on a three-way conflict one click
  destroyed a version the screen never displayed. Keeping one now confirms,
  naming how many go.
- **The newest version is marked**, and says how much that is worth. PouchDB
  picks its winner by revision hash rather than time, so the version shown as
  current is regularly the older edit. Timestamps are UTC (`toISOString()`),
  pinned by a test, so the comparison is timezone-proof — but they are each
  device's own clock, and the tooltip says so.
- **Auto-backup size is reported in Settings**, beside the database
  breakdown. Each backup is a full snapshot with attachments inlined and
  seven are kept, so the folder grows with attachment size: 5.7 MB of
  attachments measured as 43 MB across the seven, none of it counted by the
  IndexedDB estimate the headline reads. Silent where there are no backups
  rather than printing a confident zero.
- **Removing an attachment confirms.** It is the only irreversible delete on
  a card — a task goes to Recycle with an undo toast behind it.

### Fixed
- **Attachments could not be opened on either shipping platform.**
  `openAttachment()` handed a blob URL to an `<a download>`, which works in a
  browser and nowhere else: neither Capacitor's Android WebView nor Tauri's
  WebView2 has a download manager to receive it. Files could be attached,
  stored, synced and backed up on Android and Windows, and never opened
  again. Android now writes to cache and offers the share sheet, desktop
  opens a save dialog, the browser keeps the blob download.
  `settings/helpers.ts`'s `downloadBlob()` could not be reused as-is, being
  UTF-8 text only.
- **An attachment's filename reached the filesystem unchecked.** That name
  rides on the task doc, so it arrives over sync or from a hand-edited
  backup; `"../../evil.txt"` would have been taken literally by the new write
  paths. `safeFileName()` strips directory components and leading dots,
  replaces control characters and the ones Windows refuses, and falls back to
  `attachment`. Each guard is mutation-verified.
- **Un-archiving a project handed back an empty project.**
  `archiveProject()` cascaded onto every open task; `unarchiveProject()`
  flipped only the project's own flag. The cascade now marks each task
  `archivedWithProject` and un-archiving reverses exactly that set —
  restoring everything archived would resurrect tasks archived individually.
  Optional field, so old docs stay valid; tasks hidden by a pre-6.8.0 cascade
  cannot be identified and stay archived.
- **Restoring from Recycle could hand back an invisible task.**
  `removeColumn()` moves the tasks it can see, and a trashed task is not one
  of them, so a task could come back onto a status that no longer existed —
  rendered by no view. It now lands on the project's first status.
- **Restore-all aborted at the first failure**, leaving every task after it
  in Recycle while reporting only that "some" had failed. Each is attempted
  now, and the count reported. A task whose project was deleted can never be
  restored, and no longer offers "Please try again".
- **Restoring into an archived project** comes back archived alongside it,
  instead of sitting as an integrity issue until a maintenance run archives
  it anyway.
- **A rejected file went unmentioned if a later one attached.** The rejection
  message lived in one shared variable that every file in the batch
  overwrote. Each file now reports its own outcome, and a partial success
  leads with the count.
- **The x that deletes a file was 12×14** — `.checklist-remove`, shared by
  checklist items, related links, blocked-by links and attachments, under
  WCAG 2.2 SC 2.5.8's 24px minimum. Only the hit box grew; rows stay 19px.
- **The task cache could keep a stale copy of a synced-in edit.**
  `fullReload()` read the change sequence and the documents concurrently. The
  sequence is where the next catch-up resumes, so a write landing between the
  two was counted by the sequence and missing from the rows, and the catch-up
  resumed past it. Read first now; the worst case is replaying a change the
  rows already have.
- **Maintenance and the sync badge disagreed about conflicts.**
  `checkIntegrity()` listed entity prefixes, so a conflict on
  `meta:custom_fields` was counted by the badge and fixable on the
  Resolve-conflicts screen but never reported by maintenance. Both read the
  same range now.
- Two `db` mocks were incomplete and hid real gaps: `SettingsPanel`'s missing
  `getAutoBackupUsage()` had vitest exiting 1 on seven unhandled rejections
  while printing "608 passed", and `CardDetail`'s missing attachment surface
  left `ATTACHMENT_MAX_PER_TASK` undefined, so the per-task cap silently
  never fired in tests.

### Changed
- **Release CI runs the tests.** `release.yml` verified the tag matched the
  version, then built and published; `ci.yml` only fires on pushes to main,
  so a tag cut from a commit CI never ran would publish regardless. A
  `verify` job now gates both builds on `version:check`, the type-check and
  the tests, scoped to `contents: read`.
- **`roadmap.md` holds only open work**, and its header names where
  everything else belongs. Mesh sync, scale metrics and three parked maybes
  moved out. All five audits are closed, so "Ours to do" is empty.
- 24th maintenance pass recorded; five audit outcomes recorded in
  `decisions.md`, including what will deliberately not be built.

---

## [6.7.0] — 2026-08-26

Two threads: motion, which had never actually run, and the maintenance tool,
which was slow, vague, and in one case destructive.

### Added
- **Maintenance asks before repairing, and says what it found.** The confirm
  groups issues in plain language ("8 tasks on a status that no longer
  exists") and marks the ones it will not touch. The list stays in the modal
  afterwards. `MaintOptions.confirmRepair` is a callback so `db/` still never
  imports UI.
- **Maintenance can be cancelled**, polled between steps via
  `MaintOptions.isCancelled`. A step already in flight finishes — neither a
  `bulkDocs` nor a compaction can be interrupted safely.
- **Four integrity checks that did not exist**: values stranded by a deleted
  custom field, `related`/`blocked_by` ids left dangling by the 3-month hard
  prune, active tasks inside an archived project, and `attachments[]`
  metadata disagreeing with PouchDB's own `_attachments`. All repair safely.
- **The compaction step reports what it actually freed**, from
  `navigator.storage.estimate()` before and after, instead of asserting it
  freed something.
- **`scripts/seed-full.js`** — every writable feature at volume, to exact
  counts, with a fixed-seed PRNG so two runs are comparable.

### Fixed
- **Conflicts are no longer auto-resolved.** `repairDatabase()` deleted every
  losing revision and kept whichever one PouchDB calls the winner —
  deterministic, but arbitrary, not "most recent". Editing the same task on
  two devices and running maintenance silently discarded one edit.
  `scanConflicts()` already auto-settles the only safe case; whatever remains
  is a genuine disagreement, and Settings → Sync → Resolve conflicts is where
  it gets decided.
- **Deleting a custom field stranded every value under it.** `custom_values`
  is keyed by field id, so `removeCustomFieldDef()` rewriting the definition
  list left the values on every task — invisible, never cleaned, carried in
  every sync payload. It now sweeps them in one `bulkDocs`, trashed tasks
  included.
- **Repairing an orphaned task claimed success without fixing it.** With no
  project in Unsorted the fallback archived the task and left `project_id`
  dangling; `checkIntegrity()` does not skip archived tasks, so it returned
  as an orphan every run while repair reported "Fixed 1" each time.
- **No modal or panel transition had ever run.** Svelte does not run intro
  transitions on a component's own root elements when the component itself is
  being created, and every panel is created by a parent's `{#if}`. Gating the
  markup on a flag set in `onMount()` makes them the product of an update
  inside the component, which is what Svelte animates.
- **Closes were destroyed before they could animate.** A parent's `{#if}`
  removed each panel the instant it dispatched `close`. Components now delay
  only that dispatch, by `exitMs`; `modalStack` is untouched, so back-button
  semantics are unchanged.
- **Hover was invisible on Kanban columns in light mode** — `--hover` was
  `#eceef2` and so is `--col-bg`. Hover and pressed are now derived state
  layers (`color-mix` of the element's own ink), declared on `body` so theme
  classes can reach them.
- **The sidebar teleported its contents while its width animated**, then
  flickered once crossfaded — a keyframe restarts from its 0% frame on the
  element that mounts mid-swap. It is a transition now, with the width driven
  off a separate flag so the box still moves on the click.
- **Six controls were below WCAG 2.2's 24px minimum target size** (2.5.8),
  the tag remove `×` worst at 8×14. Only the hit boxes grew.
- **Views overlapped during a switch** — `.main` is a CSS grid so both
  occupy one cell instead of splitting a flex column.

### Changed
- **Motion rebuilt on Material 3**: entering decelerates, leaving
  accelerates, exits ≈0.75x, duration scales with travel. Durations and
  curves are tokens in `app.css`, mirrored in `motion.ts`.
  [docs/motion.md](motion.md) is the rulebook.
- **Compaction runs once, ever.** PouchDB's `_compact` walks the changes feed
  from seq 0 and fires one `compactDocument()` per row concurrently, blocking
  the UI for minutes; `auto_compaction` means there is nothing for a second
  pass to collect. Databases predating the flag get one real pass.
- **A maintenance run scans once, not two or three times.**
  `repairDatabase()` accepts the issue list the caller already computed, and
  `checkIntegrity()` scans by id prefix rather than the whole database — the
  old scan loaded every `log:` doc and counted them as "items checked".
- **`pruneOldLogs()` range-scans to the cutoff.** Log ids are time-ordered,
  so the cutoff is an endkey and no bodies are loaded.

---

## [6.6.0] — 2026-08-24

Everything here came out of two investigations: a mesh-sync design pass that
was closed without shipping, and a scale benchmark that turned out to be
measuring nothing.

### Changed
- **Editing a task no longer costs the next screen a full rebuild.** Every
  task write calls `invalidateTaskCache()`, which dropped the whole cache, so
  the next read re-read every task. Against 20,000 tasks a read straight
  after one edit cost 138.7ms versus 1.1ms warm. Invalidation now marks the
  cache stale and the next read catches up from the change feed, falling back
  to a full reload past 500 pending changes. **138.7ms → 5.3ms at 20,000
  tasks; 39.6ms → 1.6ms at 5,000.** No call site changed and the
  "invalidate on every task write path" invariant is untouched — the
  guarantee is identical, only the cost moved.

### Fixed
- `clearLocalSeedBeforeFirstPair()` treated "zero tasks" as "untouched" and
  deleted the four fixed seed documents on first pair. Setting up spaces and
  projects before adding any task is a normal way to start, and those ids are
  the spaces a new user renames first, so a rename plus no tasks lost real
  work. Now also requires no user-created space or project, and every seed
  doc still matching its original content — decided by content, not revision
  number, since `wipeAndReseed()` leaves a pristine seed at generation 3+.
- `scanConflicts()` ran an unbounded `allDocs` with `include_docs` on every
  sync settle, loading six months of `log:` documents that cannot conflict.
- "Cannot reach sync server — check you're on the same network" appeared
  while the user *was* on the right network: the offline branch only fires
  when `navigator.onLine` is false, which it is not when the host PC is
  simply switched off.
- `version.js` escaped only `.` before interpolating the version into a
  `RegExp` (CodeQL `js/incomplete-sanitization`). It builds no dynamic regex
  at all now.
- The Android status-bar strip took its own colour rather than the page
  background.

### Removed
- Mesh sync, closed after investigation. A spike against two real NyxDB
  instances proved the protocol side works and that NyxDB needs no change;
  Android closed it on four independent grounds, recorded in decisions.md so
  it is not reopened on a hunch.

### Internal
- **`npm run bench` had never measured a database.** vitest does not run
  `beforeAll` under `vitest bench`, so `perf.bench.ts`'s 3,000-task fixture
  never existed — confirmed with a probe that saw 0 documents. Separately,
  the task cache served every iteration, reporting 0.024ms for work costing
  20ms cold. Both fixed; real numbers at 3,000 tasks are 20.2ms cold and
  0.31ms warm for `getDashboardData`.
- `scale.bench.ts` sweeps 1k/5k/20k tasks with three logs each, covering the
  paths `perf.bench.ts` left out. Growth is linear (4.0–4.1× for 4× data)
  across every path measured.
- `db-metrics.js` reports what a real database actually contains — counts by
  type, size percentiles, attachment bytes, revision depth — as aggregates
  only.

---

## [6.5.2] — 2026-08-24

### Changed
- **The Android status bar strip follows the theme.** It was pinned dark in
  both themes since v4.29.0, which split it off from `--sidebar-bg` when
  the sidebar became theme-aware. It now matches `--sidebar-bg` again in
  both themes, and `theme.ts` flips the native icon style with it —
  Style.Light in light mode, Style.Dark in dark — so the icons never blend
  into their own background. The browser `theme-color` follows the same
  two values, set pre-paint in `theme-init.js` so mobile browser chrome
  cannot flash the wrong colour.

### Fixed
- Settings' Software updates block spaced its version row at half the
  rhythm of every other row. A `compact-row` negative margin, used in
  exactly that one place, subtracted from the group gap — and that row is
  the tallest in the group, so the tightest gap landed where it should
  have been loosest. Rule removed with its only caller.
- The update dialog split a wrapped sentence from the release notes into
  one paragraph per source line. `renderNotes()` folded wrapped **bullets**
  into a single `<li>` but emitted a `<p>` per line for prose, which no
  entry had exercised until 6.5.1 wrote its summary as flowing text.
  Covered by two mutation-verified tests.
- CodeQL's Java/Kotlin analysis failed on every run with a warm Gradle
  build cache: 152 compile tasks returned `FROM-CACHE`, so `javac` never
  ran and the extractor saw no source. That job now compiles with
  `--no-build-cache`; the dependency cache still applies, and release
  builds keep task-output reuse.

---

## [6.5.1] — 2026-08-24

Tooling and documentation only. One user-visible string corrected; the app
itself is unchanged.

### Fixed
- The Android widget picker described the widget as offering "your agenda
  brief", which it has never rendered — it is three buttons and no data.
- `styles.xml` documented the splash mark at 92% of canvas;
  `generate-splash.cjs` has used 78% since the value was corrected.
- The cleartext-HTTP / no-TLS-on-LAN tradeoff was recorded only in a
  `QUESTIONS.md` that no longer exists, leaving an accepted security
  decision with no rationale anywhere. Now a decisions.md entry.
- 37 references across docs, tests, scripts and workflow config still
  pointed at pre-rename uppercase filenames or at roadmap IDs that had
  moved to the archive.

### Changed
- **Versioning is enforced, not remembered.** MAJOR now means only that an
  older install can no longer read, sync or restore; features are never
  MAJOR. `scripts/version.js` writes all three version sources at once and
  derives `versionCode` (`MAJOR*10000 + MINOR*100 + PATCH`); `version:check`
  runs in CI, and `release.yml` refuses a tag that disagrees with it.
- CodeQL's Java/Kotlin analysis moved to its own workflow, scoped to
  Android-affecting paths, compiling rather than assembling, with Gradle
  cached and the Capacitor plugin modules built in parallel — 4m47s to
  3m38s. `release.yml` restores the same cache.
- Dependabot no longer proposes TypeScript 7 over `svelte-check`'s peer
  range; TypeScript 7 is already in use as `@typescript/native`.
- Documentation rewritten end to end — 29% smaller, with CLAUDE.md down 56%
  to invariants and gotchas only.

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

---

[6.10.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.9.0...v6.10.0
[6.9.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.8.0...v6.9.0
[6.8.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.7.0...v6.8.0
[6.7.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.6.0...v6.7.0
[6.6.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.5.2...v6.6.0
[6.5.2]: https://github.com/hrach-gevorgyan/offlog/compare/v6.5.1...v6.5.2
[6.5.1]: https://github.com/hrach-gevorgyan/offlog/compare/v6.5.0...v6.5.1
[6.5.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.3.0...v6.5.0
[6.3.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.2.1...v6.3.0
[6.2.1]: https://github.com/hrach-gevorgyan/offlog/compare/v6.2.0...v6.2.1
