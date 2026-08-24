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
[roadmap.md](roadmap.md). For anything this implies but doesn't resolve,
see "Open Questions" below.

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

Genuinely unresolved, shareable as-is with another AI or a human for
outside input. Not a task list (see [roadmap.md](roadmap.md)) and not
the decisions log below.

- **Two PC hosts on one LAN.** The model is one fixed host, phones as
  clients. Detection-only warning ships; there is no "join as client"
  mode, on the same tradeoff mesh sync's decline weighed. Revisit only
  on real demand.
- **Play Store policy risk for local-network sync.** Do the app's local
  network calls trigger review friction (Android's local-network
  permission prompts, or general policy scrutiny)? Worth researching
  before assuming a smooth listing.
- **Is large-dataset validation a realistic risk?** Unclear whether a
  single-person task manager ever accumulates enough data for it to
  matter. Real-world data on how large one user's dataset gets over
  years would settle this either way.
- **Remote access via the user's own personal mesh VPN (Tailscale/
  WireGuard), experimental.** Not an Offlog-run relay or account — just
  pointing the existing sync URL at a Tailscale IP instead of a LAN IP,
  so a phone can reach the home host from outside the LAN. Brushes the
  manifesto's "remote/away-from-home sync... explicitly not part of this
  goal" line, so it is an idea to think about, not a plan.

If an answer emerges, fold it into the relevant section below or
update roadmap.md directly, and remove the question here.

---

## Storage & sync

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

### Mesh sync: considered, declined outright
Device-to-device sync with no central host is declined, not deferred.
Each Android device would need a background CouchDB-compatible server
reachable while backgrounded — which even Syncthing-Android only manages
with a permanent foreground notification plus a manual
battery-optimization exemption, and Android 15 caps that class of service
at 6h/24h regardless. Two devices never on the same network still can't
sync without a relay, breaking the "no server Offlog operates" pitch. The
payoff also scales with a userbase this project isn't building.
Self-hosted CouchDB-protocol sync is the one, permanent transport.

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
conflict modal shows which device made each change and when, alongside
PouchDB's deterministic auto-resolution. Revisit only if the conflict
*source* changes fundamentally.

---

## Distribution & business model

### PWA support dropped entirely, not patched further
The installable-web path kept causing stale-icon-after-update problems
and wasn't earning its complexity, since real use is a plain browser tab
plus the Android app. Removed outright; `main.ts` actively unregisters
any leftover service worker from a previous PWA-enabled build. The PC
standalone app is the Tauri app (see below), explicitly not a second PWA
attempt.

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

### F-Droid explicitly out of scope
Offlog isn't positioned as "needs to be in every store"; F-Droid's
audience/process overhead isn't worth it here. Distribution stays GitHub
(source) + a website + Google Play. iOS is out of scope entirely unless a
future community contribution takes it on.

### iOS: community contribution only, PWA is the zero-cost path
A native iOS app needs a Mac, Xcode, and Apple's $99/year developer
account — the fee alone contradicts the zero-cost stance, so this is
community-contribution only, never planned work. The realistic zero-cost
route onto an iPhone is the existing web build as a PWA (Safari → Add to
Home Screen), with real gaps: no widgets, no lock-screen notification
actions, and LAN sync from a PWA is untested. If it ever matters, the
first step is testing the current web build on a real iPhone, not
building a native app.

### Repo is public; the credential/history gate is cleared
Going public was gated on a hardcoded sync password/LAN IP in `config.ts`
(present in git history too) and a git-history purge of leaked
credentials. Both are resolved: NyxDB's per-install random pairing
replaced the baked-in credentials, and the history purge is documented
below. Standing rule: grep the *built output*, not just source, when
checking for secrets — Vite loads `.env.local` in every build mode.

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

### Accepted risk: `glib` 0.18.5 advisory in offlog-desktop, no fix available
A moderate unsoundness advisory, patched in `glib` 0.20.0 — unreachable
here since `glib` is transitively pinned by Tauri's own `gtk` dependency
(`^0.18`), and no patched 0.18.x release exists. Blocked on Tauri bumping
upstream, not fixable locally. The unsound path is only reached through
this app's own local, non-adversarial code — no network-facing input
touches it. Re-check whenever Tauri/Cargo deps next get bumped.

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

### CodeQL findings inside bundled Capacitor plugin source: dismiss manually
`paths-ignore`/`.codeqlignore` only filter which files get *extracted*
for interpreted languages. Under `build-mode: manual`, Gradle/javac
compiles every plugin module the app depends on and CodeQL indexes
whatever the compiler touches, and no config lever stops that without
breaking the classpath manual build-mode exists to provide. Dismiss these
vendored-third-party findings individually in the Code Scanning UI
(**Won't fix**) rather than reworking the workflow.

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

### The roadmap is finite — a plan with an end
Offlog isn't competing for organic attention in a market giants own, and
sprint pace would end in burnout-abandonment, not a finished product.
roadmap.md is a finite plan with a defined "Done" state, then maintenance
mode. The mission is "a tool for its owner, given away as-is," and *being
finished* is that mission succeeding.

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

### Task linking: related-only, forward-only, links survive delete
**Scope** — related-only, no directional blocks/blocked-by semantics
(simpler data shape, no dependency-tracking logic to maintain).
**Storage** — forward-only on whichever task the link was added from,
reverse direction computed at read time by scanning for it, since PouchDB
can't write two docs atomically and a mirrored write risks landing
one-sided. **Deletion** — a link to a soft-deleted task stays, shown as
"(deleted)", until the task is permanently purged; only a hard purge
drops the link. Links are click-through, with a link-icon badge on
cards/rows so a task's links are visible without opening it.
