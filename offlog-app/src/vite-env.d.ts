/// <reference types="vite/client" />
/// <reference types="pouchdb" />

// The host-injected globals this app runs under. None of them ship a Window
// augmentation of their own, so each is declared to the depth the app reads.
declare global {
  interface Window {
    // Present only inside the Capacitor Android WebView.
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
    // Present only inside the Tauri desktop WebView. Its presence is the
    // platform check; see config.ts's isTauri().
    __TAURI_INTERNALS__?: {
      invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
    // PouchDB core, loaded as a UMD global by index.html before any module
    // runs — @types/pouchdb types the constructor but not its place on window.
    PouchDB: typeof PouchDB;
  }
}

export {};
