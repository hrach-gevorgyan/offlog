import { beforeEach, describe, expect, it } from 'vitest';
import db, {
  posBetween,
  createProject, getProjects, deleteProject, removeColumn,
  createTask, getTasksForProject, updateTask, deleteTask,
  getRecentlyDeleted, getAllDeletedTasks, undoDelete, deleteForever, emptyTrash,
  getAllTasksDue, getDashboardData,
  checkIntegrity, repairDatabase,
  getConflicts, resolveConflict,
  importJSON,
  pruneOldLogs, pruneOldDeletedTasks,
  invalidateTaskCache,
  seedIfEmpty, getSpaces, initIndexes,
  createSpace, updateSpace, reorderSpaces, deleteSpace,
  getTagCounts, renameTag, deleteTagEverywhere,
} from '../src/lib/db';
import type { SpaceDoc } from '../src/lib/types';

// Full wipe between tests — db.ts's `db` is a module-level singleton (real
// app behavior: one database for the whole session), so test isolation has
// to come from clearing it out rather than from a fresh instance per test.
beforeEach(async () => {
  localStorage.clear();
  const all = await db.allDocs({ include_docs: true });
  const dels = all.rows.map(r => ({ ...(r.doc as any), _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
  invalidateTaskCache();
});

async function seedSpace(): Promise<SpaceDoc> {
  const space: SpaceDoc = {
    _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280',
    position: 0, updated_at: new Date().toISOString(), source: 'pc',
  };
  await db.put(space);
  return space;
}

describe('posBetween', () => {
  it('returns a default midpoint when both neighbors are null', () => {
    expect(posBetween(null, null)).toBe(1024);
  });
  it('halves the after value when there is no before', () => {
    expect(posBetween(null, 100)).toBe(50);
  });
  it('adds a fixed step past the before value when there is no after', () => {
    expect(posBetween(500, null)).toBe(500 + 1024);
  });
  it('splits the midpoint between two neighbors', () => {
    expect(posBetween(100, 200)).toBe(150);
  });
});

describe('project + task CRUD', () => {
  it('creates a project with the default four statuses', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    expect(project.columns.map(c => c.name)).toEqual(['Idea', 'Task', 'In Process', 'Completed']);
    const found = await getProjects('space:unsorted');
    expect(found.map(p => p._id)).toContain(project._id);
  });

  it('creates a task and retrieves it via the indexed project query', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    await createTask(project._id, 'space:unsorted', colId, 'My task');
    const tasks = await getTasksForProject(project._id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('My task');
  });

  it('getTasksForProject never truncates past 25 results (the bug caught in v2.9.0)', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Big Project');
    const colId = project.columns[0].id;
    for (let i = 0; i < 40; i++) {
      await createTask(project._id, 'space:unsorted', colId, `Task ${i}`);
    }
    const tasks = await getTasksForProject(project._id);
    expect(tasks).toHaveLength(40);
  });

  it('soft-deletes a task instead of removing the document', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'To delete');
    await deleteTask(task._id!);
    expect(await getTasksForProject(project._id)).toHaveLength(0);
    const doc = await db.get(task._id!);
    expect((doc as any).deleted).toBe(true);
  });

  it('deleting a project hard-deletes all of its tasks', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Doomed Project');
    await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Orphan-to-be');
    await deleteProject(project._id);
    const remaining = await getProjects('space:unsorted');
    expect(remaining).toHaveLength(0);
  });

  it('removeColumn reassigns its tasks to the first remaining status', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const [firstCol, secondCol] = project.columns;
    const task = await createTask(project._id, 'space:unsorted', secondCol.id, 'Movable');
    await removeColumn(project._id, secondCol.id);
    const [moved] = await getTasksForProject(project._id);
    expect(moved.column_id).toBe(firstCol.id);
  });
});

describe('undo / Deleted (trash)', () => {
  it('getRecentlyDeleted returns the most recent deletions first, capped at the given limit', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    const tasks = [];
    for (let i = 0; i < 15; i++) {
      tasks.push(await createTask(project._id, 'space:unsorted', colId, `Task ${i}`));
    }
    for (const t of tasks) await deleteTask(t._id!);
    const recent = await getRecentlyDeleted(10);
    expect(recent).toHaveLength(10);
  });

  it('getAllDeletedTasks returns every deleted task, unlike the capped undo list', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    for (let i = 0; i < 15; i++) {
      const t = await createTask(project._id, 'space:unsorted', colId, `Task ${i}`);
      await deleteTask(t._id!);
    }
    const all = await getAllDeletedTasks();
    expect(all).toHaveLength(15);
  });

  it('undoDelete restores a soft-deleted task', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Restore me');
    await deleteTask(task._id!);
    await undoDelete(task._id!);
    const tasks = await getTasksForProject(project._id);
    expect(tasks.map(t => t._id)).toContain(task._id);
  });

  it('deleteForever hard-removes a single trashed task', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Gone forever');
    await deleteTask(task._id!);
    await deleteForever(task._id!);
    await expect(db.get(task._id!)).rejects.toThrow();
    expect(await getAllDeletedTasks()).toHaveLength(0);
  });

  it('emptyTrash hard-removes every soft-deleted task and reports the count', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    for (let i = 0; i < 5; i++) {
      const t = await createTask(project._id, 'space:unsorted', colId, `Task ${i}`);
      await deleteTask(t._id!);
    }
    const removed = await emptyTrash();
    expect(removed).toBe(5);
    expect(await getAllDeletedTasks()).toHaveLength(0);
  });
});

// "Done" has no boolean field — a task counts as complete when its
// column_id equals the project's *last* column. Agenda, dashboard overdue
// counts, and reminders all rely on this convention independently; this
// test exercises it across the two query functions to catch drift between
// them (there is no shared helper enforcing it, only convention).
describe('"done" is positional (column_id === last column)', () => {
  it('getAllTasksDue excludes a task sitting in the last column, even if overdue', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const lastCol = project.columns.at(-1)!;
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Overdue task');
    await updateTask(task._id!, { due_date: '2020-01-01' });

    let due = await getAllTasksDue();
    expect(due.map(t => t._id)).toContain(task._id);

    await updateTask(task._id!, { column_id: lastCol.id });
    due = await getAllTasksDue();
    expect(due.map(t => t._id)).not.toContain(task._id);
  });

  it('getDashboardData excludes a completed task from the overdue list and count', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const lastCol = project.columns.at(-1)!;
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Overdue task');
    await updateTask(task._id!, { due_date: '2020-01-01' });

    let data = await getDashboardData();
    expect(data.overdueTasks.map(t => t._id)).toContain(task._id);
    expect(data.byProject[project._id].overdue).toBe(1);

    await updateTask(task._id!, { column_id: lastCol.id });
    data = await getDashboardData();
    expect(data.overdueTasks.map(t => t._id)).not.toContain(task._id);
    expect(data.byProject[project._id].overdue).toBe(0);
  });

  it('getDashboardData: B17 weekly-completed count, busiest project, and today tasks', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Weekly Project');
    const lastCol = project.columns.at(-1)!;
    const otherProject = await createProject('space:unsorted', 'Quiet Project');
    const otherLastCol = otherProject.columns.at(-1)!;

    // Two tasks completed (moved to the last column) this week in `project`,
    // one in `otherProject` — project should come out as busiest.
    const t1 = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Done 1');
    await updateTask(t1._id!, { column_id: lastCol.id });
    const t2 = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Done 2');
    await updateTask(t2._id!, { column_id: lastCol.id });
    const t3 = await createTask(otherProject._id, 'space:unsorted', otherProject.columns[0].id, 'Done 3');
    await updateTask(t3._id!, { column_id: otherLastCol.id });

    // Not-done task due today should show up in todayTasks.
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTask = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Due today');
    await updateTask(todayTask._id!, { due_date: todayStr });

    const data = await getDashboardData();
    expect(data.completedLast7Days).toBe(3);
    expect(data.busiestProjectName).toBe('Weekly Project');
    expect(data.todayTasks.map(t => t._id)).toContain(todayTask._id);
    // Completed tasks (in the last column) must not leak into todayTasks
    // even if they happened to have today's due_date.
    expect(data.todayTasks.map(t => t._id)).not.toContain(t1._id);
  });
});

describe('checkIntegrity / repairDatabase', () => {
  it('detects an orphaned task pointing at a missing project', async () => {
    await seedSpace();
    await db.put({
      _id: 'task:orphan', type: 'task', project_id: 'project:does-not-exist', space_id: 'space:unsorted',
      column_id: 'col:x', title: 'Orphan', body: '', priority: 1, due_date: null, reminder_at: null,
      tags: [], position: 0, deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'pc',
    });
    const { issues } = await checkIntegrity();
    expect(issues.some(i => i.type === 'orphaned_task')).toBe(true);
  });

  it('repairDatabase reassigns an orphaned task to the Unsorted space instead of leaving it broken', async () => {
    await seedSpace();
    const fallback = await createProject('space:unsorted', 'Fallback');
    await db.put({
      _id: 'task:orphan', type: 'task', project_id: 'project:does-not-exist', space_id: 'space:unsorted',
      column_id: 'col:x', title: 'Orphan', body: '', priority: 1, due_date: null, reminder_at: null,
      tags: [], position: 0, deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'pc',
    });
    const { fixed } = await repairDatabase();
    expect(fixed).toBeGreaterThan(0);
    const fixedDoc = await db.get<any>('task:orphan');
    expect(fixedDoc.project_id).toBe(fallback._id);
  });

  it('flags a project with zero statuses for manual review, and does not auto-repair it', async () => {
    await seedSpace();
    await db.put({
      _id: 'project:empty', type: 'project', space_id: 'space:unsorted', name: 'No Statuses',
      position: 0, columns: [], default_view: 'kanban', updated_at: new Date().toISOString(), source: 'pc',
    });
    const before = await checkIntegrity();
    expect(before.issues.some(i => i.type === 'no_columns')).toBe(true);
    await repairDatabase();
    const after = await checkIntegrity();
    expect(after.issues.some(i => i.type === 'no_columns')).toBe(true);
  });
});

describe('sync conflict resolution', () => {
  it('detects and resolves a genuine conflicting revision, keeping the chosen version', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Original');
    const doc = await db.get<any>(task._id!);

    // Manufacture a real PouchDB conflict: two branches off the same parent
    // revision, written with new_edits:false so PouchDB doesn't auto-merge them.
    const parentRevNum = parseInt(doc._rev.split('-')[0], 10);
    const nextGen = parentRevNum + 1;
    await db.bulkDocs(
      [
        { ...doc, _rev: `${nextGen}-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, title: 'Branch A' },
        { ...doc, _rev: `${nextGen}-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, title: 'Branch B' },
      ],
      { new_edits: false } as any,
    );

    const conflicts = await getConflicts();
    const conflict = conflicts.find(c => c.docId === task._id);
    expect(conflict).toBeDefined();

    await resolveConflict(conflict!.docId, 'other', conflict!.other.rev);

    const resolved = await db.get<any>(task._id!, { conflicts: true } as any);
    expect(resolved._conflicts ?? []).toHaveLength(0);
  });
});

describe('importJSON', () => {
  it('imports valid space/project/task docs and skips invalid ones', async () => {
    const now = new Date().toISOString();
    const docs = [
      { _id: 'space:imported', type: 'space', name: 'Imported', color: '#000', position: 0, updated_at: now, source: 'pc' },
      { _id: 'not-a-real-type', type: 'nonsense', foo: 'bar' },
      { type: 'task', title: 'no id at all' }, // missing _id — must be skipped, not throw
    ];
    const { ok, skipped } = await importJSON(docs);
    expect(ok).toBe(1);
    expect(skipped).toBe(0); // invalid docs are filtered out before bulkDocs, not counted as "skipped" errors
    const imported = await db.get('space:imported');
    expect(imported).toBeTruthy();
  });
});

describe('retention pruning', () => {
  it('pruneOldLogs removes only log entries older than the retention window', async () => {
    const oldTs = new Date();
    oldTs.setMonth(oldTs.getMonth() - 7);
    const recentTs = new Date();

    await db.put({ _id: `log:${oldTs.toISOString()}-old`, type: 'log', ts: oldTs.toISOString(), source: 'pc', ref: 'task:x', action: 'create' });
    await db.put({ _id: `log:${recentTs.toISOString()}-new`, type: 'log', ts: recentTs.toISOString(), source: 'pc', ref: 'task:x', action: 'create' });

    const removed = await pruneOldLogs();
    expect(removed).toBe(1);

    const remaining = await db.allDocs({ startkey: 'log:', endkey: 'log:￰' });
    expect(remaining.rows).toHaveLength(1);
  });

  it('pruneOldDeletedTasks removes only trashed tasks older than the retention window', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const oldTask = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Old trash');
    const recentTask = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'Recent trash');
    await deleteTask(oldTask._id!);
    await deleteTask(recentTask._id!);

    const oldTs = new Date();
    oldTs.setMonth(oldTs.getMonth() - 4);
    const oldDoc = await db.get<any>(oldTask._id!);
    await db.put({ ...oldDoc, updated_at: oldTs.toISOString() });
    invalidateTaskCache();

    const removed = await pruneOldDeletedTasks();
    expect(removed).toBe(1);
    const remainingTrash = await getAllDeletedTasks();
    expect(remainingTrash.map(t => t._id)).toEqual([recentTask._id]);
  });
});

// Smoke test: the app's real bootstrap path (store.ts's init()) does
// initIndexes() + seedIfEmpty() on a database that's usually empty on first
// launch. Exercising the same sequence headless catches anything that would
// otherwise only surface as a blank/broken screen on a brand-new install.
describe('bootstrap (seedIfEmpty smoke test)', () => {
  it('seeds four default spaces and a Draft project into an empty database', async () => {
    await initIndexes();
    await seedIfEmpty();

    const spaces = await getSpaces();
    expect(spaces.map(s => s.name).sort()).toEqual(['Family', 'Personal', 'Unsorted', 'Work'].sort());

    const projects = await getProjects('space:unsorted');
    expect(projects.map(p => p.name)).toContain('Draft');
  });

  it('does nothing to an already-seeded database', async () => {
    await seedIfEmpty();
    const before = await getSpaces();
    await seedIfEmpty();
    const after = await getSpaces();
    expect(after).toHaveLength(before.length);
  });
});

describe('space management', () => {
  it('creates a space positioned after the existing ones', async () => {
    await seedSpace();
    const space = await createSpace('Hobbies', '#f97316');
    expect(space.position).toBe(1);
    const all = await getSpaces();
    expect(all.map(s => s.name)).toContain('Hobbies');
  });

  it('updates a space\'s name and color', async () => {
    const space = await createSpace('Hobbies', '#f97316');
    const updated = await updateSpace(space._id, { name: 'Crafts', color: '#22c55e' });
    expect(updated.name).toBe('Crafts');
    expect(updated.color).toBe('#22c55e');
  });

  it('reorders spaces to match the given id order', async () => {
    const a = await createSpace('A', '#000');
    const b = await createSpace('B', '#000');
    const c = await createSpace('C', '#000');
    await reorderSpaces([c._id, a._id, b._id]);
    const ordered = await getSpaces();
    expect(ordered.map(s => s._id)).toEqual([c._id, a._id, b._id]);
  });

  it('refuses to delete the Unsorted space', async () => {
    await seedSpace();
    await expect(deleteSpace('space:unsorted')).rejects.toThrow();
  });

  it('deleting a space reassigns its projects to Unsorted instead of destroying them', async () => {
    await seedSpace();
    const hobbies = await createSpace('Hobbies', '#f97316');
    const project = await createProject(hobbies._id, 'Woodworking');
    await deleteSpace(hobbies._id);
    const reassigned = await db.get<any>(project._id);
    expect(reassigned.space_id).toBe('space:unsorted');
    const remainingSpaces = await getSpaces();
    expect(remainingSpaces.map(s => s._id)).not.toContain(hobbies._id);
  });
});

describe('tag management', () => {
  it('counts tag usage across active tasks only', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    const t1 = await createTask(project._id, 'space:unsorted', colId, 'A');
    const t2 = await createTask(project._id, 'space:unsorted', colId, 'B');
    const t3 = await createTask(project._id, 'space:unsorted', colId, 'C (deleted)');
    await updateTask(t1._id!, { tags: ['urgent', 'home'] });
    await updateTask(t2._id!, { tags: ['urgent'] });
    await updateTask(t3._id!, { tags: ['urgent'] });
    await deleteTask(t3._id!);

    const counts = await getTagCounts();
    expect(counts).toEqual([
      { tag: 'urgent', count: 2 },
      { tag: 'home', count: 1 },
    ]);
  });

  it('renames a tag across every task that has it', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    const t1 = await createTask(project._id, 'space:unsorted', colId, 'A');
    const t2 = await createTask(project._id, 'space:unsorted', colId, 'B');
    await updateTask(t1._id!, { tags: ['wrk'] });
    await updateTask(t2._id!, { tags: ['wrk', 'urgent'] });

    const changed = await renameTag('wrk', 'work');
    expect(changed).toBe(2);

    const tasks = await getTasksForProject(project._id);
    expect(tasks.find(t => t._id === t1._id)!.tags).toEqual(['work']);
    expect(tasks.find(t => t._id === t2._id)!.tags.sort()).toEqual(['urgent', 'work']);
  });

  it('renaming a tag to an existing tag merges instead of duplicating', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'A');
    await updateTask(task._id!, { tags: ['wrk', 'work'] });

    await renameTag('wrk', 'work');

    const [updated] = await getTasksForProject(project._id);
    expect(updated.tags).toEqual(['work']);
  });

  it('deletes a tag from every task that has it', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    const t1 = await createTask(project._id, 'space:unsorted', colId, 'A');
    const t2 = await createTask(project._id, 'space:unsorted', colId, 'B');
    await updateTask(t1._id!, { tags: ['temp'] });
    await updateTask(t2._id!, { tags: ['temp', 'keep'] });

    const removed = await deleteTagEverywhere('temp');
    expect(removed).toBe(2);

    const tasks = await getTasksForProject(project._id);
    expect(tasks.find(t => t._id === t1._id)!.tags).toEqual([]);
    expect(tasks.find(t => t._id === t2._id)!.tags).toEqual(['keep']);
  });
});
