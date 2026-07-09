import { bench, describe, beforeAll } from 'vitest';
import db, {
  createSpace, createProject, getDashboardData, getTasksForProject,
  searchAllTasks, invalidateTaskCache,
} from '../src/lib/db';

// A10 (large-dataset performance validation) + A24 (version-over-version
// benchmark harness), scoped together per ROADMAP.md — A24 formalizes the
// measurement infrastructure A10 needs anyway. Run with `npm run bench`
// (separate from `npm test` — benchmarks are slow and not pass/fail, so
// they don't belong in the regular gate). Compare the printed numbers
// release to release; there's no hardcoded threshold here since absolute
// timings depend on the machine running them, not on Offlog's code.
//
// Scoped to the three read paths TECH.md's Performance section already
// flags as scale-sensitive: getDashboardData() (every project's dashboard
// cards), getTasksForProject() (Kanban/List's main query), and
// searchAllTasks() (Global Search, re-run on every keystroke in the real
// app). Actual Svelte component render time isn't measurable yet — that's
// blocked on A9 (component test infrastructure), still open.
const TASK_COUNT = 3000; // mid-point of A10's realistic 1,000–5,000 estimate
const PROJECT_COUNT = 8;

let targetProjectId = '';

beforeAll(async () => {
  const space = await createSpace('Bench Space', '#6366f1');
  const projects = [];
  for (let i = 0; i < PROJECT_COUNT; i++) {
    projects.push(await createProject(space._id, `Bench Project ${i}`));
  }
  targetProjectId = projects[0]._id;

  // Bulk-insert directly rather than through createTask() one at a time —
  // this is stress-seeding the fixture, not part of what's being measured.
  const now = new Date().toISOString();
  const docs = [];
  for (let i = 0; i < TASK_COUNT; i++) {
    const proj = projects[i % PROJECT_COUNT];
    const col = proj.columns[i % proj.columns.length];
    docs.push({
      _id: `task:bench-${i}`, type: 'task', project_id: proj._id, space_id: space._id,
      column_id: col.id, title: `Bench task ${i} searchable-term`, body: '',
      priority: (i % 3) + 1, due_date: null, reminder_at: null, tags: [],
      position: i, deleted: false, archived: false,
      created_at: now, updated_at: now, source: 'pc',
    });
  }
  await db.bulkDocs(docs as any[]);
  invalidateTaskCache();
}, 60000);

describe(`read-path latency at ${TASK_COUNT}-task scale`, () => {
  bench('getDashboardData()', async () => { await getDashboardData(); });
  bench('getTasksForProject() — one of 8 projects', async () => { await getTasksForProject(targetProjectId); });
  bench('searchAllTasks() — common term', async () => { await searchAllTasks('searchable-term'); });
});
