import { bench, describe } from 'vitest';
import db, {
  createSpace, createProject, invalidateTaskCache,
  getDashboardData, getTasksForProject, searchAllTasks, getAllTasksDue,
  getStorageBreakdown, getRecentLogs, getLogsForTask, checkIntegrity,
  exportTasksCSV, scanConflicts,
} from '../src/lib/db';

// Deliberately bigger than perf.bench.ts, and swept across sizes rather than
// measured at one.
//
// perf.bench.ts answers "how fast is this today" at 3,000 tasks. This answers
// a different question: does anything get *disproportionately* worse as the
// database grows. A path that doubles when the data doubles is fine forever;
// one that quadruples is a bug waiting for a big enough database. Comparing
// the same path across the size blocks below is the whole point -- the
// absolute numbers depend on the machine and mean little on their own.
//
// It also covers the paths perf.bench.ts leaves out, which are the ones most
// likely to be full-table scans: the storage breakdown, the integrity check,
// the whole-database export, and the conflict scan that markSynced() runs on
// EVERY sync settle.
//
// EVERY bench below invalidates the task cache first, and that is the whole
// reason these numbers mean anything. core.ts caches getAllTasksRaw(), so a
// second call is served from memory: without invalidating, this file
// measured 0.024ms for a path that costs 81ms cold, and reported every size
// as identical -- a benchmark that would have certified "no scaling problem"
// no matter how bad the scaling got.
//
// Memory adapter, not IndexedDB, so absolute timings are not device-real.
// Growth shape is what transfers.
//
// KNOWN LIMITATION -- read before believing a number here. Every size block
// shares one module-level database and wipes it by soft-delete, because the
// functions under test import `db` directly and cannot be pointed at a fresh
// instance. Paths that go through `db.find` and a persisted index are
// distorted by that: getLogsForTask measured 0.2/97.4/395.2ms across the
// three blocks here, and 1.35/3.90/1.55ms flat when each size was given its
// own database. The `allDocs`-based paths agree between the two setups.
//
// So: trust the allDocs paths, and verify anything index-backed in an
// isolated database before acting on it. A number from this file is a
// starting point, not a finding.
//
//   npm run bench                    all sizes
//   SCALE_MAX=50000 npm run bench    push it until something breaks

const MAX = Number(process.env.SCALE_MAX ?? 20000);
const SIZES = [1000, 5000, 20000, 50000, 100000].filter(n => n <= MAX);

// Every mutation writes a log: doc, so a real database carries several times
// more logs than tasks. Modelling that matters: the paths that scan
// everything are the ones this is looking for.
const LOGS_PER_TASK = 3;
const PROJECTS = 8;

// Seeded lazily and awaited inside every bench, NOT in beforeAll: vitest
// does not run beforeAll/beforeEach in `vitest bench`. Relying on it meant
// this file -- and perf.bench.ts, which had the same shape -- measured an
// empty database and reported every size as identical. The seed cost lands
// in the warmup iterations, not the samples.
function makeFixture(taskCount: number) {
  let projectIds: string[] = [];
  let spaceId = '';
  let sampleTaskId = '';
  let ready: Promise<void> | null = null;

  const seed = async () => {
    // Wipe rather than reuse: each size block must measure its own database,
    // not the previous block's leftovers on top of it.
    const all = await db.allDocs();
    if (all.rows.length) {
      await db.bulkDocs(all.rows.map(r => ({ _id: r.id, _rev: r.value.rev, _deleted: true })));
    }
    invalidateTaskCache();

    const space = await createSpace(`Scale ${taskCount}`, '#6366f1');
    spaceId = space._id!;
    const projects = [];
    for (let i = 0; i < PROJECTS; i++) projects.push(await createProject(spaceId, `P${i}`));
    projectIds = projects.map(p => p._id!);

    const today = new Date();
    const docs: unknown[] = [];
    for (let i = 0; i < taskCount; i++) {
      const proj = projects[i % PROJECTS];
      const due = new Date(today.getTime() + ((i % 60) - 30) * 86400000);
      docs.push({
        _id: `task:scale-${String(i).padStart(7, '0')}`,
        type: 'task',
        project_id: proj._id,
        space_id: spaceId,
        column_id: proj.columns[i % proj.columns.length].id,
        title: `Task ${i} quarterly review draft`,
        notes: i % 4 === 0 ? 'A note that exists on a quarter of tasks.'.repeat(3) : undefined,
        checklist: i % 6 === 0 ? [{ id: `c${i}a`, text: 'step one', done: false }, { id: `c${i}b`, text: 'step two', done: true }] : undefined,
        tags: i % 3 === 0 ? ['review', `sprint-${i % 12}`] : [],
        priority: ['low', 'medium', 'high'][i % 3],
        due_date: i % 2 === 0 ? due.toISOString().slice(0, 10) : undefined,
        pinned: i % 50 === 0,
        archived: i % 11 === 0,
        deleted: i % 23 === 0,
        position: i,
        created_at: today.toISOString(),
        updated_at: today.toISOString(),
        source: 'pc',
      });
    }
    sampleTaskId = `task:scale-${String(0).padStart(7, '0')}`;

    for (let i = 0; i < taskCount * LOGS_PER_TASK; i++) {
      docs.push({
        _id: `log:2026-08-24T00:00:00.${String(i).padStart(6, '0')}Z-s${i}`,
        type: 'log', ts: new Date(today.getTime() - i * 1000).toISOString(),
        ref: `task:scale-${String(i % taskCount).padStart(7, '0')}`,
        action: 'update', field: 'title', from: 'a', to: 'b',
        source: 'pc', source_id: 'bench',
      });
    }

    // Chunked: one bulkDocs of 400k documents is the fixture running out of
    // memory, not a measurement.
    for (let i = 0; i < docs.length; i += 5000) {
      await db.bulkDocs(docs.slice(i, i + 5000) as never);
    }
    invalidateTaskCache();
  };

  return {
    ensure: () => (ready ??= seed()),
    project: () => projectIds[0],
    task: () => sampleTaskId,
  };
}

for (const size of SIZES) {
  describe(`${size} tasks + ${size * LOGS_PER_TASK} logs`, () => {
    const fx = makeFixture(size);

    // Covered by perf.bench.ts at 3,000 -- repeated here to see the shape.
    bench('getDashboardData', async () => { await fx.ensure(); invalidateTaskCache(); await getDashboardData(); });
    bench('getTasksForProject', async () => { await fx.ensure(); invalidateTaskCache(); await getTasksForProject(fx.project()); });
    bench('searchAllTasks', async () => { await fx.ensure(); invalidateTaskCache(); await searchAllTasks('quarterly'); });

    // The same path warm, as the contrast: this is what a user actually
    // hits on a second render, and it still grows with the database because
    // the cache holds every task.
    bench('getDashboardData (warm cache)', async () => { await fx.ensure(); await getDashboardData(); });

    // Not covered anywhere else, and the likeliest full scans.
    bench('getAllTasksDue', async () => { await fx.ensure(); invalidateTaskCache(); await getAllTasksDue(); });
    bench('getStorageBreakdown', async () => { await fx.ensure(); invalidateTaskCache(); await getStorageBreakdown(); });
    bench('getRecentLogs', async () => { await fx.ensure(); invalidateTaskCache(); await getRecentLogs(80); });
    bench('getLogsForTask', async () => { await fx.ensure(); invalidateTaskCache(); await getLogsForTask(fx.task()); });

    // scanConflicts runs on EVERY sync settle via markSynced().
    bench('scanConflicts', async () => { await fx.ensure(); invalidateTaskCache(); await scanConflicts(); });

    // Both walk everything by definition; here to size the cost, not to
    // suggest they should be cheap. The second is the shape autoBackup.ts's
    // collectBackupJson() uses -- it isn't exported, so the query is
    // reproduced rather than imported.
    bench('checkIntegrity', async () => { await fx.ensure(); invalidateTaskCache(); await checkIntegrity(); });
    bench('exportTasksCSV', async () => { await fx.ensure(); invalidateTaskCache(); await exportTasksCSV(); });
    bench('backup scan (allDocs+attachments)', async () => {
      await fx.ensure();
      await db.allDocs({ include_docs: true, attachments: true, binary: false });
    });
  });
}
