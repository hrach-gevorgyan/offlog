// B62 — automatic local backup. The manual Backup/Restore flow
// (SettingsPanel.svelte's doBackup()) is a real safety net, but manual
// backups only happen after someone remembers to make one -- usually
// right after a disaster, not before. This runs silently on app start,
// at most once a day, writing a rotating set of JSON snapshots to the
// app's own private storage (no permission prompt, no user interaction)
// so a corrupted/wiped local database has a recent recovery point
// without anyone having to think about it.
//
// Native (Capacitor) and Tauri only -- deliberately a no-op on plain
// web, which has no reliable silent local-file API and is a dev/test
// surface anyway (see README's "Which build is 'the app'" section).
import { isTauri, isNativePlatform } from '../config';

const ENABLED_KEY = 'offlog_auto_backup_enabled';
const LAST_RUN_KEY = 'offlog_auto_backup_last_run';
const KEEP_COUNT = 7; // one a day, roughly a week of recovery points
const DUE_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~20h, not exactly 24 -- an
// app opened at a slightly earlier time each day should still trigger,
// rather than drifting later and later against a hard 24h boundary.

export function isAutoBackupEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== 'false'; // on by default -- pure safety net, no downside
}

export function setAutoBackupEnabled(on: boolean): void {
  localStorage.setItem(ENABLED_KEY, String(on));
}

export function getLastAutoBackupAt(): string | null {
  return localStorage.getItem(LAST_RUN_KEY);
}

// Exported for tests -- pure, no I/O.
export function isBackupDue(lastRunIso: string | null, now: Date): boolean {
  if (!lastRunIso) return true;
  const last = new Date(lastRunIso).getTime();
  if (Number.isNaN(last)) return true; // corrupted value -- treat as never run, don't get stuck
  return now.getTime() - last >= DUE_INTERVAL_MS;
}

// Exported for tests -- pure, no I/O. Given filenames already known to
// match this module's own naming pattern, returns which to delete to
// keep only the newest `keep`. Sorting by filename works because the
// date is embedded in ISO order (offlog-autobackup-2026-07-23T...json).
export function filesToDelete(filenames: string[], keep: number): string[] {
  const sorted = [...filenames].sort(); // ascending -- oldest first
  const excess = sorted.length - keep;
  return excess > 0 ? sorted.slice(0, excess) : [];
}

function backupFilename(now: Date): string {
  return `offlog-autobackup-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

async function collectBackupJson(): Promise<string> {
  const PouchDBCtor = (window as any).PouchDB;
  const db = new PouchDBCtor('offlog');
  const all = await db.allDocs({ include_docs: true });
  const docs = all.rows.map((r: any) => r.doc).filter((d: any) => !d._id.startsWith('_'));
  return JSON.stringify(docs, null, 2);
}

async function runNative(json: string, now: Date): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const dir = Directory.Data; // app-private, persists across updates, no permission prompt
  const folder = 'auto-backups';
  await Filesystem.mkdir({ path: folder, directory: dir, recursive: true }).catch(() => {}); // already exists is fine
  await Filesystem.writeFile({
    path: `${folder}/${backupFilename(now)}`,
    data: json,
    directory: dir,
    encoding: Encoding.UTF8,
  });
  const listing = await Filesystem.readdir({ path: folder, directory: dir });
  const toDelete = filesToDelete(listing.files.map(f => f.name), KEEP_COUNT);
  for (const name of toDelete) {
    await Filesystem.deleteFile({ path: `${folder}/${name}`, directory: dir }).catch(() => {});
  }
}

async function runTauri(json: string, now: Date): Promise<void> {
  const { writeTextFile, mkdir, readDir, remove, exists } = await import('@tauri-apps/plugin-fs');
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const base = await join(await appDataDir(), 'auto-backups');
  if (!(await exists(base))) await mkdir(base, { recursive: true });
  await writeTextFile(await join(base, backupFilename(now)), json);
  const entries = await readDir(base);
  const toDelete = filesToDelete(entries.map(e => e.name!).filter(Boolean), KEEP_COUNT);
  for (const name of toDelete) {
    await remove(await join(base, name)).catch(() => {});
  }
}

// Called once from store.ts's init(), fire-and-forget (same pattern as
// maybePruneOldLogs()/maybePruneOldDeletedTasks() alongside it) -- a
// backup running a moment late, or failing silently on one launch, is
// not worth blocking app startup over.
export async function runAutoBackupIfDue(): Promise<void> {
  if (!isAutoBackupEnabled()) return;
  if (!isNativePlatform() && !isTauri()) return;
  const now = new Date();
  if (!isBackupDue(getLastAutoBackupAt(), now)) return;
  try {
    const json = await collectBackupJson();
    if (isNativePlatform()) await runNative(json, now);
    else if (isTauri()) await runTauri(json, now);
    localStorage.setItem(LAST_RUN_KEY, now.toISOString());
  } catch (err) {
    console.warn('autoBackup: failed, will retry next launch', err);
  }
}
