// Aggregate read queries: storage breakdown, dashboard, cross-project search
// and the agenda/reminder rollups.
import type { SpaceDoc, ProjectDoc, TaskDoc } from '../types';
import { localDateStr } from '../utils';
import { db, getAllTasksRaw } from './core';
import { getProjects, getSpaces } from './entities';

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
