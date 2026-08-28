# Offlog — Manifesto & Architectural Decisions

## Manifesto

A task manager any non-technical person can pick up and use, with zero
knowledge of backends, servers, or databases required. Install the PC app
from a website, install the Android app from Google Play, use either one
completely on its own. When someone has both, they sync automatically over
home Wi-Fi — private, not public, secure enough on its own. A PC acting as
the host is how that works, and stays that way — removing the need for one
machine to be the host was investigated as mesh sync and closed for good
(see "Mesh sync: reopened, investigated, closed for good" below). A small,
trusted, co-located group (family, a small team, one office) can also share
one local workspace by connecting their own devices to the same host — a
shared board, not individual accounts or permissions.

The core app stays free, always, with no feature ever paywalled — open
source, self-hostable, forkable. Integrations and automation are
deliberately not part of the free core. Remote or away-from-home sync and
per-user accounts or permissions are explicitly not part of this goal; sync
stays on the local network, between devices their owner controls. This
section states *why* and *what*, not *when* — that's
[roadmap.md](roadmap.md). For anything this implies but doesn't resolve, see
"Open Questions" below.

---

## About this document

Below: a log of settled choices, so future sessions (AI or human) don't
re-litigate them. CLAUDE.md says *what the rules are*; this file says
*why*. Add an entry when a real "why not X instead" question gets
settled — not for routine feature work, only for decisions that would
otherwise get re-asked. Keep entries compact: the goal is a fast "has
this already been settled" check, not a full retelling. Full narrative
detail for anything summarized here lives in git history.

---

## Open Questions

None open.

Genuinely unresolved questions live here — shareable as-is for outside
input, and distinct from both the decisions log below and roadmap.md's
planned work. When one is answered, fold the answer into the relevant
section below, or move it to roadmap.md if it became work, and remove it
from here.

---

## Storage & sync

### Scale work waits for a threshold, not a schedule

Whether one person's task manager ever accumulates enough data for scale
to matter is still unanswered, and cannot be answered from an empty
database. The measuring tool exists —
`offlog-desktop/scripts/db-metrics/` reports counts, size percentiles,
attachment bytes and revision depth from any host — so the question is not
"can we measure" but "is there anything to measure yet".

Existing coverage is already ahead of real use. `perfGuard.test.ts`
exercises 400 tasks across 8 projects and asserts round-trip counts rather
than wall-clock timings, so it catches the regressions that matter at a
size daily use has not reached. Optimising further would be guessing.

This lived in roadmap.md for several versions as an open item, which was
wrong: it is not work, it is a condition. Re-measure and revisit only when
one of these is true, never on a schedule:

- more than 400 active tasks, so `perfGuard.test.ts` stops representing
  reality
- more than ~5,000 `log:` docs surviving the 6-month prune
- attachments past a few tens of MB, where sync time starts to show

### File attachments: one database, not two
Attachment bytes live in PouchDB's native `_attachments` map on the task
doc, riding the existing sync with no new code. A separate
`offlog_attachments` database would mean a second, independent sync
lifecycle to avoid duplicating bytes across rotated auto-backups — but
the backup's `db.allDocs({include_docs:true})` never fetches attachment
binary content (PouchDB only does that with an explicit
`attachments:true`), so rotation already excludes them. Accepted
tradeoff: those backups can't restore attachment *content* on their own —
an attachment's real safety net is sync to a second device.

### File attachments: no format allowlist beyond HEIC/HEIF
An extension allowlist protects nothing here: Offlog never executes an
attachment, only stores and downloads it, and the check is bypassed by
renaming a file. Most formats it would have allowed (docx/xlsx/pdf) get
no in-app preview anyway. HEIC/HEIF stays rejected on technical merit —
canvas-based downscaling can't decode it in a browser/webview. That's a
compression-pipeline limit, not a security call.

### PouchDB as a UMD global, not ESM
`db.ts` loads PouchDB via a `<script>` tag, registering `pouchdb-find`
separately against the resulting global. Intentional, not an oversight —
switching would mean re-verifying every corner of sync behavior against a
different bundling path for no functional gain. The ~51KB duplication is
an accepted cost.

### CouchDB-protocol server, not Firebase/Supabase/custom
A CouchDB-protocol server speaks PouchDB's native replication with zero
adapter code — the entire reason PouchDB was picked as the local
database. Any hosted-only backend would make sync quietly depend on a
vendor Offlog doesn't control, contradicting the no-vendor-lock-in
mission even with a free tier. This reasoning is about the *protocol*,
not literally CouchDB: `offlog-desktop` embeds
[NyxDB](https://github.com/hrach-gevorgyan/nyxdb), and a manually
configured sync target can point at real CouchDB too.

### Mesh sync: reopened, investigated, closed for good
**Closed.** Declined originally, reopened as the primary direction, then
closed again after a design pass that measured instead of argued. The
evidence — a spike against two real NyxDB instances, plus a 47-row
scenario matrix — is kept out of the repo, like the build narrative: what a
reader needs is the decision and the reasoning below, not a closed
investigation's scaffolding.

**What the spike proved works.** Three-way convergence, a client paired
with one host receiving another host's data, concurrent writers losing
nothing, and a cross-peer conflict surviving with both peers agreeing on
the winner. All client-driven, over HTTP, against real servers. So the
protocol, PouchDB and NyxDB are *not* the obstacle, and NyxDB needs no
change — it has no `_replicate` and cannot initiate replication, and does
not need to.

**What killed it is Android, specifically:**
- **A phone cannot host in the background.** Already known: Android 15 caps
  that service class at 6h/24h and it needs a permanent notification plus a
  manual battery-optimisation exemption.
- **A phone cannot host in the foreground either, usefully.** `onPause`
  fires on screen-off, so "serves while the app is open" really means
  "while the screen is on" — minutes a day, and only if the other person
  happens to be looking at their phone at the same moment.
- **Android sends SIGKILL, not SIGTERM.** There is no clean-shutdown hook,
  so an embedded database on a phone cannot guarantee its own integrity
  across a normal app kill.
- **Background sync is impossible, not merely expensive.** The app's data
  lives in the WebView origin's IndexedDB (`core.ts`'s
  `new PouchDB('offlog')`). A WorkManager job runs in a different context
  and cannot read it. So no background job can carry data, however cheap it
  would have been.

Together those mean phone-to-phone sync with no PC present cannot work.
Not "not yet" — the platform forbids each available route.

**What remains possible and was deliberately not built.** Two desktops each
holding everything, with phones using whichever is reachable. That is real,
needs no NyxDB change, and was verified by the spike. It was not built
because its value still depends on some PC being switched on, which is the
same dependency mesh was meant to remove — a smaller version of the problem
rather than a fix for it. Revisit only if daily use makes "one specific PC
is off" a recurring annoyance.

**What the pass paid for.** Three real defects in single-host code, found
while modelling mesh and fixed independently: a seed-clearing guard that
treated "zero tasks" as "untouched" and deleted renamed spaces, a conflict
scan that walked six months of `log:` docs on every sync settle, and an
error message blaming the network while the user was on it.

Do not reopen on the strength of a new Android API without first checking
all four blockers above — they are independent, and closing one changes
nothing.

### Remote access over the user's own VPN: not pursued
Pointing the sync URL at a Tailscale or WireGuard address instead of a LAN
address would let a phone reach the home host from outside. It needs no
Offlog-operated relay and no account, so it does not breach the "no server
we run" line — but it is still away-from-home sync, which the manifesto
excludes, and it asks every user to run a VPN. Closed unless a real need
appears in daily use.

### NyxDB as the embedded sync host, not real CouchDB
[NyxDB](https://github.com/hrach-gevorgyan/nyxdb) is a from-scratch Rust
reimplementation of CouchDB's replication protocol, by the same owner.
`offlog-desktop` embeds it instead of bundling real CouchDB: the protocol
layer is a drop-in (zero `offlog-app` code changes, full test suite
passing including byte-for-byte conflict parity) and the size win is
large — **installer 52.7MB → 4.98MB (~10.6x), installed footprint 164MB →
20.4MB (~8.0x)**. Requires NyxDB ≥ v0.1.5: v0.1.4 fixed `_bulk_get`
misreporting a tombstoned/losing-conflict revision as `"deleted"` for a
live document (hit on every first-time device pairing, since both devices
independently create the same fixed default-seed IDs before syncing), and
v0.1.5 fixed a fresh database's first document getting `seq=0`, invisible
to `since=0` — what every first sync starts with. Keep NyxDB's
release-build logging enabled; debug-only logging makes diagnosis slow.

### Automatic 3-way conflict merge: explored, declined
Diffing both conflicting revisions against their common ancestor doesn't
fit Offlog's conflict shape: CouchDB/PouchDB replication only transfers
leaf revisions, never the ancestor they diverged from, and Offlog's
conflicts come from two devices editing offline and syncing later — so no
local ancestor ever exists. Offlog's own `log:` docs can't substitute for
one either: the Changelog is user-clearable and auto-pruned, so a merge
subsystem would depend on data the user is invited to delete. Instead the
conflict modal shows every competing version and what differs between
them, and the person picks one — see the entry below. Revisit only if the
conflict *source* changes fundamentally.

### Conflict resolution stops at "show both clearly and let them pick"

Settled by the first feature audit (roadmap.md), which walked the screen
with real two-device conflicts rather than reading the code.

**What conflicts actually are here.** They need the *same document* changed
on both sides while apart. A week away making a hundred one-sided changes
produces none: measured through the real replicator, a week of completing,
deleting, archiving, creating spaces and projects and attaching files
replicated with **zero** conflicts. Volume is irrelevant; concurrency on one
document is the only trigger. For one person, who is on one device at a
time, that is rare. The one guaranteed case is first pairing of two
installs that each already minted the fixed seed ids, and
`autoResolvePristineDefaultConflicts()` settles that silently.

The exception is the shared-workspace case the manifesto allows — a family
or small team on one host, where two people genuinely do touch the same
task. That is where the screen earns its keep.

**So it is a safety net, not a daily surface**, and it is finished. The
audit's fixes were the right level of investment: show every version, name
the fields that differ, mark which is newest, and confirm before discarding.
A screen someone meets twice a year has to be readable cold.

**Not building further**, specifically:
- no field-level or "merge both" UI. Merging wrongly is worse than choosing
  wrongly, because a wrong choice is at least visible in the result
- no three-way diff view. The ancestor does not exist locally — see the
  entry above
- no automatic resolution beyond the pristine-defaults case. Keeping
  PouchDB's winner is arbitrary rather than newest, and maintenance used to
  do exactly that, silently discarding one device's edit

One limit worth stating rather than solving: "newest" comes from each
device's own clock. Timezones are handled — every timestamp is UTC — but a
device set to the wrong time will claim an edit it made earlier. The label
says so, and the screen shows the content so the reader never has to trust
it.


### Delete is soft for tasks and permanent for projects, on purpose

Settled by the second feature audit (roadmap.md), which walked the whole
lifecycle — delete, undo toast, Recycle, delete forever, empty, and the
automatic prune — rather than reading the four functions separately.

**The asymmetry is deliberate and is stated at the point of action.**
Deleting a task is `deleted: true`: it lands in Recycle, is restorable for
three months, and its attachment bytes are kept that whole time because it
might come back. Deleting a *project* hard-removes it and every task in it,
and its confirm says so — "and all its tasks? This can't be undone." Soft
deletes on a project would mean a hidden tree of tasks belonging to
something the user believes is gone.

**Undo has two ranges and both are needed.** The toast covers the last
three deletions for five seconds each, for the misclick. Recycle covers
everything else, shows what project each task came from, and says
"auto-removed after 3 months" on its own header — so the prune is not a
surprise.

**Restoring must land somewhere the user can see.** This was the audit's
main finding: `removeColumn()` moves the tasks it can see, and one sitting
in Recycle is not among them, so restoring put the task back on a status
that no longer existed and nothing rendered it. Restore now lands it on the
project's first status, and if its project has since been archived it comes
back archived alongside it, so it reappears when the project does rather
than sitting as an inconsistency until a maintenance run.

**What is accepted rather than fixed.** Permanently deleting a task leaves
its id in the `related` / `blocked_by` arrays of tasks that pointed at it.
Reads already ignore ids that do not resolve, so nothing breaks; the ids are
cleaned by a maintenance run. Scanning every task on each delete to strip
them would make the common case pay for the rare one.


### Attachments: stored simply, handed over per platform

Settled by the third feature audit (roadmap.md), which attached, opened,
removed and backed up real files rather than reading the code.

**The one that mattered: files could not be opened on either shipping
platform.** The opener handed a blob URL to an `<a download>`, which works
in a browser and nowhere else — Capacitor's Android WebView has no download
manager to receive it, and neither does Tauri's WebView2. The codebase
already knew: `downloadBlob()` documents that exact gap for backup exports
and works around it. The attachment opener never got the same treatment, so
a file could be attached, synced and backed up on Android and Windows, and
never opened again. It now writes to cache and offers the share sheet on
Android, opens a save dialog on desktop, and keeps the blob download in a
browser — written for binary, since `downloadBlob()`'s UTF-8 path would
corrupt every image and PDF.

**Removing an attachment asks first.** It is the only irreversible delete on
the card: a task goes to Recycle with an undo toast behind it, while these
bytes are gone on the click.

**Backups carry the bytes, and that is the expensive part.** Every backup is
a full snapshot with attachments inlined as base64, and seven are kept — so
the folder grows with file size, not task count: 5.7 MB of attachments
measured at 6.2 MB per file and 43 MB across the seven. That storage sits
outside IndexedDB, so the estimate Settings reads never counted it; the
figure is now shown next to the database breakdown. Collecting the JSON is
not a cost worth optimising — 762 docs with 5.7 MB of attachments took
55 ms.

**Left as they are, deliberately.** No format allowlist beyond HEIC/HEIF
(see the entry above). The 10 MB per file and 10 per task caps are stated
before you hit them — the button disables and says so. Images are downscaled
on the way in, so the caps bite on documents rather than photos.

### Recurrence advances one occurrence per completion, never by wall clock

Settled by the fourth feature audit (roadmap.md), which found nothing to
change — recorded because the audit nearly changed the wrong thing.

A recurring task missed for five weeks comes back still weeks overdue: one
completion advances one occurrence, so catching up means ticking it once per
missed cycle. That reads like a defect and is not one. Advancing once makes
the next due date **a pure function of the document** — base date, cadence,
interval — with no dependency on when the completion happens to be
processed. Two devices completing the same task offline compute the same
next date. A wall-clock catch-up loop would make the result depend on "now",
so the same completion on a phone and a laptop would produce different due
dates and a conflict over which is right. For a local-first app that is the
wrong trade, and the sharp edge has an ordinary escape: edit the due date,
or use Skip.

It also keeps the tests honest. Because the reset never reads the clock,
recurrence tests assert fixed dates and stay true as the calendar moves.

**Everything else held up.** Month-end clamps rather than overflowing (Jan 31
monthly lands on Feb 28, or Feb 29 in a leap year); a reminder keeps its
local wall-clock time across a DST boundary; "every N" and weekdays-only
compose; a missing interval means 1, so documents written before the field
existed behave unchanged; completion resets the checklist and returns the
card to the first column in place, never spawning a second card; and the
card summarises itself in words — "Repeats every 3 days" — before anything
is expanded.

**The interval control stays.** It is one number beside the cadence, already
explained by that summary line, and covered by tests. There is no evidence
from use that it confuses anyone, and removing a working control on a
suspicion is not an improvement.

### What survives weeks of running, and how it is kept that way

Settled by the fifth feature audit (roadmap.md), aimed at the class that
breaks only after a while — nothing here shows on a fresh install.

**The one real defect was in the task cache.** `fullReload()` read the change
sequence and the documents concurrently. That sequence is where the next
catch-up resumes, so it has to be a lower bound on what the cache holds:
read together, a write landing in between is counted by the sequence but
missing from the rows, and the catch-up resumes past it. The cache then
serves a stale copy of that task until something forces another full reload,
which normally never happens — a wrong title or due date that simply sticks.
Sync delivers writes at arbitrary moments, so it needs weeks and a second
device, not a fresh install. The sequence is read first now; the worst case
is replaying a change the rows already have.

**Anything periodic runs on a timer, never on app start.** The desktop app
is tray-resident, so a session can last weeks and "next launch" may never
come — the lesson auto-backup taught when it silently stopped. Retention
pruning and the backup all run hourly, each with its own "is it due" check.

**Reminders past setTimeout's ~24.8-day ceiling are skipped and re-armed
later**, by the `rescheduleAll()` that follows every store reload. A task
manager sees writes most days, so they self-heal; the residual case is a
reminder set more than 24.8 days out on an app that is then never touched
again until after it is due.

**Log growth is not a problem at the volume the roadmap worried about.**
Measured at 5,240 entries: recent-logs 34 ms, a task's own history 8 ms
(indexed), integrity check 26 ms and no longer reading logs at all,
retention pruning 1 ms when nothing is due — it range-scans to the cutoff
rather than reading every entry. Retention was exercised with 1,200
genuinely expired entries and removed exactly those.

Bulk writes do block the UI while they run — 5,000 inserts or 1,200 deletes
make the app unresponsive for tens of seconds. That is inherent to one
thread over IndexedDB, only reachable by a first-pair sync or a restore, and
not worth a worker for a single-user app.

---

## Distribution & business model

### PWA support dropped entirely, not patched further
The installable-web path kept causing stale-icon-after-update problems and
wasn't earning its complexity, since real use is a plain browser tab plus
the Android app. Removed outright; `main.ts` actively unregisters any
leftover service worker from a previous PWA-enabled build. The PC
standalone app is the Tauri app, explicitly not a second PWA attempt.

Consequence worth knowing: with no service worker, the web build cannot
load while offline. Its data is local (IndexedDB) and works offline once
loaded, but the page itself needs the network to start.

### No business model at all, not even an optional paid layer
Offlog is a personal tool built for its owner's own use, not a product
being grown toward revenue — the realistic paying audience for one
person's niche task manager is close to zero without a userbase, and
building one isn't a goal. Stays free and open-source permanently. If
real outside usage and a genuine support need ever emerge, a donation
link is the appropriate scale of response, not a product line.

### Never paywalled or ad-supported, even if the above changes
A standing floor under any future reconsideration of the entry above:
monetization, if any, would have to be a separately-sold convenience
layer, never a gate on the app's own functionality.

### Brand (name/icon/tagline) reserved separately from the MIT code license
MIT covers the source code only, not the name, icon, or tagline. The
reservation (see [brand.md](brand.md)) exists so a fork can't present
itself as official Offlog or as an endorsement by its owner, and so the
option to someday sell/license/hand off the brand isn't given away by
implication. Forking, modifying, and redistributing under MIT —
including commercially — remains fully allowed; a fork just needs its own
name.

### Windows code signing: not pursued, paid or free
The installer triggers a SmartScreen "unverified publisher" warning
without a code-signing certificate (~$100-400/year). Paying is rejected
outright — putting a yearly fee between a person and the right to hand
out software they wrote runs against the reason this is open source at
all. SignPath Foundation's free open-source program was applied to and
declined for insufficient public-visibility signals, and reapplying is
not planned: a free-for-open-source programme that asks for popularity
first inverts its own purpose, since the projects that most need help
being trusted are precisely the ones it turns away, and by the time a
project qualifies the favour is worth far less — so the search is for a
genuinely free way to distribute the desktop app instead. Until one
exists, the accepted position is that Windows shows a first-install
warning. Desktop updates are signature-verified regardless — a separate
mechanism, already in place. Android's equivalent warning is solved by
the Play Store listing, not by code signing.

### Tauri, not Electron, for the PC standalone app
Decided by prototyping the riskiest parts — a Tauri shell wrapping the
existing build unmodified, a bundled sync server as a managed child
process, mDNS advertising — all proven working end-to-end. Tauri reuses
the existing Svelte/Vite build as-is and produces a far smaller installer
than Electron, which matters for "someone with no technical background
just downloads and runs it."

### Distribution: GitHub, a website, and Google Play
Source from GitHub, builds from a website, Android from Google Play.
Nothing else is worth the process overhead for a project this size.

### iOS: community contribution only, PWA is the zero-cost path
A native iOS app needs a Mac, Xcode, and Apple's $99/year developer
account — the fee alone contradicts the zero-cost stance, so this is
community-contribution only, never planned work. The nearest zero-cost route onto
an iPhone is Safari's Add to Home Screen, which is a shortcut, not an
installed app — and since PWA support was deliberately removed (see that
entry), it will not load without a network connection. Add no widgets, no
lock-screen notification actions, and untested LAN sync. If it ever matters, the
first step is testing the current web build on a real iPhone, not
building a native app.

---

## UI

### List and Table merged into one view, Table-shaped
The two views duplicated most of their code and differed only in
interactions. Merged into one with **Table as the design baseline** (real
data grid, plain colored text for due dates instead of pill badges, which
kept clipping) and List's interactions layered on top. Don't reintroduce
a separate Table view or bring back pill-style due badges. Focus (a
separate view) is "what should I do right now," not a re-split of this
merge.

### Calendar sync (.ics), live-subscribe or one-shot export: declined
A live-subscribe feed (OS calendar polls a local URL) doesn't work: the
desktop app has no tray-independent background persistence for the sync
host outside a running window, so the feed would only be reachable while
Offlog happens to be open, which most calendar polls would miss. Android
can't host the feed at all (no server on that platform, and standing one
up isn't worth the background-service surface). A plain one-shot ".ics
export" fallback only serves rare cases (a weekly planning glance,
sharing one deadline, a one-time migration) and doesn't justify the UI
and code. Declined in both forms — don't re-propose without a real
recurring use case, or the desktop app gaining full background
persistence.

### Quick Add's NLP parsing is local regex, not an LLM call
Quick Add parses free-typed text ("tomorrow 5pm !high #errand") into
structured fields as the user types. It stays a small, enumerable regex
set, never an external LLM call — a network call on every keystroke of a
task title (often the most sensitive text in the app) is a real privacy
leak and dependency for a job regex already does. Ambiguous phrasing is
left as plain text rather than guessed at, a promise a rule-based parser
can make and a phrasing-sensitive LLM can't.

---

## Data model

### "Done" is positional (last column), not a boolean field
Enforced invariant, repeated here because a multi-device conflict
scenario could tempt someone to "fix" this with a simpler `done: boolean`.
Don't — the positional model is just "which column," already what
Kanban represents; changing it needs a data migration touching every view.

### Soft-delete only, never `db.remove()` for tasks (except admin paths)
Also an enforced invariant. Multi-device replication makes hard deletes
more dangerous, not less: a hard delete that hasn't yet replicated to an
offline device resurrects the doc as a new create when that device
reconnects, unless the delete itself is a replicated tombstone — which
soft-delete produces for free.

### Sub-projects and rethinking positional "done": both parked
Nested project hierarchy touches the data model, every project-picker, and
sidebar/Dashboard nesting at once — the kind of architecture experiment
that stops a project finishing. Revisiting the positional-"done" rule is
the same shape. Both are parked rather than declined: revisit only if real
daily use demands it, not because either is a good idea in the abstract.
Full context in [archive/history.md](archive/history.md)
(B28, B33).

### The auto-seeded "Draft" project is archivable like any other
Nothing special-cases it — no hardcoded fallback, no assumption it stays
active. Its only special handling anywhere is as one of 4 fixed
default-seed IDs used for auto-resolving a pristine-conflict edge case,
which works identically whether the project is archived or not.

---

## Security

### App Lock PIN gates the UI, not the data
The PIN blocks the app but does not encrypt the local database — someone
with direct filesystem access can still read task data without it. A
deliberate scope choice: at-rest encryption needs key management, sync
implications (every device agreeing on how ciphertext moves through the
protocol), and a "forgot my key" story with permanent-data-loss stakes —
bigger than this feature's job, which is stopping a passer-by from
casually opening the app, the same scope as Things'/Todoist's app locks.

Recovery is a one-time code shown when the PIN is first set, which the
user must save themselves — the disk-encryption/2FA backup-code pattern.
A plain confirm-and-clear "Forgot PIN" is not acceptable; it makes the
lock meaningless. With no server to verify identity against, this is the
strongest recovery achievable.

### Biometric unlock sits alongside the PIN, never replaces it
Uses `capacitor-native-biometric`, Android-only, opt-in. The PIN remains
the only thing that can set/change/remove the lock or drive recovery —
biometric is only ever a faster unlock path on top of it. Enabling the
toggle requires a real successful unlock prompt, not just flipping a
flag, so a device with nothing enrolled can't end up "enabled" with no
way to unlock. A cancelled/failed biometric attempt falls through
silently to the PIN screen.

### TypeScript 7 is allowed, with `cap sync android` as a required gate
TS 7 passes build/tsc/tests but broke `cap sync android` through a
Capacitor CLI config-loader bug none of the local checks exercise; fixed
from `@capacitor/cli` 8.5.0 onward. Standing rule: a Capacitor or
TypeScript upgrade must be verified by diffing the generated
`android/app/src/main/assets/capacitor.config.json` against
`capacitor.config.ts` — every value must survive, including the nested
`plugins.LocalNotifications.smallIcon`/`iconColor` pair, which a silent
loader fallback to defaults would drop. A config that parses to the right
values is the bar, not a command that exits 0.

### Sync password is encrypted with each platform's real primitive
The stored sync password must not sit in plain `localStorage`. An
app-level "encrypt with a key that's also in localStorage" scheme is
security theater — the same access that reads localStorage reads the key.
Each platform uses its own primitive instead:
- **Android**: `capacitor-native-biometric`'s Keystore-backed credential
  storage (AES/GCM, `unlockedDeviceRequired` — no prompt at sync time).
- **Desktop**: the `windows` crate's DPAPI, tying ciphertext to the
  current Windows user account, transparent and useless if copied
  elsewhere.
- **Plain web**: left as `localStorage` — no browser-level secure storage
  exists, and this build is a dev/test surface, not primary use. An
  accepted, documented limitation.

Existing installs migrate silently from the old plaintext keys, no
re-pairing needed.

### Versioning: MAJOR means a compatibility break, nothing else
Offlog has no public API, so SemVer's "breaking change" has to be defined
against the interfaces it does expose: the document schema, the storage
format, the backup/export format, and replication compatibility. MAJOR is
reserved for a change where an older install can no longer read, sync or
restore without a migration. A feature is never MAJOR, however large.
MINOR is a user-visible capability; PATCH is a fix or maintenance work.

This reverses how versions were assigned through v6.5.0, which produced
six majors in about a month for releases that were all additive -- v4.0.0
was due-date shortcuts and tag autocomplete. A number chosen by how
significant a release felt tells a user nothing about upgrade risk, which
is the only thing a version number is for.

The same drift left 11 versions documented but never tagged, two-segment
tags (`v2.4`), a `v2.4.1-fixes` tag, and a `versionCode` that had wandered
to 117 against 108 tags. So the rules are enforced by
`offlog-app/scripts/version.js`, not by memory: `version:set` writes all
three version sources at once, `version:check` fails if they disagree or
if either doc lacks an entry, CI runs it on every push, and `release.yml`
refuses to publish a tag that does not match.

`versionCode` is derived, never typed: `MAJOR*10000 + MINOR*100 + PATCH`.
Play rejects a decreasing code permanently, so the formula is fixed for
good; it clears every hand-assigned code already published (highest 117)
and caps MINOR/PATCH at 99. Retrofitted onto 6.5.0 as 60500 -- higher than
the 117 its published APK carries, so upgrades are unaffected.

### Cleartext HTTP is allowed app-wide on Android, and LAN sync has no TLS
Sync targets a self-hosted server on the local network, addressed by IP.
A certificate for a rotating private address can only be self-signed,
which means shipping a trust-store exception — more attack surface than
the plaintext it replaces, for a link that never leaves the user's own
LAN. Accepted tradeoff, consistent with the no-accounts/no-cloud model;
revisit only if sync ever crosses a network the user doesn't control.

`network_security_config.xml` therefore sets base-config cleartext rather
than allowlisting addresses. An allowlist is not a smaller permission
here, it is a broken one: Android enforces this at the OS level, so any
host not on the list fails with no error reaching the app, and the sync
host's LAN IP changes on any DHCP renewal or network switch.

**Still true after the pairing-handshake hardening below** — ongoing sync
traffic is unaffected by that change and stays plain HTTP. Real TLS on
sync itself was scoped and explicitly deferred: PouchDB's replication in
the Android app runs through the WebView's `fetch()`, which hard-rejects
a self-signed certificate with no JS-level override — trust-on-first-pair
pinning would need a real native networking layer (a Capacitor plugin
wrapping OkHttp with its own TrustManager), not a config change. Revisit
as its own project if it's ever worth that engineering cost; installing
the self-signed CA as a trusted system cert was considered and rejected
as worse UX than the status quo (Android's "network may be monitored"
warning, aimed exactly at this non-technical audience).

### Pairing handshake: the code and credentials never cross the network unencrypted

Raised as a direct MITM question — "my data flows over Wi-Fi." The
cleartext-sync tradeoff above stands (see its update note for why real
TLS wasn't in scope here), but the **pairing handshake** specifically was
a sharper, narrower, and cheaply fixable problem: the 6-digit code went
phone→PC and the resulting sync credentials came back PC→phone, both as
plain HTTP body text. A passive eavesdropper on the same network segment
during that one exchange didn't need to guess anything — they could read
the username and password directly off the wire, no cracking required.

Fixed inside the exchange itself, no TLS involved: the phone derives an
auth proof and a separate response-decryption key via PBKDF2-HMAC-SHA256
(210,000 rounds, domain-separated by an "auth"/"enc" tag) from the code
plus a fresh per-attempt nonce it generates — the code itself is never
transmitted, only proof of knowing it. `pairing.rs` verifies the proof
without ever seeing the client's copy of the code, then returns the
credentials AES-256-GCM-encrypted under the same derivation. A passive
capture of the whole exchange now has to brute-force the 6-digit space
(1M candidates) against the PBKDF2-hardened proof *offline* to get
anywhere, instead of reading credentials straight off the packet.

**Honestly bounded, not airtight.** Six digits is six digits — no KDF
changes that against someone with real compute (GPU-parallelized PBKDF2
cracking could still clear 1M candidates in seconds to minutes). This
raises the bar from "instant, zero-effort" to "costs a motivated attacker
real work," matching the actual threat model (an opportunistic LAN
eavesdropper, not a resourced adversary) — the same honest framing this
file already applies to the PIN lock's throttle and the pairing server's
online attempt cap. `MAX_ATTEMPTS = 8` still bounds *online* guessing
against the live endpoint; this only closes the separate *offline*,
captured-traffic reading that plaintext previously handed over for free.

Implementation notes for later: `pairing.rs` and `discovery.ts` implement
the identical derivation independently (matching tag strings, round
count, key sizes) since there's no shared crypto module across the
Rust/TypeScript boundary — verified cross-language-compatible by a
`cargo test -- --nocapture` fixture decrypted by hand under Node's
Web Crypto implementation once, then locked in as `tests/discovery.test.ts`
(mocks `fetch`, asserts a real Rust-produced ciphertext decrypts
correctly and that neither the request body nor a captured response
contains the plaintext code). `pairing.rs` also gained real unit tests
(key derivation, encrypt/decrypt round-trip, and the attempt-lockout
state machine) — the previous version had none.

### CodeQL findings inside bundled Capacitor plugin source: dismiss manually
`paths-ignore`/`.codeqlignore` only filter which files get *extracted*
for interpreted languages. Under `build-mode: manual`, Gradle/javac
compiles every plugin module the app depends on and CodeQL indexes
whatever the compiler touches, and no config lever stops that without
breaking the classpath manual build-mode exists to provide. Dismiss these
vendored-third-party findings individually in the Code Scanning UI
(**Won't fix**) rather than reworking the workflow.

### `pairing.rs`'s test-only fixed nonces trip "hard-coded cryptographic value": dismiss as "Used in tests"
Four CodeQL alerts (`rust/hard-coded-cryptographic-value`) on the
`#[cfg(test)]` module added alongside the pairing-handshake hardening —
`[1u8; 16]`/`[2u8; 16]`/`[3u8; 16]` nonces used only so a test's derived
key is reproducible across runs (same code + same nonce should always
derive the same key; that assertion needs a fixed nonce to assert
against). CodeQL can't tell a test assertion from a real key — it flags
any literal byte array flowing into a key-derivation call, full stop.

Verified false positive by reading the real path, not just asserting it:
`spawn_server`'s actual request handling never uses a fixed nonce (it
comes from the network request, i.e. the client), the AES-GCM IV is
always freshly randomized (`rand::random::<u8>()`), and the pairing code
itself is always randomly generated. Nothing test-only ever reaches a
real cryptographic operation. Dismissed individually in the Code Scanning
UI, reason **"Used in tests"** — the exact case that dismiss reason
exists for, unlike the vendored-code entry above which uses "Won't fix."

### A security survey, not an audit: three concrete fixes, most of the surface already closed

Requested as "improve security, your suggestions." Checked first against
this section and the rest of decisions.md so nothing here re-opens an
already-settled tradeoff (at-rest encryption, LAN cleartext, the PIN's
light throttle) — those are unchanged. What was actually new:

- **The web/Android build had no Content-Security-Policy**, while
  `tauri.conf.json` already carries one for desktop. Every `{@html}` sink
  in the app (`GlobalSearch`, `UpdateModal`) already escapes untrusted
  text before interpolating — so this isn't fixing a live XSS, it's
  defense-in-depth for the next one: a CSP means a future bug in one of
  those sinks doesn't also hand an injected script a path to an external
  origin. Added via a build-only Vite plugin (`vite.config.ts`) that
  injects the `<meta>` tag into `dist/index.html` — build-only because
  Vite's dev server needs things (inline module eval, its own HMR
  websocket) a CSP this strict would break, and dev is never what ships.
  `connect-src` stays open to any LAN host (the sync address is
  user-configured); `img-src` needs `blob:` for attachment thumbnails.
  Verified against a real `vite preview` build: full app walkthrough,
  zero CSP violations in the console.
- **`file_paths.xml`'s `<external-path path="."/>`** — Capacitor's
  scaffolded default, mapping the FileProvider to the *entire* shared
  external-storage root — was never actually used. Every `Filesystem`
  write in the app (`carddetail/helpers.ts`, `settings/helpers.ts`,
  `autoBackup.ts`) targets `Directory.Cache` or `Directory.Data`, both
  app-private; `<cache-path>` alone covers what `Share.share()` actually
  hands out. Removed rather than left as unused broad-grant surface.
- **`release.yml`'s `build-android` job inherited the workflow's
  `contents: write`** with no actual need for it — it only builds the
  APK and hands it to `upload-artifact` (its own token, unrelated to
  `contents`). `verify` already narrows to `contents: read` for the same
  reason; `build-android` gets the identical treatment now. (Every other
  workflow file, and `build-desktop-windows`/`draft-release` in this one,
  were already correctly scoped — `build-desktop-windows` and
  `draft-release` genuinely need write to call the GitHub Release API.)

Also checked and found already solid, so not touched: `npm audit` (0
vulnerabilities), the pairing endpoint's brute-force cap and generic
error responses (`pairing.rs`), `AndroidManifest.xml`'s exported
components (each justified by its own comment), CI Action pins (full SHA,
not floating tags, everywhere), and no workflow uses `pull_request_target`.

---

## Mobile / Android

### `android:allowBackup="false"`
Android's Auto Backup silently uploads local app data (including
PouchDB's WebView storage) to the user's Google account and restores it
on reinstall — a real product conflict with "no accounts, no telemetry,
no implicit cloud dependency," and it also makes "uninstall and
reinstall" not produce a fresh install. Sync (self-hosted, explicit,
user-controlled) is this app's own backup mechanism.

### An official `@capacitor/*` plugin's mechanism beats a custom native bridge event
A hand-rolled bridge call for the Quick Add widget's launch intent fires
before the WebView has a listener attached, silently losing the event on
every cold start; `@capacitor/app`'s own launch-URL listener handles that
timing/replay problem already. General rule: check whether an official
plugin exposes a native capability directly before writing custom bridge
Java.

---

## Public release

### BFG Repo-Cleaner over `git filter-branch`/`git filter-repo` for history rewrites
For scrubbing leaked credentials from every commit, BFG (Java) rewrites a repo of this size
across all commits and tags in under a second. `git filter-repo` needs
Python; `git filter-branch` is both far slower (`--tree-filter`) and
error-prone (`--index-filter` resolves paths against the wrong tree).
Notes for any future rewrite: pass `--no-blob-protection` (BFG skips the latest commit on each
ref by default, and a leak usually still sits in the tip commit); verify
by exhaustively grepping every remaining blob in the object
database, not by spot-checking; and check `git config --list --local`
afterwards, since a bundle-based clone doesn't preserve repo-local config
and adds its own `remote.origin`.

---

## Process

### CLAUDE.md invariants get written in the same commit as the bug that caused them
The highest-leverage habit in this project's AI-collaboration workflow —
an invariant is added the moment the bug is fixed, not retroactively.
Turns a one-time fix into institutional memory that survives across
sessions with no persistent AI memory of their own. Keep doing this
without exception.

### The roadmap is finite, and a finished plan can be followed by another
Offlog isn't competing for attention in a market giants own, and sprint
pace would end in abandonment rather than a finished product. So roadmap.md
is a finite plan with a defined end, then maintenance mode — and *being
finished* is the mission succeeding, not stalling.

That plan completed. A new direction (mesh sync) was then chosen from real
daily use, which is the only thing that reopens planned work — not a
backlog, not an idea. The rule is unchanged: finite, with an end.

### `reset-dev-env.ps1 -IncludeRelease` is a real data-loss risk, not routine
It wipes the real installed app's own data, not just the dev build's.
Only for a deliberately confirmed "this data is disposable" case — never
a default cleanup step, even right after testing.

### Privacy policy states the mechanism, not a bare denial
A policy with nothing to disclose reads as suspiciously sparse if it just
says "nothing is collected." [privacy.md](privacy.md) states that plainly
and then explains *why* for each category a reviewer expects (accounts,
analytics, sync, permissions) by pointing at the actual mechanism. Serves
the Play Store listing.

### Task linking: non-directional, forward-only, links survive delete
**Scope** — `related` is non-directional by design. Directional
dependency is a separate field (`blocked_by`), added later once daily use
demanded it; don't fold the two together.
**Storage** — forward-only on whichever task the link was added from,
reverse direction computed at read time by scanning for it, since PouchDB
can't write two docs atomically and a mirrored write risks landing
one-sided. **Deletion** — a link to a soft-deleted task stays, shown as
"(deleted)", until the task is permanently purged; only a hard purge
drops the link. Links are click-through, with a link-icon badge on
cards/rows so a task's links are visible without opening it.

### Settings: per-tab controls apply live; the footer Save is Advanced-only

The sixth feature audit (roadmap.md), which walked all seven Settings tabs
live rather than reading the code, ships two real fixes.

**Escape closed all of Settings instead of backing out of PIN entry.**
`onWindowKeydown` special-cased every other in-panel sub-flow (the connect
modal, conflicts, maintenance, import preview) but not `showPinForm` or
`pinGateMode` — so Escape while typing a new PIN, or while `ConfirmPinGate`
was asking for the current PIN to change/remove it, fell through to the
final `else requestClose()` and closed the whole modal, discarding
whatever was typed. Fixed by adding both to the same early-return chain.
`ConfirmPinGate`'s own Escape handler also needed `stopPropagation()` —
without it, the same keystroke both correctly cancelled the gate *and*
reached the window handler and closed Settings, since the gate's own
`dispatch('cancel')` had already nulled `pinGateMode` by the time the
event bubbled up, so a bare `if (pinGateMode)` check in the window handler
alone couldn't have caught it. Covered by a new regression test.

**The Cancel/Save footer buttons were live for every tab, but only meant
something on one — then real feedback overrode the "fix."** Verified by
reproduction: toggling Theme and High Contrast, then clicking Cancel, left
both changes in place — `setThemeMode()`/`setHighContrast()` (and every
other tab's toggles: notifications, auto-backup, haptics, reduce motion)
write straight to their store on click, matching a documented, deliberate
tradeoff (`saveSettings()`'s own comment: forcing a reload for every tab
would re-trigger App Lock's cold-start check on a plain theme change).
Only `syncUrl`/`credentialUser`/`credentialPass`, on the Advanced tab and
only while Sync is on, are genuinely buffered behind that button.

First fix replaced the footer with a single "Close" everywhere except
`activeCategory === 'advanced' && syncEnabled`, on the theory that a
button promising to save/cancel something that already happened is worse
than no button. Reversed after the first real users tried it: a missing
Save button reads as "did my change even take?", not as "there's nothing
to save here" — the reassurance the label provides outweighs it being
mechanically a no-op on every tab but one. Landed on: "Save" shown on
every tab (still routed through `saveSettings()`, which is already a
no-op when nothing's buffered, so this stays correct if that ever
changes), Cancel only where Advanced genuinely has something to discard.
Keep this the next time the same "but Cancel doesn't cancel anything"
observation resurfaces — it's true and was already tried; the label stays
for the reassurance, not because the buffering changed.

**A follow-up UX/UI pass** (8 parallel reviewers, one per tab plus the
shared shell, then a synthesis pass) found 24 more findings — pure UI/copy/
consistency, no more correctness bugs. Three were fixed as high-impact:

- **The single most destructive control in Settings was the one styled
  like a routine one.** `resetPcTestData()`'s wipe was gated by a raw
  `confirm()` instead of the app's own `confirmAction()` (which the
  conflict-resolution and maintenance-repair flows already use, danger
  option and all), and its button used the same neutral `.export-btn`
  class as "Check for updates" — no `var(--danger)` treatment, unlike
  every other irreversible-delete control in the app (Trash's forever-
  delete, the four manager delete buttons, CardDetail's danger menu).
  Both now match that pattern.
- **A healthy sync connection was visually identical to "nothing
  configured yet."** `connectionStatus`'s `ok` tone was computed but
  never wired to a distinct style — it fell through to the same
  `.setting-hint` gray as "Syncing…" and "Not connected yet." `.success-
  hint` already existed (used for pairing-success messages) but wasn't
  `:global()`-exposed for a child component to use; now it is, and the
  Sync tab's status line uses it for `tone === 'ok'`.
- **Restore's preview screen never confirmed which file you picked.** It
  showed only aggregate counts, no filename — a real gap given the app
  itself produces several similarly-named backups on one device (daily
  auto-backups, manual full/per-project exports). The picked file's name
  and last-modified time are now shown above the count summary.

**Six of the medium-impact findings were fixed too**, chosen by the
owner from the ranked list rather than all of them:

- `pairWithHost()`'s `fetch()` now catches network failure specifically
  (unreachable host — off Wi-Fi, firewalled, asleep) and throws a real
  message instead of letting the raw `TypeError` reach the UI verbatim.
- An Android scan that completes with zero hosts now says so
  ("No computer found…") instead of the button just reverting with an
  empty list and no way to tell "still running" from "found nothing."
- Both "Devices seen recently" and the conflict-resolution modal now
  label whichever entry matches this device's own name, instead of
  requiring the reader to remember what they typed into the Name field
  and match it by eye.
- `SecuritySettings`' New/Confirm PIN inputs filter non-digits live now,
  matching `ConfirmPinGate`'s re-auth field — previously only rejected on
  Save, after Confirm PIN and the hint were filled in too.
- The Sync tab now mentions where the manual server-connection fields
  live (Advanced) for anyone running their own server by hand; Advanced
  already pointed back the other way.
- Notifications' Permission/Reminder-timing/Quiet-hours sections (and the
  quiet-hours start/end row) now use the same `revealIn`/`revealOut`
  slide every other disclosure section in the app uses, instead of
  snapping open/closed via a bare `{#if}`.

Left for later, by choice, not by finding them safe/unsafe: the exact-
alarm hint's technical copy, and cross-linking Archived Projects from
Backup & Storage.

**Seven low-impact findings, also owner-chosen** rather than the full
list of fifteen:

- Quiet hours' toggle label now reads "Delay reminders until quiet hours
  end" instead of "Queue reminders…" — the fire-time behavior in the
  label itself, not only in a separate hint below it.
- PIN setup shows "Doesn't match yet" live once Confirm PIN is at least
  as long as New PIN, instead of only on Save.
- Organize's section title changed from the content-free "Manage" to
  "Workspace", and Custom Fields (the one row of the four that isn't
  self-explanatory) gets a hint: field definitions are shared across
  every project.
- The Connect-a-device modal's Cancel/Connect and Done buttons moved into
  a pinned `.mini-modal-actions` footer, matching Maintenance/Import/
  Recovery — the scan list's "Find my computer"/per-host "Connect" and
  desktop's "Generate a code" stay inline, the same list-building-vs-
  closing distinction that already justified Conflicts' inline Refresh.
- Desktop pairing success now shows the same explicit "Done" close
  Android's success state already had, instead of leaving "Generate a
  new code" as the only visible control.
- The healthy-storage headline changed from "Your data is tiny — nothing
  to worry about" to "Storage use is well within limits", matching the
  flat, factual tone of every other hint in the panel (including its own
  warning-state sibling right next to it).

Left alone by choice: the two-permissions-one-heading split, no live PIN
length indicator, the setup-vs-change PIN form heading, Back-up/Export-CSV
button styling, the CSV scope-selector question, Biometric/Privacy-Screen
visibility, the Settings panel's own ✕, and extending nav-badge beyond
Sync conflicts.

**Recorded, not changed.** A handful of fire-and-forget
`.catch(() => {})` calls on real I/O (`rescheduleAll()` after toggling
notifications or saving quiet hours, `startSync()` after enabling Sync) —
plausible as "best-effort, the next reload/sync reconciles it" given the
app's own cancel-all-reschedule-from-scratch model elsewhere, but none of
the three carry a comment saying so the way this file's other silent
catches do. A worthwhile follow-up, not urgent enough to touch mid-audit.
Also noted: a possible reactive reload loop in the Sync tab's conflict
list if `conflictCount` (async, sync-engine-owned) and `conflictList`
(a direct query) briefly disagree after resolving the last conflict; the
debug-only "Reset test data" button using the native `confirm()` instead
of the app's own dialog; and `resetBusy` only clearing on the failure
path, not success (harmless — the app is expected to restart either way).
None reproduced; all four are plausible enough to revisit if one ever
actually fires in use, not fixed on a suspicion.
