// Phone navigation: four tabs, each a stack of screens.
//
// Every pushed screen owns one modalStack history entry, registered here at
// push time (not in a component's setup), so Android back pops screens in
// the same LIFO order as overlays and the {#key} remount rule in
// modalStack.ts does not apply to screens.
import { writable, readable, get } from 'svelte/store';
import { closeOnBack, closeAll } from '../modalStack';
import type { TaskDoc } from '../types';

// Same breakpoint as the desktop layout's own mobile rules (App.svelte,
// Sidebar.svelte): a landscape phone is still a phone.
export const PHONE_QUERY = '(max-width: 768px), (max-height: 500px) and (orientation: landscape)';

// Never in the desktop app: a narrow Tauri window keeps the desktop layout.
export const isPhone = readable(false, set => {
  if (typeof window === 'undefined' || !window.matchMedia || window.__TAURI_INTERNALS__) return;
  const mq = window.matchMedia(PHONE_QUERY);
  set(mq.matches);
  const on = (e: MediaQueryListEvent) => set(e.matches);
  mq.addEventListener?.('change', on);
  return () => mq.removeEventListener?.('change', on);
});

export type Tab = 'home' | 'today' | 'agenda' | 'search';
export type Screen =
  | { k: Tab }
  | { k: 'late' | 'pinned' | 'focus' }
  | { k: 'project'; id: string }
  | { k: 'task'; id: string }
  | { k: 'statuses'; id: string }
  | { k: 'settings' }
  | { k: 'set'; page: string };
type Entry = Screen & { requestClose?: () => void };

// Things only App.svelte can do (it owns QuickAdd, CardDetail and the
// Sidebar-hosted Settings); App fills these in when it mounts the shell.
export const actions = {
  quickAdd: (_due: string | null = null) => {},
  openTask: (_task: TaskDoc) => {},
  openSettings: () => {},
};

export const TABS: Tab[] = ['home', 'today', 'agenda', 'search'];
export const tab = writable<Tab>('home');
export const stack = writable<Entry[]>([{ k: 'home' }]);
// How the screen now on top arrived; the shell picks its transition from it.
export const arrival = writable<'push' | 'pop' | 'tab' | 'none'>('none');

export function push(screen: Screen) {
  const entry: Entry = { ...screen };
  entry.requestClose = closeOnBack(() => {
    stack.update(s => (s.at(-1) === entry ? s.slice(0, -1) : s.filter(x => x !== entry)));
    arrival.set('pop');
  });
  arrival.set('push');
  stack.update(s => [...s, entry]);
}

// On-screen back arrow: goes through history so hardware back and the arrow
// share one path (see modalStack.ts on why requestClose is the only door).
export function back() {
  get(stack).at(-1)?.requestClose?.();
}

// A tab switch starts the new tab at its root; tapping the current tab
// returns it to its root. Either way the old stack's history entries are
// unwound in one synchronous step.
export function switchTab(t: Tab) {
  const same = get(tab) === t;
  if (get(stack).length > 1) closeAll();
  tab.set(t);
  stack.set([{ k: t }]);
  arrival.set(same ? 'none' : 'tab');
}

// Hardware back with no history left: a non-Home tab goes Home before the
// app is allowed to exit (Material's navigation-bar convention).
export function backAtRoot(): boolean {
  if (get(tab) === 'home') return false;
  switchTab('home');
  return true;
}

// A snackbar above the navigation bar. Reversible actions act at once and
// offer Undo here instead of asking first.
export interface Toast { id: number; text: string; undo?: () => void | Promise<void> }
export const toast = writable<Toast | null>(null);
let toastSeq = 0, toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(text: string, undo?: Toast['undo']) {
  clearTimeout(toastTimer);
  const t = { id: ++toastSeq, text, undo };
  toast.set(t);
  // Longer when it carries Undo, so there is time to reach the button.
  toastTimer = setTimeout(() => toast.update(c => (c?.id === t.id ? null : c)), undo ? 6000 : 4000);
}

// Where the + button should add: a project screen sets this to its project
// and the status on show, so a new task lands where the user is looking.
export const addContext = writable<{ projectId: string; columnId: string | null } | null>(null);

// State a screen wants back when the user returns to it (a board's status,
// filters, a search query). Only the top screen is mounted, so the screen
// below is rebuilt on back; it reads what it left here on its stack entry.
export function memo<T extends object>(init: T): T {
  const top = get(stack).at(-1) as (Entry & { mem?: object }) | undefined;
  if (!top) return init;
  top.mem ??= { ...init };
  return top.mem as T;
}

// Jump somewhere from outside the stacks (widget, notification): unwind
// every open layer (screens and sheets), then push once that history jump
// has landed — pushing straight away lets the late popstate pop it again.
export function navigate(t: Tab, screen?: Screen, then?: () => void) {
  const closed = closeAll();
  tab.set(t);
  stack.set([{ k: t }]);
  arrival.set('none');
  const go = () => { if (screen) push(screen); then?.(); };
  if (!closed) { go(); return; }
  let done = false;
  const once = () => { if (done) return; done = true; window.removeEventListener('popstate', once); go(); };
  window.addEventListener('popstate', once);
  setTimeout(once, 400);
}
