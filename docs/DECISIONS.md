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
this goal. This section states *why* and *what*, not *when* — that's
[ROADMAP.md](ROADMAP.md). For anything this implies but doesn't resolve,
see "Open Questions" below.

---

## About this document

Below: a log of settled choices, so future sessions (AI or human) don't
re-litigate them. CLAUDE.md says *what the rules are*; this file says
*why*. Add an entry when a real "why not X instead" question gets
settled — not for routine feature work, only for decisions that would
otherwise get re-asked. Keep entries compact: the goal is a fast "has
this already been settled" check, not a full retelling. Full narrative
detail for anything summarized here always still lives in git history.

---

## Open Questions

Genuinely unresolved, shareable as-is with another AI or a human for
outside input. Not a task list (see [ROADMAP.md](ROADMAP.md)) and not
the decisions log below.

- **Two PC hosts on one LAN.** Today's model is one fixed host, phones
  as clients. Detection-only warning shipped; no "join as client" mode
  built, same tradeoff mesh sync's decline already weighed. Revisit
  only on real demand.
- **Play Store policy risk for local-network sync.** Does the app's
  local network calls trigger review friction (recent Android
  local-network permission prompts, or general policy scrutiny)?
  Should be researched before assuming a smooth listing — relevant to
  ROADMAP.md's open C3 item.
- **Is large-dataset validation a realistic risk?** Shipped once
  already; the owner remains skeptical a single-person task manager
  will ever accumulate enough data for it to matter again. Real-world
  data on how large a single user's dataset gets over years would
  settle this either way.

If an answer emerges, fold it into the relevant section below or
update ROADMAP.md directly, and remove the question here.

---

## Storage & sync

### File attachments: one database, not two (2026-07-29)
Considered a separate `offlog_attachments` PouchDB database specifically
to stop B62's auto-backup from duplicating attachment bytes across all 7
rotated snapshots. Rejected — a second database means a second,
independent sync lifecycle for a problem that turned out not to exist:
the backup's own `db.allDocs({include_docs:true})` call never fetches
attachment binary content in the first place (PouchDB only does that with
an explicit `attachments:true`), so the rotation already excludes them
with zero code change. Went single-database instead: bytes live in
PouchDB's native `_attachments` map right on the task doc, riding the
existing sync with no new code. Accepted tradeoff: those 7 backups can't
restore attachment *content* on their own — same as everything else in
this app, an attachment's real safety net is sync to a second device.

### File attachments: no format allowlist beyond HEIC/HEIF (2026-07-30)
Shipped with a curated extension allowlist, revised the same day —
correctly pushed back on: most allowed formats (docx/xlsx/pdf) already
get no in-app preview anyway, so the allowlist wasn't protecting a
rendering feature, just curating what "counts." An extension check also
isn't real protection: Offlog never executes an attachment, only stores
and downloads it, and the check is trivially bypassed by renaming a
file anyway. Dropped entirely except HEIC/HEIF, which stays rejected on
its own technical merit — canvas-based downscaling can't decode it in a
browser/webview today. Not a security call, a compression-pipeline limit.

### PouchDB as a UMD global, not ESM
`db.ts` loads PouchDB via a `<script>` tag, registering `pouchdb-find`
separately against the resulting global. Intentionally awkward, not an
oversight — the working setup from before build tooling matured, and
switching now would mean re-verifying every corner of sync behavior
against a different bundling path for no functional gain. The ~51KB
duplication is an accepted cost.

### CouchDB-protocol server, not Firebase/Supabase/custom
A CouchDB-protocol server speaks PouchDB's native replication with zero
adapter code — the entire reason PouchDB was picked as the local
database. Any hosted-only backend would make sync quietly depend on a
vendor Offlog doesn't control, contradicting the no-vendor-lock-in
mission even with a free tier. Real Apache CouchDB from project start
through 2026-07-27; `offlog-desktop` now embeds
[NyxDB](https://github.com/hrach-gevorgyan/nyxdb) instead (see below) —
this reasoning is about the *protocol*, not literally CouchDB, and a
manually-configured sync target can still point at real CouchDB too.

### Mesh sync: considered, declined outright (2026-07-03)
Device-to-device sync with no central host was explored in real depth,
then dropped entirely — not deferred. Two reasons: (1) the technical
foundation was weaker than it looked — each Android device would need
a background CouchDB-compatible server reachable while backgrounded,
which even Syncthing-Android only manages with a permanent foreground
notification and manual battery-optimization exemption most users get
wrong, and Android 15 caps that class of service at 6h/24h regardless;
two devices never on the same network still can't sync without a
relay, which quietly breaks the "no server Offlog operates" pitch. (2)
No strategic reason to absorb that cost — Offlog is single-user with no
business model, and mesh sync's payoff scales with a userbase this
project isn't building. CouchDB-protocol sync (self-hosted) remains the
one, permanent transport. Revisit only if real outside demand shows up.

### NyxDB as the embedded sync host, not real CouchDB (2026-07-27)
[NyxDB](https://github.com/hrach-gevorgyan/nyxdb) — a from-scratch Rust
reimplementation of CouchDB's replication protocol, by the same owner —
was trialed as a drop-in swap for the CouchDB `offlog-desktop` bundles.
The protocol layer checked out cleanly (zero `offlog-app` code changes,
full test suite passed including byte-for-byte conflict parity), and
the size win was real: **installer 52.7MB → 4.98MB (~10.6x), installed
footprint 164MB → 20.4MB (~8.0x)**.

First attempt wasn't adopted — real-device pairing surfaced several bugs,
all in `offlog-desktop`'s own new glue code (a storage-directory name
collision with the old CouchDB path, a missing working-directory call, a
loopback-only bind address, an incomplete CORS allowlist), plus one
persistent sync failure that couldn't be root-caused before time ran out
that session. Reverted to CouchDB on `main`.

Same day, round two: the one unresolved failure was reproduced in
isolation against a real NyxDB instance outside the app — it came back
clean, meaning it was very likely a stale-process false alarm from the
first session's rapid rebuild cycles, not a real protocol bug. Proceeded
with the full swap: all CouchDB code/config/vendored binary removed,
every fix from the first attempt carried forward, plus enabling NyxDB's
release-build logging (previously debug-only, which is what made the
first attempt's diagnosis slow).

Two real NyxDB bugs were found and fixed upstream the same day: `_bulk_get`
misreported a tombstoned/losing-conflict revision as `"deleted"` for
documents that were demonstrably live — hit on **every real first-time
device pairing**, since both devices independently create the same
fixed default-seed IDs before ever syncing (fixed in NyxDB v0.1.4). A
follow-up investigation into a cosmetic `seq`-jump anomaly surfaced a
second real bug: a fresh database's very first document got `seq=0`,
invisible to `since=0` — what every first sync starts with (fixed in
v0.1.5). Both verified with a full regression pass afterward. Full
narrative/commit history: the (deleted) `nyxdb-sync-backend` branch, via
`git log --all`/reflog if ever needed again.

### Automatic 3-way conflict merge: explored, declined (2026-07-18)
A genuinely good technique (diff both conflicting revisions against
their common ancestor, auto-adopt fields only one side touched) doesn't
fit Offlog's actual conflict shape: CouchDB/PouchDB replication only
ever transfers leaf revisions, never the ancestor they diverged from.
The technique's real-world precedent (two browser tabs hitting one live
server) has the ancestor sitting right there; Offlog's conflicts come
from two devices editing offline and syncing later, so there is no local
ancestor to diff against, ever, for this app's actual case — that's not
an edge case worth a fallback, it's close to "never applies." Reusing
Offlog's own `log:` docs as a substitute ancestor was considered too,
and rejected — Changelog is user-clearable and auto-pruned, so a merge
subsystem would silently depend on data the user is invited to delete.
What shipped instead: the conflict modal now shows which device made
each change and when, alongside PouchDB's existing deterministic
auto-resolution — real improvement, no new failure modes. Revisit only
if Offlog's conflict *source* changes fundamentally.

---

## Distribution & business model

### PWA support dropped entirely, not patched further (2026-07-12)
Kept causing a recurring stale-icon-after-update problem even after one
targeted fix. Removed outright rather than patched again: the owner only
ever used a plain browser tab and the Android app, so the installable-
web path wasn't earning its complexity/staleness cost. `main.ts` now
actively unregisters any leftover service worker from a previous
PWA-enabled build. A real PC standalone app was still wanted — that
became the Tauri desktop app (see below), explicitly not a second PWA
attempt.

### No business model at all, not even an optional paid layer (2026-07-03)
Offlog is a personal tool built for its owner's own use, not a product
being grown toward revenue — the realistic paying audience for one
person's niche task manager is close to zero without a real userbase,
which building one isn't a goal here either. Stays free and open-source
permanently. If real outside usage and a genuine support need ever
emerges, a donation link is the appropriate scale of response, not a
product line.

### Never paywalled or ad-supported, even if the above changes (2026-07-02)
A standing floor under any future reconsideration of the entry above —
even if that decision were ever revisited, monetization (if any) would
have to be a separately-sold convenience layer, never a gate on the
app's own functionality.

### Brand (name/icon/tagline) reserved separately from the MIT code license (2026-07-23)
MIT covers the source code; it was never meant to hand away the name,
icon, or tagline too. The reservation (see [BRAND.md](BRAND.md)) exists
so a fork can't present itself as official Offlog or as an endorsement
by its owner, and so the option to someday sell/license/hand off the
brand isn't given away by implication just because the code is free.
Forking, modifying, and redistributing under MIT — including
commercially — remains fully allowed; a fork just needs its own name.

### SignPath (not a paid cert) for Windows code signing (2026-07-23)
The Windows installer triggers a SmartScreen "unverified publisher"
warning without a paid code-signing certificate (~$100-400/year).
Checked SignPath Foundation's free program for qualifying open-source
projects first — Offlog is a clean fit (MIT, no proprietary deps,
actively maintained, real releases, no telemetry). Chose to apply
rather than pay since the fit is genuine. Tracked as ROADMAP.md's C3b;
doesn't touch Android (that warning is solved by the Play Store
listing, C3, separately).

**Declined 2026-07-29, not on merit** — the Foundation's response was
explicit that it isn't a code-quality judgment: their program needs
external public-visibility signals (stars/forks/discussion) a repo this
young can't show yet, and explicitly invited reapplication once that
changes. Parked in ROADMAP.md until the project has organic traction to
reapply with.

### Tauri, not Electron, for the PC standalone app (2026-07-14)
Decided by prototyping the riskiest parts rather than debating on
paper — a Tauri shell wrapping the existing build unmodified, a bundled
sync server as a managed child process, mDNS advertising, all proven
working end-to-end. Tauri reuses the existing Svelte/Vite build as-is
and produces a far smaller installer than Electron would, which matters
for "someone with no technical background just downloads and runs it."

### F-Droid explicitly out of scope (2026-07-02)
Offlog isn't positioned as "needs to be in every store"; F-Droid's
audience/process overhead isn't worth it here. Distribution stays
GitHub (source) + a website + Google Play. iOS is out of scope entirely
unless a future community contribution takes it on.

### Repo went public once the credential/history audit cleared (resolved)
Originally gated on two blockers: a hardcoded CouchDB password/LAN IP
in `config.ts` (present in git history too), and a full git-history
purge of leaked credentials. Both are done — the credential design was
replaced by NyxDB's per-install random pairing (no baked-in password
exists anymore), and the history purge is documented below (BFG
Repo-Cleaner). The repo is public on GitHub now; this entry stays only
as the record of what the gate actually was.

---

## UI

### List and Table merged into one view, Table-shaped (2026-07-03)
The two views duplicated most of their code and differed only in
interactions (List: mark-done circle, pin-to-top, archived section;
Table: sortable headers, denser grid). Merged into one, rewritten with
**Table as the design baseline** (real data grid, plain colored text for
due dates instead of pill badges, which kept clipping) with List's
interactions layered on top. Don't reintroduce a separate Table view or
bring back pill-style due badges — both were deliberately removed.
Focus (a later, different view) is "what should I do right now," not a
re-split of this merge.

### Quick Add's NLP parsing is local regex, not an LLM call (2026-07-19)
Parses free-typed text ("tomorrow 5pm !high #errand") into structured
fields as the user types. Stays a small, enumerable regex set, never an
external LLM call — a network call on every keystroke of a task title
(often the most sensitive text in the app) is a real privacy leak and
dependency for a job regex already does. A wrong parse is also silent in
a way a missed reminder makes expensive, so ambiguous phrasing is left
as plain text rather than guessed at — something a rule-based parser can
promise and an LLM's phrasing-sensitive output can't.

---

## Data model

### "Done" is positional (last column), not a boolean field
Enforced invariant, repeated here because a multi-device conflict
scenario could tempt someone to "fix" this with a simpler `done: boolean`.
Don't — the positional model is just "which column," already what
Kanban represents; changing it needs a data migration touching every view.

### Soft-delete only, never `db.remove()` for tasks (except admin paths)
Also an enforced invariant. CouchDB's multi-device replication makes
hard deletes more dangerous, not less: a hard delete that hasn't yet
replicated to an offline device resurrects the doc as a new create when
that device reconnects, unless the delete itself is a replicated
tombstone — which soft-delete already produces for free.

### The auto-seeded "Draft" project is archivable like any other (2026-07-21)
Checked for any special-cased dependency on it (a hardcoded fallback,
an assumption it's always active) — found none. Its only special
handling anywhere is as one of 4 fixed default-seed IDs used for
auto-resolving a pristine-conflict edge case, which works identically
whether the project is archived or not.

---

## Security

### App Lock PIN gates the UI, not the data (2026-07-19)
Blocks the app behind a PIN but doesn't encrypt the local database —
someone with direct filesystem access could still read task data
without the PIN. A deliberate, owner-confirmed scope choice: full
at-rest encryption needs key management, sync implications (every
device would need to agree on how ciphertext moves through the sync
protocol), and a real "forgot my key" recovery story with permanent-
data-loss stakes — bigger than this feature's actual job, which is
stopping a passer-by from casually opening the app, same scope as
Things/Todoist's own app locks.

First version's "Forgot PIN" was a plain confirm-and-clear — correctly
called out as no lock at all ("like a wall with a door in the middle you
just open and go"). Replaced with a one-time recovery code shown once
when the PIN is first set, which the user must save themselves — same
pattern disk-encryption/2FA backup codes use. Still no server to verify
identity against; this is the strongest recovery achievable without one.

### Biometric unlock sits alongside the PIN, never replaces it (2026-07-20)
Uses `capacitor-native-biometric`, Android-only, opt-in. The PIN remains
the only thing that can set/change/remove the lock or drive recovery —
biometric is only ever a faster unlock path on top of it. Enabling the
toggle requires a real successful unlock prompt, not just flipping a
flag, so a device with nothing enrolled can't end up "enabled" with no
way to unlock. A cancelled/failed biometric attempt falls through
silently to the PIN screen.

### Accepted risk: `glib` 0.18.5 advisory in offlog-desktop, no fix available (2026-07-22)
A moderate unsoundness advisory, patched in `glib` 0.20.0 — not
reachable here since `glib` is transitively pinned by Tauri's own `gtk`
dependency (`^0.18`), and no patched 0.18.x release exists. Blocked on
Tauri bumping its own dependency upstream, not fixable locally. The
unsound path is only reached through this app's own local, non-
adversarial code — no network-facing input touches it. Re-check whenever
Tauri/Cargo deps next get bumped for any other reason.

### TypeScript stays pinned to ~6.0.2, not 7.x (2026-07-22)
A Dependabot bump to 7.0.2 passed every local check (build/tsc/tests)
but broke the release pipeline's `cap sync android` step on the very
next tag — a Capacitor CLI config-loader bug none of the local checks
actually exercise. Reverted, with a Dependabot `ignore` rule so it
doesn't get silently re-proposed. Re-enable once `@capacitor/cli`
confirms real TS7 support in its own changelog.

---

## Mobile / Android

### `android:allowBackup="false"` (2026-07-14)
Android's Auto Backup silently uploads local app data (including
PouchDB's WebView storage) to the user's Google account and restores it
on reinstall — a real product conflict with "no accounts, no telemetry,
no implicit cloud dependency," not just a testing inconvenience (it also
made "uninstall and reinstall" not actually produce a fresh install).
Sync (self-hosted, explicit, user-controlled) is this app's own backup
mechanism; Android's implicit one isn't wanted on top of it.

### An official `@capacitor/*` plugin's mechanism beats a custom native bridge event
A hand-rolled bridge call for the Quick Add widget's launch intent fired
before the WebView had a listener attached, silently losing the event on
every cold start. Replaced with `@capacitor/app`'s own launch-URL
listener, which Capacitor's own Bridge already handles the timing/replay
problem for. General lesson: check whether an official plugin already
exposes a native capability directly before writing custom bridge Java.

---

## Public release

### BFG Repo-Cleaner over `git filter-branch`/`git filter-repo` for the history purge (2026-07-17)
Needed to scrub a leaked CouchDB password (and a second leaked
credential pair) from every commit before going public. `git
filter-repo` needed Python, not installed; hand-rolled `git
filter-branch` scripting was tried first and failed twice in ways worth
remembering — `--tree-filter` was still running after 3+ minutes on a
127-commit repo, and `--index-filter` silently resolved paths against
the wrong tree. **BFG (Java) did the entire rewrite correctly, across
all commits and tags, in under a second** — the one extra flag needed
was `--no-blob-protection`, since BFG skips the latest commit on each
ref by default and the leak was still in the tip commit. Lesson for any
future history rewrite: reach for BFG first, and verify completion by
exhaustively grepping every remaining blob in the object database —
spot-checking isn't enough, this pass caught real gaps in its own first
two attempts exactly that way. Also: a bundle-based clone doesn't
preserve repo-local git config and adds its own `remote.origin` — check
`git config --list --local` after any clone-based rewrite.

---

## Process

### CLAUDE.md invariants get written in the same commit as the bug that caused them
The highest-leverage habit in this project's AI-collaboration workflow —
every hard-won invariant in CLAUDE.md was added the moment the bug was
fixed, not retroactively. Turns a one-time fix into institutional memory
that survives across sessions with no persistent AI memory of their own.
Keep doing this without exception.

### The roadmap became finite — a plan with an end (2026-07-22)
After a month of full-intensity building, the owner called the pace
unsustainable: Offlog isn't competing for organic attention in a market
giants own, and continuing at sprint pace would end in burnout-
abandonment, not a finished product. Restructured ROADMAP.md from an
open-ended list into a finite plan with a defined "Done" state, then
maintenance mode. Not the project failing — the mission was always "a
tool for its owner, given away as-is," and *being finished* is that
mission succeeding.

### `reset-dev-env.ps1 -IncludeRelease` is a real data-loss risk, not routine
Found live: ran it as a reflexive "clean up after testing" step and
wiped a genuinely live, working paired session's real data without
checking first. Only for a deliberately confirmed "this data is
disposable" case — never a default step, even right after testing.

### C8 — encrypted the stored sync password per-platform (2026-07-28)
A real CodeQL finding: the sync password sat in plain `localStorage`.
Rejected an app-level "encrypt with a key that's also in localStorage"
scheme as security theater — it protects against nothing, since the
same access that reads localStorage reads the key too. Used each
platform's real primitive instead:
- **Android**: the already-installed `capacitor-native-biometric`
  plugin's Keystore-backed credential storage (AES/GCM,
  `unlockedDeviceRequired` — no prompt needed at sync time), previously
  unused for this.
- **Desktop**: the `windows` crate's DPAPI, ties ciphertext to the
  current Windows user account, transparent, useless if copied
  elsewhere.
- **Plain web**: left as `localStorage` — no browser-level secure
  storage exists, and this build is already a dev/test surface, not
  primary use. An accepted, documented limitation, not swept under an
  app-level scheme that wouldn't actually help.

Existing installs migrate silently from the old plaintext keys, no
re-pairing needed.

### CodeQL findings inside bundled Capacitor plugin source: dismiss manually, don't fight config (2026-07-28)
`paths-ignore`/`.codeqlignore` only filter which files get *extracted*
for interpreted languages — for compiled languages under
`build-mode: manual`, the real Gradle/javac build compiles every plugin
module the app depends on, and CodeQL indexes whatever the compiler
touches regardless of exclusion files. No config lever stops this
without breaking the classpath the manual build-mode exists to provide.
These are real findings about code Offlog doesn't own and can't patch —
dismiss each individually in the Code Scanning UI (**Won't fix**, noting
it's vendored third-party source), not something to keep re-attempting
via workflow changes.

### C3 — privacy policy content (2026-07-28)
What should a privacy policy say when there's genuinely nothing to
disclose, without reading as suspiciously sparse? Resolved by writing
[PRIVACY.md](PRIVACY.md) directly: states plainly that nothing is
collected, then explains *why* for each category a reviewer would
expect (accounts, analytics, sync, permissions) by pointing at the
actual mechanism, not a bare denial. Serves both C3 (Play Store) and the
SignPath application.

### v6.7.0 — task linking: related-only, forward-only, links survive delete (2026-07-28)
Three decisions made explicitly before writing code: **scope** —
related-only, no directional blocks/blocked-by semantics (simpler data
shape, no dependency-tracking logic to maintain). **Storage** —
forward-only on whichever task the link was added from, reverse
direction computed at read time by scanning for it, since PouchDB can't
write two docs atomically and a mirrored write risks landing one-sided.
**Deletion** — a link to a soft-deleted task stays, shown as
"(deleted)", until the task is permanently purged — matches the app's
soft-delete-everywhere philosophy; only a hard purge drops the link.

Shipped first as a bare "see also" list with no click-through — tested
live and correctly called out as not actually useful. Added
click-through navigation and a link-icon badge on cards/rows so a
task's links are visible without opening it speculatively.
