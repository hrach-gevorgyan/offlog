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

## [7.0.1] — 2026-11-03

A dependency and security release: every shipped Rust and npm package past
its open advisories, the rest of the tree on its newest compatible version,
and release signing locked to tagged builds. No storage, sync or backup
format changed.

### Security
- Desktop TLS (the updater and the sync host's `ureq`): rustls 0.23.46
  (RUSTSEC-2026-0346 to 0349), rustls-webpki 0.103.16, webpki-roots and
  webpki-root-certs 1.0.11 (CVE-2026-111943, distrusted emSign
  intermediates).
- ctutils 0.4.7 under `aes-gcm`, `pbkdf2` and `sha2`, the sync key's crypto
  (RUSTSEC-2026-0385, non-constant-time comparisons).
- tauri-plugin-updater 2.14.1 brings zip 9 (RUSTSEC-2026-0367 to 0369,
  extraction through symlinks). Updates were already signature-checked before
  anything was unzipped.
- tokio 1.54.1 (RUSTSEC-2026-0386, Unix only).
- Build and test tooling only, nothing shipped: vite 8.3.5, vitest 5.1.0,
  undici 8.12.3 through jsdom, and glob 14 / minimatch 11 forced under
  `@capacitor/cli` with npm `overrides` (GHSA-3g3m-2fjr-6pw4,
  GHSA-g3hv-75wg-m249) until its rimraf moves on.

### Changed
- Tauri 2.12.5 with its plugins (autostart 2.7.0, updater 2.14.1),
  mdns-sd 0.21.7, ureq 3.5.0; Capacitor 8.6.0 with its plugins (filesystem
  8.1.5, app 8.1.2, share, status bar), Svelte 5.57.3, CodeMirror patches.
  `deepmerge` (GHSA-gcqx-w48m-w2h4, low, build-time config merge only) has no
  fixed version yet.
- `release.yml`: the two signing jobs read their keys from a `release`
  environment that only `v*` tags reach, and fail when a key is missing
  instead of shipping a debug-signed APK or an unsigned update.
- GitHub Actions pins bumped (checkout, setup-node, setup-java, artifacts,
  CodeQL 4.39.1).
- Repository: `ACCESSIBILITY.md`; the new-issue page offers Discussions and
  private security advisories; the funding link is gone.

### Fixed
- Two unused imports in `desktop/Sidebar.svelte` that svelte-check 4.7.7
  reports as errors. No runtime change.

## [7.0.0] — 2026-10-14

End-to-end encrypted sync between the PC and its phones, the fixes from a
two-platform audit and the 31st maintenance pass, and one visual language on
every screen. **Major** because an older install can no longer sync: the PC
moves to an encrypted database under a new password, and pairing turns away
an app too old to read the key. Each phone updates and pairs again, once.
Backups stay readable both ways.

### Added
- **End-to-end encrypted sync** with the PC: a sync key (AES-256-GCM) made on
  the PC and handed over in pairing; `db/encryptedFetch.ts` seals what leaves
  for the server and opens what comes back, so NyxDB stores only sealed
  documents, attachments and checkpoints. The readable `offlog` database is
  pulled in and deleted after the first settled sync (`retirePlainServer`).
  Pairing protocol `v: 2`; an older app gets 426 and the PC says so.
- Desktop recovers when NyxDB can't open its store: the folder is set aside
  (newest two kept), sync starts fresh and Settings → Sync says where it went.
- Saved List/Board filters sync, one `meta:filter:<project>:<name>` doc each
  (`shared/savedFilters.ts`; a deletion stays as `deleted: true`); each
  device's old localStorage copy moves in once.
- Search finds archived tasks (last, marked) and they restore from the task.
- Daily safety copies are listed in Backup settings and open in the restore
  preview (`listAutoBackups`, `readAutoBackup`; Tauri `fs:allow-read-text-file`
  scoped to auto-backups).
- App lock "Immediately". Phone: steps edit in place and reorder by
  hold-and-drag; List selection can archive or delete with one Undo; quick add
  reads day-first dates ("25 dec") and its reminder starts on the due day.
- Desktop: links in notes open in the browser (`open_web_link`, http(s) only).
- Phones show the PC by its Offlog name (`meta:sync-host`).
- Run maintenance refiles tasks left in their project's old space
  (`wrong_space`).

### Changed
- **One style on every desktop screen**, from the task window: every choice
  is the same pill (the chosen one lifted with the glow, no grey track);
  fields, selects and buttons are round outlines; lists are one glass panel of
  lined rows; labels in sentence case, never capitals or the code font; dates
  and counts as plain text, only overdue in colour. Applies to the task
  window, Board, List, Agenda (Month now fills the view until a day is
  open), Focus, menus (frosted `.glass.pop`), Settings and its panels,
  Recycle bin, History, Quick add, Search and the home screen. The phone's
  shared styles follow (`phone/phone.css`).
- Glass that nothing moves behind is `.glass.flat` (no blur): view headers
  and Board columns.
- Light mode's Medium and High priority colours read 4.5:1 on white.
- CSV export opens right in Excel, keeps formula-like titles as text and
  covers archived projects, space, reminder and notes.
- A PNG attachment stays PNG.

### Fixed
- Reminders: firing no longer clears `reminder_at`, so the phone still rings
  (a persistent per-device fired set instead).
- Saved filters were first stored on the project doc and could conflict with
  another device's status edit (caught before release).
- The Board's Filters menu opened off its button and under the Board (a
  blurred header became its containing block).
- Agenda's "This week" froze at the week it was opened.
- Undo: a phone Duplicate's Undo raised a second Deleted toast; a bulk change
  failing partway gave no Undo for the part done; a desktop Undo toast under
  the pointer never timed out once the window hid.
- The old readable server was deleted even after a pull with write failures.
- Restore: the preview claimed newer changes survive (restored items go back
  to the backup's version); it no longer calls History entries unrecognized;
  a finished restore says how much it restored.
- Scrollbars swelled into a wide slab on hover.
- Plus the PC and phone audit: links in phone notes, project archive/delete
  leaving its screen, conflict sheets naming statuses, `#tag` search, Select
  options stored once, Escape and Enter handling, focus returning to the
  opener, and the copy, plural and accessibility fixes listed in git.

### Security
- Tasks, notes and attachments on the PC's sync server are sealed with a key
  only paired devices hold (security.md section on encrypted sync, with its
  limits: plain HTTP, sizes and timing visible).
- `open_web_link` accepts only http(s) addresses under 2048 characters.
- npm audit 0.

## [6.12.2] — 2026-10-11

A sync fix: every edit synced through the desktop's NyxDB showed up as a
conflict on the other device. NyxDB v0.1.5 never returned `_revisions` on
its read paths, so a pulling PouchDB stored each edit as a sibling of its
copy (since v5.8.0). No storage, sync or backup format changed on Offlog's
side; NyxDB's own data directory upgrades itself on first start.

### Changed
- Bundled NyxDB v0.1.7 (tag + commit `fecc058` pinned in
  `fetch-nyxdb-win.ps1`; CI cache keys bumped). It also persists its server
  uuid (checkpoints survive restarts), flushes each write before
  acknowledging it, and creates a database only on `PUT /{db}`, which the
  sidecar's `ensure_database()` already does.

### Fixed
- Phantom conflicts after every edit. Existing ones are cleaned once per
  device by `removePhantomConflicts()` (`db/sync.ts`): a losing leaf goes
  only if the server's history of the shown version lists it; genuine
  conflicts stay. Marked done (`offlog_phantom_cleanup_v1`) only after every
  conflicting doc was checked.
- Tests: `phase0-repro/edit-replication.js` (edits and a delete after the
  first sync, over HTTP against the real binary; fails on v0.1.5) now runs
  in Desktop CI; `tests/phantomConflicts.test.ts` covers the cleanup rule.

## [6.12.1] — 2026-10-11

A phone polish release after v6.12.0: the status bar and the launch hand over
smoothly, plus a CodeQL fix in the release tooling and current screenshots.
No storage, sync or backup format changed.

### Changed
- **Launch cover**: `index.html` carries `#launch` (splash colour and mark,
  the mark injected at build time from `phone/mark.ts`), switched on by
  `public/theme-init.js` on a phone-sized native screen before the
  stylesheet loads, fixed over the status bar; `launch.ts` fades it out
  (`launchOutMs()`) once the first real screen is drawn. The hero status
  claim is released only after it has gone.
- README and offlog.io screenshots retaken in the Fluid look; site wording
  says App lock and Notifications, as the app does.

### Fixed
- The Android status-bar strip stayed flat `--bg` above glowing headers,
  reading as a white band: `body.statusbar-glow` gives it `--top-tint`,
  which every glowing header now starts with; each `TopBar` claims the strip
  (glow for a panel, plain otherwise) through `theme.ts`.
- The splash's purple stopped below the status bar and the page flashed its
  light background before the loading screen.

### Security
- CodeQL `js/incomplete-sanitization` in `scripts/release-docs.js`:
  history rows now escape backslashes before pipes.

## [6.12.0] — 2026-10-11

The Fluid redesign on both shells, a short Privacy page, and the fixes from
two maintenance passes (28th–30th) and a final audit. Glass chrome, almost no
colour, and selection shown by a soft glow; one shared icon set
(`shared/iconPaths.ts`) where every meaning has one shape. No storage, sync
or backup format changed — older installs read, sync and restore as before.

### Added
- **Privacy page** on both shells (phone Settings → Advanced → Privacy, a new
  desktop Settings tab): what stays private and the everyday limits, from
  `shared/privacyPoints.ts`; `tests/privacyPoints.test.ts` pins every limit.
- Desktop: Ctrl+K opens a project by name; Undo after archiving a task or a
  whole status; add to or remove from today's Focus without resetting; a
  duplicate-name hint when renaming a project or space; Dashboard project
  tiles show progress and the next due date.
- `Reduce transparency` switch in Appearance.
- Phone: a one-time tip that holding a task card opens its menu
  (`phone/holdTip.ts`); a second Undo while one is showing merges into it.

### Changed
- **Fluid style**: `.glass` chrome (headers, menus, sheets, toasts, tab bar)
  that turns solid over a scrim, inside other glass, under Reduce
  transparency and High contrast; `--sel-*` glow for selection; one
  three-level shadow scale (`--elev-1/2/3`); radius and desktop type scales
  (`--r-*`, `--fs-*`); fewer divider lines (`--line`, inset where related).
- Board card redesigned (title, tags, then a footer with pin, date and
  priority word); List, Agenda and Focus rows follow it; List's column header
  stays pinned while rows scroll.
- Desktop task editor in the phone task screen's language: icon rows, a
  compact Low/Medium/High switch, More details as one soft group; it saves on
  close.
- Settings regrouped into cards, one unit per setting, short copy, Done
  instead of Save; Organize panels, the command palette, Add task and
  Filters in the same style.
- Every filled primary button is neutral (`--text` fill); the accent is kept
  for the + buttons, Undo in a toast, state and wayfinding.
- Phone Settings says "Notifications", as the desktop does.
- Windows installer and uninstaller in Offlog's own words, with the brand banner.

### Fixed
- Tag colours did not repaint on List, Board and the phone's tag pickers (a
  colour function the template could not track; List ignored overrides).
- A merged Undo could revert a later edit that had no Undo of its own;
  `nav.sealUndo()` now ends the group and retires a live Undo.
- A leaving snackbar's Undo could run twice on a fast double tap.
- Selected Status/Priority pills had no visible cue under High contrast or
  Windows contrast themes; Add task's focus edge was nearly invisible; small
  `--faint` text on fills missed 4.5:1 in dark mode.
- Sync: overlapping starts ran two replications; the desktop sync host
  stayed down after a crash burst; a stalled pairing request held its slot.
- Reminders stalled through sleep and could fire twice on desktop.
- Data: Delete forever could remove a task another device had restored;
  conflicting field definitions led repair to delete values; a new status
  was added after "done".

### Security
- npm audit clean (source-map-js 1.2.2, GHSA-68fv-2mgg-jv7q); yoke-derive
  0.8.4 (0.8.3 yanked); NyxDB built from the tag's pinned commit, `--locked`.

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

---

[7.0.1]: https://github.com/hrach-gevorgyan/offlog/compare/v7.0.0...v7.0.1
[7.0.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.12.2...v7.0.0
[6.12.2]: https://github.com/hrach-gevorgyan/offlog/compare/v6.12.1...v6.12.2
[6.12.1]: https://github.com/hrach-gevorgyan/offlog/compare/v6.12.0...v6.12.1
[6.12.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.11.0...v6.12.0
[6.11.0]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.5...v6.11.0
[6.10.5]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.4...v6.10.5
[6.10.4]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.3...v6.10.4
[6.10.3]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.2...v6.10.3
[6.10.2]: https://github.com/hrach-gevorgyan/offlog/compare/v6.10.1...v6.10.2
