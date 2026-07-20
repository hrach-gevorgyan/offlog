// Android hardware/gesture back button — and the browser's own back
// button/gesture on desktop/PWA — have no effect on any of this app's
// modals and slide-in panels by default. Confirmed via grep (v3.6.0):
// nothing registers App.addListener('backButton'), so pressing back while
// e.g. Trash or Settings is open falls through to Capacitor's default,
// which minimizes/exits the app instead of closing the open layer. See
// ROADMAP.md item A14.
//
// Fix: every open overlay pushes one `history` entry via closeOnBack()
// below. Back (hardware or browser) pops it, firing a 'popstate' event,
// which this module turns into a call to whichever close callback is on
// top of the stack — the same LIFO order the overlays are visually
// stacked in.
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
// MANDATORY for every consumer, found the hard way (2026-07-17): a
// component that calls closeOnBack() must be mounted behind a {#key} that
// changes on every real open, not just `{#if showX}`. A fast
// close-then-reopen of the same overlay can toggle showX false→true
// again while Svelte's outro transition for the previous show is still
// in flight — Svelte then *reverses* that outro into a fresh intro on
// the SAME component instance rather than destroying and recreating it.
// closeOnBack() only runs once, at that instance's setup, so the revived
// instance's requestClose is the ORIGINAL one — already spent (the
// single-fire guard below) — and no new stack entry exists for it either.
// Nothing can ever close it again: stuck open, permanently, with a
// working Escape/scrim/back that silently no-ops. This is NOT something
// this module can detect or fix from here (it never sees Svelte's
// mount/unmount, only the requestClose calls) — every consumer must key
// its own remount. See Sidebar.svelte's timeTravelSession/trashSession/
// settingsSession and KanbanBoard.svelte / ListView.svelte / App.svelte's
// detailOpenSession / searchDetailSession for the pattern: bump a
// counter on every open, fold it into the {#key} expression alongside
// whatever the key would otherwise be (e.g. a task id).

type CloseFn = () => void;
interface Entry { close: CloseFn; id: number }

const stack: Entry[] = [];
let listening = false;
let nextId = 1;

// popstate fires once per *browser navigation*, not once per history.back()
// call -- if two closeOnBack layers each call requestClose() in quick
// succession (owner-reported 2026-07-17: rapid Changelog [now Time Travel] open/close/open
// left it "stuck, can't get back to main screen"), the browser can
// coalesce the two back() calls into a single navigation and fire only
// one popstate. Popping exactly one stack entry per popstate (the old
// behavior) then leaves a stale entry behind: its component is still
// mounted, but its requestClose was already spent (guarded to fire once),
// so nothing can ever close it again -- permanently stuck.
//
// A first fix (2026-07-17, same day) stamped each push with its stack
// *depth* and compared depths on landing. That still broke after a page
// reload: `stack`/`nextId` reset to empty on every fresh module load, but
// real browser session history (and therefore its current depth) survives
// a reload -- so a depth comparison against a freshly-empty stack was
// comparing two numbers that no longer meant the same thing, and the
// panel could refuse to open, or get stuck again, after a refresh
// following an earlier stuck session.
//
// Fix: stamp each push with a globally unique id instead of a depth, and
// on popstate, match by *identity* against the current stack rather than
// by count. If the landed state's id is present in `stack`, close and pop
// every entry above it. If it's absent -- including the common case of a
// stale id from before a reload, or no offlog state at all -- there is no
// layer we can still vouch for, so close and pop everything currently
// tracked. This is correct regardless of whether real browser depth and
// `stack.length` agree, which a reload can never change.
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
  // 'popstate' -- a second call before that resolves (a fast double-tap,
  // or a click landing on a still-fading scrim right after Enter/Save
  // already triggered one) issues a second history.back() against a stack
  // that only ever had one entry pushed for this layer, over-navigating
  // into whatever was underneath it (owner-reported, 2026-07-17: quick add
  // "sometimes not working" after repeated fast use -- exactly this).
  let requested = false;
  return () => {
    if (requested) return;
    requested = true;
    history.back();
    // Fallback (owner-reported live testing, 2026-07-20: multiple X/Cancel
    // buttons across different overlays stopped closing anything in the
    // same session, requiring a full app restart to recover). history.back()
    // is a request, not a guarantee -- Android WebView has been seen to
    // occasionally not deliver the resulting 'popstate' at all, and this
    // guard's own single-fire design means a stuck entry could never be
    // retried. If popstate hasn't removed this entry shortly after asking
    // it to, close it directly instead of waiting forever on an event that
    // may never arrive. No effect on the normal case: by the time this
    // fires, popstate has almost always already removed the entry, so
    // stack.indexOf finds nothing and this is a no-op.
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
// (confirmed live: this silently prevented the new overlay from ever
// appearing). discardTop() instead removes the entry immediately with no
// navigation — the pushed history entry becomes an inert no-op; a later
// back press closes whatever replaced this layer, one level up, rather
// than retracing the exact transition. That discarded entry's physical
// history slot is still there, unused — the layer above it may need one
// extra back press to unwind past it, which is fine, it's inert either way.
export function discardTop(): void {
  stack.pop();
}
