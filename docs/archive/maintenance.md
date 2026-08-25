# Offlog — Maintenance History

What each maintenance pass found. The process, and the pointer to when the
next one is due, live in [../maintenance.md](../maintenance.md).

Passes 1–5 were never written up. Passes 19–21 ran together as the
close-out of active development and were recorded only as a group — see
pass 22 and maintenance.md's scoping note.

---

## 24th run — 2026-08-26 (after v6.7.0)

Triggered by the pointer's "or on the next bug hit in daily use" clause:
v6.7.0's own work turned up four real bugs during the session that produced
it, which is exactly the condition the clause names.

Baseline green on all four gates. The routine sweep and every recurring
blind spot came back clean — no floating promises, no date-locality
violations, no debug logs or secrets, `npm audit` zero in both trees, every
action SHA-pinned, no `pull_request_target` or event interpolation, exactly
the two documented `unsafe` kinds in `src-tauri`, all nine Tauri commands
reachable, no Android permission or Tauri CSP drift, all doc links
resolving, and no `.env.local` value present in `dist/`. Both `{@html}`
paths that render untrusted text were re-verified: `highlight()` escapes
before wrapping, and `getSpaceIconSvg()` can only ever return a constant.

The two findings were both self-inflicted by the release being audited,
which is the useful thing about running a pass straight after one.

**`checkIntegrity()` had quietly narrowed its conflict coverage.** Rewriting
it to scan by id prefix — the fix that stopped it loading the whole
changelog on every run — turned the conflict pass into an allowlist of
entity prefixes. `scanConflicts()`, which drives the sync badge and the
Resolve-conflicts screen, scans everything except `log:`. So a conflict on
`meta:custom_fields` was counted in the badge and fixable on that screen,
while maintenance reported nothing. Both now read the same exported range,
and the entity lists are derived from those same rows, so a future edit
cannot reintroduce the divergence. A test pins it.

**The new release verify job inherited `contents: write`.** Added in the
same session to stop `release.yml` publishing without running the tests, it
picked up the workflow-level permission that exists so `draft-release` can
upload assets. It only checks out and runs the gate. Scoped to
`contents: read`.

Size ledger: `dist` 1.3 MB against the v6.5.0 baseline of 1.2 MB, about +8%
and under the threshold — attributable to v6.7.0's motion and maintenance
code. APK and installer were not measurable in this pass (Gradle is
owner-only, and only the raw unpackaged exe existed locally), so those two
baseline figures still stand from v6.5.0 and want refreshing from an owner
build.

Core flows were traced live rather than only read: create, edit, move,
mark done by the positional last-column rule, soft delete, undo — all
behaved unchanged, with `checkIntegrity()` reporting 558 records checked.

Nothing `[RISKY]` was found; nothing touched schema, replication,
soft-delete semantics, the positional-done rule, or storage format.

---

## Pass 6 — v4.15.1 (2026-07-13)

Delta-scoped since v4.12.0's
A30. Found/fixed a missing `logChange()` on `createProjectFromTemplate()`
(same bug class as the fourth pass's `archiveProject()` gap), 3 dark-mode
contrast failures from hardcoded `#fff` instead of a token (`Sidebar`
conflict-badge, `App.svelte` error-toast, `DeadlinesView`'s 4-variant
badge — the last needed a new `--ink-fixed-dark` token), and an unguarded
`new URL()` in the widget deep-link handler. No dead code, no new duplication — no dead code, no new duplication, `npm audit`
unchanged from last pass.

## Pass 7 — v4.19.1 (2026-07-19)

After v4.18.0/v4.19.0 shipped.
First pass to cover `offlog-desktop/` (Track E's Tauri PC app) alongside
`offlog-app/` — see maintenance.md's own Phase 0/1/4/5 additions from the
same day. Found and fixed one real duplication: `isTauri()` detection and
the raw `window.__TAURI_INTERNALS__.invoke(...)` call pattern were each
independently re-declared/inlined across `config.ts` and
`SettingsPanel.svelte` (5+ call sites) — consolidated into `isTauri()`/
`invokeTauri()`, both exported from `config.ts`. Everything else checked
out clean — no dead code beyond one already-documented pending stub, no
unused Track E dependencies, `npm audit` unchanged, Rust `unsafe` blocks
limited to the expected `TerminateJobObject` FFI calls, no credential
values in any log line. `SettingsPanel.svelte`'s size (1141 lines) flagged
again but a split deliberately skipped — same shared-CSS blocker as the
v4.12.0 pass.

## Pass 8 — v4.22.1 (2026-07-15)

Delta-scoped since v4.19.1,
covering v4.20.0/v4.21.0/v4.22.0's changes). Found and fixed one real gap:
`ChangelogView.svelte`'s "Clear all" button was missing the audited
try/catch + `showError()` invariant. Also added a Tauri window
`minWidth`/`minHeight` floor (`offlog-desktop/src-tauri/tauri.conf.json`)
since none existed. The `motion.ts` animation migration (v4.22.0) audited
clean — no leftover unused `@keyframes`, all 7 exports/15 call sites
correct. `npm audit` unchanged (4 dev-tooling-only advisories, none
shipped). One correction to a preliminary finding: `pouchdb` npm package
looked unused in `src/` but is actually imported by `tests/setup.ts` —
left in place. Disabled CSP (`security.csp: null` noted but deliberately
deferred to the same pre-public-release pass as C7, not fixed piecemeal
here.

## Pass 9 — v4.25.0 (2026-07-16)

Covering the first real
desktop-dogfooding round: v4.23.0-v4.25.0's rapid iteration on
`offlog-desktop`'s notification/backup/startup fixes). Found and fixed
one real gap: `@tauri-apps/plugin-notification` (the npm package) had
zero remaining JS import sites after click/schedule logic was rebuilt on
a custom Rust command — removed from `package.json`. The Rust crate
`tauri-plugin-notification` stays (still registered for its
permission-check compatibility). Everything else audited clean: no dead
code from the several notifications.ts rewrites, all 6 new npm packages
and 6 new Rust crates from this arc genuinely used, `cargo check` zero
warnings, `npm audit --production` unchanged (same known uuid/pouchdb
advisory, no stray debug/temp files.

## Pass 10 — v4.28.0 (2026-07-17)

Delta-scoped since v4.25.0,
covering v4.26.0-v4.28.0's settings redesign, Android widget polish, and
the modalStack.ts/seedIfEmpty fixes). Baselines all green (build/tsc/
test/cargo build). Found and fixed two real [SAFE] gaps: `notifications.ts`
re-declared its own inline Tauri-detection check instead of importing
`isTauri()` from `config.ts` (same duplication pattern the seventh pass
already consolidated elsewhere); `docs/tech.md` was stale since v4.12.0
(version header, and its source file map was missing ~20 files added
since, including `SettingsPanel.svelte` itself after the v4.26.0
redesign pulled it out of `Sidebar.svelte`) — both fixed. Security
checklist all clean: XSS surface, deep-link handling, `unsafe` blocks,
credential logging, `npm audit` (20 vulns, all in build-tooling or the
test-only `pouchdb` package, none shipped) all unchanged/clean.
**Also completed alongside this pass, not part of the routine itself**:
C7's git-history piece (owner-directed) — two real credentials
(`offlog-app/src/config.ts`'s old hardcoded CouchDB password, and a
second username+password pair that had leaked into a committed
`.claude/settings.local.json` purged from every one of the repo's 127
commits/71 tags via BFG Repo-Cleaner, verified by exhaustively scanning
every remaining git object afterward. See decisions.md and history.md C7 for
the full record.

## Pass 11 — v5.0.0 (2026-07-20)

Delta-scoped since v4.28.0,
covering v4.29.0/v4.30.0's pre-release audit batches plus the unreleased
Time Travel/NLP Quick Add/recurring-tasks/font-consolidation/App Lock work
bundled into this 5.0.0 cut). Baselines all green (build/tsc/test/cargo
build) after one real fix found at Phase 0: `TimeTravelView.svelte` had a
non-static `tabindex`/`role` pairing the Svelte a11y checker couldn't
verify at compile time, producing a build warning — fixed by giving the
non-clickable branch a static `role="listitem" tabindex="-1"` instead of
conditional `undefined`s. Phase 1 delta audit otherwise clean: no dangling
references survived the ChangelogView→TimeTravelView swap, Tauri CSP is
genuinely enabled (not just claimed — confirmed a real restrictive policy
in tauri.conf.json), App Lock/recovery-code secrets are salted-hashed and
never logged or stored in plaintext, no new `eval`/`Function`/raw
`innerHTML`, `{@html}` sites all either fixed internal constants or
properly escaped, and the audited try/catch+showError() invariant holds
across every new mutation call site (QuickAdd, Time Travel, recurring-task
reset path in db.ts. No dead code, no new duplication, no npm dependency
changes to reassess.

## Pass 12 — v5.4.0 (2026-07-20)

Delta-scoped since v5.0.0,
covering App Lock's biometric unlock (B54 second half), Privacy Screen +
Clipboard (B55/B56), a real bug fix (biometric toggle reachable with no
PIN set — now gated on `appLockEnabled` too), an Android splash-logo fix
(stale pre-rebrand mark on legacy pre-API-31 devices, new
`resources/generate-splash.cjs`), a 6-item Android cleanup (dead
google-services classpath, unadapted scaffold test files, orphaned
`activity_main.xml`, unused Gradle version vars, unused widget color/
string resources — all confirmed safe and removed), Haptics (B58), and
App Launcher (B57). Found and fixed one real [REVIEW] item: `hapticToggle()`
fired *before* the task mutation was confirmed in 4 places (List/Focus/
Deadlines' `markDone`, Kanban's `togglePin`) — inconsistent with the
drag-drop haptic calls, which correctly fire only after `updateTask`
succeeds; moved all 4 to fire after the `await` instead. Everything else
clean: all 5 new npm dependencies (`@capacitor/privacy-screen`,
`@capacitor/clipboard`, `@capacitor/haptics`, `@capacitor/app-launcher`,
`capacitor-native-biometric`) confirmed genuinely used, no plaintext
secrets in the 2 new localStorage flags, `clearAppLockPin()` correctly
clears the biometric flag too, no new `{@html}`/`eval`/`innerHTML`, `npm
audit` unchanged from prior passes (same dev-tooling/test-only
advisories). `SettingsPanel.svelte` flagged again at 1881 lines (was 1141
three passes ago) — same shared-CSS blocker, still deliberately deferred.

## Pass 13 — v5.4.6 (2026-07-20)

Delta-scoped since v5.4.0,
covering v5.4.1-v5.4.5's rapid live-device bugfix batches). Baselines all
green (build/tsc/test/cargo build). Found and fixed one real race:
`notifications.ts`'s `fireWebNotification()` cleared `reminder_at` via an
un-awaited `updateTask(...).catch(()=>{})`; since `updateTask` was a plain
get-then-put with no compare-and-swap, a second concurrent `updateTask` on
the same task could read a stale rev and throw "Document update conflict"
— reproduced intermittently (~1/4 runs) in `tests/notifications.test.ts`.
Fixed at the root in `db.ts` by serializing all `updateTask()` calls per
task id through a small write queue (`updateTask` now chains onto
`updateTaskImpl` via `_taskWriteQueues`), rather than patching just the
one call site — 5/5 clean reruns of the previously-flaky test afterward.
Also extracted `KanbanBoard.svelte`'s repeated touch-drag-state reset into
one `resetTouchDragState()` helper, and added a release-checklist note in
CLAUDE.md flagging that the Android `release` build type is currently
signed with AGP's debug keystore (v5.4.4, local-dev convenience only and
must not ship as a real Play Store build before C3's real signing key
exists. No dead code, no dependency changes, security checklist and `npm
audit` unchanged from prior passes.

## Pass 14 — v5.6.1 (2026-07-21)

Off-cadence at owner
request; the schedule's next pass wasn't due until v5.7.0). Baseline
wasn't green at the start: `TimeTravelView.svelte` had a Svelte a11y
warning (`role`/`tabindex` both driven by the same ternary, which the
linter can't statically correlate) — fixed by splitting into static
`{#if clickable}` branches before analysis could begin. Four parallel
sub-audits (dead code/duplication, dependencies, error-handling/
performance, security/robustness) covered `offlog-app/` and
`offlog-desktop/src-tauri/`. Findings fixed: `utils.ts`'s unused
`dueState()`/`DueState` and `types.ts`'s unused `AnyDoc` removed;
`package.json`'s `pouchdb` moved from an unused `dependencies` entry to
`devDependencies` (real UMD-global standin needed by `tests/setup.ts`
under Vitest, never shipped in `dist`) and `@capacitor/cli` moved to
`devDependencies`; new `--toggle-knob` token replacing two hardcoded
`#ffffff` toggle-knob colors (`ListView.svelte`, `SettingsPanel.svelte`);
two drifted `SettingsPanel.svelte` modal-scrim opacities (`.35`, `.4`)
unified to the app's standard `.45`; `CardDetail.svelte`/`QuickAdd.svelte`'s
per-keystroke duplicate-title/similar-notes checks debounced 350ms
(`checkNotesSimilarity` was scanning every task's body app-wide on every
keystroke, unthrottled). Security/robustness checklist (XSS via
`{@html}`, deep-link handling, localStorage contents, Rust `unsafe`
blocks, pairing-code logging, `eval`/`innerHTML`, credential leakage into
errors/logs) came back fully clean, zero findings. Left deliberately
unfixed: `npm audit`'s one bundle-reachable advisory (`pouchdb-find`'s
transitive `uuid <11.1.1`, moderate) has no non-breaking upstream fix
yet — noted to watch, not acted on; `tauri-plugin-updater`'s heavier
dependency subtree (full second HTTP/TLS stack via reqwest/hyper/rustls)
is informational only, the official plugin working as intended. No
RISKY-tier findings; `offlog-desktop` baseline (`cargo build`) confirmed
green but the crate itself wasn't touched this pass. All fixes verified
live via browser preview (toggle-knob token, scrim opacity, Time Travel's
clickable/non-clickable split, debounce timers in addition to the
build/tsc/test gates.

## Pass 15 — v5.7.4 (2026-07-22)

Pulled forward from its
after-v5.9.0 due date at owner request as the "final cleanup" of the
finite-plan restructuring; also removed a stray dangling sentence
fragment left at the end of the fourteenth entry above). Delta-scoped
since v5.6.1 (the v5.7.0–v5.7.4 releases: A9 extractions, B59's 3-step
first-run flow, the v5.7.1 credential-gate fix, v5.7.2's bugfix batch,
two dependency-maintenance batches, CI/release automation). **Cleanest
pass on record — zero code findings.** Hygiene (console.log, TODOs),
XSS surfaces (`GlobalSearch`'s `highlight()` escapes before `{@html}`;
space/category icons resolve from fixed tables), `db.find()` limits,
Rust `unsafe` inventory (only the known `TerminateJobObject` FFI),
pairing-path logging, localStorage contents, `npm audit` (0), the
`dist/` build-output secret check, and dead-export scan of every
delta file: all clean. One [SAFE] doc finding fixed: tech.md had no
mention of the week-old CI/release pipeline — a new "CI & release
automation" subsection added under Testing & Dev Workflows. Docs-only
fix, so no version bump per maintenance.md Phase 5's clean-pass rule.
Baselines (build zero-warning / tsc / 173 tests / cargo build) all
green, verified same-day on the current tree. Recommendation for next
pass: nothing carried over; the `glib` accepted-risk (decisions.md
re-check remains tied to the next Cargo dependency bump, not to
maintenance cadence.

## Pass 16 — v5.8.3 (2026-07-28)

Pulled forward from its
after-v5.10.0 due date at owner request). Full Phase 1 sweep of both
apps plus `npx knip` as an optional deeper sweep (`cargo machete` not
installed, skipped per "no new tooling without approval"). Two real
findings fixed: (1) `notifications.ts`'s `fireTauriNotification()` and
`catchUpTauri()`'s stale-reminder branch both discarded `updateTask()`'s
promise via a bare `.catch(() => {})` instead of returning it, unlike
`fireWebNotification()`'s already-fixed equivalent (the v5.4.6
rev-conflict-race / v5.7.2-flaky-test bug class) — the Tauri path was
added later and missed the same fix; purely internal, no external
behavior change (still fire-and-forget from every caller). (2) found
mid-pass, not in the original report: `TaskHistoryPanel.svelte` had its
own hand-duplicated copy of `logFormat.ts`'s `FIELD_LABEL`/`fmtVal`/
`describeField`/`hasRealChange`, despite that file's own header comment
saying it was extracted specifically to prevent this class of drift —
and it had already drifted (missing the `'name'` rename case, missing
the `isEmpty()` no-op filter from `logFormat.ts`'s 2026-07-18 fix, so a
no-op checklist/custom-field diff could still show a false "Checklist
updated" here after Time Travel had already stopped showing it); now
imports the shared logic, keeping only its own intentionally-simpler
`describeLog()` wrapper. Housekeeping: removed `export` from 6
module-internal-only symbols flagged by `knip` and individually
hand-verified against real import sites (not trusted blindly — knip's
other "unused" hits, e.g. `ArchivedProjectsManager`/`SpaceManager`/etc.,
were confirmed false positives from dynamic `import()` it can't trace);
updated this file's own stale unsafe-Rust-block checklist entry (missed
C8's `secure_storage.rs` DPAPI calls) and the size-drift ledger (dist
1.1MB → 1.2MB, ~9% growth, under the 10% threshold, explained by C8/App
Lock work shipped since v5.7.10 — installer/APK figures still not
recorded anywhere, remains a gap for next pass to fill if a build is
available). Deliberately **not** fixed: `SettingsPanel.svelte`'s size
(2063 lines, now the largest file in the repo) — real risk/effort
mismatch for a routine pass given it'd mean lifting a lot of shared
reactive state across new sub-components purely for readability, not
correctness; and 7 other `knip`-flagged unused exports/types not
individually verified (lower confidence, left as a candidate list for
whoever picks this up next). `handleWidgetUrl()`'s deep-link handling
was re-verified by hand (traced every branch: strict `===` against 5
fixed literals, the one attacker-influenceable value — a `project` id
query param — only ever used for an equality check against real,
already-loaded project IDs, no `eval`/dynamic property lookup/DOM
injection anywhere in the chain) — confirmed clean, not just assumed.
No RISKY findings; no schema/sync/storage-format changes. Baselines
(build zero-warning / tsc / 219 tests / cargo build all green,
re-verified after every fix and once more at Phase 4.

## Pass 17 — v6.0.1 (2026-07-30)

Pulled forward at owner
request right after v6.0.0's large feature batch — file attachments,
recurrence-robustness fix, unified search, tag color picker, plus the
milestone/"Done" framework's removal from roadmap.md — landed in one
session and warranted a check before pushing). Baselines confirmed
green first (offlog-app build/tsc/253 tests, offlog-desktop cargo
build, `cap sync android`), including the desktop Rust build which
hadn't been checked yet this session. Two real, verified findings, both
fixed: `db.ts`'s `getRecentlyModifiedTasks()` was dead code, orphaned
since the 5.9.0 redesign removed the Sidebar "Recent" section it fed —
deleted, along with updating the stale comment on `getActiveProjectIds()`
that still named it as a caller. `GlobalSearch.svelte` re-declared its
own `'title'|'tags'|'body'|'checklist'` union instead of importing the
already-exported `TaskSearchMatch` type from `db.ts` — deduped to the
shared import. A third `knip` flag (`store.ts`'s `tasks` writable has an
unnecessarily-wide `export` — nothing outside the file imports it
directly, only its derived `projectTasks` is used elsewhere) was
reported but left alone at owner's call — trivial, zero value. `npx
knip` also flagged 4 Capacitor/Tauri deps and 4 Svelte files as
"unused"; all individually hand-verified as real, dynamically-imported
code — false positives, matching this project's established experience
with the tool on Svelte/Tauri. `npm audit`: 0 vulnerabilities. Build-
output secret-leakage gate re-checked against a real `.env.local` —
still clean. Dist size: 1.2MB, unchanged from the v5.8.2 baseline
despite the whole v6.x feature batch landing since. No RISKY findings;
no schema/sync/storage-format changes. Baselines re-verified clean

Last passes: v6.3.0 (2026-07-31 — nineteenth, twentieth and twenty-first
runs, three cycles back-to-back closing out active development on the eve
of real daily use). Deliberately scoped differently instead of running
one checklist three times, and the difference mattered: cycle 1 (the
standard maintenance.md Phase 1 sweep) found a global-shortcut collision
that would panic the app on startup, silently-swallowed notification-
action failures, and three copy-pasted Kanban indicator loaders — all
fixed, plus `npm audit` taken 2 → 0 and clippy to zero. Cycle 2, an
adversarial data-loss audit, found the one that actually mattered: **no
backup containing an attachment could be restored at all** — exports
wrote attachment stubs with no bytes, and PouchDB rejects an entire
`bulkDocs` batch on a `missing_stub`, so a single attached photo turned
every backup file into a brick reporting only "Import failed." It also
found restores silently dropping custom-field definitions and tag
colours (orphaning restored `custom_values`), no structural validation
on import (a project without `columns` imported fine, then crashed five
views on `columns.at(-1)`), and status remove/reorder silently
redefining project-wide done-ness with no warning. Cycle 3, a long-run
stability audit, found that the *tray-resident change shipped that same
day* had silently disabled automatic backups and both retention prunes
(they only ran at app start, which used to happen daily and now might
never, that the live change feed had no error handler and never
restarted — going permanently deaf after a sleep/resume — that a sync
burst fired one full reload per document, that `auto_compaction` was off
so deleting an attachment freed no disk, that Agenda never noticed
midnight, and that a second launch would fork a second NyxDB onto the
same port and data directory. All fixed and verified; 5 new backup
round-trip tests, 279 total. Lesson recorded for any future pass: scope
successive cycles differently, because the second and third found
materially more than the first.

## Pass 18 — v6.2.1 (2026-07-31)

Pulled forward at owner
request right after the animation-harmonization/installer-branding/
splash-icon polish pass, ahead of the schedule's next-due v6.3.0).
Baselines confirmed green first (offlog-app build/tsc/265 tests,
offlog-desktop cargo build). One real, verified finding, fixed:
`App.svelte`'s `handleUndo()` (the undo-toast button's handler) was
missing this codebase's audited try/catch + `showError()` invariant —
every other task-mutating call site has it; a failed undo previously
failed silently instead of surfacing a toast. Also fixed: an identical
2-line `escapeHtml()` implementation duplicated verbatim in
`GlobalSearch.svelte` and `UpdateModal.svelte` (both feed `{@html}`),
deduped into a shared `utils.ts` export; 14 stale `GOAL.md`/
`docs/decisions.md` references surviving in source comments across 9 files
(`config.ts`, `AppLock.svelte`, `db.ts`, `discovery.ts`, `haptics.ts`,
`nlpParse.ts`, and 3 Rust files in `offlog-desktop/src-tauri/src/`) —
both docs were merged into `decisions.md` months ago (GOAL.md
2026-07-20, IDEAS.md 2026-07-31) but the source comments citing them by
name were never swept. `AddAttachmentInput` (db.ts) was checked and
confirmed a legitimate export (the public `addAttachment()` API's own
param type), not dead code. `npm audit`: 2 advisories
(`brace-expansion`, `tar`), both confirmed dev-only build tooling
(transitive through `@capacitor/cli`), not reachable from the shipped
bundle. No dead code beyond the one confirmed-legitimate export, no
duplicated logic beyond the one `escapeHtml()` fix, no oversized-
function split candidates, no `db.find()` missing a `limit`, no cache-
invalidation gaps, no date/UTC locality bugs, no script exit-path
issues, no config/permission drift since the last pass, no broken docs
links, zero secret leakage into `dist/`, no unsafe `{@html}` sites, no
new `unsafe` Rust blocks (still only the two documented spots in
`lib.rs`/`secure_storage.rs`), nothing logged that shouldn't be. Dist
size: 1.2MB, unchanged despite the v6.1.0/v6.2.0 feature batch and this
pass's own fixes. No RISKY findings; no schema/sync/storage-format
changes. Baselines (build zero-warning / tsc / 265 tests / cargo build
re-verified clean after every fix.
after both fixes.

## Pass 22 — v6.5.0 (2026-08-24)

The first since daily
use began. Run against a codebase that had just been through a large
hardening cycle, so most of Phase 1 came back empty and that is the
finding: zero floating promises across 30 async writers, zero raw-UTC
date-only logic, no Android permission or Tauri CSP drift since v6.3.0,
every relative doc link resolving across 19 markdown files, `npm audit` 0,
no unused Rust crates, dist steady at 1.2MB against the v5.8.2 baseline.
The CI-consumed `fetch-nyxdb-win.ps1` checks `$LASTEXITCODE` after every
native call; `reset-dev-env.ps1` has no exit handling but is hand-run and
its code is unconsumed, so not a finding. Fixed three latent issues that a
typing pass had surfaced earlier the same day, each with a mutation-
verified test: a docless `allDocs` row (deletion tombstone) threw mid-
backup; `invokeTauri()` asserted Tauri's IPC global rather than rejecting
off-Tauri; and a dead `??` in the import error path masked non-Error
rejections. Size-drift ledger completed for the first time: v6.5.0's release
artifacts give dist 1.2MB, Android APK 4.72MB and Windows installer 4.96MB
— the installer flat against the v5.7.10 "~5MB" note, and both halves of
the ledger now populated after three passes with only the dist figure. One
note still carried forward: the Android Gradle build remains owner-only, so
the incremental-vs-clean build class stays uncovered by this pass. The
v6.5.0 release also confirmed the signing pipeline end to end — a signed
APK plus an installer and its `.sig`, with `latest.json` generated for the
desktop updater.)

## Pass 23 — no version bump (2026-08-24)

Off-cadence, run the same day as pass 22 and scoped to what had changed
since it: a full documentation rewrite, ~30 rewritten source comments
across the Android resources, and five CI changes. Baseline green on all
four gates by exit code (569 tests, zero-warning build, clean tsc, clean
cargo build).

Two findings, both fixed. `release.yml`'s Android job built the APK
against a cold Gradle every time, while the desktop job in the same file
already restored a cargo cache warmed on main and its comment spelled out
the rule -- a tag run can only reuse default-branch caches. Nothing had
written a Gradle cache on main until this session's new
`codeql-android.yml` started doing so, so the restore became possible and
was added. The second was wording: this file claimed `src-tauri/` should
hold "exactly two" unsafe blocks when it holds two *kinds* across five
sites, which would have read as a finding to the next pass.

The rest came back clean, including the checks worth naming. All three
`{@html}` sinks that take untrusted input hold up -- `GlobalSearch`
escapes before wrapping in `<mark>` rather than after, `UpdateModal`
escapes every branch of the release-note renderer, and `getSpaceIconSvg`
only ever emits from a fixed constant table. Every one of the 12 pinned
actions was resolved against its claimed tag upstream rather than just
checked for SHA shape; all 12 matched. The Android diff since v6.5.0 was
audited for value changes and contains exactly four beyond comments: the
widget picker string, `org.gradle.parallel`, `org.gradle.caching` and the
wrapper's `-all` to `-bin` switch. `npx cap sync android` still exits 0
and the generated `capacitor.config.json` keeps its nested
`LocalNotifications` pair.

No version bump: nothing this pass touched reaches the shipped app, so a
release would have published byte-identical artifacts.

Two things this pass could not verify, both owner-only: the widget
description string and the Android resource comments need a Studio
rebuild, and `gradle.properties`' new parallel/build-cache settings meet a
real `assembleRelease` for the first time on the next tag. The size ledger
stays at the v6.5.0 baseline -- dist held at 1.2MB, but APK and installer
figures need builds this pass cannot run.

Full narrative history of every maintenance pass (process defined in
[../maintenance.md](../maintenance.md)), moved here from that file's old
in-place tracker so the instructions file stays instructions-only. Current
pointer (last pass / next due lives at the top of maintenance.md, not
here — this is history, not state.

