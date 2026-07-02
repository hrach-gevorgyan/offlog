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

type CloseFn = () => void;
interface Entry { close: CloseFn }

const stack: Entry[] = [];
let listening = false;

function onPopState() {
  const entry = stack.pop();
  entry?.close();
}

function ensureListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', onPopState);
}

export function closeOnBack(close: CloseFn): CloseFn {
  ensureListening();
  history.pushState({ offlogLayer: true }, '');
  stack.push({ close });
  return () => { history.back(); };
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
// back press just closes whatever replaced this layer, one level up,
// rather than retracing the exact transition.
export function discardTop(): void {
  stack.pop();
}
