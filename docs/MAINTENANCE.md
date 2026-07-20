# MAINTENANCE PASS — Offlog

Scheduled maintenance routine, tailored to this repo. This is NOT a
feature session: external behavior must remain identical. Read this whole
file before touching code. Cadence: **every 3 minor versions.**

**Current pointer** — last pass: v5.4.6 (2026-07-20, thirteenth run).
Next pass due: **after v5.7.0 ships**. This is the only tracker state that
lives in this file; the full narrative history of every past pass is in
[archive/changelog-archive.md](archive/changelog-archive.md)'s
"Maintenance pass log" section — this file is instructions only. Update
just this one pointer line when a pass completes (Phase 5, step 3) and
append the pass's narrative to that archive file instead of growing a
tracker here again.

## Phase 0 — Orientation (no changes)
1. Read CLAUDE.md and docs/TECH.md — they are the project map. Do NOT
   create a separate PROJECT_MAP.md; if the structure has drifted from
   what TECH.md describes, updating TECH.md is itself a finding.
2. Confirm the baseline is green BEFORE any change (all from `offlog-app/`):
   - `npm run build` — must succeed with **zero Svelte warnings**
   - `npx tsc --noEmit -p .` — clean
   - `npm test` — vitest suite passes
   If any fail, report and stop — fix the baseline first.
   (There is no lint config in this project — the zero-warning build IS
   the lint gate.)
3. **Also confirm the `offlog-desktop/` (Tauri PC app, Track E — see
   ROADMAP.md E1) baseline is green**, from `offlog-desktop/`:
   - `cargo build --manifest-path src-tauri/Cargo.toml` — must succeed
     with **zero warnings**
   This is a genuine second app now, not an offshoot of `offlog-app/` —
   see docs/TECH.md's "Desktop (Tauri)" section for the architecture.
   Since it wraps `offlog-app/dist` unmodified, `offlog-app`'s own
   baseline gates above already cover its frontend; this Rust build is
   the only check specific to `offlog-desktop/` itself.

## Phase 1 — Analysis (no changes)
Produce a findings report covering:
- Dead code: unused files, functions, exports, components, CSS. In
  `offlog-desktop/src-tauri/`: unused `pub fn`s/modules, and confirm
  every `#[tauri::command]` registered in `invoke_handler!` is actually
  called from the frontend (or intentionally dev-only, like
  `reset_sync_data`/`is_debug_build` — see `lib.rs`'s own comments).
- Duplicated logic: repeated patterns worth a shared utility (only if
  used 2+ times).
- Unused/redundant dependencies in package.json; `npm audit` summary.
  In `offlog-desktop/src-tauri/Cargo.toml`: same check for unused
  crates, plus `cargo tree` for anything pulling in a surprisingly
  large dependency graph.
- Oversized files/functions (>~300 lines / >~50 lines = candidate to
  split, using judgment — db.ts and the big view components are large
  partly by design; flag only where splitting genuinely helps).
- Inconsistent naming/organization vs. CLAUDE.md conventions.
- Performance suspects: redundant DB round-trips, missing `limit` on
  `db.find()`, duplicate sync triggers, unthrottled listeners,
  unnecessary `$:` recomputation, missed `invalidateTaskCache()` paths.
- Error handling gaps: any task-mutating call site NOT wrapped in
  try/catch + showError() (this is an audited invariant — regressions
  are findings).
- Hygiene: stale TODOs, debug console.log, secrets in code (config.ts's
  hardcoded CouchDB creds are already tracked as ROADMAP Track C — note
  but don't re-litigate).
- **Security & robustness** (owner-requested addition, 2026-07-09 — every
  check beside the purely visual/behavioral ones above):
  - XSS surface: grep every `{@html ...}` use and confirm the interpolated
    value is a fixed internal constant (e.g. this codebase's own inline
    SVG icon strings), never user-entered text (task title/notes/tags) or
    anything derived from sync data written by another device.
  - `npm audit`: don't just note the vulnerability *count* — check whether
    any flagged advisory's affected code path is actually reachable from
    the shipped bundle (dev/build-only tooling vs. a real runtime
    dependency), and say which.
  - Deep-link / widget-URL handling (`handleWidgetUrl()` in App.svelte,
    `com.offlog.app://...` scheme): confirm untrusted input (a malformed
    or hostile URL) can't reach `eval`, `Function`, or an unguarded
    property/path lookup.
  - `localStorage` contents: confirm nothing sensitive (sync password,
    full task content) is written to a *readable-by-any-script-on-origin*
    key beyond what's already an accepted, documented tradeoff (sync
    URL/credentials — tracked separately as ROADMAP C7, don't re-litigate).
  - **`offlog-desktop/src-tauri/`**: grep for every `unsafe` block (there
    should only be the `TerminateJobObject` FFI declarations in `lib.rs`
    — new ones are a real finding, not routine) and confirm none of them
    are reachable with attacker-controlled input. Confirm
    `pairing.rs`'s generated code/credentials are never written to a log
    line (`log::info!`/`log::warn!` on the pairing path should log
    outcomes, not values). The pairing endpoint's `Access-Control-Allow-
    Origin: *` (`pairing.rs`) is an accepted, documented tradeoff (see
    its own comment) — note but don't re-litigate, same as C7 above.
  - Any `eval(`, `new Function(`, or `innerHTML =` outside the `{@html}`
    cases already covered above.
  - CouchDB sync request construction: confirm the sync URL/credentials
    are never interpolated into something executed or logged in full
    (credentials appearing in a thrown-error message that reaches the UI
    would be a real leak, not just untidy).

Rank each finding:
- [SAFE] — trivial, no behavior change possible
- [REVIEW] — needs owner approval
- [RISKY] — touches doc schema (`_id` prefixes, field names), PouchDB/
  CouchDB sync/replication, soft-delete semantics, positional-"done"
  logic, or storage format → propose only, never auto-fix

STOP after the report. Wait for owner go-ahead before Phase 2.

## Phase 2 — Cleanup & Refactor (after approval)
- Fix approved [SAFE] and [REVIEW] items only, one area at a time.
- Commit style: `maint: <what> (<why>)`, 2-4 lines, per CLAUDE.md's
  token-discipline rules.
- Never change external behavior; if a refactor would, stop and ask.
- Prefer deleting over commenting out. Keep diffs minimal — no
  reformatting untouched code.

## Phase 3 — Optimization (evidence-based only)
- Only where Phase 1 found concrete evidence, never speculatively.
- Offlog priorities: minimize DB round-trips, batch writes, debounce
  sync triggers, avoid redundant reactive recomputation, keep heavy
  modules lazy-loaded (the dynamic-import pattern in Sidebar/CardDetail).
- No new dependencies or caching layers without approval.

## Phase 4 — Verification
1. Re-run the three `offlog-app/` baseline gates (build zero-warning /
   tsc / vitest), and `offlog-desktop/`'s `cargo build` if anything
   under `offlog-desktop/` was touched this pass.
2. Trace the core user flows in code and confirm logic unchanged:
   create task → edit in CardDetail → move across statuses (Kanban) →
   mark done (positional last-column rule) → delete/undo; plus sync
   replication and reminder scheduling if touched. If `offlog-desktop/`
   was touched, also trace: sidecar spawn → pairing code generation →
   `/pair` request → credentials returned (code-level trace is enough —
   this doesn't need a live device pairing test every maintenance pass,
   that's what Track E's own development already verified live).
3. Justify any modified test explicitly.
4. Summarize every changed file in one line each.

## Phase 5 — Documentation & Handoff
1. Update docs/TECH.md if structure changed (including its "Desktop
   (Tauri)" section, if `offlog-desktop/` changed); CLAUDE.md if a
   convention changed. Shrink stale content, don't just add (standing
   rule).
2. If Phase 1/2 produced any fix at all, ship as a normal light release
   (like v3.8.5/v3.9.5): bump version in package.json +
   android/app/build.gradle, add a standard row to docs/CHANGELOG.md's
   table (prefix the row's summary with "Maintenance pass"), commit + tag
   per the release checklist. **If the pass found nothing to fix (a clean
   report), skip the version bump entirely** — nothing changed, so there's
   nothing to ship; just do steps 3 and 4 below.
3. Update this file's **Current pointer** line near the top: Last pass =
   the version just shipped (or, for a clean no-fix pass, the current
   version at the time the pass ran), Next pass due = this minor + 3. Then
   append the pass's full narrative (what was found/fixed) to
   [archive/changelog-archive.md](archive/changelog-archive.md)'s
   "Maintenance pass log" section — don't grow a second tracker here.
4. Final report: done / deferred / [RISKY] left untouched /
   recommendations for next pass.

## Hard constraints (every phase)
- No new features. No new dependencies without explicit approval.
- No rewrites — incremental only.
- Schema, sync logic, storage format, soft-delete, positional-"done":
  propose only, never implement unilaterally. Same bar applies to
  `offlog-desktop/`'s CouchDB config-generation and credential/pairing
  logic (`sync_host.rs`, `pairing.rs`) — it's this app's own sync
  internals, not routine Rust glue.
- Uncertain whether something is safe? Ask, don't guess.
- Long context? Summarize state and suggest a good /clear point.
