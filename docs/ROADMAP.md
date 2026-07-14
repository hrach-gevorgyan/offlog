# Offlog Roadmap

Current version: **v4.17.0**. Everything below is a candidate, not a
commitment. Items are ordered roughly by value-for-effort within each
track. Before starting any item, re-check it against the current code —
this document describes intent, not state.

**Shipped work lives in [CHANGELOG.md](CHANGELOG.md), not here.** This
file keeps only: open (unshipped) items with full detail, a one-line
pointer for shipped items (so old item numbers/cross-references still
resolve to something), and the forward-looking sequencing plan. For *why*
a non-obvious choice was made, see [DECISIONS.md](DECISIONS.md); for open
questions worth outside input, [QUESTIONS.md](QUESTIONS.md); for how the
app works today, [TECH.md](TECH.md).

## Mission

Offlog is free, open-source, and local-first — no account, no telemetry, no
subscription, ever. It's a personal tool: built by one person for their own
use, and given away as-is for anyone else who wants the same thing. There is
no business model and none is planned. The goal on this roadmap is making it
something a non-technical person can actually find and install without
knowing what "self-host CouchDB" means: an official listing (Play Store), a
public GitHub repo, a real license — not growing it into a product. Offlog
is not trying to out-feature Trello, Notion, ClickUp, or Jira, or Obsidian —
it isn't competing with them. Every roadmap item should be judged against
one question: does it make Offlog nicer for its owner to use, or does it
just make it bigger?

---

## Path to v1.0 — the whole story, even the parts that aren't realistic yet

This section exists so the destination is never buried under backlog
detail. It's a narrative, not a schedule. **Rewritten 2026-07-13** after
an owner direction-setting session declaring the feature-building phase
over, **reordered 2026-07-14** once Track E (the PC app) was pulled
forward — see E1's own entry for the reasoning. The backlog's big
remaining architecture experiments (B33 sub-projects, B28 rethinking
positional-done) stay parked either way.

1. **Now — Track E, the PC app as host.** GOAL.md's full vision: a real
   PC app, downloaded and run, that *is* the sync host — phones connect
   to it over home Wi-Fi with no CouchDB knowledge required. Working
   end-to-end already (E1) — installer signing deliberately deferred
   (not required, real annual cost — see E1's own entry), so what's
   next is real dogfooding. All new-feature work is paused until this
   track lands.
2. **Then — the release gate (Track C core).** C7 credential fix —
   current source is clean as of 2026-07-14, but git history still
   needs handling at C1 time (see C7's own entry, don't consider it
   fully closed until then) — C2 zero-config first-run verification,
   then C1 GitHub, C5 landing page, C3 Play Store. This is the
   externally-visible "we made it" milestone.
3. **In parallel wherever it doesn't compete with Track E — make it
   speak human (Tracks B/C polish items).** Storage copy a non-technical
   person understands (B44 — shipped), a proper icon (C8 — shipped),
   self-hosted fonts (C9 — shipped), and a plain-language pass over every
   remaining string and document (C10). None of these are features; all
   of them are the gap between "works for its developer" and "works for
   a person."
4. **After the release gate — dogfooding at scale.** The owner using
   Offlog daily, across both a real PC install and Android, is the
   honest stability test no audit can substitute for. Bugs and friction
   found in real use outrank everything in the backlog.
5. **After that, there's no further destination.** Offlog stays a personal
   tool shared as open source — not a product growing toward a business.
   Maintenance passes continue; features return only when the owner
   personally wants one. Mesh sync and any form of monetization were both
   considered at length and explicitly declined (2026-07-03) — see
   DECISIONS.md.

A public repo with hardcoded credentials in its history would undermine
the entire premise — C7 is a real, non-negotiable gate on step 2, not
just narrative flow, regardless of what order the other steps land in.

---

## Track A — Performance & Stability

Goal: the app stays trustworthy as data grows and devices multiply. No new
user-visible features; every item here should be invisible when it works.
Shipped items: one-line pointer only — full detail in CHANGELOG.md.

### A9. UI component tests — FIRST SLICE SHIPPED in v4.15.0
`tests/db.test.ts`/`modalStack.test.ts`/`sync.test.ts` cover the database
and pure-logic layers only — every `.svelte` component had zero automated
coverage before this, caught only by manual browser verification.
`@testing-library/svelte` added; `CardDetail`'s save logic is the first
component covered (`tests/CardDetail.test.ts`, 5 tests) — the highest-risk
of the three originally-named targets since it's the one everyday-use path
where a save silently writing the wrong thing would be easy to miss.
Needed a real Vitest config fix to work at all: `resolve: { conditions:
['browser'] }` in `vitest.config.ts`, without which Svelte resolved to its
SSR build even under jsdom and any `onMount`/`onDestroy` component failed
outright — nothing had exercised that path before this.

**Still open**: `KanbanBoard`'s drag/drop position math (real HTML5 drag
events are notoriously hard to simulate reliably in jsdom — may need a
different testing approach, e.g. testing the position-calculation logic
in isolation rather than through simulated drag events) and `Sidebar`'s
Maintenance step orchestration (large dependency surface — depends on
`checkIntegrity`/`repairDatabase`/`pruneOldLogs`/sync state/storage
breakdown). Not re-scheduled to a specific version; same track as A9's
original scope.

### A10. Large-dataset performance validation — shipped in v4.7.0
Validated via A24's new benchmark harness (`npm run bench`) at 3,000 tasks
across 8 projects: `getDashboardData()` and `searchAllTasks()` stay
sub-millisecond (in-memory cache), `getTasksForProject()` (the one path
that queries PouchDB's Mango index directly, uncached) sits around 10ms —
no perf cliff found at this scale. Actual Svelte component render time
(Kanban/List) isn't measured — that needs A9's still-open component test
infrastructure first.

### A11. Error-handling audit, pass 2 — shipped in v4.6.0

### A12. Notification reliability audit — shipped in v4.4.0

### A13. Accessibility re-audit for the newer components — shipped in v3.7.0

### A14. Android hardware back-button handling — shipped in v3.7.0

### A15. Widget/back-button regression coverage — shipped in v4.1.0

### A16. Offline-queue robustness for sync — shipped in v4.2.0

### A17. Storage-pressure handling — shipped in v4.3.0

### A18. PWA not force-updating after a new version ships — shipped in v3.8.0

### A19. First launch should always open Dashboard — shipped in v3.8.0

### A20. List view attribute alignment still breaks with mixed deadlines — shipped in v3.8.0

### A21. Visual check: tag overflow past 3 tags — shipped in v3.8.0

### A22. Accidental "mark done" click has no undo — shipped in v3.8.0

### A23. Sidebar scale test with 20+ projects — shipped in v3.9.0

### A24. Version-over-version performance metrics — shipped in v4.7.0
New `tests/perf.bench.ts` + `npm run bench` (Vitest's native `bench`,
separate from `npm test` — benchmarks are slow and not pass/fail). Times
`getDashboardData()`, `getTasksForProject()`, and `searchAllTasks()` at a
3,000-task stress scale. No hardcoded thresholds (absolute timings depend
on the machine); compare the printed numbers release to release.

### A25. Quick Add widget opened the app but not Quick Add — shipped in v3.9.8

### A26. PWA staleness / dev workflow needs a decision — resolved by removal in v4.11.1
The recurring staleness problem (a stale icon/design persisting after an
update, even after A18's forced `registration.update()` call) is moot: PWA
support was dropped outright rather than patched further (owner decision,
2026-07-12) — web is browser-only now, no installability/service worker.
See DECISIONS.md.

### A27. Project-view no longer force-resets to Kanban on every refresh — shipped in v3.9.8

### A28. Exact-alarm ("Alarms & reminders") permission has no in-app status/control — shipped in v3.9.8

### A29. "Cannot reach sync server" doesn't say why — shipped in v4.4.1

### A30. Full codebase audit, cleanup, and documentation-flow optimization — shipped in v4.12.0
Owner-directed pivot (2026-07-12). **Code side**: dead code — none found.
Duplicated logic fixed: `fmtLastSynced`/`fmtFullTimestamp` were byte-
identical across Sidebar/SettingsPanel and CardDetail/TaskHistoryPanel —
consolidated into `utils.ts`; `TrashView.svelte` reimplemented `timeAgo()`
instead of importing the existing export — fixed. A real bug was caught
and fixed: `CardDetail`'s collapsible-section state (`showChecklist`/
`showNotes`/`showCustomFieldsSection`) was plain `let`, not reset per
task — every call site now wraps `<CardDetail>` in `{#key task._id}` to
force a remount instead of risking stale collapse state carrying over.
Also fixed: `CustomSelect.svelte` didn't move focus into its popover on
mouse-click open, so arrow keys did nothing until manually tabbed in.
`ListView.svelte`/`SettingsPanel.svelte` remain oversized (875/896 lines)
— splitting them turned out to need a shared-style-layer decision first
(their categories/sections all lean on ~150 lines of CSS classes defined
once in the parent; extracting now would mean duplicating that CSS into
every new file, the opposite of this release's goal) — deferred, not
done. `npm audit`'s `uuid` advisory confirmed genuinely reachable
(`pouchdb-find` is actually bundled, unlike core `pouchdb` which is
UMD-only) but still not worth a breaking pouchdb downgrade. **Docs side**:
ROADMAP.md's own "shipped items get a one-line pointer, full detail in
CHANGELOG.md" rule was being ignored by ~15 items carrying full paragraphs
duplicating CHANGELOG.md nearly verbatim — trimmed, cutting this file from
607 to well under 500 lines. CLAUDE.md's doc-list synced to mention
MAINTENANCE.md/CHANGELOG-ARCHIVE.md. CLAUDE.md itself checked for PWA-
removal staleness — already clean, no gaps found.

### A31. Full cross-platform visual/UX review — DONE except Android (v4.12.1 + since)
Owner-directed (2026-07-12): a systematic visual pass over every page and
action (Dashboard, Kanban, List, Focus, Agenda, Settings, CardDetail, all
manager panels), not a spot-check — using the browser preview tools at
desktop + mobile widths, light + dark mode, screenshotting each and
reporting concrete issues plus suggested fixes toward "organic, readable,
understandable, compact, focused" design. Explicitly cross-platform:
findings need to hold up consistently across web and the Android build,
not just the desktop browser.

**Web coverage is now complete.** Desktop light-mode pass over Dashboard/
Kanban/List/CardDetail/Agenda(List+Week)/Focus/Settings(all 6 tabs)/
Search/Command Palette/Changelog/Trash/Space-Tag-CustomField managers/
List bulk-select/FilterBar popover/ConfirmDialog (danger variant), plus a
mobile (375px) pass and a dark-mode pass (the manager-panel/bulk-
select/FilterBar/ConfirmDialog round was screenshotted entirely in dark
mode). Testing used a realistic seeded dataset (10 projects with mixed
default and custom column sets, 100+ tasks) via `offlog-app/scripts/
seed-scenario.js` rather than a handful of sparse dummy rows.

Real bugs found and fixed along the way: a WCAG contrast failure
(`--faint`/`--accent`, new `--on-accent` token added, 17 call sites), a
duplicated `ACTION_COLOR` map consolidated, scroll-shadow affordances
added to 3 overflowing containers, Dashboard's project grid overflowing
at mobile widths (root cause: a bare `1fr` grid track's implicit `auto`
min-size doesn't clamp to its container — needed `minmax(0, 1fr)`), and
Focus view's fixed FAB overlapping its own Commit button footer at mobile
widths. The `.ok-btn.danger` confirm-dialog button was independently
verified correct (dark text via `--on-accent`, 6.29:1 contrast) — no
further issues found in the manager-panel/bulk-select/FilterBar/
ConfirmDialog round.

**Still open: Android is entirely unverified** — no `cap sync`, no
on-device/Studio check; this needs the owner directly, per CLAUDE.md's
Android-build rule (the assistant never runs Gradle). Everything else in
this item's original scope has been covered — closing web/desktop/mobile
coverage out, leaving only the Android leg open, picked up whenever the
owner runs a Studio check.

### A32. Sync reports "synced" when devices aren't actually syncing — OPEN, URGENT
Owner-reported (2026-07-13, real on-device use): PC and phone both show a
synced/idle status with no error, but changes made on one don't appear on
the other. This is the most serious of the owner's reported issues — a
false-positive sync status is worse than an honest error, since it hides
data divergence instead of surfacing it. Needs investigation before
anything else in this batch: check whether `startSync()`'s live
replication is actually establishing (network reachability between the
two devices' LAN addresses, CouchDB reachable from both), whether
`syncState.status` is being set to `'idle'` prematurely (e.g. on the
`'paused'` event PouchDB fires between change batches, which isn't the
same as no more changes existing), and whether writes are actually
reaching the remote CouchDB at all (check the CouchDB server's own doc
count against each device's local count). Likely needs the owner to
reproduce with both devices' consoles/logcat visible.

### A33. Android notifications fire silently, not fully functional — shipped in v4.18.0
Owner-reported (2026-07-13): notifications do appear on Android but
without sound/proper behavior — "silent one, still not fully functional."
Root cause: nothing in `notifications.ts` ever created an Android
notification channel, and scheduled notifications didn't set a
`channelId` either — Android 8+ requires one per notification, and
without an explicit channel the OS/plugin falls back to an
auto-created "Default" channel whose importance (fixed forever once
created — only the user can change it later, in system settings) isn't
guaranteed to include sound or a heads-up popup. Fixed by explicitly
creating a high-importance `reminders` channel (`ensureReminderChannel()`
in `notifications.ts`, called both at listener-init time and before
every native schedule) and tagging every scheduled notification with it.
Needs an owner APK build/Studio check to confirm sound+heads-up on a
real device, per the standing Android verification rule.

### A34. Export JSON doesn't work on Android — shipped in v4.18.0
Owner-reported (2026-07-13). Root cause confirmed: the `<a download>` +
blob-URL trick `downloadBlob()` used has no browser download manager to
hand off to inside a Capacitor WebView, so it silently did nothing.
Fixed by branching on `Capacitor.isNativePlatform()`: on native, write
the file to app cache storage via the new `@capacitor/filesystem`
dependency and hand it to the OS share sheet via the new
`@capacitor/share` dependency (both newly added, owner-approved);
web keeps the existing blob-download path unchanged. Applies to all
three export paths (JSON backup, per-project JSON, tasks CSV) since they
all funnel through the same `downloadBlob()`. `npx cap sync android` run
to register the two new plugins — needs an owner Studio build to verify
the share sheet on a real device. Ties into B45's export/import redesign
below, which can build on this native mechanism rather than replacing it.

### A35. Desktop sync defaults to loopback, not a rememberable LAN IP — shipped in v4.18.0
Owner session after the A32 incident (a DHCP lease change silently broke
sync on every device). First plan was a 3-phase "no human ever types an
IP" system (uuid-verified server identity + automatic LAN rescan + QR
pairing + eventually a native mDNS-discovering PC app). Owner correctly
pushed back mid-plan: if Track E (the native PC app) is the real,
permanent answer, building throwaway interim machinery for it isn't the
right call — better to ship the one piece that's unconditionally correct
regardless of that future architecture, and pull Track E forward instead
of building a bridge to it. Landed: on desktop web, `DEFAULT_SYNC_URL`
now defaults to `http://127.0.0.1:5984/offlog` instead of any real LAN
address, whenever nothing was explicitly configured. This is sound in a
way the old hardcoded-IP default never was — loopback is *structurally*
guaranteed correct for a co-located server (this app's whole architecture
is "the PC is the host," GOAL.md), not a guess that can go stale the way
a remembered IP can. Android still falls back to `''` ("not configured")
since a phone's own 127.0.0.1 is itself, not the PC — Settings already
shows a friendly "Not connected yet" for that case (B43). Verified live:
cleared localStorage, reloaded, Settings showed the loopback URL
pre-filled and "Connected — last synced" with zero manual input.
**The phone-side auto-rescan/QR-pairing phases were deliberately not
built** — see Track E, pulled forward as the actual next priority instead.

---

## Track B — Features

Goal: close the gaps a single power user actually hits. Nothing here should
compromise local-first (no feature may require a server beyond CouchDB).
Shipped items: one-line pointer only — full detail in CHANGELOG.md.

### B1. Space management — shipped in v3.6.0

### B2. Filters on Kanban + saved filters — shipped in v4.11.0

### B3. Notification actions — shipped in v3.7.0

### B4. Import/export v2 — shipped in v4.7.0

### B5. Multi-device polish — shipped in v4.2.0

### B6. Tag management — shipped in v3.6.0

### B7. Calendar / week view for Agenda — shipped in v4.7.0

### B8. Project templates — shipped in v4.14.0

### B9. Command palette — shipped in v4.10.0

### B10. Android quick-capture widget — shipped in v3.7.0

### B11. High contrast mode — shipped in v4.6.0

### B12. Auto-reminder from due date — shipped in v4.4.0

### B13. Sync on/off toggle — shipped in v4.2.0

### B14. Explain the storage quota number — shipped in v4.3.0

### B15. Fold Maintenance into the Settings detail pane — shipped in v4.9.0

### B16. Custom fields — shipped in v4.6.0
Shipped with one change from the original scope: fields are **global**
(one shared list across every project, managed from Settings → Organize →
Manage Custom Fields), not per-project on `ProjectDoc` — owner feedback
during implementation was that per-project definitions plus inline
add/remove in `CardDetail` made it too easy to end up with an unmanaged
sprawl of one-off fields. `TaskDoc.custom_values` stays keyed by field id.
`CardDetail` caps how many fields show by default (3), with a "show more"
toggle, so a project with several fields defined doesn't turn every card
into a long form.

### B17. Dashboard as a real home screen — shipped in v4.10.0

### B18. Subtasks / checklists within a task — shipped in v4.11.0

### B19. Bulk actions in List — shipped in v4.6.0

### B20. Agenda widget — shipped in v4.1.0

### B21. Dark mode follows OS setting — shipped in v4.6.0

### B22. Named clients/devices — shipped in v4.2.0

### B23. Sidebar: last modified cards — shipped in v3.9.0

### B24. Seed data: 3 spaces, not 4 — shipped in v4.15.0

### B25. Deadline quick-suggestions on new card — shipped in v4.0.0

### B26. Tag autocomplete beyond the current project — shipped in v4.0.0

### B27. Archived tasks are too hidden — shipped in v4.9.0

### B28. Rethink "last column = done" — PARKED (2026-07-13)
The positional-done convention (`column_id === columns.at(-1)`) is a locked
invariant (see DECISIONS.md) — but it also means a project's last status is
*always* the done state, with no multiple terminal states. Needs a real
design conversation before any implementation; may stay exactly as-is
after that conversation. **Parked with the feature-phase wind-down**
(owner, 2026-07-13 — see Path to v1.0): revisit only if daily dogfooding
proves the current rule actually hurts, not on schedule.

### B29. Show tags on Kanban cards — shipped in v4.15.0

### B30. Notes length guardrail — shipped in v4.14.0

### B31. Third Android widget: project list — shipped in v4.1.0

### B32. Archive a whole project — shipped in v4.9.0

### B33. Sub-projects — PARKED (2026-07-13)
Nested project hierarchy — a project containing child projects. Genuinely
large: touches the data model (`ProjectDoc.space_id` becomes more like
`parent_id`), every view's project-picker UI, and Dashboard/sidebar
nesting. **Parked with the feature-phase wind-down** (owner, 2026-07-13 —
see Path to v1.0): exactly the kind of architecture experiment the
stabilization pivot exists to stop; revisit post-release only if real
daily use demands it.

### B34. Project pinning — shipped in v3.9.0

### B35. Focus view — draft shipped in v4.5.0, more planned
Shipped as a **daily commitment lock**: pick up to 3 open tasks/day,
ranked pinned > overdue > due-soon > priority with a "why" chip per
suggestion; lock is `localStorage`-only (not a PouchDB doc, deliberately
ephemeral/unsynced), clears on day rollover. Superseded an earlier
auto-computed read-only priority-list design the owner rejected live as
"not making sense." Full detail in CHANGELOG-ARCHIVE.md's v4.5.0 row.

**Still explicitly a draft — not yet closed out.** Confirmed next steps
(2026-07-08), not yet built:
- **Add task from within Focus** — currently you can only pick from
  existing open tasks; there's no quick-add entry point on this view.
- **Connect with Dashboard** — Focus and Dashboard currently don't
  reference each other at all; some link/summary between them is wanted,
  exact shape not yet decided.
- **A "Daily Brief" summary card** (Samsung Daily Brief-style) — a short
  auto-generated line ("3 overdue, 2 due today, last worked on Project X")
  at the top of Focus and/or Dashboard. Not scoped in detail yet: exact
  wording rules, where exactly it lives, and whether it's Focus-only or
  shared with Dashboard are all open.

No schema change so far (lock is localStorage-only) — the Dashboard-link
and Daily-Brief work may or may not require one; decide when those are
actually scoped.

### B36. List view power customization — shipped in v3.8.5

### B37. Android widgets — collapsed 3 into 1 combined widget — shipped in v4.8.0
Full detail in CHANGELOG.md v4.8.0. **Final visual sizing/spacing remains
an open, owner-driven polish pass** (blind XML tuning from chat hit
diminishing returns) — not scheduled as a future version, pick up
whenever convenient directly in Android Studio.

### B38. Custom calendar/date picker instead of the native one — shipped in v4.6.5
New `CalendarPicker.svelte` — a themed month-grid popover (+ a time-of-day
row when the field needs one), replacing the native `<input type="date">`/
`type="datetime-local">` in CardDetail's Due date and Reminder fields, the
only two call sites.

### B39. Renaming a device (B22) leaves a stale "dead" entry — OPEN, needs schema care
Real gap found right after B22/B5 shipped (2026-07-05): "Devices seen
recently" and `CardDetail` history are derived by scanning past changelog
entries for their literal `source` string — renaming a device only
changes what *new* entries say, so the old name lingers indefinitely as an
apparently-separate device. Proper fix needs a **stable per-install device
id** separate from the editable display name, plus a durable id→name
mapping (a new synced doc type, e.g. `device:<id>`, or widening `source`
to `{id, name}`) — a real schema addition, flagged as its own item because
it needs the same care as any schema change (see CLAUDE.md), not a quick
patch. Unscheduled.

### B40. Sidebar bottom icon rail isn't readable — shipped in v4.8.0

### B41. Focus view — full-space floating-card redesign — shipped in v4.8.0
Superseded by a further visual pass in v4.11.1 (plain solid cards) — see
CHANGELOG.md.

### B42. Agenda doesn't use full screen width — shipped in v4.8.0

### B43. Human-friendly sync settings + Developer options — shipped in v4.16.0
Redesigned so the main Sync pane leads with one plain-language status
sentence (Connected/last-synced, Not connected yet, Sync paused, or the
existing human-readable error text) instead of a raw CouchDB URL field.
The URL field and anything else with a footgun moved into a new collapsed-
by-default **Developer options** section (auto-expands only if a
connection is already configured). Developer options is the intended
future home for any other high-impact/dangerous toggles. Pure UI/copy —
no sync-logic changed.

### B44. Storage & quota copy, plain-language rewrite — shipped in v4.16.0
Settings → Data's storage section now leads with a plain sentence ("Your
data is tiny — nothing to worry about," or a getting-full warning past the
threshold), with the raw MB/quota numbers demoted to a small secondary
line. Export rows got their own plain-language labels too, instead of
sharing a line with the storage readout. Copy/layout only.

### B45. Export/import UX redesign — shipped in v4.20.0
Settings → Data used to have four separate, loosely-related actions:
Export JSON (everything), Export CSV (everything, one-way), Export
Project (a picker, JSON only), Import JSON — reading as four bolted-on
buttons, not one coherent backup/restore story. Redesigned into two
clear groups: **Back up** (a single scope control — "Everything" or pick
one project — feeding one "Back up" button, replacing the old
Export-JSON/Export-Project split; CSV kept separate right below it,
clearly labeled "one-way, can't be restored" since it isn't part of the
round-trippable backup/restore pair conceptually) and **Restore**
(Import JSON, unchanged). `doBackup()` in `SettingsPanel.svelte` merges
the old `exportJSON()`/`doExportProject()` into one function branching on
scope. A34's native-download-mechanism fix already shipped in v4.18.0,
so this was purely the UX/layout redesign, not new download logic.

### B46. First-run: ask for a device/user name — shipped in v4.20.0
`config.ts`'s `getDeviceName()`/`setDeviceName()` already existed and
were editable in Settings → Sync, but nothing prompted for a name on
first launch — it silently defaulted (`defaultDeviceName()`) until
someone found the field. Added `NamePrompt.svelte`, a lightweight modal
(reuses `ConfirmDialog.svelte`'s pattern: scrim, `trapFocus`, Escape
closes) shown once, ever, right after `App.svelte`'s `onMount` sets
`ready = true` — so it layers on top of a fully usable app rather than
gating it. Skip and Save are equal-weight actions, and the "shown once"
flag (`offlog_name_prompted`, `config.ts`) is set immediately regardless
of which one is chosen — skipping is as valid a choice as naming it, per
C2's zero-config-first-run principle.

### B47. Week start day setting — SHIPPED in v4.22.0
Agenda's week view and `DeadlinesView.svelte`'s "this week" grouping both
assumed a fixed Sunday week start (`d.getDate() - d.getDay()`). Added a
Settings → Appearance toggle (Sunday/Monday), stored per-device
(`getWeekStartsMonday()`/`setWeekStartsMonday()` in `config.ts`, same
pattern as the default-reminder-time setting) — a shared
`daysSinceWeekStart()` helper in `utils.ts` makes both conventions one
formula. **Timezone half of the original scope deliberately not
built**: the app already uses the device's local time throughout with no
UTC conversion layer, which is correct for a single-device-local
personal task manager per DECISIONS.md — a timezone setting only matters
if a due date needs to mean the same instant across devices in different
zones, which isn't a real scenario here. Revisit only if that changes.

### B48. Android widget: flatter, 2-color light/dark, no border highlight — OPEN, deferred to a later release (owner, 2026-07-13)
B37 (v4.8.0) already noted "final visual sizing/spacing remains an open,
owner-driven polish pass." New specifics from on-device testing: remove
the border highlight, make the widget flatter (less shadow/depth), and
give it a genuine 2-color treatment that follows the *system* light/dark
setting (not the in-app theme setting — Android widgets render on the
home screen, outside the app's own theme context, and should match
whatever the OS is in). Also reported: the widget preview (long-press →
widget picker) renders "something abnormal" but looks correct once
actually placed on the home screen — worth confirming whether this is a
real bug in the preview-rendering path or just an Android OS preview
quirk before spending time on it. Same "owner builds/tests in Android
Studio, not the assistant" rule as all Android work.

### B49. Card Detail redesign — SHIPPED in v4.21.0
Owner feedback: editing a task still felt complicated/overloaded despite
v4.11.1's collapsible-sections pass (B16/B18/B30 all landed inside this
same panel since then, adding to the density). Scoped as **visual/layout
only — every current field and function survives unchanged**. Mockup-
validated over 4 iterations before implementation (see DECISIONS.md's
List/Table merge precedent for why — plan file has the full iteration
history) — final direction: Due date + Reminder collapse into one
labeled, clickable "Schedule" row (summary text, e.g. "Wed, Jul 15 ·
9:00 AM reminder") that expands to the exact same two fields as before;
Checklist/Custom fields/Notes restyled as consistent bordered card-rows
(icon + label + chevron) instead of independently-styled accordions;
Delete/Archive/Duplicate/history consolidated from 4 competing footer
controls into one "⋯" dropdown menu (History, Archive, Duplicate, then
Delete set apart in red) — Created/Updated timestamps moved into the
same menu as plain text. Reuses `CustomSelect.svelte`'s click-outside-
to-close pattern, not a new mechanism.

### B53. Kanban card quick-actions menu — SHIPPED in v4.21.0
Folded into v4.21.0 mid-review at the owner's request, alongside B49
(same "⋯" visual pattern). Kanban cards previously had zero quick-action
affordances — the only way to pin/archive/duplicate/delete was opening
the full Card Detail panel. Added a per-card "⋯" trigger (hover-reveal
on desktop, always-visible at ≤768px matching the existing column-action
touch fallback) opening a dropdown with Pin/Unpin, Archive, Duplicate,
Delete. Unlike Card Detail's menu (which batches into the form's Save),
these are immediate writes — a Kanban-level action should take effect
the moment it's clicked, not wait on a save the user never opened.

### B50. Custom time picker (extend B38 to reminder times) — OPEN, deferred to a later release (owner, 2026-07-13)
B38 (v4.6.5) replaced the native date input with a themed
`CalendarPicker.svelte` for Due date; `CardDetail`'s Reminder field
already reuses the same component with `withTime` for date+time
together, but B49's redesign context surfaced that this doesn't fully
read as "solved" — the *time-only* picking experience still leans on a
native `<input type="time">` in some contexts (check `CalendarPicker`'s
own time row and the Notifications settings' default-reminder-time
field). Same design language, same interaction idea as the existing date
picker; if no clean Svelte time-picker primitive fits the existing
component's approach, build a matching custom one rather than mixing
native and themed pickers in the same form.

### B51. Consistent animations everywhere — SHIPPED in v4.22.0
Owner-reported: too many actions snapped instantly with no transition at
all, reading as "too fast and non real" — not a web-vs-Android
inconsistency (an inventory pass confirmed the Capacitor WebView renders
identical CSS to web, no separate native animation layer to reconcile;
`offlog-app/android` has no `res/anim*` resources) but a real gap: things
that *open* mostly animated already, almost nothing that *closed* did,
and several everyday actions had no transition in either direction.
Fixed broadly:
- New `src/lib/motion.ts` — shared transition constants/custom functions
  (`panelFly`, `scrimFade`, `dialogPop`, `popScale`, `searchPop`,
  `quickAddPop`, `toastFly`) so every panel/dialog/popover/toast animates
  with the same feel, reusing the durations/easing already established
  ad hoc (`--ease` in `app.css`). Centered dialogs/toasts needed *custom*
  transition functions, not Svelte's built-in `scale`/`fly` — those
  overwrite an element's own `transform: translate(-50%,-50%)`
  centering mid-animation, so the custom functions bake the offset into
  every frame instead.
- Every panel that used to `animation: slideIn` (open-only — closing
  always snapped instantly) now uses `transition:fly`/`transition:fade`
  (CardDetail, ChangelogView, SettingsPanel's manager panels, TrashView,
  SpaceManager, TagManager, CustomFieldManager, ArchivedProjectsManager,
  ConfirmDialog, NamePrompt, GlobalSearch, QuickAdd, the mobile sidebar
  scrim, error/undo toasts, the keyboard-shortcuts dialog).
- CardDetail's 4 collapsible sections (Schedule, Checklist, Custom
  fields, Notes) gained `transition:slide`.
- The two new "⋯" menus (Kanban card menu, CardDetail actions menu, both
  new in v4.21.0 with zero animation) now match `CustomSelect`'s pop-in.
- Kanban cards and List rows animate in/out on create/delete/archive
  (`in:scale`/`out:fade` and `transition:slide` respectively) plus
  `animate:flip` for reorder settling; Kanban columns get the same
  in/out+flip treatment for add/remove.
- Checklist checkbox toggle gained a real transition (previously none).
- **Deliberately not done**: a Kanban↔List view crossfade — wrapping
  either component in an extra transitioning `<div>` from the parent
  risks breaking their internal scroll/flex layout for a low-value
  effect; skipped rather than risk a layout regression for it.
- New `tests/setup.ts` shim: jsdom has no Web Animations API, and
  Svelte 5's transition directives call `Element.animate()` — a no-op
  polyfill stops every test touching a transitioning component from
  throwing "element.animate is not a function".

### B52. QR pairing — DEFERRED (owner-directed, 2026-07-13)
Originally scoped as an interim "no human ever types an IP" step (device
scans a QR encoding `{url, credentials, server-uuid}`). Owner decided
against building it: it would be throwaway work once Track E (native PC
app) exists, since that app can generate/serve pairing info itself
without needing this interim mechanism. Not scheduled — revisit only if
Track E's timeline slips badly enough that an interim fix becomes worth
the cost again.

---

## Track C — Public Release & Open Source

Goal: the mission above, made concrete. Unlike Track A/B, these aren't
paired into a version bump each — they're mostly one-time setup work, and
several can start independently of whatever A/B release is in flight.

### C1. Open-source the repository on GitHub
Push the existing local repo public: pick a license (leaning MIT), add
`LICENSE`, a `CONTRIBUTING.md`, issue templates, and a README written for
someone who has never seen this project before. Audit for anything that
assumes a local-only environment before it goes public. Blocked on **C7**
(credential cleanup) and a real stability/security pass — see DECISIONS.md.

### C2. Zero-config first run, verified — PARTIAL PROGRESS in v4.19.0
The architecture is already local-first with no required server, but this
needs to be *verified*: a fresh install, no CouchDB configured, should
never prompt for setup or imply something is missing. Audit first-run copy
(Settings → Sync especially) to state plainly that sync is optional.

v4.19.0: Android's "not connected" first-run message used to point at
"Developer options" — a technical, slightly scary label for a first-time
non-technical user — now points at "Find my computer" (Track E's pairing
flow) instead, the actual easy path. Rest of the audit (every first-run
surface, not just this one message) still open.

### C3. Play Store listing
A signed release build (proper keystore), a Play Console developer
account, and store listing assets — icon, screenshots, descriptions, and a
privacy policy page. Copy should frame Offlog as a calm personal tool, not
pitch it against Trello/Notion/ClickUp/Jira by feature count.

### C4. F-Droid listing — declined
Considered and explicitly declined by the owner (2026-07-02): distribution
stays to GitHub + a website + Google Play; no iOS. See DECISIONS.md.

### C5. Public web landing page
A small, plain landing page (GitHub Pages is enough) linking to the web
app (browser-only, no install step now that PWA support was dropped) and
the Android APK download. A separate, real PC standalone app (not a PWA)
is a future direction to scope, not this item — see DECISIONS.md.

### C6. Brand & positioning pass
A short pass over every public-facing document — README, store copy,
landing page copy — to make sure the "not competing, just likable" framing
from the Mission above comes through, written for humans discovering the
project.

### C7. Fix hardcoded CouchDB credentials — CURRENT SOURCE FIXED (2026-07-14), git history still needs C1-time handling
`offlog-app/src/config.ts` used to hardcode a real CouchDB password as a
fallback default. Fixed: `DEFAULT_COUCH_USER`/`DEFAULT_COUCH_PASS` now
fall back to `''` (not-configured), never a real value — same semantics
`DEFAULT_SYNC_URL` already uses for native/Tauri. `VITE_COUCH_USER`/
`VITE_COUCH_PASS` still come from `.env.local` for local dev (confirmed
never committed, properly `.gitignore`d — `git log` on the file is
empty). Blast radius further reduced by Track E's pairing handshake
(E1) on top of this — a paired device gets real per-install random
credentials, not any fallback at all.

**Still open, and still blocks C1 (going public):** the *old* hardcoded
password is recoverable from this repo's git history (past commits of
`config.ts`) even though the current source is clean. Per the original
fix approach here, this needs fresh history at publish time rather than
pushing this repo's full log — a C1-time decision (rewriting history
now, before that's actually needed, would be premature and risky to do
unilaterally). Don't consider C7 fully closed until that's actually
handled at C1.

### C8. New app icon, all platforms — shipped in v4.17.0
New interlocking-ribbon mark (owner-supplied SVG, `resources/source-
logo.svg`) applied to web favicons, Android adaptive + legacy launcher
icons (all densities), and the Android notification icon (regenerated as
a proper white silhouette with transparency). `resources/generate-
icons.cjs` (uses `sharp`) regenerates every size from the one source file
if the logo or brand color ever changes again. Store listing assets (C3)
and the landing page (C5) still need the icon applied when those items
happen; the PC app (Track E) will need it too once that exists.

### C9. Typography: ≤3 font families, self-hosted — shipped in v4.17.0
Both families (Hanken Grotesk, IBM Plex Mono) are now self-hosted from
`public/fonts/` via `@font-face`, latin subset only — no more Google
Fonts CDN `@import`. Hanken Grotesk ships as one variable font (all 4
weights, one file); IBM Plex Mono needed 2 static weight files. Fixes a
real gap: fonts previously failed on an offline first launch and every
launch phoned Google regardless, both contrary to this app's whole
premise. The ≤3-families rule is now written into CLAUDE.md's style
conventions. Full codebase audit confirmed no stray third font anywhere.

### C10. Plain-language pass: every string, every document — PARTIAL SWEEP DONE (owner, 2026-07-13), still open
The sibling of C6 (which covers public-facing *branding* copy): go through
every in-app string (buttons, hints, empty states, error messages,
Settings explainers) and every user-facing document (README, future
release notes) and rewrite anything a non-technical person would stumble
on. B43 and B44 are the two worst offenders and have their own items; this
is the sweep for everything else, and the standing rule going forward —
features, updates, and docs get written for humans first. Groundwork for
any future marketing/discoverability work: the app must describe itself in
the same plain language a stranger would search for.

v4.19.0's pass covered error messages, empty states, placeholders,
aria-labels/titles, and the Maintenance/Data tabs — found and fixed 3
real issues: sidebar called the trash feature "Deleted" while its own
panel is titled "Recycle" (unified to "Recycle"); a broken/ungrammatical
aria-label ("Select and columns" → "Select rows or show/hide columns");
and "database" jargon in Maintenance's step labels/hint text (now
describes what each step actually does in plain terms). Not exhaustive —
README and other docs, and every remaining component, haven't had a
dedicated pass yet. Pick up opportunistically rather than as one more
giant sweep.

---

## Track D — Mesh Sync — declined (2026-07-03)

Considered at length (device-mesh sync, no central server) and explicitly
declined. Full reasoning in DECISIONS.md — technical (Android background-
service limits, no relay for devices never on the same network) and
strategic (engineering cost not worth it for a single-user project with no
multi-device-users scale to reach). **CouchDB sync remains the permanent,
only sync transport.**

---

## Track E — PC standalone app as sync host (from GOAL.md, added 2026-07-13)

The largest gap between GOAL.md and this roadmap: the goal describes
"install the PC app from a website … the PC acts as the host and they sync
automatically over home Wi-Fi," but until now the only trace of a PC app
was open question Q6. Distinct from declined Track D: this is still
CouchDB-protocol replication with one fixed host — the PC — not a mesh;
the innovation is packaging, not a new sync transport.

### E1. PC app + embedded sync host — WORKING END-TO-END, shipped in v4.19.0 (owner-directed, 2026-07-13/14)
Two halves, deliberately one item because GOAL.md treats them as one
product: (1) a real installable PC app (not a PWA — see DECISIONS.md).
Technology question — QUESTIONS.md's former Q6 — is resolved: **Tauri**,
see DECISIONS.md's own entry for why. (2) The app embeds a CouchDB
sync host so a phone pairs with no separate CouchDB install, which is
what finally makes B43's human-friendly sync story fully true.

Reprioritized ahead of "after going public" (Path to v1.0 step 4)
during the A32/A35 sync-reliability session, once it was clear a native
PC app with mDNS discovery is the actual permanent fix for LAN-IP drift
— see A35's own entry for that reasoning. All new-feature work is
paused until this track lands, per explicit owner direction
(2026-07-14).

**What exists and is verified working, end to end, on real hardware —
not just the dev binary:** a Tauri shell (`offlog-desktop/`) wrapping
`offlog-app/dist` unmodified; an embedded CouchDB sidecar
(`src-tauri/src/sync_host.rs`) that self-configures with a random
port/credentials on first launch, self-heals its own `data`/`var`
dirs, and is hardened with a Windows Job Object so the whole process
tree dies with the app on any exit path (crash, force-kill, or normal
close — all three verified live); mDNS advertising
(`src-tauri/src/discovery.rs`, `_offlog._tcp`, no credentials on the
wire); a single-use expiring-code pairing handshake
(`src-tauri/src/pairing.rs` + `offlog-app/src/lib/discovery.ts`) that
gets real credentials onto a phone safely; a real NSIS installer
(`cargo tauri build`, per-user install, no elevation); and a
checksum-pinned CouchDB fetch script (`scripts/fetch-couchdb-win.ps1`,
Windows binaries aren't published by Apache itself — see the script's
own header for the sourcing rationale). Verified by actually running
the installed app, pairing a real Android phone to it over mDNS, and
confirming two-way sync with zero manual configuration on either side.

**Real bugs this surfaced, all fixed** — the *why* for each lives as a
comment at its actual fix site, not repeated here: the `local.d`
admin-config override (`sync_host.rs`), the exit-cleanup gap
(`sync_host.rs`/`lib.rs`, Job Object), the `msiexec /a` extraction gaps
— missing `vm.args`, missing VC++ runtime DLLs (`sync_host.rs`,
`fetch-couchdb-win.ps1`), the per-user-install-mode dependency
(`sync_host.rs`), the fixed static `COUCH_USER`/`COUCH_PASS` that
couldn't match a per-install random password — real per-device
credentials now exist (`config.ts`; C7's fallback default is also fixed
in current source as of 2026-07-14, see C7's own entry for what's still
open there), the missing Android multicast permissions
(`AndroidManifest.xml`), the pairing endpoint's missing CORS header
(`pairing.rs`), Android's Auto Backup silently restoring old data
across "fresh" installs (`AndroidManifest.xml`, `allowBackup="false"`
— see DECISIONS.md), and the two most structural ones: **every fresh
device's default seed uses fixed, not per-install-random, ids**
(`space:unsorted`/etc.), guaranteeing a sync conflict the instant two
independently-seeded devices pair — fixed with
`clearLocalSeedBeforeFirstPair()` (`db.ts`, tested); and **the Tauri
app itself was never pointed at its own embedded sidecar** — it fell
through to desktop-web's `127.0.0.1:5984` default (a different,
unrelated CouchDB entirely) instead of resolving its own random port —
fixed with `initTauriSyncDefaults()` (`config.ts`), the actual root
cause behind most of a full day's confusing test results.

Also added, debug-build-only, never reachable in a release
(`is_debug_build` Tauri command gates it both sides): a "Reset test
data" button that clears both the PC's local PouchDB and the embedded
server, for testing "what does a real first-run user see" without
manually killing processes and deleting folders.

**Installer signing — deliberately deferred (owner decision, 2026-07-14),
not blocking.** A code-signing certificate is a real annual cost
($70-400/yr OV, ~$300-600/yr EV — EV needs a USB hardware token + wants
a registered business for easiest verification) and isn't required for
Track E to be functionally done. Shipping unsigned for now — Windows
shows "protected your PC," click "More info → Run anyway," same as
plenty of small open-source Windows apps. Revisit post-release if it
becomes real friction for actual users, not before. Not something to
purchase or configure without the owner's own decision to do so.

The desktop-web loopback fallback (A35) stays as-is for the plain
browser build — not removed.

---

## Business model — none, deliberately

Offlog has no business model and isn't getting one. Never paywalled, never
feature-gated, never ad-supported, never sells data. GitHub Sponsors / a
donation link is fine to add once public, but it's not a plan or a goal.
The Play Store listing stays free, no in-app purchase, ever. See
DECISIONS.md for the reasoning behind dropping the hosted-sync-relay idea
that used to live in this section.

---

## Open questions

Anything genuinely unresolved lives in [QUESTIONS.md](QUESTIONS.md), not
scattered inline here.

---

## Sequencing suggestion

Re-paired 2026-07-05 across the full remaining backlog; v4.6.0/v4.7.0
merged into one release 2026-07-08 (owner request — both were the next two
rows up, and there was no strong reason to keep them as two separate
version bumps). **Maintenance passes are scheduled explicitly** (owner,
2026-07-05): one ran after v4.4.0 (v4.4.2), one after **v4.7.0**, then
every 3 releases after that (v4.10.0, v4.13.0, …) — tracked the same way
in [MAINTENANCE.md](../MAINTENANCE.md). The v4.6.0/v4.7.0 merge shifts
every later release down by one version number, but by coincidence
(release-count-based cadence, not the raw version number) the maintenance
schedule still lands on v4.7.0/v4.10.0/v4.13.0 exactly as before — just
different backlog content sits at each of those numbers now. Track C runs
independently of version numbers: **C7 (credential fix) and C2 can start
any time**; **C1/C3/C5/C6 fit naturally once the app feels "finished
enough"** — realistically after this table's backlog has substantially
landed. Track D was declined outright and never entered sequencing. Full
shipped-release history (including several no-A/B-item light releases:
v3.8.5, v3.9.5, v3.9.6, v3.9.7, v4.4.1, v4.4.2) lives in
[CHANGELOG.md](CHANGELOG.md) — this table only shows what's still ahead.

| # | Release | Track A | Track B | Why paired |
|---|---|---|---|---|
| 1 | v4.5.0 | — | B35 (draft) | Focus view, alone — a genuinely new global view earns an undiluted release, same reasoning as B36's own v3.8.5. Shipped as a daily-commitment-lock draft; add-task/Dashboard-link/Daily-Brief still open, see B35. |
| 2 | v4.12.0 | A30 ✓ | — | Shipped — full codebase audit/cleanup/dead-code sweep plus a documentation-flow optimization pass, not a delta-scoped maintenance check. This release *is* the cycle's maintenance pass (merged in, not run separately). |
| — | v4.12.1 ✓ | A31 (web/desktop/mobile) ✓ | — | Shipped — accessibility contrast fixes, design-system token consolidation, and (across same-day follow-ups) a full mobile + dark-mode pass over every page and manager panel, catching real bugs (Dashboard grid overflow, Focus FAB/Commit-button overlap) and verifying the rest clean. A31's web-side scope is done — only Android verification remains, see A31's own entry. |
| 3 | v4.13.0 | A31 (Android leg) | — | Just the Android verification A31 still needs — owner runs `cap sync` + a Studio check whenever convenient. Small enough that it doesn't need to hold up whatever else lands in this release; fold it in opportunistically. |
| 4 | v4.14.0 ✓ | — | B8, B30 ✓ | Shipped — project templates ("New from template" copies a project's status structure and optionally its open tasks) and a notes-length soft counter. Shipped ahead of v4.13.0's Android leg, which is owner-paced and doesn't block anything else. |
| 5 | v4.15.0 ✓ | A9 (first slice) ✓ | B24, B29 ✓ | Shipped — real component tests begin (`CardDetail`'s save logic; `KanbanBoard`/`Sidebar` still uncovered, see A9's own entry), seed data trim, tags on Kanban cards. |
| 6 | v4.16.0 ✓ | — | B43, B44 ✓ | Shipped — stabilization phase begins (owner pivot, 2026-07-13 — B33/B28 parked, see their entries). Sync settings lead with a plain status sentence instead of a raw CouchDB URL, technical fields moved into a new collapsed Developer options section; storage copy leads with "your data is tiny," raw MB/quota numbers demoted. |
| 7 | v4.17.0 ✓ | — | C8, C9 ✓ | Shipped — new icon everywhere (web favicons, Android launcher + notification icons) and self-hosted fonts (no more Google Fonts CDN call). Found and deleted 2 unreferenced leftover template files along the way (old vector-drawable launcher icon). |
| 8 | v4.18.0 ✓ | A32 ✓, A33 ✓, A34 ✓, A35 ✓ | — | Shipped — A32 (sync falsely reporting "synced"), A33 (silent Android notifications), A34 (Export JSON broken on Android), A35 (PC-loopback sync default). |
| 9 | v4.19.0 ✓ | — | E1 ✓, C7 (source), C2 (partial), C10 (partial) | Shipped — Track E working end-to-end (mDNS discovery, pairing, real installer, all verified on real hardware; installer signing deliberately deferred, see E1's own entry). C7's hardcoded-password fallback removed from current source (git history still needs C1-time handling). C2: Android's first-run message now points at "Find my computer" instead of "Developer options." C10: fixed a real "Deleted"/"Recycle" naming inconsistency, a broken aria-label, and "database" jargon in Maintenance copy — full C10 sweep ("every string, every document") not exhaustive yet, continues opportunistically. |
| — | v4.19.1 ✓ | — | — | Shipped — maintenance pass (seventh run, first to cover `offlog-desktop/` too). See MAINTENANCE.md's tracker for full detail. |
| 10 | v4.20.0 ✓ | — | B45 ✓, B46 ✓ | Shipped — Export/import redesigned into Back up / Restore groups with scope as one control; lightweight skippable first-run device-name prompt. |
| 11 | v4.21.0 ✓ | — | B49 ✓, B53 ✓ | Shipped — Card Detail redesign (mockup-validated over 4 iterations: combined "Schedule" row for Due date/Reminder, card-style Checklist/Custom fields/Notes rows, "⋯" menu replacing 4 competing footer controls) plus a new Kanban-card-level "⋯" quick-actions menu (Pin/Archive/Duplicate/Delete without opening Card Detail), folded in mid-review at the owner's request. |
| 12 | v4.22.0 ✓ | — | B47 ✓, B51 ✓ | Shipped — week-start-day setting (Sunday/Monday, Settings → Appearance), plus a full pass adding quick/natural open+close animation to every panel, dialog, popover, toast, card, and column that was missing one (previously many things that *opened* with a transition snapped shut instantly, and several everyday actions like checklist-toggle or card create/delete had no animation at all). B48/B50 explicitly deferred, not dropped. Also fixed a real `offlog-desktop` bug found in the same pass: Tauri's WebView defaults to intercepting native OS drag-drop, which silently disabled the Kanban board's HTML5 drag-and-drop — `dragDropEnabled: false` in `tauri.conf.json` fixes it. |
| — | (unversioned) | — | C7 (git history) → C1 → C5 → C3, C6 | The release gate, in dependency order: credential fix's remaining git-history piece, then GitHub, landing page, Play Store, with the C6 branding pass alongside the public-facing assets. Not version-numbered work — mostly setup/audit outside the app. |
| — | *Maintenance pass* | — | — | Every-3-releases cadence: v4.12 → v4.15 ✓ (ran as v4.15.1) → v4.18 ✓ (**ran as v4.19.1** — first pass to cover `offlog-desktop/` too) → v4.21 → … — see MAINTENANCE.md's tracker. |
| — | (unscheduled) | — | B39, B47, B48, B50, B51 | B39: stale device entries after a rename (needs schema-change care). B47: week-start-day setting (timezone half needs scoping first — may not be needed). B48: Android widget flatter/2-color/no-border polish. B50: extend the custom date-picker pattern to time-only fields. B51: web-vs-Android animation consistency inventory. None urgent enough to claim a version slot yet; pick up opportunistically. |
| — | (parked) | — | B33, B28 | Sub-projects and rethinking positional-done — parked 2026-07-13 with the feature-phase wind-down; revisit post-release only if daily use demands it. |

Within each release: land any Track A item first (or in the same PR as the
Track B item it protects/enables), then the Track B items. Extend
`tests/db.test.ts` for any new `db.ts` logic as features land. Re-evaluate
this table after each release; delete shipped rows and re-pair whatever's
left if new items get added to either track in the meantime.
