# Offlog — Architectural Decisions

A log of settled choices and why the debate is closed, so future sessions
(AI or human) don't re-litigate them. CLAUDE.md says *what the rules are*;
this file says *why*. Add an entry whenever a real "why not X instead"
question gets settled — not for routine feature work, only for decisions
that would otherwise get re-asked.

---

## Storage & sync

### Why PouchDB as a UMD global, not a pure ESM import
`db.ts` loads PouchDB core via a `<script>` tag in `index.html`
(`public/pouchdb.js`) and registers `pouchdb-find` separately as an ESM
plugin against the resulting global constructor. This is intentionally
awkward, not an oversight: it was the working setup before the project's
build tooling matured, and switching to a pure ESM PouchDB import now
would mean re-verifying every corner of sync/replication behavior against
a different bundling path for no functional gain. The ~51 KB duplication
this causes (documented in TECH.md's v3.4.0 entry, A8) is a known, accepted
cost — not something worth an architectural change to fix.

### Why CouchDB (not Firebase/Supabase/a custom backend) for optional sync
CouchDB speaks PouchDB's native replication protocol with zero adapter
code — this is the entire reason PouchDB was chosen as the local database
in the first place. Any other backend would mean writing and maintaining
a translation layer between "what PouchDB expects" and "what the backend
provides," which directly contradicts the local-first goal of sync being
optional, thin, and swappable. CouchDB is self-hostable, which matters:
using a hosted-only backend (Firebase, Supabase) would make "sync" quietly
depend on a vendor Offlog doesn't control, contradicting the no-vendor-
lock-in mission even if that vendor has a free tier.

### Why mesh sync was considered, then declined outright (2026-07-03)
Mesh/device-to-device sync (every device also acts as a server, paired via
QR code, no central relay) was explored in real depth in ROADMAP.md's
Track D, then dropped entirely — not deferred, not "still the long-term
plan," genuinely off the table. Two reasons, either one alone would have
been enough:

- **The technical foundation was weaker than it first looked.** The
  design needed each Android device to run a background
  CouchDB-compatible HTTP server, reachable even while the app isn't in
  the foreground. The closest working precedent, Syncthing-Android, only
  manages this with a foreground service and a permanent notification,
  plus the user manually exempting the app from battery optimization —
  friction real users regularly get wrong, per Syncthing's own community
  forum. Android 15 made this worse, not better: it now caps that class
  of foreground service at 6 hours of background runtime per 24-hour
  period. Separately, two devices that are never on the same network
  still can't sync without some kind of relay, which quietly contradicts
  the "no server Offlog operates" pitch the whole track was sold on.
- **There was no strategic reason to absorb that cost.** Offlog is a
  single-user personal project with no business model (see below) — mesh
  sync's payoff scales with a multi-device *userbase*, which this project
  isn't trying to build. Spending native-background-service work, a
  mandatory security review, and N-way conflict testing on a feature
  whose main beneficiary would be hypothetical future users wasn't worth
  it.

CouchDB sync remains the one, permanent sync transport — self-hosted,
already works, not going anywhere. If mesh sync is ever revisited, it
should be because a genuinely new reason to want it shows up (e.g. real
other people asking for it), not because this reasoning turned out wrong.

---

## Distribution & business model

### Why PWA support was dropped entirely rather than patched further (2026-07-12)
Shipped in v2.7.0, PWA installability (`vite-plugin-pwa` + a Workbox
service worker) kept causing a recurring staleness problem — an installed/
"Add to Home Screen" build repeatedly showing a stale icon/design after an
update, even after A18's forced `registration.update()` fix (v3.8.0).
ROADMAP.md's A26 tracked this as needing an owner decision rather than
another patch. Resolved by removing PWA outright instead: the owner only
uses Offlog via a plain browser tab and the Android app, so the
installable-desktop-web path wasn't earning its complexity/staleness cost.
`vite-plugin-pwa` was uninstalled, the manifest/service-worker generation
removed from `vite.config.ts`, and `main.ts` now actively unregisters any
leftover service worker from a previous PWA-enabled build on load (so a
browser that already installed it doesn't stay stuck serving a stale
cached build forever). The web build is a normal always-fresh page load
again. A real PC standalone app is still wanted eventually — explicitly
**not** a PWA next time (Tauri vs. Electron, unresolved — see
QUESTIONS.md's Q6). Android via Capacitor is unaffected; it never used
the service worker in the first place (CLAUDE.md's db.ts/Android
invariants).

### Why there's no business model at all, not even an optional paid layer (2026-07-03)
Revises the 2026-07-02 decision directly below, which still assumed some
future paid convenience layer (most likely a hosted sync relay) would
eventually exist. On reflection: Offlog is a personal tool built for its
owner's own use, not a product being grown toward revenue — and the
realistic paying audience for one person's niche task manager is close to
zero without a real userbase, which building one isn't a goal here either.
Chasing a business model before there's evidence anyone besides the owner
wants this app puts the cart before the horse. The app stays free and
open-source permanently; if it ever gets real outside usage and a genuine
support need emerges, a donation link is the appropriate scale of
response, not a product line. This also resolves QUESTIONS.md's former
"is a hosted relay worth building" / "what number would sustain this"
questions — both removed as moot rather than left open.

### Why the app will never be paywalled or ad-supported, even if that changes (2026-07-02)
Settled in ROADMAP.md's Mission: even if the "no business model at all"
decision above were ever revisited, monetization (if any) would have to
be a separately-sold convenience layer, never a gate on the app's own
functionality. Kept as a standing floor under any future reconsideration —
this constraint doesn't move even if the entry above does.

### Why F-Droid is explicitly out of scope (2026-07-02)
Considered and declined by the owner — Offlog isn't being positioned as
"an app that needs to be in every store," and F-Droid's audience/process
overhead isn't worth it for this project's goals. Distribution stays to
**GitHub (source) + a website + Google Play**. iOS is out of scope
entirely (no current owner interest, no immediate plan); if it ever
happens, it would be via community contribution, not an owner-driven
build.

### Why the repo stays private (no git remote yet) until the app is stable and audited (2026-07-02)
Explicit owner decision: going public is a Track C step, not something to
rush ahead of readiness. Two concrete blockers must clear first — a
hardcoded CouchDB password/LAN IP in `config.ts` (present in git history
too) and a general stability/security audit pass. Until both are done,
"public repo" is not attempted, even though GitHub is the confirmed target
platform. See ROADMAP.md's Track C for the tracked release-readiness step.

---

## UI

### Why List and Table merged into one view, and why the merged view is Table-shaped (2026-07-03)
The two views duplicated ~70% of their code (identical search/filter
toolbar, same underlying `filterTasks()`) and differed only in
interactions: List had a one-click mark-done circle, pin-to-top, and the
archived section; Table had click-to-sort column headers and a denser,
better-aligned grid. Owner decision: one view instead of two. A first
merge attempt grafted Table's headers onto List's layout and produced a
cramped hybrid with clipping/alignment problems — the owner judged the
old Table the better foundation ("previous table was better than list"),
so the merged view was rewritten from scratch with **TableView as the
design baseline** (real data grid, generous fixed columns, plain
`dueInk`-colored text for due dates instead of pill badges — text can't
be clipped by a background shape, which the badges repeatedly were) and
List's interactions layered on top. Don't reintroduce a separate Table
view, and don't bring back pill-style due badges in the grid — both were
deliberately removed. B35 ("Focus", shipped as a draft in v4.5.0) is a
third view for a different job — "what should I be doing right now,"
a daily commitment lock — not a re-split of this merge.

---

## Data model

### Why "done" is positional (last column), not a boolean field
Documented as an enforced invariant in CLAUDE.md already — repeated here
because a multi-device CouchDB conflict scenario could tempt someone to
"fix" by adding a `done: boolean` for simpler conflict resolution. Don't.
The positional model is intentional (it's just "which column," which is
what Kanban already represents) and changing it would require a data
migration and touch every view — not something to casually introduce
while solving an unrelated sync problem.

### Why soft-delete only, never `db.remove()` for tasks (except admin paths)
Also an existing CLAUDE.md invariant — recorded here because CouchDB's
multi-device replication makes hard deletes more dangerous, not less: a
hard delete that hasn't yet replicated to a currently-offline device will
resurrect the "deleted" doc as a new create the next time that device
reconnects, unless the delete itself is a replicated tombstone. Soft
delete already produces exactly that tombstone behavior for free.

---

## Mobile / Android

### Why an official `@capacitor/*` plugin's own mechanism beats a custom native bridge event (A25, 2026-07)
The Quick Add home-screen widget used to forward its launch intent via a
hand-rolled `getBridge().triggerJSEvent(...)` call in `MainActivity` — it
fired before the WebView had a listener attached, so the event was lost on
every cold start (A25). Replaced with `@capacitor/app`'s own
`getLaunchUrl()` + `appUrlOpen` listener, which does the same job
correctly, because Capacitor's own Bridge already handles the
timing/replay problem for its own plugins' events — a hand-rolled bridge
call doesn't get that guarantee for free. The general lesson, not just
this one fix: before writing custom native Java for something that feels
like it needs "a bridge event," check whether `@capacitor/local-
notifications`, `@capacitor/app`, etc. already expose the native
capability directly (see A28's `checkExactNotificationSetting()`/
`changeExactNotificationSetting()` for a second example of the same
pattern paying off). Apply this check before adding any new native bridge
code, not just when debugging one that's already broken.

---

## Process

### Why CLAUDE.md invariants get written in the same commit as the bug that caused them
Not a formal decision so much as an observed practice worth preserving
deliberately: every hard-won invariant currently in CLAUDE.md
(`db.find()`'s 25-result default, `row.doc._conflicts` vs
`row.value.conflicts`, `column_id` being a string not an object) was added
at the moment the bug was fixed, not retroactively. This is the highest-
leverage habit in this project's entire AI-collaboration workflow — it
turns a one-time fix into permanent institutional memory that survives
across sessions with no persistent AI memory of their own. Keep doing this
for every future non-obvious fix, without exception.
