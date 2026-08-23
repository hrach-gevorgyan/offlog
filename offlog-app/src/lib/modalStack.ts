// The Android hardware/gesture back button — and the browser's own back
// button/gesture on desktop/PWA — have no effect on modals and slide-in
// panels by default: pressing back while e.g. Trash or Settings is open falls
// through to Capacitor's default, which minimizes or exits the app instead of
// closing the open layer.
//
// So every open overlay pushes one `history` entry via closeOnBack() below.
// Back (hardware or browser) pops it, firing a 'popstate' event, which this
// module turns into a call to whichever close callback is on top of the stack
// — the same LIFO order the overlays are visually stacked in.
//
// The on-screen dismiss controls (✕ buttons, Cancel, click-outside,
// Escape, "open this search result", etc.) must call the `requestClose`
// function this returns — NEVER the close callback directly, and nothing
// else should touch the stack. requestClose() is *only* `history.back()`;
// the popstate handler is the single place that pops the stack and calls
// close(). Popping the stack anywhere else (e.g. inside requestClose
// itself) desyncs it from the pending history navigation — the popstate
// that follows would then fire for whatever's now on top instead of the
// layer that actually asked to close, silently closing the wrong thing.
//
// MANDATORY for every consumer: a component that calls closeOnBack() must be
// mounted behind a {#key} that changes on every real open, not just gated by
// `{#if showX}`. A fast close-then-reopen of the same overlay can toggle showX
// false→true again while Svelte's outro transition for the previous show is
// still in flight — Svelte then *reverses* that outro into a fresh intro on
// the SAME component instance rather than destroying and recreating it.
// closeOnBack() only runs once, at that instance's setup, so the revived
// instance's requestClose is the ORIGINAL one — already spent (the
// single-fire guard below) — and no new stack entry exists for it either. The
// overlay is then permanently stuck open, with a working-looking
// Escape/scrim/back that silently no-ops.
//
// This module cannot detect or fix that from here (it never sees Svelte's
// mount/unmount, only the requestClose calls) — every consumer must key its
// own remount. See Sidebar.svelte's timeTravelSession/trashSession/
// settingsSession and KanbanBoard.svelte / ListView.svelte / App.svelte's
// detailOpenSession / searchDetailSession for the pattern: bump a counter on
// every open and fold it into the {#key} expression alongside whatever the
// key would otherwise be (e.g. a task id).

type CloseFn = () => void;
interface Entry { close: CloseFn; id: number }

const stack: Entry[] = [];
let listening = false;
let nextId = 1;

// popstate fires once per *browser navigation*, not once per history.back()
// call: if two closeOnBack layers each call requestClose() in quick
// succession, the browser can coalesce the two back() calls into a single
// navigation and fire only one popstate. Popping exactly one stack entry per
// popstate would then leave a stale entry behind — its component still
// mounted, but its requestClose already spent (guarded to fire once), so
// nothing could ever close it again.
//
// So each push is stamped with a globally unique id, and popstate matches by
// *identity* against the current stack rather than by count. If the landed
// state's id is present in `stack`, close and pop every entry above it. If it
// is absent — including a stale id from before a page reload, or no offlog
// state at all — no layer can still be vouched for, so close and pop
// everything currently tracked.
//
// Do not compare stack *depth* instead: `stack`/`nextId` reset to empty on
// every fresh module load, while real browser session history and its depth
// survive a reload, so the two numbers stop meaning the same thing and panels
// can refuse to open or get stuck after a refresh. Matching by identity is
// correct regardless of whether browser depth and `stack.length` agree.
function onPopState(e: PopStateEvent) {
  const landedId = (e.state as { offlogId?: number } | null)?.offlogId;
  const idx = landedId === undefined ? -1 : stack.findIndex((entry) => entry.id === landedId);
  while (stack.length > idx + 1) {
    const entry = stack.pop();
    entry?.close();
  }
}

function ensureListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', onPopState);
}

export function closeOnBack(close: CloseFn): CloseFn {
  ensureListening();
  const id = nextId++;
  const entry: Entry = { close, id };
  stack.push(entry);
  history.pushState({ offlogLayer: true, offlogId: id }, '');
  // Guarded against firing twice for the same layer: every overlay can
  // reach requestClose() from more than one path (Escape, a scrim click,
  // a Cancel/Save button), and history.back() resolves asynchronously via
  // 'popstate' — a second call before that resolves (a fast double-tap,
  // or a click landing on a still-fading scrim right after Enter/Save
  // already triggered one) issues a second history.back() against a stack
  // that only ever had one entry pushed for this layer, over-navigating
  // into whatever was underneath it.
  let requested = false;
  return () => {
    if (requested) return;
    requested = true;
    history.back();
    // Fallback: history.back() is a request, not a guarantee — Android
    // WebView sometimes never delivers the resulting 'popstate' at all, and
    // the single-fire guard above means a stuck entry could never be retried,
    // leaving every X/Cancel button in the session unable to close anything.
    // If popstate hasn't removed this entry shortly after asking it to, close
    // it directly rather than waiting forever on an event that may never
    // arrive. No effect on the normal case: popstate has almost always
    // already removed the entry, so stack.indexOf finds nothing here.
    setTimeout(() => {
      const idx = stack.indexOf(entry);
      if (idx === -1) return;
      while (stack.length > idx) {
        const e = stack.pop();
        e?.close();
      }
    }, 400);
  };
}

// For an overlay that's being immediately replaced by another one opening
// (a search result opening its task's detail view, a sidebar nav item
// opening Settings/Trash/etc.) rather than dismissed outright. Removing
// this layer's entry via requestClose (history.back()) would race the
// *next* overlay's own history.pushState() — back() resolves asynchronously
// via 'popstate', pushState runs synchronously, so the two can interleave
// and the new overlay's pushState can end up firing before the pending
// back() resolves, leaving history and the visible overlay out of sync
// (which silently prevents the new overlay from ever appearing).
// discardTop() instead removes the entry immediately with no
// navigation — the pushed history entry becomes an inert no-op; a later
// back press closes whatever replaced this layer, one level up, rather
// than retracing the exact transition. That discarded entry's physical
// history slot is still there, unused — the layer above it may need one
// extra back press to unwind past it, which is fine, it's inert either way.
export function discardTop(): void {
  stack.pop();
}

// Closes every tracked overlay at once — needed by entry points that jump
// straight to a view (e.g. a home-screen widget tap) while something else is
// already on screen. Flipping view-level booleans alone would leave the old
// overlay mounted on top of the new view.
//
// Deliberately fully synchronous: pop and close every entry immediately with
// no dependency on any future event, then issue ONE compensating
// `history.go()` purely to keep real browser history in sync for a later
// hardware back-press. Its resulting popstate finds `stack` already empty and
// safely no-ops, which also matches the case where the browser coalesces it
// away entirely. Relying on that popstate to do the popping instead hits the
// coalescing failure mode described on onPopState above: a second tap
// arriving while a previous `history.go()` is still pending can have its
// navigation coalesced away, leaving `stack` unpopped and a later closeAll()
// reading a stale `stack.length`.
export function closeAll(): void {
  if (stack.length === 0) return;
  const n = stack.length;
  const entries = stack.splice(0, stack.length);
  for (let i = entries.length - 1; i >= 0; i--) entries[i].close();
  history.go(-n);
}
