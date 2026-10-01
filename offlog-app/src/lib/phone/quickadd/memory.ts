// Per-device Quick add memory: the project last added to (localStorage, so
// it outlives the session) and the last keyboard height seen (module state;
// it is only a layout hint, re-measured on every open).

const LAST_PROJECT_KEY = 'offlog_quickadd_last_project';

export function lastProject(): string | null {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}
export function rememberProject(id: string) {
  try { localStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* storage off: no default, nothing lost */ }
}

// Smaller drops than this are browser chrome or a suggestion strip, not the IME.
const MIN_KEYBOARD = 120;
let keyboard: number | null = null;
export const keyboardHeight = () => keyboard;

// adjustResize shrinks the viewport by the keyboard's height, so the keyboard
// is the gap below the tallest height seen at the current width.
export function trackKeyboard(onChange: (h: number) => void): () => void {
  const vv = window.visualViewport;
  const height = () => vv?.height ?? window.innerHeight;
  let width = window.innerWidth, tallest = height();
  const onResize = () => {
    const h = height();
    if (window.innerWidth !== width) { width = window.innerWidth; tallest = h; return; }
    tallest = Math.max(tallest, h);
    const d = tallest - h;
    if (d >= MIN_KEYBOARD && d !== keyboard) { keyboard = d; onChange(d); }
  };
  (vv ?? window).addEventListener('resize', onResize);
  return () => (vv ?? window).removeEventListener('resize', onResize);
}
