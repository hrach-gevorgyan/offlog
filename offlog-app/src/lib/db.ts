// PouchDB is loaded as a UMD global via index.html <script src="/pouchdb.js">
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import { getSyncUrl, COUCH_USER, COUCH_PASS } from '../config';
import type { SpaceDoc, ProjectDoc, TaskDoc, Column, Source } from './types';

const SOURCE: Source = (window as any).Capacitor?.getPlatform() === 'android' ? 'mobile' : 'pc';
const db = new PouchDB('offlog');

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
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  const tasks = r.rows.map(r => r.doc!).filter(d => !d.deleted && !d.archived);
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
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  const tasks = r.rows.map(r => r.doc!).filter(d =>
    !d.deleted && !d.archived &&
    (d.title.toLowerCase().includes(q) || d.tags?.some((t: string) => t.includes(q)) || d.body?.toLowerCase().includes(q))
  );
  const projCache: Record<string, any> = {};
  const result = [];
  for (const t of tasks) {
    if (!projCache[t.project_id]) {
      try { projCache[t.project_id] = await db.get(t.project_id); } catch { projCache[t.project_id] = null; }
    }
    result.push({ ...t, project_name: projCache[t.project_id]?.name ?? '—' });
  }
  return result;
}

export async function clearLogs(): Promise<void> {
  const r = await db.allDocs({ startkey: 'log:', endkey: 'log:￰', include_docs: true });
  const dels = r.rows.map(row => ({ ...row.doc!, _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
}

// ── Sync ──────────────────────────────────────────────────────────────────────

let _syncHandler: any = null;

export const syncState = {
  status: 'idle' as 'idle' | 'syncing' | 'error' | 'offline',
  lastSynced: null as string | null,
  error: null as string | null,
  listeners: new Set<() => void>(),
};

function notify() { syncState.listeners.forEach(fn => fn()); }

export function startSync() {
  if (_syncHandler) _syncHandler.cancel();
  _syncHandler = db.sync(remote(), { live: true, retry: true })
    .on('change', () => { syncState.status = 'syncing'; notify(); })
    .on('paused', () => { syncState.status = 'idle'; syncState.lastSynced = now(); notify(); })
    .on('error', (err: any) => { syncState.status = 'error'; syncState.error = String(err); notify(); });
}

export function syncNow(): Promise<void> {
  return new Promise((resolve, reject) => {
    syncState.status = 'syncing'; notify();
    db.sync(remote())
      .on('complete', () => { syncState.status = 'idle'; syncState.lastSynced = now(); notify(); resolve(); })
      .on('error', (err: any) => { syncState.status = 'error'; syncState.error = String(err); notify(); reject(err); });
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
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  const projectTasks = r.rows.map(r => r.doc!).filter(d => d.project_id === id);
  if (projectTasks.length) await db.bulkDocs(projectTasks.map(t => ({ ...t, _deleted: true })));
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
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  return r.rows.map(r => r.doc!).filter(d => d.project_id === projectId && !d.deleted && !d.archived);
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
    due_date: null, tags: [],
    position: maxPos + 1024,
    deleted: false, created_at: ts, updated_at: ts, source: SOURCE,
  };
  await db.put(doc);
  let projName: string | undefined;
  try { projName = (await db.get<ProjectDoc>(projectId)).name; } catch {}
  await logChange(doc._id!, 'create', undefined, undefined, undefined, { task_title: title, project_name: projName });
  return doc;
}

export async function updateTask(id: string, changes: Partial<TaskDoc>): Promise<TaskDoc> {
  const doc = await db.get<TaskDoc>(id);
  await db.put({ ...doc, ...changes, updated_at: now(), source: SOURCE });

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
    created_at: ts,
    updated_at: ts,
    source: SOURCE,
  };
  await db.put(doc);
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
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function getArchivedTasksForProject(projectId: string): Promise<TaskDoc[]> {
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  return r.rows.map(r => r.doc!).filter(d => d.project_id === projectId && !d.deleted && !!d.archived);
}

export async function unarchiveTask(id: string): Promise<void> {
  const doc = await db.get<TaskDoc>(id);
  await db.put({ ...doc, archived: false, updated_at: now(), source: SOURCE });
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
  const ok = results.filter((r: any) => !r.error || r.status === 409).length;
  const skipped = results.filter((r: any) => r.error && r.status !== 409).length;
  return { ok, skipped };
}

export async function getAllTags(): Promise<string[]> {
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  const set = new Set<string>();
  r.rows.forEach(row => row.doc?.tags?.forEach(t => set.add(t)));
  return [...set].sort();
}

export async function getAllTasksDue(): Promise<(TaskDoc & { project_name?: string; space_id: string })[]> {
  const r = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:￰', include_docs: true });
  const tasks = r.rows.map(r => r.doc!).filter(d => !d.deleted && !d.archived && d.due_date);
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

// ── Live query ────────────────────────────────────────────────────────────────

export function subscribe(callback: () => void): () => void {
  const handler = db.changes({ since: 'now', live: true }).on('change', callback);
  return () => handler.cancel();
}

export default db;
