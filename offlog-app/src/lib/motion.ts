// Shared transition parameters for the motion this app still has.
//
// The rule: animate only what tells the user where something came from, or
// how far along something is. A panel slides in from the edge it docks to, a
// toast arrives from below, a scrim dims the page behind a modal. Everything
// else -- view switches, dialogs scaling up, popovers growing, hover colour
// fades -- appears in one frame, because the end state already says
// everything the motion was saying more slowly.
//
// Prefer these over a component-local CSS `animation:`, which only covers
// mount and leaves close snapping instantly.
import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from './theme';

// Reduce Motion setting (Settings → View & Accessibility): zeroes every
// duration below instead of skipping the transition outright, so opacity/
// position still end at their final values in one frame -- no half-animated
// elements left behind, just instant.
function d(base: number): number { return prefersReducedMotion() ? 0 : base; }

// Right-docked panels (TimeTravelView, SettingsPanel-style managers, CardDetail).
// `duration` is a getter (not a plain field) so every consumer -- direct
// reads, spreads like `{...panelFly, x: 440}`, destructuring -- picks up
// the current Reduce Motion state without needing its own call site change.
export const panelFly = { x: 400, get duration() { return d(320); }, easing: cubicOut };
export const scrimFade = { get duration() { return d(160); }, easing: cubicOut };

// QuickAdd's bottom-docked bar: `left:50%; transform: translateX(-50%)`,
// slides up from below rather than scaling.
export function quickAddPop(_node: Element, { duration = 200 }: { duration?: number } = {}) {
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 12}px); opacity: ${t};`,
  };
}

// Toasts (error toast, undo toasts) — positioned with
// `left:50%; transform: translateX(-50%)`. Svelte's built-in transitions
// would overwrite that centring offset mid-animation, so the offset is
// baked into every frame here instead.
export function toastFly(_node: Element, { duration = 200 }: { duration?: number } = {}) {
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 8}px); opacity: ${t};`,
  };
}
