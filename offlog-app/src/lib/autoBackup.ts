// Automatic local backup, complementing the manual Backup/Restore flow in
// SettingsPanel.svelte. Runs silently at most once a day,
// writing a rotating set of JSON snapshots to the app's own private storage
// (no permission prompt, no user interaction), so a corrupted or wiped local
// database has a recent recovery point without anyone having to think of it.
//
// Native (Capacitor) and Tauri only -- deliberately a no-op on plain web,
// which has no reliable silent local-file API and is a dev/test surface.
import { isTauri, isNativePlatform, invokeTauri } from '../config';

// The Windows app's copies, in its app-data folder. A debug build shares that
// folder with the installed app (same identifier), and the newest-7 rotation
// would push the user's real copies out, so it keeps its own.
let tauriFolder: Promise<string> | null = null;
async function tauriBackupDir(): Promise<string> {
  tauriFolder ??= invokeTauri<boolean>('is_debug_build').then(d => (d ? 'auto-backups-dev' : 'auto-backups'), () => 'auto-backups');
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  return join(await appDataDir(), await tauriFolder);
}

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
  // A stamp in the future (the clock was once set ahead) is due now, not once
  // real time catches up with it.
  const elapsed = now.getTime() - last;
  return elapsed < 0 || elapsed >= DUE_INTERVAL_MS;
}

// Exported for tests -- pure, no I/O. Given filenames already known to
// match this module's own naming pattern, returns which to delete to
// keep only the newest `keep`. Sorting by filename works because the
// date is embedded in ISO order (offlog-autobackup-2026-07-23T...json).
// A file dated after tomorrow was written while the clock ran ahead; it
// sorts as oldest, or it would outrank every real backup and never rotate.
export function filesToDelete(filenames: string[], keep: number, now = new Date()): string[] {
  const limit = new Date(now.getTime() + 864e5).toISOString().slice(0, 10);
  const future = (n: string) => n.slice('offlog-autobackup-'.length, 'offlog-autobackup-'.length + 10) > limit;
  const sorted = [...filenames].sort((a, b) => Number(future(b)) - Number(future(a)) || (a < b ? -1 : a > b ? 1 : 0));
  const excess = sorted.length - keep;
  return excess > 0 ? sorted.slice(0, excess) : [];
}

function backupFilename(now: Date): string {
  return `offlog-autobackup-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

async function collectBackupJson(): Promise<string> {
  const PouchDBCtor = window.PouchDB;
  // PouchDB keeps every instance until close(), and a tray session runs this
  // once a day for weeks.
  const db = new PouchDBCtor('offlog');
  try {
    // `attachments: true, binary: false` inlines each attachment as base64
    // `data` instead of a `{stub: true}` placeholder. Without it, a backup
    // containing any attachment doesn't merely lose the file -- restoring it
    // fails *entirely*, because PouchDB rejects a whole bulkDocs batch with
    // `missing_stub` when a stub has no matching blob, taking every
    // space/project/task in the file down with it.
    const all = await db.allDocs({ include_docs: true, attachments: true, binary: false });
    // A row can carry no doc (a deletion tombstone); reading _id off it
    // would throw mid-backup.
    const docs = all.rows.map(r => r.doc).filter(d => !!d && !d._id.startsWith('_'));
    return JSON.stringify(docs, null, 2);
  } finally {
    await db.close().catch(() => {});
  }
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
  const { join } = await import('@tauri-apps/api/path');
  const base = await tauriBackupDir();
  if (!(await exists(base))) await mkdir(base, { recursive: true });
  await writeTextFile(await join(base, backupFilename(now)), json);
  const entries = await readDir(base);
  const toDelete = filesToDelete(entries.map(e => e.name!).filter(Boolean), KEEP_COUNT);
  for (const name of toDelete) {
    await remove(await join(base, name)).catch(() => {});
  }
}

// Called from store.ts's periodic housekeeping (and once at init),
// fire-and-forget. It must NOT be tied to app start alone: the desktop app
// is tray-resident, so a session can last weeks and "next launch" may never
// come -- backups would silently stop while still reporting a recent
// timestamp. The isBackupDue() check above makes calling it often cheap.
// A failed run is retried after this long, not at the next hourly
// housekeeping: each attempt reads the whole database with attachments
// inlined, and a disk that's full now will usually still be full in an hour.
const RETRY_AFTER_FAILURE_MS = 6 * 60 * 60 * 1000;
let failedAt = 0;

export async function runAutoBackupIfDue(): Promise<void> {
  if (!isAutoBackupEnabled()) return;
  if (!isNativePlatform() && !isTauri()) return;
  const now = new Date();
  if (!isBackupDue(getLastAutoBackupAt(), now)) return;
  if (failedAt && now.getTime() - failedAt >= 0 && now.getTime() - failedAt < RETRY_AFTER_FAILURE_MS) return;
  try {
    const json = await collectBackupJson();
    if (isNativePlatform()) await runNative(json, now);
    else if (isTauri()) await runTauri(json, now);
    localStorage.setItem(LAST_RUN_KEY, now.toISOString());
    failedAt = 0;
  } catch (err) {
    failedAt = now.getTime();
    console.warn('autoBackup: failed, will retry in a few hours', err);
  }
}

// What the kept backups occupy on disk. They live OUTSIDE IndexedDB -- app
// storage on Android, appDataDir() on desktop -- so navigator.storage's
// estimate, which is what Settings' storage headline reads, does not count
// them at all. Attachments are inlined in every copy, so a workspace with a
// few photos turns into several times that across the seven kept files while
// the headline still reports the database alone.
//
// Returns null where there is nothing to measure (web, or the folder does not
// exist yet) so the UI can stay silent rather than print a confident zero.
export async function getAutoBackupUsage(): Promise<{ count: number; bytes: number } | null> {
  try {
    if (isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const listing = await Filesystem.readdir({ path: 'auto-backups', directory: Directory.Data });
      const files = listing.files.filter(f => f.type === 'file');
      return { count: files.length, bytes: files.reduce((sum, f) => sum + (f.size ?? 0), 0) };
    }
    if (isTauri()) {
      const { readDir, stat, exists } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');
      const base = await tauriBackupDir();
      if (!(await exists(base))) return null;
      const entries = await readDir(base);
      let bytes = 0, count = 0;
      for (const e of entries) {
        if (!e.name) continue;
        try { bytes += (await stat(await join(base, e.name))).size ?? 0; count++; } catch { /* vanished mid-scan */ }
      }
      return { count, bytes };
    }
  } catch { /* folder missing or unreadable -- nothing to report */ }
  return null;
}

export interface AutoBackupFile { name: string; at: string; bytes: number }

// The copy's own name, never a path: anything else is refused before it can
// reach the file system.
const NAME = /^offlog-autobackup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;
// The moment a copy was written, read back out of its name.
export function autoBackupTime(name: string): string | null {
  const m = NAME.exec(name);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
}

// The kept copies, newest first. Empty where there are none, or none can be read.
export async function listAutoBackups(): Promise<AutoBackupFile[]> {
  const out: AutoBackupFile[] = [];
  try {
    if (isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const listing = await Filesystem.readdir({ path: 'auto-backups', directory: Directory.Data });
      for (const f of listing.files) {
        const at = f.type === 'file' ? autoBackupTime(f.name) : null;
        if (at) out.push({ name: f.name, at, bytes: f.size ?? 0 });
      }
    } else if (isTauri()) {
      const { readDir, stat, exists } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');
      const base = await tauriBackupDir();
      if (!(await exists(base))) return [];
      for (const e of await readDir(base)) {
        const at = e.name ? autoBackupTime(e.name) : null;
        if (!at) continue;
        let bytes = 0;
        try { bytes = (await stat(await join(base, e.name!))).size ?? 0; } catch { continue; /* vanished mid-scan */ }
        out.push({ name: e.name!, at, bytes });
      }
    }
  } catch { return []; }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// A kept copy's text, for the same preview and restore as a picked file.
export async function readAutoBackup(name: string): Promise<string> {
  if (!autoBackupTime(name)) throw new Error('not an automatic backup');
  if (isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const r = await Filesystem.readFile({ path: `auto-backups/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  }
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');
  return readTextFile(await join(await tauriBackupDir(), name));
}
