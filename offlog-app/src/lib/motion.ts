// Shared transition parameters, built on Material 3's motion system.
// https://m3.material.io/styles/motion/easing-and-duration
//
// Three rules, and every preset below follows them:
//
// 1. ENTERING decelerates -- the element arrives and settles. LEAVING
//    accelerates -- it gets out of the way. Using one curve for both is what
//    makes motion feel mechanical rather than physical.
// 2. EXITS ARE SHORTER than entrances. An arrival is worth watching; a
//    dismissal is something the user already decided on, so it should not
//    make them wait. Roughly 0.75x throughout.
// 3. DURATION SCALES WITH TRAVEL. A dialog fading in place is 200ms; a
//    full-height panel crossing the screen is 300ms; a menu appearing next
//    to its button is 150ms.
//
// The durations and curves are CSS custom properties in app.css so the two
// systems cannot drift; the values are mirrored here because Svelte
// transitions need real numbers, not `var()`.
//
// Prefer these over a component-local CSS `animation:`, which only covers
// mount and leaves close snapping instantly.
import { prefersReducedMotion } from './theme';

// Reduce Motion (Settings → View & Accessibility) zeroes every duration
// rather than skipping the transition, so opacity/position still end at their
// final values in one frame -- no half-animated elements left behind.
//
// `duration` is a GETTER on every object preset below, never a plain field.
// Evaluating d() once at module load would freeze Reduce Motion at whatever
// it was when the app started, and toggling it would do nothing until a
// reload. The function-shaped transitions call d() at transition time, which
// has the same effect.
function d(base: number): number { return prefersReducedMotion() ? 0 : base; }

// Mirrors --dur-* in app.css.
const DUR = { hover: 100, small: 150, medium: 200, large: 300 } as const;
// Exits are consistently quicker than their matching entrance.
const OUT = (ms: number) => Math.round(ms * 0.75);

// Mirrors --ease-* in app.css. Svelte wants an easing FUNCTION, so these are
// the cubic-beziers evaluated directly rather than named CSS curves.
function bezier(x1: number, y1: number, x2: number, y2: number) {
  // Newton's method on the x-polynomial, then evaluate y. Accurate enough for
  // a UI transition and avoids a dependency for four curves.
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 5; i++) {
      const slope = slopeX(t);
      if (slope === 0) break;
      t -= (sampleX(t) - x) / slope;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

export const easeStandard = bezier(0.2, 0, 0, 1);
export const easeDecelerate = bezier(0.05, 0.7, 0.1, 1);
export const easeAccelerate = bezier(0.3, 0, 0.8, 0.15);

// ── Scrims ───────────────────────────────────────────────────────────────────
// The dimming behind a modal. Standard curve both ways: it is a change of
// state, not an arrival from somewhere.
export const scrimIn = { get duration() { return d(DUR.medium); }, easing: easeStandard };
export const scrimOut = { get duration() { return d(OUT(DUR.medium)); }, easing: easeStandard };

// ── Centred dialogs ──────────────────────────────────────────────────────────
// Fade with a slight scale, so the dialog reads as coming toward the user
// rather than simply appearing. They position themselves with
// `top:50%; left:50%; transform: translate(-50%,-50%)`, and Svelte's built-in
// `scale` would overwrite that centring offset mid-animation -- so the offset
// is baked into every frame here.
export function dialogIn(_node: Element) {
  return {
    duration: d(DUR.medium),
    easing: easeDecelerate,
    css: (t: number) => `transform: translate(-50%, -50%) scale(${0.94 + 0.06 * t}); opacity: ${t};`,
  };
}
export function dialogOut(_node: Element) {
  return {
    duration: d(OUT(DUR.medium)),
    easing: easeAccelerate,
    css: (t: number) => `transform: translate(-50%, -50%) scale(${0.96 + 0.04 * t}); opacity: ${t};`,
  };
}

// Dialogs centred by a flex wrapper instead of a translate offset, so the
// scale needs no baked-in correction.
export const centredIn = { get duration() { return d(DUR.medium); }, start: 0.94, easing: easeDecelerate };
export const centredOut = { get duration() { return d(OUT(DUR.medium)); }, start: 0.96, easing: easeAccelerate };

// ── Edge-docked panels ───────────────────────────────────────────────────────
// Travel is the panel's OWN width, never a fixed pixel count: a flat x:400
// left Time Travel (560px) starting 160px on screen and Trash (480px) 80px
// on screen, so they appeared to pop rather than slide.
//
// Built-in `fly` with per-panel params rather than a custom transition
// function -- these panels carry no CSS transform for fly to overwrite, so a
// custom function bought nothing and cost the proven path.
//
// `duration` stays a getter so Reduce Motion is read at transition time.
const panelDur = (w: number) => Math.round(DUR.large * (w / 420));

export function panelIn(w: number) {
  // +40 clears the `-8px 0 32px` shadow every .panel carries: at exactly
  // 100% the shadow is still on screen while the panel is not.
  return { x: w + 40, opacity: 1, get duration() { return d(panelDur(w)); }, easing: easeDecelerate };
}
export function panelOut(w: number) {
  return { x: w + 40, opacity: 1, get duration() { return d(OUT(panelDur(w))); }, easing: easeAccelerate };
}
// The scrim matches THAT panel's duration so the two finish together.
export function panelScrimIn(w: number) {
  return { get duration() { return d(panelDur(w)); }, easing: easeStandard };
}
export function panelScrimOut(w: number) {
  return { get duration() { return d(OUT(panelDur(w))); }, easing: easeStandard };
}

// ── Exit timing, for components that must outlive their own close ────────────
// A modal is destroyed the moment its parent's {#if} goes false, which kills
// the outro before it can play. The fix is for the component to delay only
// the dispatch that tells the parent -- modalStack is left alone: history.back()
// and the stack unwind still happen immediately, so back-button semantics are
// unchanged.
//
// Read at close time, never cached: these are getters so Reduce Motion (which
// makes them 0) is honoured even if it was toggled after the modal opened.
export const exitMs = {
  get small() { return d(OUT(DUR.small)); },
  get medium() { return d(OUT(DUR.medium)); },
  get large() { return d(OUT(DUR.large)); },
  panel(w: number) { return d(OUT(panelDur(w))); },
};

// ── Popovers, menus, dropdowns ───────────────────────────────────────────────
// Appear next to the control that opened them: short travel, short duration.
export const popIn = { y: 4, get duration() { return d(DUR.small); }, easing: easeDecelerate };
export const popOut = { y: 4, get duration() { return d(OUT(DUR.small)); }, easing: easeAccelerate };

// ── Inline reveals ───────────────────────────────────────────────────────────
// Disclosure sections opening in place -- `slide` measures its own height, so
// this only carries timing.
export const revealIn = { get duration() { return d(DUR.small); }, easing: easeDecelerate };
export const revealOut = { get duration() { return d(OUT(DUR.small)); }, easing: easeAccelerate };

// ── Toasts ───────────────────────────────────────────────────────────────────
// Rise into place from below. Positioned with `left:50%;
// transform: translateX(-50%)`, same centring-offset problem as the dialogs.
export function toastIn(_node: Element) {
  return {
    duration: d(DUR.medium),
    easing: easeDecelerate,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 12}px); opacity: ${t};`,
  };
}
export function toastOut(_node: Element) {
  return {
    duration: d(OUT(DUR.medium)),
    easing: easeAccelerate,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 8}px); opacity: ${t};`,
  };
}

// QuickAdd's bottom-docked bar: further travel than a toast, same shape.
export function quickAddIn(_node: Element) {
  return {
    duration: d(DUR.large),
    easing: easeDecelerate,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 24}px); opacity: ${t};`,
  };
}
export function quickAddOut(_node: Element) {
  return {
    duration: d(OUT(DUR.large)),
    easing: easeAccelerate,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 16}px); opacity: ${t};`,
  };
}

// GlobalSearch: centred horizontally only.
export function searchIn(_node: Element) {
  return {
    duration: d(DUR.medium),
    easing: easeDecelerate,
    css: (t: number) => `transform: translateX(-50%) scale(${0.94 + 0.06 * t}); opacity: ${t};`,
  };
}
export function searchOut(_node: Element) {
  return {
    duration: d(OUT(DUR.medium)),
    easing: easeAccelerate,
    css: (t: number) => `transform: translateX(-50%) scale(${0.96 + 0.04 * t}); opacity: ${t};`,
  };
}

// ── Top-level view switch ────────────────────────────────────────────────────
// Material's "fade through": the outgoing view leaves before the incoming one
// arrives, rather than the two dissolving into each other. The delay on the
// way in is what keeps them from being visible at the same time.
//
// Both views are still mounted together for a moment, so `.view-fade`'s
// wrapper stacks them in one CSS grid cell (App.svelte) instead of letting
// them share a flex column -- without that they split the height and the new
// view snaps to full size when the old one unmounts.
export const viewIn = { get duration() { return d(DUR.small); }, get delay() { return d(90); }, easing: easeDecelerate };
export const viewOut = { get duration() { return d(90); }, easing: easeAccelerate };
