import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import db, {
  invalidateTaskCache, getDashboardData, getTasksForProject,
  searchAllTasks, getLogsForTask, getAllTasksDue,
} from '../src/lib/db';
import type { ProjectDoc, SpaceDoc, TaskDoc } from '../src/lib/types';
import { getAllTasksRaw } from '../src/lib/db/core';

// perf.bench.ts measures latency and deliberately hardcodes no threshold:
// absolute timings depend on the machine, so a wall-clock assertion would be
// flaky on a shared CI runner and would fail for reasons that aren't code.
//
// This gate gets the same protection deterministically by asserting on the
// WORK DONE rather than the time taken — how many database round-trips a read
// path costs, and whether that number grows with the amount of data. The
// regressions worth catching are algorithmic: losing the task cache, a query
// that turns into one-per-project, or a find() that silently truncates.

const TASKS = 400;
const PROJECTS = 8;

let projectIds: string[] = [];
let allDocsSpy: ReturnType<typeof vi.spyOn>;
let findSpy: ReturnType<typeof vi.spyOn>;

async function wipe() {
  const all = await db.allDocs({ include_docs: true });
  const dels = all.rows.map(r => ({ ...(r.doc as Record<string, unknown>), _deleted: true }));
  if (dels.length) await db.bulkDocs(dels as never);
  invalidateTaskCache();
}

async function seed(taskCount: number) {
  const space: SpaceDoc = {
    _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280',
    position: 0, updated_at: '2026-01-01T00:00:00.000Z', source: 'pc',
  };
  await db.put(space);
  projectIds = [];
  const projects: ProjectDoc[] = [];
  for (let i = 0; i < PROJECTS; i++) {
    const p: ProjectDoc = {
      _id: `project:p${i}`, type: 'project', space_id: 'space:unsorted', name: `Project ${i}`,
      position: i, columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }],
      default_view: 'kanban', updated_at: '2026-01-01T00:00:00.000Z', source: 'pc',
    };
    projects.push(p); projectIds.push(p._id!);
  }
  await db.bulkDocs(projects as never);

  const docs: TaskDoc[] = [];
  for (let i = 0; i < taskCount; i++) {
    const p = projects[i % PROJECTS];
    docs.push({
      _id: `task:g${i}`, type: 'task', project_id: p._id!, space_id: 'space:unsorted',
      column_id: p.columns[i % 2].id, title: `Guard task ${i} findable-term`, body: '',
      priority: ((i % 3) + 1) as 1 | 2 | 3, due_date: null, reminder_at: null, tags: [],
      position: i, deleted: false, archived: false,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', source: 'pc',
    });
  }
  await db.bulkDocs(docs as never);
  invalidateTaskCache();
}

beforeEach(async () => {
  await wipe();
  allDocsSpy = vi.spyOn(db, 'allDocs');
  findSpy = vi.spyOn(db, 'find');
});
afterEach(() => { vi.restoreAllMocks(); });

// Counts only full task-range scans. getAllTasksDue() also reads projects,
// which are not cached — mixing those in would make this assert an unrelated
// implementation detail instead of the cache.
const taskScans = () =>
  (allDocsSpy.mock.calls as Array<[{ startkey?: string }?]>)
    .filter(([opts]) => typeof opts?.startkey === 'string' && opts.startkey.startsWith('task:'))
    .length;

describe('read paths — the task cache', () => {
  it('scans tasks once, then serves repeat reads from memory', async () => {
    await seed(TASKS);

    allDocsSpy.mockClear();
    await getAllTasksDue();
    expect(taskScans()).toBe(1);

    allDocsSpy.mockClear();
    await getAllTasksDue();
    await getAllTasksDue();
    // every cross-cutting view (dashboard, agenda, search, tag autocomplete)
    // needs the whole task list; re-scanning per call is the regression
    expect(taskScans()).toBe(0);
  });

  // Invalidation marks the cache stale rather than dropping it, and the next
  // read catches up from the change feed. Every task write invalidates, so
  // re-reading the whole table meant one edit cost the next read a full
  // rebuild -- 139ms against 20,000 tasks versus 1ms warm.
  //
  // Correctness first, then cost: a cache that is fast and wrong is worse
  // than the full rescan it replaced.
  it('reflects a write after invalidation without rescanning the table', async () => {
    await seed(TASKS);
    await getAllTasksDue();

    const doc = await db.get<TaskDoc>('task:g0');
    await db.put({ ...doc, title: 'edited after cache was warm', due_date: '2026-01-02' });
    invalidateTaskCache();

    allDocsSpy.mockClear();
    const tasks = await getAllTasksRaw();

    expect(tasks.find(t => t._id === 'task:g0')?.title).toBe('edited after cache was warm');
    expect(tasks).toHaveLength(TASKS);
    expect(taskScans()).toBe(0);
  });

  it('drops a deleted task from the cache on catch-up', async () => {
    await seed(TASKS);
    await getAllTasksRaw();

    const doc = await db.get<TaskDoc>('task:g1');
    await db.remove(doc);
    invalidateTaskCache();

    const tasks = await getAllTasksRaw();
    expect(tasks.find(t => t._id === 'task:g1')).toBeUndefined();
    expect(tasks).toHaveLength(TASKS - 1);
  });

  it('stays correct across many separate writes', async () => {
    await seed(TASKS);
    await getAllTasksRaw();

    for (let i = 0; i < 12; i++) {
      const doc = await db.get<TaskDoc>(`task:g${i}`);
      await db.put({ ...doc, title: `rewritten ${i}` });
      invalidateTaskCache();
      await getAllTasksRaw();
    }

    const tasks = await getAllTasksRaw();
    expect(tasks).toHaveLength(TASKS);
    for (let i = 0; i < 12; i++) {
      expect(tasks.find(t => t._id === `task:g${i}`)?.title).toBe(`rewritten ${i}`);
    }
  });

  // Past the catch-up limit, re-reading the table is cheaper than replaying
  // changes one at a time -- a first sync or a wipeAndReseed lands here.
  it('falls back to a full reload when too much changed at once', async () => {
    // More documents than CATCHUP_LIMIT: the change feed returns one entry
    // per DOCUMENT, not per revision, so rewriting 400 twice would still be
    // 400 changes and would stay under the limit.
    await wipe();
    await seed(600);
    await getAllTasksRaw();

    const docs = await db.allDocs<TaskDoc>({ startkey: 'task:', endkey: 'task:\uFFF0', include_docs: true });
    await db.bulkDocs(docs.rows.map(r => ({ ...r.doc!, title: 'bulk rewrite' })) as never);
    invalidateTaskCache();

    allDocsSpy.mockClear();
    const tasks = await getAllTasksRaw();

    expect(taskScans()).toBe(1);
    expect(tasks.every(t => t.title === 'bulk rewrite')).toBe(true);
  });
});

describe('read paths — cost does not grow with the data', () => {
  async function roundTrips(run: () => Promise<unknown>, taskCount: number) {
    await wipe();
    await seed(taskCount);
    await run();                       // warm: first call also builds indexes
    allDocsSpy.mockClear(); findSpy.mockClear();
    await run();
    return allDocsSpy.mock.calls.length + findSpy.mock.calls.length;
  }

  it('costs the dashboard the same at 4x the tasks', async () => {
    const small = await roundTrips(() => getDashboardData(), 100);
    const large = await roundTrips(() => getDashboardData(), 400);
    expect(large).toBe(small);
  });

  it('does not query once per project', async () => {
    await seed(TASKS);
    await getDashboardData();
    allDocsSpy.mockClear(); findSpy.mockClear();

    await getDashboardData();

    // a per-project query would put this at or above PROJECTS; the dashboard
    // reads every project's counts off one full task list instead
    expect(allDocsSpy.mock.calls.length + findSpy.mock.calls.length).toBeLessThan(PROJECTS);
  });
});

describe('queries pass an explicit limit', () => {
  // db.find() silently defaults to 25 results. A query that forgets the limit
  // does not error — it truncates, so a project's 26th task simply vanishes.
  // Asserted on the call's arguments, not on result length: pouchdb-adapter-
  // memory does not apply that default, so a result-count test passes here
  // even with the limit removed and would guard nothing.
  it('never calls find() without one', async () => {
    await seed(TASKS);
    findSpy.mockClear();

    await getTasksForProject(projectIds[0]);
    await getLogsForTask('task:g1');
    await searchAllTasks('findable-term');

    expect(findSpy.mock.calls.length).toBeGreaterThan(0);
    for (const [opts] of findSpy.mock.calls as Array<[{ limit?: number }]>) {
      expect(opts.limit).toBeGreaterThan(TASKS);
    }
  });

});
