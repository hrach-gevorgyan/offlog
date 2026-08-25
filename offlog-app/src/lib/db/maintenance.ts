// Housekeeping: log/deleted-task retention, integrity check + repair, the
// Settings maintenance run, and backup import/export.
import type { SpaceDoc, ProjectDoc, TaskDoc, Column } from '../types';
import { db, SOURCE, getAllTasksRaw, invalidateTaskCache, now, DEFAULT_COLS } from './core';
import { getProjects, getCustomFieldDefs } from './entities';
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
  // A log's id is `log:<ISO ts>-<random>`, so ids sort by time and the cutoff
  // can be the endkey -- the scan stops at the newest stale entry instead of
  // reading every log in the database. Deleting needs only _id and _rev, and
  // allDocs returns the rev without include_docs, so no bodies are loaded.
  const r = await db.allDocs({ startkey: 'log:', endkey: `log:${cutoffIso}` });
  const stale = r.rows.filter(row => !row.value.deleted);
  if (stale.length) {
    await db.bulkDocs(stale.map(row => ({ _id: row.id, _rev: row.value.rev, _deleted: true })));
  }
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
// A record straight out of a backup file: arbitrary, unvalidated JSON. Nothing
// about its shape is known until the checks below run, so every field reads as
// `any` on purpose.
export type ImportedDoc = Record<string, any>;

// bulkDocs' per-doc result, narrowed to the only field read here plus the two
// minimal stand-ins the per-document fallback pushes.
type ImportResult = { ok?: boolean; error?: unknown };

function sanitizeImportedDoc(d: ImportedDoc): ImportedDoc {
  const out = { ...d };

  if (out._attachments && typeof out._attachments === 'object') {
    const kept: Record<string, Partial<PouchDB.Core.FullAttachment>> = {};
    for (const [key, att] of Object.entries<Partial<PouchDB.Core.FullAttachment>>(out._attachments)) {
      if (att && typeof att.data === 'string') kept[key] = att; // real base64 payload
    }
    if (Object.keys(kept).length) out._attachments = kept;
    else delete out._attachments;
    // Keep the metadata array honest about what actually came back.
    if (Array.isArray(out.attachments)) {
      out.attachments = out.attachments.filter((a: { key?: string } | null) => a?.key && kept[a.key]);
    }
  }

  if (out.type === 'project') {
    const cols = Array.isArray(out.columns)
      ? out.columns.filter((c: Partial<Column> | null) => c && typeof c.id === 'string' && typeof c.name === 'string')
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

export async function importJSON(docs: ImportedDoc[]): Promise<{ ok: number; skipped: number }> {
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
  for (const row of existing.rows as Array<{ id: string; error?: string; value?: { rev: string } }>) {
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
  let results: ImportResult[];
  try {
    results = await db.bulkDocs(clean) as ImportResult[];
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
  const ok = results.filter(r => !r.error).length;
  const skipped = results.filter(r => r.error).length;
  return { ok, skipped };
}

// Read-only pass over a parsed import file so the UI can preview "what will
// happen" before anything is written. It does not check against the live DB
// (PouchDB has no dry-run for bulkDocs): "will be skipped" means "malformed,
// or not one of space/project/task". A doc colliding with an existing id is
// reported as "created" and genuinely overwritten by importJSON.
export function analyzeImport(docs: ImportedDoc[]): { toCreate: number; toSkip: number; byType: Record<string, number> } {
  // Must accept exactly what importJSON() writes, or the preview shown
  // before a restore under-reports it: 'meta' (custom-field definitions)
  // and 'tag_color' were counted as skipped and then imported anyway.
  const byType: Record<string, number> = { space: 0, project: 0, task: 0, meta: 0, tag_color: 0 };
  let toSkip = 0;
  for (const d of docs) {
    const usable = !!d && typeof d._id === 'string' && d.type in byType
      && !(d.type === 'task' && typeof d.project_id !== 'string');
    if (usable) byType[d.type]++;
    else toSkip++;
  }
  return { toCreate: docs.length - toSkip, toSkip, byType };
}

// Export a single project — the project doc plus its own tasks only, never
// the space it belongs to: including the space would silently duplicate
// spaces on re-import.
export async function exportProjectDocs(projectId: string): Promise<Array<ProjectDoc | TaskDoc>> {
  const project = await db.get<ProjectDoc>(projectId);
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
  type: 'orphaned_project' | 'orphaned_task' | 'invalid_column' | 'no_columns' | 'conflict'
      | 'orphaned_custom_value' | 'dangling_link' | 'unarchived_in_archived' | 'attachment_mismatch';
  docId: string;
  description: string;
}

export async function checkIntegrity(): Promise<{ issues: IntegrityIssue[]; checked: number }> {
  const issues: IntegrityIssue[] = [];

  // Three prefix scans, not one allDocs over everything. A whole-database
  // scan also pulls in every log: doc -- thousands after a few months --
  // loads their bodies, and counts them as "items checked" even though no
  // check below ever looks at one.
  const [spaceRows, projectRows, taskRows, tagRows] = await Promise.all([
    db.allDocs<SpaceDoc>({ startkey: 'space:', endkey: 'space:\uFFF0', include_docs: true, conflicts: true }),
    db.allDocs<ProjectDoc>({ startkey: 'project:', endkey: 'project:\uFFF0', include_docs: true, conflicts: true }),
    db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:\uFFF0', include_docs: true, conflicts: true }),
    db.allDocs({ startkey: 'tag:', endkey: 'tag:\uFFF0', include_docs: true, conflicts: true }),
  ]);

  const spaces = spaceRows.rows.map(r => r.doc!).filter(Boolean);
  const projects = projectRows.rows.map(r => r.doc!).filter(Boolean);
  const tasks = taskRows.rows.map(r => r.doc!).filter(Boolean);
  const spaceIds = new Set(spaces.map(s => s._id));
  const projectIds = new Set(projects.map(p => p._id));
  const taskIds = new Set(tasks.map(t => t._id));
  const fieldIds = new Set((await getCustomFieldDefs()).map(f => f.id));
  const archivedProjectIds = new Set(projects.filter(p => p.archived).map(p => p._id));

  for (const p of projects) {
    if (!spaceIds.has(p.space_id)) {
      issues.push({ type: 'orphaned_project', docId: p._id!, description: `Project "${p.name}" points to a missing space` });
    }
    if (!p.columns || p.columns.length === 0) {
      issues.push({ type: 'no_columns', docId: p._id!, description: `Project "${p.name}" has no statuses (not auto-repaired — needs manual review)` });
    }
  }

  const projectById = new Map(projects.map(p => [p._id!, p]));
  for (const t of tasks) {
    if (t.deleted) continue;
    if (!projectIds.has(t.project_id)) {
      issues.push({ type: 'orphaned_task', docId: t._id!, description: `Task "${t.title}" points to a missing project` });
      continue;
    }
    const proj = projectById.get(t.project_id);
    if (proj && proj.columns.length && !proj.columns.some(c => c.id === t.column_id)) {
      issues.push({ type: 'invalid_column', docId: t._id!, description: `Task "${t.title}" points to a missing status in "${proj.name}"` });
    }

    // A custom field can be deleted while tasks still carry values keyed to
    // its id. Nothing renders them and nothing else cleans them up, so they
    // sit in the doc -- and in every sync payload -- forever.
    const staleFields = Object.keys(t.custom_values ?? {}).filter(id => !fieldIds.has(id));
    if (staleFields.length) {
      issues.push({ type: 'orphaned_custom_value', docId: t._id!, description: `Task "${t.title}" has ${staleFields.length} value(s) for deleted custom field(s)` });
    }

    // pruneOldDeletedTasks() hard-deletes trashed tasks after 3 months, so
    // anything that named one keeps an id pointing at nothing. Reads already
    // ignore unresolvable ids, so this is cleanup, not a visible break.
    const dangling = [...(t.related ?? []), ...(t.blocked_by ?? [])].filter(id => !taskIds.has(id));
    if (dangling.length) {
      issues.push({ type: 'dangling_link', docId: t._id!, description: `Task "${t.title}" links to ${dangling.length} task(s) that no longer exist` });
    }

    // archiveProject() cascades archived onto its tasks, but an import or a
    // sync merge can land a task into an archived project without it.
    if (!t.archived && archivedProjectIds.has(t.project_id)) {
      issues.push({ type: 'unarchived_in_archived', docId: t._id!, description: `Task "${t.title}" is active inside an archived project` });
    }

    // attachments[] is loggable metadata; the bytes live in PouchDB's own
    // _attachments. Either side can outlive the other -- a phantom row shows
    // an attachment that cannot open, an orphaned blob counts against the
    // 10MB cap while nothing references it.
    const blobKeys = new Set(Object.keys((t as { _attachments?: Record<string, unknown> })._attachments ?? {}));
    const metaKeys = (t.attachments ?? []).map(a => a.key);
    const phantom = metaKeys.filter(k => !blobKeys.has(k));
    const orphanBlobs = [...blobKeys].filter(k => !metaKeys.includes(k));
    if (phantom.length || orphanBlobs.length) {
      issues.push({ type: 'attachment_mismatch', docId: t._id!, description: `Task "${t.title}" has ${phantom.length} attachment(s) with no file and ${orphanBlobs.length} file(s) with no attachment` });
    }
  }

  // log: docs are deliberately not scanned for conflicts: their ids embed a
  // random suffix, so two devices can never mint the same one and a
  // conflicting revision is not reachable.
  for (const row of [...spaceRows.rows, ...projectRows.rows, ...taskRows.rows, ...tagRows.rows]) {
    // See scanConflicts()'s comment — conflicts live on row.doc._conflicts,
    // never on row.value.
    const doc = row.doc as { _conflicts?: string[] } | undefined;
    if (doc?._conflicts?.length) {
      issues.push({ type: 'conflict', docId: row.id, description: `${doc._conflicts.length} unresolved conflicting revision(s)` });
    }
  }

  // Only records a check actually inspected -- counting logs here made the
  // number look impressive and mean nothing.
  return { issues, checked: spaces.length + projects.length + tasks.length };
}

// Applies safe, well-understood fixes only. "no_columns" is deliberately
// left for manual review — inventing default statuses for a project the
// user configured a specific way is too destructive to do silently.
// `known` lets a caller that has just run checkIntegrity() hand its result
// straight in. Without it a maintenance run scanned the whole database twice
// -- once for the check step, once inside here -- and a third time when
// anything was left unfixed.
export async function repairDatabase(known?: IntegrityIssue[]): Promise<{ fixed: number; skipped: number }> {
  const issues = known ?? (await checkIntegrity()).issues;
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
      } else if (issue.type === 'orphaned_custom_value') {
        const doc = await db.get<TaskDoc>(issue.docId);
        const live = new Set((await getCustomFieldDefs()).map(f => f.id));
        const custom_values = Object.fromEntries(
          Object.entries(doc.custom_values ?? {}).filter(([id]) => live.has(id)),
        );
        await db.put({ ...doc, custom_values, updated_at: now(), source: SOURCE });
        fixed++;
      } else if (issue.type === 'dangling_link') {
        const doc = await db.get<TaskDoc>(issue.docId);
        const exists = async (id: string) => {
          try { await db.get(id); return true; } catch { return false; }
        };
        const keep = async (ids: string[]) => {
          const flags = await Promise.all(ids.map(exists));
          return ids.filter((_, i) => flags[i]);
        };
        const related = doc.related ? await keep(doc.related) : undefined;
        const blocked_by = doc.blocked_by ? await keep(doc.blocked_by) : undefined;
        await db.put({ ...doc, related, blocked_by, updated_at: now(), source: SOURCE });
        fixed++;
      } else if (issue.type === 'unarchived_in_archived') {
        const doc = await db.get<TaskDoc>(issue.docId);
        await db.put({ ...doc, archived: true, updated_at: now(), source: SOURCE });
        fixed++;
      } else if (issue.type === 'attachment_mismatch') {
        const doc = await db.get<TaskDoc & { _attachments?: Record<string, unknown> }>(issue.docId);
        const blobKeys = new Set(Object.keys(doc._attachments ?? {}));
        // Drop metadata rows whose bytes are gone. The reverse -- bytes with
        // no metadata row -- is left alone: removing them needs a separate
        // revision per attachment, and dead bytes are a space cost, not a
        // broken card.
        const attachments = (doc.attachments ?? []).filter(a => blobKeys.has(a.key));
        await db.put({ ...doc, attachments, updated_at: now(), source: SOURCE });
        fixed++;
      } else if (issue.type === 'conflict') {
        const doc = await db.get(issue.docId, { conflicts: true });
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
// Set once a full compaction has completed, so the expensive whole-history
// pass is never repeated on a database that cannot accumulate revisions.
// localStorage, not a doc: this is about one device's local storage, and
// syncing it would make one device's compaction silence another's.
const COMPACTED_KEY = 'offlog_compacted';

export type MaintStatus = 'running' | 'done' | 'skipped' | 'error';
export interface MaintStepResult { key: MaintStepKey; status: MaintStatus; note: string }

// Emits a 'running' result for each step right before it starts (so the
// caller's UI can show a per-step spinner) and one final done/skipped/error
// result once it settles -- callers that only care about the end state can
// filter for `status !== 'running'`.
export interface MaintOptions {
  // Asked before repair, which rewrites documents and drops conflicting
  // revisions with no undo. Lives here as a callback rather than a direct
  // confirmAction() call because db/ must never import UI.
  confirmRepair?: (issues: IntegrityIssue[]) => Promise<boolean>;
  // Polled between steps. A step already in flight always finishes -- there
  // is no safe way to interrupt a bulkDocs or a compaction partway.
  isCancelled?: () => boolean;
}

export async function runMaintenanceSteps(
  onStep: (result: MaintStepResult) => void,
  opts: MaintOptions = {},
): Promise<{ remainingIssues: IntegrityIssue[]; cancelled: boolean }> {
  let remainingIssues: IntegrityIssue[] = [];
  const cancelled = () => opts.isCancelled?.() === true;
  const stop = (...rest: MaintStepKey[]) => {
    for (const k of rest) onStep({ key: k, status: 'skipped', note: 'Cancelled' });
    return { remainingIssues, cancelled: true };
  };

  onStep({ key: 'check', status: 'running', note: '' });
  const { issues, checked } = await checkIntegrity();
  onStep({ key: 'check', status: 'done', note: issues.length === 0 ? `No problems found (${checked} items checked)` : `${issues.length} issue${issues.length === 1 ? '' : 's'} found` });

  if (cancelled()) return stop('repair', 'history', 'trash', 'compact');

  if (issues.length === 0) {
    onStep({ key: 'repair', status: 'skipped', note: 'Nothing to repair' });
  } else if (opts.confirmRepair && !(await opts.confirmRepair(issues))) {
    remainingIssues = issues;
    onStep({ key: 'repair', status: 'skipped', note: 'Skipped — not confirmed' });
  } else {
    onStep({ key: 'repair', status: 'running', note: '' });
    const { fixed, skipped } = await repairDatabase(issues);
    onStep({ key: 'repair', status: 'done', note: `Fixed ${fixed}${skipped ? `, ${skipped} need manual review` : ''}` });
    if (skipped > 0) {
      const after = await checkIntegrity();
      remainingIssues = after.issues;
    }
  }

  if (cancelled()) return stop('history', 'trash', 'compact');

  onStep({ key: 'history', status: 'running', note: '' });
  const prunedLogs = await pruneOldLogs();
  onStep({ key: 'history', status: 'done', note: prunedLogs > 0 ? `Removed ${prunedLogs} entr${prunedLogs === 1 ? 'y' : 'ies'} older than 6 months` : 'Nothing old enough to remove' });

  if (cancelled()) return stop('trash', 'compact');

  onStep({ key: 'trash', status: 'running', note: '' });
  const prunedTasks = await pruneOldDeletedTasks();
  onStep({ key: 'trash', status: 'done', note: prunedTasks > 0 ? `Removed ${prunedTasks} item${prunedTasks === 1 ? '' : 's'} older than 3 months` : 'Nothing old enough to remove' });

  // Compaction is the expensive step by a wide margin: PouchDB's _compact
  // walks the whole changes feed from seq 0 and fires one compactDocument()
  // per row concurrently, so on a heavily-churned database it queues
  // thousands of IndexedDB transactions, starves the main thread for
  // minutes, and the modal cannot even repaint.
  //
  // It is also almost always pointless here. core.ts opens the database with
  // auto_compaction, so superseded revision bodies are discarded as each
  // write lands and nothing accumulates. The only way this run can free
  // space is if it just deleted something -- a repair, pruned history, or
  // pruned trash. When all three did nothing there is, by construction,
  // nothing new to reclaim.
  //
  // The exception is a database that predates auto_compaction: it carries
  // real accumulated revisions and needs one full pass. COMPACTED_KEY marks
  // that pass as done so it is paid once, never again.
  if (cancelled()) return stop('compact');

  // Once, ever -- not "whenever this run deleted something". auto_compaction
  // discards a superseded revision body as the new one lands, so rewriting a
  // doc during repair, or tombstoning one during a prune, leaves nothing
  // behind for a later compaction to collect. Re-running it after those steps
  // walked the whole changes feed for zero bytes and blocked the UI for
  // minutes doing it.
  //
  // The one database that genuinely needs the pass is one that predates
  // auto_compaction and carries real accumulated revisions. That is a
  // migration, so it is paid once and recorded.
  const everCompacted = localStorage.getItem(COMPACTED_KEY) === '1';
  if (everCompacted) {
    onStep({ key: 'compact', status: 'skipped', note: 'Nothing to reclaim — space is freed as you work' });
  } else {
    onStep({ key: 'compact', status: 'running', note: '' });
    const before = await storageUsage();
    await db.compact();
    localStorage.setItem(COMPACTED_KEY, '1');
    const after = await storageUsage();
    const freed = before !== null && after !== null ? before - after : null;
    onStep({ key: 'compact', status: 'done', note: describeFreed(freed) });
  }

  return { remainingIssues, cancelled: false };
}

// navigator.storage is absent or permission-gated on some platforms, so a
// missing reading is normal and must not read as "freed nothing".
async function storageUsage(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    return typeof est?.usage === 'number' ? est.usage : null;
  } catch { return null; }
}

function describeFreed(bytes: number | null): string {
  if (bytes === null) return 'Reclaimed disk space';
  // The estimate is coarse and can drift upward between the two readings;
  // reporting a negative number as a gain would be worse than saying nothing.
  if (bytes < 64 * 1024) return 'Nothing left to reclaim';
  const mb = bytes / 1048576;
  return `Freed ${mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`}`;
}

