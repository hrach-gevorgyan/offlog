// The + button steps aside while a list scrolls down and comes back on any
// scroll up or once the list reaches its end (Material's FAB-on-scroll).
// Only vertical movement counts: a horizontal scroller (chips, a board's
// columns) keeps its scrollTop, so its events change nothing.
export const FAB_HIDE_AFTER = 120;

export function fabScrollTracker(set: (away: boolean) => void) {
  const last = new WeakMap<Element, number>();
  let down = 0;
  return {
    onScroll(el: Element) {
      const y = el.scrollTop, prev = last.get(el) ?? 0;
      last.set(el, y);
      if (y === prev) return;
      const atEnd = y + el.clientHeight >= el.scrollHeight - 2;
      if (y < prev || atEnd) { down = 0; set(false); return; }
      down += y - prev;
      if (down > FAB_HIDE_AFTER) set(true);
    },
    reset() { down = 0; set(false); },
  };
}
