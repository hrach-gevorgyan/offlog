// Pure helpers lifted out of SettingsPanel.svelte — no component state, so
// they stay unit-testable without mounting the panel.
import { isTauri as isTauriCheck } from '../../config';
import type { MaintStepResult } from '../db';

export type MaintStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
// key is the same narrow union db.ts's MaintStepResult uses, not a bare
// string -- setMaintStep() requires that union, so a plain `string` here
// meant every call site was one typo away from silently matching nothing.
export interface MaintStep { key: MaintStepResult['key']; label: string; status: MaintStatus; note: string }

export function freshMaintSteps(): MaintStep[] {
  return [
    { key: 'check',   label: 'Checking your data for problems', status: 'pending', note: '' },
    { key: 'repair',  label: 'Repairing anything fixable',      status: 'pending', note: '' },
    { key: 'history', label: 'Clearing old activity history',   status: 'pending', note: '' },
    { key: 'trash',   label: 'Clearing old items from Recycle', status: 'pending', note: '' },
    { key: 'compact', label: 'Freeing up unused space',         status: 'pending', note: '' },
  ];
}

export function formatStorageEstimate(usage: number, quota: number): { info: string; percent: number } {
  return {
    info: `${(usage / 1048576).toFixed(1)} MB used / ${(quota / 1048576).toFixed(0)} MB quota`,
    percent: quota > 0 ? usage / quota : 0,
  };
}

// The blob-URL + <a download> trick below is a no-op inside a
// Capacitor Android WebView — there's no
// browser download manager to hand it to. On native, write the file to
// app storage via @capacitor/filesystem and hand it to the OS share
// sheet via @capacitor/share instead, so the user picks where it ends
// up (Files, Drive, email, etc.) same as any other Android share flow.
export async function downloadBlob(content: string, mime: string, filename: string) {
  if (window.Capacitor?.isNativePlatform?.()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const written = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: written.uri });
    return;
  }
  // Same gap as Android's WebView: Tauri's embedded WebView2 has no
  // download manager for the blob-URL + <a download> trick either. A
  // native "Save As" dialog + a real file write is the desktop
  // equivalent of the Filesystem+Share path above.
  if (isTauriCheck()) {
    // defaultPath must be an absolute path (Documents + name): a bare
    // filename doesn't reliably pre-fill the dialog's filename field,
    // since the plugin only populates it for a path resolvable as
    // "some directory + a name". `filters` pre-selects the right
    // extension so the user doesn't have to type it.
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const { documentDir, join } = await import('@tauri-apps/api/path');
    const ext = filename.split('.').pop() ?? 'txt';
    const defaultPath = await join(await documentDir(), filename).catch(() => filename);
    const path = await save({
      defaultPath,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (!path) return; // user cancelled the dialog
    await writeTextFile(path, content);
    return;
  }
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
