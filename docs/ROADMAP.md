# Offlog Roadmap

Baseline: **v3.7.0** (tag `v3.7.0`, 2026-07) — the current stable release.
Everything below is a candidate, not a commitment. Items are ordered roughly
by value-for-effort within each track. Before starting any item, re-check it
against the current code — this document describes intent, not state.

Related documents: [TECH.md](TECH.md) (how it works today),
[DECISIONS.md](DECISIONS.md) (why non-obvious choices were made),
[CHANGELOG.md](CHANGELOG.md) (version history), [QUESTIONS.md](QUESTIONS.md)
(open questions worth outside input). Long-horizon direction — mesh sync,
security, business model — used to be a separate VISION.md; folded into
this file's Track D and the sections after it (2026-07) to stop splitting
one story across two documents.

## Mission

Offlog is free, open-source, and local-first — no account, no telemetry, no
subscription, ever. The biggest goal on this roadmap is making it something
a non-technical person can actually find and install without knowing what
"self-host CouchDB" means: an official listing (Play Store), a public
GitHub repo, a real license. Offlog is not trying to out-feature Trello,
Notion, ClickUp, or Jira — it isn't competing with them. The goal is a
small, calm tool people like using, not a checklist of matched features.
Every roadmap item should be judged against that: does it make Offlog nicer
to use, or does it just make it bigger?

---

## Path to v1.0 — the whole story, even the parts that aren't realistic yet

This section exists so the destination is never buried under backlog
detail. It's a narrative, not a schedule — some of it (Track D especially)
is genuinely uncertain and may not land as described. That's fine; the
point is to always know what the roadmap is *for*, not just what's next.

1. **Right now (Track A + B):** keep the app trustworthy and close real
   feature gaps, in small paired releases (see Sequencing below). This is
   the only part of the roadmap with real short-term commitments.
2. **In parallel, whenever there's spare attention (Track C, starting
   now):** get honest about what "ready for a stranger to install" means —
   fix the hardcoded credentials, verify zero-config first run actually
   holds, prepare the public GitHub repo and a Play Store listing. Most of
   this is documentation/audit work, not new features, and doesn't have to
   wait for Track A/B to finish.
3. **Once the app feels finished enough to represent well publicly:** go
   public. GitHub repo, website, Play Store listing. This is the concrete,
   externally-visible "we made it" milestone — everything before this
   point is preparation for it.
4. **The unique differentiator (Track D, long-horizon, not yet started):**
   device-mesh sync — every device can be a server, paired via QR code, no
   central server required, CouchDB sync still available in parallel. This
   is what makes Offlog's sync story genuinely different from every other
   local-first tool, not just "another sync feature." It is hard, phased,
   and gated by a real security review before anything ships to real
   users — see Track D below for the full plan.
5. **Sustaining it (business model, not yet built):** the app and source
   stay free/open-source/unpaywalled forever. If a hosted-relay convenience
   product happens, it's sold separately, never as a gate inside the app.
   GitHub Sponsors/donations can start the moment the repo is public — no
   product work required.
6. **If it succeeds (genuinely speculative, written down so it isn't
   forgotten):** the mesh-sync engine could outgrow the task manager and
   become a reusable local-first sync core for other personal-data apps;
   the project itself, documentation discipline and all, could stand as a
   public case study in AI-assisted development done well.

Nothing above skips a step. A public repo with hardcoded credentials in its
history, or a mesh-sync feature shipped without a security review, would
undermine the entire premise — so the ordering here is a real constraint,
not just narrative flow.

---

## Shipped (Track A, v3.1.0 – v3.7.0; Track B, v3.6.0 – v3.7.0)

A1–A8 (persistent undo, changelog growth control, conflict resolution,
startup cost audit, sync robustness/dedup, automated tests, bundle diet ×2)
shipped across v3.1.0–v3.4.0. A6 (automated tests) is worth calling out
specifically: the first Vitest suite (`tests/db.test.ts`, 26 tests against
`pouchdb-adapter-memory`) **immediately paid for itself**, catching two real
bugs that had been silently shipping since v3.1.0 — conflict detection never
worked at all (`row.value.conflicts` isn't a real PouchDB field; it's
`row.doc._conflicts`), and resolving a conflict left one revision behind
uncleaned. v3.5.0 followed up with the fallout from conflict detection
finally working: a Settings panel layout bug (no scroll cap, so a populated
conflict list pushed the header/buttons off-screen) and an Android splash
screen that was never actually wired to the real SplashScreen API. v3.6.0
shipped the first Track B items — **B1 (Space management)** and **B6 (Tag
management)** — alongside a full Settings redesign (category/detail layout,
responsive down to phone widths) that wasn't originally scoped but became
necessary once B1/B6 exposed how cluttered the old flat Settings page had
become; discovering the app has no Android hardware back-button handling
anywhere (now tracked as A14) directly shaped that redesign's mobile
navigation pattern. v3.7.0 followed up as an Android-focused release:
**A13 (focus-trap accessibility)** and **A14 (hardware back-button
handling)** shipped alongside **B3 (notification actions)** and **B10
(quick-capture home-screen widget)**. Full details in
[CHANGELOG.md](CHANGELOG.md)'s per-version entries.

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.

### A9. UI component tests
`tests/db.test.ts` only covers the database layer — every `.svelte`
component has zero automated coverage, caught only by manual browser
verification. Start with `@testing-library/svelte` for the components with
the most non-obvious logic: `KanbanBoard`'s drag/drop position math,
`CardDetail`'s save/diff logic, and `Sidebar`'s Maintenance step
orchestration (the exact kind of multi-step async flow that's easy to
silently break with a future refactor).

### A10. Large-dataset performance validation
Manual testing so far has gone up to ~150 tasks (the 50-dummy-task batches
used for Trash/Maintenance testing). Nothing has verified behavior at the
scale a multi-year single-user database could realistically reach —
1,000–5,000 tasks, thousands of log entries. Script a one-time stress
seed, then measure: Kanban/List/Table render time, `getDashboardData()`
latency, and Global Search responsiveness per keystroke. Fix whatever's
worst before it becomes an actual user complaint instead of a hypothetical.

### A11. Error-handling audit, pass 2
The try/catch + `showError()` invariant was last audited in v2.9.0 — every
task-mutating call site added since then (Trash's restore/delete-forever/
empty, the Maintenance modal's five-step flow, `ConfirmDialog` consumers)
needs the same audit applied fresh, since new features are exactly where
this invariant tends to quietly lapse.

### A12. Notification reliability audit
Reminder scheduling (`notifications.ts`) has never been tested across DST
transitions, device timezone changes, or the app being closed for several
days then reopened. `catchUpWeb()`'s 1-hour catch-up window and the native
Android exact-alarm fallback are both plausible sources of missed or
duplicate reminders under those conditions — worth deliberately testing
rather than waiting for a real missed reminder to report it.

### A13. Accessibility re-audit for the newer components — shipped in v3.7.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A14. Android hardware back-button handling — shipped in v3.7.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### A15. Widget/back-button regression coverage
v3.7.0 added real native surface — `modalStack.ts`'s history-backed overlay
stack, the notification action buttons, and the home-screen widget — with
zero automated coverage, only manual/browser verification. `modalStack.ts`
in particular is pure JS with no Svelte or DOM dependency beyond
`window.history`/`popstate`, so it's a cheap first target: a unit test can
verify the LIFO stack order and `discardTop()` vs `requestClose()` behavior
without spinning up a component at all.

### A16. Offline-queue robustness for sync
A5 (v3.1.0) fixed sync running two replications at once, but nothing has
deliberately tested a genuinely flaky connection — dropped mid-replication,
reconnecting with a partial write in flight. Different failure mode than
A5's fix; worth simulating deliberately (e.g. killing the network mid-sync
in dev tools) rather than waiting for a real report of a stuck or corrupted
sync state.

### A17. Storage-pressure handling
Nothing today handles `navigator.storage.estimate()` actually approaching
quota — worth deciding what graceful degradation even looks like for a
local-first app (warn before writes start failing? nothing else to do?)
before it's a real user complaint rather than a hypothetical, similar in
spirit to A10's large-dataset validation but specifically about running
low on space rather than running slow.

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).

### B1. Space management — shipped in v3.6.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.6.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### B2. Filters on Kanban + saved filters
Search/filter exists in List and Table only (a deliberate v2 scope cut, can
be revisited). Add the same filter bar to Kanban, then let any filter
combination be saved as a named view per project.

### B3. Notification actions — shipped in v3.7.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### B4. Import/export v2
Current JSON export is a raw doc dump. Add: export a single project,
CSV export for tables, and a guided import that previews what will be
created/skipped before writing.

### B5. Multi-device polish
`Source` already distinguishes pc/pc2/mobile. Surface it: "edited on mobile,
2h ago" in CardDetail history, and a per-device last-seen list in Settings —
useful once sync spans 3+ devices.

### B6. Tag management — shipped in v3.6.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.6.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### B7. Calendar / week view for Agenda
The Agenda groups by Overdue/Today/This Week/Later as flat lists. A
week-grid view (7 columns, tasks placed under their due date) alongside the
existing list view gives a different, genuinely useful way to see workload
distribution — toggle between the two, same underlying `getAllTasksDue()`
query.

### B8. Project templates
"New from template" duplicates an existing project's status structure (and
optionally its non-completed tasks) into a fresh project — useful for
recurring project shapes (e.g. a monthly checklist) without recreating
statuses by hand every time. Builds directly on the existing
`duplicateTask()` pattern, applied at the project level.

### B9. Command palette
Ctrl+K currently does global task search only. Extend `GlobalSearch` (or a
new overlay sharing its shortcut) to also match action commands by fuzzy
name — "dark mode", "new project", "settings", "export" — so power users
can drive the whole app from the keyboard without memorizing separate
shortcuts for everything.

### B10. Android quick-capture widget — shipped in v3.7.0
See [CHANGELOG.md](CHANGELOG.md)'s v3.7.0 entry. Number kept (not
renumbered/removed) so the sequencing table below stays accurate.

### B11. High contrast mode
A third `body` theme class alongside light/dark, raising border/text
contrast ratios throughout — same token-driven approach as the existing
palette (add the values to `app.css`, no component changes needed if every
color already routes through a CSS custom property). Toggled from Settings
→ Appearance, next to the existing dark mode switch. Raised while reshaping
Settings in v3.6.0.

### B12. Auto-reminder from due date
Right now a reminder (`reminder_at`) is a fully separate field the user
sets manually, independent of `due_date`. Add an optional "remind me on the
due date" toggle in `CardDetail` that derives `reminder_at` from `due_date`
at a configurable time-of-day (a new Settings → Notifications default, e.g.
"9:00 AM"), instead of requiring the exact date+time to be picked twice for
the common case of "just remind me the day it's due."

### B13. Sync on/off toggle
Settings → Sync currently only has the CouchDB URL field — there's no way
to temporarily disable sync without clearing the URL (which drops the
configured server entirely). Add an explicit on/off toggle that calls
`startSync()`/cancels `_syncHandler` without touching the stored URL, for
"stop syncing for a while" without losing the configuration.

### B14. Explain the storage quota number
Settings → Data shows the raw `navigator.storage.estimate()` output
("X MB used / Y MB quota") with no context — the quota figure in particular
is a browser-assigned ceiling most users have never encountered and don't
know how to interpret. Add a short inline explanation (e.g. "quota is set
by your browser based on available disk space, not by Offlog") and clarify
whether approaching it matters (it doesn't, in practice, until real disk
pressure — PouchDB/IndexedDB storage for a single-user task list is tiny
relative to typical quotas).

### B15. Fold Maintenance into the Settings detail pane
v3.6.0 gave Maintenance its own modal-on-top-of-a-modal (Settings →
Maintenance → "Run Maintenance" opens `MaintenanceModal.svelte` layered on
top). Now that Settings itself has a proper category/detail structure,
review whether Maintenance's step list, progress bar, and Run button can
render directly in the Maintenance category's detail pane instead of a
second overlay — one less layer, and it's no longer clearly justified now
that Settings has real internal navigation of its own.

### B16. Custom fields
Tasks currently have a fixed shape (title, body, priority, due date,
reminder, tags, pinned) — no way to add a project-specific field (e.g.
"URL", "Estimate", "Client"). Add a per-project custom field definition
(name + type: text/number/date/select) stored on `ProjectDoc`, rendered in
`CardDetail` after the built-in fields, and as extra columns in Table view.
Keep it opt-in and simple — this is the kind of feature that can easily
balloon into a mini database builder; resist that, a handful of typed
fields per project is the ceiling, not a schema editor.

### B17. Dashboard as a real home screen
`DashboardView.svelte` is already the default landing view, but it's thin —
worth deliberately investing in it as *the* first thing a user sees, not an
afterthought next to Kanban/List/Table. Candidates: a genuine "what needs
attention today" summary instead of raw counts, a quick-glance per-space
breakdown, and surfacing recently-completed tasks for a sense of progress.
Should stay fast and calm, not a cluttered analytics page — the goal is
"open the app, immediately know what to do," not a dashboard for its own
sake.

### B18. Subtasks / checklists within a task
`CardDetail` has a free-text markdown body but no structured checklist —
a natural fit given the notes field already exists. A simple `checklist:
{ text: string; done: boolean }[]` array on `TaskDoc`, rendered as tappable
checkboxes in `CardDetail`, with a small "3/5 done" progress indicator
surfaced on the card itself in Kanban/List/Table.

### B19. Bulk actions in List/Table
Every task action today is one-at-a-time. Add multi-select (checkbox per
row, shift-click range select) to List and Table views, with a bulk action
bar for move-to-status, add/remove tag, and delete — the same underlying
`updateTask()`/`deleteTask()` calls, just looped with one `reloadTasks()`
at the end instead of per-task.

### B20. Agenda widget
A second home-screen widget alongside B10's Quick Add — read-only, showing
the next 2-3 due tasks via the same `getAllTasksDue()` query already used
by the Agenda view. Reuses the `AppWidgetProvider`/RemoteViews plumbing
B10 already established; the main new work is `updatePeriodMillis`-driven
refresh (Quick Add's widget never needed to update itself after creation,
this one does whenever the underlying data changes).

---

## Track C — Public Release & Open Source

Goal: the mission above, made concrete. Unlike Track A/B, these aren't
paired into a version bump each — they're mostly one-time setup work, and
several can start independently of whatever A/B release is in flight.

### C1. Open-source the repository on GitHub
Push the existing local repo public: pick a license (leaning MIT — the
goal is people freely using and forking this, not enforcing copyleft
against anyone), add `LICENSE`, a `CONTRIBUTING.md`, issue templates, and a
README written for someone who has never seen this project before, not
just this local CLAUDE.md-oriented one. Audit for anything that assumes a
local-only environment (paths, comments referencing internal-only context)
before it goes public. Blocked on **C7** (credential cleanup) and a real
stability/security pass — see the note there and in DECISIONS.md.

### C2. Zero-config first run, verified
The architecture is already local-first with no required server, but this
needs to be *verified*, not assumed: a fresh install, no CouchDB configured,
should never prompt for setup or imply something is missing. Audit
first-run copy (Settings → Sync especially) to state plainly that sync is
optional, not a "you should really configure this" nag.

### C3. Play Store listing
A signed release build (proper keystore, not the debug one), a Play
Console developer account, and store listing assets — icon, screenshots,
short/long description, and a privacy policy page (required even with zero
telemetry — "we collect nothing" still needs to be a page). Copy should
frame Offlog as a calm personal tool, not pitch it against Trello/Notion/
ClickUp/Jira by feature count.

### C4. F-Droid listing — declined
Considered and explicitly declined by the owner (2026-07-02): Offlog isn't
being positioned as "an app that needs to be in every store." Distribution
stays to GitHub + a website + Google Play; no iOS. See DECISIONS.md.
Number kept (not reused) so it's clear this was a decision, not an
oversight.

### C5. Public web install landing page
For anyone who'd rather not go through an app store: a small, plain
landing page (GitHub Pages is enough) with a single "Install" / "Add to
Home Screen" button for the existing PWA build — no jargon, no setup
explanation needed for the common case.

### C6. Brand & positioning pass
A short pass over README/store copy/landing page copy to make sure the
"not competing, just likable" framing from the Mission above actually
comes through — description text should sell the feeling of using Offlog,
not a feature-parity checklist against bigger tools.

### C7. Fix hardcoded CouchDB credentials — mandatory, blocks C1
`offlog-app/src/config.ts` hardcodes a real CouchDB password and LAN IP as
fallback defaults, present in git history too. **This must be fixed before
the repo goes public or any store listing goes live** — not optional, not
best-effort. Also the reason the repo stays private for now (see
DECISIONS.md): going public happens only after this is fixed *and* the app
has had a real stability/security pass. Fix approach: no real credentials
in source at all, `.env.local`-only with no committed fallback; if the
existing local repo's history matters to keep, this may mean publishing to
GitHub as fresh history rather than pushing this repo's full log — decide
at the time based on how much of the commit history is worth keeping
public vs. how much scrubbing it needs.

---

## Track D — Mesh Sync (long-horizon, not yet started)

The single hardest problem standing between "works great for one person on
one device" (true today) and "installable by anyone, works across all
their devices" (the mission) is **multi-device sync without asking a
non-technical person to run a server**. CouchDB self-hosting is the current
answer and will remain available — but it's fundamentally a power-user
feature, not a mission-complete one. This track is not sequenced into the
A/B/C release table below yet; **D0 is a spike whose outcome determines
whether the rest proceeds as designed.**

### The idea
Every device running Offlog can act as **both a sync client and a sync
server**. A person with a phone, a home PC, and a tablet pairs the three
once (via QR code), and from then on any two that are reachable — same
Wi-Fi, or a direct connection — replicate directly with each other. No
central server in the loop. CouchDB stays available as an alternative
transport for devices that are never on the same network — mesh and
CouchDB aren't mutually exclusive, they're two transports for the same
underlying PouchDB replication protocol.

### Why this is novel, not just "another sync feature"
PouchDB already speaks a CouchDB-compatible HTTP replication protocol —
that part isn't new. What's genuinely rare is turning every *end-user
device* into a replication endpoint, rather than requiring a server
(self-hosted or vendor-hosted) as the hub. Most "local-first" tools that
claim this either still require a relay server for discovery/NAT
traversal, or restrict peer-to-peer to two devices on the same LAN with
manual IP entry. A phone that can *also* be a server, discoverable by QR
code, with automatic reconnection once paired, is a stronger claim than
most of the local-first space currently makes honestly.

### Why it's hard, stated plainly
- **Running a server on a phone** means a background process with a
  listening port — battery and OS-lifecycle implications (Android
  restricts background services; this is Android-only in scope per the
  no-iOS decision, which helps but isn't free).
- **Network reachability is the core problem.** Same-Wi-Fi is easy.
  Different Wi-Fi (phone on cellular, laptop on home network) is not —
  needs either a rendezvous/discovery step or an honest, visible
  "sync next time you're on the same network" fallback, not a silent
  failure.
- **Security of an ad-hoc local HTTP server** is a real problem, not a
  detail — see the Security section below.
- **N-way conflict resolution** — PouchDB's replication is multi-master-
  safe pairwise, but a mesh of 3-4 devices syncing opportunistically
  (not always all-connected at once) needs to be tested specifically for
  that topology, not assumed safe by extension.

None of this is a reason not to build it — it's the reason it's phased
below instead of attempted as one release.

### Architecture

```
┌─────────────┐        QR pairing (one-time,          ┌─────────────┐
│   Phone      │◄──────  out-of-band trust  ─────────►│     PC       │
│  (Offlog +   │        exchange, establishes          │  (Offlog +   │
│  local sync  │        a shared pairing secret)       │  local sync  │
│  server)     │                                        │  server)     │
└──────┬──────┘                                        └──────┬──────┘
       │                                                       │
       │         same Wi-Fi: direct PouchDB replication        │
       │         (device-to-device, mDNS-style rediscovery      │
       │◄────────  after the first pairing) ────────────────►│
       │                                                       │
       │                                                       │
┌──────▼──────┐                                        ┌──────▼──────┐
│   Tablet     │◄──── same mesh, same pairing model ──►│  (optional)  │
│              │                                        │  CouchDB     │
└─────────────┘                                        │  relay, for  │
                                                          │  devices     │
                                                          │  never on    │
                                                          │  the same    │
                                                          │  network     │
                                                          └─────────────┘
```

Key architectural choices (full rationale in DECISIONS.md):
- **Local HTTP server per device**, exposing a CouchDB-compatible
  replication endpoint against the device's own PouchDB instance —
  `pouchdb-server`-style, run as a Capacitor background process on
  Android, a small companion process on desktop/PC.
- **QR code for initial pairing only.** The QR payload carries the
  pairing device's current local address plus a one-time pairing token —
  scanned once, it establishes a long-lived shared secret used to
  authenticate all future connections between those two specific devices.
  No account, no external server involved in pairing.
- **mDNS/local network discovery for reconnection**, so two already-paired
  devices on the same Wi-Fi find each other automatically without
  re-scanning a QR code.
- **CouchDB remains a fully independent, optional transport** — mesh only,
  CouchDB only, or both at once, same as any CouchDB URL today.
- **Per-device retention policies govern local storage**, not a global
  cap — see Retention below.

### Phased implementation guide (nothing here ships as one release)

**D0 — Seed / the "clean baseline" for this whole track.** Before any
networking code: a throwaway spike answering whether a background
CouchDB-compatible server can actually run inside a Capacitor Android app
and survive being backgrounded — the single riskiest technical assumption
in the whole plan. Also decide the PC-side equivalent (the web build has no
native background process today — does mesh sync need an Electron-style
wrapper, or a companion lightweight local server?). Output: a written
go/no-go informing whether D1 proceeds as designed.

**D1 — Pairing, two devices, same Wi-Fi only.** QR-code pairing UI,
one-time trust exchange, shared secret storage. Manual "sync with paired
device" trigger (not automatic yet) — proves the replication path works
before automating it. No mDNS yet. Ship as an experimental, opt-in Settings
feature, clearly labeled early-stage.

**D2 — Automatic reconnection, same network.** mDNS-based rediscovery of
already-paired devices; background/live sync against them, same trigger
model `startSync()` already uses for CouchDB.

**D3 — Real N-way mesh + retention.** Test and harden the 3+ device
topology explicitly, not just assume pairwise correctness generalizes.
Retention policy UI (see below) becomes necessary once storage isn't
bounded by "whatever fits in one CouchDB instance."

**D4 — Cross-network fallback.** The hard, possibly-permanently-out-of-
scope case: phone on cellular, laptop on home Wi-Fi, no shared network.
Candidates needing real research before commitment: a lightweight
self-hostable rendezvous relay (still no vendor lock-in, just a discovery
hop), or explicitly documenting "mesh sync requires a shared network; use
CouchDB for always-available sync" as the honest permanent answer.

### Security — a hard gate, not a nice-to-have
Current state, stated plainly rather than assumed:
- **No login/account concept exists.** Physical access to an unlocked
  device is full data access — an accepted local-first tradeoff, but an
  explicit one; an optional app-level PIN/biometric lock (Capacitor
  biometric plugins exist) for shared devices is a candidate Track B item.
- **CouchDB sync traffic is not encrypted today** — `config.ts` talks to a
  plain `http://` LAN address with a hardcoded username/password (see
  Track C's C7). Minimum bar before any public release: sync must support
  HTTPS, no credential ships hardcoded in source.
- **No encryption at rest.** IndexedDB storage is plaintext. Worth
  deciding deliberately whether this matters for the target audience (a
  personal task manager, not a password manager) rather than leaving it
  undecided.
- **Mesh sync raises the stakes on all of the above.** An ad-hoc local
  HTTP server, even LAN-only, is a bigger attack surface than one
  configured CouchDB URL. The QR pairing secret must be treated as a real
  credential — used to authenticate *and* encrypt the connection, never
  logged or displayed again after the initial pairing screen.

None of this blocks D0-D1 experimentation, but **no mesh-sync phase past
D1 ships to real users without a real security review** — a hard gate,
precisely because it's exposing a network service from a personal device
for the first time in this app's life. See QUESTIONS.md's Q4/Q7/Q8 for
what's still unresolved about how to actually execute that review.

### Retention & "unlimited" storage
Is truly unlimited local storage realistic? Not without a policy — and the
app already has the right instinct (log/deleted-task pruning exist today,
see CLAUDE.md's db.ts invariants), it just needs to stay deliberate and
user-facing as mesh sync raises the stakes:
- Keep the existing time-based retention pattern as the default, but make
  retention windows **visible and adjustable** in Settings once mesh sync
  is in play, since a phone's storage budget is much tighter than a PC's.
- A device in the mesh doesn't need to hold every historical revision
  forever just because another device does — retention can reasonably be
  **per-device**, not a single global policy, once D3 lands.
- This is exactly what A17 (storage-pressure handling, Track A) exists to
  cover — mesh sync makes it more urgent, not a new problem.

---

## Business model — sustaining this without compromising "free forever"

The app and its core code stay free and open-source permanently, but the
project needs to be able to sustain its owner. The model that fits,
matching how comparable local-first projects (Obsidian, Standard Notes,
Bitwarden) actually sustain themselves without betraying an open-source
mission:

- **The app is never paywalled, never feature-gated, never ad-supported,
  never sells data.** Non-negotiable per the Mission above.
- **Any paid layer is convenience, not capability** — most plausibly, an
  optional hosted sync relay for people who don't want to self-host
  CouchDB *or* deal with mesh pairing. Anyone capable of self-hosting or
  using mesh sync gets 100% of the same functionality free, forever.
- **GitHub Sponsors / a simple donation link** is the lowest-effort,
  lowest-risk starting point — can exist immediately once the repo is
  public, no product work required.
- **The Play Store listing stays free** — a paid app or in-app purchase
  would contradict the mission directly. A hosted-relay product, if it
  happens, is sold separately from the app, never as an IAP inside it.

This doesn't need to be decided in detail yet — it needs a direction that
doesn't get contradicted by product decisions made before it's addressed.
See QUESTIONS.md's Q5/Q6 for what's still genuinely unresolved here.

---

## What's next, if this succeeds

Two real directions, not chosen between yet, just named so they're
revisited deliberately rather than forgotten if Offlog does well:

1. **The sync/mesh engine outgrows the task manager.** A device-pairing +
   mesh-replication layer built well isn't inherently task-manager-
   specific — it's a reusable local-first sync core other personal-data
   apps (notes, habit tracking, a private journal) could sit on top of.
   If ever pursued, this should be a deliberate architectural decision
   (extract the engine, keep Offlog as the flagship app on top of it), not
   an accident of code reuse.
2. **The project becomes a public reference/case study** — both for
   local-first architecture (Svelte + PouchDB + Capacitor, documented in
   TECH.md) and for AI-assisted development done with real discipline
   (this whole docs/ set as a working example, not marketing copy). Has
   value independent of the app's own user count.

Neither is a commitment — written down so that if Offlog does succeed, the
next decision is a deliberate one made with this context in hand, not a
scramble.

---

## Open questions

Anything genuinely unresolved — technical feasibility, business-model
specifics, security tradeoffs — that would benefit from an outside AI's or
human's opinion lives in [QUESTIONS.md](QUESTIONS.md), not scattered inline
here. Check there before assuming an item above is fully settled.

---

## Sequencing suggestion

The original 5:10 Track A:B split below is fully paired through v4.0.0.
A15–A17 and B11–B20 (added while reshaping Settings in v3.6.0 and while
scoping the app's growth beyond v4.0.0) aren't slotted into a release yet —
re-pair them alongside whichever future items land, rather than
force-fitting them into the table below. Track C runs independently of
version numbers: **C7 (credential fix) and C2 can start now**, in parallel
with v3.8.0, since they're documentation/verification/security work that
barely touches app code; **C1/C3/C5/C6 fit naturally once the app feels
"finished enough" to represent well in a public listing** — realistically
after v4.0.0, once the current Track A/B backlog has landed. Track D (mesh
sync) isn't sequenced at all yet — D0 is a spike whose outcome determines
whether it's sequenced as designed.

| Release | Track A | Track B | Why paired |
|---|---|---|---|
| **v3.6.0** | A9 — UI component tests | B1 — Space management, B6 — Tag management | Both features are small, self-contained "manage X in Settings" screens — same shape, low risk, a good first target to exercise the new component-testing setup from A9 before anything more complex. |
| **v3.7.0** (shipped) | A13 — Accessibility re-audit, A14 — Android hardware back-button handling | B3 — Notification actions, B10 — Android quick-capture widget | An Android-focused release — both features are native-only surface (notification action buttons, home-screen widget). A14 (found during v3.6.0's Settings redesign) folded in here since it's squarely Android interaction plumbing, same as A13's focus on the newest interactive elements. **Moved ahead of the original v3.7.0** per owner request to prioritize Android work first. |
| **v3.8.0** | A11 — Error-handling audit, pass 2 | B2 — Kanban filters, B9 — Command palette | Both add many new mutation/action call sites — auditing the try/catch + `showError()` invariant first makes it a live checklist while building these, not a separate pass done after the fact. |
| **v3.9.0** | A10 — Large-dataset performance validation | B7 — Calendar/week view, B4 — Import/export v2 | Both features are data-volume-sensitive (a new heavier render view, bulk export/import) — validating performance at scale in the same cycle catches regressions before they ship, not after. |
| **v4.0.0** | A12 — Notification reliability audit | B5 — Multi-device polish, B8 — Project templates | A12 and B5 both deal with sync/timing edge cases (DST, timezones, multi-device drift) — natural fit. B8 closes out the roadmap; the milestone bump to v4.0.0 marks the whole current plan shipped. |

Within each release: land the Track A item first (or in the same PR as the
first Track B item it protects/enables), then the two Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land — don't let
coverage fall behind again. Re-evaluate this table after each release;
delete shipped rows and re-pair whatever's left if new items get added to
either track in the meantime.
