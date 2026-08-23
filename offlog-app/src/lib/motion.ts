// Shared transition parameters so every panel/dialog/popover/toast animates
// in AND out with the same feel. Prefer these over a component-local CSS
// `animation:`, which only covers mount and leaves close snapping instantly.
// Durations/easing match --ease in app.css.
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

// Centered dialogs (ConfirmDialog, NamePrompt) position themselves with
// `top:50%; left:50%; transform: translate(-50%,-50%)` — Svelte's built-in
// `scale` transition would overwrite that transform during the animation
// (it doesn't know about the element's own centering offset), so this is a
// custom transition that bakes the offset into every frame instead.
export function dialogPop(_node: Element, { duration = 150 }: { duration?: number } = {}) {
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t: number) => `transform: translate(-50%, -50%) scale(${0.96 + 0.04 * t}); opacity: ${t};`,
  };
}

// Small popovers/dropdowns (CustomSelect, card action menus).
export const popScale = { get duration() { return d(110); }, start: 0.96, easing: cubicOut };

// Centered dialogs that are flex-centered by a `.scrim` wrapper (shortcuts
// panel) rather than `top:50%;left:50%;transform:translate(-50%,-50%)` --
// same feel as dialogPop but usable directly with Svelte's built-in `scale`
// since there's no translate offset to bake in.
export const dialogScale = { get duration() { return d(150); }, start: 0.96, easing: cubicOut };

// GlobalSearch positions itself with `left:50%; transform: translateX(-50%)`
// — same offset-conflict problem as dialogPop above, different offset.
export function searchPop(_node: Element, { duration = 180 }: { duration?: number } = {}) {
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) scale(${0.96 + 0.04 * t}); opacity: ${t};`,
  };
}

// QuickAdd's bottom-docked bar: `left:50%; transform: translateX(-50%)`,
// slides up from below rather than scaling.
export function quickAddPop(_node: Element, { duration = 200 }: { duration?: number } = {}) {
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 12}px); opacity: ${t};`,
  };
}

// Top-level view switch (Dashboard/Kanban/List/Agenda/Focus in App.svelte)
// — a plain, quick crossfade so switching views doesn't feel like an
// instant, jarring DOM swap. Deliberately no scale/slide: these views can
// be tall/scrollable, and a bigger motion would fight with scroll position.
export const pageFade = { get duration() { return d(140); }, easing: cubicOut };

// Toasts (error toast, undo toasts) — all positioned with
// `left:50%; transform: translateX(-50%)`, same offset-conflict problem
// as the centered dialogs/popovers above.
export function toastFly(_node: Element, { duration = 200 }: { duration?: number } = {}) {
  return {
    duration: d(duration),
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 8}px); opacity: ${t};`,
  };
}
