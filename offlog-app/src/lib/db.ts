// PouchDB core is loaded as a UMD global via index.html <script src="/pouchdb.js">
// — that bundle is core-only and does NOT include pouchdb-find (createIndex/
// find), despite pouchdb-find being a project dependency and its types being
// referenced. Register it as a real plugin against the global constructor;
// without this, db.createIndex()/db.find() below would silently do nothing
// useful (createIndex no-ops, find() throws) since the methods don't exist.
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import PouchDBFind from 'pouchdb-find';
import { getSyncUrl, getSyncCredentials, getDeviceName, getDeviceId, isSyncEnabled } from '../config';
import type { SpaceDoc, ProjectDoc, TaskDoc, Column, Source, CustomFieldDef } from './types';

(PouchDB as any).plugin(PouchDBFind);

// B22: was a fixed platform-detected 'pc'/'mobile' — now the user-editable
// per-device name (see config.ts). Read once per module load rather than
// on every write — renaming a device via Settings triggers the same
// location.reload() the sync-URL field already does, so a fresh SOURCE is
// picked up on next load rather than needing this to be reactive.
const SOURCE: Source = getDeviceName();
const SOURCE_ID: string = getDeviceId();
const db = new PouchDB('offlog');

// ── Indexes ───────────────────────────────────────────────────────────────────
// Mango indexes for pouchdb-find. getTasksForProject is the hottest path in
// the app (runs on every project switch and every reload), so it queries
// through this index instead of scanning every task doc and filtering in JS.
let _indexesReady: Promise<void> | null = null;
export function initIndexes(): Promise<void> {
  if (_indexesReady) return _indexesReady;
  _indexesReady = (async () => {
    try {
      await db.createIndex({ index: { fields: ['type', 'project_id'] }, ddoc: 'idx-type-project' });
      await db.createIndex({ index: { fields: ['type', 'ref'] }, ddoc: 'idx-type-ref' });
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

async function getAllTasksRaw(): Promise<TaskDoc[]> {
  if (_taskCache) return _taskCache;
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  _taskCache = r.rows.map(r => r.doc!);
  return _taskCache;
}

export function invalidateTaskCache(): void { _taskCache = null; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString(); }
function nanoid(len = 8) { return Math.random().toString(36).slice(2, 2 + len); }

export function posBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024;
  if (before === null) return (after as number) / 2;
  if (after === null) return before + 1024;
  return (before + after) / 2;
}

function remote() {
  const { user, pass } = getSyncCredentials();
  return new PouchDB(getSyncUrl(), { auth: { username: user, password: pass } });
}

// ── Changelog ─────────────────────────────────────────────────────────────────

type LogAction = 'create' | 'update' | 'move' | 'delete';

async function logChange(
  ref: string,
  action: LogAction,
  field?: string,
  from?: any,
  to?: any,
  meta?: Record<string, any>,
) {
  const ts = now();
  await db.put({
    _id: `log:${ts}-${nanoid(8)}`,
    type: 'log', ts, source: SOURCE, source_id: SOURCE_ID, ref, action,
    ...(field !== undefined ? { field, from: from ?? null, to: to ?? null } : {}),
    ...(meta ?? {}),
  });
}

export async function getRecentLogs(limit = 80): Promise<any[]> {
  const r = await db.allDocs({ startkey: 'log:￰', endkey: 'log:', descending: true, limit, include_docs: true });
  return r.rows.map(r => r.doc!);
}

// B5: per-device last-seen list for Settings — scans a bounded window of
// the most recent changelog entries (same range-scan-by-`log:`-prefix
// pattern as getRecentLogs) rather than every log ever, same "cheap at
// the scale of a personal task manager" reasoning used elsewhere in this
// file. Descending order means the first entry seen for a given source
// is already its most recent.
export async function getDeviceLastSeen(): Promise<{ device: string; lastSeen: string }[]> {
  const r = await db.allDocs({ startkey: 'log:￰', endkey: 'log:', descending: true, limit: 500, include_docs: true });
  // B39: group by the stable source_id where present (so a rename doesn't
  // split one device into two rows) — log entries written before this
  // field existed have no source_id, so they fall back to grouping by the
  // literal source string, same as before.
  const seen = new Map<string, string>();
  const names = new Map<string, string>();
  for (const row of r.rows) {
    const doc: any = row.doc;
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

export async function getLogsForTask(taskId: string): Promise<any[]> {
  await initIndexes();
  try {
    // idx-type-ref lets this skip scanning every log doc in the database —
    // matters once the changelog has accumulated thousands of entries.
    const r = await db.find({
      selector: { type: 'log', ref: taskId },
      use_index: 'idx-type-ref',
      limit: 100000,
    });
    return (r.docs as any[]).sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));
  } catch {
    const r = await db.allDocs({ startkey: 'log:￰', endkey: 'log:', descending: true, include_docs: true });
    return r.rows.map(r => r.doc!).filter((d: any) => d.ref === taskId);
  }
}

// ── Log retention ────────────────────────────────────────────────────────────
// log: docs are append-only and never pruned by any other code path, so the
// changelog grows forever. getRecentLogs() is capped at 80 for display, but
// getLogsForTask() and checkIntegrity() (via allDocs) still scan the full
// set — bounding total growth is cheaper than trying to optimize every future
// query against an unbounded table.

const LOG_RETENTION_MONTHS = 6;
const LOG_PRUNE_KEY = 'offlog_logs_pruned_at';
const LOG_PRUNE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // at most once a week

export async function pruneOldLogs(): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - LOG_RETENTION_MONTHS);
  const cutoffIso = cutoff.toISOString();
  const r = await db.allDocs({ startkey: 'log:', endkey: 'log:￰', include_docs: true });
  const stale = r.rows.map(row => row.doc!).filter((d: any) => d.ts && d.ts < cutoffIso);
  if (stale.length) await db.bulkDocs(stale.map((d: any) => ({ ...d, _deleted: true })));
  return stale.length;
}

// Fire-and-forget, rate-limited so it doesn't re-scan the whole log table on
// every single app launch — called once from store.ts's init().
export function maybePruneOldLogs(): void {
  const last = Number(localStorage.getItem(LOG_PRUNE_KEY) ?? 0);
  if (Date.now() - last < LOG_PRUNE_INTERVAL_MS) return;
  localStorage.setItem(LOG_PRUNE_KEY, String(Date.now()));
  pruneOldLogs().catch(() => {});
}

// ── Deleted-task retention ──────────────────────────────────────────────────
// Soft-deleted tasks (deleted: true) are never hard-removed by any other
// code path either — the same unbounded-growth problem as logs above, just
// for a different doc type. The "Recently Deleted" list in Settings is
// already capped to the last 10 by getRecentlyDeleted(), so nothing older
// than that is ever reachable for undo anyway; a shorter retention window
// than logs (which are a genuine historical record worth keeping longer) is
// safe here — 3 months is well past the point anyone would still want undo.

const TASK_RETENTION_MONTHS = 3;
const TASK_PRUNE_KEY = 'offlog_deleted_tasks_pruned_at';

export async function pruneOldDeletedTasks(): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - TASK_RETENTION_MONTHS);
  const cutoffIso = cutoff.toISOString();
  const all = await getAllTasksRaw();
  const stale = all.filter(d => d.deleted && d.updated_at && d.updated_at < cutoffIso);
  if (stale.length) {
    await db.bulkDocs(stale.map(d => ({ ...d, _deleted: true })));
    invalidateTaskCache();
  }
  return stale.length;
}

// Fire-and-forget, rate-limited the same way as maybePruneOldLogs — called
// alongside it from store.ts's init().
export function maybePruneOldDeletedTasks(): void {
  const last = Number(localStorage.getItem(TASK_PRUNE_KEY) ?? 0);
  if (Date.now() - last < LOG_PRUNE_INTERVAL_MS) return;
  localStorage.setItem(TASK_PRUNE_KEY, String(Date.now()));
  pruneOldDeletedTasks().catch(() => {});
}

// ── Storage breakdown ────────────────────────────────────────────────────────
// navigator.storage.estimate() (used by the existing "X MB used" line in
// Settings) reports total browser storage for the origin — it can't say
// *what* is taking up that space. This gives an actual doc-count breakdown
// so "how much data am I keeping" has a concrete, actionable answer, and so
// the retention policies above have something visible to point at.

export interface StorageBreakdown {
  activeTasks: number;
  archivedTasks: number;
  deletedTasks: number;
  logEntries: number;
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const all = await getAllTasksRaw();
  let activeTasks = 0, archivedTasks = 0, deletedTasks = 0;
  for (const d of all) {
    if (d.deleted) deletedTasks++;
    else if (d.archived) archivedTasks++;
    else activeTasks++;
  }
  const logRows = await db.allDocs({ startkey: 'log:', endkey: 'log:￰' });
  return { activeTasks, archivedTasks, deletedTasks, logEntries: logRows.rows.length };
}

export async function getDashboardData() {
  const [allProjects, allSpaces] = await Promise.all([getProjects(), getSpaces()]);
  const all = await getAllTasksRaw();
  const tasks = all.filter(d => !d.deleted && !d.archived);
  const today = new Date().toISOString().slice(0, 10);

  const byProject: Record<string, { total: number; pinned: number; overdue: number; lastColId: string }> = {};
  for (const p of allProjects) {
    byProject[p._id] = { total: 0, pinned: 0, overdue: 0, lastColId: p.columns.at(-1)?.id ?? '' };
  }
  for (const t of tasks) {
    if (!byProject[t.project_id]) continue;
    byProject[t.project_id].total++;
    if (t.pinned) byProject[t.project_id].pinned++;
    if (t.due_date && t.due_date < today && t.column_id !== byProject[t.project_id].lastColId) byProject[t.project_id].overdue++;
  }

  const pinnedTasks = tasks.filter(t => t.pinned).slice(0, 10);
  const overdueTasks = tasks
    .filter(t => t.due_date && t.due_date < today && t.column_id !== byProject[t.project_id]?.lastColId)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 10);
  const todayTasks = tasks
    .filter(t => t.due_date === today && t.column_id !== byProject[t.project_id]?.lastColId)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);
  const projCache: Record<string, string> = Object.fromEntries(allProjects.map(p => [p._id, p.name]));

  // B17 — "completed in the last week" for the Dashboard summary strip.
  // No completed_at field exists; reusing updated_at + the same positional
  // "done = last column" check already used above is simpler and more
  // reliable than reconstructing it from log docs, since move-action logs
  // only store the target column's *name* (not its id) — fragile against
  // renames. Caveat worth noting: updated_at bumps on any edit, so a task
  // completed earlier but merely edited within the window would
  // false-positive here — acceptable for a glance-level dashboard stat.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const completedByProject: Record<string, number> = {};
  for (const t of tasks) {
    const lastColId = byProject[t.project_id]?.lastColId;
    if (lastColId && t.column_id === lastColId && t.updated_at >= sevenDaysAgo) {
      completedByProject[t.project_id] = (completedByProject[t.project_id] ?? 0) + 1;
    }
  }
  let busiestProjectId = '';
  let completedLast7Days = 0;
  for (const [pid, count] of Object.entries(completedByProject)) {
    completedLast7Days += count;
    if (count > (completedByProject[busiestProjectId] ?? 0)) busiestProjectId = pid;
  }
  const busiestProjectName = busiestProjectId ? (projCache[busiestProjectId] ?? null) : null;

  return {
    allProjects, allSpaces, byProject, pinnedTasks, overdueTasks, todayTasks, projCache,
    totalTasks: tasks.length, completedLast7Days, busiestProjectName,
  };
}

export async function searchAllTasks(query: string): Promise<(TaskDoc & { project_name: string; space_id: string })[]> {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  const all = await getAllTasksRaw();
  const tasks = all.filter(d =>
    !d.deleted && !d.archived &&
    (d.title.toLowerCase().includes(q) || d.tags?.some((t: string) => t.includes(q)) || d.body?.toLowerCase().includes(q))
  );
  const allProjects = await getProjects();
  const projCache: Record<string, ProjectDoc> = Object.fromEntries(allProjects.map(p => [p._id, p]));
  return tasks.map(t => ({ ...t, project_name: projCache[t.project_id]?.name ?? '—' }));
}

export async function clearLogs(): Promise<void> {
  const r = await db.allDocs({ startkey: 'log:', endkey: 'log:￰', include_docs: true });
  const dels = r.rows.map(row => ({ ...row.doc!, _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
}

// ── Sync ──────────────────────────────────────────────────────────────────────

let _syncHandler: any = null;

// Exported for tests/sync.test.ts (A16) — pure classification, no I/O, and
// exactly the logic that decides what a flaky/dropped connection actually
// tells the user, so it's worth covering deterministically rather than only
// via a real (slow, network-dependent, sandbox-unreachable) db.sync() call.
export function describeSyncError(err: any): string {
  if (!err) return 'Unknown sync error';
  const status = err.status ?? err.statusCode;
  if (status === 401 || status === 403) return 'Authentication failed — check sync credentials';
  if (status === 404) return 'Sync database not found on server';
  if (status === 0 || err.name === 'TypeError' || /network|failed to fetch/i.test(err.message ?? '')) {
    // Owner-reported confusion (2026-07-06): the sync URL is a LAN IP
    // (see DECISIONS.md — self-hosted CouchDB, no hosted alternative), so
    // "cannot reach it" overwhelmingly means "not on that network right
    // now" — a laptop on a different WiFi, a phone off home WiFi entirely.
    // A device that's never synced before shows an empty/default-seeded
    // app in exactly this situation, easy to mistake for lost data if the
    // message doesn't say why in plain terms.
    return 'Cannot reach sync server — check you\'re on the same network/WiFi it runs on';
  }
  return err.message ?? err.reason ?? String(err);
}

const LAST_SYNC_KEY = 'offlog_last_synced';

export const syncState = {
  status: 'idle' as 'idle' | 'syncing' | 'error' | 'offline',
  lastSynced: localStorage.getItem(LAST_SYNC_KEY),
  error: null as string | null,
  lastErrorAt: null as string | null,
  retryCount: 0,
  conflictCount: 0,
  listeners: new Set<() => void>(),
};

function notify() { syncState.listeners.forEach(fn => fn()); }

function markSynced() {
  const ts = now();
  syncState.status = 'idle';
  syncState.lastSynced = ts;
  syncState.error = null;
  syncState.retryCount = 0;
  localStorage.setItem(LAST_SYNC_KEY, ts);
  scanConflicts();
  notify();
}

function markError(err: any) {
  // A genuine offline state takes priority over whatever sync error
  // surfaced — it's almost certainly just the network being down.
  if (!navigator.onLine) { syncState.status = 'offline'; syncState.error = null; notify(); return; }
  syncState.status = 'error';
  syncState.error = describeSyncError(err);
  syncState.retryCount += 1;
  syncState.lastErrorAt = now();
  notify();
}

// Exported for store.ts's init() — conflict state should be visible from
// a cold start too, not only after the next sync settles (see its own
// call site comment).
export async function scanConflicts(): Promise<number> {
  // PouchDB only ever attaches conflict info to the fetched doc's own
  // _conflicts field, never to row.value — so include_docs is required, and
  // row.doc._conflicts (not row.value.conflicts) is the field to read. A
  // prior version of this function checked row.value.conflicts, which never
  // exists; the conflict count silently stayed at 0 regardless of real
  // conflicts. Caught by tests/db.test.ts's manufactured-conflict test.
  const r = await db.allDocs({ include_docs: true, conflicts: true });
  const count = r.rows.filter((row: any) => row.doc?._conflicts?.length).length;
  syncState.conflictCount = count;
  notify();
  return count;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!isSyncEnabled()) return; // B13 — an explicit pause shouldn't auto-resume on reconnect
    if (syncState.status === 'offline') { syncState.status = 'syncing'; notify(); }
    syncNow().catch(() => {});
  });
  window.addEventListener('offline', () => {
    syncState.status = 'offline'; syncState.error = null; notify();
  });
}

// Both startSync() and syncNow() attach these same handlers to a *single*
// live replication (_syncHandler) — syncNow() used to spin up its own
// separate one-shot db.sync() alongside the already-running live one,
// meaning two concurrent replications hit the same remote at once. Routing
// both through one handler at a time avoids that redundant traffic and any
// risk of the two racing to write the same doc.
//
// A32 (owner-reported, 2026-07-13): status showed "Connected — last synced"
// on both devices while nothing was actually reaching the remote. Root
// cause, traced through PouchDB's own source (node_modules/pouchdb/dist/
// pouchdb.js): db.sync()'s combined Sync object always emits a bare
// 'paused' (no error) whenever EITHER direction pauses — its internal
// pushPaused()/pullPaused() listeners discard whatever argument the
// underlying push/pull sub-replication's own 'paused' event carried. Under
// `retry: true`, a connection failure triggers backOff(), which ALSO emits
// 'paused' (this time *with* the error) on the sub-replication — but that
// error never reaches the combined object, which just sees another bare
// 'paused' and treats it identically to "genuinely caught up." The
// combined object's own 'error' event only fires once the underlying
// replication *promise rejects*, which never happens under `retry: true`
// for an ordinary unreachable-host/timeout — PouchDB just retries forever,
// silently. Net effect: any retryable connectivity failure reported as a
// permanent "synced" success. Fixed by listening to the sub-replications
// directly (handler.push/handler.pull — public instance properties on
// PouchDB's Sync class) to recover the error the combined wrapper drops,
// without giving up `retry: true`'s automatic reconnect behavior.
//
// Exported for tests/sync.test.ts (A16/A32) — takes a fake PouchDB-sync-
// shaped object (chainable `.on(event, cb)`, optionally with `.push`/
// `.pull` sub-objects of the same shape) so this can be verified without a
// real replication (this project has no CI-reachable CouchDB to test a
// genuinely dropped connection against).
export function attachSyncHandlers(handler: any, onSettle?: (err: any) => void) {
  let settled = false;
  const settle = (err: any) => { if (!settled) { settled = true; onSettle?.(err); } };

  let pushErr: any = undefined, pullErr: any = undefined;
  if (handler.push && typeof handler.push.on === 'function') {
    handler.push.on('paused', (err: any) => { pushErr = err ?? undefined; });
    handler.push.on('active', () => { pushErr = undefined; });
  }
  if (handler.pull && typeof handler.pull.on === 'function') {
    handler.pull.on('paused', (err: any) => { pullErr = err ?? undefined; });
    handler.pull.on('active', () => { pullErr = undefined; });
  }

  handler
    .on('change', () => { syncState.status = 'syncing'; notify(); })
    .on('active', () => { syncState.status = 'syncing'; notify(); })
    .on('paused', (err: any) => {
      const real = err ?? pushErr ?? pullErr;
      if (real) markError(real); else markSynced();
      settle(real);
    })
    .on('error', (err: any) => { markError(err); settle(err); });
  return handler;
}

export function startSync() {
  if (_syncHandler) { _syncHandler.cancel(); _syncHandler = null; }
  // B13: an explicit pause takes priority over auto-starting on init —
  // config.ts's isSyncEnabled() defaults to true, so existing installs
  // keep syncing exactly as before until someone opts out in Settings.
  if (!isSyncEnabled()) { syncState.status = 'idle'; notify(); return; }
  // No server configured yet (fresh install, or DEFAULT_SYNC_URL's
  // no-longer-hardcoded fallback) — don't attempt new PouchDB('', ...),
  // which would create a nonsense local database instead of failing
  // loudly. Stay 'idle'; Settings' Sync tab already shows "Not connected
  // to another device yet" for this exact state (B43).
  if (!getSyncUrl()) { syncState.status = 'idle'; notify(); return; }
  if (!navigator.onLine) { syncState.status = 'offline'; notify(); }
  _syncHandler = attachSyncHandlers(db.sync(remote(), { live: true, retry: true }));
}

// B13: the other half of the pause toggle — cancels the live replication
// without touching the configured URL (setSyncUrl('') would drop the
// server config entirely, which "pause for a while" shouldn't do).
export function cancelSync() {
  if (_syncHandler) { _syncHandler.cancel(); _syncHandler = null; }
  syncState.status = 'idle';
  notify();
}

export function syncNow(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Same "nothing configured yet" guard as startSync() — resolve
    // immediately rather than attempting new PouchDB('', ...).
    if (!getSyncUrl()) { syncState.status = 'idle'; notify(); resolve(); return; }
    syncState.status = 'syncing'; notify();
    if (_syncHandler) _syncHandler.cancel();
    _syncHandler = attachSyncHandlers(db.sync(remote(), { live: true, retry: true }), (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// ── Seed ──────────────────────────────────────────────────────────────────────

const DEFAULT_COLS = [
  { id: 'col:idea',      name: 'Idea' },
  { id: 'col:task',      name: 'Task' },
  { id: 'col:inprocess', name: 'In Process' },
  { id: 'col:completed', name: 'Completed' },
];

// Track E's pairing handshake (discovery.ts's pairWithHost()) surfaced a
// real, repeatable bug: seedIfEmpty() below gives every fresh install its
// own space:unsorted/personal/work + project:draft docs, using FIXED,
// not per-install-random, ids. Two devices that each seed independently
// before ever syncing (the exact "PC + phone, sync automatically" flow
// this whole track exists for) are guaranteed to collide on those same 4
// ids the moment they pair — confirmed live: pairing a freshly-seeded
// phone against a freshly-seeded PC produced exactly 4 conflicts, one
// per fixed id. Called from pairWithHost() right before sync starts:
// if this device has never held real content (zero tasks — the seed
// itself never creates any), its pristine seed is safe to discard so the
// upcoming pull just creates the host's versions cleanly instead of
// forking a divergent revision history for the same ids. A device
// that's already in real use is left alone — the zero-tasks check is
// what makes that distinction, not "is this the first pair attempt."
export async function clearLocalSeedBeforeFirstPair(): Promise<void> {
  const tasks = await db.allDocs({ startkey: 'task:', endkey: 'task:￰' });
  if (tasks.rows.length > 0) return;
  for (const id of ['space:unsorted', 'space:personal', 'space:work', 'project:draft']) {
    try {
      const doc = await db.get(id);
      await db.remove(doc);
    } catch {
      // not present locally -- nothing to clear
    }
  }
  invalidateTaskCache();
}

export async function wipeAndReseed(): Promise<void> {
  // Hard-delete every doc
  const all = await db.allDocs({ include_docs: true });
  const dels = all.rows.map(r => ({ ...r.doc!, _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
  invalidateTaskCache();

  // Seed fresh: one space + one project
  await db.put<SpaceDoc>({
    _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280',
    position: 0, updated_at: now(), source: SOURCE,
  });
  await db.put({
    _id: 'project:draft', type: 'project', space_id: 'space:unsorted',
    name: 'Draft', position: 0, columns: DEFAULT_COLS,
    default_view: 'kanban', updated_at: now(), source: SOURCE,
  });
}

const SEEDED_KEY = 'offlog_seeded';

export async function seedIfEmpty() {
  // getSpaces() always runs -- the SEEDED_KEY flag used to skip it entirely
  // once set, which is a real risk if the DB is ever legitimately empty
  // again while the flag survives (a wipe that doesn't also clear
  // localStorage, a corrupted/partial first run, etc.): a stale "already
  // seeded" flag would then leave the app silently empty forever with no
  // obvious way back short of manually creating a space (owner-reported,
  // 2026-07-17, PC first launch). The scan itself is small (4 docs) and
  // only relevant while genuinely empty, so paying for it unconditionally
  // is cheap insurance, not a real cost.
  const existing = await getSpaces();
  if (existing.length > 0) { localStorage.setItem(SEEDED_KEY, '1'); return; }

  // B24: down to 3 — Family dropped from the default seed (owner request;
  // still creatable manually via "+ New space" for anyone who wants it).
  const SPACES = [
    { key: 'unsorted', name: 'Unsorted', color: '#6B7280' },
    { key: 'personal', name: 'Personal', color: '#10B981' },
    { key: 'work',     name: 'Work',     color: '#3B82F6' },
  ];
  for (let i = 0; i < SPACES.length; i++) {
    const { key, name, color } = SPACES[i];
    await db.put<SpaceDoc>({ _id: `space:${key}`, type: 'space', name, color, position: i, updated_at: now(), source: SOURCE });
  }
  // One starter project
  await db.put({
    _id: 'project:draft', type: 'project', space_id: 'space:unsorted',
    name: 'Draft', position: 0, columns: DEFAULT_COLS,
    default_view: 'kanban', updated_at: now(), source: SOURCE,
  });
  localStorage.setItem(SEEDED_KEY, '1');
}

// ── Spaces ────────────────────────────────────────────────────────────────────

export async function getSpaces(): Promise<SpaceDoc[]> {
  const r = await db.allDocs<SpaceDoc>({ startkey: 'space:', endkey: 'space:￰', include_docs: true });
  return r.rows.map(r => r.doc!).sort((a, b) => a.position - b.position);
}

export async function createSpace(name: string, color: string, icon?: string): Promise<SpaceDoc> {
  const existing = await getSpaces();
  const position = existing.length ? Math.max(...existing.map(s => s.position)) + 1 : 0;
  const doc: SpaceDoc = {
    _id: `space:${nanoid()}`, type: 'space', name, color, ...(icon ? { icon } : {}), position,
    updated_at: now(), source: SOURCE,
  };
  await db.put(doc);
  // Spaces had zero changelog coverage at all (create/update/delete) —
  // every other entity type (project, task) logs create+update.
  await logChange(doc._id!, 'create', undefined, undefined, undefined, { space_name: name });
  return doc;
}

export async function updateSpace(id: string, changes: Partial<Pick<SpaceDoc, 'name' | 'color' | 'icon'>>): Promise<SpaceDoc> {
  const doc = await db.get<SpaceDoc>(id);
  const updated = { ...doc, ...changes, updated_at: now(), source: SOURCE };
  await db.put(updated);
  const skip = new Set(['updated_at', 'source']);
  for (const key of Object.keys(changes) as (keyof SpaceDoc)[]) {
    if (skip.has(key)) continue;
    if (JSON.stringify(doc[key]) === JSON.stringify(changes[key])) continue;
    await logChange(id, 'update', key, doc[key], changes[key], { space_name: doc.name });
  }
  return updated;
}

// Position-only reordering, same as why task drag-reorder within a column
// isn't logged either (updateTask's diff skip set excludes `position`) —
// changelog noise for a pure display-order tweak, not a real edit.
export async function reorderSpaces(spaceIds: string[]): Promise<void> {
  const all = await getSpaces();
  const byId = new Map(all.map(s => [s._id, s]));
  const updates = spaceIds
    .map((id, i) => {
      const doc = byId.get(id);
      return doc ? { ...doc, position: i, updated_at: now(), source: SOURCE } : null;
    })
    .filter((d): d is SpaceDoc => d !== null);
  if (updates.length) await db.bulkDocs(updates);
}

// "Unsorted" can't be deleted — it's the permanent fallback target
// repairDatabase() and reseeding rely on. Deleting any other space
// reassigns its projects to Unsorted rather than deleting them, matching
// the same reassign-not-destroy approach repairDatabase() already uses for
// orphaned projects.
export async function deleteSpace(id: string): Promise<void> {
  if (id === 'space:unsorted') throw new Error('The Unsorted space cannot be deleted.');
  const doc = await db.get<SpaceDoc>(id);
  const projects = await getProjects(id);
  if (projects.length) {
    await db.bulkDocs(projects.map(p => ({ ...p, space_id: 'space:unsorted', updated_at: now(), source: SOURCE })));
  }
  await db.remove(doc);
  await logChange(id, 'delete', undefined, undefined, undefined, { space_name: doc.name });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects(spaceId?: string): Promise<ProjectDoc[]> {
  const r = await db.allDocs<ProjectDoc>({ startkey: 'project:', endkey: 'project:￰', include_docs: true });
  let docs = r.rows.map(r => r.doc!).filter(d => d && !(d as any)._deleted && !d.archived);
  if (spaceId) docs = docs.filter(d => d.space_id === spaceId);
  return docs.sort((a, b) => a.position - b.position);
}

// B32 — archived projects are hidden from getProjects() the same way
// archived tasks are hidden from getTasksForProject(); this is the
// restore-list counterpart, mirroring getArchivedTasksForProject().
export async function getArchivedProjects(): Promise<ProjectDoc[]> {
  const r = await db.allDocs<ProjectDoc>({ startkey: 'project:', endkey: 'project:￰', include_docs: true });
  return r.rows.map(r => r.doc!).filter(d => d && !(d as any)._deleted && !!d.archived)
    .sort((a, b) => a.position - b.position);
}

export async function createProject(spaceId: string, name: string): Promise<ProjectDoc> {
  const existing = await getProjects(spaceId);
  const position = existing.length ? Math.max(...existing.map(p => p.position)) + 1 : 0;
  const doc: ProjectDoc = {
    _id: `project:${nanoid()}`, type: 'project', space_id: spaceId, name, position,
    columns: [
      { id: `col:${nanoid()}`, name: 'Idea' },
      { id: `col:${nanoid()}`, name: 'Task' },
      { id: `col:${nanoid()}`, name: 'In Process' },
      { id: `col:${nanoid()}`, name: 'Completed' },
    ],
    default_view: 'kanban', updated_at: now(), source: SOURCE,
  };
  await db.put(doc);
  await logChange(doc._id!, 'create', undefined, undefined, undefined, { project_name: name });
  return doc;
}

// B8: "New from template" — same shape as duplicateTask(), applied at the
// project level. Copies the template's status structure (column names,
// fresh ids) always; open (non-deleted, non-archived, not-in-last-column —
// same positional-"done" check as everywhere else) tasks only if
// copyOpenTasks is set. Copied tasks get fresh ids/timestamps, reset
// due_date/reminder_at (a template's deadlines don't apply to a new
// instance), and reset checklist items to unchecked — everything else
// (title, body, priority, tags) carries over as-is.
export async function createProjectFromTemplate(
  spaceId: string,
  name: string,
  templateProjectId: string,
  copyOpenTasks: boolean,
): Promise<ProjectDoc> {
  const template = await db.get<ProjectDoc>(templateProjectId);
  const existing = await getProjects(spaceId);
  const position = existing.length ? Math.max(...existing.map(p => p.position)) + 1 : 0;

  const columnIdMap = new Map<string, string>();
  const columns = template.columns.map(c => {
    const newId = `col:${nanoid()}`;
    columnIdMap.set(c.id, newId);
    return { id: newId, name: c.name };
  });

  const doc: ProjectDoc = {
    _id: `project:${nanoid()}`, type: 'project', space_id: spaceId, name, position,
    columns, default_view: template.default_view, updated_at: now(), source: SOURCE,
  };
  await db.put(doc);
  await logChange(doc._id!, 'create', undefined, undefined, undefined, { project_name: name });

  if (copyOpenTasks) {
    const lastColId = template.columns[template.columns.length - 1]?.id;
    const templateTasks = (await getTasksForProject(templateProjectId)).filter(t => t.column_id !== lastColId);
    const ts = now();
    for (const t of templateTasks) {
      const newColId = columnIdMap.get(t.column_id);
      if (!newColId) continue; // robustness: skip a task whose column somehow isn't in the map
      const copy: TaskDoc = {
        ...t,
        _id: `task:${nanoid()}`,
        _rev: undefined,
        project_id: doc._id!,
        space_id: spaceId,
        column_id: newColId,
        due_date: null,
        reminder_at: null,
        deleted: false,
        archived: false,
        pinned: false,
        checklist: t.checklist?.map(item => ({ ...item, done: false })),
        created_at: ts,
        updated_at: ts,
        source: SOURCE,
      };
      await db.put(copy);
      await logChange(copy._id!, 'create', undefined, undefined, undefined, { task_title: copy.title, project_name: name });
    }
    invalidateTaskCache();
  }

  return doc;
}

export async function updateProject(id: string, changes: Partial<ProjectDoc>): Promise<ProjectDoc> {
  const doc = await db.get<ProjectDoc>(id);
  const updated = { ...doc, ...changes, updated_at: now(), source: SOURCE };
  await db.put(updated);
  const skip = new Set(['updated_at', 'source', 'default_view']);
  for (const key of Object.keys(changes) as (keyof ProjectDoc)[]) {
    if (skip.has(key)) continue;
    if (JSON.stringify(doc[key]) === JSON.stringify(changes[key])) continue;
    await logChange(id, 'update', key, doc[key], changes[key], { project_name: doc.name });
  }
  return updated;
}

export async function addColumn(projectId: string, name: string): Promise<ProjectDoc> {
  const doc = await db.get<ProjectDoc>(projectId);
  return updateProject(projectId, { columns: [...doc.columns, { id: `col:${nanoid()}`, name }] });
}

export async function renameColumn(projectId: string, colId: string, name: string): Promise<ProjectDoc> {
  const doc = await db.get<ProjectDoc>(projectId);
  return updateProject(projectId, { columns: doc.columns.map(c => c.id === colId ? { ...c, name } : c) });
}

export async function reorderColumns(projectId: string, columns: Column[]): Promise<ProjectDoc> {
  return updateProject(projectId, { columns });
}

// B16 (revised, owner feedback 2026-07-09): custom fields are global, not
// per-project — every task everywhere shares the same field definitions,
// configured once from Settings → Organize, not invented ad hoc per card.
// Stored as a single fixed-id doc rather than a `field:` range scan since
// there's only ever one list to read/write, never a query over many.
const CUSTOM_FIELDS_DOC_ID = 'meta:custom_fields';

export async function getCustomFieldDefs(): Promise<CustomFieldDef[]> {
  try {
    const doc = await db.get<{ fields: CustomFieldDef[] }>(CUSTOM_FIELDS_DOC_ID);
    return doc.fields ?? [];
  } catch {
    return [];
  }
}

export async function addCustomFieldDef(name: string, type: CustomFieldDef['type'], options?: string[]): Promise<CustomFieldDef[]> {
  const field: CustomFieldDef = { id: `field:${nanoid()}`, name, type, ...(options ? { options } : {}) };
  let doc: any;
  try { doc = await db.get(CUSTOM_FIELDS_DOC_ID); } catch { doc = { _id: CUSTOM_FIELDS_DOC_ID, type: 'meta' }; }
  const fields = [...(doc.fields ?? []), field];
  await db.put({ ...doc, fields, updated_at: now(), source: SOURCE });
  await logChange(field.id, 'create', undefined, undefined, undefined, { field_name: name });
  return fields;
}

// Removing a field definition intentionally leaves any task's stored
// custom_values[fieldId] in place (dead but harmless keyed data) rather
// than sweeping every task in the database to strip it — cheap to skip,
// and CardDetail only ever renders values for fields still in this list,
// so a stale key is simply never shown again.
export async function removeCustomFieldDef(fieldId: string): Promise<CustomFieldDef[]> {
  let doc: any;
  try { doc = await db.get(CUSTOM_FIELDS_DOC_ID); } catch { return []; }
  const removed = (doc.fields ?? []).find((f: CustomFieldDef) => f.id === fieldId);
  const fields = (doc.fields ?? []).filter((f: CustomFieldDef) => f.id !== fieldId);
  await db.put({ ...doc, fields, updated_at: now(), source: SOURCE });
  if (removed) await logChange(fieldId, 'delete', undefined, undefined, undefined, { field_name: removed.name });
  return fields;
}

export async function deleteProject(id: string): Promise<void> {
  const doc = await db.get<ProjectDoc>(id);
  await db.remove(doc);
  // hard-delete all tasks in this project
  const all = await getAllTasksRaw();
  const projectTasks = all.filter(d => d.project_id === id);
  if (projectTasks.length) await db.bulkDocs(projectTasks.map(t => ({ ...t, _deleted: true })));
  invalidateTaskCache();
  // Was the only project-level mutation with no changelog entry at all
  // (create/update/archive/unarchive all log) -- logged after the doc is
  // already gone, same as deleteTask logging against a soft-deleted doc;
  // the ref just won't resolve to a live project if anyone ever clicks
  // through from this entry, same as any other deleted-item log row.
  await logChange(id, 'delete', undefined, undefined, undefined, { project_name: doc.name });
}

// B32 — soft archive for a whole project: the project doc itself stays
// (never db.remove()'d), and only its non-done tasks get archived: true —
// tasks already sitting in the last column (positionally "done") are left
// alone since they're not what a re-visit would need to see restored.
// Restoring the project (unarchiveProject) only un-hides the project
// itself; the tasks it swept up restore individually via the existing
// per-task archived toggle (List view), same as any other archived task.
export async function archiveProject(id: string): Promise<void> {
  const doc = await db.get<ProjectDoc>(id);
  const lastColId = doc.columns.at(-1)?.id;
  await db.put({ ...doc, archived: true, updated_at: now(), source: SOURCE });
  await logChange(id, 'update', 'archived', false, true, { project_name: doc.name });
  const all = await getAllTasksRaw();
  const toArchive = all.filter(t => t.project_id === id && !t.deleted && !t.archived && t.column_id !== lastColId);
  if (toArchive.length) await Promise.all(toArchive.map(t => updateTask(t._id!, { archived: true } as any)));
  invalidateTaskCache();
}

export async function unarchiveProject(id: string): Promise<void> {
  const doc = await db.get<ProjectDoc>(id);
  await db.put({ ...doc, archived: false, updated_at: now(), source: SOURCE });
  await logChange(id, 'update', 'archived', true, false, { project_name: doc.name });
  invalidateTaskCache();
}

export async function removeColumn(projectId: string, colId: string): Promise<ProjectDoc> {
  const doc = await db.get<ProjectDoc>(projectId);
  if (doc.columns.length <= 1) throw new Error('Cannot remove the last column');
  const remaining = doc.columns.filter(c => c.id !== colId);
  const firstId = remaining[0].id;
  const tasks = await getTasksForProject(projectId);
  for (const t of tasks.filter(t => t.column_id === colId)) {
    await updateTask(t._id!, { column_id: firstId });
  }
  return updateProject(projectId, { columns: remaining });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasksForProject(projectId: string): Promise<TaskDoc[]> {
  await initIndexes();
  try {
    // pouchdb-find defaults to a 25-result limit when none is specified —
    // without this, any project past 25 tasks would silently truncate.
    const r = await db.find({
      selector: { type: 'task', project_id: projectId },
      use_index: 'idx-type-project',
      limit: 100000,
    });
    return (r.docs as TaskDoc[]).filter(d => !d.deleted && !d.archived);
  } catch {
    // Fallback if find()/the index is unavailable for any reason.
    const all = await getAllTasksRaw();
    return all.filter(d => d.project_id === projectId && !d.deleted && !d.archived);
  }
}

// `overrides` lets a caller (Quick Add's NLP parser) set priority/due_date/
// reminder_at/tags in the same write as creation, instead of a create()
// immediately followed by an update() -- that would double up as two log
// entries ("Created" then "Edited") for what a user experienced as one action.
export async function createTask(
  projectId: string, spaceId: string, columnId: string, title: string,
  overrides?: Partial<Pick<TaskDoc, 'priority' | 'due_date' | 'reminder_at' | 'tags'>>,
): Promise<TaskDoc> {
  const existing = await getTasksForProject(projectId);
  const colTasks = existing.filter(t => t.column_id === columnId);
  const maxPos = colTasks.length ? Math.max(...colTasks.map(t => t.position)) : 0;
  const ts = now();
  const doc: TaskDoc = {
    _id: `task:${nanoid()}`, type: 'task',
    project_id: projectId, space_id: spaceId, column_id: columnId,
    title, body: '', priority: overrides?.priority ?? 1,
    due_date: overrides?.due_date ?? null, reminder_at: overrides?.reminder_at ?? null,
    tags: overrides?.tags ?? [],
    position: maxPos + 1024,
    deleted: false, created_at: ts, updated_at: ts, source: SOURCE,
  };
  await db.put(doc);
  invalidateTaskCache();
  let projName: string | undefined;
  try { projName = (await db.get<ProjectDoc>(projectId)).name; } catch {}
  await logChange(doc._id!, 'create', undefined, undefined, undefined, { task_title: title, project_name: projName });
  return doc;
}

export async function updateTask(id: string, changes: Partial<TaskDoc>): Promise<TaskDoc> {
  const doc = await db.get<TaskDoc>(id);
  await db.put({ ...doc, ...changes, updated_at: now(), source: SOURCE });
  invalidateTaskCache();

  const isMove   = changes.column_id !== undefined && changes.column_id !== doc.column_id;
  const isDelete = !!changes.deleted;

  // Collect genuinely changed fields (excluding position/meta)
  const skip = new Set(['updated_at', 'source', 'position', 'column_id']);
  // undefined/null and an empty object/array both mean "nothing here" --
  // CardDetail.save() always sends the full custom_values/checklist
  // shape (defaulting to {}/[] when the task never had one), while a
  // task that's never had either stores the field as undefined on the
  // doc itself. Without this, every single save on such a task logged a
  // false "Custom fields updated"/"Checklist updated" diff alongside
  // whatever was actually changed (owner-reported 2026-07-18) --
  // JSON.stringify(undefined) is the JS value undefined, not the string
  // "undefined", which never equals "{}" or "[]" even though nothing was
  // ever touched.
  const isEmpty = (v: any) => v == null || (typeof v === 'object' && Object.keys(v).length === 0);
  const diffs: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(changes) as (keyof TaskDoc)[]) {
    if (skip.has(key)) continue;
    const from = doc[key], to = changes[key];
    if (isEmpty(from) && isEmpty(to)) continue;
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      diffs[key] = { from, to };
    }
  }

  // Resolve project once
  let proj: ProjectDoc | null = null;
  try { proj = await db.get<ProjectDoc>(doc.project_id); } catch {}
  const projName = proj?.name;
  const taskTitle = (changes.title as string | undefined) ?? doc.title;

  // isDelete checked first: only one log entry is written per call, and a
  // delete matters more than a same-call column move -- no current call
  // site combines them (deleteTask() only ever sends { deleted: true }),
  // but if one ever did, silently logging "moved" while dropping the
  // delete from history would be a worse bug than the reverse.
  if (isDelete) {
    await logChange(id, 'delete', undefined, undefined, undefined, { task_title: doc.title, project_name: projName });
  } else if (isMove) {
    const fromName = proj?.columns.find(c => c.id === doc.column_id)?.name ?? doc.column_id;
    const toName   = proj?.columns.find(c => c.id === changes.column_id)?.name ?? changes.column_id!;
    await logChange(id, 'move', 'column_id', fromName, toName, {
      task_title: taskTitle, project_name: projName,
      diffs: Object.keys(diffs).length ? diffs : undefined,
    });
  } else if (Object.keys(diffs).length) {
    await logChange(id, 'update', undefined, undefined, undefined, { task_title: taskTitle, project_name: projName, diffs });
  }

  return { ...doc, ...changes, updated_at: now(), source: SOURCE } as TaskDoc;
}

// ── Undo (recently deleted, sourced from the database) ────────────────────────
// Tasks are soft-deleted (deleted: true), so "recently deleted" doesn't need
// its own storage — it's just a query. This also means undo survives a page
// refresh, unlike the old in-memory-only buffer which lost everything the
// moment the tab reloaded even though the underlying task was still recoverable.

const _undoListeners = new Set<() => void>();
export function subscribeUndo(fn: () => void) { _undoListeners.add(fn); return () => _undoListeners.delete(fn); }

// B23: sidebar "recent" shortcut — last N modified tasks across every
// project, not just the currently open one. `tasks`/`projectTasks` in
// store.ts only hold the active project's tasks, so this needs its own
// cross-project query rather than reusing what's already loaded.
export async function getRecentlyModifiedTasks(limit = 3): Promise<TaskDoc[]> {
  const all = await getAllTasksRaw();
  return all
    .filter(d => !d.deleted && !d.archived)
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .slice(0, limit);
}

export async function getRecentlyDeleted(limit = 10): Promise<TaskDoc[]> {
  const all = await getAllTasksRaw();
  return all
    .filter(d => d.deleted)
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .slice(0, limit);
}

export async function deleteTask(id: string): Promise<void> {
  await updateTask(id, { deleted: true });
  _undoListeners.forEach(fn => fn());
}

export async function duplicateTask(id: string): Promise<TaskDoc> {
  const src = await db.get<TaskDoc>(id);
  const existing = await getTasksForProject(src.project_id);
  const colTasks = existing.filter(t => t.column_id === src.column_id);
  const maxPos = colTasks.length ? Math.max(...colTasks.map(t => t.position)) : 0;
  const ts = now();
  const doc: TaskDoc = {
    ...src,
    _id: `task:${nanoid()}`,
    _rev: undefined,
    title: `${src.title} (copy)`,
    position: maxPos + 1024,
    deleted: false,
    archived: false,
    pinned: false,
    reminder_at: null,
    created_at: ts,
    updated_at: ts,
    source: SOURCE,
  };
  await db.put(doc);
  invalidateTaskCache();
  let projName: string | undefined;
  try { projName = (await db.get<ProjectDoc>(src.project_id)).name; } catch {}
  await logChange(doc._id!, 'create', undefined, undefined, undefined, { task_title: doc.title, project_name: projName });
  return doc;
}

export async function undoDelete(id: string): Promise<void> {
  const current = await db.get<TaskDoc>(id);
  if (!current.deleted) return;
  await db.put({ ...current, deleted: false, updated_at: now(), source: SOURCE });
  invalidateTaskCache();
  let projName: string | undefined;
  try { projName = (await db.get<ProjectDoc>(current.project_id)).name; } catch {}
  await logChange(id, 'update', 'deleted', true, false, { task_title: current.title, project_name: projName });
  _undoListeners.forEach(fn => fn());
}

// ── Trash (its own view — see TrashView.svelte) ─────────────────────────────
// The Settings panel used to embed a "last 10 deleted" list directly; it's a
// full deleted-items view now, so it needs the complete list (not just the
// last 10 getRecentlyDeleted() returns for the undo toast) plus permanent
// deletion and a bulk "Empty Trash".

export async function getAllDeletedTasks(): Promise<(TaskDoc & { project_name?: string })[]> {
  const all = await getAllTasksRaw();
  const deleted = all
    .filter(d => d.deleted)
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const allProjects = await getProjects();
  const projCache: Record<string, string> = Object.fromEntries(allProjects.map(p => [p._id, p.name]));
  return deleted.map(t => ({ ...t, project_name: projCache[t.project_id] }));
}

export async function deleteForever(id: string): Promise<void> {
  const doc = await db.get<TaskDoc>(id);
  await db.remove(doc);
  invalidateTaskCache();
}

export async function emptyTrash(): Promise<number> {
  const all = await getAllTasksRaw();
  const trashed = all.filter(d => d.deleted);
  if (trashed.length) await db.bulkDocs(trashed.map(d => ({ ...d, _deleted: true })));
  invalidateTaskCache();
  return trashed.length;
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function getArchivedTasksForProject(projectId: string): Promise<TaskDoc[]> {
  const all = await getAllTasksRaw();
  return all.filter(d => d.project_id === projectId && !d.deleted && !!d.archived);
}

export async function unarchiveTask(id: string): Promise<void> {
  // Routed through updateTask() (like archiveTask() below), not a direct
  // db.put(), so it logs a changelog entry the same way archiving already
  // does -- was a direct put with no logChange() call, the only one of
  // the archive/unarchive pair that didn't log.
  await updateTask(id, { archived: false } as any);
}

export async function archiveTask(id: string): Promise<void> {
  await updateTask(id, { archived: true } as any);
}

export async function archiveColumnTasks(projectId: string, columnId: string): Promise<void> {
  const tasks = await getTasksForProject(projectId);
  const toArchive = tasks.filter(t => t.column_id === columnId && !t.archived);
  if (!toArchive.length) return;
  await Promise.all(toArchive.map(t => updateTask(t._id!, { archived: true } as any)));
}

export async function importJSON(docs: any[]): Promise<{ ok: number; skipped: number }> {
  const valid = docs.filter(d =>
    d._id && typeof d._id === 'string' &&
    ['space', 'project', 'task'].includes(d.type)
  );
  // A doc whose id already exists locally is meant to overwrite it with
  // the backup's content ("merges instead of duplicating" -- the Restore
  // tab's own UI copy) -- fetch each existing doc's current _rev first
  // and attach it, so bulkDocs treats a collision as a real update
  // instead of a rejected create. Previously this stripped _rev
  // unconditionally on every doc and let PouchDB reject every collision
  // with a 409 -- counted as "ok" here, but silently leaving the
  // existing (possibly stale/different) local doc completely untouched.
  // A real gap between documented restore behavior and what actually
  // happened (2026-07-18 audit) -- restoring a backup over data that had
  // since diverged locally did nothing for every doc that collided,
  // while reporting success.
  const existing = await db.allDocs({ keys: valid.map(d => d._id) });
  const revById = new Map<string, string>();
  for (const row of existing.rows as any[]) {
    if (!row.error && row.value?.rev) revById.set(row.id, row.value.rev);
  }
  const clean = valid.map(({ _rev, ...d }) => {
    const rev = revById.get(d._id);
    return rev ? { ...d, _rev: rev } : d;
  });
  const results = await db.bulkDocs(clean);
  invalidateTaskCache();
  const ok = results.filter((r: any) => !r.error).length;
  const skipped = results.filter((r: any) => r.error).length;
  return { ok, skipped };
}

// B4 (import/export v2) — a lightweight, read-only pass over a parsed
// import file so the UI can show "what will happen" before anything is
// written. Doesn't check against the live DB (PouchDB has no clean
// dry-run for bulkDocs) — "will be skipped" here means "malformed, not
// one of space/project/task," which importJSON's own filter already
// applies; a doc that collides with an existing id is still reported as
// "created" here and genuinely overwritten (adopting the correct current
// _rev first) by importJSON itself, consistent with its actual behavior.
export function analyzeImport(docs: any[]): { toCreate: number; toSkip: number; byType: Record<string, number> } {
  const byType: Record<string, number> = { space: 0, project: 0, task: 0 };
  let toSkip = 0;
  for (const d of docs) {
    if (d?._id && typeof d._id === 'string' && d.type in byType) byType[d.type]++;
    else toSkip++;
  }
  return { toCreate: docs.length - toSkip, toSkip, byType };
}

// Export a single project (B4) — the project doc plus its own tasks only,
// not the space it belongs to (the destination side is expected to already
// have a matching space, or the user re-targets on import — keeping this
// export minimal avoids silently duplicating spaces on re-import).
export async function exportProjectDocs(projectId: string): Promise<any[]> {
  const project = await db.get(projectId);
  const tasks = (await getAllTasksRaw()).filter(t => t.project_id === projectId && !t.deleted);
  return [project, ...tasks];
}

// CSV export (B4) — every non-deleted task across every project, one row
// each. Status/Priority are resolved to their display names (not raw
// column_id / 1-2-3) since a spreadsheet is a human-facing destination,
// not a re-importable format — CSV is one-way, JSON export is the
// round-trippable one.
export async function exportTasksCSV(): Promise<string> {
  const [tasks, projects] = await Promise.all([getAllTasksRaw(), getProjects()]);
  const projById: Record<string, ProjectDoc> = Object.fromEntries(projects.map(p => [p._id, p]));
  const PRIO_NAME: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Title', 'Project', 'Status', 'Priority', 'Due Date', 'Tags', 'Created', 'Updated'];
  const lines = [header.map(esc).join(',')];
  for (const t of tasks) {
    if (t.deleted) continue;
    const proj = projById[t.project_id];
    const status = proj?.columns.find(c => c.id === t.column_id)?.name ?? '';
    lines.push([
      t.title, proj?.name ?? '', status, PRIO_NAME[t.priority] ?? '',
      t.due_date ?? '', (t.tags ?? []).join('; '), t.created_at, t.updated_at,
    ].map(esc).join(','));
  }
  return lines.join('\r\n');
}

// Optional projectId narrows to just that project's tags (B26) — used to
// rank tag-input suggestions "used in this project" first, with the
// unfiltered call still available as the everywhere-else fallback list.
export async function getAllTags(projectId?: string): Promise<string[]> {
  const all = await getAllTasksRaw();
  const scoped = projectId ? all.filter(d => d.project_id === projectId) : all;
  const set = new Set<string>();
  scoped.forEach(d => d.tags?.forEach(t => set.add(t)));
  return [...set].sort();
}

// ── Tag management ───────────────────────────────────────────────────────
// Tags are free-form strings on each task with no central record — these
// operate directly across every task's tags array via bulkDocs rather than
// one updateTask() per task, and (like the retention-pruning functions
// above) deliberately skip logChange() per affected task: a rename/delete
// can touch hundreds of tasks at once, and one changelog entry per task
// would drown out everything else in the activity log for what's really a
// single admin action.

export async function getTagCounts(): Promise<{ tag: string; count: number }[]> {
  const all = await getAllTasksRaw();
  const counts = new Map<string, number>();
  for (const t of all) {
    if (t.deleted) continue;
    for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// Renaming to a tag that already exists elsewhere acts as a merge — each
// affected task's tags are deduped via Set rather than ending up with the
// same tag listed twice.
export async function renameTag(oldTag: string, newTag: string): Promise<number> {
  const trimmed = newTag.trim();
  if (!trimmed || trimmed === oldTag) return 0;
  const all = await getAllTasksRaw();
  const affected = all.filter(t => !t.deleted && t.tags?.includes(oldTag));
  if (!affected.length) return 0;
  const updates = affected.map(t => ({
    ...t,
    tags: [...new Set(t.tags.map(tag => (tag === oldTag ? trimmed : tag)))],
    updated_at: now(), source: SOURCE,
  }));
  await db.bulkDocs(updates);
  invalidateTaskCache();
  return updates.length;
}

export async function deleteTagEverywhere(tag: string): Promise<number> {
  const all = await getAllTasksRaw();
  const affected = all.filter(t => !t.deleted && t.tags?.includes(tag));
  if (!affected.length) return 0;
  const updates = affected.map(t => ({
    ...t,
    tags: t.tags.filter(x => x !== tag),
    updated_at: now(), source: SOURCE,
  }));
  await db.bulkDocs(updates);
  invalidateTaskCache();
  return updates.length;
}

export async function getAllTasksDue(): Promise<(TaskDoc & { project_name?: string; space_id: string })[]> {
  const all = await getAllTasksRaw();
  const tasks = all.filter(d => !d.deleted && !d.archived && d.due_date);
  const allProjects = await getProjects();
  const projCache: Record<string, ProjectDoc> = Object.fromEntries(allProjects.map(p => [p._id, p]));
  const result = [];
  for (const t of tasks) {
    const proj = projCache[t.project_id];
    const lastColId = proj?.columns.at(-1)?.id;
    // Already marked done (sitting in the last/"Completed" column) — leave
    // it off the agenda instead of showing it forever after "Mark done".
    if (lastColId && t.column_id === lastColId) continue;
    result.push({ ...t, project_name: proj?.name });
  }
  return result.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
}

// B35 (Focus view, revised) — a "daily commitment lock," not an
// auto-computed priority list. The user picks up to 3 tasks each day;
// Focus shows only those until each is done or the day rolls over. The
// lock itself (which 3, which day) lives in localStorage (FocusView.svelte),
// not a PouchDB doc — it's ephemeral per-day UI state, not data worth
// syncing/persisting across devices. This function only supports the
// *picker*: a flat list of open tasks to choose from. Reuses the same
// "done = last column" exclusion as getAllTasksDue()/searchAllTasks().
export async function getOpenTasksForFocusPicker(): Promise<(TaskDoc & { project_name?: string })[]> {
  const [all, allProjects] = await Promise.all([getAllTasksRaw(), getProjects()]);
  const projCache: Record<string, ProjectDoc> = Object.fromEntries(allProjects.map(p => [p._id, p]));
  const lastColOf = (pid: string) => projCache[pid]?.columns.at(-1)?.id;
  const notDone = (t: TaskDoc) => !t.deleted && !t.archived && t.column_id !== lastColOf(t.project_id);
  return all
    .filter(notDone)
    .map(t => ({ ...t, project_name: projCache[t.project_id]?.name }))
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
}

export async function getTaskById(id: string): Promise<TaskDoc | null> {
  try { return await db.get<TaskDoc>(id); } catch { return null; }
}

export async function getAllActiveTasksWithReminders(): Promise<TaskDoc[]> {
  const all = await getAllTasksRaw();
  const allProjects = await getProjects();
  const lastColByProject: Record<string, string | undefined> = Object.fromEntries(
    allProjects.map(p => [p._id, p.columns.at(-1)?.id])
  );
  return all.filter(d =>
    !d.deleted && !d.archived && d.reminder_at &&
    d.column_id !== lastColByProject[d.project_id]
  );
}

// ── Integrity check + repair ──────────────────────────────────────────────────

export interface IntegrityIssue {
  type: 'orphaned_project' | 'orphaned_task' | 'invalid_column' | 'no_columns' | 'conflict';
  docId: string;
  description: string;
}

export async function checkIntegrity(): Promise<{ issues: IntegrityIssue[]; checked: number }> {
  const issues: IntegrityIssue[] = [];
  const r = await db.allDocs({ include_docs: true, conflicts: true });
  const docs = r.rows.map(row => row.doc!).filter(d => !(d as any)._id.startsWith('_'));

  const spaces = docs.filter((d: any) => d.type === 'space') as SpaceDoc[];
  const projects = docs.filter((d: any) => d.type === 'project') as ProjectDoc[];
  const tasks = docs.filter((d: any) => d.type === 'task') as TaskDoc[];
  const spaceIds = new Set(spaces.map(s => s._id));
  const projectIds = new Set(projects.map(p => p._id));

  for (const p of projects) {
    if (!spaceIds.has(p.space_id)) {
      issues.push({ type: 'orphaned_project', docId: p._id!, description: `Project "${p.name}" points to a missing space` });
    }
    if (!p.columns || p.columns.length === 0) {
      issues.push({ type: 'no_columns', docId: p._id!, description: `Project "${p.name}" has no statuses (not auto-repaired — needs manual review)` });
    }
  }

  for (const t of tasks) {
    if (t.deleted) continue;
    if (!projectIds.has(t.project_id)) {
      issues.push({ type: 'orphaned_task', docId: t._id!, description: `Task "${t.title}" points to a missing project` });
      continue;
    }
    const proj = projects.find(p => p._id === t.project_id);
    if (proj && proj.columns.length && !proj.columns.some(c => c.id === t.column_id)) {
      issues.push({ type: 'invalid_column', docId: t._id!, description: `Task "${t.title}" points to a missing status in "${proj.name}"` });
    }
  }

  for (const row of r.rows as any[]) {
    // See scanConflicts()'s comment — conflicts live on row.doc._conflicts,
    // never on row.value.
    if (row.doc?._conflicts?.length) {
      issues.push({ type: 'conflict', docId: row.id, description: `${row.doc._conflicts.length} unresolved conflicting revision(s)` });
    }
  }

  return { issues, checked: docs.length };
}

// Applies safe, well-understood fixes only. "no_columns" is deliberately
// left for manual review — inventing default statuses for a project the
// user configured a specific way is too destructive to do silently.
export async function repairDatabase(): Promise<{ fixed: number; skipped: number }> {
  const { issues } = await checkIntegrity();
  let fixed = 0, skipped = 0;

  for (const issue of issues) {
    try {
      if (issue.type === 'orphaned_task') {
        const doc = await db.get<TaskDoc>(issue.docId);
        const fallback = await getProjects('space:unsorted');
        if (fallback.length) {
          await db.put({ ...doc, project_id: fallback[0]._id, column_id: fallback[0].columns[0]?.id ?? doc.column_id, updated_at: now(), source: SOURCE });
        } else {
          await db.put({ ...doc, archived: true, updated_at: now(), source: SOURCE });
        }
        fixed++;
      } else if (issue.type === 'invalid_column') {
        const doc = await db.get<TaskDoc>(issue.docId);
        const proj = await db.get<ProjectDoc>(doc.project_id);
        await db.put({ ...doc, column_id: proj.columns[0]?.id ?? doc.column_id, updated_at: now(), source: SOURCE });
        fixed++;
      } else if (issue.type === 'orphaned_project') {
        const doc = await db.get<ProjectDoc>(issue.docId);
        await db.put({ ...doc, space_id: 'space:unsorted', updated_at: now(), source: SOURCE });
        fixed++;
      } else if (issue.type === 'conflict') {
        const doc = await db.get(issue.docId, { conflicts: true } as any) as any;
        const conflicts: string[] = doc._conflicts ?? [];
        for (const rev of conflicts) await db.remove(issue.docId, rev);
        if (conflicts.length) fixed++; else skipped++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  invalidateTaskCache();
  await scanConflicts();
  return { fixed, skipped };
}

// ── Conflict resolution ─────────────────────────────────────────────────────
// repairDatabase() above always keeps the current winning revision and
// discards the rest — a reasonable default, but it means the user never
// gets to choose if PouchDB's deterministic pick happened to keep the wrong
// side of a genuine edit conflict. These two functions let Settings show
// both versions of a conflicted doc and let the user decide.

export interface ConflictInfo {
  docId: string;
  type: string;
  label: string;
  current: any;
  other: { rev: string; doc: any };
}

export async function getConflicts(): Promise<ConflictInfo[]> {
  const r = await db.allDocs({ include_docs: true, conflicts: true });
  const out: ConflictInfo[] = [];
  for (const row of r.rows as any[]) {
    // See scanConflicts()'s comment — conflicts live on row.doc._conflicts,
    // never on row.value.
    const revs: string[] = row.doc?._conflicts ?? [];
    if (!revs.length) continue;
    const current = row.doc!;
    // Only the first conflicting revision is shown — multi-way conflicts are
    // rare for a single-user app and repairDatabase() remains available for
    // those as a blunter "keep current, discard the rest" fallback.
    const other = await db.get(row.id, { rev: revs[0] } as any) as any;
    out.push({
      docId: row.id,
      type: current.type,
      label: current.title ?? current.name ?? row.id,
      current,
      other: { rev: revs[0], doc: other },
    });
  }
  return out;
}

export async function resolveConflict(docId: string, keep: 'current' | 'other', otherRev?: string): Promise<void> {
  const doc = await db.get(docId, { conflicts: true } as any) as any;
  const losingRevs: string[] = doc._conflicts ?? [];
  if (keep === 'other' && otherRev) {
    const winning = await db.get(docId, { rev: otherRev } as any) as any;
    await db.put({ ...winning, _id: docId, _rev: doc._rev });
  }
  // Every conflicting revision still needs explicit removal — CouchDB/
  // PouchDB don't auto-prune losing branches just because a new revision
  // was written. This includes the adopted "other" revision itself: its
  // content was copied into a fresh revision on top of the current one
  // above, but the old "other" leaf is still its own separate branch and
  // stays a live conflict unless it's removed too, same as the rest.
  for (const rev of losingRevs) {
    try { await db.remove(docId, rev); } catch {}
  }
  invalidateTaskCache();
  await scanConflicts();
}

// ── Live query ────────────────────────────────────────────────────────────────

export function subscribe(callback: () => void): () => void {
  const handler = db.changes({ since: 'now', live: true }).on('change', () => {
    invalidateTaskCache();
    callback();
  });
  return () => handler.cancel();
}

export default db;
