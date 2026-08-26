// Entity CRUD: seeding, spaces, projects, tasks, "blocked by", attachments,
// undo and trash. Tasks and projects are mutually coupled by the positional
// "done" rule (updateTask needs the project's last column; deleteProject
// cascades into tasks), so they deliberately live in one module.
import { getDefaultReminderTime } from '../../config';
import type { SpaceDoc, ProjectDoc, TaskDoc, Column, CustomFieldDef, TaskAttachment, Source } from '../types';
import { wordOverlapSimilarity, localDateStr } from '../utils';
import { ATTACHMENT_MAX_BYTES, isAttachmentExtensionAllowed, attachmentExtension, attachmentMimeType } from '../attachments';
import { db, SOURCE, DEFAULT_COLS, initIndexes, getAllTasksRaw, invalidateTaskCache, now, nanoid, logChange, queueTaskWrite } from './core';

// ── Seed ──────────────────────────────────────────────────────────────────────

// seedIfEmpty() gives every fresh install space:unsorted/personal/work +
// project:draft under FIXED ids, so two independently-seeded devices collide
// on those 4 ids the moment they first pair. Called from discovery.ts's
// pairWithHost() right before sync starts: a genuinely untouched seed is safe
// to discard so the upcoming pull creates the host's versions cleanly instead
// of forking a divergent revision history.
//
// "Untouched" means all three of: no tasks, no space or project the user
// created themselves, and none of the four seed docs edited (rev generation
// still 1). Checking tasks alone deletes real work: setting up spaces and
// projects before adding any task is a normal way to start, and renaming a
// seeded space is an edit to one of these exact ids.
export async function clearLocalSeedBeforeFirstPair(): Promise<void> {
  const tasks = await db.allDocs({ startkey: 'task:', endkey: 'task:￰', limit: 1 });
  if (tasks.rows.length > 0) return;

  const [spaces, projects] = await Promise.all([
    db.allDocs<PristineDoc>({ startkey: 'space:', endkey: 'space:￰', include_docs: true }),
    db.allDocs<PristineDoc>({ startkey: 'project:', endkey: 'project:￰', include_docs: true }),
  ]);
  const rows = [...spaces.rows, ...projects.rows];

  // Anything outside the four seed ids is the user's own.
  if (rows.some(r => !SEED_IDS.includes(r.id))) return;
  // A seed doc whose content no longer matches seedIfEmpty()'s output has been
  // edited — renamed, recoloured, reordered, columns changed.
  if (rows.some(r => r.doc && !PRISTINE_DEFAULTS[r.id]?.(r.doc))) return;

  for (const id of SEED_IDS) {
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

// Content shape a still-untouched default doc from seedIfEmpty() has.
// Compared field-by-field (ignoring _id/_rev/updated_at/source, which always
// legitimately differ between two independently-seeded installs) to tell a
// genuinely pristine copy apart from one the user edited.
//
// Content, never revision number: wipeAndReseed() soft-deletes and re-puts
// these same ids, so a genuinely pristine seed can sit at generation 3 or
// higher after a data reset.
//
// One predicate map covers both a space doc and a project doc, so the union of
// the fields either predicate reads is optional here.
export interface PristineDoc {
  name?: string;
  color?: string;
  position?: number;
  space_id?: string;
  default_view?: ProjectDoc['default_view'];
  columns?: Column[];
}

export const SEED_IDS = ['space:unsorted', 'space:personal', 'space:work', 'project:draft'];

export const PRISTINE_DEFAULTS: Record<string, (doc: PristineDoc) => boolean> = {
  'space:unsorted': (d) => d.name === 'Unsorted' && d.color === '#6B7280' && d.position === 0,
  'space:personal': (d) => d.name === 'Personal' && d.color === '#10B981' && d.position === 1,
  'space:work':     (d) => d.name === 'Work' && d.color === '#3B82F6' && d.position === 2,
  'project:draft':  (d) => d.name === 'Draft' && d.space_id === 'space:unsorted' && d.position === 0
                         && d.default_view === 'kanban' && JSON.stringify(d.columns) === JSON.stringify(DEFAULT_COLS),
};

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
  let docs = r.rows.map(r => r.doc!).filter(d => d && !(d as ProjectDoc & PouchDB.Core.ChangesMeta)._deleted && !d.archived);
  if (spaceId) docs = docs.filter(d => d.space_id === spaceId);
  return docs.sort((a, b) => a.position - b.position);
}

// Archived projects are hidden from getProjects() the same way archived tasks
// are hidden from getTasksForProject(); this is the restore-list counterpart.
export async function getArchivedProjects(): Promise<ProjectDoc[]> {
  const r = await db.allDocs<ProjectDoc>({ startkey: 'project:', endkey: 'project:￰', include_docs: true });
  return r.rows.map(r => r.doc!).filter(d => d && !(d as ProjectDoc & PouchDB.Core.ChangesMeta)._deleted && !!d.archived)
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

// The single fixed-id doc holding every custom-field definition. `fields` is
// optional: the doc is created on first write, and the catch branches below
// synthesize a bare one when it doesn't exist yet.
interface CustomFieldsDoc {
  _id: string;
  _rev?: string;
  type: 'meta';
  fields?: CustomFieldDef[];
  updated_at?: string;
  source?: Source;
}

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
  let doc: CustomFieldsDoc;
  try { doc = await db.get<CustomFieldsDoc>(CUSTOM_FIELDS_DOC_ID); } catch { doc = { _id: CUSTOM_FIELDS_DOC_ID, type: 'meta' }; }
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
  let doc: CustomFieldsDoc;
  try { doc = await db.get<CustomFieldsDoc>(CUSTOM_FIELDS_DOC_ID); } catch { return []; }
  const fields = (doc.fields ?? []).map(f => f.id === fieldId ? { ...f, ...patch } : f);
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
  let doc: CustomFieldsDoc;
  try { doc = await db.get<CustomFieldsDoc>(CUSTOM_FIELDS_DOC_ID); } catch { return []; }
  const removed = (doc.fields ?? []).find(f => f.id === fieldId);
  const fields = (doc.fields ?? []).filter(f => f.id !== fieldId);
  // Definition first: if the value sweep below fails, the field is gone and
  // the leftovers are a known, detectable state (checkIntegrity's
  // orphaned_custom_value). Sweeping first and then failing would throw the
  // values away while the field still existed -- silent data loss.
  await db.put({ ...doc, fields, updated_at: now(), source: SOURCE });

  // custom_values is keyed by field id, so deleting a definition used to
  // strand every value under it: nothing renders them, nothing cleans them,
  // and they ride along in every sync payload forever. Deleted tasks are
  // swept too -- restoring one later should not resurrect values for a field
  // that no longer exists.
  const affected = (await getAllTasksRaw()).filter(t => t.custom_values && fieldId in t.custom_values);
  if (affected.length) {
    await db.bulkDocs(affected.map(t => {
      const next = { ...t.custom_values };
      delete next[fieldId];
      return { ...t, custom_values: next, updated_at: now(), source: SOURCE };
    }));
    invalidateTaskCache();
  }

  // One entry for the deletion, not one per task -- same as renameTag's bulk
  // rewrite, which is the established shape for a sweep like this.
  if (removed) await logChange(fieldId, 'delete', undefined, undefined, undefined, { field_name: removed.name, tasks_cleared: affected.length });
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
  if (toArchive.length) await Promise.all(toArchive.map(t => updateTask(t._id!, { archived: true, archivedWithProject: true })));
  invalidateTaskCache();
}

export async function unarchiveProject(id: string): Promise<void> {
  const doc = await db.get<ProjectDoc>(id);
  await db.put({ ...doc, archived: false, updated_at: now(), source: SOURCE });
  await logChange(id, 'update', 'archived', true, false, { project_name: doc.name });

  // Restore exactly what archiving hid. Filtering on archivedWithProject is
  // the point: a task the user archived on its own must stay archived, and
  // without the flag there is no way to tell the two apart -- which is why
  // this used to restore nothing and hand back an empty project.
  const all = await getAllTasksRaw();
  const toRestore = all.filter(t => t.project_id === id && !t.deleted && t.archived && t.archivedWithProject);
  if (toRestore.length) {
    await Promise.all(toRestore.map(t => updateTask(t._id!, { archived: false, archivedWithProject: false })));
  }
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
  const isEmpty = (v: unknown) => v == null || (typeof v === 'object' && Object.keys(v).length === 0);
  const diffs: Record<string, { from: unknown; to: unknown }> = {};
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
    _attachments: { ...doc._attachments, [key]: { content_type: contentType, data: input.base64Data } },
    updated_at: now(), source: SOURCE,
  });
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
  const nextAttachments = { ...doc._attachments };
  delete nextAttachments[key];

  await db.put({
    ...doc,
    attachments: nextMeta,
    _attachments: nextAttachments,
    updated_at: now(), source: SOURCE,
  });
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


export async function getArchivedTasksForProject(projectId: string): Promise<TaskDoc[]> {
  const all = await getAllTasksRaw();
  return all.filter(d => d.project_id === projectId && !d.deleted && !!d.archived);
}

export async function unarchiveTask(id: string): Promise<void> {
  // Routed through updateTask() (like archiveTask() below), not a direct
  // db.put(), so it logs a changelog entry the way archiving does.
  // Clearing archivedWithProject too: once restored by hand the task is no
  // longer something the project's own un-archive should act on.
  await updateTask(id, { archived: false, archivedWithProject: false });
}

export async function archiveTask(id: string): Promise<void> {
  // Deliberately not flagged as archivedWithProject: this is the user's own
  // choice, and unarchiveProject() must leave it alone.
  await updateTask(id, { archived: true, archivedWithProject: false });
}

export async function archiveColumnTasks(projectId: string, columnId: string): Promise<void> {
  const tasks = await getTasksForProject(projectId);
  const toArchive = tasks.filter(t => t.column_id === columnId && !t.archived);
  if (!toArchive.length) return;
  await Promise.all(toArchive.map(t => updateTask(t._id!, { archived: true })));
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
