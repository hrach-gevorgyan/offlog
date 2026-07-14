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
