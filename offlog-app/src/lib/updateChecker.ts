import { writable, get, type Writable } from 'svelte/store';
import { isTauri, getAutoUpdateCheckEnabled } from '../config';
import type { Update } from '@tauri-apps/plugin-updater';

// Desktop-only auto-updater flow (E3/ROADMAP.md). Split into explicit
// phases rather than SettingsPanel's old single downloadAndInstall() call
// so the UI can show real progress and let the user defer installing —
// `@tauri-apps/plugin-updater`'s `Update` exposes download()/install() as
// separate steps specifically to support this (confirmed by reading its
// own type definitions, dist-js/index.d.ts).
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  version?: string;
  body?: string; // release notes, from latest.json's `notes` field
  progress?: number; // 0-100, only meaningful during 'downloading'
  error?: string;
}

export const updateState: Writable<UpdateState> = writable({ phase: 'idle' });

// Whether UpdateModal should be shown. A separate store (not folded into
// `phase`) so App.svelte's background-check banner and SettingsPanel's
// manual button can both open the same modal without either owning it.
export const showUpdateModal = writable(false);

// The live Update resource between check() and install() — not part of
// `updateState` since it's a handle to call methods on, not comparable
// state a component would react to directly.
let pendingUpdate: Update | null = null;

export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) return;
  updateState.set({ phase: 'checking' });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      pendingUpdate = null;
      updateState.set({ phase: 'idle' });
      return;
    }
    pendingUpdate = update;
    updateState.set({ phase: 'available', version: update.version, body: update.body });
  } catch {
    updateState.set({ phase: 'error', error: 'Could not check for updates right now.' });
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!pendingUpdate) return;
  let contentLength = 0;
  let downloaded = 0;
  const current = get(updateState);
  updateState.set({ ...current, phase: 'downloading', progress: 0 });
  try {
    await pendingUpdate.download((event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength ?? 0;
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        const progress = contentLength ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : undefined;
        updateState.update(s => ({ ...s, progress }));
      } else if (event.event === 'Finished') {
        updateState.update(s => ({ ...s, phase: 'ready', progress: 100 }));
      }
    });
  } catch {
    updateState.update(s => ({ ...s, phase: 'error', error: 'Download failed — try again later.' }));
  }
}

export async function installUpdate(): Promise<void> {
  if (!pendingUpdate) return;
  try {
    await pendingUpdate.install();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch {
    updateState.update(s => ({ ...s, phase: 'error', error: 'Could not install the update — try restarting the app manually.' }));
  }
}

// Unattended background check (E3 follow-up): on desktop startup, and
// every ~6h while the app stays running, silently checks for an update if
// the user hasn't turned this off in Settings. Never downloads or
// installs by itself — only ever flips `updateState` to 'available' so
// App.svelte's banner can offer it. The manual "Check for updates" button
// in Settings calls checkForUpdate() directly and always works, regardless
// of this setting.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBackgroundUpdateChecks(): void {
  if (!isTauri() || intervalId) return;
  const runIfEnabled = () => { if (getAutoUpdateCheckEnabled()) checkForUpdate(); };
  runIfEnabled();
  intervalId = setInterval(runIfEnabled, CHECK_INTERVAL_MS);
}
