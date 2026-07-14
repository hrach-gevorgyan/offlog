// B51 — shared transition parameters so every panel/dialog/popover/toast
// animates in AND out with the same feel, instead of each component
// hand-rolling its own CSS `animation:` (which only ever covered mount,
// never unmount — closing every panel used to snap instantly). Values
// mirror the durations/easing that were already established ad-hoc
// across the codebase (--ease in app.css is the same curve) — this
// doesn't invent a new style, just makes the existing one reusable.
import { cubicOut } from 'svelte/easing';

// Right-docked panels (ChangelogView, SettingsPanel-style managers, CardDetail).
export const panelFly = { x: 400, duration: 320, easing: cubicOut };
export const scrimFade = { duration: 160 };

// Centered dialogs (ConfirmDialog, NamePrompt) position themselves with
// `top:50%; left:50%; transform: translate(-50%,-50%)` — Svelte's built-in
// `scale` transition would overwrite that transform during the animation
// (it doesn't know about the element's own centering offset), so this is a
// custom transition that bakes the offset into every frame instead.
export function dialogPop(_node: Element, { duration = 150 }: { duration?: number } = {}) {
  return {
    duration,
    easing: cubicOut,
    css: (t: number) => `transform: translate(-50%, -50%) scale(${0.96 + 0.04 * t}); opacity: ${t};`,
  };
}

// Small popovers/dropdowns (CustomSelect, card action menus).
export const popScale = { duration: 110, start: 0.96, easing: cubicOut };

// GlobalSearch positions itself with `left:50%; transform: translateX(-50%)`
// — same offset-conflict problem as dialogPop above, different offset.
export function searchPop(_node: Element, { duration = 180 }: { duration?: number } = {}) {
  return {
    duration,
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) scale(${0.96 + 0.04 * t}); opacity: ${t};`,
  };
}

// QuickAdd's bottom-docked bar: `left:50%; transform: translateX(-50%)`,
// slides up from below rather than scaling.
export function quickAddPop(_node: Element, { duration = 200 }: { duration?: number } = {}) {
  return {
    duration,
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 12}px); opacity: ${t};`,
  };
}

// Toasts (error toast, undo toasts) — all positioned with
// `left:50%; transform: translateX(-50%)`, same offset-conflict problem
// as the centered dialogs/popovers above.
export function toastFly(_node: Element, { duration = 200 }: { duration?: number } = {}) {
  return {
    duration,
    easing: cubicOut,
    css: (t: number) => `transform: translateX(-50%) translateY(${(1 - t) * 8}px); opacity: ${t};`,
  };
}
