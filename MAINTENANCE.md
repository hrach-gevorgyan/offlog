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
2. If Phase 1/2 produced any fix at all, ship as a normal light release
   (like v3.8.5/v3.9.5): bump version in package.json +
   android/app/build.gradle, add a standard row to docs/CHANGELOG.md's
   table (prefix the row's summary with "Maintenance pass"), commit + tag
   per the release checklist. **If the pass found nothing to fix (a clean
   report), skip the version bump entirely** — nothing changed, so there's
   nothing to ship; just do steps 3 and 4 below.
3. Update the tracker below: Last pass = the version just shipped (or, for
   a clean no-fix pass, the current version at the time the pass ran),
   Next pass due = this minor + 3.
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
Last pass: v4.7.0 (2026-07-09 — third pass, clean report, no fixes needed
so no version was bumped for it; findings not written to CHANGELOG.md
since nothing shipped).
Next pass due: **after v4.10.0 ships**, then continuing the every-3-
releases cadence from there (v4.13.0, v4.16.0, …) — see docs/ROADMAP.md's
sequencing table, which has these same points marked inline.
