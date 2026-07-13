# Offlog — Changelog Archive

Older releases, compressed to one line each (full detail lives in git —
each row references its tag, e.g. `git show v3.9.8`). Split out of
[CHANGELOG.md](CHANGELOG.md) 2026-07 once that file's recent-version table
grew large enough that loading it by default got expensive; CHANGELOG.md
keeps the newest releases in full detail and points here for anything
older. Nothing is lost — this is a compression of an already-complete git
history, not the only remaining record.

| Version | Summary | Tag |
|---|---|---|
| 4.10.1 | Maintenance pass (fourth run): fixed a real stored-XSS gap in GlobalSearch's highlight(), a missing logChange() on archiveProject()/unarchiveProject() | `v4.10.1` |
| 4.10.0 | Dashboard weekly stats + command palette (B17, B9): "N completed this past week" line + Today panel, Ctrl+K now matches action commands too | `v4.10.0` |
| 4.9.0 | Archive-adjacent housekeeping (B27, B32, B15): DB-wide archived-task count, whole-project archiving, new Archived Projects manager panel; fixed a native-select dark-mode readability bug | `v4.9.0` |
| 4.8.0 | Visual/UX polish pass (B40, B41, B42, B37): sidebar 2×2 icon grid, Focus corkboard picker, Agenda full-width, Android widgets rebuilt to 3 static buttons; fixed a widget-stretch rendering bug | `v4.8.0` |
| 4.7.0 | Perf validation + import/export v2 + Agenda week view (A10, A24, B4, B7): benchmark harness at 3,000-task scale (no perf cliff found), project/CSV export + guided import, Agenda week grid | `v4.7.0` |
| 4.6.5 | UI polish patch: sidebar nav unified + Spaces/Projects merged into one collapsible tree, CardDetail condensed, List columns fixed, new custom CalendarPicker.svelte (B38) | `v4.6.5` |
| 4.6.0 | Appearance + power-user pass (A11, B21, B11, B16, B19): Light/Dark/System theme, High Contrast toggle, global custom fields, revised bulk actions in List | `v4.6.0` |
| 4.5.0 | Focus view (B35), draft: daily-commitment-lock (pick up to 3 tasks/day), round-robin-ranked picker, replaced a rejected auto-computed priority-list design | `v4.5.0` |
| 4.4.2 | Second maintenance pass, clean codebase: fixed a missing try/catch+showError() gap in QuickAdd's createTask() call, documented a silent-catch write path | `v4.4.2` |
| 4.4.1 | Light patch (A29): reworded a sync network-error message for clarity; fixed the B12 "remind on due date" checkbox rendering stacked instead of inline | `v4.4.1` |
| 4.4.0 | Reminder-scheduling release (A12, B12): auto-derive `reminder_at` from due date + configurable default time; caught a real `catchUpWeb()` bug leaving stale reminders dangling forever | `v4.4.0` |
| 4.3.0 | Storage-pressure release (A17, B14): explains quota, warns past 80% usage with cleanup pointers | `v4.3.0` |
| 4.2.0 | Sync + device-identity release (A16, B13, B5, B22): free-form per-device names, "Devices seen recently," Sync on/off toggle, deterministic sync-error test coverage | `v4.2.0` |
| 4.1.0 | The "3 widgets" release (A15, B20, B31): first modalStack test coverage, Agenda widget, Project list widget, shared native/JS bridge for both | `v4.1.0` |
| 4.0.0 | Card-creation input-assistance (B25, B26): one-tap due-date shortcuts, tag autocomplete ranking project-local tags first | `v4.0.0` |
| 3.9.8 | Three owner-reported fixes: Quick Add widget cold-start bug (A25), project view force-resetting to Kanban on refresh (A27), exact-alarm permission status/control in Settings (A28) | `v3.9.8` |
| 3.9.7 | First MAINTENANCE.md pass: dropped 2 unused dependencies, extracted a shared `PinStar.svelte` from 3 duplicated inline SVGs | `v3.9.7` |
| 3.9.6 | New brand icon regenerated across every platform surface (PWA, Android adaptive/legacy, notification icon, splash screens) from one SVG source | `v3.9.6` |
| 3.9.5 | UX fixes: card detail no longer opens in title-edit mode, project view always lands on Kanban, List toolbar rebuilt as one guaranteed single row at every width | `v3.9.5` |
| 3.9.0 | Sidebar rework at 20+ projects scale (A23), new Recent-tasks section (B23), project pinning (B34) | `v3.9.0` |
| 3.8.5 | List view power customization (B36): saved filters, column selection/reordering, native horizontal scroll, multi-column sort | `v3.8.5` |
| 3.8.0 | 4 correctness bugs fixed (A18–A22) plus List/Table merged into one view, rewritten with Table as the design baseline | `v3.8.0` |
| 3.7.0 | Android hardware back-button handling (A14) + accessibility re-audit (A13) + notification actions (B3) + quick-capture widget (B10) | `v3.7.0` |
| 3.6.0 | First sequencing-plan release: space management (B1), tag management (B6), full Settings redesign into category/detail layout | `v3.6.0` |
| 3.5.0 | Settings conflict-list overflow fix, Android splash screen actually wired to the AndroidX SplashScreen API (was previously a no-op) | `v3.5.0` |
| 3.4.0 | First test infrastructure (Vitest + `pouchdb-adapter-memory`, 26 tests) — caught 2 real previously-shipped bugs (conflict field, incomplete conflict resolution); further bundle diet | `v3.4.0` |
| 3.3.0 | Redesigned bottom sidebar row, replaced every `window.confirm()` with a themed `ConfirmDialog`, consolidated Maintenance into one modal with progress | `v3.3.0` |
| 3.2.0 | Trash promoted to a dedicated top-level view (previously embedded in Settings); "Optimize Storage" now actually calls `db.compact()` | `v3.2.0` |
| 3.1.1 | Retention policy added for soft-deleted tasks (previously only logs had one); new storage-breakdown view in Settings | `v3.1.1` |
| 3.1.0 | First Track A pass: persistent undo, changelog growth control, conflict resolution UI, faster startup, sync robustness (single replication guard), bundle diet | `v3.1.0` |
| 3.0.1 | Code-quality pass — zero Svelte compiler warnings achieved; real ARIA semantics added throughout | `v3.0.1` |
| 3.0.0 | Full brand color system rewrite (CSS custom properties only) + accessibility pass (keyboard shortcuts panel, focus-visible, keyboard-operable rows everywhere) | `v3.0.0` |
| 2.9.2 | Three Android/Agenda fixes from a real device: duplicated overdue-duration text, wrong notification icon, exact-alarm permission explanation | `v2.9.2` |
| 2.9.1 | Fixed Dashboard's overdue-tasks list including tasks already in their project's last column | `v2.9.1` |
| 2.9.0 | Pre-3.0 hardening pass: real `pouchdb-find` indexing, in-memory task cache, crash recovery, error-handling audit, database integrity checker | `v2.9.0` |
| 2.8.0 | Notifications shipped: `reminder_at` field, native Android scheduling + web best-effort fallback; sync reliability improvements (persistent `lastSynced`, offline detection, human-readable errors) | `v2.8.0` |
| 2.7.2 | Fixed invisible Agenda badge counts (`currentColor` bug) and a broken "mark done" that didn't remove tasks from the Agenda list | `v2.7.2` |
| 2.7.1 | Fixed inconsistent mobile header layout across views; fixed a Dashboard card text-overlap bug | `v2.7.1` |
| 2.7.0 | Added PWA support via `vite-plugin-pwa` — installable, offline-capable web build | `v2.7.0` |
| 2.6.5 | Fixed a z-index bug causing a gray "double overlay" look over the Changelog panel | `v2.6.5` |
| 2.6.4 | Fixed mobile sidebar drawer staying open underneath Changelog/Settings, stacking two scrims | `v2.6.4` |
| 2.6.3 | Extended the status-bar safe-area fix to every `position: fixed` full-screen element, not just `.layout` | `v2.6.3` |
| 2.6.2 | Fixed app content (including the hamburger button) being hidden behind the new status-bar strip | `v2.6.2` |
| 2.6.1 | Real fix for the Android status bar (2.6.0's approach was a no-op on targetSdk 36); regenerated all icons | `v2.6.1` |
| 2.6.0 | (Superseded) First Android status-bar fix attempt — didn't work on Android 16 target | `v2.6.0` |
| 2.5.0 | Brighter/higher-contrast palette, `duplicateTask()` + Duplicate button, consistent "Status" wording, FAB visibility fix | `v2.5.0` |
| 2.4.1 | Extracted shared `utils.ts`, removed dead code, global `.scrim` class, error toast on failed DB writes | `v2.4.1` |
| 2.4 | Dashboard set as home screen, responsive layouts, last-view persistence, first Android APK | `v2.4` |
