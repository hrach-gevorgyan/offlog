///<reference types="svelte" />
;
import { onMount, tick } from 'svelte';
import { fade, scale } from 'svelte/transition';
import { scrimFade, toastFly, dialogScale, pageFade } from './lib/motion';
import { get } from 'svelte/store';
import { init, activeProject, activeProjectId, activeSpaceId, projectTasks, projects, spaces, reloadTasks, errorToast, modalOpen, showError } from './lib/store';
import { updateProject, subscribeUndo, getRecentlyDeleted, undoDelete, getTaskById, syncNow, getCustomFieldDefs } from './lib/db';
import type { CustomFieldDef } from './lib/types';
import type { CustomFieldFilter } from './lib/utils';
import { pendingOpenTaskId, notificationActionError } from './lib/notifications';
import { applyTheme, watchSystemTheme, getThemeMode, setThemeMode, isEffectivelyDark, getHighContrast, setHighContrast } from './lib/theme';
import { getCommands } from './lib/commands';
import Sidebar from './lib/Sidebar.svelte';
import KanbanBoard from './lib/KanbanBoard.svelte';
import ListView from './lib/ListView.svelte';
import DeadlinesView from './lib/DeadlinesView.svelte';
import FocusView from './lib/FocusView.svelte';
import DashboardView from './lib/DashboardView.svelte';
import GlobalSearch from './lib/GlobalSearch.svelte';
import FilterBar from './lib/FilterBar.svelte';
import CardDetail from './lib/CardDetail.svelte';
import QuickAdd from './lib/QuickAdd.svelte';
import ConfirmDialog from './lib/ConfirmDialog.svelte';
import NamePrompt from './lib/NamePrompt.svelte';
import { hasShownNamePrompt, markNamePromptShown, isTauri, invokeTauri, isAppLockEnabled, getAppLockTimeoutMinutes, syncPrivacyScreen } from './config';
import { closeOnBack, closeAll } from './lib/modalStack';
import AppLock from './lib/AppLock.svelte';
import UpdateModal from './lib/UpdateModal.svelte';
import { updateState, showUpdateModal, startBackgroundUpdateChecks } from './lib/updateChecker';
function $$render() {
/*Ωignore_startΩ*/;let $activeProject = __sveltets_2_store_get(activeProject);;let $activeProjectId = __sveltets_2_store_get(activeProjectId);;let $activeSpaceId = __sveltets_2_store_get(activeSpaceId);;let $projectTasks = __sveltets_2_store_get(projectTasks);;let $projects = __sveltets_2_store_get(projects);;let $spaces = __sveltets_2_store_get(spaces);;let $errorToast = __sveltets_2_store_get(errorToast);;let $modalOpen = __sveltets_2_store_get(modalOpen);;let $pendingOpenTaskId = __sveltets_2_store_get(pendingOpenTaskId);;let $notificationActionError = __sveltets_2_store_get(notificationActionError);;let $updateState = __sveltets_2_store_get(updateState);;let $showUpdateModal = __sveltets_2_store_get(showUpdateModal);/*Ωignore_endΩ*/
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // The version an already-dismissed banner shouldn't reappear for until
  // a *different* update is found — background checks re-run every ~6h
  // (updateChecker.ts) and would otherwise re-show the same dismissed
  // banner on every check.
  let dismissedUpdateVersion: string | null = null;

  let ready = false;
  let initError: string | null = null;
  let showNamePrompt = false;
  let showDeadlines = false;
  let showDashboard = true;
  let showFocus = false;
  let sidebarOpen = false;

  type View = 'kanban' | 'list';
  // Per-project Kanban/List choice for the *current* browser session,
  // restored across a same-session refresh (see onMount below) so
  // reloading mid-List-view doesn't silently bounce back to Kanban.
  // Only reset to 'kanban' at genuine navigation points (picking a
  // project from the sidebar/dashboard) — see goToProject().
  let currentView: View = 'kanban';

  // sessionStorage, not localStorage (owner-reported 2026-07-22: a hard
  // close (swipe away from recents) should land back on Dashboard, but
  // minimizing and reopening should still remember the view). Android's
  // WebView keeps sessionStorage alive across a minimize (the Activity is
  // only backgrounded, same WebView instance) but not across a real
  // process kill -- a relaunch there gets a fresh WebView with empty
  // sessionStorage, same as any other tab-session-scoped state. localStorage
  // would survive both cases, which is what caused the original complaint.
  function saveView() {
    if (!ready) return;
    const view = showDashboard ? 'dashboard' : showFocus ? 'focus' : showDeadlines ? 'agenda' : 'project';
    sessionStorage.setItem('offlog_view', JSON.stringify({ view, projectId: get(activeProjectId), mode: currentView }));
  }

  ;() => {$: if (ready) { showDashboard; showDeadlines; showFocus; $activeProjectId; currentView; saveView(); }}

  // The one place `activeProjectId` should reset the view to Kanban —
  // called from deliberate "go to this project" actions (sidebar project/
  // space click, dashboard project card), never from state restoration.
  //
  // Real bug, found live (2026-07-30): this only ever set activeProjectId,
  // never activeSpaceId -- Sidebar.svelte's own goToProject() sets both,
  // but this one (used by Dashboard/Focus's "open project" dispatch) left
  // activeSpaceId stale from whatever space was last browsed in the
  // sidebar tree. App.svelte's own breadcrumb (`activeSpace`, below)
  // reads activeSpaceId, not the opened project's real space_id, so it
  // could show the wrong space name/color after opening a project from
  // Dashboard while a different space's tree was last expanded.
  function goToProject(id: string) {
    const project = get(projects).find(p => p._id === id);
    if (project) activeSpaceId.set(project.space_id);
    activeProjectId.set(id);
    currentView = 'kanban';
  }
  let showSearch = false;
  let showQuickAdd = false;
  let showShortcuts = false;
  let sidebarRef: Sidebar;
  // See modalStack.ts's mandatory {#key} pattern for any closeOnBack()
  // consumer — QuickAdd/GlobalSearch are reachable from multiple rapid
  // triggers (FAB + Ctrl+N, search button + Ctrl+K), same risk class as
  // Time Travel/Trash/Settings/CardDetail had before 2026-07-18's fix.
  let quickAddSession = 0;
  let searchSession = 0;
  // Month view's "Add card" (a day cell tapped in Agenda's Month mode)
  // passes the tapped date through here so the new task's due date is
  // prefilled instead of blank — reset to null after every open so a
  // later Ctrl+N/FAB open (no date context) doesn't inherit a stale one.
  let quickAddDueDate: string | null = null;
  function openQuickAdd(dueDate: string | null = null) { quickAddSession++; quickAddDueDate = dueDate; showQuickAdd = true; }
  function openSearch() { searchSession++; showSearch = true; }

  // B2 — Kanban's filter state lives here (not inside KanbanBoard) so the
  // Filters button can sit in this shared board-header row instead of a
  // dedicated toolbar row that, with no search box next to it, wasted a
  // full row for one button (owner feedback). List view keeps its own
  // filter state internal to ListView.svelte — its toolbar row already has
  // enough content (search box, Archived, Columns) to earn its own row.
  let kbSearch = '';
  let kbFilterCol = '';
  let kbFilterPrio = 0;
  let kbFilterTag = '';
  let kbCustomFieldFilters: CustomFieldFilter[] = [];
  let  kbAllTags = __sveltets_2_invalidate(() => [...new Set($projectTasks.flatMap(t => t.tags))].sort());
  // Custom fields are global (not per-project), same as ListView's own
  // copy — loaded once here so Kanban's FilterBar can offer the same
  // custom-field filter List already got.
  let customFieldDefs: CustomFieldDef[] = [];
  getCustomFieldDefs().then(f => { customFieldDefs = f; });
  // Stale filter values from a previous project shouldn't silently narrow
  // the next project's board — reset on every genuine navigation.
  // Written as a named call rather than the `dep, (a = 1, b = 2)` comma
  // idiom: same reactive dependency on $activeProjectId, but the comma
  // version reads to the type-checker as a chain of discarded expressions
  // (correctly -- it flagged the left side as unused with no side effects).
  // Takes the project id as an argument purely so the reactive dependency
  // is a real *use* of $activeProjectId rather than a discarded expression
  // in a comma chain -- same behaviour, but honest to the type-checker.
  function resetKanbanFilters(_projectId: string | null) {
    kbSearch = ''; kbFilterCol = ''; kbFilterPrio = 0; kbFilterTag = ''; kbCustomFieldFilters = [];
  }
  ;() => {$: resetKanbanFilters($activeProjectId);}

  // B9 — command palette, folded into GlobalSearch rather than a separate
  // overlay/shortcut. Sidebar's own openSettings/openTimeTravel/openTrash
  // are `export`ed top-level functions in its instance — required for
  // Svelte 5's bind:this to reach them at all (see CLAUDE.md's Layer
  // rules) — so a bind:this ref is enough to reach them without lifting
  // that state.
  // B35 — extracted so DashboardView's "Daily Brief" card (on:focus) can
  // reuse the exact same navigation as the command palette's "Go to
  // Focus" entry, instead of a second inline copy of these 3 assignments.
  function goToFocus() { showDashboard = false; showDeadlines = false; showFocus = true; }
  // B35-style extraction (2026-07-30) so DashboardView's Today/Overdue
  // "View all" links can reuse the exact same navigation as the command
  // palette's "Go to Agenda" entry, instead of a second inline copy.
  function goToAgenda() { showDashboard = false; showFocus = false; showDeadlines = true; }
  // Same extraction, needed by the desktop tray/global-shortcut's
  // "show-dashboard" event listener below (ROADMAP.md's tray-resident
  // item) alongside the command palette entry.
  function goToDashboard() { showDeadlines = false; showFocus = false; showDashboard = true; }

  let  commands = __sveltets_2_invalidate(() => getCommands({
    goToDashboard,
    goToFocus,
    goToAgenda,
    openQuickAdd,
    toggleTheme: () => setThemeMode(isEffectivelyDark(getThemeMode()) ? 'light' : 'dark'),
    toggleHighContrast: () => setHighContrast(!getHighContrast()),
    openSettings: () => sidebarRef?.openSettings(),
    openTimeTravel: () => sidebarRef?.openTimeTravel(),
    openTrash: () => sidebarRef?.openTrash(),
    syncNow: () => { syncNow(); },
  }));
  let searchDetailTask: import('./lib/types').TaskDoc | null = null;
  let searchDetailProject: import('./lib/types').ProjectDoc | null = null;
  // See KanbanBoard.svelte's identical detailOpenSession for why this
  // exists — {#key searchDetailTask._id} alone doesn't change value on a
  // fast close-then-reopen of the same task.
  let searchDetailSession = 0;
  function openSearchDetail(task: import('./lib/types').TaskDoc, project: import('./lib/types').ProjectDoc) {
    searchDetailSession++;
    searchDetailTask = task;
    searchDetailProject = project;
  }

  async function openRelatedTask(id: string) {
    const task = await getTaskById(id);
    if (!task) { showError('This task no longer exists.'); return; }
    const proj = get(projects).find(p => p._id === task.project_id);
    if (!proj) { showError('Could not open this task right now.'); return; }
    openSearchDetail(task, proj);
  }

  // The shortcuts panel is a plain boolean toggled within this
  // always-mounted component, not a separate component that mounts/
  // unmounts per open — so unlike the other overlays (which each register
  // their own back-button layer via closeOnBack at component init), it
  // needs it wired reactively. See modalStack.ts / ROADMAP.md A14.
  let popShortcutsLayer: (() => void) | null = null;
  ;() => {$: if (showShortcuts && !popShortcutsLayer) {
    popShortcutsLayer = closeOnBack(() => { showShortcuts = false; popShortcutsLayer = null; });
  }}
  function closeShortcuts() { if (popShortcutsLayer) popShortcutsLayer(); else showShortcuts = false; }

  // The mobile sidebar drawer deliberately does NOT get a closeOnBack
  // history layer. It's primarily a launchpad — tapping any nav item
  // inside it immediately opens something else (a project, Settings,
  // Trash…), which pushes its own history entry practically the same
  // instant the drawer closes. Routing the drawer's close through
  // history.back() in that sequence raced against the newly-opened
  // overlay's history.pushState() (back() resolves async via 'popstate',
  // pushState runs sync) and could close the *new* overlay incorrectly.
  // A plain direct close avoids the race; Escape and the scrim/hamburger
  // still work as before, just without hardware-back support specifically
  // for "drawer open, nothing else" (a much rarer state to be caught in).
  function closeSidebar() { sidebarOpen = false; }

  // Undo toast
  let undoToasts: { id: string; title: string; timer: any }[] = [];

  async function showUndoToast() {
    const buf = await getRecentlyDeleted(1);
    if (!buf.length) return;
    const task = buf[0];
    if (undoToasts.find(t => t.id === task._id)) return;
    const timer = setTimeout(() => {
      undoToasts = undoToasts.filter(t => t.id !== task._id);
    }, 5000);
    undoToasts = [{ id: task._id!, title: task.title, timer }, ...undoToasts].slice(0, 3);
  }

  async function handleUndo(id: string) {
    const t = undoToasts.find(t => t.id === id);
    if (t) clearTimeout(t.timer);
    undoToasts = undoToasts.filter(t => t.id !== id);
    try {
      await undoDelete(id);
      await reloadTasks();
    } catch {
      showError('Failed to undo. Please try again.');
    }
  }

  async function openFromNotification(taskId: string) {
    const task = await getTaskById(taskId);
    const proj = task ? $projects.find(p => p._id === task.project_id) ?? null : null;
    if (task && proj) {
      openSearchDetail(task, proj);
    }
    pendingOpenTaskId.set(null);
  }

  ;() => {$: if ($pendingOpenTaskId) openFromNotification($pendingOpenTaskId);}

  // A "Done"/"Snooze" tap straight from a notification toast whose write
  // failed — surfaced here rather than via a showError() call inside
  // notifications.ts, which would be a circular import (see that store's
  // own comment).
  ;() => {$: if ($notificationActionError) {
    showError($notificationActionError);
    notificationActionError.set('');
  }}

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openQuickAdd(); return; }
    // Don't hijack "?" while the user is typing in a field.
    const el = e.target as HTMLElement;
    const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
    if (e.key === '?' && !typing) { e.preventDefault(); showShortcuts = true; return; }
    if (e.key === 'Escape' && showShortcuts) { closeShortcuts(); return; }
    if (e.key === 'Escape' && sidebarOpen) { closeSidebar(); return; }
  }

  // Android hardware/gesture back button: delegate to browser history when
  // there's somewhere to go back to (which is exactly when an overlay
  // registered via closeOnBack has pushed an entry — see modalStack.ts),
  // otherwise let the OS handle it normally (minimize the app — the
  // correct behavior at the true root, unlike falling through to this
  // when a modal is actually open). @capacitor/app is a no-op import on
  // web, so this listener only ever fires on native.
  async function setupBackButton() {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return;
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else CapApp.exitApp();
    });
  }

  // The combined home-screen widget (OffologWidgetProvider, B37) opens
  // MainActivity with a com.offlog.app://<host>[?query] VIEW intent,
  // depending on which part was tapped (brief → agenda, or one of the 3
  // action buttons). This
  // used to be forwarded via a custom native `triggerJSEvent` call in
  // MainActivity.onCreate() — but that fired synchronously during native
  // onCreate(), before the WebView had even loaded this script, let alone
  // reached this onMount — so on a cold start (app not already running)
  // the event was dispatched into the void and tapping a widget just
  // opened the app with nothing else happening. Using @capacitor/app's
  // own launch-URL handling instead: getLaunchUrl() reads the intent that
  // started the app for cold start, and the 'appUrlOpen' listener (which
  // Capacitor's own Bridge already fires for every plugin on onNewIntent,
  // no custom native code needed) covers a warm start.
  // Returns true if the url actually navigated somewhere, so the caller
  // can skip the localStorage view-restore below rather than have it race
  // and clobber a deliberate widget-driven navigation.
  // v5.4.5 rewrite (owner-reported, 2026-07-21: "once it open quick add,
  // then only open focus even if u click on dashboard" — every widget tap
  // after the first re-opened whatever the FIRST tap opened, regardless
  // of which button was actually pressed). Two changes from the previous
  // version: (1) closeAll() itself is now synchronous (see modalStack.ts)
  // instead of depending on an async popstate that rapid taps could get
  // coalesced away, which was the real root cause; (2) host matching is
  // now exact (new URL(url).hostname) instead of url.includes(host) --
  // .includes() was never actually the bug here since none of these host
  // strings are substrings of each other, but exact parsing is the
  // correct way to read a URL's host and matches how the "project" case
  // already had to be parsed for its query string.
  function handleWidgetUrl(url: string | undefined | null): boolean {
    if (!url) return false;
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return false; // malformed url — nothing to navigate to
    }
    // A widget tap is a "show me exactly this, and only this" request --
    // closes whatever overlay (Quick Add, most commonly) might already be
    // open on a warm start instead of leaving it rendered on top of the
    // new view. No-ops if nothing's open (cold start, the common case).
    closeAll();
    if (host === 'quickadd') { openQuickAdd(); return false; } // an overlay, not a view change
    if (host === 'agenda') { showDashboard = false; showDeadlines = true; return true; }
    if (host === 'focus') { showDashboard = false; showDeadlines = false; showFocus = true; return true; }
    if (host === 'dashboard') { showDeadlines = false; showFocus = false; showDashboard = true; return true; }
    if (host === 'project') {
      // The project-list widget's row may point at a project that's since
      // been deleted — same "don't land on a broken view" caution as the
      // localStorage view-restore below, just via a different trigger.
      const id = new URL(url).searchParams.get('id');
      if (id && get(projects).some(p => p._id === id)) { showDashboard = false; goToProject(id); return true; }
    }
    return false;
  }

  // Cold start: check synchronously (relative to the rest of onMount)
  // before the view-restore block runs, so a widget-driven navigation
  // always wins over whatever was last open. Warm start (already
  // running): the 'appUrlOpen' listener can fire at any later point,
  // there's no restore-ordering race to worry about there.
  async function checkLaunchUrl(): Promise<boolean> {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return false;
    const { App: CapApp } = await import('@capacitor/app');
    const launch = await CapApp.getLaunchUrl();
    return handleWidgetUrl(launch?.url);
  }

  async function listenForWidgetLinks() {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return;
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('appUrlOpen', ({ url }) => handleWidgetUrl(url));
  }

  // The Tauri desktop window starts hidden (tauri.conf.json's
  // `visible: false`) specifically so it never shows a blank/white shell
  // that then pops in as things load — tick() + a rAF here wait for
  // Svelte's actual DOM update to have painted before telling Rust to
  // reveal the window, so what the user sees on first frame is already
  // the finished UI (owner-reported, "make it super fast showup",
  // 2026-07-15). A no-op everywhere else (web, Android) since isTauri()
  // is false there. Rust also has its own 5s timeout fallback in case
  // this is ever late or never called — see show_main_window's comment.
  async function revealTauriWindow() {
    if (!isTauri()) return;
    await tick();
    requestAnimationFrame(() => { invokeTauri('show_main_window').catch(() => {}); });
  }

  // Desktop tray-resident + global shortcut (ROADMAP.md): Rust's
  // global-shortcut handler and tray menu both already show/focus the
  // window themselves (lib.rs) before emitting any of these — by the time
  // one arrives here the app is already in front, each just needs to
  // trigger the same navigation every other entry point (command palette,
  // Sidebar) already uses. 'show-dashboard' is the global shortcut
  // (Ctrl+Alt+O, "get back into Offlog fast" — owner feedback, 2026-07-31:
  // not Quick Add, which already has its own in-app Ctrl+N); 'quick-
  // capture'/'open-settings' are the tray menu's "Quick Add"/"Settings"
  // items. A no-op everywhere else since isTauri() gates it, same pattern
  // as revealTauriWindow above.
  async function listenForTrayEvents() {
    if (!isTauri()) return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen('show-dashboard', () => goToDashboard());
    await listen('quick-capture', () => openQuickAdd());
    await listen('open-settings', () => sidebarRef?.openSettings());
  }

  onMount(async () => {
    applyTheme(); // runs the legacy-key migration once and re-applies (idempotent vs. index.html's pre-paint script)
    watchSystemTheme(); // App.svelte is a permanent root singleton, never unmounted — no cleanup needed
    setupBackButton();
    try {
      await init();
    } catch (e: any) {
      initError = e?.message ?? 'The app failed to start.';
      await revealTauriWindow(); // crash-recovery screen still needs to be visible
      return;
    }
    // Awaited (unlike setupBackButton) so the project-widget deep link's
    // existence check has a populated `projects` store, and so its result
    // is known before deciding whether to run the view-restore below.
    const launchedFromWidget = await checkLaunchUrl();
    listenForWidgetLinks(); // future (warm-start) taps — no ordering race to wait for
    // Restore last view — skipped if a widget tap already navigated
    // somewhere on this cold start; that's a deliberate action and must
    // win over whatever view happened to be open last.
    if (!launchedFromWidget) try {
      const saved = JSON.parse(sessionStorage.getItem('offlog_view') ?? '{}');
      // saved.projectId can point to a project that no longer exists — a
      // wipeAndReseed(), a data reset, or a reinstall that kept
      // localStorage but not IndexedDB all leave a stale id behind (A19).
      // Blindly restoring it landed on a blank project view with nothing
      // selected instead of falling back to Dashboard as intended.
      const projectStillExists = saved.projectId && get(projects).some(p => p._id === saved.projectId);
      if (saved.view === 'agenda') { showDashboard = false; showDeadlines = true; }
      else if (saved.view === 'focus') { showDashboard = false; showFocus = true; }
      else if (saved.view === 'project' && projectStillExists) {
        showDashboard = false; showDeadlines = false; showFocus = false;
        // Restore via the plain store, not goToProject() — this is state
        // restoration on reload, not a deliberate navigation, so the
        // in-progress Kanban/List choice (below) must survive too.
        activeProjectId.set(saved.projectId);
        if (saved.mode === 'list' || saved.mode === 'kanban') currentView = saved.mode;
      }
      // 'dashboard', nothing, or a stale projectId → keep showDashboard = true
    } catch {}
    ready = true;
    await revealTauriWindow();
    // B46: asked once, ever, regardless of skip/save (markNamePromptShown()
    // fires immediately, not only on save) — never blocks reaching the app,
    // shown after `ready` so it layers on top of a fully usable UI rather
    // than gating it.
    if (!hasShownNamePrompt()) {
      showNamePrompt = true;
      markNamePromptShown();
    }
    subscribeUndo(showUndoToast);
    startBackgroundUpdateChecks();
    listenForTrayEvents();
  });

  // App lock: locks on every fresh page load (a reload/cold start always
  // re-checks isAppLockEnabled() below) plus after `timeout` minutes of
  // being backgrounded or idle while foregrounded — see config.ts and
  // DECISIONS.md for why this is a UI gate, not encryption.
  let locked = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenAt: number | null = null;

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (locked || !isAppLockEnabled()) return;
    idleTimer = setTimeout(() => { locked = true; }, getAppLockTimeoutMinutes() * 60000);
  }

  function onVisibilityChange() {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (idleTimer) clearTimeout(idleTimer);
    } else {
      if (hiddenAt !== null && isAppLockEnabled() && (Date.now() - hiddenAt) / 60000 >= getAppLockTimeoutMinutes()) {
        locked = true;
      }
      hiddenAt = null;
      resetIdleTimer();
    }
  }

  function onUnlocked() {
    locked = false;
    resetIdleTimer();
  }

  onMount(() => {
    if (isAppLockEnabled()) locked = true;
    syncPrivacyScreen();
    const activityEvents = ['click', 'keydown', 'touchstart', 'mousemove'] as const;
    activityEvents.forEach(ev => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    resetIdleTimer();
    return () => {
      activityEvents.forEach(ev => window.removeEventListener(ev, resetIdleTimer));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (idleTimer) clearTimeout(idleTimer);
    };
  });

  function retryInit() { location.reload(); }

  async function setView(v: View) {
    currentView = v;
    if (!$activeProject) return;
    // Legacy field, no longer read back (see A27) — the view switch above
    // already fully succeeded synchronously, so a failure here is a silent
    // background-persistence miss, not something the user needs an error
    // toast for (same "fire and forget" reasoning as rescheduleAll()).
    try {
      await updateProject($activeProject._id, { default_view: v });
      projects.update(ps => ps.map(p => p._id === $activeProject!._id ? { ...p, default_view: v } : p));
    } catch {}
  }

  let  activeSpace = __sveltets_2_invalidate(() => $spaces.find(s => s._id === $activeSpaceId));

  const ICONS: Record<View, string> = {
    kanban: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="4" height="11" rx="1"/><rect x="6.5" y="2.5" width="4" height="7" rx="1"/><rect x="11.5" y="2.5" width="3" height="9" rx="1"/></svg>',
    list:   '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg>',
  };

  const VIEWS: { key: View; label: string }[] = [
    { key: 'kanban', label: 'Kanban' },
    { key: 'list',   label: 'List' },
  ];
;
async () => {

  { svelteHTML.createElement("svelte:window", {  "on:keydown":onKeydown,});}

if(locked){
   { const $$_kcoLppA0C = __sveltets_2_ensureComponent(AppLock); const $$_kcoLppA0 = new $$_kcoLppA0C({ target: __sveltets_2_any(), props: {   }});$$_kcoLppA0.$on("unlocked", onUnlocked);}
}

if(ready){
  
   { svelteHTML.createElement("div", {   "inert":locked,"style":`display:contents`,});
   { svelteHTML.createElement("div", { "class":`status-bar-fill`,}); }
   { svelteHTML.createElement("div", { "class":`layout`,});
     { const $$_rabediS2C = __sveltets_2_ensureComponent(Sidebar); const $$_rabediS2 = new $$_rabediS2C({ target: __sveltets_2_any(), props: {           showDeadlines,showDashboard,showFocus,open:sidebarOpen,}});sidebarRef = $$_rabediS2;/*Ωignore_startΩ*/() => showDeadlines = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_rabediS2.$$bindings = 'showDeadlines';/*Ωignore_startΩ*/() => showDashboard = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_rabediS2.$$bindings = 'showDashboard';/*Ωignore_startΩ*/() => showFocus = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_rabediS2.$$bindings = 'showFocus';/*Ωignore_startΩ*/() => sidebarOpen = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_rabediS2.$$bindings = 'open';$$_rabediS2.$on("navigate", () => { closeSidebar(); currentView = 'kanban'; });$$_rabediS2.$on("openTask", (e) => { openSearchDetail(e.detail.task, e.detail.project); closeSidebar(); });}

    
    if(sidebarOpen){
      
       { svelteHTML.createElement("div", {     "class":`mobile-scrim`,"on:click":closeSidebar,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade))); }
    }

     { svelteHTML.createElement("main", { "class":`main`,});
      if(showDashboard){
         { svelteHTML.createElement("div", {   "class":`view-fade`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(pageFade)));
           { const $$_weiVdraobhsaD4C = __sveltets_2_ensureComponent(DashboardView); const $$_weiVdraobhsaD4 = new $$_weiVdraobhsaD4C({ target: __sveltets_2_any(), props: {           }});$$_weiVdraobhsaD4.$on("menu", () => sidebarOpen = true);$$_weiVdraobhsaD4.$on("openProject", (e) => {
              showDashboard = false;
              goToProject(e.detail);
            });$$_weiVdraobhsaD4.$on("focus", goToFocus);$$_weiVdraobhsaD4.$on("search", openSearch);$$_weiVdraobhsaD4.$on("agenda", goToAgenda);}
         }
      } else if (showFocus){
         { svelteHTML.createElement("div", {   "class":`view-fade`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(pageFade)));
           { const $$_weiVsucoF4C = __sveltets_2_ensureComponent(FocusView); const $$_weiVsucoF4 = new $$_weiVsucoF4C({ target: __sveltets_2_any(), props: {     }});$$_weiVsucoF4.$on("menu", () => sidebarOpen = true);$$_weiVsucoF4.$on("search", openSearch);}
         }
      } else if (showDeadlines){
         { svelteHTML.createElement("div", {   "class":`view-fade`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(pageFade)));
           { const $$_weiVsenildaeD4C = __sveltets_2_ensureComponent(DeadlinesView); const $$_weiVsenildaeD4 = new $$_weiVsenildaeD4C({ target: __sveltets_2_any(), props: {       }});$$_weiVsenildaeD4.$on("menu", () => sidebarOpen = true);$$_weiVsenildaeD4.$on("search", openSearch);$$_weiVsenildaeD4.$on("addTask", (e) => openQuickAdd(e.detail));}
         }
      } else if ($activeProject){
       { svelteHTML.createElement("div", {   "class":`view-fade`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(pageFade)));
         { svelteHTML.createElement("header", { "class":`board-header`,});
           { svelteHTML.createElement("button", {     "class":`hamburger`,"on:click":() => sidebarOpen = true,"aria-label":`Menu`,});
             { svelteHTML.createElement("svg", {             "viewBox":`0 0 20 20`,"width":`20`,"height":`20`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,});
                { svelteHTML.createElement("line", {       "x1":`3`,"y1":`5`,"x2":`17`,"y2":`5`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`10`,"x2":`17`,"y2":`10`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`15`,"x2":`17`,"y2":`15`,});}
             }
           }

           { svelteHTML.createElement("div", { "class":`title-block`,});
            if(activeSpace){
               { svelteHTML.createElement("div", { "class":`breadcrumb`,});
                 { svelteHTML.createElement("span", {   "class":`bc-dot`,"style":`background:${activeSpace.color}`,}); }
                activeSpace.name;
               }
            }
             { svelteHTML.createElement("h1", { "class":`board-title`,});$activeProject.name; }
           }

           { svelteHTML.createElement("div", { "class":`spacer`,}); }

           { svelteHTML.createElement("div", { "class":`search-filter-group`,});
            
             { svelteHTML.createElement("button", {         "class":`search-btn`,"on:click":openSearch,"title":currentView === 'list' ? 'Command Palette (Ctrl+K)' : 'Search (Ctrl+K)',"aria-label":currentView === 'list' ? 'Command Palette (Ctrl+K)' : 'Search (Ctrl+K)',});
              if(currentView === 'list'){
                 { svelteHTML.createElement("svg", {               "viewBox":`0 0 24 24`,"width":`15`,"height":`15`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`2.1`,"stroke-linecap":`round`,"stroke-linejoin":`round`,});
                    { svelteHTML.createElement("path", { "d":`M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z`,});}
                 }
              }else{
                 { svelteHTML.createElement("svg", {             "viewBox":`0 0 16 16`,"width":`15`,"height":`15`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,});
                    { svelteHTML.createElement("circle", {     "cx":`6.5`,"cy":`6.5`,"r":`4.5`,});}  { svelteHTML.createElement("line", {       "x1":`10.5`,"y1":`10.5`,"x2":`14`,"y2":`14`,});}
                 }
              }
             }
            if(currentView === 'kanban'){
               { svelteHTML.createElement("span", { "class":`search-filter-divider`,}); }
               { const $$_raBretliF6C = __sveltets_2_ensureComponent(FilterBar); const $$_raBretliF6 = new $$_raBretliF6C({ target: __sveltets_2_any(), props: {                  "compact":true,"project":$activeProject,"allTags":kbAllTags,"tasks":$projectTasks,"customFields":customFieldDefs,search:kbSearch,filterCol:kbFilterCol,filterPrio:kbFilterPrio,filterTag:kbFilterTag,customFieldFilters:kbCustomFieldFilters,}});/*Ωignore_startΩ*/() => kbSearch = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF6.$$bindings = 'search';/*Ωignore_startΩ*/() => kbFilterCol = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF6.$$bindings = 'filterCol';/*Ωignore_startΩ*/() => kbFilterPrio = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF6.$$bindings = 'filterPrio';/*Ωignore_startΩ*/() => kbFilterTag = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF6.$$bindings = 'filterTag';/*Ωignore_startΩ*/() => kbCustomFieldFilters = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_raBretliF6.$$bindings = 'customFieldFilters';}
            }
           }

           { svelteHTML.createElement("div", { "class":`view-seg`,});
              for(let v of __sveltets_2_ensureArray(VIEWS)){
              
               { svelteHTML.createElement("button", {        "class":`view-btn`,"on:click":() => setView(v.key),"aria-label":v.label,"title":v.label,});currentView === v.key;
                 ICONS[v.key];
                 { svelteHTML.createElement("span", {   "class":`view-label`,"aria-hidden":`true`,});v.label; }
               }
            }
           }
         }

        if(currentView === 'kanban'){
           { const $$_draoBnabnaK4C = __sveltets_2_ensureComponent(KanbanBoard); const $$_draoBnabnaK4 = new $$_draoBnabnaK4C({ target: __sveltets_2_any(), props: {                 "project":$activeProject,"tasks":$projectTasks,"search":kbSearch,"filterCol":kbFilterCol,"filterPrio":kbFilterPrio,"filterTag":kbFilterTag,"customFieldFilters":kbCustomFieldFilters,}});$$_draoBnabnaK4.$on("projectUpdated", (e) => {
              projects.update(ps => ps.map(p => p._id === e.detail._id ? e.detail : p));
            });}
        }else{
           { const $$_weiVtsiL4C = __sveltets_2_ensureComponent(ListView); new $$_weiVtsiL4C({ target: __sveltets_2_any(), props: {    "project":$activeProject,"tasks":$projectTasks,}});}
        }
       }

      }else{
         { svelteHTML.createElement("div", {   "class":`view-fade`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(pageFade)));
         { svelteHTML.createElement("div", { "class":`empty-state`,});
           { svelteHTML.createElement("button", {     "class":`hamburger`,"on:click":() => sidebarOpen = true,"aria-label":`Menu`,});
             { svelteHTML.createElement("svg", {             "viewBox":`0 0 20 20`,"width":`20`,"height":`20`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,});
                { svelteHTML.createElement("line", {       "x1":`3`,"y1":`5`,"x2":`17`,"y2":`5`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`10`,"x2":`17`,"y2":`10`,});}  { svelteHTML.createElement("line", {       "x1":`3`,"y1":`15`,"x2":`17`,"y2":`15`,});}
             }
           }
           { svelteHTML.createElement("span", {});     }
         }
         }
      }
     }
   }
   }
} else if (initError){
   { svelteHTML.createElement("div", { "class":`crash-recovery`,});
     { svelteHTML.createElement("h2", {});   }
     { svelteHTML.createElement("p", { "class":`crash-hint`,});                               }
     { svelteHTML.createElement("p", { "class":`crash-msg`,}); initError; }
     { svelteHTML.createElement("button", {   "class":`retry-btn`,"on:click":retryInit,});  }
   }
}else{
   { svelteHTML.createElement("div", { "class":`loading`,}); { svelteHTML.createElement("span", { "class":`spinner`,}); }  }
}

 { const $$_golaiDmrifnoC0C = __sveltets_2_ensureComponent(ConfirmDialog); new $$_golaiDmrifnoC0C({ target: __sveltets_2_any(), props: {}});}
if(showNamePrompt){ { const $$_tpmorPemaN0C = __sveltets_2_ensureComponent(NamePrompt); const $$_tpmorPemaN0 = new $$_tpmorPemaN0C({ target: __sveltets_2_any(), props: {     }});$$_tpmorPemaN0.$on("close", () => showNamePrompt = false);$$_tpmorPemaN0.$on("setupSync", () => { showNamePrompt = false; sidebarRef?.openSettings('sync'); });}}

if(isTauri()){
   { const $$_ladoMetadpU0C = __sveltets_2_ensureComponent(UpdateModal); new $$_ladoMetadpU0C({ target: __sveltets_2_any(), props: {}});}
  if($updateState.phase === 'available' && $updateState.version !== dismissedUpdateVersion && !$showUpdateModal){
     { svelteHTML.createElement("div", {   "class":`update-banner`,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
       { svelteHTML.createElement("span", {}); $updateState.version;   }
       { svelteHTML.createElement("div", { "class":`update-banner-actions`,});
         { svelteHTML.createElement("button", {   "class":`update-banner-dismiss`,"on:click":() => dismissedUpdateVersion = $updateState.version ?? null,});  }
         { svelteHTML.createElement("button", {   "class":`update-banner-view`,"on:click":() => showUpdateModal.set(true),});  }
       }
     }
  }
}

if(!showQuickAdd && !showSearch && !searchDetailTask && !sidebarOpen && !$modalOpen && !showDeadlines && !showFocus){
 { svelteHTML.createElement("button", {     "class":`fab`,"on:click":() => openQuickAdd(),"title":`Quick add task (Ctrl+N)`,});
   { svelteHTML.createElement("svg", {             "viewBox":`0 0 16 16`,"width":`20`,"height":`20`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`2`,"stroke-linecap":`round`,});
      { svelteHTML.createElement("line", {       "x1":`8`,"y1":`2`,"x2":`8`,"y2":`14`,});}  { svelteHTML.createElement("line", {       "x1":`2`,"y1":`8`,"x2":`14`,"y2":`8`,});}
   }
 }
}

if(showQuickAdd){
  quickAddSession; {
     { const $$_ddAkciuQ0C = __sveltets_2_ensureComponent(QuickAdd); const $$_ddAkciuQ0 = new $$_ddAkciuQ0C({ target: __sveltets_2_any(), props: {      "initialDueDate":quickAddDueDate,}});$$_ddAkciuQ0.$on("close", () => showQuickAdd = false);$$_ddAkciuQ0.$on("created", () => reloadTasks());}
  }
}

if(showSearch){
  searchSession; {
     { const $$_hcraeSlabolG0C = __sveltets_2_ensureComponent(GlobalSearch); const $$_hcraeSlabolG0 = new $$_hcraeSlabolG0C({ target: __sveltets_2_any(), props: {      commands,}});$$_hcraeSlabolG0.$on("close", () => showSearch = false);$$_hcraeSlabolG0.$on("open", (e) => { openSearchDetail(e.detail.task, e.detail.project); showSearch = false; });}
  }
}

if(searchDetailTask && searchDetailProject){
  searchDetailTask._id + ':' + searchDetailSession; {
     { const $$_liateDdraC0C = __sveltets_2_ensureComponent(CardDetail); const $$_liateDdraC0 = new $$_liateDdraC0C({ target: __sveltets_2_any(), props: {         "task":searchDetailTask,"project":searchDetailProject,}});$$_liateDdraC0.$on("close", async () => { searchDetailTask = null; searchDetailProject = null; await reloadTasks(); });$$_liateDdraC0.$on("openRelated", (e) => openRelatedTask(e.detail));}
  }
}

if(showShortcuts){
  
   { svelteHTML.createElement("div", {     "class":`scrim`,"on:click":closeShortcuts,});__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),(scrimFade)));
     { svelteHTML.createElement("div", {   "class":`shortcuts-panel`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('div'),(dialogScale)));
       { svelteHTML.createElement("div", { "class":`shortcuts-head`,});
         { svelteHTML.createElement("h3", {});  }
         { svelteHTML.createElement("button", {     "class":`shortcuts-close`,"on:click":closeShortcuts,"aria-label":`Close`,});  }
       }
       { svelteHTML.createElement("div", { "class":`shortcuts-list`,});
         { svelteHTML.createElement("div", { "class":`shortcut-row`,}); { svelteHTML.createElement("kbd", {});  } { svelteHTML.createElement("span", {});  } { svelteHTML.createElement("kbd", {});  } { svelteHTML.createElement("span", { "class":`shortcut-desc`,});  } }
         { svelteHTML.createElement("div", { "class":`shortcut-row`,}); { svelteHTML.createElement("kbd", {});  } { svelteHTML.createElement("span", {});  } { svelteHTML.createElement("kbd", {});  } { svelteHTML.createElement("span", { "class":`shortcut-desc`,});   } }
         { svelteHTML.createElement("div", { "class":`shortcut-row`,}); { svelteHTML.createElement("kbd", {});  } { svelteHTML.createElement("span", { "class":`shortcut-desc`,});   } }
         { svelteHTML.createElement("div", { "class":`shortcut-row`,}); { svelteHTML.createElement("kbd", {});  } { svelteHTML.createElement("span", { "class":`shortcut-desc`,});    } }
         { svelteHTML.createElement("div", { "class":`shortcut-row`,}); { svelteHTML.createElement("kbd", {});  } { svelteHTML.createElement("span", { "class":`shortcut-desc`,});       } }
       }
     }
   }
}

if($errorToast){
   { svelteHTML.createElement("div", {  "class":`error-toast`,});__sveltets_2_ensureTransition(toastFly(svelteHTML.mapElementTag('div')));$errorToast; }
}

if(undoToasts.length){
   { svelteHTML.createElement("div", { "class":`toast-stack`,});
       for(let t of __sveltets_2_ensureArray(undoToasts)){t.id;
       { svelteHTML.createElement("div", {  "class":`toast`,});__sveltets_2_ensureTransition(toastFly(svelteHTML.mapElementTag('div')));
         { svelteHTML.createElement("span", { "class":`toast-msg`,}); t.title.length > 30 ? t.title.slice(0,30)+'…' : t.title;  }
         { svelteHTML.createElement("button", {   "class":`toast-undo`,"on:click":() => handleUndo(t.id),});  }
         { svelteHTML.createElement("button", {   "class":`toast-close`,"on:click":() => { clearTimeout(t.timer); undoToasts = undoToasts.filter(u => u.id !== t.id); },});  }
       }
    }
   }
}


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {} }}
const App__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type App__SvelteComponent_ = InstanceType<typeof App__SvelteComponent_>;
/*Ωignore_endΩ*/export default App__SvelteComponent_;