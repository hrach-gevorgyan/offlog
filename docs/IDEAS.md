# Offlog — Open Questions & Ideas

Genuinely unresolved questions and un-committed ideas, meant to be
shareable as-is with another AI or a human for outside input — each one
states the situation, what's already been decided around it, and what's
actually being asked. Not a task list (see [ROADMAP.md](ROADMAP.md) for
that), and not a decisions log (see [DECISIONS.md](DECISIONS.md) for
things already settled) — these are things nobody has a confident answer
to yet. Replaces the old QUESTIONS.md (merged in 2026-07-20).

If you're an AI or a person reading this cold: Offlog is a free,
open-source, local-first personal task manager (Svelte + PouchDB +
Capacitor). No accounts, no telemetry, ever. Full context in
[DECISIONS.md](DECISIONS.md)'s manifesto and [TECH.md](TECH.md) if you
need it — but each question below should be answerable from the question
itself.

---

## Sync topology (raised 2026-07-20, owner's "big idea" scenario review)

Context: today's model is one fixed host (whichever PC runs
`offlog-desktop`), phones as clients — see DECISIONS.md's Tauri/CouchDB
entries and TECH.md. These scenarios surfaced real gaps in that model
that haven't been designed for (not declined, just never needed a design
yet):

### S1. Two PC apps installed on two different machines — who's the host?
Partially hardened (2026-07-20): `offlog-desktop` still unconditionally
spawns its own CouchDB sidecar on every launch — there's no "join an
existing host instead" mode, deliberately not built (a real client-mode
would be a large feature for a scenario nobody's actually hit, the same
tradeoff mesh sync's decline already weighed). What shipped instead is
detection-only: `discovery.rs`'s `browse_for_others()` runs a one-time LAN
scan at startup, before this instance advertises itself, and surfaces any
other `_offlog._tcp` host it sees via a new `get_detected_other_hosts`
Tauri command; Settings → Sync shows a warning if one is found. This
closes the "silent split-brain, no idea anything's wrong" failure mode
without touching how sync itself works. **Still open**: no way to
intentionally run two independent households/offices on one LAN without
that warning firing (acceptable today, since it's just a heads-up, not a
block) — and the full "join as client" mode remains a real option if
actual demand ever shows up.

### S2. Mobile-only for weeks, then install a PC later — does history merge cleanly?
**Verified live, 2026-07-20**: a real `offlog-desktop` host (fresh
embedded CouchDB, own auto-seeded defaults) paired against a realistic
180-doc dataset (112 tasks, 13 projects, 4 spaces, 49 log entries — one
default space at revision 15, i.e. genuinely heavily edited). Every task,
project, log entry, and space replicated correctly both ways with zero
data loss, content verified byte-for-byte identical on both sides.

**Real bug found and fixed in the same session**: `clearLocalSeedBeforeFirstPair()`
only clears a device's own copy of the 4 fixed default-seed ids
(`space:unsorted`/`personal`/`work`, `project:draft`) when that device has
*zero* tasks — so a phone with real accumulated history (exactly this
scenario) skips the guard, and its independently-created copies of those
same fixed ids genuinely conflict with the host's own freshly-seeded
copies. Confirmed live: 3 real conflicts, correctly reported by the app's
own `scanConflicts()`. Not data loss (CouchDB's deterministic winner
happened to pick the real content over the throwaway default every time
in this run, and the existing conflict-resolution UI already handles it),
but not guaranteed either — a coin-flip that just happened to land right.

Fixed at the root: `scanConflicts()` now auto-resolves conflicts on those
4 known ids whenever one side is provably still the untouched pristine
default (matches `seedIfEmpty()`'s exact shape) — discarding a pristine
loser, or adopting a real edit that lost to a still-pristine "winner."
Two genuinely different real edits on both sides are still left as a real
conflict for manual resolution, same as always — this never guesses
between two real edits, only recognizes "nobody ever touched this one."
Covered by 2 new tests in `tests/db.test.ts`. **Closed** — no longer an
open question.

### S3. Two phones, no PC, want a shared workspace — already an accepted gap
Per DECISIONS.md's mesh-sync-declined entry, this is intentional, not a
bug: phone-as-host was explicitly ruled out. Export/import is the
intentional answer. **Is this limitation actually communicated anywhere
user-facing (README/FAQ/in-app copy), or does a user only discover it by
hitting the wall?** If not communicated, that's a C10 (plain-language)
gap, not a new engineering question.

### S4. Host machine wiped or replaced — do paired phones silently orphan?
**Fully closed, verified live (2026-07-20)**: identity (`sync-host.json`)
and the actual CouchDB data both live under `app_data_dir`. Simulated a
real uninstall/reinstall — deleted the ~152 MB resource-dir binary bundle
entirely (the exact thing an NSIS uninstall removes), left `app_data_dir`
untouched, relaunched. Result: **byte-for-byte identical** `_all_docs`
response before and after (180 docs, 112 tasks, nothing lost/regenerated),
and identical identity (same port/password/node name/cookie) — a
previously-paired phone needs zero re-pairing after a normal reinstall.
The relaunch happened to exercise `couchdb_dir()`'s own documented
fallback path (bootstrapping a fresh binary copy when the resource-dir
copy is missing), an even stronger test than a plain reinstall would be,
and it still worked correctly. Only a full wipe of the Windows user's
roaming profile itself (not a normal uninstall/reinstall) can still
orphan a paired phone.

Separately, a real bug was found and fixed in the same overall review:
when a phone's stored host `uuid` no longer matches anything on the LAN
(the host genuinely was wiped, or the phone paired with the wrong
device), `discovery.ts`'s `findPairedHostAddress()` used to silently
ignore any non-matching advertisement and just time out to `null` forever
— `watchForStaleHost()` did nothing further, no user-facing signal at
all. Now `reresolveHost()` surfaces a `staleHostAlert` store the moment it
sees a *different* Offlog host but can't find the paired one, shown as an
actionable "re-pair?" tooltip/badge on the Sidebar sync button instead of
the generic "cannot reach sync server" message.

### S5. Intentional host migration (user buys a new PC) — no guided flow exists
Today's only answer is presumably `offlog-desktop/scripts/reset-dev-env.ps1`-
style manual reset plus re-pairing every phone from scratch. **Is a
guided "move my host to this new computer" flow worth building, or is
manual re-pair-every-device acceptable given how rarely this happens?**

### S6. Host offline for a long stretch while 3+ phones diverge
CouchDB's `_conflicts` handling is doc-level and already exercised with 2
devices (see DECISIONS.md's 3-way-merge entry). **Has this actually been
tested with 3+ devices editing the same task while the host is offline,
or only ever with 2?**

---

## Security & privacy

### Q1. Is "no encryption at rest" an acceptable permanent answer?
Today: no login, no encryption at rest, unencrypted CouchDB sync traffic
(over HTTP to a LAN address). This is a common local-first tradeoff, but
it's currently an *implicit* one. **Given the target audience (a personal
task manager, not a password manager), is this fine to state as a
permanent, deliberate tradeoff — or does going public with a real user base
change the calculus enough to warrant at least optional encryption at rest
and TLS for sync before v1.0?**

---

## Distribution

### Q2. Play Store policy risk for a task-manager app with local network requests
The app makes local network calls (CouchDB sync to a LAN address).
**Does this trigger any Play Store review friction** (Android's
`CHANGE_NETWORK_STATE`/local network permission prompts introduced in
recent Android versions, or general policy scrutiny of apps that make
local-network calls) that should be researched before assuming a smooth
listing process?

### Q3. Privacy policy content when there is genuinely nothing to disclose
Store listings require a privacy policy page even for an app that collects
zero telemetry. **What's the right, honest content for that page** that
doesn't either (a) read as suspiciously sparse to a reviewer, or (b)
accidentally imply more data handling than actually happens (e.g. because
of boilerplate legal language that doesn't fit a truly local-only app)?

---

## Scale

### Q4. Is large-dataset validation (A10) actually a realistic risk?
A10 already shipped a validation pass (see archive/roadmap-archive.md),
but the owner remains skeptical a single-person task manager will ever
accumulate enough data for it to matter again. **Is there real-world data
(from comparable local-first personal tools) on how large a single user's
task/log dataset actually gets over multiple years** — informing whether
this deserves any further priority, or is safe to consider closed?

---

## How to use this document

Each question above is meant to be copy-pasted on its own to another AI,
a forum, or a person whose judgment is trusted, without needing this whole
repo as context. If an answer emerges, record the resolution in
[DECISIONS.md](DECISIONS.md) (if it settles something permanently) or
update the relevant [ROADMAP.md](ROADMAP.md) section directly (e.g. S1-S6
resolving into a real Track E item), and remove or mark the question here
as resolved — don't let answered questions linger alongside genuinely open
ones.
