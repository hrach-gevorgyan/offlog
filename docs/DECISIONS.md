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

### Why mesh/device-to-device sync is a future addition, not a CouchDB replacement (2026-07-02)
Decided in ROADMAP.md's Track D: CouchDB sync stays as a permanent,
independent transport option. Mesh sync (every device can be a server) is
being pursued *in addition to*, not *instead of*, CouchDB — because mesh
sync cannot solve the "devices are never on the same network" case without
a relay of some kind, and CouchDB already is exactly that relay for anyone
willing to run one. Building mesh sync as a replacement would mean solving
a strictly harder version of a problem CouchDB sync already solves.

### Why "no server" is not literally true for mesh sync, and why that's fine
The mesh-sync design (ROADMAP.md's Track D Architecture section) still runs a local HTTP server per
device — the "no server" claim in Offlog's mission refers to *no server
Offlog operates or that requires trusting a third party*, not literally
zero listening ports anywhere. Each device serving itself is philosophically
identical to "the app talks to its own local database," just reachable
over the LAN by other devices the owner has explicitly paired.

---

## Distribution & business model

### Why the app will never be paywalled or ad-supported, even with a business model (2026-07-02)
Settled in ROADMAP.md's Business Model section: monetization (if any) is a separately-sold
convenience layer (e.g. a hosted sync relay), never a gate on the app's
own functionality. This is treated as non-negotiable, not a tradeoff to
revisit under revenue pressure — the entire differentiation strategy
(see ROADMAP.md's Mission) depends on this being unconditionally true, and
a single feature-gate would retroactively make every future "free and
open" claim suspect.

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

## Data model

### Why "done" is positional (last column), not a boolean field
Documented as an enforced invariant in CLAUDE.md already — repeated here
because it's the kind of thing a mesh-sync N-way conflict scenario could
tempt someone to "fix" by adding a `done: boolean` for simpler conflict
resolution. Don't. The positional model is intentional (it's just "which
column," which is what Kanban already represents) and changing it would
require a data migration and touch every view — not something to casually
introduce while solving an unrelated sync problem.

### Why soft-delete only, never `db.remove()` for tasks (except admin paths)
Also an existing CLAUDE.md invariant — recorded here because mesh sync's
N-way replication makes hard deletes more dangerous, not less: a hard
delete that hasn't yet replicated to a currently-offline paired device
will resurrect the "deleted" doc as a new create the next time that device
reconnects, unless the delete itself is a replicated tombstone. Soft
delete already produces exactly that tombstone behavior for free.

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
