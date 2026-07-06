# MAINTENANCE PASS — Offlog

Scheduled maintenance routine, tailored to this repo. This is NOT a
feature session: external behavior must remain identical. Read this whole
file before touching code. Cadence: **every 3 minor versions** (tracker at
the bottom).

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

## Phase 1 — Analysis (no changes)
Produce a findings report covering:
- Dead code: unused files, functions, exports, components, CSS.
- Duplicated logic: repeated patterns worth a shared utility (only if
  used 2+ times).
- Unused/redundant dependencies in package.json; `npm audit` summary.
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
1. Re-run the three baseline gates (build zero-warning / tsc / vitest).
2. Trace the core user flows in code and confirm logic unchanged:
   create task → edit in CardDetail → move across statuses (Kanban) →
   mark done (positional last-column rule) → delete/undo; plus sync
   replication and reminder scheduling if touched.
3. Justify any modified test explicitly.
4. Summarize every changed file in one line each.

## Phase 5 — Documentation & Handoff
1. Update docs/TECH.md if structure changed; CLAUDE.md if a convention
   changed. Shrink stale content, don't just add (standing rule).
2. Ship as a normal light release (like v3.8.5/v3.9.5): bump version in
   package.json + android/app/build.gradle, add a standard row to
   docs/CHANGELOG.md's table (prefix the row's summary with
   "Maintenance pass"), commit + tag per the release checklist.
3. Update the tracker below: Last pass = this version, Next pass due =
   this minor + 3.
4. Final report: done / deferred / [RISKY] left untouched /
   recommendations for next pass.

## Hard constraints (every phase)
- No new features. No new dependencies without explicit approval.
- No rewrites — incremental only.
- Schema, sync logic, storage format, soft-delete, positional-"done":
  propose only, never implement unilaterally.
- Uncertain whether something is safe? Ask, don't guess.
- Long context? Summarize state and suggest a good /clear point.

## Maintenance tracker
Last pass: v3.9.7 (2026-07-05 — first pass; see CHANGELOG.md's 3.9.7 row)
Next pass due: **after v4.4.0 ships** (owner override, 2026-07-05 — the
strict "every 3 minor versions" count from v3.9.7 would land around
v3.12.x/early v4.x, but the owner explicitly chose to skip that catch-up
and resume the cadence at v4.4.0 instead). After that: another pass after
**v4.7.0**, then continuing the every-3-releases cadence from there
(v4.10.0, v4.13.0, …) — see docs/ROADMAP.md's sequencing table, which
has these same points marked inline.
