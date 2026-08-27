import PouchDB from 'pouchdb';
import MemoryAdapter from 'pouchdb-adapter-memory';

// db.ts (src/lib/db.ts) expects PouchDB as a global — in the real app it's
// the UMD bundle loaded via <script src="/pouchdb.js"> in index.html (see
// db.ts's top comment for why). There's no such script tag under Vitest, so
// this stands in for it: a real `pouchdb` npm install, defaulted to the
// in-memory adapter instead of IndexedDB so tests run fast with no browser
// storage involved and no cross-test leakage from real disk state.
PouchDB.plugin(MemoryAdapter);
(globalThis as any).PouchDB = PouchDB.defaults({ adapter: 'memory' });

// Node 20+'s own built-in `localStorage` global shadows jsdom's — vitest's
// jsdom environment detects the Node one already exists and skips wiring up
// its own, so the bare `localStorage` identifier (used throughout
// db.ts/config.ts at module load) ends up undefined without
// --localstorage-file. A minimal in-memory Storage polyfill sidesteps the
// conflict entirely instead of fighting over which implementation wins.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  key(i: number) { return [...this.store.keys()][i] ?? null; }
  get length() { return this.store.size; }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: (globalThis as any).localStorage,
});

// B51 — jsdom has no Web Animations API, but Svelte 5's transition
// directives (fly/fade/scale/slide, now used throughout CardDetail and
// other panels for open/close animation) call `Element.animate()`
// internally. Without this, any component with a transitioning element
// throws "element.animate is not a function" the moment it mounts —
// not a real behavior gap, just jsdom missing the API. A no-op stub
// with the shape transitions expect is enough for tests, which only
// care that the component renders/behaves correctly, not that the
// animation itself plays.
// jsdom implements no media queries, but components that switch layout on
// viewport width (SettingsPanel's narrow/detail mode, theme.ts's "system"
// mode) call matchMedia() on mount. The stub always reports "does not
// match", i.e. the desktop/light branch; a test needing the other branch
// should override it for that test rather than change this default.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom implements no layout, so it has no scrollIntoView — components
// that keep the active row in view (Sidebar, CustomSelect) call it on
// mount. Unstubbed it throws as an unhandled error, which fails the run
// even when every test passes.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return {
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      addEventListener() {},
      removeEventListener() {},
    } as unknown as Animation;
  };
}

// downloadBlob() (carddetail/helpers.ts, settings/helpers.ts) triggers a
// browser download the same way in every real browser: build a blob: URL
// on a throwaway <a download>, call .click(), done. jsdom has no download
// manager, so it treats that click as a real navigation attempt instead
// and logs "Not implemented: navigation to another Document". Nothing in
// either helper depends on the click event actually dispatching (both
// return immediately after), so a no-op is enough -- and scoped to
// HTMLAnchorElement specifically, so it can't mask a real navigation bug
// on some other element.
HTMLAnchorElement.prototype.click = function () {};

// jsdom ships no canvas backend (the real one is the optional `canvas`
// native package, not worth installing just for this) — every
// getContext('2d') call logs "Not implemented" to the console and
// returns null. ListView's measureTextWidth() already tolerates that
// null, but carddetail/helpers.ts's downscaleImage() does not (a bare
// `getContext('2d')!`), so a null return is a latent
// "Cannot read properties of null" the moment something exercises it.
// A minimal stub covering what both call sites actually use --
// measureText (a rough char-count width, plenty for layout tests that
// don't assert exact pixel values) and drawImage/font as no-ops --
// fixes both: no more log noise, and no more silent reliance on jsdom's
// default of returning null.
HTMLCanvasElement.prototype.getContext = function () {
  return {
    font: '',
    measureText(text: string) { return { width: text.length * 7 } as TextMetrics; },
    drawImage() {},
    fillRect() {},
    clearRect() {},
  } as unknown as CanvasRenderingContext2D;
} as typeof HTMLCanvasElement.prototype.getContext;
