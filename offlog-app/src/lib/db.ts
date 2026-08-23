// PouchDB core is loaded as a UMD global via index.html <script src="/pouchdb.js">.
// That bundle is core-only: pouchdb-find must be registered as a plugin on the
// global constructor, or createIndex() no-ops and find() throws.
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import PouchDBFind from 'pouchdb-find';
import { getSyncUrl, getSyncCredentials, getDeviceName, getDeviceId, isSyncEnabled, getDefaultReminderTime } from '../config';
import type { SpaceDoc, ProjectDoc, TaskDoc, Column, Source, CustomFieldDef, TagColorDoc, TaskAttachment } from './types';
import { wordOverlapSimilarity, localDateStr } from './utils';
import { ATTACHMENT_MAX_BYTES, isAttachmentExtensionAllowed, attachmentExtension, attachmentMimeType } from './attachments';

(PouchDB as any).plugin(PouchDBFind);

// Read once per module load, not per write: renaming a device triggers a
// location.reload(), so a fresh value is picked up then.
const SOURCE: Source = getDeviceName();
const SOURCE_ID: string = getDeviceId();
// auto_compaction discards superseded revision bodies as soon as a new
// revision lands. Without it PouchDB keeps every historical revision
// forever, and deleting a 10MB attachment frees zero disk space because the
// previous revision still references the blob. Local-only: it does not
// affect the sync remote's history, so replication semantics are unchanged.
// It only applies going forward — clearing already-accumulated revisions on
// an existing database is the manual Settings → Maintenance compaction.
const db = new PouchDB('offlog', { auto_compaction: true });

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

async function remote() {
  const { user, pass } = await getSyncCredentials();
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

// Per-device last-seen list for Settings. Scans a bounded window of the most
// recent changelog entries rather than every log ever. Descending order means
// the first entry seen for a given source is already its most recent.
export async function getDeviceLastSeen(): Promise<{ device: string; lastSeen: string }[]> {
  const r = await db.allDocs({ startkey: 'log:￰', endkey: 'log:', descending: true, limit: 500, include_docs: true });
  // Group by the stable source_id where present, so a rename doesn't split one
  // device into two rows. Older log entries have no source_id and fall back to
  // grouping by the literal source string.
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
  attachmentCount: number;
  attachmentBytes: number;
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const all = await getAllTasksRaw();
  let activeTasks = 0, archivedTasks = 0, deletedTasks = 0, attachmentCount = 0, attachmentBytes = 0;
  for (const d of all) {
    if (d.deleted) deletedTasks++;
    else if (d.archived) archivedTasks++;
    else activeTasks++;
    // Counted regardless of active/archived/deleted -- a soft-deleted task's
    // attachments still occupy real disk space until the trash is emptied.
    for (const a of d.attachments ?? []) { attachmentCount++; attachmentBytes += a.size; }
  }
  const logRows = await db.allDocs({ startkey: 'log:', endkey: 'log:￰' });
  return { activeTasks, archivedTasks, deletedTasks, logEntries: logRows.rows.length, attachmentCount, attachmentBytes };
}

// Shared by getDashboardData()/searchAllTasks() to exclude an archived
// project's leftover done tasks -- see archiveProject() for why those can
// still carry archived:false.
function getActiveProjectIds(allProjects: ProjectDoc[]): Set<string> {
  return new Set(allProjects.map(p => p._id!));
}

export async function getDashboardData() {
  const [allProjects, allSpaces] = await Promise.all([getProjects(), getSpaces()]);
  const all = await getAllTasksRaw();
  const activeProjectIds = getActiveProjectIds(allProjects);
  // archiveProject() only sweeps a project's non-done tasks into
  // archived:true, so without this filter a done task from an archived
  // project still shows up as pinned/overdue/today with no project to
  // resolve its name against.
  const tasks = all.filter(d => !d.deleted && !d.archived && activeProjectIds.has(d.project_id));
  const today = localDateStr(new Date());

  const byProject: Record<string, { total: number; pinned: number; overdue: number; lastColId: string }> = {};
  for (const p of allProjects) {
    byProject[p._id] = { total: 0, pinned: 0, overdue: 0, lastColId: p.columns.at(-1)?.id ?? '' };
  }
  for (const t of tasks) {
    if (!byProject[t.project_id]) continue;
    byProject[t.project_id].total++;
    if (t.pinned && t.column_id !== byProject[t.project_id].lastColId) byProject[t.project_id].pinned++;
    if (t.due_date && t.due_date < today && t.column_id !== byProject[t.project_id].lastColId) byProject[t.project_id].overdue++;
  }

  // Excludes done tasks (last column) like overdueTasks/todayTasks below --
  // otherwise a completed pinned task shows here indefinitely.
  const pinnedTasks = tasks
    .filter(t => t.pinned && t.column_id !== byProject[t.project_id]?.lastColId)
    .slice(0, 10);
  const overdueTasks = tasks
    .filter(t => t.due_date && t.due_date < today && t.column_id !== byProject[t.project_id]?.lastColId)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 10);
  const todayTasks = tasks
    .filter(t => t.due_date === today && t.column_id !== byProject[t.project_id]?.lastColId)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);
  const projCache: Record<string, string> = Object.fromEntries(allProjects.map(p => [p._id, p.name]));

  // "Completed in the last week" for the Dashboard summary strip. There is no
  // completed_at field; this uses updated_at plus the positional
  // "done = last column" check rather than reconstructing from log docs
  // (move logs store the target column's *name*, not its id — fragile against
  // renames). updated_at bumps on any edit, so a task completed earlier but
  // merely edited within the window false-positives — acceptable for a
  // glance-level stat.
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

// Unified search across title/tags/body/checklist/attachment filenames.
// `matchedIn` tells GlobalSearch.svelte which field matched (checked in the
// order below) so it can show *why* a result surfaced when the title itself
// doesn't contain the query.
export type TaskSearchMatch = 'title' | 'tags' | 'body' | 'checklist' | 'attachments';

function taskSearchMatch(d: TaskDoc, q: string): TaskSearchMatch | null {
  if (d.title.toLowerCase().includes(q)) return 'title';
  if (d.tags?.some((t: string) => t.toLowerCase().includes(q))) return 'tags';
  if (d.body?.toLowerCase().includes(q)) return 'body';
  if (d.checklist?.some(i => i.text.toLowerCase().includes(q))) return 'checklist';
  if (d.attachments?.some(a => a.filename.toLowerCase().includes(q))) return 'attachments';
  return null;
}

export async function searchAllTasks(query: string): Promise<(TaskDoc & { project_name: string; space_id: string; matchedIn: TaskSearchMatch })[]> {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  const [all, allProjects, allSpaces] = await Promise.all([getAllTasksRaw(), getProjects(), getSpaces()]);
  const activeProjectIds = getActiveProjectIds(allProjects);
  // Excludes an archived project's leftover done tasks the same way
  // getDashboardData() does -- see its comment for why they'd otherwise
  // still be findable here.
  const tasks = all
    .filter(d => !d.deleted && !d.archived && activeProjectIds.has(d.project_id))
    .map(d => ({ doc: d, matchedIn: taskSearchMatch(d, q) }))
    .filter((x): x is { doc: TaskDoc; matchedIn: TaskSearchMatch } => x.matchedIn !== null);
  const projCache: Record<string, ProjectDoc> = Object.fromEntries(allProjects.map(p => [p._id, p]));
  const spaceCache: Record<string, SpaceDoc> = Object.fromEntries(allSpaces.map(s => [s._id!, s]));
  // Disambiguate with the space name whenever more than one project shares a
  // name — a flat cross-project list is where that collision is invisible.
  const nameCounts = new Map<string, number>();
  for (const p of allProjects) {
    const key = p.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  return tasks.map(({ doc: t, matchedIn }) => {
    const proj = projCache[t.project_id];
    const isDup = proj && (nameCounts.get(proj.name.trim().toLowerCase()) ?? 0) > 1;
    const spaceName = isDup ? spaceCache[proj.space_id]?.name : undefined;
    return { ...t, project_name: proj ? (spaceName ? `${proj.name} · ${spaceName}` : proj.name) : '—', matchedIn };
  });
}

export async function clearLogs(): Promise<void> {
  const r = await db.allDocs({ startkey: 'log:', endkey: 'log:￰', include_docs: true });
  const dels = r.rows.map(row => ({ ...row.doc!, _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
}

// ── Sync ──────────────────────────────────────────────────────────────────────

let _syncHandler: any = null;

// Exported for tests — pure classification, no I/O, so what a dropped
// connection tells the user is testable without a real db.sync() call.
export function describeSyncError(err: any): string {
  if (!err) return 'Unknown sync error';
  const status = err.status ?? err.statusCode;
  if (status === 401 || status === 403) return 'Authentication failed — check sync credentials';
  if (status === 404) return 'Sync database not found on server';
  if (status === 0 || err.name === 'TypeError' || /network|failed to fetch/i.test(err.message ?? '')) {
    // The sync URL is a self-hosted LAN address, so "cannot reach it" almost
    // always means "not on that network right now". A device that has never
    // synced shows an empty/default-seeded app in this situation, easy to
    // mistake for lost data unless the message says why in plain terms.
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

// Content shape a still-untouched default doc from seedIfEmpty() has.
// Compared field-by-field (ignoring _id/_rev/updated_at/source, which always
// legitimately differ between two independently-seeded installs) to tell a
// genuinely pristine copy apart from one the user edited.
const PRISTINE_DEFAULTS: Record<string, (doc: any) => boolean> = {
  'space:unsorted': (d) => d.name === 'Unsorted' && d.color === '#6B7280' && d.position === 0,
  'space:personal': (d) => d.name === 'Personal' && d.color === '#10B981' && d.position === 1,
  'space:work':     (d) => d.name === 'Work' && d.color === '#3B82F6' && d.position === 2,
  'project:draft':  (d) => d.name === 'Draft' && d.space_id === 'space:unsorted' && d.position === 0
                         && d.default_view === 'kanban' && JSON.stringify(d.columns) === JSON.stringify(DEFAULT_COLS),
};

// clearLocalSeedBeforeFirstPair() only helps when THIS device's copy of a
// fixed default id is still pristine; it can't fix the *other* side's copy.
// A device with real history pairing against one whose defaults were never
// touched still forks un-mergeable revision trees on those fixed ids, and
// the protocol's deterministic winner isn't guaranteed to prefer the real
// content over the pristine throwaway. So this cleans up after the fact,
// symmetrically: a revision on one of these known ids that still exactly
// matches seedIfEmpty()'s pristine shape is provably worthless and is
// discarded with no user interaction. A genuinely customized revision is
// never guessed at — this only recognizes "nobody ever touched this one",
// and never merges two real edits.
async function autoResolvePristineDefaultConflicts(): Promise<void> {
  for (const id of Object.keys(PRISTINE_DEFAULTS)) {
    let doc: any;
    try { doc = await db.get(id, { conflicts: true } as any); } catch { continue; }
    const losingRevs: string[] = doc._conflicts ?? [];
    if (!losingRevs.length) continue;
    const isPristine = PRISTINE_DEFAULTS[id];

    if (isPristine(doc)) {
      // The kept revision is the untouched default — if exactly one losing
      // revision is a real edit, adopt it rather than keeping the throwaway
      // just because PouchDB's deterministic pick favored it. More than one
      // real edit is left alone: never guess between two real edits.
      const edited: string[] = [];
      for (const rev of losingRevs) {
        try {
          const losing = await db.get(id, { rev } as any) as any;
          if (!isPristine(losing)) edited.push(rev);
        } catch { /* already gone — ignore */ }
      }
      if (edited.length === 1) {
        const winning = await db.get(id, { rev: edited[0] } as any) as any;
        await db.put({ ...winning, _id: id, _rev: doc._rev });
        for (const rev of losingRevs) { try { await db.remove(id, rev); } catch {} }
      } else if (edited.length === 0) {
        // every side is still pristine — doesn't matter which one "wins"
        for (const rev of losingRevs) { try { await db.remove(id, rev); } catch {} }
      }
    } else {
      // The kept revision already has real content — just discard
      // whichever losing revisions are still provably untouched.
      for (const rev of losingRevs) {
        try {
          const losing = await db.get(id, { rev } as any) as any;
          if (isPristine(losing)) await db.remove(id, rev);
        } catch { /* already gone — ignore */ }
      }
    }
  }
}

// Exported for store.ts's init() — conflict state must be visible from a
// cold start, not only after the next sync settles.
export async function scanConflicts(): Promise<number> {
  await autoResolvePristineDefaultConflicts();
  // PouchDB only attaches conflict info to the fetched doc's own _conflicts
  // field, never to row.value — so include_docs is required, and
  // row.doc._conflicts (not row.value.conflicts, which does not exist) is the
  // field to read. Reading row.value.conflicts silently yields a zero count.
  const r = await db.allDocs({ include_docs: true, conflicts: true });
  const count = r.rows.filter((row: any) => row.doc?._conflicts?.length).length;
  syncState.conflictCount = count;
  notify();
  return count;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!isSyncEnabled()) return; // an explicit pause must not auto-resume on reconnect
    if (syncState.status === 'offline') { syncState.status = 'syncing'; notify(); }
    syncNow().catch(() => {});
  });
  window.addEventListener('offline', () => {
    syncState.status = 'offline'; syncState.error = null; notify();
  });
}

// Both startSync() and syncNow() attach these handlers to a *single* live
// replication (_syncHandler). Never run a second concurrent db.sync() against
// the same remote: two replications race to write the same docs and duplicate
// the traffic.
//
// The push/pull sub-replication listeners are load-bearing, not redundant:
// db.sync()'s combined Sync object emits a bare 'paused' (no error) whenever
// either direction pauses, discarding the argument the underlying
// sub-replication's own 'paused' carried. Under `retry: true` a connection
// failure emits 'paused' *with* the error on the sub-replication only, and
// the combined object's 'error' never fires because the replication promise
// never rejects — PouchDB retries forever. Listening only to the combined
// object therefore reports any retryable connectivity failure as a successful
// "synced". handler.push/handler.pull are public properties of PouchDB's Sync
// class; reading the error from them keeps `retry: true`'s auto-reconnect.
//
// Exported for tests — accepts any object with a chainable `.on(event, cb)`
// and optional `.push`/`.pull` sub-objects of the same shape, so a dropped
// connection can be exercised without a real replication.
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

export async function startSync(): Promise<void> {
  if (_syncHandler) { _syncHandler.cancel(); _syncHandler = null; }
  // An explicit pause takes priority over auto-starting on init.
  if (!isSyncEnabled()) { syncState.status = 'idle'; notify(); return; }
  // No server configured yet — don't attempt new PouchDB('', ...), which
  // creates a nonsense local database instead of failing loudly. Stay 'idle';
  // Settings' Sync tab renders "Not connected to another device yet" for this.
  if (!getSyncUrl()) { syncState.status = 'idle'; notify(); return; }
  if (!navigator.onLine) { syncState.status = 'offline'; notify(); }
  _syncHandler = attachSyncHandlers(db.sync(await remote(), { live: true, retry: true }));
}

// Pause: cancels the live replication without touching the configured URL
// (setSyncUrl('') would drop the server config entirely, which a pause must not do).
export function cancelSync() {
  if (_syncHandler) { _syncHandler.cancel(); _syncHandler = null; }
  syncState.status = 'idle';
  notify();
}

export async function syncNow(): Promise<void> {
  // Same "nothing configured yet" guard as startSync() — resolve
  // immediately rather than attempting new PouchDB('', ...).
  if (!getSyncUrl()) { syncState.status = 'idle'; notify(); return; }
  syncState.status = 'syncing'; notify();
  if (_syncHandler) _syncHandler.cancel();
  const remoteDb = await remote();
  return new Promise((resolve, reject) => {
    _syncHandler = attachSyncHandlers(db.sync(remoteDb, { live: true, retry: true }), (err) => {
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

// seedIfEmpty() gives every fresh install space:unsorted/personal/work +
// project:draft under FIXED ids, so two independently-seeded devices collide
// on those 4 ids the moment they first pair. Called from discovery.ts's
// pairWithHost() right before sync starts: if this device has never held real
// content (zero tasks — the seed creates none), its pristine seed is safe to
// discard so the upcoming pull creates the host's versions cleanly instead of
// forking a divergent revision history. The zero-tasks check is what protects
// a device already in real use — not "is this the first pair attempt".
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
  // getSpaces() always runs -- never gate it behind SEEDED_KEY. If the DB is
  // legitimately empty again while the flag survives (a wipe that doesn't
  // clear localStorage, a partial first run), a stale flag would leave the app
  // silently empty forever. The scan is tiny and only matters while empty.
  const existing = await getSpaces();
  if (existing.length > 0) { localStorage.setItem(SEEDED_KEY, '1'); return; }

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

// Duplicate-name nudge. Case-insensitive/trimmed match, never blocking; the
// caller decides whether to show a dismissible hint.
export async function findSpacesByName(name: string, excludeId?: string): Promise<SpaceDoc[]> {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  const all = await getSpaces();
  return all.filter(s => s._id !== excludeId && s.name.trim().toLowerCase() === key);
}

export async function createSpace(name: string, color: string, icon?: string): Promise<SpaceDoc> {
  const existing = await getSpaces();
  const position = existing.length ? Math.max(...existing.map(s => s.position)) + 1 : 0;
  const doc: SpaceDoc = {
    _id: `space:${nanoid()}`, type: 'space', name, color, ...(icon ? { icon } : {}), position,
    updated_at: now(), source: SOURCE,
  };
  await db.put(doc);
  await logChange(doc._id!, 'create', undefined, undefined, undefined, { space_name: name });
  return doc;
}

export async function updateSpace(id: string, changes: Partial<Pick<SpaceDoc, 'name' | 'color' | 'icon'>>): Promise<SpaceDoc> {
  const doc = await db.get<SpaceDoc>(id);
  const updated = { ...doc, ...changes, updated_at: now(), source: SOURCE };
  await db.put(updated);
  const skip = new Set(['updated_at', 'source']);
  // Keyed to what `changes` can contain, not all of SpaceDoc: `keyof SpaceDoc`
  // is wider than the object being indexed, making every lookup implicit `any`.
  for (const key of Object.keys(changes) as (keyof typeof changes)[]) {
    if (skip.has(key)) continue;
    if (JSON.stringify(doc[key]) === JSON.stringify(changes[key])) continue;
    await logChange(id, 'update', key, doc[key], changes[key], { space_name: doc.name });
  }
  return updated;
}

// Deliberately unlogged, like task drag-reorder within a column (updateTask's
// diff skip set excludes `position`): a pure display-order tweak is changelog
// noise, not a real edit.
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

// Archived projects are hidden from getProjects() the same way archived tasks
// are hidden from getTasksForProject(); this is the restore-list counterpart.
export async function getArchivedProjects(): Promise<ProjectDoc[]> {
  const r = await db.allDocs<ProjectDoc>({ startkey: 'project:', endkey: 'project:￰', include_docs: true });
  return r.rows.map(r => r.doc!).filter(d => d && !(d as any)._deleted && !!d.archived)
    .sort((a, b) => a.position - b.position);
}

// Duplicate-name nudge — cross-space on purpose, so the caller can show which
// space(s) already have this name.
export async function findProjectsByName(name: string, excludeId?: string): Promise<ProjectDoc[]> {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  const all = await getProjects();
  return all.filter(p => p._id !== excludeId && p.name.trim().toLowerCase() === key);
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

// "New from template". Always copies the template's status structure (column
// names, fresh ids); copies open tasks (non-deleted, non-archived, not in the
// last column — the positional "done" check) only if copyOpenTasks is set.
// Copied tasks get fresh ids/timestamps, cleared due_date/reminder_at (a
// template's deadlines don't apply to a new instance) and unchecked checklist
// items; title, body, priority and tags carry over as-is.
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
        recurrence: null, // needs a due_date to advance from -- cleared same as due_date above
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

// Custom fields are global, not per-project: every task shares the same field
// definitions, configured once from Settings → Organize. Stored as a single
// fixed-id doc rather than a `field:` range scan — there's only ever one list
// to read/write, never a query over many.
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

// Renaming is always safe: tasks store values keyed by field *id*, never by
// name. Changing type/options is left to the caller's judgment — an existing
// text value under a field switched to 'number' simply won't parse until the
// task is edited again, which is not a crash.
export async function updateCustomFieldDef(fieldId: string, patch: { name?: string; type?: CustomFieldDef['type']; options?: string[] }): Promise<CustomFieldDef[]> {
  let doc: any;
  try { doc = await db.get(CUSTOM_FIELDS_DOC_ID); } catch { return []; }
  const fields = (doc.fields ?? []).map((f: CustomFieldDef) => f.id === fieldId ? { ...f, ...patch } : f);
  await db.put({ ...doc, fields, updated_at: now(), source: SOURCE });
  await logChange(fieldId, 'update', undefined, undefined, undefined, { field_name: patch.name });
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
  // Logged after the doc is already gone, so this ref won't resolve to a live
  // project if clicked through -- same as any other deleted-item log row.
  await logChange(id, 'delete', undefined, undefined, undefined, { project_name: doc.name });
}

// Soft archive for a whole project: the project doc stays (never
// db.remove()'d) and only its non-done tasks get archived: true — tasks
// already in the last column (positionally "done") are left alone.
// unarchiveProject() only un-hides the project itself; the tasks it swept up
// restore individually via the per-task archived toggle.
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
    // pouchdb-find silently defaults to 25 results — always pass an explicit
    // limit, or any project past 25 tasks truncates without warning.
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

// Duplicate-title nudge, scoped to *within one project* on purpose (unlike
// findProjectsByName/findSpacesByName): task titles repeat harmlessly across a
// workspace ("Follow up", "Review"), so a global check would just be noise.
export async function findTasksByTitleInProject(projectId: string, title: string, excludeId?: string): Promise<TaskDoc[]> {
  const key = title.trim().toLowerCase();
  if (!key) return [];
  const tasks = await getTasksForProject(projectId);
  return tasks.filter(t => t._id !== excludeId && t.title.trim().toLowerCase() === key);
}

// Fuzzy duplicate-notes nudge — a global scan (unlike the task-title check
// above), since a duplicated note plausibly lives in a different project than
// where it was first written. Skips bodies under 20 chars: word-overlap
// similarity is meaningless noise at that length. Local word-overlap only,
// never a network call.
export async function findSimilarNotes(taskId: string | null, body: string, threshold = 0.6): Promise<{ taskId: string; title: string; similarity: number }[]> {
  const text = body.trim();
  if (text.length < 20) return [];
  const all = await getAllTasksRaw();
  const out: { taskId: string; title: string; similarity: number }[] = [];
  for (const t of all) {
    if (t._id === taskId || t.deleted || !t.body || t.body.trim().length < 20) continue;
    const sim = wordOverlapSimilarity(text, t.body);
    if (sim >= threshold) out.push({ taskId: t._id!, title: t.title, similarity: sim });
  }
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
}

// Task linking: non-directional "related to", with no dependency semantics.
// Stored forward-only on whichever task the link was added from
// (TaskDoc.related); the reverse direction is computed here by scanning for
// tasks whose own `related` names this one. Do not mirror-write both docs —
// PouchDB can't write two docs atomically, so one side could land and the
// other not. A soft-deleted linked task still resolves and is included so the
// UI can show it as "(deleted)"; only a purged task (404) is filtered out.
export async function getRelatedTasks(taskId: string): Promise<TaskDoc[]> {
  const task = await getTaskById(taskId);
  const forwardIds = task?.related ?? [];
  const all = await getAllTasksRaw();
  const reverseIds = all.filter(t => t._id !== taskId && (t.related ?? []).includes(taskId)).map(t => t._id!);
  const ids = [...new Set([...forwardIds, ...reverseIds])];
  const resolved = await Promise.all(ids.map(id => getTaskById(id)));
  return resolved.filter((t): t is TaskDoc => t !== null);
}

// Board/list-card indicator ("this task has related links") without a per-card
// query: one scan of the cached task list yields every id participating in a
// link from either direction, so rendering is an O(1) Set lookup per card
// instead of re-deriving getRelatedTasks() for each one.
export async function getTaskIdsWithRelatedLinks(): Promise<Set<string>> {
  const all = await getAllTasksRaw();
  const ids = new Set<string>();
  for (const t of all) {
    if (t.related?.length) {
      ids.add(t._id!);
      for (const r of t.related) ids.add(r);
    }
  }
  return ids;
}

export async function searchTasksForLinking(query: string, excludeId: string, alreadyLinkedIds: string[]): Promise<TaskDoc[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await getAllTasksRaw();
  const exclude = new Set([excludeId, ...alreadyLinkedIds]);
  return all
    .filter(t => !t.deleted && !exclude.has(t._id!) && t.title.toLowerCase().includes(q))
    .slice(0, 8);
}

// Immediate-write (unlike Tags/Checklist, which batch into CardDetail's
// Save button) — idempotent, checking both docs' existing arrays first
// so linking from either task's card never stores the same relationship
// twice.
export async function linkRelatedTask(taskId: string, otherId: string): Promise<void> {
  if (taskId === otherId) return;
  const [a, b] = await Promise.all([getTaskById(taskId), getTaskById(otherId)]);
  if (!a || !b) return;
  const alreadyLinked = (a.related ?? []).includes(otherId) || (b.related ?? []).includes(taskId);
  if (alreadyLinked) return;
  await updateTask(taskId, { related: [...(a.related ?? []), otherId] });
}

// Removes a related-task link regardless of which of the two docs
// actually stores it (the link is non-directional in meaning even
// though only ever written to one side) — so "unlink" always works from
// either task's card, including the one that only ever saw it as a
// reverse (read-time-computed) link.
export async function unlinkRelatedTask(taskId: string, otherId: string): Promise<void> {
  const [a, b] = await Promise.all([getTaskById(taskId), getTaskById(otherId)]);
  if (a?.related?.includes(otherId)) await updateTask(taskId, { related: a.related.filter(id => id !== otherId) });
  if (b?.related?.includes(taskId)) await updateTask(otherId, { related: b.related.filter(id => id !== taskId) });
}

// ── Blocked by ───────────────────────────────────────────────────────────────
// A real, directional dependency (unlike `related` above, which is
// deliberately non-directional). Stored only on the blocked task's own
// `blocked_by` array, never mirrored onto the blocker doc.

// Same soft-delete-friendly resolution as getRelatedTasks(): a soft-deleted
// blocker still resolves so the UI can show "(deleted)"; only a purged task
// (404) is filtered out.
export async function getBlockingTasks(taskId: string): Promise<TaskDoc[]> {
  const task = await getTaskById(taskId);
  const ids = task?.blocked_by ?? [];
  if (!ids.length) return [];
  const resolved = await Promise.all(ids.map(id => getTaskById(id)));
  return resolved.filter((t): t is TaskDoc => t !== null);
}

// "Done" is positional (column_id === the blocker's own project's last
// column), computed at read time, so a blocker's status can never drift out of
// sync with a separately-stored boolean.
export function isBlockerResolved(blocker: TaskDoc, lastColByProject: Record<string, string | undefined>): boolean {
  if (blocker.deleted) return true; // a deleted blocker can no longer hold anything up
  const lastCol = lastColByProject[blocker.project_id];
  return lastCol !== undefined && blocker.column_id === lastCol;
}

function computeBlockedTaskIds(all: TaskDoc[], lastColByProject: Record<string, string | undefined>): Set<string> {
  const byId = new Map(all.map(t => [t._id!, t]));
  const blocked = new Set<string>();
  for (const t of all) {
    if (!t.blocked_by?.length) continue;
    const stillBlocked = t.blocked_by.some(id => {
      const blocker = byId.get(id);
      return blocker && !isBlockerResolved(blocker, lastColByProject);
    });
    if (stillBlocked) blocked.add(t._id!);
  }
  return blocked;
}

// Board/list-card indicator, same pattern as getTaskIdsWithRelatedLinks above
// — one full scan instead of a per-card query.
export async function getTaskIdsBlocked(): Promise<Set<string>> {
  const [all, allProjects] = await Promise.all([getAllTasksRaw(), getProjects()]);
  const lastColByProject = Object.fromEntries(allProjects.map(p => [p._id, p.columns.at(-1)?.id]));
  return computeBlockedTaskIds(all, lastColByProject);
}

// Walks blockerId's own `blocked_by` chain looking for taskId — if found,
// linking blockerId onto taskId would close a cycle (taskId waiting on
// blockerId waiting on ... waiting on taskId, which can never resolve).
// A plain visited-set DFS is enough: these dependency graphs are small and
// shallow by construction.
function wouldCreateCycle(taskId: string, blockerId: string, byId: Map<string, TaskDoc>): boolean {
  const visited = new Set<string>();
  const stack = [blockerId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of byId.get(id)?.blocked_by ?? []) stack.push(next);
  }
  return false;
}

// Immediate-write, same as linkRelatedTask above. Throws (rather than
// silently no-op'ing) on a cycle specifically, so the UI can show a
// distinct "that would create a circular dependency" message instead of
// the generic failure toast every other write error gets.
export async function linkBlockedBy(taskId: string, blockerId: string): Promise<void> {
  if (taskId === blockerId) return;
  const task = await getTaskById(taskId);
  if (!task) return;
  if (task.blocked_by?.includes(blockerId)) return;
  const all = await getAllTasksRaw();
  const byId = new Map(all.map(t => [t._id!, t]));
  if (wouldCreateCycle(taskId, blockerId, byId)) throw new Error('circular dependency');
  await updateTask(taskId, { blocked_by: [...(task.blocked_by ?? []), blockerId] });
}

export async function unlinkBlockedBy(taskId: string, blockerId: string): Promise<void> {
  const task = await getTaskById(taskId);
  if (task?.blocked_by?.includes(blockerId)) {
    await updateTask(taskId, { blocked_by: task.blocked_by.filter(id => id !== blockerId) });
  }
}

// `overrides` lets a caller set more than the title in the same write as
// creation. A create() followed by an update() would log two entries
// ("Created" then "Edited") for what should read as one action.
export async function createTask(
  projectId: string, spaceId: string, columnId: string, title: string,
  overrides?: Partial<Pick<TaskDoc, 'priority' | 'due_date' | 'reminder_at' | 'tags' | 'body' | 'custom_values' | 'checklist' | 'recurrence' | 'recurrenceInterval' | 'recurrenceWeekdaysOnly'>>,
): Promise<TaskDoc> {
  const existing = await getTasksForProject(projectId);
  const colTasks = existing.filter(t => t.column_id === columnId);
  const maxPos = colTasks.length ? Math.max(...colTasks.map(t => t.position)) : 0;
  const ts = now();
  const doc: TaskDoc = {
    _id: `task:${nanoid()}`, type: 'task',
    project_id: projectId, space_id: spaceId, column_id: columnId,
    title, body: overrides?.body ?? '', priority: overrides?.priority ?? 1,
    due_date: overrides?.due_date ?? null, reminder_at: overrides?.reminder_at ?? null,
    tags: overrides?.tags ?? [],
    custom_values: overrides?.custom_values, checklist: overrides?.checklist,
    recurrence: overrides?.recurrence ?? null,
    recurrenceInterval: overrides?.recurrenceInterval, recurrenceWeekdaysOnly: overrides?.recurrenceWeekdaysOnly,
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

// `interval` multiplies the step -- every N days/weeks/months, defaulting to
// 1. `weekdaysOnly` only applies to daily: it skips forward past a landed-on
// Saturday/Sunday to the following Monday.
function advanceDate(dateStr: string, freq: 'daily' | 'weekly' | 'monthly', interval = 1, weekdaysOnly = false): string {
  const step = Math.max(1, interval);
  const d = new Date(`${dateStr}T00:00:00`);
  if (freq === 'daily') {
    d.setDate(d.getDate() + step);
    if (weekdaysOnly) {
      const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
      if (dow === 6) d.setDate(d.getDate() + 2);
      else if (dow === 0) d.setDate(d.getDate() + 1);
    }
    return localDateStr(d);
  }
  if (freq === 'weekly') { d.setDate(d.getDate() + step * 7); return localDateStr(d); }
  // Monthly: plain `d.setMonth(d.getMonth() + step)` overflows into the month
  // after next when the day-of-month doesn't exist there -- Jan 31 + 1 month
  // rolls to Mar 3, skipping February's occurrence entirely. Clamp to the
  // target month's real last day so a task due the 31st recurs on the
  // 28th/29th/30th of a shorter month.
  const day = d.getDate();
  const targetMonth = d.getMonth() + step; // may exceed 11 -- Date normalizes into a later year
  const daysInTargetMonth = new Date(d.getFullYear(), targetMonth + 1, 0).getDate();
  d.setDate(1); // avoid overflow while still on the original month
  d.setMonth(targetMonth);
  d.setDate(Math.min(day, daysInTargetMonth));
  return localDateStr(d);
}

// Computes the reset-in-place fields for a recurring task that just got
// completed. A recurring series is ONE task doc that resets, never a second
// spawned card -- completion is recorded only in the log entry updateTask()
// writes, so no duplicate card is ever left sitting in the done column.
function computeRecurrenceReset(doc: TaskDoc, proj: ProjectDoc): Partial<TaskDoc> | null {
  const firstColId = proj.columns[0]?.id;
  if (!firstColId || !doc.recurrence) return null;

  // Advances from the task's ORIGINAL due_date, not from today: a task due
  // every Monday stays on Monday even when completed on a Wednesday.
  // Advancing from "today" would drift the schedule on every late completion.
  const baseDate = doc.due_date ?? localDateStr(new Date());
  const nextDate = advanceDate(baseDate, doc.recurrence, doc.recurrenceInterval, doc.recurrenceWeekdaysOnly);

  let nextReminder: string | null = null;
  if (doc.remindOnDue) {
    const [h, m] = getDefaultReminderTime().split(':').map(Number);
    const d = new Date(`${nextDate}T00:00:00`);
    d.setHours(h, m, 0, 0);
    nextReminder = d.toISOString();
  } else if (doc.reminder_at) {
    // Shift the reminder by the same wall-clock delta the due date moved,
    // so a reminder set for "the evening before" stays the evening before.
    const deltaMs = new Date(`${nextDate}T00:00:00`).getTime() - new Date(`${baseDate}T00:00:00`).getTime();
    nextReminder = new Date(new Date(doc.reminder_at).getTime() + deltaMs).toISOString();
  }

  // Checklist structure carries over, but every item starts unchecked --
  // the new occurrence hasn't had any of its steps done yet.
  const resetChecklist = doc.checklist?.map(i => ({ text: i.text, done: false }));

  return { column_id: firstColId, due_date: nextDate, reminder_at: nextReminder, checklist: resetChecklist };
}

// Skip one recurrence occurrence: the same date/reminder/checklist advance a
// real completion gets, minus the column_id -- skipping isn't completing, so
// the task stays where it sits. Routed through updateTask() for the usual
// write-queue serialization, cache invalidation and log entry; because
// column_id never changes here it can't re-trigger computeRecurrenceReset().
export async function skipRecurrence(id: string): Promise<TaskDoc> {
  const doc = await db.get<TaskDoc>(id);
  if (!doc.recurrence) throw new Error('This task is not set to repeat.');
  let proj: ProjectDoc | null = null;
  try { proj = await db.get<ProjectDoc>(doc.project_id); } catch {}
  if (!proj) throw new Error("Could not find this task's project.");
  const reset = computeRecurrenceReset(doc, proj);
  if (!reset) throw new Error('This task is not set to repeat.');
  const { column_id, ...rest } = reset;
  return updateTask(id, rest);
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
function queueTaskWrite<T>(id: string, fn: () => Promise<T>): Promise<T> {
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

export function updateTask(id: string, changes: Partial<TaskDoc>): Promise<TaskDoc> {
  return queueTaskWrite(id, () => updateTaskImpl(id, changes));
}

async function updateTaskImpl(id: string, changes: Partial<TaskDoc>): Promise<TaskDoc> {
  const doc = await db.get<TaskDoc>(id);

  // Resolve project once -- needed both to detect "moved into the last
  // column" (this app's positional definition of "done") and, if so,
  // to compute the recurrence reset below.
  let proj: ProjectDoc | null = null;
  try { proj = await db.get<ProjectDoc>(doc.project_id); } catch {}

  const isMove      = changes.column_id !== undefined && changes.column_id !== doc.column_id;
  const isDelete    = !!changes.deleted;
  const isCompleting = isMove && !!proj && changes.column_id === proj.columns.at(-1)?.id;

  // recurrenceReset's fields win over `changes` on conflict (e.g. a
  // recurring task can't be simultaneously "completed" and manually
  // moved somewhere else in the same call -- completion takes priority),
  // but everything else the caller sent (title/tags/priority edited in
  // the same CardDetail save, say) still applies normally.
  const recurrenceReset = isCompleting && doc.recurrence && proj ? computeRecurrenceReset(doc, proj) : null;
  const finalChanges: Partial<TaskDoc> = recurrenceReset ? { ...changes, ...recurrenceReset } : changes;

  await db.put({ ...doc, ...finalChanges, updated_at: now(), source: SOURCE });
  invalidateTaskCache();

  // Collect genuinely changed fields (excluding position/meta) -- always
  // against `changes` (what the caller asked for), not finalChanges, so
  // a completed recurring task's diff list still reads as "what actually
  // changed" (due date moved, checklist reset) rather than being
  // swallowed by comparing against itself.
  const skip = new Set(['updated_at', 'source', 'position', 'column_id']);
  // undefined/null and an empty object/array both mean "nothing here".
  // CardDetail.save() always sends the full custom_values/checklist shape
  // (defaulting to {}/[]), while a task that never had either stores the field
  // as undefined. Without this check every save on such a task logs a false
  // "Custom fields updated"/"Checklist updated" diff: JSON.stringify(undefined)
  // returns undefined, which never equals "{}" or "[]".
  const isEmpty = (v: any) => v == null || (typeof v === 'object' && Object.keys(v).length === 0);
  const diffs: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(finalChanges) as (keyof TaskDoc)[]) {
    if (skip.has(key)) continue;
    const from = doc[key], to = finalChanges[key];
    if (isEmpty(from) && isEmpty(to)) continue;
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      diffs[key] = { from, to };
    }
  }

  const projName = proj?.name;
  const taskTitle = (changes.title as string | undefined) ?? doc.title;

  // isDelete checked first: only one log entry is written per call, and if a
  // caller ever combined a delete with a column move, logging "moved" and
  // dropping the delete from history would be the worse outcome.
  if (isDelete) {
    await logChange(id, 'delete', undefined, undefined, undefined, { task_title: doc.title, project_name: projName });
  } else if (isMove) {
    // Logs the transition the user actually triggered (Backlog -> Done),
    // not the auto-reset resting state (back in Backlog) -- diffs still
    // shows the real due-date/checklist changes so the log entry reads as
    // "moved to Done, due date advanced to <next>" even though the task
    // itself never stays there.
    const fromName = proj?.columns.find(c => c.id === doc.column_id)?.name ?? doc.column_id;
    const toName   = proj?.columns.find(c => c.id === changes.column_id)?.name ?? changes.column_id!;
    await logChange(id, 'move', 'column_id', fromName, toName, {
      task_title: taskTitle, project_name: projName,
      diffs: Object.keys(diffs).length ? diffs : undefined,
    });
  } else if (Object.keys(diffs).length) {
    await logChange(id, 'update', undefined, undefined, undefined, { task_title: taskTitle, project_name: projName, diffs });
  }

  return { ...doc, ...finalChanges, updated_at: now(), source: SOURCE } as TaskDoc;
}

// ── Attachments ──────────────────────────────────────────────────────────────
// The bytes live in PouchDB's own `_attachments` map on the task doc, so they
// ride existing replication with no extra code and unchanged content is
// deduped by digest on every sync. TaskDoc.attachments is only the small,
// loggable/diffable metadata list (see types.ts). These writers use
// queueTaskWrite() -- same get-then-put shape on the same doc id as
// updateTask(), so they need the same per-id serialization.

export const ATTACHMENT_MAX_PER_TASK = 10;

export interface AddAttachmentInput {
  filename: string;
  base64Data: string; // already base64-encoded, and for images already downscaled/compressed by the caller
  size: number;        // final byte size (post-compression) -- what the 10MB cap and Settings' storage breakdown care about
}

export async function addAttachment(taskId: string, input: AddAttachmentInput): Promise<TaskDoc> {
  if (!isAttachmentExtensionAllowed(input.filename)) {
    throw new Error(`Unsupported file type: .${attachmentExtension(input.filename) || '?'}`);
  }
  if (input.size > ATTACHMENT_MAX_BYTES) {
    throw new Error(`File too large (max ${ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB)`);
  }
  return queueTaskWrite(taskId, () => addAttachmentImpl(taskId, input));
}

async function addAttachmentImpl(taskId: string, input: AddAttachmentInput): Promise<TaskDoc> {
  const doc = await db.get<TaskDoc>(taskId);
  const prevMeta = doc.attachments ?? [];
  // Checked inside the per-doc write queue, not in addAttachment()'s
  // synchronous pre-check -- two concurrent calls on the same task must each
  // see the other's count, or both pass a "9 < 10" check and end up with 11.
  if (prevMeta.length >= ATTACHMENT_MAX_PER_TASK) {
    throw new Error(`This task already has ${ATTACHMENT_MAX_PER_TASK} attachments (the max per task)`);
  }
  const key = `att:${nanoid()}`;
  const contentType = attachmentMimeType(input.filename);
  const meta: TaskAttachment = { key, filename: input.filename, content_type: contentType, size: input.size, added_at: now() };
  const nextMeta = [...prevMeta, meta];

  await db.put({
    ...doc,
    attachments: nextMeta,
    // Existing entries in _attachments come back from db.get() as stubs
    // (content_type/digest/length, no data) unless {attachments:true} was
    // requested -- PouchDB recognizes stub entries on put() and keeps their
    // existing content as-is rather than requiring every attachment to be
    // re-sent on every write. Only the new key needs real `data` here.
    _attachments: { ...(doc as any)._attachments, [key]: { content_type: contentType, data: input.base64Data } },
    updated_at: now(), source: SOURCE,
  } as any);
  invalidateTaskCache();
  await logChange(taskId, 'update', 'attachments', prevMeta, nextMeta, { task_title: doc.title });
  return db.get<TaskDoc>(taskId);
}

export async function deleteAttachment(taskId: string, key: string): Promise<TaskDoc> {
  return queueTaskWrite(taskId, () => deleteAttachmentImpl(taskId, key));
}

async function deleteAttachmentImpl(taskId: string, key: string): Promise<TaskDoc> {
  const doc = await db.get<TaskDoc>(taskId);
  const prevMeta = doc.attachments ?? [];
  const nextMeta = prevMeta.filter(a => a.key !== key);
  const nextAttachments = { ...(doc as any)._attachments };
  delete nextAttachments[key];

  await db.put({
    ...doc,
    attachments: nextMeta,
    _attachments: nextAttachments,
    updated_at: now(), source: SOURCE,
  } as any);
  invalidateTaskCache();
  await logChange(taskId, 'update', 'attachments', prevMeta, nextMeta, { task_title: doc.title });
  return db.get<TaskDoc>(taskId);
}

// Returns the raw file content for preview/download -- a Blob in every
// environment this app runs in (browser, Capacitor WebView, Tauri webview).
export async function getAttachmentBlob(taskId: string, key: string): Promise<Blob> {
  return db.getAttachment(taskId, key) as Promise<Blob>;
}

// ── Undo (recently deleted, sourced from the database) ────────────────────────
// Tasks are soft-deleted (deleted: true), so "recently deleted" needs no
// storage of its own — it's just a query, and undo survives a page refresh.

const _undoListeners = new Set<() => void>();
export function subscribeUndo(fn: () => void) { _undoListeners.add(fn); return () => _undoListeners.delete(fn); }

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
  // Deliberately no _undoListeners notify here (unlike deleteTask above) --
  // that listener is showUndoToast(), which pulls the single most-recently-
  // deleted task. Firing it after an undo pops a fresh "Undo" toast for the
  // *next* most-recent deleted task, chaining toasts endlessly.
}

// ── Trash (its own view — see TrashView.svelte) ─────────────────────────────
// The full deleted-items list, unlike the last-10 getRecentlyDeleted()
// returns for the undo toast, plus permanent deletion and bulk "Empty Trash".

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
  // db.put(), so it logs a changelog entry the way archiving does.
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

// Restoring a backup is the app's emergency exit: it must work against a file
// that may be old, hand-edited, truncated, or written by a much older version.
// Three hazards it guards against:
//
//  1. Attachment stubs take the WHOLE restore down. A backup can store
//     `{stub: true}` with no bytes, and PouchDB rejects an entire bulkDocs
//     batch with `missing_stub` if any doc carries a stub it can't resolve --
//     one attached photo would make every doc in the file unrestorable. Stubs
//     are dropped (losing an attachment beats losing the backup); real inlined
//     base64 `data` is kept.
//  2. Custom-field definitions and tag colours must not be filtered out, or
//     restored tasks keep `custom_values` keyed to field ids that no longer
//     exist -- values present but invisible in the UI.
//  3. A project doc missing `columns` imports fine and then crashes the
//     Dashboard, Kanban, List, FilterBar and CardDetail on `columns.at(-1)`,
//     so structure is normalized on the way in.
function sanitizeImportedDoc(d: any): any {
  const out = { ...d };

  if (out._attachments && typeof out._attachments === 'object') {
    const kept: Record<string, any> = {};
    for (const [key, att] of Object.entries<any>(out._attachments)) {
      if (att && typeof att.data === 'string') kept[key] = att; // real base64 payload
    }
    if (Object.keys(kept).length) out._attachments = kept;
    else delete out._attachments;
    // Keep the metadata array honest about what actually came back.
    if (Array.isArray(out.attachments)) {
      out.attachments = out.attachments.filter((a: any) => a?.key && kept[a.key]);
    }
  }

  if (out.type === 'project') {
    const cols = Array.isArray(out.columns)
      ? out.columns.filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string')
      : [];
    // A project with no usable columns is the shape that crashes every
    // view reading columns.at(-1). Give it the standard starter set
    // rather than importing a landmine.
    out.columns = cols.length ? cols : DEFAULT_COLS;
    if (typeof out.name !== 'string') out.name = 'Untitled project';
  }

  if (out.type === 'task') {
    if (!Array.isArray(out.tags)) out.tags = [];
    if (typeof out.title !== 'string') out.title = 'Untitled task';
    if (typeof out.priority !== 'number') out.priority = 0;
    if (typeof out.position !== 'number') out.position = 0;
  }

  if (out.type === 'space' && typeof out.name !== 'string') out.name = 'Untitled space';

  return out;
}

export async function importJSON(docs: any[]): Promise<{ ok: number; skipped: number }> {
  const valid = docs
    .filter(d =>
      d && d._id && typeof d._id === 'string' &&
      // 'meta' carries the custom-field definitions and 'tag_color' the
      // per-tag colour overrides -- dropping either orphans restored custom
      // values (see #2 above).
      ['space', 'project', 'task', 'meta', 'tag_color'].includes(d.type) &&
      // A task pointing at no project can never be rendered anywhere.
      !(d.type === 'task' && typeof d.project_id !== 'string')
    )
    .map(sanitizeImportedDoc);
  // A doc whose id already exists locally must be overwritten with the
  // backup's content (restore "merges instead of duplicating"). Fetch each
  // existing doc's current _rev and attach it so bulkDocs treats a collision
  // as a real update. Stripping _rev unconditionally instead makes PouchDB
  // reject every collision with a 409, silently leaving the local doc
  // untouched while still reporting success.
  const existing = await db.allDocs({ keys: valid.map(d => d._id) });
  const revById = new Map<string, string>();
  for (const row of existing.rows as any[]) {
    if (!row.error && row.value?.rev) revById.set(row.id, row.value.rev);
  }
  const clean = valid.map(({ _rev, ...d }) => {
    const rev = revById.get(d._id);
    return rev ? { ...d, _rev: rev } : d;
  });
  // bulkDocs normally reports per-doc results, but some error classes
  // (missing_stub in particular) reject the entire call, losing every good doc
  // alongside the bad one. All-or-nothing is the wrong failure mode for a
  // restore, so fall back to writing doc by doc and salvage whatever lands.
  let results: any[];
  try {
    results = await db.bulkDocs(clean) as any[];
  } catch (e) {
    console.warn('bulk import rejected wholesale, retrying per-document', e);
    results = [];
    for (const doc of clean) {
      try {
        await db.put(doc);
        results.push({ ok: true });
      } catch (err) {
        results.push({ error: err });
      }
    }
  }
  invalidateTaskCache();
  const ok = results.filter((r: any) => !r.error).length;
  const skipped = results.filter((r: any) => r.error).length;
  return { ok, skipped };
}

// Read-only pass over a parsed import file so the UI can preview "what will
// happen" before anything is written. It does not check against the live DB
// (PouchDB has no dry-run for bulkDocs): "will be skipped" means "malformed,
// or not one of space/project/task". A doc colliding with an existing id is
// reported as "created" and genuinely overwritten by importJSON.
export function analyzeImport(docs: any[]): { toCreate: number; toSkip: number; byType: Record<string, number> } {
  const byType: Record<string, number> = { space: 0, project: 0, task: 0 };
  let toSkip = 0;
  for (const d of docs) {
    if (d?._id && typeof d._id === 'string' && d.type in byType) byType[d.type]++;
    else toSkip++;
  }
  return { toCreate: docs.length - toSkip, toSkip, byType };
}

// Export a single project — the project doc plus its own tasks only, never
// the space it belongs to: including the space would silently duplicate
// spaces on re-import.
export async function exportProjectDocs(projectId: string): Promise<any[]> {
  const project = await db.get(projectId);
  const tasks = (await getAllTasksRaw()).filter(t => t.project_id === projectId && !t.deleted);
  return [project, ...tasks];
}

// CSV export — every non-deleted task, one row each. Status/Priority resolve
// to display names, not raw column_id / 1-2-3: CSV is a one-way, human-facing
// format. JSON export is the round-trippable one.
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

// Optional projectId narrows to just that project's tags — used to rank
// tag-input suggestions "used in this project" first.
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

// Per-tag color override: one small doc per overridden tag (`tag:<name>`),
// point-lookup only, and unlogged like the bulk tag operations above.
// ExistingDocument, not the bare TagColorDoc: `_rev` is optional on the
// interface (a doc being *created* doesn't have one yet) but db.get() only
// ever returns a doc that already exists, so it's always present here.
// Saying so is what lets callers pass the result straight to db.remove(),
// which requires a real _rev.
async function getTagColorDoc(tag: string): Promise<PouchDB.Core.ExistingDocument<TagColorDoc> | undefined> {
  try { return await db.get<TagColorDoc>(`tag:${tag}`); } catch { return undefined; }
}

export async function getTagColorOverrides(): Promise<Record<string, string>> {
  const r = await db.allDocs<TagColorDoc>({ startkey: 'tag:', endkey: 'tag:￰', include_docs: true });
  const out: Record<string, string> = {};
  for (const row of r.rows) if (row.doc) out[row.doc.tag] = row.doc.color;
  return out;
}

// color === null clears the override, reverting that tag back to its
// deterministic hash color (tagColors.ts).
export async function setTagColor(tag: string, color: string | null): Promise<void> {
  const existing = await getTagColorDoc(tag);
  if (color === null) {
    if (existing) await db.remove(existing);
    return;
  }
  await db.put<TagColorDoc>({
    _id: `tag:${tag}`,
    _rev: existing?._rev,
    type: 'tag_color',
    tag,
    color,
    updated_at: now(),
    source: SOURCE,
  });
}

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
  // Carry the old tag's color override to the new name -- but only if the
  // new name doesn't already have its own override, since merging into an
  // existing tag should keep that tag's color, not the one being merged away.
  const oldColorDoc = await getTagColorDoc(oldTag);
  if (oldColorDoc) {
    const newHasOverride = await getTagColorDoc(trimmed);
    if (!newHasOverride) await setTagColor(trimmed, oldColorDoc.color);
    await db.remove(oldColorDoc);
  }
  return updates.length;
}

export async function deleteTagEverywhere(tag: string): Promise<number> {
  const all = await getAllTasksRaw();
  const affected = all.filter(t => !t.deleted && t.tags?.includes(tag));
  const updates = affected.map(t => ({
    ...t,
    tags: t.tags.filter(x => x !== tag),
    updated_at: now(), source: SOURCE,
  }));
  if (updates.length) {
    await db.bulkDocs(updates);
    invalidateTaskCache();
  }
  const colorDoc = await getTagColorDoc(tag);
  if (colorDoc) await db.remove(colorDoc);
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
    // Project archived (or missing) -- fully hidden from the agenda, same
    // as everywhere else; archived project details live in Settings only.
    if (!proj) continue;
    const lastColId = proj.columns.at(-1)?.id;
    // Already marked done (sitting in the last/"Completed" column) — leave
    // it off the agenda instead of showing it forever after "Mark done".
    if (lastColId && t.column_id === lastColId) continue;
    result.push({ ...t, project_name: proj.name });
  }
  return result.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
}

// Focus view is a daily commitment lock, not an auto-computed priority list:
// the user picks up to 3 tasks a day. The lock itself (which 3, which day)
// lives in localStorage (FocusView.svelte), not a PouchDB doc — ephemeral
// per-day UI state, not data worth syncing. This function supports only the
// picker: a flat list of open tasks, using the same "done = last column"
// exclusion as getAllTasksDue()/searchAllTasks().
export async function getOpenTasksForFocusPicker(): Promise<(TaskDoc & { project_name?: string })[]> {
  const [all, allProjects] = await Promise.all([getAllTasksRaw(), getProjects()]);
  const projCache: Record<string, ProjectDoc> = Object.fromEntries(allProjects.map(p => [p._id, p]));
  const lastColOf = (pid: string) => projCache[pid]?.columns.at(-1)?.id;
  // Requires the project to still be active (in projCache) -- otherwise an
  // archived project's leftover done tasks would resolve lastColOf() to
  // undefined and read as "not done" here, making them pickable in Focus.
  const notDone = (t: TaskDoc) => !t.deleted && !t.archived && !!projCache[t.project_id] && t.column_id !== lastColOf(t.project_id);
  // A task still waiting on an unresolved dependency can't be picked up today,
  // so it never reaches the picker list rather than being flagged once chosen.
  const lastColByProject = Object.fromEntries(allProjects.map(p => [p._id, p.columns.at(-1)?.id]));
  const blockedIds = computeBlockedTaskIds(all, lastColByProject);
  return all
    .filter(t => notDone(t) && !blockedIds.has(t._id!))
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
  // hasOwnProperty (not just an undefined check on the value) distinguishes
  // "project exists but has zero columns" (key present, value undefined --
  // keep the reminder) from "project doesn't exist or is archived" (key
  // absent -- an archived project's leftover done tasks must not still
  // fire reminders).
  return all.filter(d =>
    !d.deleted && !d.archived && d.reminder_at &&
    Object.prototype.hasOwnProperty.call(lastColByProject, d.project_id) &&
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

// Pure orchestration for Settings' maintenance run: SettingsPanel.svelte wires
// this to its reactive step-list UI via the onStep callback, so the
// sequencing/error-handling stays testable without mounting the component.
type MaintStepKey = 'check' | 'repair' | 'history' | 'trash' | 'compact';
export type MaintStatus = 'running' | 'done' | 'skipped' | 'error';
export interface MaintStepResult { key: MaintStepKey; status: MaintStatus; note: string }

// Emits a 'running' result for each step right before it starts (so the
// caller's UI can show a per-step spinner) and one final done/skipped/error
// result once it settles -- callers that only care about the end state can
// filter for `status !== 'running'`.
export async function runMaintenanceSteps(onStep: (result: MaintStepResult) => void): Promise<{ remainingIssues: IntegrityIssue[] }> {
  let remainingIssues: IntegrityIssue[] = [];

  onStep({ key: 'check', status: 'running', note: '' });
  const { issues, checked } = await checkIntegrity();
  onStep({ key: 'check', status: 'done', note: issues.length === 0 ? `No problems found (${checked} items checked)` : `${issues.length} issue${issues.length === 1 ? '' : 's'} found` });

  if (issues.length === 0) {
    onStep({ key: 'repair', status: 'skipped', note: 'Nothing to repair' });
  } else {
    onStep({ key: 'repair', status: 'running', note: '' });
    const { fixed, skipped } = await repairDatabase();
    onStep({ key: 'repair', status: 'done', note: `Fixed ${fixed}${skipped ? `, ${skipped} need manual review` : ''}` });
    if (skipped > 0) {
      const after = await checkIntegrity();
      remainingIssues = after.issues;
    }
  }

  onStep({ key: 'history', status: 'running', note: '' });
  const prunedLogs = await pruneOldLogs();
  onStep({ key: 'history', status: 'done', note: prunedLogs > 0 ? `Removed ${prunedLogs} entr${prunedLogs === 1 ? 'y' : 'ies'} older than 6 months` : 'Nothing old enough to remove' });

  onStep({ key: 'trash', status: 'running', note: '' });
  const prunedTasks = await pruneOldDeletedTasks();
  onStep({ key: 'trash', status: 'done', note: prunedTasks > 0 ? `Removed ${prunedTasks} item${prunedTasks === 1 ? '' : 's'} older than 3 months` : 'Nothing old enough to remove' });

  onStep({ key: 'compact', status: 'running', note: '' });
  await db.compact();
  onStep({ key: 'compact', status: 'done', note: 'Reclaimed disk space' });

  return { remainingIssues };
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
  // Every conflicting revision needs explicit removal — PouchDB and the sync
  // server don't auto-prune losing branches when a new revision is written.
  // That includes the adopted "other" revision: its content was copied into a
  // fresh revision above, but its old leaf is still a separate branch and
  // stays a live conflict unless removed too.
  for (const rev of losingRevs) {
    try { await db.remove(docId, rev); } catch {}
  }
  invalidateTaskCache();
  await scanConflicts();
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
  let handler: { cancel: () => void } | null = null;
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
      }) as unknown as { cancel: () => void };
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

export default db;
