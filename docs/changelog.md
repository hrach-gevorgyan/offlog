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

## [6.11.0] — 2026-10-04

The phone app is rebuilt as its own shell (`src/lib/phone/`), replacing the
squeezed desktop layout on phone-sized screens; the Tauri window never sees
it. Alongside it: a readiness audit across both apps (accessibility, one
vocabulary, error voice, data-layer races), the source split into
`desktop/` and `shared/`, and the offlog.io website. No storage, sync or
backup format changed — older installs read, sync and restore as before.

### Added
- **Phone shell**: four tabs (Home, Today, Agenda, Search) with a + button;
  Home hero with what's left today and Overdue / Focus / Pinned tiles;
  full-screen task with value-only rows and bottom-sheet pickers; project
  screen on a band in its space colour with status pills, bulk select and
  filters; Settings as pushed pages; Recycle bin, History and Archived as
  phone screens; landscape layout with a tab rail.
- **One date and time picker** on the phone (chips, a full-width month,
  scroll wheels); the desktop date pop-up now matches it.
- **Keypad lock screen**, a first-launch welcome page, and a Reminders
  set-up card; Android asks for notification permission at the first
  reminder instead of at launch.
- **Rename a project or move it to another space** (phone menu, desktop
  sidebar).
- **Devices name themselves** from the Android device name or the Windows
  computer name, so History shows where a change came from.
- Android: predictive back at Home; a calmer quick-actions widget; splash
  in the hero colour.
- **offlog.io**: a static site in `site/`, published by
  `.github/workflows/pages.yml`, which stamps the latest release's version,
  date and file sizes into the download section daily
  (`.github/scripts/stamp-release.mjs`).

### Changed
- Muted palette: chroma ×0.8 on the accent, status and priority colours;
  icons, badges and installer art use the current brand colour (#575fca).
- One vocabulary on phone and desktop — Board (not Kanban), History,
  Recycle bin, Fields, Overdue (not Late) — one date style through `fmtDay`,
  and one error voice ("Could not … Please try again.").
- Code layout: desktop views in `src/lib/desktop/`, pieces both shells use in
  `src/lib/shared/`; `tests/layout.test.ts` fails if `phone/` or `shared/`
  imports from `desktop/`.
- Default reminder time is 10:00.

### Fixed
- Finished tasks were flagged overdue, and maintenance flagged finished
  tasks in archived projects.
- Data layer: the task cache could miss a write made mid-read (one shared
  change feed now); bulk actions reported success on partial failure;
  project restore dropped attachments; conflict resolution, reload ordering
  and sync/reminder races; a failed history write could fail the action.
- Resume restarts phone sync; reminders re-arm hourly; future-dated stamps
  are treated as due; Today/Tomorrow/Overdue roll over at local midnight; a
  backup dated in the future rotates out first.
- Desktop: duplicate adds, stranded archives, drop between pinned groups;
  task Save writes only the edited fields; Escape closes only the top layer
  and App Lock blocks overlays; the NyxDB sidecar is supervised and
  restarted after a crash; a failed network scan no longer shows Scanning
  forever.
- Quick add keeps possessives ("Tomorrow's plan") in the title; backslash
  escapes only at a word start.
- The in-app Reduce motion switch also zeroes CSS transitions.
- Accessibility audit, three rounds: contrast of greens, greys, off
  switches (`--switch-off`, 3.5:1 / 4.2:1), band text (4.5:1 on every space
  colour), status ticks (`--success-mark`, 3:1); dialogs announced, sheet
  headings, named navigation and inputs, 24px hit areas in the List.

### Security
- The pairing server can no longer be stalled by a slow client, and the App
  Lock recovery code comes from a CSPRNG.

### Performance
- Phone start-up loads about half a megabyte less JavaScript: PouchDB's
  own minified build, the note editor loaded on first use, and the desktop
  views and phone shell split into chunks neither platform loads for the
  other.

## [6.10.5] — 2026-09-29

A dependency release: every npm package, Rust crate and GitHub Action
moved to its latest stable version, which also closed a security
advisory in code the desktop app actually ships.

### Security
- **`rustls` RUSTSEC-2026-0285** (medium, TLS 1.3 handshake messages
  accepted across encryption-level boundaries). Reached the shipped
  Windows build through the updater's HTTPS client — 0.23.43 → 0.23.45.
- **`chacha20` 0.10.1 had been yanked** from crates.io. It backs `rand`,
  which generates the pairing codes — 0.10.1 → 0.10.2.

### Changed
- **Tauri 2.11 → 2.12**, core plus all nine plugins. The Rust
  `tauri-plugin-*` crates and the JS `@tauri-apps/*` packages now match
  version-for-version, and the `Cargo.toml` floors were raised to what
  is installed so the two halves can't drift apart again.
- **vitest 4 → 5**, and every other npm dependency to latest (Capacitor
  8.5.2, Vite 8.3, Svelte 5.57.1, CodeMirror, jsdom 30.1).
- `build.windows.staticVCRuntime` set explicitly in `tauri.conf.json`.
  tauri-cli 2.12 still sets the `STATIC_VCRUNTIME` env var that
  tauri-build 2.7 deprecates, so a release build warned on every run;
  the key is set to the same value that variable produced, and the exe
  still imports no VC++ runtime DLL.
- Three GitHub Actions pins advanced to their newest SHA: `setup-java`
  6.0.1, `codeql-action` 4.38.2, `action-gh-release` 3.0.3.
- Plain `typescript` deliberately stays on 6.x: svelte-check refuses to
  run unless TS 6 is installed beside TS 7, which already does the
  type-checking as `@typescript/native` via `--tsgo`.

### Fixed
- **CI could not build the Android APK.** `android-actions/setup-android`
  was pinned at v4.0.1, which installs an SDK `tools` package Google
  removed on 2026-09-17; every run since failed at that step. `release.yml`
  used the same pin, so the next tag would have failed to package
  Android. Now v4.0.4.
- `derive_key()` no longer fills a zero-initialised buffer, which CodeQL
  read as a hard-coded cryptographic value (alert #30). `pbkdf2_hmac_array`
  returns the key directly; output is byte-identical.

### Added
- A test for the notes editor. It was the one place the app hands a live
  CodeMirror instance real user text and had no coverage at all, so a
  CodeMirror bump could have broken note editing with every other gate
  still green.

## [6.10.4] — 2026-08-29

Maintenance pass 26, pulled forward by the just-shipped v6.10.3 crash: its
root cause (`each_key_duplicate`) survived two earlier fix releases, so
this pass's recurring-blind-spots sweep specifically hunted for the same
bug shape elsewhere — an unguarded async call in `onMount`/a timer — and
for the "flag set after an await" race that caused the mobile device-scan
UI flash reported separately this session.

### Fixed
- `discovery.ts`'s `scanForHosts()` awaited a dynamic
  `import('capacitor-zeroconf')` before setting `isScanning`/clearing
  `discoveredHosts` — a real await point even on a warm module cache, so
  Settings' "scan found nothing" state was briefly true right after
  tapping "Find my computer," flashing that warning before the scan had
  even started. Both stores are now set synchronously, before the import.
- Five more unguarded async call sites found by this pass's sweep, same
  shape as v6.10.3's root cause: `CardDetail.svelte`'s `onMount` (the
  app's most-used modal); `SettingsPanel.svelte`'s `startPcPairPoll()`,
  which calls `getDeviceLastSeen()` unguarded every 3s — the very
  function v6.10.3 fixed, from a second call site; `App.svelte`'s
  `listenForTrayEvents()`; `ListView.svelte`'s `onMount`; and
  `TimeTravelView.svelte`'s `load()`, which additionally left `loading`
  stuck `true` forever after any failed load, silently blocking every
  load after the first failure.

## [6.10.3] — 2026-08-29

The real fix for the Settings → Sync crash that persisted through
v6.10.1 and v6.10.2: both of those releases hardened async call sites
that could reject, but the actual crash was a Svelte `each_key_duplicate`
error thrown by `getDeviceLastSeen()` (`src/lib/db/core.ts`) — a device
that logged before `source_id` existed and again after it ended up as
two rows sharing one display name, and Svelte throws the instant a keyed
`{#each}` sees a duplicate key. Fixed by merging entries by display name
(newest write wins) after the identity-key grouping pass, with a
regression test reproducing the duplicate-name case.

### Fixed
- `each_key_duplicate` crash opening Settings → Sync — the actual root
  cause behind the "Something went wrong" crash reported after
  v6.10.0/.1/.2.
- CSP `frame-ancestors 'none'` removed from the `<meta>` tag in
  `vite.config.ts` — spec-only enforceable via an HTTP header, so it was
  a silent no-op that still logged a console warning on every load.
  Desktop's own header-based CSP already covers this via Tauri.
- Auto-backup writes into `$APPDATA/auto-backups` were silently failing
  on desktop: `fs:allow-write-text-file` grants the command but not a
  path, and no `fs:scope` entry existed for that folder. Added one
  narrowly scoped to `auto-backups` only.
- "Devices seen recently" — the "this device" pill's spacing/vertical
  alignment against the device name.

### Added
- Desktop now emits a `pairing-succeeded` Tauri event from `pairing.rs`
  the instant a phone completes the handshake, and shows an immediate
  success state in Settings instead of waiting on the next unrelated
  database poll to notice.

### Changed
- First-run onboarding (`NamePrompt.svelte`): the sync offer now comes
  after the quick-preferences step instead of before it. Previously,
  choosing "Set up sync" handed off straight to full Settings and
  silently skipped the preferences step that would otherwise have
  followed.

## [6.10.2] — 2026-08-28

v6.10.1's fix wasn't the whole story: the same "opened Settings" crash
recurred on a genuinely-updated v6.10.1 build. A full sweep of
`SettingsPanel.svelte` found three more instances of the identical
pattern — an unawaited async call fired from `onMount`/a reactive
statement with no `try/catch` anywhere in the chain.

### Fixed
- `loadBreakdown()` — fires from a bare `onMount` on **every** Settings
  category (not just Sync), and again on **every single** `subscribeDb()`
  change event for as long as the panel stays open. The most likely of the
  four to have been the actual repeat crash, given how often it fires
  during active sync.
- `loadStorage()` — `navigator.storage.estimate()` can reject in some
  WebView/sandboxed contexts; now falls back to the existing "Not
  available" state instead of an unhandled rejection.
- Both now surface `showError('Failed to load storage usage.')` on
  failure instead of the generic crash-net toast.

## [6.10.1] — 2026-08-28

A real crash from v6.10.0, caught live from the actual installed desktop
build within hours of release: opening Settings → Sync could hit an
unhandled promise rejection that spun into an uncaught-forever retry loop,
pegging the main thread until the renderer ran out of heap (reproduced
directly in a test: the failure path OOM'd a Node worker in ~5 minutes).

### Fixed
- `loadConflicts()` and `loadDeviceLastSeen()` in `SettingsPanel.svelte`
  both fire from a bare reactive statement the moment the Sync tab opens,
  with nothing awaiting or catching them. A real query failure became an
  unhandled rejection — the generic "Something went wrong" crash-net toast,
  with no specific message. Worse, `loadConflicts()`'s retry guard
  (`conflictList.length === 0`) never became false on failure, so it
  re-fired on every reactive tick, forever, entirely as microtasks with no
  macrotask in between — starving the event loop so completely that even a
  vitest test timeout never got a chance to fire before the process ran out
  of memory. Both now surface a specific `showError()` message, and
  `loadConflicts()` tracks which `conflictCount` it already attempted so a
  failure doesn't retry until the underlying conflict count actually
  changes.
- Desktop crashes now also write to `Offlog.log` (via
  `@tauri-apps/plugin-log`, `log:default` capability), not just the
  browser devtools console — this exact bug was undiagnosable from the log
  file alone before this fix.

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

---

[6.11.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.5...v6.11.0
[6.10.5]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.4...v6.10.5
[6.10.4]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.3...v6.10.4
[6.10.3]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.2...v6.10.3
[6.10.2]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.1...v6.10.2
[6.10.1]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.0...v6.10.1
[6.10.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.9.0...v6.10.0
[6.9.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.8.0...v6.9.0
[6.8.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.7.0...v6.8.0
[6.7.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.6.0...v6.7.0
