import { beforeEach, describe, expect, it } from 'vitest';
import db, {
  posBetween, computeDropPosition,
  createProject, createProjectFromTemplate, getProjects, deleteProject, removeColumn, archiveProject, unarchiveProject, getRecentLogs,
  createTask, getTasksForProject, updateTask, deleteTask,
  getRecentlyDeleted, getAllDeletedTasks, undoDelete, deleteForever, emptyTrash, subscribeUndo,
  getAllTasksDue, getDashboardData,
  checkIntegrity, repairDatabase, runMaintenanceSteps,
  getConflicts, resolveConflict,
  importJSON,
  pruneOldLogs, pruneOldDeletedTasks,
  invalidateTaskCache,
  seedIfEmpty, getSpaces, initIndexes, clearLocalSeedBeforeFirstPair, scanConflicts,
  createSpace, updateSpace, reorderSpaces, deleteSpace,
  getTagCounts, renameTag, deleteTagEverywhere,
  findSpacesByName, findProjectsByName, findTasksByTitleInProject, findSimilarNotes,
} from '../src/lib/db';
import { findDuplicateChecklistItems, wordOverlapSimilarity, localDateStr } from '../src/lib/utils';
import type { SpaceDoc } from '../src/lib/types';

// Full wipe between tests — db.ts's `db` is a module-level singleton (real
// app behavior: one database for the whole session), so test isolation has
// to come from clearing it out rather than from a fresh instance per test.
//
// Found live (2026-07-20) while adding the duplicate-name-detection tests:
// a conflict-manufacturing test (`new_edits: false`) leaves losing leaf
// revisions behind that `db.allDocs({ include_docs: true })` never sees
// (it only returns each doc's current winner) — bulkDocs-deleting just
// that winner leaves the loser alive, so the next test's plain `db.put()`
// on the same fixed id (no `_rev`, since it thinks the doc doesn't exist)
// throws "Document update conflict". Explicitly removing every
// `_conflicts` revision too, not just the winner, closes that gap for any
// future conflict test, not just the one that happened to trip it.
beforeEach(async () => {
  localStorage.clear();
  const all = await db.allDocs({ include_docs: true, conflicts: true });
  const dels = all.rows.map(r => ({ ...(r.doc as any), _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
  for (const row of all.rows as any[]) {
    for (const rev of row.doc?._conflicts ?? []) {
      try { await db.remove(row.id, rev); } catch { /* already gone */ }
    }
  }
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

// A9: the pure position math behind KanbanBoard.svelte's drag-and-drop
// (both the HTML5 desktop path and the touch path share this one
// function) — see computeDropPosition()'s own comment in db.ts for why
// this was extracted specifically to make it testable without a full
// jsdom drag/touch-event simulation.
describe('computeDropPosition', () => {
  const col = (positions: number[]) => positions.map(position => ({ position }));

  it('drops at the end of an empty column', () => {
    expect(computeDropPosition(col([]), null)).toBe(1024);
  });

  it('drops after the last card when dragOverIndex is null', () => {
    expect(computeDropPosition(col([1024, 2048]), null)).toBe(3072);
  });

  it('drops before the first card when dragOverIndex is 0', () => {
    expect(computeDropPosition(col([1024, 2048]), 0)).toBe(512);
  });

  it('drops between two cards when dragOverIndex points into the middle', () => {
    expect(computeDropPosition(col([1024, 2048, 3072]), 1)).toBe(1536);
  });

  it('drops at the end when dragOverIndex points past the last card', () => {
    // Same effective result as null (no "after" neighbor to insert before) --
    // covers the real onCardListDrop/onTouchEnd call sites, which can pass
    // an index equal to colTasks.length in some drop-target edge cases.
    expect(computeDropPosition(col([1024, 2048]), 2)).toBe(2048 + 1024);
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

  it('updateTask persists a checklist array (B18)', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Checklist Project');
    const task = await createTask(project._id, 'space:unsorted', project.columns[0].id, 'With subtasks');
    expect(task.checklist).toBeUndefined();

    await updateTask(task._id!, { checklist: [{ text: 'Step 1', done: false }, { text: 'Step 2', done: true }] });
    const [saved] = await getTasksForProject(project._id);
    expect(saved.checklist).toHaveLength(2);
    expect(saved.checklist?.filter(i => i.done)).toHaveLength(1);
  });
});

describe('createProjectFromTemplate (B8)', () => {
  it('copies the template\'s status structure with fresh column ids', async () => {
    await seedSpace();
    const template = await createProject('space:unsorted', 'Template Project');
    const copy = await createProjectFromTemplate('space:unsorted', 'New Project', template._id, false);
    expect(copy.columns.map(c => c.name)).toEqual(template.columns.map(c => c.name));
    expect(copy.columns.map(c => c.id)).not.toEqual(template.columns.map(c => c.id));
  });

  it('does not copy tasks when copyOpenTasks is false', async () => {
    await seedSpace();
    const template = await createProject('space:unsorted', 'Template Project');
    await createTask(template._id, 'space:unsorted', template.columns[0].id, 'Open task');
    const copy = await createProjectFromTemplate('space:unsorted', 'New Project', template._id, false);
    expect(await getTasksForProject(copy._id)).toHaveLength(0);
  });

  it('copies only open (not-in-last-column) tasks, remapped to the new columns, with deadlines/reminders reset', async () => {
    await seedSpace();
    const template = await createProject('space:unsorted', 'Template Project');
    const [firstCol, , , lastCol] = template.columns;
    await createTask(template._id, 'space:unsorted', firstCol.id, 'Open task');
    const doneTask = await createTask(template._id, 'space:unsorted', lastCol.id, 'Done task');
    await updateTask(doneTask._id!, { due_date: '2026-01-01', reminder_at: '2026-01-01T09:00' });

    const copy = await createProjectFromTemplate('space:unsorted', 'New Project', template._id, true);
    const copiedTasks = await getTasksForProject(copy._id);
    expect(copiedTasks).toHaveLength(1);
    expect(copiedTasks[0].title).toBe('Open task');
    expect(copiedTasks[0].due_date).toBeNull();
    expect(copiedTasks[0].reminder_at).toBeNull();
    expect(copy.columns.some(c => c.id === copiedTasks[0].column_id)).toBe(true);
    expect(template.columns.some(c => c.id === copiedTasks[0].column_id)).toBe(false);
  });

  it('resets checklist items to unchecked on the copy', async () => {
    await seedSpace();
    const template = await createProject('space:unsorted', 'Template Project');
    const task = await createTask(template._id, 'space:unsorted', template.columns[0].id, 'Checklist task');
    await updateTask(task._id!, { checklist: [{ text: 'Step 1', done: true }] });

    const copy = await createProjectFromTemplate('space:unsorted', 'New Project', template._id, true);
    const [copiedTask] = await getTasksForProject(copy._id);
    expect(copiedTask.checklist?.[0].done).toBe(false);
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

  it('undoDelete does not re-trigger the undo-toast listener (regression: chained undo toast, 2026-07-22)', async () => {
    // Real bug: undoDelete() used to call the same _undoListeners notify
    // that deleteTask() uses to pop up App.svelte's "Undo" toast.
    // showUndoToast() (the only real subscriber) pulls the single
    // most-recently-deleted task -- so restoring task A re-fired the
    // listener, which found task B (now the next most recent deleted
    // task) and popped a SECOND toast, chained off clicking the first
    // one's Undo button. subscribeUndo's callback must fire exactly once
    // per real delete, never on a restore.
    await seedSpace();
    const project = await createProject('space:unsorted', 'Test Project');
    const colId = project.columns[0].id;
    const taskA = await createTask(project._id, 'space:unsorted', colId, 'Task A');
    const taskB = await createTask(project._id, 'space:unsorted', colId, 'Task B');

    let notifyCount = 0;
    const unsubscribe = subscribeUndo(() => { notifyCount++; });
    try {
      await deleteTask(taskA._id!);
      await deleteTask(taskB._id!);
      expect(notifyCount).toBe(2); // one per real delete
      await undoDelete(taskA._id!);
      expect(notifyCount).toBe(2); // unchanged -- a restore must not notify
    } finally {
      unsubscribe();
    }
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

    // Not-done task due today should show up in todayTasks. Must be the
    // LOCAL calendar date, same as getDashboardData's own comparison —
    // toISOString() is UTC, which made this exact test fail only when run
    // between midnight and UTC-offset o'clock local time (caught live at
    // 02:42 UTC+4, 2026-07-23; the v5.7.1 pass fixed this class in app
    // code but missed this test-side copy).
    const todayStr = localDateStr(new Date());
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

  it('archiveProject/unarchiveProject write a changelog entry (maintenance pass fix, v4.10.0)', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Log Test Project');

    await archiveProject(project._id);
    let logs = await getRecentLogs(20);
    expect(logs.some(l => l.ref === project._id && l.action === 'update' && l.field === 'archived' && l.to === true)).toBe(true);

    await unarchiveProject(project._id);
    logs = await getRecentLogs(20);
    expect(logs.some(l => l.ref === project._id && l.action === 'update' && l.field === 'archived' && l.to === false)).toBe(true);
  });
});

describe('recurring tasks', () => {
  // Single task object for the whole series (matches Todoist/Google
  // Tasks/Microsoft To Do/Apple Reminders) -- moving a recurring task
  // into the last column resets IT in place rather than spawning a
  // second card. A first version spawned a new task per completion;
  // changed after owner feedback (2026-07-19: "now we have two task
  // with same name").
  it('resets a daily task back into the first column with the due date advanced, in place -- no second task', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const lastCol = project.columns.at(-1)!.id;
    const task = await createTask(project._id, 'space:unsorted', firstCol, 'Water plants');
    await updateTask(task._id!, { due_date: '2026-07-15', recurrence: 'daily' });

    const result = await updateTask(task._id!, { column_id: lastCol });

    const tasks = await getTasksForProject(project._id);
    expect(tasks).toHaveLength(1);
    expect(result.column_id).toBe(firstCol);
    expect(result.due_date).toBe('2026-07-16');
    expect(result.recurrence).toBe('daily');
    const stored = tasks[0];
    expect(stored.column_id).toBe(firstCol);
    expect(stored.due_date).toBe('2026-07-16');
  });

  it('advances weekly by 7 days and monthly by 1 month', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const lastCol = project.columns.at(-1)!.id;

    const weekly = await createTask(project._id, 'space:unsorted', firstCol, 'Weekly');
    await updateTask(weekly._id!, { due_date: '2026-07-15', recurrence: 'weekly' });
    const weeklyResult = await updateTask(weekly._id!, { column_id: lastCol });

    const monthly = await createTask(project._id, 'space:unsorted', firstCol, 'Monthly');
    await updateTask(monthly._id!, { due_date: '2026-07-15', recurrence: 'monthly' });
    const monthlyResult = await updateTask(monthly._id!, { column_id: lastCol });

    expect(weeklyResult.due_date).toBe('2026-07-22');
    expect(monthlyResult.due_date).toBe('2026-08-15');
  });

  it('advances from the original due date, not from today, so a late completion does not drift the schedule', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const lastCol = project.columns.at(-1)!.id;
    // A task that was due last week (completed late) should still advance
    // relative to ITS due date, landing on next week's occurrence of the
    // same weekday -- not "today + 1 week".
    const task = await createTask(project._id, 'space:unsorted', firstCol, 'Standup');
    await updateTask(task._id!, { due_date: '2026-07-01', recurrence: 'weekly' });
    const result = await updateTask(task._id!, { column_id: lastCol });

    expect(result.due_date).toBe('2026-07-08');
  });

  it('does not reset a non-recurring task when it is completed -- it stays in the last column', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const lastCol = project.columns.at(-1)!.id;
    const task = await createTask(project._id, 'space:unsorted', firstCol, 'One-off');
    await updateTask(task._id!, { due_date: '2026-07-15' });

    const result = await updateTask(task._id!, { column_id: lastCol });

    expect(result.column_id).toBe(lastCol);
    const tasks = await getTasksForProject(project._id);
    expect(tasks).toHaveLength(1);
  });

  it('does not re-trigger the reset when a recurring task is moved back out of the first column normally', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const midCol = project.columns[1].id;
    const lastCol = project.columns.at(-1)!.id;
    const task = await createTask(project._id, 'space:unsorted', firstCol, 'Water plants');
    await updateTask(task._id!, { due_date: '2026-07-15', recurrence: 'daily' });
    await updateTask(task._id!, { column_id: lastCol }); // completes -> resets to firstCol, due 07-16

    // Normal workflow: move the (reset) task into a middle column -- must
    // not be misread as another completion.
    const result = await updateTask(task._id!, { column_id: midCol });

    expect(result.column_id).toBe(midCol);
    expect(result.due_date).toBe('2026-07-16'); // unchanged by this move
    const tasks = await getTasksForProject(project._id);
    expect(tasks).toHaveLength(1);
  });

  it('carries over tags, priority, and custom values, and resets the checklist to unchecked', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const lastCol = project.columns.at(-1)!.id;
    const task = await createTask(project._id, 'space:unsorted', firstCol, 'Weekly review');
    await updateTask(task._id!, {
      due_date: '2026-07-15', recurrence: 'weekly', priority: 3, tags: ['work', 'urgent'],
      checklist: [{ text: 'Check inbox', done: true }, { text: 'Plan week', done: false }],
    });

    const result = await updateTask(task._id!, { column_id: lastCol });

    expect(result.priority).toBe(3);
    expect(result.tags).toEqual(['work', 'urgent']);
    expect(result.checklist).toEqual([{ text: 'Check inbox', done: false }, { text: 'Plan week', done: false }]);
  });

  it('falls back to today as the base date when due_date is missing', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const lastCol = project.columns.at(-1)!.id;
    // Directly write a recurrence rule without a due_date -- shouldn't
    // normally happen via the UI (CardDetail clears recurrence when
    // due_date is cleared), but db.ts must not crash if it does.
    const task = await createTask(project._id, 'space:unsorted', firstCol, 'No due date');
    await updateTask(task._id!, { recurrence: 'daily' });

    const result = await updateTask(task._id!, { column_id: lastCol });

    expect(result.column_id).toBe(firstCol);
    expect(result.due_date).not.toBeNull();
  });

  it('logs the completion as a move to the last column, with the due-date advance in its diffs', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Recurring Project');
    const firstCol = project.columns[0].id;
    const lastCol = project.columns.at(-1)!.id;
    const lastColName = project.columns.at(-1)!.name;
    const task = await createTask(project._id, 'space:unsorted', firstCol, 'Water plants');
    await updateTask(task._id!, { due_date: '2026-07-15', recurrence: 'daily' });

    await updateTask(task._id!, { column_id: lastCol });

    const logs = await getRecentLogs(20);
    const moveLog = logs.find(l => l.ref === task._id && l.action === 'move');
    expect(moveLog?.to).toBe(lastColName);
    expect(moveLog?.diffs?.due_date).toEqual({ from: '2026-07-15', to: '2026-07-16' });
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

// A9 (ROADMAP.md): the step sequencing/message-formatting behind
// SettingsPanel.svelte's "Run Maintenance" flow, extracted to
// runMaintenanceSteps() specifically so it's reachable without mounting
// that whole component — see its own comment in db.ts.
describe('runMaintenanceSteps', () => {
  it('runs all 5 steps in order, each reported running-then-done, and skips repair when nothing is broken', async () => {
    await seedSpace();
    const project = await createProject('space:unsorted', 'Clean Project');
    await createTask(project._id, 'space:unsorted', project.columns[0].id, 'A task');

    const seen: { key: string; status: string }[] = [];
    const { remainingIssues } = await runMaintenanceSteps((s) => seen.push({ key: s.key, status: s.status }));

    expect(remainingIssues).toEqual([]);
    // Every step reports 'running' immediately before its own settled
    // status, in fixed key order -- exactly what the Settings step list
    // renders a spinner-then-checkmark from.
    expect(seen).toEqual([
      { key: 'check', status: 'running' }, { key: 'check', status: 'done' },
      { key: 'repair', status: 'skipped' },
      { key: 'history', status: 'running' }, { key: 'history', status: 'done' },
      { key: 'trash', status: 'running' }, { key: 'trash', status: 'done' },
      { key: 'compact', status: 'running' }, { key: 'compact', status: 'done' },
    ]);
  });

  it('repairs a fixable issue and reports it in the repair step note', async () => {
    await seedSpace();
    const fallback = await createProject('space:unsorted', 'Fallback');
    await db.put({
      _id: 'task:orphan', type: 'task', project_id: 'project:does-not-exist', space_id: 'space:unsorted',
      column_id: 'col:x', title: 'Orphan', body: '', priority: 1, due_date: null, reminder_at: null,
      tags: [], position: 0, deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), source: 'pc',
    });

    const steps: Record<string, { status: string; note: string }> = {};
    await runMaintenanceSteps((s) => { if (s.status !== 'running') steps[s.key] = { status: s.status, note: s.note }; });

    expect(steps.check.note).toMatch(/1 issue/);
    expect(steps.repair.status).toBe('done');
    expect(steps.repair.note).toMatch(/Fixed 1/);
    const fixedDoc = await db.get<any>('task:orphan');
    expect(fixedDoc.project_id).toBe(fallback._id);
  });

  it('reports unfixable issues as remainingIssues without failing the run', async () => {
    await seedSpace();
    await db.put({
      _id: 'project:empty', type: 'project', space_id: 'space:unsorted', name: 'No Statuses',
      position: 0, columns: [], default_view: 'kanban', updated_at: new Date().toISOString(), source: 'pc',
    });

    const { remainingIssues } = await runMaintenanceSteps(() => {});
    expect(remainingIssues.some(i => i.type === 'no_columns')).toBe(true);
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

  // 2026-07-18 audit finding: a doc whose id already exists locally used
  // to be silently rejected by PouchDB (no _rev attached, so it read as
  // "create over an existing doc" -> 409) and counted as "ok" anyway --
  // the existing local doc was never actually touched, despite the
  // Restore tab's own UI copy promising it "merges instead of
  // duplicating." Regression coverage for actually overwriting it.
  it('overwrites an existing doc with the imported content when ids collide', async () => {
    const now = new Date().toISOString();
    await db.put({ _id: 'space:existing', type: 'space', name: 'Old Name', color: '#111', position: 0, updated_at: now, source: 'pc' });

    const { ok, skipped } = await importJSON([
      { _id: 'space:existing', type: 'space', name: 'New Name From Backup', color: '#222', position: 0, updated_at: now, source: 'pc' },
    ]);

    expect(ok).toBe(1);
    expect(skipped).toBe(0);
    const after = await db.get('space:existing') as any;
    expect(after.name).toBe('New Name From Backup');
    expect(after.color).toBe('#222');
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
  it('seeds three default spaces (B24: Family dropped) and a Draft project into an empty database', async () => {
    await initIndexes();
    await seedIfEmpty();

    const spaces = await getSpaces();
    expect(spaces.map(s => s.name).sort()).toEqual(['Personal', 'Unsorted', 'Work'].sort());

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

// Track E pairing bug (owner-reported, 2026-07-14): seedIfEmpty()'s fixed,
// not per-install-random, ids (space:unsorted/personal/work, project:draft)
// collide the instant two independently-seeded devices sync together —
// reproduced live pairing a fresh phone to a fresh PC (4 real conflicts,
// one per fixed id). clearLocalSeedBeforeFirstPair() is the fix, called
// from discovery.ts's pairWithHost() right before sync starts.
describe('clearLocalSeedBeforeFirstPair()', () => {
  it('removes the pristine seed when the device has zero tasks', async () => {
    await seedIfEmpty();
    expect((await getSpaces()).length).toBeGreaterThan(0);
    await clearLocalSeedBeforeFirstPair();
    expect(await getSpaces()).toEqual([]);
    await expect(db.get('project:draft')).rejects.toThrow();
  });

  it('leaves everything alone once the device has real content', async () => {
    await seedIfEmpty();
    const [space] = await getSpaces();
    const project = await createProject(space._id!, 'Real project');
    await createTask(project._id!, space._id!, 'col:idea', 'A real task');

    await clearLocalSeedBeforeFirstPair();

    expect((await getSpaces()).length).toBeGreaterThan(0);
    await expect(db.get('project:draft')).resolves.toBeTruthy();
  });

  it('is a no-op when nothing has ever been seeded', async () => {
    await expect(clearLocalSeedBeforeFirstPair()).resolves.toBeUndefined();
  });
});

// S2 (docs/IDEAS.md's sync-topology questions, 2026-07-20): confirmed live
// against a real 180-doc dataset — clearLocalSeedBeforeFirstPair() only
// protects the side that's still pristine; a phone with real accumulated
// history (which skips that guard) pairing against a PC whose own
// defaults were never touched still forks real conflicts on the fixed
// seed ids. scanConflicts() now auto-resolves those specific conflicts
// when one side is provably still the untouched default.
describe('scanConflicts() auto-resolving pristine default conflicts', () => {
  it('normalizes a pristine-vs-real-edit conflict on a fixed default id to the real edit, regardless of which revision PouchDB initially favored', async () => {
    await seedIfEmpty();
    const pristine = await db.get<any>('space:unsorted');
    const parentGen = parseInt(pristine._rev.split('-')[0], 10);
    const nextGen = parentGen + 1;
    await db.bulkDocs(
      [
        { ...pristine, _rev: `${nextGen}-11111111111111111111111111111111` }, // still pristine
        { ...pristine, name: 'Errands', color: '#000000', _rev: `${nextGen}-22222222222222222222222222222222` }, // real edit
      ],
      { new_edits: false } as any,
    );

    await scanConflicts();

    const doc = await db.get<any>('space:unsorted', { conflicts: true } as any);
    expect(doc._conflicts ?? []).toHaveLength(0);
    expect(doc.name).toBe('Errands');
  });

  it('leaves two genuinely different real edits as a real, unresolved conflict', async () => {
    await seedIfEmpty();
    const pristine = await db.get<any>('space:unsorted');
    const parentGen = parseInt(pristine._rev.split('-')[0], 10);
    const nextGen = parentGen + 1;
    await db.bulkDocs(
      [
        { ...pristine, name: 'Errands', _rev: `${nextGen}-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` },
        { ...pristine, name: 'Chores', _rev: `${nextGen}-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` },
      ],
      { new_edits: false } as any,
    );

    await scanConflicts();

    const doc = await db.get<any>('space:unsorted', { conflicts: true } as any);
    expect(doc._conflicts ?? []).toHaveLength(1);
  });
});

// Owner-requested (2026-07-20, after spotting a real duplicate "Draft"
// project from two independently-seeded devices merging): a non-blocking
// "did you mean to do this" nudge for accidental duplicates across
// spaces/projects/tasks/checklist items/notes — never a hard rule, see
// utils.ts's own header comment.
describe('duplicate-name detection helpers', () => {
  it('findSpacesByName matches case-insensitively and trims, excluding a given id', async () => {
    const space = await seedSpace();
    await createSpace('Work', '#000');
    expect(await findSpacesByName('  work ')).toHaveLength(1);
    expect(await findSpacesByName('Work', (await findSpacesByName('Work'))[0]._id)).toHaveLength(0);
    expect(await findSpacesByName('Nonexistent')).toHaveLength(0);
    expect(await findSpacesByName(space.name)).toHaveLength(1);
  });

  it('findProjectsByName matches across different spaces (the real "Draft" scenario)', async () => {
    await seedSpace();
    const work = await createSpace('Work', '#000');
    const p1 = await createProject('space:unsorted', 'Draft');
    await createProject(work._id!, 'Draft');
    const matches = await findProjectsByName('draft');
    expect(matches).toHaveLength(2);
    expect(await findProjectsByName('draft', p1._id)).toHaveLength(1);
  });

  it('findTasksByTitleInProject is scoped to one project, not global', async () => {
    await seedSpace();
    const p1 = await createProject('space:unsorted', 'A');
    const p2 = await createProject('space:unsorted', 'B');
    await createTask(p1._id!, 'space:unsorted', p1.columns[0].id, 'Follow up');
    await createTask(p2._id!, 'space:unsorted', p2.columns[0].id, 'Follow up');
    expect(await findTasksByTitleInProject(p1._id!, 'follow up')).toHaveLength(1);
    expect(await findTasksByTitleInProject(p1._id!, 'something else')).toHaveLength(0);
  });

  it('findSimilarNotes skips short bodies and flags similar-but-not-identical text', async () => {
    await seedSpace();
    const proj = await createProject('space:unsorted', 'A');
    const t1 = await createTask(proj._id!, 'space:unsorted', proj.columns[0].id, 'Task one');
    await updateTask(t1._id!, { body: 'Call the plumber about the leaking kitchen sink before Friday' });
    const t2 = await createTask(proj._id!, 'space:unsorted', proj.columns[0].id, 'Task two');

    // Too short to be meaningful — must not flag.
    expect(await findSimilarNotes(t2._id!, 'short note')).toHaveLength(0);

    // Similar (shares most words) but not identical — should flag t1.
    const similar = await findSimilarNotes(t2._id!, 'Call the plumber about the leaking kitchen sink before Monday');
    expect(similar.some(m => m.taskId === t1._id)).toBe(true);

    // Excluding the task's own id must never flag itself.
    const self = await findSimilarNotes(t1._id!, 'Call the plumber about the leaking kitchen sink before Friday');
    expect(self.some(m => m.taskId === t1._id)).toBe(false);
  });

  it('wordOverlapSimilarity is 0 for disjoint text and 1 for identical text', () => {
    expect(wordOverlapSimilarity('hello world', 'goodbye moon')).toBe(0);
    expect(wordOverlapSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('findDuplicateChecklistItems finds case-insensitive/trimmed repeats only', () => {
    const items = [{ text: 'Buy milk' }, { text: '  buy milk  ' }, { text: 'Buy eggs' }];
    expect(findDuplicateChecklistItems(items)).toEqual(['buy milk']);
    expect(findDuplicateChecklistItems([{ text: 'A' }, { text: 'B' }])).toEqual([]);
  });
});
