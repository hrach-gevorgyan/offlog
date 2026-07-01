// PouchDB core is loaded as a UMD global via index.html <script src="/pouchdb.js">
// — that bundle is core-only and does NOT include pouchdb-find (createIndex/
// find), despite pouchdb-find being a project dependency and its types being
// referenced. Register it as a real plugin against the global constructor;
// without this, db.createIndex()/db.find() below would silently do nothing
// useful (createIndex no-ops, find() throws) since the methods don't exist.
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import PouchDBFind from 'pouchdb-find';
import { getSyncUrl, COUCH_USER, COUCH_PASS } from '../config';
import type { SpaceDoc, ProjectDoc, TaskDoc, Column, Source } from './types';

(PouchDB as any).plugin(PouchDBFind);

const SOURCE: Source = (window as any).Capacitor?.getPlatform() === 'android' ? 'mobile' : 'pc';
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
  return new PouchDB(getSyncUrl(), { auth: { username: COUCH_USER, password: COUCH_PASS } });
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
    type: 'log', ts, source: SOURCE, ref, action,
    ...(field !== undefined ? { field, from: from ?? null, to: to ?? null } : {}),
    ...(meta ?? {}),
  });
}

export async function getRecentLogs(limit = 80): Promise<any[]> {
  const r = await db.allDocs({ startkey: 'log:￰', endkey: 'log:', descending: true, limit, include_docs: true });
  return r.rows.map(r => r.doc!);
}

export async function getLogsForTask(taskId: string): Promise<any[]> {
  const r = await db.allDocs({ startkey: 'log:￰', endkey: 'log:', descending: true, include_docs: true });
  return r.rows.map(r => r.doc!).filter((d: any) => d.ref === taskId);
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
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')).slice(0, 10);
  const projCache: Record<string, string> = Object.fromEntries(allProjects.map(p => [p._id, p.name]));

  return { allProjects, allSpaces, byProject, pinnedTasks, overdueTasks, projCache, totalTasks: tasks.length };
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

function describeSyncError(err: any): string {
  if (!err) return 'Unknown sync error';
  const status = err.status ?? err.statusCode;
  if (status === 401 || status === 403) return 'Authentication failed — check sync credentials';
  if (status === 404) return 'Sync database not found on server';
  if (status === 0 || err.name === 'TypeError' || /network|failed to fetch/i.test(err.message ?? '')) {
    return 'Cannot reach sync server';
  }
  return err.message ?? err.reason ?? String(err);
}

const LAST_SYNC_KEY = 'offlog_last_synced';

export const syncState = {
  status: 'idle' as 'idle' | 'syncing' | 'error' | 'offline',
  lastSynced: localStorage.getItem(LAST_SYNC_KEY),
  error: null as string | null,
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
  notify();
}

export async function scanConflicts(): Promise<number> {
  const r = await db.allDocs({ conflicts: true });
  const count = r.rows.filter((row: any) => row.value?.conflicts?.length).length;
  syncState.conflictCount = count;
  notify();
  return count;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (syncState.status === 'offline') { syncState.status = 'syncing'; notify(); }
    syncNow().catch(() => {});
  });
  window.addEventListener('offline', () => {
    syncState.status = 'offline'; syncState.error = null; notify();
  });
}

export function startSync() {
  if (_syncHandler) _syncHandler.cancel();
  if (!navigator.onLine) { syncState.status = 'offline'; notify(); }
  _syncHandler = db.sync(remote(), { live: true, retry: true })
    .on('change', () => { syncState.status = 'syncing'; notify(); })
    .on('paused', (err: any) => { if (err) markError(err); else markSynced(); })
    .on('active', () => { syncState.status = 'syncing'; notify(); })
    .on('error', (err: any) => markError(err));
}

export function syncNow(): Promise<void> {
  return new Promise((resolve, reject) => {
    syncState.status = 'syncing'; notify();
    db.sync(remote())
      .on('complete', () => { markSynced(); resolve(); })
      .on('error', (err: any) => { markError(err); reject(err); });
  });
}

// ── Seed ──────────────────────────────────────────────────────────────────────

const DEFAULT_COLS = [
  { id: 'col:idea',      name: 'Idea' },
  { id: 'col:task',      name: 'Task' },
  { id: 'col:inprocess', name: 'In Process' },
  { id: 'col:completed', name: 'Completed' },
];

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

export async function seedIfEmpty() {
  const existing = await getSpaces();
  if (existing.length > 0) return; // already seeded

  const SPACES = [
    { key: 'unsorted', name: 'Unsorted', color: '#6B7280' },
    { key: 'personal', name: 'Personal', color: '#10B981' },
    { key: 'family',   name: 'Family',   color: '#F59E0B' },
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
}

// ── Spaces ────────────────────────────────────────────────────────────────────

export async function getSpaces(): Promise<SpaceDoc[]> {
  const r = await db.allDocs<SpaceDoc>({ startkey: 'space:', endkey: 'space:￰', include_docs: true });
  return r.rows.map(r => r.doc!).sort((a, b) => a.position - b.position);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects(spaceId?: string): Promise<ProjectDoc[]> {
  const r = await db.allDocs<ProjectDoc>({ startkey: 'project:', endkey: 'project:￰', include_docs: true });
  let docs = r.rows.map(r => r.doc!).filter(d => d && !(d as any)._deleted);
  if (spaceId) docs = docs.filter(d => d.space_id === spaceId);
  return docs.sort((a, b) => a.position - b.position);
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

export async function deleteProject(id: string): Promise<void> {
  const doc = await db.get(id);
  await db.remove(doc);
  // hard-delete all tasks in this project
  const all = await getAllTasksRaw();
  const projectTasks = all.filter(d => d.project_id === id);
  if (projectTasks.length) await db.bulkDocs(projectTasks.map(t => ({ ...t, _deleted: true })));
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

export async function createTask(projectId: string, spaceId: string, columnId: string, title: string): Promise<TaskDoc> {
  const existing = await getTasksForProject(projectId);
  const colTasks = existing.filter(t => t.column_id === columnId);
  const maxPos = colTasks.length ? Math.max(...colTasks.map(t => t.position)) : 0;
  const ts = now();
  const doc: TaskDoc = {
    _id: `task:${nanoid()}`, type: 'task',
    project_id: projectId, space_id: spaceId, column_id: columnId,
    title, body: '', priority: 1,
    due_date: null, reminder_at: null, tags: [],
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
  const diffs: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(changes) as (keyof TaskDoc)[]) {
    if (skip.has(key)) continue;
    if (JSON.stringify(doc[key]) !== JSON.stringify(changes[key])) {
      diffs[key] = { from: doc[key], to: changes[key] };
    }
  }

  // Resolve project once
  let proj: ProjectDoc | null = null;
  try { proj = await db.get<ProjectDoc>(doc.project_id); } catch {}
  const projName = proj?.name;
  const taskTitle = (changes.title as string | undefined) ?? doc.title;

  if (isMove) {
    const fromName = proj?.columns.find(c => c.id === doc.column_id)?.name ?? doc.column_id;
    const toName   = proj?.columns.find(c => c.id === changes.column_id)?.name ?? changes.column_id!;
    await logChange(id, 'move', 'column_id', fromName, toName, {
      task_title: taskTitle, project_name: projName,
      diffs: Object.keys(diffs).length ? diffs : undefined,
    });
  } else if (isDelete) {
    await logChange(id, 'delete', undefined, undefined, undefined, { task_title: doc.title, project_name: projName });
  } else if (Object.keys(diffs).length) {
    await logChange(id, 'update', undefined, undefined, undefined, { task_title: taskTitle, project_name: projName, diffs });
  }

  return { ...doc, ...changes, updated_at: now(), source: SOURCE } as TaskDoc;
}

// ── Undo delete buffer (in-memory, last 10) ───────────────────────────────────

type UndoEntry = { doc: TaskDoc; listeners: Set<() => void> };
const _undoBuffer: UndoEntry[] = [];
const _undoListeners = new Set<() => void>();

export function subscribeUndo(fn: () => void) { _undoListeners.add(fn); return () => _undoListeners.delete(fn); }
export function getUndoBuffer(): TaskDoc[] { return _undoBuffer.map(e => e.doc); }

export async function deleteTask(id: string): Promise<void> {
  const doc = await db.get<TaskDoc>(id);
  _undoBuffer.unshift({ doc, listeners: new Set() });
  if (_undoBuffer.length > 10) _undoBuffer.pop();
  _undoListeners.forEach(fn => fn());
  await updateTask(id, { deleted: true });
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
  const idx = _undoBuffer.findIndex(e => e.doc._id === id);
  if (idx === -1) return;
  const { doc } = _undoBuffer.splice(idx, 1)[0];
  _undoListeners.forEach(fn => fn());
  // get current rev so we can update the deleted doc
  try {
    const current = await db.get<TaskDoc>(doc._id!);
    await db.put({ ...current, deleted: false, updated_at: now(), source: SOURCE });
  } catch {
    // doc may be truly gone — re-insert without rev
    const { _rev, ...fresh } = doc as any;
    await db.put({ ...fresh, deleted: false, updated_at: now(), source: SOURCE });
  }
  invalidateTaskCache();
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function getArchivedTasksForProject(projectId: string): Promise<TaskDoc[]> {
  const all = await getAllTasksRaw();
  return all.filter(d => d.project_id === projectId && !d.deleted && !!d.archived);
}

export async function unarchiveTask(id: string): Promise<void> {
  const doc = await db.get<TaskDoc>(id);
  await db.put({ ...doc, archived: false, updated_at: now(), source: SOURCE });
  invalidateTaskCache();
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
  // strip _rev so we don't cause conflicts — PouchDB will merge
  const clean = valid.map(({ _rev, ...d }) => d);
  const results = await db.bulkDocs(clean);
  invalidateTaskCache();
  const ok = results.filter((r: any) => !r.error || r.status === 409).length;
  const skipped = results.filter((r: any) => r.error && r.status !== 409).length;
  return { ok, skipped };
}

export async function getAllTags(): Promise<string[]> {
  const all = await getAllTasksRaw();
  const set = new Set<string>();
  all.forEach(d => d.tags?.forEach(t => set.add(t)));
  return [...set].sort();
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
    if (row.value?.conflicts?.length) {
      issues.push({ type: 'conflict', docId: row.id, description: `${row.value.conflicts.length} unresolved conflicting revision(s)` });
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

// ── Live query ────────────────────────────────────────────────────────────────

export function subscribe(callback: () => void): () => void {
  const handler = db.changes({ since: 'now', live: true }).on('change', () => {
    invalidateTaskCache();
    callback();
  });
  return () => handler.cancel();
}

export default db;
