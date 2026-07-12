// Offlog — scenario dummy-data seeder
//
// Fills a fresh (or existing) local database with a realistic-looking
// scenario for manual UI testing: 10 projects (one archived), 60 active
// tasks spread across random statuses/tags/priorities/deadlines (15 of
// them archived), and 6 soft-deleted tasks. A few tasks get notes or a
// checklist, most don't — matching how a real board actually looks.
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
// Every doc this creates is tagged with the 'dummy' tag (tasks) or a
// "(dummy)" title suffix (projects), so it's easy to spot and bulk-remove
// later — same convention docs/TECH.md's dummy-data recipe already uses.
// Safe to run multiple times: each run adds a fresh batch, it never
// deletes or reuses previous dummy data.

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

  function mkColumns() {
    return [
      { id: `col:${nanoid()}`, name: 'Idea' },
      { id: `col:${nanoid()}`, name: 'Task' },
      { id: `col:${nanoid()}`, name: 'In Process' },
      { id: `col:${nanoid()}`, name: 'Completed' },
    ];
  }

  // ── Spaces — reuse whatever already exists; seedIfEmpty() should have
  //    already run on first app load, but fall back to Unsorted alone
  //    if this is somehow a completely empty database. ──
  const spaces = (await db.allDocs({ startkey: 'space:', endkey: 'space:￰', include_docs: true })).rows.map(r => r.doc);
  if (spaces.length === 0) {
    const doc = { _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280', position: 0, updated_at: now(), source: 'pc' };
    await db.put(doc);
    spaces.push(doc);
  }

  // ── 10 projects, random spaces, one archived ──
  const PROJECT_NAMES = [
    'Website Redesign', 'Q3 Marketing Campaign', 'Mobile App Backlog', 'Home Renovation',
    'Fitness Tracker', 'Book Club', 'Side Project: Recipe App', 'Conference Prep',
    'Garage Cleanup', 'Client Onboarding', 'Newsletter Revamp', 'Photo Archive Sort',
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
      name: `${shuffledNames[i]} (dummy)`, position: basePos + i,
      columns: mkColumns(), default_view: 'kanban', updated_at: now(), source: 'pc',
      ...(i === archivedProjectIndex ? { archived: true } : {}),
    };
    await db.put(doc);
    projects.push(doc);
  }

  // ── Task pools ──
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
  ];
  const TAGS = ['urgent', 'frontend', 'backend', 'design', 'bug', 'research', 'waiting', 'blocked'];
  const NOTES = [
    'Waiting on feedback before continuing.',
    'Check with the team before finalizing.',
    'See linked thread for context.',
    'Blocked until the previous step ships.',
  ];
  const CHECKLIST_ITEMS = [
    'Draft outline', 'Get feedback', 'Finalize', 'Publish', 'Test on device',
    'Write tests', 'Update docs', 'Notify team',
  ];

  function randTag() {
    const tags = ['dummy'];
    if (chance(0.5)) tags.push(pick(TAGS));
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
    const col = pick(project.columns);
    const ts = now();
    const doc = {
      _id: `task:${nanoid()}`, type: 'task',
      project_id: project._id, space_id: project.space_id, column_id: col.id,
      title: `${pick(TITLES)} (dummy)`, body: '', priority: pick([1, 1, 2, 2, 2, 3]),
      due_date: randDueDate(), reminder_at: null, tags: randTag(),
      position: Math.floor(Math.random() * 50000),
      deleted: forceDeleted, created_at: ts, updated_at: ts, source: 'pc',
    };
    if (forceArchived || project.archived) doc.archived = true;
    if (!forceDeleted && chance(0.1)) doc.body = pick(NOTES); // "very few" get notes
    if (!forceDeleted && chance(0.1)) { // "very few" get a checklist
      const n = 2 + Math.floor(Math.random() * 3);
      doc.checklist = Array.from({ length: n }, () => ({ text: pick(CHECKLIST_ITEMS), done: chance(0.4) }));
    }
    return doc;
  }

  // ── 60 active tasks, 15 of them archived, spread across all 10 projects
  //    (the one archived project's own tasks count toward the 15) ──
  const ACTIVE_COUNT = 60;
  const ARCHIVED_COUNT = 15;
  let archivedSoFar = 0;
  for (let i = 0; i < ACTIVE_COUNT; i++) {
    const project = pick(projects);
    const forceArchived = archivedSoFar < ARCHIVED_COUNT && (project.archived || chance(0.25));
    if (forceArchived) archivedSoFar++;
    await db.put(mkTask(project, { forceArchived }));
  }
  // Top up if randomness left us short of 15 archived.
  while (archivedSoFar < ARCHIVED_COUNT) {
    await db.put(mkTask(pick(projects), { forceArchived: true }));
    archivedSoFar++;
  }

  // ── 6 soft-deleted tasks ──
  const DELETED_COUNT = 6;
  for (let i = 0; i < DELETED_COUNT; i++) {
    await db.put(mkTask(pick(projects), { forceDeleted: true }));
  }

  console.log(`done — ${projects.length} projects (1 archived), ${ACTIVE_COUNT} active tasks (${archivedSoFar} archived), ${DELETED_COUNT} deleted tasks. Reload the page to see it.`);
})();
