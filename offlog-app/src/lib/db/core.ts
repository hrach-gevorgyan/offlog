// PouchDB core is loaded as a UMD global via index.html <script src="/pouchdb.js">.
// That bundle is core-only: pouchdb-find must be registered as a plugin on the
// global constructor, or createIndex() no-ops and find() throws.
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import PouchDBFind from 'pouchdb-find';
import { getDeviceName, getDeviceId } from '../../config';
import type { TaskDoc, Source } from '../types';

// Shared substrate for the db/ modules: the PouchDB instance, indexes, the
// task cache, small helpers, the changelog, the per-task write queue and the
// live change feed. Imports nothing from its siblings, so the dependency
// order stays core <- entities <- {sync, tags, stats, maintenance}.
// Several members below are exported only so the sibling modules can reach
// them; ../db.ts's barrel deliberately does not re-export those, keeping the
// public surface of './db' exactly what it was before the split.

PouchDB.plugin(PouchDBFind);

// Read once per module load, not per write: renaming a device triggers a
// location.reload(), so a fresh value is picked up then.
export const SOURCE: Source = getDeviceName();
const SOURCE_ID: string = getDeviceId();
// auto_compaction discards superseded revision bodies as soon as a new
// revision lands. Without it PouchDB keeps every historical revision
// forever, and deleting a 10MB attachment frees zero disk space because the
// previous revision still references the blob. Local-only: it does not
// affect the sync remote's history, so replication semantics are unchanged.
// It only applies going forward — clearing already-accumulated revisions on
// an existing database is the manual Settings → Maintenance compaction.
export const db = new PouchDB('offlog', { auto_compaction: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
// Mango indexes for pouchdb-find. getTasksForProject is the hottest path in
// the app (runs on every project switch and every reload), so it queries
// through this index instead of scanning every task doc and filtering in JS.
let _indexesReady: Promise<void> | null = null;
export function initIndexes(): Promise<void> {
  if (_indexesReady) return _indexesReady;
  _indexesReady = (async () => {
    try {
      // `ddoc` names the design doc the index lives in -- a real pouchdb-find
      // option missing from @types/pouchdb-find's CreateIndexOptions, hence
      // the cast. Don't drop it: without an explicit ddoc each index gets its
      // own generated design doc, slower to query and churnier on replication.
      await db.createIndex({ index: { fields: ['type', 'project_id'] }, ddoc: 'idx-type-project' } as PouchDB.Find.CreateIndexOptions);
      await db.createIndex({ index: { fields: ['type', 'ref'] }, ddoc: 'idx-type-ref' } as PouchDB.Find.CreateIndexOptions);
    } catch {
      // Index creation failing (e.g. unsupported adapter) shouldn't break
      // the app — queries fall back to their allDocs equivalents, just slower.
    }
  })();
  return _indexesReady;
}

// ── In-memory task cache ──────────────────────────────────────────────────────
// Cross-cutting reads (search, agenda, dashboard, tags) all need every task
// in the database, not just one project's — an index can't reduce that to
// less than a full scan. Caching the full task list avoids re-reading and
// re-parsing every task doc from IndexedDB on every keystroke/search/reload.
// Invalidated centrally in subscribe() below, the single point through which
// every local write and every incoming sync change already flows.
let _taskCache: TaskDoc[] | null = null;

export async function getAllTasksRaw(): Promise<TaskDoc[]> {
  if (_taskCache) return _taskCache;
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  _taskCache = r.rows.map(r => r.doc!);
  return _taskCache;
}

export function invalidateTaskCache(): void { _taskCache = null; }

// ── Helpers ───────────────────────────────────────────────────────────────────

export function now() { return new Date().toISOString(); }
export function nanoid(len = 8) { return Math.random().toString(36).slice(2, 2 + len); }

// localDateStr lives in utils.ts to avoid a circular import. It is the
// local-calendar-date convention due_date is stored in everywhere.

export function posBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024;
  if (before === null) return (after as number) / 2;
  if (after === null) return before + 1024;
  return (before + after) / 2;
}

// Shared by KanbanBoard.svelte's HTML5-drag and touch-drag paths, which both
// need the same neighbor selection to decide where a dropped card lands.
// Kept a pure function so it's testable without simulating drag events.
export function computeDropPosition(colTasks: { position: number }[], dragOverIndex: number | null): number {
  if (dragOverIndex === null) {
    const last = colTasks.at(-1);
    return last ? last.position + 1024 : 1024;
  }
  const before = dragOverIndex > 0 ? colTasks[dragOverIndex - 1]?.position ?? null : null;
  const after = colTasks[dragOverIndex]?.position ?? null;
  return posBetween(before, after);
}


// The starter columns a fresh install seeds with. Shared: entities.ts seeds
// them, sync.ts's pristine-default check compares against them, and
// maintenance.ts falls back to them for an imported project with no columns.
export const DEFAULT_COLS = [
  { id: 'col:idea',      name: 'Idea' },
  { id: 'col:task',      name: 'Task' },
  { id: 'col:inprocess', name: 'In Process' },
  { id: 'col:completed', name: 'Completed' },
];

// ── Changelog ─────────────────────────────────────────────────────────────────

export type LogAction = 'create' | 'update' | 'move' | 'delete';

// The changelog doc every mutation writes. The index signature is the
// per-call-site `meta` (task_title, project_name, space_name, ...): the keys
// vary by mutation type and are read back only for display.
export interface LogDoc {
  _id: string;
  _rev?: string;
  type: 'log';
  ts: string;
  source: Source;
  source_id?: string;
  ref: string;
  action: LogAction;
  field?: string;
  from?: unknown;
  to?: unknown;
  [meta: string]: any;
}

export async function logChange(
  ref: string,
  action: LogAction,
  field?: string,
  from?: unknown,
  to?: unknown,
  meta?: Record<string, unknown>,
) {
  const ts = now();
  await db.put({
    _id: `log:${ts}-${nanoid(8)}`,
    type: 'log', ts, source: SOURCE, source_id: SOURCE_ID, ref, action,
    ...(field !== undefined ? { field, from: from ?? null, to: to ?? null } : {}),
    ...(meta ?? {}),
  });
}

export async function getRecentLogs(limit = 80): Promise<LogDoc[]> {
  const r = await db.allDocs<LogDoc>({ startkey: 'log:￰', endkey: 'log:', descending: true, limit, include_docs: true });
  return r.rows.map(r => r.doc!);
}

// Per-device last-seen list for Settings. Scans a bounded window of the most
// recent changelog entries rather than every log ever. Descending order means
// the first entry seen for a given source is already its most recent.
export async function getDeviceLastSeen(): Promise<{ device: string; lastSeen: string }[]> {
  const r = await db.allDocs<LogDoc>({ startkey: 'log:￰', endkey: 'log:', descending: true, limit: 500, include_docs: true });
  // Group by the stable source_id where present, so a rename doesn't split one
  // device into two rows. Older log entries have no source_id and fall back to
  // grouping by the literal source string.
  const seen = new Map<string, string>();
  const names = new Map<string, string>();
  for (const row of r.rows) {
    const doc = row.doc;
    if (!doc?.source) continue;
    const key = doc.source_id ?? doc.source;
    if (seen.has(key)) continue;
    seen.set(key, doc.ts);
    names.set(key, doc.source);
  }
  return [...seen.entries()]
    .map(([key, lastSeen]) => ({ device: names.get(key)!, lastSeen }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export async function getLogsForTask(taskId: string): Promise<LogDoc[]> {
  await initIndexes();
  try {
    // idx-type-ref lets this skip scanning every log doc in the database —
    // matters once the changelog has accumulated thousands of entries.
    const r = await db.find({
      selector: { type: 'log', ref: taskId },
      use_index: 'idx-type-ref',
      limit: 100000,
    });
    return (r.docs as LogDoc[]).sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));
  } catch {
    const r = await db.allDocs<LogDoc>({ startkey: 'log:￰', endkey: 'log:', descending: true, include_docs: true });
    return r.rows.map(r => r.doc!).filter(d => d.ref === taskId);
  }
}


// Serializes concurrent updateTask() calls on the same doc id. Without this,
// two overlapping get-then-put calls (e.g. notifications.ts's fire-and-forget
// reminder_at clear racing a real edit) both read the same starting rev and
// one fails with "Document update conflict". Chaining onto the previous
// call's promise (success or failure) makes every writer see the previous
// writer's result before its own get(), whether or not callers await.
const _taskWriteQueues = new Map<string, Promise<unknown>>();

// Shared by updateTask() and the attachment writers below -- they do their own
// get-then-put on the same doc and need identical per-id serialization, or
// attaching two files back-to-back races the same way.
export function queueTaskWrite<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = _taskWriteQueues.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const settled = run.catch(() => {});
  _taskWriteQueues.set(id, settled);
  // Drop the entry once nothing else has chained onto it. Without this the map
  // retains one resolved-promise entry per task id ever written for the life of
  // the process -- the desktop app stays tray-resident for weeks.
  settled.then(() => {
    if (_taskWriteQueues.get(id) === settled) _taskWriteQueues.delete(id);
  });
  return run;
}

// ── Live query ────────────────────────────────────────────────────────────────

// The live feed is the app's only signal that anything changed elsewhere --
// an incoming sync, or a write made from another view. The error handler and
// restart are required, not optional: if the feed dies (IndexedDB dropped
// across a sleep/resume, a quota error, a WebView renderer hiccup) the app
// goes silently deaf, still running and looking fine but never seeing another
// sync until the process restarts — and the desktop app stays tray-resident
// across weeks of sleep cycles.
//
// The rebuilt feed uses `since: 'now'`, so changes that landed during the gap
// are never delivered -- hence callback() fires on every successful restart to
// force a full reload rather than resuming from a hole.
const CHANGE_FEED_RETRY_MS = 2000;

export function subscribe(callback: () => void): () => void {
  let cancelled = false;
  let handler: PouchDB.Core.Changes<{}> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const attach = (isRestart: boolean) => {
    if (cancelled) return;
    handler = db.changes({ since: 'now', live: true })
      .on('change', () => {
        invalidateTaskCache();
        callback();
      })
      .on('error', (err: unknown) => {
        console.warn('change feed died, restarting', err);
        try { handler?.cancel(); } catch { /* already dead */ }
        handler = null;
        retryTimer = setTimeout(() => attach(true), CHANGE_FEED_RETRY_MS);
      });
    // Anything that changed while the feed was down was never delivered.
    if (isRestart) { invalidateTaskCache(); callback(); }
  };

  attach(false);

  return () => {
    cancelled = true;
    clearTimeout(retryTimer);
    try { handler?.cancel(); } catch { /* already cancelled */ }
  };
}
