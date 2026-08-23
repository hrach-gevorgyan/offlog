// Housekeeping: log/deleted-task retention, integrity check + repair, the
// Settings maintenance run, and backup import/export.
import type { SpaceDoc, ProjectDoc, TaskDoc } from '../types';
import { db, SOURCE, getAllTasksRaw, invalidateTaskCache, now, DEFAULT_COLS } from './core';
import { getProjects } from './entities';
// repairDatabase() re-scans for conflicts after rewriting docs. maintenance ->
// sync is the one edge beyond core <- entities; sync never imports back.
import { scanConflicts } from './sync';

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

