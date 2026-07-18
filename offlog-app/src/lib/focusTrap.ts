// Svelte action: `use:trapFocus` on a modal/panel's outer container.
//
// Every overlay in the app (ConfirmDialog, Settings and its sub-panels,
// Maintenance, Trash, Time Travel, CardDetail, QuickAdd, GlobalSearch) is a
// real modal that visually blocks the rest of the app — but none of them
// trapped keyboard focus before this: Tab could cycle out into the dimmed
// page behind the scrim, and closing a modal never returned focus to
// whatever button opened it, dropping keyboard users back at the top of
// the page instead. See ROADMAP.md A13.
//
// On mount: remembers whatever had focus (the trigger element), moves
// focus into the panel (first focusable element, or the panel itself if
// none), and keeps Tab/Shift+Tab cycling within the panel's focusable
// elements instead of escaping to the page behind the scrim.
// On destroy: returns focus to the trigger element, if it's still in the
// document (it usually is — the parent view stays mounted underneath).

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => el.offsetParent !== null); // skip hidden elements
}

export function trapFocus(node: HTMLElement) {
  const trigger = document.activeElement as HTMLElement | null;

  // Don't steal focus from an element that already has it inside this
  // panel (e.g. an input with the existing a11y-autofocus pattern) —
  // only move focus in if it's currently outside the panel entirely.
  if (!node.contains(document.activeElement)) {
    // Only jump into an inner field if it explicitly opted in via
    // `autofocus` (e.g. a rename/add-item input) — otherwise land on the
    // panel itself. Grabbing "just whatever is first in the DOM" used to
    // put the caret straight into CardDetail's title textarea on every
    // card open, silently putting it in edit mode with no intent to do so.
    const explicit = node.querySelector<HTMLElement>('[autofocus]');
    if (explicit) {
      explicit.focus();
    } else {
      if (!node.hasAttribute('tabindex')) node.tabIndex = -1;
      node.focus();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable(node);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      if (trigger && document.contains(trigger)) trigger.focus();
    },
  };
}
