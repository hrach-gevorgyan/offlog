# Offlog — Maintenance Pass

A scheduled audit routine, tailored to this repo. **Not a feature
session:** external behaviour must stay identical. Read this whole file
before touching code.

**Current pointer** — last pass: **26th run** (2026-08-29; pulled forward
by the pointer's "or on the next bug hit in daily use" clause — the
Settings/Sync `each_key_duplicate` crash that survived two earlier fix
releases (v6.10.1, v6.10.2) before v6.10.3 found the real cause. Standard
Phase 1 checklist, with the recurring-blind-spots sweep specifically
aimed at that bug's class: unguarded async call sites and the "flag set
after an await" race. Found and fixed (all `[REVIEW]`, approved): five
more unguarded `onMount`/timer call sites in the same shape as the
incident (`CardDetail.svelte`, `SettingsPanel.svelte`'s PC-pairing poll,
`App.svelte`'s tray-event listener, `ListView.svelte`, `TimeTravelView.svelte`
— the last of which also left `loading` stuck `true` on failure). No
other instance of the discovery.ts-shaped race found. Zero `[RISKY]`
findings. `dist` now 1.8MB against the v6.5.0 baseline of 1.2MB (+50%,
attributable to real feature growth across five releases) — the main
chunk crossing the 500kB bundler-warning threshold is still an open,
unacted code-splitting recommendation carried from pass 25. Oversized-function
split candidates noted in `db/maintenance.ts`/`db/entities.ts`, propose-only,
no urgency). Next pass due: **2026-12-01, or on the next bug hit in daily
use, whichever comes first.**

This pointer is the only tracker state in this file. Past passes are
narrated in
[archive/maintenance.md](archive/maintenance.md) — this file is
instructions only.

**Scope a real pass in differently-aimed cycles, not one checklist run
three times.** The three cycles that closed active development were:
(1) the standard Phase 1 checklist, (2) an adversarial
data-loss/data-integrity audit, (3) a stability audit aimed at what
degrades over weeks of continuous use rather than what breaks on a fresh
install. Cycles 2 and 3 found materially more — including a backup system
that could not restore any backup containing an attachment, and automatic
backups silently stopping once the desktop app became tray-resident.

---

## Phase 0 — Orientation (no changes)

1. Read CLAUDE.md and docs/tech.md — the project map. If the structure has
   drifted from what tech.md describes, updating tech.md is itself a
   finding. Do not create a separate map file.

2. **Confirm the baseline is green before any change, judging every gate
   by its exit code, not its printed summary.** From `offlog-app/`:

   ```bash
   npm run check  ; echo "check  $?"    # svelte-check + tsc
   npm run build  ; echo "build  $?"    # must also be zero Svelte warnings
   npx vitest run ; echo "vitest $?"
   ```

   All three must be `0`. **Vitest prints "N passed" and still exits 1** on
   an unhandled rejection — an unguarded `await` in `onMount`, a jsdom API
   that doesn't exist. Grepping the pass count hides it; CI does not. This
   has already put main red once while every test reported passing.

   There is no lint config; the zero-warning build is the lint gate.

3. From `offlog-desktop/`, confirm the Rust side too:

   ```bash
   cargo build --manifest-path src-tauri/Cargo.toml   # zero warnings
   ```

   `offlog-desktop` wraps `offlog-app/dist` unmodified, so the gates above
   already cover its frontend; this is the only check specific to it.

If any gate fails, report and stop. Fix the baseline first.

---

## Phase 1 — Analysis (no changes)

Produce a findings report covering the following. Rank every finding
`[SAFE]` / `[REVIEW]` / `[RISKY]` (see the end of this phase).

### Routine sweep

- **Dead code** — unused files, functions, exports, components, CSS. In
  `src-tauri/`: unused `pub fn`s and modules, and confirm every
  `#[tauri::command]` in `invoke_handler!` is actually called from the
  frontend (or is intentionally dev-only, like `reset_sync_data`).
- **Duplicated logic** — worth a shared utility only if used twice or more.
- **Dependencies** — unused or redundant in `package.json` and
  `Cargo.toml`; `npm audit`; `cargo tree` for anything pulling a
  surprisingly large graph.
- **Oversized files/functions** (>~300 / >~50 lines) — flag only where
  splitting genuinely helps. Large view components are large by design.
- **Naming and organisation** against CLAUDE.md's conventions.
- **Performance suspects** — redundant DB round-trips, a `db.find()`
  missing `limit`, duplicate sync triggers, unthrottled listeners,
  needless `$:` recomputation, missed `invalidateTaskCache()` paths.
- **Error-handling gaps** — any task-mutating call site not wrapped in
  `try/catch` + `showError()`. This is an audited invariant; a regression
  is a finding.
- **Hygiene** — stale TODOs, debug `console.log`, secrets in code.

### Recurring blind spots

Each entry encodes a bug class this project has shipped or nearly
shipped, or a named external standard. That is the bar for adding one —
don't grow this list with generic-audit filler.

- **Judge gates by exit code.** Covered in Phase 0, repeated here because
  it is the most recent escape: a green-looking summary masked a non-zero
  exit and CI went red.
- **Floating promises.** Any call to an async `db.ts` / `notifications.ts`
  function that is neither awaited, returned, nor `.then/.catch`-chained.
  A bare `.catch(() => {})` deserves a look too — is the swallow
  deliberate? Real incident: a fire-and-forget `updateTask` caused both a
  revision-conflict race and a flaky test that only failed under parallel
  load.
- **Date/time locality.** All date-only logic must go through `utils.ts`'s
  `localDateStr()` and friends. Grep new code for raw
  `toISOString().slice`, `getUTC*`, or string-built dates. Real incident:
  seven places used UTC instead of the local calendar day (Agenda, Focus
  lock, overdue badges, exports). Month-end and DST are the cases that
  expose it.
- **Packaging paths, not just build/tsc/test.** A dependency bump can pass
  every gate and still break the pipeline, because the gates never
  exercise the packaging tools' own code. Real incident: TypeScript 7
  passed everything locally, then broke `npx cap sync android` on the next
  release tag. After any bump touching TypeScript, Vite, Capacitor or
  Tauri, run `npx cap sync android` too, and let `desktop-ci`'s release
  build cover the Tauri side.
- **Replication over HTTP, not just in memory.** `replication.test.ts`
  runs the real replicator, but only between two in-memory databases — no
  HTTP, no credentials, no batch sizes, no live/retry session.
  `offlog-desktop/scripts/phase0-repro/` covers those against a real
  NyxDB instance and is the only thing that does. Run all three scripts
  after any NyxDB or PouchDB version change; a green CI run is not
  evidence here. Nothing imports them, so nothing will remind you.
- **Script exit paths.** Read every `.ps1`/`.sh` end to end: does every
  failure path fail loudly, and does the success path actually exit 0?
  Real incident: a script succeeded completely yet exited 1, because
  robocopy's success codes lingered in `$LASTEXITCODE`.
- **Config and permission drift.** Diff `tauri.conf.json`'s CSP and
  `AndroidManifest.xml`'s `<uses-permission>` list against the last pass.
  Any widening is a `[REVIEW]` finding even if a feature "needed" it —
  these grow silently and nobody re-reads them.
- **Supply chain and workflow hardening.** Measured against
  [OpenSSF Scorecard](https://github.com/ossf/scorecard/blob/main/docs/checks.md):
  - **Pinned actions** — every `uses:` must reference a full commit SHA,
    with the version as a trailing comment. Tags are mutable and can be
    repointed at new code. Dependabot updates SHAs and the comment
    together.
  - **Token permissions** — every workflow declares least privilege.
    Only `release.yml` should widen beyond `contents: read`, and it must
    say why inline.
  - **Dangerous workflows** — no `pull_request_target`, and nothing from
    `github.event.*` interpolated into a `run:` block (script injection).
  - **Binary artifacts** — nothing executable committed beyond Android's
    `gradle-wrapper.jar`, which is standard and required.
- **Docs link integrity.** Relative links rot silently as files move.
  Resolve each link against its own file's directory, not the repo root —
  and note that GitHub-relative forms like `../../security` are valid on
  github.com while failing a filesystem check.
- **Size drift ledger.** Record `du -sh offlog-app/dist` plus the
  installer and APK sizes every pass. Unexplained growth beyond ~10% with
  no feature to blame is a finding; bloat only ever arrives gradually.
  **Baseline (v6.5.0): dist 1.2MB, APK 4.72MB, Windows installer 4.96MB.**
- **Optional deeper sweeps** — `npx knip` (unused files/exports) and
  `cargo machete` (unused crates). Both false-positive-prone on
  Svelte/Tauri; results are candidates, not findings. Run when a pass
  suspects drift, not every time.

**Already covered elsewhere — don't duplicate.** Clean-checkout builds are
exercised by CI on every push. The incremental-vs-clean Android build class
is only caught by the owner's own Studio builds, since Gradle is
owner-only.

### Security and robustness

- **Build-output secret leakage — check `dist/`, not just source.** Vite
  loads `.env.local` for every build mode, so a developer's real
  credentials once compiled into `dist/` and from there into a shipped
  APK. A source-only scan does not catch this. Every pass: build, then
  grep `dist/` for anything in `.env.local` — it must come back empty.
  `config.ts` gates its env reads on `import.meta.env.DEV`; confirm that
  gate is intact.
- **XSS surface** — grep every `{@html}` and confirm the value is a fixed
  internal constant, never user text or anything arriving over sync.
- **`npm audit`** — don't just report the count. Say whether each
  advisory's code path is reachable from the shipped bundle or is
  build-only tooling.
- **Deep links / widget URLs** — confirm a malformed or hostile
  `com.offlog.app://` URL can't reach `eval`, `Function`, or an unguarded
  property lookup.
- **`localStorage` contents** — nothing sensitive beyond the documented,
  accepted tradeoffs.
- **`src-tauri/` unsafe blocks** — there should be exactly two *kinds*:
  the `TerminateJobObject` FFI in `lib.rs` (its `unsafe extern` block
  plus the two call sites) and the DPAPI calls in `secure_storage.rs`.
  Count kinds, not occurrences. Any third kind is a finding. Confirm none is reachable
  with attacker-controlled input, and that `pairing.rs` logs outcomes,
  never code or credential values.
- **`eval(`, `new Function(`, `innerHTML =`** outside the `{@html}` cases.
- **Sync request construction** — credentials must never be interpolated
  into anything executed or logged in full. Credentials in a thrown error
  that reaches the UI is a real leak.

### Ranking

- `[SAFE]` — trivial, no behaviour change possible.
- `[REVIEW]` — needs owner approval.
- `[RISKY]` — touches document schema (`_id` prefixes, field names),
  replication, soft-delete semantics, the positional-"done" rule, or
  storage format. **Propose only, never auto-fix.**

**Stop after the report.** Wait for go-ahead before Phase 2.

---

## Phase 2 — Cleanup (after approval)

- Fix approved `[SAFE]` and `[REVIEW]` items only, one area at a time.
- Commit style: `maint: <what> (<why>)`, 2–4 lines.
- Never change external behaviour. If a refactor would, stop and ask.
- Prefer deleting over commenting out. Keep diffs minimal — no
  reformatting untouched code.

## Phase 3 — Optimisation (evidence only)

- Only where Phase 1 found concrete evidence, never speculatively.
- Priorities: fewer DB round-trips, batched writes, debounced sync
  triggers, no redundant reactive recomputation, heavy modules kept
  lazy-loaded.
- No new dependencies or caching layers without approval.

## Phase 4 — Verification

1. Re-run all Phase 0 gates **by exit code**, plus `cargo build` if
   anything under `offlog-desktop/` changed.
2. Trace the core flows in code and confirm the logic is unchanged: create
   task → edit in CardDetail → move across statuses → mark done
   (positional last-column rule) → delete/undo. Add sync replication and
   reminder scheduling if either was touched. If `offlog-desktop/` changed,
   also trace sidecar spawn → pairing code → `/pair` → credentials
   returned. A code-level trace is enough; this doesn't need a live device.
3. Justify any modified test explicitly.
4. Summarise every changed file in one line.

## Phase 5 — Documentation and handoff

1. Update docs/tech.md if structure changed, CLAUDE.md if a convention
   changed. Shrink stale content rather than only adding.
2. **If the pass fixed anything**, ship it as a light release: bump the
   version in `package.json`, `android/app/build.gradle` and
   `tauri.conf.json`, add a `### Fixed` entry to docs/changelog.md
   (Keep a Changelog format) and an entry to docs/release-notes.md
   including its Play-safe **In short** block, then commit and tag per the
   release checklist.
   **If the pass found nothing to fix, skip the version bump entirely** —
   nothing changed, so there is nothing to ship.
3. Update the **Current pointer** at the top of this file, then append the
   pass's narrative to
   [archive/maintenance.md](archive/maintenance.md). Don't grow a
   second tracker here.
4. Final report: done / deferred / `[RISKY]` left untouched /
   recommendations for the next pass.

---

## Hard constraints (every phase)

- Never change external behaviour.
- Never touch document schema, replication logic, soft-delete semantics,
  the positional-"done" rule, or storage format without explicit approval.
- Never run a Gradle or APK build. That is owner-only, in Android Studio.
- Never push, tag, or publish without explicit approval.
