// Offlog — scenario seed script
//
// Fills a fresh (or existing) local database with a realistic-looking
// scenario for manual testing and review: 10 projects (one archived, and
// several using non-default status sets instead of the default
// Idea/Task/In Process/Completed columns), 100 active tasks spread across
// random statuses/tags/priorities/deadlines (15 of them archived), and 6
// soft-deleted tasks. A small fraction of tasks get notes or a checklist,
// most don't — matching how a real board actually looks over time.
//
// Titles/tags are plain, real-looking task names — nothing is marked
// "(dummy)" or tagged 'dummy', since the point is data that reads as a
// genuine, lived-in workspace for reviewing the system, not throwaway
// filler. That does mean there's no single tag to bulk-select-and-delete
// afterward — if you need to wipe it, use Settings → Maintenance →
// "Wipe & reseed" (wipeAndReseed()) to reset to a blank slate instead.
//
// PouchDB is a browser-only UMD global in this app (see CLAUDE.md), so
// this can't run as a Node script against IndexedDB — paste it into the
// browser DevTools console instead:
//
//   1. npm run dev, open http://localhost:5173 in a browser
//   2. Open DevTools → Console
//   3. Paste this entire file's contents, press Enter
//   4. Reload the page once it logs "done"
//
// Safe to run multiple times: each run adds a fresh batch on top of
// whatever's already there, it never deletes or reuses existing data.

(async () => {
  const db = new PouchDB('offlog');

  function nanoid(n = 10) {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }
  const now = () => new Date().toISOString();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  // Robustness: a failed write (conflict, quota, whatever) shouldn't abort
  // the whole run — log it and keep going, then report the real count at
  // the end rather than a number that assumes every put() succeeded.
  let failures = 0;
  async function putSafe(doc) {
    try {
      await db.put(doc);
      return true;
    } catch (err) {
      failures++;
      console.warn('seed-scenario: write failed, continuing', doc._id, err);
      return false;
    }
  }

  // ── Column templates — most projects use the app's own default, but a
  //    few get a genuinely different status set so the seeded data
  //    exercises non-default columns too (custom names, different counts,
  //    a different "last column" done-state label). Every template's last
  //    entry is deliberately a done-like state, per the positional-"done"
  //    invariant (CLAUDE.md/db.ts). ──
  function mkColumns(names) {
    return names.map(name => ({ id: `col:${nanoid()}`, name }));
  }
  const COLUMN_TEMPLATES = [
    ['Idea', 'Task', 'In Process', 'Completed'], // app default — weighted heavier below
    ['Idea', 'Task', 'In Process', 'Completed'],
    ['Idea', 'Task', 'In Process', 'Completed'],
    ['Backlog', 'In Progress', 'Review', 'Done'],
    ['To Do', 'Doing', 'Done'],
    ['Icebox', 'Planned', 'In Progress', 'Blocked', 'Done'],
    ['Reported', 'Investigating', 'Fix In Progress', 'Verified', 'Closed'],
    ['Someday', 'This Week', 'Today', 'Done'],
  ];

  // ── Spaces — reuse whatever already exists; seedIfEmpty() should have
  //    already run on first app load, but fall back to Unsorted alone if
  //    this is somehow a completely empty database. ──
  const spaces = (await db.allDocs({ startkey: 'space:', endkey: 'space:￰', include_docs: true })).rows.map(r => r.doc);
  if (spaces.length === 0) {
    const doc = { _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280', position: 0, updated_at: now(), source: 'pc' };
    if (await putSafe(doc)) spaces.push(doc);
  }
  if (spaces.length === 0) throw new Error('seed-scenario: no space available to assign projects to, aborting');

  // ── 10 projects, random spaces, random column templates, one archived ──
  const PROJECT_NAMES = [
    'Website Redesign', 'Q3 Marketing Campaign', 'Mobile App Backlog', 'Home Renovation',
    'Fitness Tracker', 'Book Club', 'Recipe App', 'Conference Prep',
    'Garage Cleanup', 'Client Onboarding', 'Newsletter Revamp', 'Photo Archive Sort',
    'Backyard Garden', 'Freelance Invoicing', 'Team Offsite', 'Product Launch',
  ];
  const shuffledNames = [...PROJECT_NAMES].sort(() => Math.random() - 0.5).slice(0, 10);

  const existingProjRes = await db.allDocs({ startkey: 'project:', endkey: 'project:￰', include_docs: true });
  const basePos = existingProjRes.rows.length
    ? Math.max(...existingProjRes.rows.map(r => r.doc.position)) + 1
    : 0;

  const archivedProjectIndex = Math.floor(Math.random() * shuffledNames.length);
  const projects = [];
  for (let i = 0; i < shuffledNames.length; i++) {
    const spaceId = pick(spaces)._id;
    const doc = {
      _id: `project:${nanoid()}`, type: 'project', space_id: spaceId,
      name: shuffledNames[i], position: basePos + i,
      columns: mkColumns(pick(COLUMN_TEMPLATES)), default_view: 'kanban', updated_at: now(), source: 'pc',
      ...(i === archivedProjectIndex ? { archived: true } : {}),
    };
    if (await putSafe(doc)) projects.push(doc);
  }
  if (projects.length === 0) throw new Error('seed-scenario: no project could be created, aborting');

  // ── Task pools — enough title variety that 100 tasks doesn't repeat too
  //    heavily. ──
  const TITLES = [
    'Draft landing page copy', 'Fix login redirect bug', 'Set up CI pipeline', 'Interview 5 users',
    'Design empty states', 'Write API docs', 'Migrate database schema', 'Plan sprint retro',
    'Update dependency versions', 'Create onboarding flow', 'Review pull request', 'Buy domain name',
    'Sketch wireframes', 'Optimize image loading', 'Draft press release', 'Schedule social posts',
    'Audit analytics events', 'Refactor auth module', 'Add dark mode toggle', 'Fix mobile scroll bug',
    'Pick paint colors', 'Get contractor quotes', 'Order new flooring', 'Track weekly runs',
    'Plan meal prep', 'Buy resistance bands', 'Choose next book', 'Book venue for meeting',
    'Send reading list', 'Design app icon', 'Write recipe parser', 'Set up ingredient database',
    'Print name badges', 'Confirm speaker slots', 'Sort old photo boxes', 'Label storage bins',
    'Send welcome email', 'Schedule kickoff call', 'Draft newsletter template', 'Archive old issues',
    'Water new seedlings', 'Build raised garden bed', 'Order compost', 'Prune fruit trees',
    'Send client invoice', 'Chase overdue payment', 'File quarterly taxes', 'Update rate sheet',
    'Book offsite venue', 'Plan team activity', 'Order catering', 'Send travel itinerary',
    'Finalize launch checklist', 'Brief support team', 'Prepare demo script', 'Coordinate press outreach',
    'Test payment flow', 'Write release notes', 'Update status page copy', 'Rehearse pitch',
    'Replace air filter', 'Clean out gutters', 'Test smoke detectors', 'Organize tool shelf',
  ];
  const TAGS = ['urgent', 'frontend', 'backend', 'design', 'bug', 'research', 'waiting', 'blocked', 'quick-win', 'needs-review'];
  const NOTES = [
    'Waiting on feedback before continuing.',
    'Check with the team before finalizing.',
    'See linked thread for context.',
    'Blocked until the previous step ships.',
    'Revisit after the next check-in.',
  ];
  const CHECKLIST_ITEMS = [
    'Draft outline', 'Get feedback', 'Finalize', 'Publish', 'Test on device',
    'Write tests', 'Update docs', 'Notify team', 'Double-check numbers', 'Get sign-off',
  ];

  function randTags() {
    const tags = [];
    if (chance(0.55)) tags.push(pick(TAGS));
    if (chance(0.15)) tags.push(pick(TAGS));
    return [...new Set(tags)];
  }

  function randDueDate() {
    // Weighted: some overdue, some today/soon, some future, many none.
    const bucket = pick(['past', 'past', 'today', 'soon', 'future', 'future', 'none', 'none']);
    if (bucket === 'none') return null;
    const offsets = { past: -(1 + Math.floor(Math.random() * 14)), today: 0, soon: 1 + Math.floor(Math.random() * 5), future: 7 + Math.floor(Math.random() * 30) };
    const d = new Date();
    d.setDate(d.getDate() + offsets[bucket]);
    return d.toISOString().slice(0, 10);
  }

  function mkTask(project, { forceArchived = false, forceDeleted = false } = {}) {
    if (!project.columns || project.columns.length === 0) return null; // robustness: skip if a project somehow has no columns
    const col = pick(project.columns);
    const ts = now();
    const doc = {
      _id: `task:${nanoid()}`, type: 'task',
      project_id: project._id, space_id: project.space_id, column_id: col.id,
      title: pick(TITLES), body: '', priority: pick([1, 1, 2, 2, 2, 3]),
      due_date: randDueDate(), reminder_at: null, tags: randTags(),
      position: Math.floor(Math.random() * 50000),
      deleted: forceDeleted, created_at: ts, updated_at: ts, source: 'pc',
    };
    if (forceArchived || project.archived) doc.archived = true;
    if (!forceDeleted && chance(0.1)) doc.body = pick(NOTES); // a small fraction get notes
    if (!forceDeleted && chance(0.1)) { // a small fraction get a checklist
      const n = 2 + Math.floor(Math.random() * 3);
      doc.checklist = Array.from({ length: n }, () => ({ text: pick(CHECKLIST_ITEMS), done: chance(0.4) }));
    }
    return doc;
  }

  // ── 100 active tasks, 15 of them archived, spread across all 10 projects
  //    (the one archived project's own tasks count toward the 15) ──
  const ACTIVE_COUNT = 100;
  const ARCHIVED_COUNT = 15;
  let activeCreated = 0;
  let archivedSoFar = 0;
  for (let i = 0; i < ACTIVE_COUNT; i++) {
    const project = pick(projects);
    const forceArchived = archivedSoFar < ARCHIVED_COUNT && (project.archived || chance(0.2));
    const doc = mkTask(project, { forceArchived });
    if (!doc) continue;
    if (await putSafe(doc)) {
      activeCreated++;
      if (doc.archived) archivedSoFar++;
    }
  }
  // Top up if randomness left us short of 15 archived (or a project without
  // usable columns kept getting skipped).
  let topUpAttempts = 0;
  while (archivedSoFar < ARCHIVED_COUNT && topUpAttempts < ARCHIVED_COUNT * 4) {
    topUpAttempts++;
    const doc = mkTask(pick(projects), { forceArchived: true });
    if (!doc) continue;
    if (await putSafe(doc)) { activeCreated++; archivedSoFar++; }
  }

  // ── 6 soft-deleted tasks ──
  const DELETED_COUNT = 6;
  let deletedCreated = 0;
  for (let i = 0; i < DELETED_COUNT; i++) {
    const doc = mkTask(pick(projects), { forceDeleted: true });
    if (doc && await putSafe(doc)) deletedCreated++;
  }

  console.log(
    `done — ${projects.length} projects (1 archived), ${activeCreated} active tasks (${archivedSoFar} archived), ${deletedCreated} deleted tasks` +
    (failures ? `, ${failures} write(s) failed (see warnings above)` : '') +
    '. Reload the page to see it.'
  );
})();
