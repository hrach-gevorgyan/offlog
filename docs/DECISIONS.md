# Offlog — Manifesto & Architectural Decisions

## Manifesto

A task manager any non-technical person can pick up and use, with zero
knowledge of backends, servers, or databases required. Install the PC app
from a website, install the Android app from Google Play, use either one
completely on its own. When someone has both, the PC acts as the host and
they sync automatically over home Wi-Fi — private, not public, secure
enough on its own. A small, trusted, co-located group (family, a small
team, one office) can also share one local workspace by connecting their
own devices to the same host — a shared board, not individual accounts or
permissions.

The core app stays free, always, with no feature ever paywalled — open
source, self-hostable, forkable. Integrations and automation are
deliberately not part of the free core. Phone-as-host, remote/away-from-
home sync, and per-user accounts or permissions are explicitly not part of
this goal — the PC is the host, sync stays local, and the shared workspace
has no individual boundaries. This section states *why* and *what*,
deliberately not *when* — that's [ROADMAP.md](ROADMAP.md). For anything
this implies but doesn't resolve, see [IDEAS.md](IDEAS.md) rather than
assuming an answer here.

---

## About this document

Below this point: a log of settled choices (decisions) and closed
questions, so future sessions (AI or human) don't re-litigate them.
CLAUDE.md says *what the rules are*; this file says *why*. Add an entry
whenever a real "why not X instead" question gets settled, or a
previously-open question in [IDEAS.md](IDEAS.md) gets a real answer — not
for routine feature work, only for decisions that would otherwise get
re-asked. Keep entries compact — the goal is a fast "has this already
been settled" check, not a full retelling.

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

### Why automatic 3-way conflict merge was explored, then declined (2026-07-18)
Prompted by reading Neighbourhoodie's CouchDB/Svelte blog series (a
real-time multi-user kanban board built on the same PouchDB/CouchDB
replication model Offlog uses) — their second post implements automatic
field-level 3-way merge: diff both conflicting revisions against their
common ancestor, auto-adopt any field only one side touched, and only
surface a real conflict when both sides changed the *same* field. It's a
genuinely good technique, and it looked like a plausible upgrade to
`resolveConflict()`'s current pick-a-winner-wholesale UI. It doesn't fit
Offlog, for a reason specific to how Offlog's conflicts actually arise,
not a general flaw in the technique itself:

**A 3-way merge needs the common ancestor's document body, and
replication never sends it.** CouchDB/PouchDB replication only transfers
leaf revisions — the current winner and whatever's in `_conflicts` — never
the ancestor they diverged from. Neighbourhoodie's own conflicts come from
two browser tabs hitting one live CouchDB server directly (an immediate
409 on a concurrent PUT, where the ancestor is still sitting right there
in the same database) — their own post says as much, explicitly scoping
the technique to that case and excluding "deferred conflicts from offline
replication." Offlog's conflicts are structurally the excluded case:
they come from two devices editing the same task while apart, then
syncing later — by definition the ancestor was never transferred to
whichever side receives the conflict, so there is no local ancestor body
to diff against, ever, for this app's actual conflict shape. This isn't a
"sometimes it works" edge case worth a fallback path; it's close to
"essentially never applies," which would make a merge subsystem mostly
dead code — not acceptable for something meant to ship once and never
revisit.

A second angle considered: reconstruct each side's changed fields from
Offlog's own `log:` docs (which do fully replicate, independent of the
revision tree) instead of the CouchDB ancestor. Rejected too — the
Changelog view has a user-facing "Clear all" button and a 6-month
auto-prune, so a merge subsystem's correctness would silently depend on
data the user is explicitly invited to delete. That fails quietly for
exactly the user who tidied their history, which is worse than the
current explicit manual-resolution UI, not better.

**What shipped instead** (same session): the conflict resolution modal
now shows which device made each competing change and when, using
`ConflictInfo`'s existing `current`/`other` docs' own `source`/
`updated_at` fields — a genuine improvement to the existing pick-a-winner
flow with no new failure modes, unlike merge. PouchDB's own deterministic
conflict resolution (a stable, real winner is always chosen automatically
underneath) plus manual override for anyone who wants to look — see
TECH.md's "Sync reliability" section — remains the permanent model.
Revisit only if Offlog's conflict *source* changes fundamentally (e.g. a
future live multi-device-on-one-server mode where ancestors genuinely are
available locally) — not by re-attempting either variant above against
the same replication-only conflict shape.

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
IDEAS.md's former Q6). Android via Capacitor is unaffected; it never used
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
response, not a product line. This also resolves IDEAS.md's former
"is a hosted relay worth building" / "what number would sustain this"
questions — both removed as moot rather than left open.

### Why the app will never be paywalled or ad-supported, even if that changes (2026-07-02)
Settled in ROADMAP.md's Mission: even if the "no business model at all"
decision above were ever revisited, monetization (if any) would have to
be a separately-sold convenience layer, never a gate on the app's own
functionality. Kept as a standing floor under any future reconsideration —
this constraint doesn't move even if the entry above does.

### Why Tauri, not Electron, for the PC standalone app (2026-07-14)
Resolves IDEAS.md's former Q6. Decided by prototyping both the
riskiest parts rather than debating on paper: a Tauri shell wrapping
`offlog-app/dist` unmodified, a bundled CouchDB run as a managed child
process with per-install generated credentials, and mDNS advertising —
all proven working end-to-end (see ROADMAP.md's E1 for the full detail).
Tauri reuses the existing Svelte/Vite build as-is (no PouchDB-as-UMD-
global changes needed — it loads identically to a browser tab or the
Capacitor build) and produces a far smaller installer than Electron
would, which matters for "someone with no technical background just
downloads and runs it." No reason found during prototyping to reconsider
Electron. This decision covers the *shell* only — installer packaging/
signing and the CouchDB-sidecar hardening (a Windows Job Object is still
needed so a crashed app can't orphan a LAN-reachable CouchDB process)
remain open engineering, tracked in ROADMAP.md's E1, not open questions
about which framework to use.

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

### Why Quick Add's NLP parsing is local regex, not an LLM call (2026-07-19)
Quick Add (Ctrl+N) parses free-typed text ("tomorrow 5pm !high #errand
@project") into due_date/reminder_at/priority/tags/project as the user
types, via `nlpParse.ts`'s `parseQuickAdd()`. This stays a small,
enumerable set of regex patterns — never a call to an external LLM API —
for the same reason the project has no accounts, no telemetry, and no
backend at all (this file's manifesto): a network call on every keystroke of a task
title would be a real network dependency and a real privacy leak (task
titles are often the most sensitive text in the whole app) for a feature
whose actual job — recognizing "tomorrow", "#tag", "!high" — doesn't need
one. A wrong parse is also silent in a way a missed reminder makes
expensive, so ambiguous phrasing is deliberately left as plain text in
the title rather than guessed at (see `nlpParse.ts`'s own header comment)
— a rule-based parser can promise that; an LLM's phrasing-sensitive
output can't. Revisit only if the project's no-backend stance itself
changes, which DECISIONS.md's other entries treat as a closed question.

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

### Why the auto-seeded "Draft" project is archivable, same as any other project (2026-07-21)
Owner question: is it permissible to archive the default "Draft" project
every fresh install seeds into Unsorted? Checked the codebase for any
special-cased dependency on it (a hardcoded fallback destination for
Quick Add or task creation with no project selected, an assumption it's
always active, etc.) — found none. `project:draft`'s only special
handling anywhere is as one of 4 fixed default-seed ids used by
`autoResolvePristineDefaultConflicts()` (auto-resolving a sync conflict
when one side is still provably untouched) — that logic works the same
whether the project is archived or not, since it's about the *doc*
being pristine, not about it being active. Archiving it behaves exactly
like archiving any project the user created themselves.

---

## Security

### Why the App Lock PIN gates the UI, not the data (2026-07-19)
App Lock (B54, ROADMAP.md) blocks the app behind a PIN, but doesn't
encrypt the local PouchDB database — someone with direct filesystem/
IndexedDB access to the device could still read task data without the
PIN. This was a deliberate, owner-confirmed scope choice (via
AskUserQuestion, not assumed): full at-rest encryption is a much bigger
effort — key management, sync implications (every replicating device
would need to agree on how ciphertext moves through CouchDB), and a real
"what if I forget my PIN" recovery story with actual stakes (permanent
data loss, not just inconvenience) — squarely the kind of scope-creep
"security minimal by design, not yet audited" already commits this
project to avoiding until it's actually asked for again. The PIN's job is
narrower and matches most task-manager app locks (Things, Todoist): stop
a passer-by from casually opening the app, not withstand someone who
already has the device and is willing to dig.

First version shipped `AppLock.svelte`'s "Forgot PIN" as a plain
confirm-and-clear (reasoning: no accounts/email — see this file's manifesto — so
there's nothing to verify identity against, and the PIN only gates the
UI anyway). Owner feedback the same day: "it is just removing pin...
like when there is wall as block of road but in middle there is door u
just open and go" — correct. A bypass reachable by anyone with zero
knowledge isn't a lock at all, regardless of how narrow the threat model
is; it's not "recovery for the forgetful owner," it's "no lock." Replaced
with a one-time recovery code (config.ts's `setAppLockPin()`/
`verifyAppLockRecoveryCode()`): a random code shown exactly once, the
moment a PIN is first set, that the user must save themselves (password
manager, notes, written down) — same pattern disk encryption and 2FA
apps use for backup codes. "Forgot PIN" now requires possessing that
code, not just intent. Still no server/account to verify identity
against — this is the strongest recovery route achievable without one,
short of full at-rest encryption's much bigger tradeoffs (still declined,
see above). If no recovery code exists for a device (state predating
this fix), the lock screen says so plainly rather than pretending a
reset is possible.

Revisit only if the project's no-accounts/no-server stance itself changes
(unlikely — see DECISIONS.md's other closed entries on that), since real
encryption needs *something* to hold/recover keys against.

### Biometric unlock sits alongside the PIN, never replaces it (2026-07-20)
Once the owner had the app installed on an actual phone, B54's deferred
second half became buildable — a real device is required to test any
biometric plugin (see B54's original entry above for why it couldn't ship
in the first pass). Scoped via AskUserQuestion before building: uses
`capacitor-native-biometric` (the closest thing to a de facto standard
among community Capacitor biometric plugins — there's no Ionic-official
one, unlike this project's other plugins, per A25's preference), Android
only (no iOS build, see this file's manifesto), opt-in (off by default, a new toggle in
Settings → App Lock that only appears once a PIN exists), and — this is
the load-bearing constraint — it is *only* a faster unlock path on top of
the PIN, never a replacement for it. The PIN remains the only thing that
can set/change/remove the lock or drive "Forgot PIN" recovery; biometric
never touches either. Enabling the toggle requires a real successful
`verifyIdentity()` prompt, not just flipping a flag, so a device with
nothing enrolled can't end up "enabled" with no way to actually unlock.
On the lock screen (`AppLock.svelte`), the OS prompt fires automatically
on mount when enabled — no extra tap — but the PIN input stays visible
and usable the whole time; a cancelled/failed biometric attempt falls
through silently to the PIN screen (not a wrong-PIN shake, since
cancelling isn't a wrong guess).

### Accepted risk: GitHub alert on `glib` 0.18.5 in offlog-desktop, no fix available (2026-07-22)
Dependabot flagged a moderate (6.9) unsoundness advisory in the `glib`
crate (`Iterator`/`DoubleEndedIterator` impls for `VariantStrIter`),
patched in `glib` 0.20.0. Not applicable here: `glib` is a transitive
dependency pulled in by `gtk 0.18.2`, which Tauri 2's `tauri` crate
itself pins to `^0.18` — `cargo update -p glib --precise 0.20.0` fails
outright (`gtk 0.18.2` won't accept it), and `cargo update -p glib`
confirms 0.18.5 is already the newest version compatible with that
constraint. No patched 0.18.x release exists. This is blocked on Tauri
bumping its own `gtk`/`glib` dependency upstream — not something this
project can fix locally by touching `Cargo.lock`.
Risk accepted for now: the unsound code path is internal to `glib`'s
iterator impl, reached only through this app's own (non-adversarial,
local) desktop code — no network-facing input reaches it. Re-check
next time `offlog-desktop`'s Tauri/Cargo deps get bumped for any other
reason (`cargo update -p glib` to see if a newer compatible version has
appeared); don't chase this one proactively before then.

### Why TypeScript stays pinned to ~6.0.2, not 7.x (2026-07-22)
Dependabot proposed TypeScript 6.0.3 → 7.0.2 as part of the v5.7.3
maintenance batch; `npm run build`/`tsc --noEmit`/`vitest run` all
passed clean locally, so it looked safe and was merged. It broke the
release pipeline's `build-android` job on the very next tag push:
`npx cap sync android` failed with `TypeError: Cannot read properties
of undefined (reading 'CommonJS')` while parsing `capacitor.config.ts`.
Root cause is inside Capacitor CLI's own config loader (`requireTS`),
not this project's code — it wasn't exercised by any of the checks
above, since none of them actually run `cap sync`. Reverted to
`~6.0.2` and added a Dependabot `ignore` rule for `typescript` `7.x`
in `dependabot.yml` so it doesn't get silently re-proposed and
re-merged on a green CI run that still can't see this failure mode.
Re-enable once `@capacitor/cli` ships confirmed TS7 support — check by
reading its release notes/changelog for TypeScript 7 compatibility,
not just by trying the bump again the same way.

---

## Mobile / Android

### Why `android:allowBackup="false"` (2026-07-14)
Discovered live while testing Track E's pairing flow: Android's Auto
Backup silently uploads app data (including the local PouchDB WebView
storage) to the user's Google account and restores it automatically on
reinstall — which made "uninstall and reinstall" not actually produce a
fresh install for testing, since old data kept reappearing with no
visible cause. Beyond the testing wrinkle, this is a real product
question: this app's entire pitch is no accounts, no telemetry, no
implicit cloud dependency (this file's manifesto) — a real user's local task data
silently leaving the device via Google's backup infrastructure,
without them explicitly choosing that, contradicts that stance even
though it's a well-intentioned OS feature. Sync (self-hosted CouchDB,
explicit and user-controlled) is the app's own backup mechanism;
Android's implicit one isn't needed on top of it. Set in
`AndroidManifest.xml`.

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

## Public release

### Why BFG Repo-Cleaner over `git filter-branch`/`git filter-repo` for C7's git-history purge (2026-07-17)
C7 required scrubbing a real leaked CouchDB password (and, found during
the same pass, a second username+password pair that had separately
leaked into a committed `.claude/settings.local.json`) from every commit
in the repo's history before it could go public. `git filter-repo` was
the nominally-recommended tool but needs Python, which wasn't installed
and couldn't be added without a heavier system change; hand-rolled `git
filter-branch --index-filter` scripting was tried first (no extra
dependency) and failed twice in ways worth recording so they aren't
repeated — first with `--tree-filter`, which checks out the *entire*
working tree per commit and was still running after 3+ minutes on a
127-commit repo; then with `--index-filter`, where `git rev-parse
"HEAD:$path"` silently resolved against the wrong tree inside filter-
branch's rewrite context (the correct form is `:$path`, reading the
in-progress commit's index, not `HEAD:$path`) — the fixed version still
missed several commits for reasons never fully root-caused. BFG (Java,
already available via Android Studio's JBR) did the entire rewrite,
correctly, across all 127 commits and 71 tags, in under a second, and
needed only one extra flag once discovered: `--no-blob-protection`,
since BFG deliberately skips the *latest* commit on each ref by default
(a safety feature, not a bug) and the leaked `.claude/settings.local.json`
line was still present in the tip commit. **Lesson for any future
history rewrite**: reach for BFG first, and verify completion by
exhaustively grepping every remaining blob in the object database
(`git rev-list --objects --all` → `git cat-file -p` each blob) — spot-
checking specific commits or trusting a tool's own "done" output isn't
sufficient; this pass caught real gaps in its own first two rewrite
attempts exactly that way. Also worth noting: `git clone` from a bundle
does not preserve repo-local config (`user.name`/`user.email`, and it
will *add* a `remote.origin` pointing at whatever bundle file was
cloned from) — both had to be fixed by hand after swapping the rewritten
`.git` into place; check `git config --list --local` after any clone-
based rewrite for exactly this.

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
