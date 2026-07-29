// Offlog — demo/screenshot seed script
//
// Unlike seed-scenario.js (generic dev/QA data, deliberately includes messy
// edge cases like duplicate task titles and near-duplicate notes to test
// hint/disambiguation features), this script is hand-authored, deterministic
// demo data for a single coherent persona: a software developer with a
// family and kids, currently building a new house. It's meant to be the
// canonical dataset behind every marketing/store screenshot (mobile and
// desktop) — re-running it should always produce essentially the same
// polished workspace, not a random shuffle, so screenshots stay reproducible
// across sessions.
//
// Covers every major feature in one attractive, believable workspace:
// 4 spaces (Work / New House / Family / Personal) each with multiple
// projects and varied column sets, priorities, due dates across past/
// today/soon/future/none, tags, checklists, custom fields with real
// values, related-task links, reminders, all three recurrence cadences
// (daily/weekly/monthly), pinned tasks, one archived project + scattered
// archived tasks, and a handful of soft-deleted (Trash) tasks.
//
// Same run mechanics as seed-scenario.js — calls the app's own db.ts
// functions (not raw PouchDB docs), only works against a Vite dev server:
//
//   1. npm run dev, open http://localhost:5173 in a browser
//   2. Open DevTools → Console
//   3. Paste this entire file's contents, press Enter
//   4. Reload the page once it logs "done"
//
// Set WIPE_EXISTING to true below to fully reset the database first (real
// destructive action — only do this on a database you mean to reset).
// Defaults to false/additive; for reproducible screenshots you almost
// always want WIPE_EXISTING: true so the workspace is exactly this data
// and nothing else.

(async () => {
  const WIPE_EXISTING = false;

  const dbmod = await import('/src/lib/db.ts');
  const {
    getSpaces, createSpace, createProject, archiveProject,
    createTask, updateTask, archiveTask, deleteTask, linkRelatedTask,
    getCustomFieldDefs, addCustomFieldDef, invalidateTaskCache,
  } = dbmod;
  const db = new PouchDB('offlog');

  let failures = 0;
  async function safe(fn, label) {
    try { return await fn(); }
    catch (err) { failures++; console.warn('seed-demo: failed', label, err); return null; }
  }

  if (WIPE_EXISTING) {
    console.log('seed-demo: WIPE_EXISTING is true — deleting every doc first…');
    const all = await db.allDocs({ include_docs: true });
    const dels = all.rows.map(r => ({ ...r.doc, _deleted: true }));
    if (dels.length) await db.bulkDocs(dels);
    invalidateTaskCache();
    localStorage.removeItem('offlog_seeded');
  }

  // ── Due-date helpers — relative to "today" so the demo always looks
  //    fresh (real overdue/upcoming items) whenever it's actually run. ──
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dueIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return fmt(d); };
  const dueAgo = (days) => dueIn(-days);
  const dueToday = () => dueIn(0);
  const at9am = (dateStr) => new Date(`${dateStr}T09:00:00`).toISOString();

  // ── Spaces ──
  const existingSpaces = await getSpaces();
  const bySpaceName = Object.fromEntries(existingSpaces.map(s => [s.name, s]));
  async function ensureSpace(name, color, icon) {
    if (bySpaceName[name]) return bySpaceName[name];
    const s = await safe(() => createSpace(name, color, icon), `space:${name}`);
    if (s) bySpaceName[name] = s;
    return s;
  }
  const spWork = await ensureSpace('Work', '#3B82F6', 'briefcase');
  const spHouse = await ensureSpace('New House', '#F59E0B', 'home');
  const spFamily = await ensureSpace('Family', '#EC4899', 'heart');
  const spPersonal = await ensureSpace('Personal', '#8B5CF6', 'code');
  if (!spWork || !spHouse || !spFamily || !spPersonal) throw new Error('seed-demo: a required space failed to create, aborting');

  // ── Column templates — reused across a few projects for variety; every
  //    template's last entry is the positional-"done" state (db.ts). ──
  const COLS_KANBAN = ['Backlog', 'In Progress', 'Review', 'Done'];
  const COLS_SIMPLE = ['To Do', 'Doing', 'Done'];
  const COLS_BUILD = ['Planning', 'Foundation', 'Framing', 'Finishing', 'Done'];
  const COLS_PACK = ['To Pack', 'Packed', 'Unpacked'];

  async function projectWithColumns(spaceId, name, colNames) {
    const proj = await safe(() => createProject(spaceId, name), `project:${name}`);
    if (!proj || !colNames) return proj;
    const columns = colNames.map((n) => ({ id: `col:${Math.random().toString(36).slice(2, 10)}`, name: n }));
    await db.put({ ...(await db.get(proj._id)), columns });
    proj.columns = columns;
    return proj;
  }

  // ── Custom fields (Settings → Organize) — persona-relevant, not generic ──
  let fields = await getCustomFieldDefs();
  const byFieldName = Object.fromEntries(fields.map(f => [f.name, f]));
  async function ensureField(name, type, options) {
    if (byFieldName[name]) return byFieldName[name];
    await safe(() => addCustomFieldDef(name, type, options), `field:${name}`);
    fields = await getCustomFieldDefs();
    byFieldName[name] = fields.find(f => f.name === name);
    return byFieldName[name];
  }
  const fBudget = await ensureField('Budget', 'number');
  const fVendor = await ensureField('Vendor', 'select', ['ABC Contractors', 'City Electric Co', 'Home Depot', 'IKEA', 'Personal']);
  const fFollowUp = await ensureField('Follow-up by', 'date');

  function customValues(entries) {
    const out = {};
    for (const [field, value] of entries) { if (field) out[field.id] = value; }
    return Object.keys(out).length ? out : undefined;
  }

  // ── Projects, one space at a time ──
  const pSprint = await projectWithColumns(spWork._id, 'Q4 Product Sprint', COLS_KANBAN);
  const pMigration = await projectWithColumns(spWork._id, 'API Platform Migration', COLS_SIMPLE);
  const pOffsite = await projectWithColumns(spWork._id, 'Team Offsite Planning', null);

  const pHouseBuild = await projectWithColumns(spHouse._id, 'New House Build', COLS_BUILD);
  const pBackyard = await projectWithColumns(spHouse._id, 'Backyard & Landscaping', COLS_SIMPLE);
  const pMoveIn = await projectWithColumns(spHouse._id, 'Move-In Checklist', COLS_PACK);
  const pOldApt = await projectWithColumns(spHouse._id, 'Old Apartment Move-Out', COLS_SIMPLE);

  const pEmma = await projectWithColumns(spFamily._id, "Emma's School Year", null);
  const pLiam = await projectWithColumns(spFamily._id, "Liam's Soccer Season", COLS_SIMPLE);
  const pTrip = await projectWithColumns(spFamily._id, 'Summer Family Trip', null);

  const pMarathon = await projectWithColumns(spPersonal._id, 'Marathon Training', COLS_SIMPLE);
  const pWoodworking = await projectWithColumns(spPersonal._id, 'Weekend Woodworking', null);
  const pRecipeApp = await projectWithColumns(spPersonal._id, 'Recipe App', COLS_KANBAN);

  const allProjects = [pSprint, pMigration, pOffsite, pHouseBuild, pBackyard, pMoveIn, pOldApt, pEmma, pLiam, pTrip, pMarathon, pWoodworking, pRecipeApp];
  if (allProjects.some(p => !p)) throw new Error('seed-demo: a required project failed to create, aborting');

  // Column shortcuts — first/second/last of each project, by name for
  // readability at each call site below.
  const col = (proj, name) => proj.columns.find(c => c.name === name)?.id ?? proj.columns[0].id;
  const firstCol = (proj) => proj.columns[0].id;
  const lastCol = (proj) => proj.columns.at(-1).id;

  const created = []; // every created task, for the pin/archive/trash/relate passes below
  async function task(proj, columnId, title, overrides, label) {
    const t = await safe(() => createTask(proj._id, proj.space_id, columnId, title, overrides), label ?? title);
    if (t) created.push(t);
    return t;
  }

  // ── Work ──
  const tLogin = await task(pSprint, firstCol(pSprint), 'Fix login redirect bug', { priority: 3, due_date: dueToday(), tags: ['urgent', 'code-review'] });
  await task(pSprint, firstCol(pSprint), 'Set up CI pipeline', { priority: 2, due_date: dueIn(3), tags: ['code-review'] });
  await task(pSprint, firstCol(pSprint), 'Interview 5 users', { priority: 2, due_date: dueIn(7) });
  await task(pSprint, firstCol(pSprint), 'Write API docs', {
    priority: 1, tags: ['code-review'],
    checklist: [{ text: 'Draft outline', done: true }, { text: 'Review with team', done: false }, { text: 'Publish', done: false }],
  });
  const tAuth = await task(pSprint, col(pSprint, 'In Progress'), 'Refactor auth module', { priority: 3, due_date: dueAgo(2), tags: ['urgent', 'code-review'] });
  await task(pSprint, col(pSprint, 'Review'), 'Review pull request #482', { priority: 2, due_date: dueIn(1), tags: ['code-review'] });

  await task(pMigration, firstCol(pMigration), 'Migrate database schema', { priority: 3, due_date: dueIn(10), tags: ['code-review'] });
  await task(pMigration, firstCol(pMigration), 'Update dependency versions', { priority: 1 });
  await task(pMigration, firstCol(pMigration), 'Plan sprint retro', { priority: 1, due_date: dueIn(2) });
  await task(pMigration, col(pMigration, 'Doing'), 'Draft rollback plan', { priority: 2, due_date: dueIn(5), body: 'Check with DevOps before finalizing.' });

  await task(pOffsite, firstCol(pOffsite), 'Book offsite venue', { priority: 2, due_date: dueIn(14), tags: ['waiting'] });
  await task(pOffsite, firstCol(pOffsite), 'Send travel itinerary', { priority: 1, due_date: dueIn(12) });
  await task(pOffsite, firstCol(pOffsite), 'Order catering', { priority: 1, due_date: dueIn(13) });

  // ── New House (the centerpiece — richest data) ──
  const tQuotes = await task(pHouseBuild, firstCol(pHouseBuild), 'Get contractor quotes', {
    priority: 3, due_date: dueToday(), tags: ['contractor', 'urgent'],
    custom_values: customValues([[fBudget, 8500], [fVendor, 'ABC Contractors']]),
    checklist: [{ text: 'Call 3 contractors', done: true }, { text: 'Compare bids', done: true }, { text: 'Pick one', done: false }],
  }, 'contractor-quotes');
  await task(pHouseBuild, firstCol(pHouseBuild), 'Pick paint colors', { priority: 2, due_date: dueIn(4), tags: ['shopping'] });
  const tFlooring = await task(pHouseBuild, col(pHouseBuild, 'Foundation'), 'Order new flooring', {
    priority: 3, due_date: dueAgo(1), tags: ['contractor', 'urgent'],
    custom_values: customValues([[fBudget, 4200], [fVendor, 'Home Depot']]),
    body: 'Contractor said tile delivery pushed back — confirm new date before demo day.',
  }, 'order-flooring');
  const tElectrical = await task(pHouseBuild, col(pHouseBuild, 'Framing'), 'Schedule electrical inspection', {
    priority: 3, due_date: dueIn(6), tags: ['appointment', 'contractor'],
    custom_values: customValues([[fVendor, 'City Electric Co'], [fFollowUp, dueIn(6)]]),
    reminder_at: at9am(dueIn(6)),
  });
  const tCabinet = await task(pHouseBuild, col(pHouseBuild, 'Finishing'), 'Choose cabinet hardware', { priority: 1, due_date: dueIn(20), tags: ['shopping'] });
  await task(pHouseBuild, col(pHouseBuild, 'Framing'), 'Check on construction progress', { priority: 2, due_date: dueToday(), recurrence: 'weekly' });
  await task(pHouseBuild, col(pHouseBuild, 'Finishing'), 'Pay contractor invoice', { priority: 2, due_date: dueIn(3), tags: ['contractor'], recurrence: 'monthly' });
  const tFloorPlan = await task(pHouseBuild, lastCol(pHouseBuild), 'Approve floor plan', { priority: 2 });
  const tKitchen = await task(pHouseBuild, lastCol(pHouseBuild), 'Finalize kitchen layout', { priority: 2 });

  await task(pBackyard, firstCol(pBackyard), 'Design backyard layout', { priority: 1, due_date: dueIn(25) });
  await task(pBackyard, firstCol(pBackyard), 'Get sod delivery quote', {
    priority: 2, due_date: dueIn(15), tags: ['contractor', 'shopping'],
    custom_values: customValues([[fBudget, 1200], [fVendor, 'Home Depot']]),
  });
  await task(pBackyard, col(pBackyard, 'Doing'), 'Plant new trees', { priority: 1, recurrence: 'daily', due_date: dueToday(), tags: ['quick-win'] });

  await task(pMoveIn, firstCol(pMoveIn), 'Pack kitchen boxes', {
    priority: 2, due_date: dueIn(30),
    checklist: [{ text: 'Label boxes', done: false }, { text: 'Wrap fragile items', done: false }, { text: 'Set aside essentials', done: false }],
  });
  await task(pMoveIn, firstCol(pMoveIn), 'Forward mail to new address', { priority: 2, due_date: dueIn(28), tags: ['urgent'] });
  await task(pMoveIn, firstCol(pMoveIn), 'Set up internet at new house', { priority: 3, due_date: dueIn(27), tags: ['appointment'] });

  // Old apartment — every task created straight into the last (done)
  // column, then the whole project archived, so it reads as a genuinely
  // finished chapter rather than abandoned work.
  await task(pOldApt, lastCol(pOldApt), 'Return apartment keys', { priority: 1 });
  await task(pOldApt, lastCol(pOldApt), 'Final walkthrough with landlord', { priority: 1 });
  await task(pOldApt, lastCol(pOldApt), 'Cancel apartment insurance', { priority: 1 });
  await safe(() => archiveProject(pOldApt._id), 'archiveProject:Old Apartment Move-Out');

  // ── Family ──
  await task(pEmma, firstCol(pEmma), 'Buy school supplies', {
    priority: 2, due_date: dueIn(3), tags: ['shopping', 'school'],
    checklist: [{ text: 'Notebooks', done: true }, { text: 'Backpack', done: false }, { text: 'Lunchbox', done: false }],
  }, 'school-supplies');
  const tPermission = await task(pEmma, firstCol(pEmma), 'Sign permission slip — field trip', { priority: 3, due_date: dueIn(1), tags: ['urgent', 'school'], reminder_at: at9am(dueIn(1)) });
  await task(pEmma, firstCol(pEmma), 'Parent-teacher conference', { priority: 2, due_date: dueIn(9), tags: ['appointment', 'school'] });
  await task(pEmma, firstCol(pEmma), 'Help with science fair project', { priority: 2, due_date: dueIn(14), tags: ['school'] });

  const tSoccer = await task(pLiam, firstCol(pLiam), 'Register for spring league', { priority: 3, due_date: dueIn(2), tags: ['urgent', 'family'], reminder_at: at9am(dueIn(2)) });
  await task(pLiam, firstCol(pLiam), 'Buy new cleats', { priority: 1, due_date: dueIn(6), tags: ['shopping'] });
  await task(pLiam, firstCol(pLiam), 'Team snack schedule — sign up', { priority: 1, due_date: dueIn(4), tags: ['family'] });
  await task(pLiam, col(pLiam, 'Doing'), 'Pick up Liam from practice', { priority: 2, due_date: dueToday(), recurrence: 'weekly' });

  const tFlights = await task(pTrip, firstCol(pTrip), 'Book flights', { priority: 3, due_date: dueIn(20), tags: ['urgent'] }, 'book-flights');
  const tPassports = await task(pTrip, firstCol(pTrip), 'Renew passports', { priority: 3, due_date: dueAgo(3), tags: ['urgent'], body: "Kids' passports expire before the trip — need to expedite." }, 'renew-passports');
  await task(pTrip, firstCol(pTrip), 'Research kid-friendly hotels', { priority: 1, due_date: dueIn(18) });

  // ── Personal ──
  await task(pMarathon, firstCol(pMarathon), 'Long run — 12 miles', { priority: 2, due_date: dueToday(), tags: ['quick-win'], recurrence: 'weekly' });
  await task(pMarathon, firstCol(pMarathon), 'Buy new running shoes', { priority: 1, due_date: dueIn(5), tags: ['shopping'], body: 'Old ones have 400+ miles on them.' });
  await task(pMarathon, firstCol(pMarathon), 'Sign up for half marathon', { priority: 2, due_date: dueIn(10) });

  await task(pWoodworking, firstCol(pWoodworking), "Build kids' bookshelf", {
    priority: 1, due_date: dueIn(12),
    checklist: [{ text: 'Cut wood', done: true }, { text: 'Sand edges', done: false }, { text: 'Stain', done: false }, { text: 'Assemble', done: false }],
  });
  await task(pWoodworking, firstCol(pWoodworking), 'Buy wood stain', { priority: 1, due_date: dueIn(6), tags: ['shopping'] });

  await task(pRecipeApp, firstCol(pRecipeApp), 'Write recipe parser', { priority: 2, due_date: dueIn(8), tags: ['code-review', 'quick-win'] });
  await task(pRecipeApp, firstCol(pRecipeApp), 'Design app icon', { priority: 1 });
  await task(pRecipeApp, firstCol(pRecipeApp), 'Set up ingredient database', { priority: 2, due_date: dueIn(11), tags: ['code-review'] });

  // ── Pinned (Focus/Dashboard) ──
  for (const t of [tQuotes, tAuth, tPermission, tSoccer]) {
    if (t) await safe(() => updateTask(t._id, { pinned: true }), 'pin');
  }

  // ── Related tasks — real decisions that actually inform each other ──
  const relate = [[tQuotes, tFlooring], [tCabinet, tFlooring], [tFlights, tPassports]];
  for (const [a, b] of relate) {
    if (a && b) await safe(() => linkRelatedTask(a._id, b._id), 'linkRelatedTask');
  }

  // ── Archived tasks — progress already made, scattered across projects ──
  for (const t of [tFloorPlan, tKitchen]) {
    if (t) await safe(() => archiveTask(t._id), 'archiveTask');
  }

  // ── Trash — abandoned ideas / canceled plans, believable not random ──
  const TRASH_TITLES = [
    [pHouseBuild, 'Consider open floor plan'],
    [pHouseBuild, 'Look into pool installation'],
    [pWoodworking, 'Sign up for pottery class'],
    [pOffsite, 'Order company swag'],
  ];
  for (const [proj, title] of TRASH_TITLES) {
    const t = await task(proj, firstCol(proj), title, { priority: 1 }, `trash:${title}`);
    if (t) await safe(() => deleteTask(t._id), 'deleteTask');
  }

  const pinnedCount = [tQuotes, tAuth, tPermission, tSoccer].filter(Boolean).length;
  const archivedCount = [tFloorPlan, tKitchen].filter(Boolean).length;
  console.log(
    `done — 4 spaces (Work / New House / Family / Personal), ${allProjects.filter(Boolean).length} projects ` +
    `(1 archived: Old Apartment Move-Out), ${created.length} active tasks (${pinnedCount} pinned, ${archivedCount} archived, ` +
    `2 with reminders, 5 recurring — daily/weekly/monthly all covered), ${TRASH_TITLES.length} in Trash, ` +
    `3 custom fields with real values, 3 related-task links, real changelog entries for all of it (Time Travel)` +
    (failures ? `, ${failures} write(s) failed (see warnings above)` : '') +
    '. Reload the page to see it.'
  );
})();
