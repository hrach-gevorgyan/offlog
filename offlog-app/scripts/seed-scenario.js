// Offlog — scenario seed script
//
// Fills a database with a realistic-looking, lived-in workspace covering
// every major feature for manual testing/review: multiple spaces, projects
// with varied status sets (including one archived, and one deliberate
// same-name-in-a-different-space pair to exercise the duplicate-name
// hint/disambiguation), ~90 active tasks spread across priorities/due
// dates/tags, ~15 archived tasks, 6 soft-deleted (Trash) tasks, pinned
// tasks (Focus/Dashboard), reminders, recurring tasks, checklists
// (including one with a deliberate duplicate item), notes (including one
// deliberate near-duplicate pair), global custom fields with values, and
// a real changelog/history trail (Time Travel) for everything created.
//
// Unlike the old version of this script, this one calls the app's own
// db.ts functions (createTask/updateTask/etc.) instead of writing raw
// PouchDB docs directly — every write gets a real changelog entry, cache
// invalidation, and stays correct automatically as the schema evolves,
// instead of this script silently drifting out of sync with db.ts's own
// invariants over time.
//
// PouchDB (and every db.ts function) only exists in the browser, and this
// script imports db.ts as a real ES module — both mean this can't run as
// a Node script, and only works against a Vite dev server (not a built
// dist/ bundle). Paste it into the browser DevTools console instead:
//
//   1. npm run dev, open http://localhost:5173 in a browser
//   2. Open DevTools → Console
//   3. Paste this entire file's contents, press Enter
//   4. Reload the page once it logs "done"
//
// Set WIPE_EXISTING to true below to fully reset the database before
// seeding (deletes every doc first — real destructive action, only do
// this on a database you mean to reset). Defaults to false/additive:
// safe to run multiple times, each run adds a fresh batch on top of
// whatever's already there.

(async () => {
  const WIPE_EXISTING = false;

  const dbmod = await import('/src/lib/db.ts');
  const {
    getSpaces, createSpace, getProjects, createProject, archiveProject,
    createTask, updateTask, archiveTask, deleteTask,
    getCustomFieldDefs, addCustomFieldDef, invalidateTaskCache,
  } = dbmod;
  const db = new PouchDB('offlog');

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  // Robustness: one failed write shouldn't abort the whole run.
  let failures = 0;
  async function safe(fn, label) {
    try { return await fn(); }
    catch (err) { failures++; console.warn('seed-scenario: failed', label, err); return null; }
  }

  if (WIPE_EXISTING) {
    console.log('seed-scenario: WIPE_EXISTING is true — deleting every doc first…');
    const all = await db.allDocs({ include_docs: true });
    const dels = all.rows.map(r => ({ ...r.doc, _deleted: true }));
    if (dels.length) await db.bulkDocs(dels);
    invalidateTaskCache();
    localStorage.removeItem('offlog_seeded');
  }

  // ── Spaces — reuse whatever exists, top up to at least 4 (the default 3
  //    plus one custom one) so the seed has real multi-space variety. ──
  let spaces = await getSpaces();
  if (spaces.length === 0) {
    await safe(() => createSpace('Unsorted', '#6B7280'), 'space:Unsorted');
    await safe(() => createSpace('Personal', '#10B981'), 'space:Personal');
    await safe(() => createSpace('Work', '#3B82F6'), 'space:Work');
    spaces = await getSpaces();
  }
  if (spaces.length < 4) {
    const extra = await safe(() => createSpace('Side Projects', '#F59E0B', 'rocket'), 'space:Side Projects');
    if (extra) spaces.push(extra);
  }
  if (spaces.length === 0) throw new Error('seed-scenario: no space available, aborting');

  // ── Column templates — most projects use the app default; a few get a
  //    genuinely different status set. Every template's last entry is a
  //    done-like state, per the positional-"done" invariant (db.ts). ──
  const COLUMN_TEMPLATES = [
    null, null, null, // null = use createProject's own default columns
    ['Backlog', 'In Progress', 'Review', 'Done'],
    ['To Do', 'Doing', 'Done'],
    ['Icebox', 'Planned', 'In Progress', 'Blocked', 'Done'],
    ['Reported', 'Investigating', 'Fix In Progress', 'Verified', 'Closed'],
    ['Someday', 'This Week', 'Today', 'Done'],
  ];

  // ── Projects — 10 with varied names/spaces/columns, one archived, and
  //    one deliberate SAME NAME in two different spaces (real scenario
  //    that prompted B60's duplicate-name hint — see IDEAS.md's S2 entry
  //    and CHANGELOG's v5.6.0 row). ──
  const PROJECT_NAMES = [
    'Website Redesign', 'Q3 Marketing Campaign', 'Mobile App Backlog', 'Home Renovation',
    'Fitness Tracker', 'Book Club', 'Recipe App', 'Conference Prep',
    'Garage Cleanup', 'Client Onboarding', 'Newsletter Revamp', 'Photo Archive Sort',
    'Backyard Garden', 'Freelance Invoicing', 'Team Offsite', 'Product Launch',
  ];
  const shuffledNames = [...PROJECT_NAMES].sort(() => Math.random() - 0.5).slice(0, 9);

  // Pre-existing projects count too, both for task assignment (a rerun on
  // top of existing data should use them) and for the duplicate-"Draft"
  // accounting below — a genuinely fresh database's own seedIfEmpty()
  // already created one "Draft" (project:draft) before this script runs.
  const projects = await getProjects();
  for (const name of shuffledNames) {
    const spaceId = pick(spaces)._id;
    const proj = await safe(() => createProject(spaceId, name), `project:${name}`);
    if (!proj) continue;
    const cols = pick(COLUMN_TEMPLATES);
    if (cols) {
      // Replace the default columns with the chosen template, preserving
      // real column ids so tasks created below can reference them.
      const withCols = { ...proj, columns: cols.map((n, i) => ({ id: `col:${Math.random().toString(36).slice(2, 10)}`, name: n })) };
      await db.put({ ...(await db.get(proj._id)), columns: withCols.columns });
      proj.columns = withCols.columns;
    }
    projects.push(proj);
  }
  // Deliberate duplicate: "Draft" in two different spaces, if there are
  // at least 2 spaces — exactly the real scenario B60 was built for. A
  // genuinely-fresh database's own seedIfEmpty() already creates one
  // "Draft" (project:draft, fixed id, in the first space) before this
  // script ever runs, so only top up to 2 total rather than blindly
  // adding 2 more on top of that one — confirmed live (2026-07-20): an
  // unchecked +2 produced 3 "Draft" projects, not the intended 2.
  const existingDraftCount = projects.filter(p => p.name.trim().toLowerCase() === 'draft').length;
  if (spaces.length >= 2 && existingDraftCount < 2) {
    const [s1, s2] = spaces;
    const toAdd = 2 - existingDraftCount;
    if (toAdd >= 1) { const d = await safe(() => createProject(s1._id, 'Draft'), 'project:Draft#1'); if (d) projects.push(d); }
    if (toAdd >= 2) { const d = await safe(() => createProject(s2._id, 'Draft'), 'project:Draft#2'); if (d) projects.push(d); }
  }
  if (projects.length === 0) throw new Error('seed-scenario: no project could be created, aborting');

  // One project archived, for real ArchivedProjectsManager coverage.
  await safe(() => archiveProject(pick(projects.filter(p => !p.archived))._id), 'archiveProject');

  // ── Global custom fields (Settings → Organize), if none exist yet ──
  let fields = await getCustomFieldDefs();
  if (fields.length === 0) {
    await safe(() => addCustomFieldDef('Estimate (hrs)', 'number'), 'field:Estimate');
    await safe(() => addCustomFieldDef('Client', 'select', ['Acme Co', 'Globex', 'Personal', 'Internal']), 'field:Client');
    await safe(() => addCustomFieldDef('Review by', 'date'), 'field:Review by');
    fields = await getCustomFieldDefs();
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
  // A near-duplicate pair (shares most words, not identical) — exercises
  // the fuzzy similar-notes hint (CardDetail, B60) without ever setting up
  // a manufactured PouchDB conflict.
  const SIMILAR_NOTE_A = 'Call the plumber about the leaking kitchen sink before Friday, mention the warranty.';
  const SIMILAR_NOTE_B = 'Call the plumber about the leaking kitchen sink before Monday, mention the warranty again.';
  const CHECKLIST_ITEMS = ['Draft outline', 'Get feedback', 'Finalize', 'Publish', 'Test on device', 'Write tests', 'Update docs', 'Notify team', 'Double-check numbers', 'Get sign-off'];

  function randTags() {
    const tags = [];
    if (chance(0.55)) tags.push(pick(TAGS));
    if (chance(0.15)) tags.push(pick(TAGS));
    return [...new Set(tags)];
  }

  function randDueDate() {
    const bucket = pick(['past', 'past', 'today', 'soon', 'future', 'future', 'none', 'none']);
    if (bucket === 'none') return null;
    const offsets = { past: -(1 + Math.floor(Math.random() * 14)), today: 0, soon: 1 + Math.floor(Math.random() * 5), future: 7 + Math.floor(Math.random() * 30) };
    const d = new Date();
    d.setDate(d.getDate() + offsets[bucket]);
    return d.toISOString().slice(0, 10);
  }

  function randCustomValues() {
    if (!fields.length || !chance(0.3)) return undefined;
    const out = {};
    for (const f of fields) {
      if (!chance(0.6)) continue;
      if (f.type === 'number') out[f.id] = Math.floor(Math.random() * 40) + 1;
      else if (f.type === 'select') out[f.id] = pick(f.options ?? ['']);
      else if (f.type === 'date') out[f.id] = randDueDate() ?? new Date().toISOString().slice(0, 10);
      else out[f.id] = pick(['Follow up needed', 'Looks good', 'TBD']);
    }
    return Object.keys(out).length ? out : undefined;
  }

  let activeCreated = 0, archivedSoFar = 0, deletedCreated = 0, pinnedSoFar = 0, remindersSoFar = 0, recurringSoFar = 0;
  const ARCHIVED_COUNT = 15, ACTIVE_COUNT = 90, DELETED_COUNT = 6, PINNED_COUNT = 5, REMINDER_COUNT = 8, RECURRING_COUNT = 4;

  // One deliberate duplicate task TITLE within the same project, to
  // exercise B60's duplicate-task-title hint (Quick Add/CardDetail).
  const dupTitleProject = pick(projects.filter(p => p.columns?.length));
  if (dupTitleProject) {
    await safe(() => createTask(dupTitleProject._id, dupTitleProject.space_id, dupTitleProject.columns[0].id, 'Follow up with vendor'), 'dup-title-1');
    await safe(() => createTask(dupTitleProject._id, dupTitleProject.space_id, dupTitleProject.columns[0].id, 'Follow up with vendor'), 'dup-title-2');
    activeCreated += 2;
  }

  // The near-duplicate-notes pair, on two different tasks/projects.
  {
    const pA = pick(projects.filter(p => p.columns?.length));
    const pB = pick(projects.filter(p => p.columns?.length));
    const a = await safe(() => createTask(pA._id, pA.space_id, pA.columns[0].id, 'Call the plumber', { body: SIMILAR_NOTE_A }), 'similar-note-1');
    const b = await safe(() => createTask(pB._id, pB.space_id, pB.columns[0].id, 'Plumber follow-up', { body: SIMILAR_NOTE_B }), 'similar-note-2');
    if (a) activeCreated++;
    if (b) activeCreated++;
  }

  for (let i = 0; i < ACTIVE_COUNT; i++) {
    const project = pick(projects.filter(p => p.columns?.length));
    if (!project) continue;
    const col = pick(project.columns);
    const dueDate = randDueDate();
    const overrides = { priority: pick([1, 1, 2, 2, 2, 3]), due_date: dueDate, tags: randTags(), custom_values: randCustomValues() };
    if (chance(0.1)) overrides.body = pick(NOTES);
    if (chance(0.1)) {
      const n = 2 + Math.floor(Math.random() * 3);
      const items = Array.from({ length: n }, () => ({ text: pick(CHECKLIST_ITEMS), done: chance(0.4) }));
      // Occasionally a deliberate duplicate item, for CardDetail's
      // duplicate-checklist-item hint (B60).
      if (chance(0.2) && items.length) items.push({ ...items[0] });
      overrides.checklist = items;
    }
    if (dueDate && recurringSoFar < RECURRING_COUNT && chance(0.08)) {
      overrides.recurrence = pick(['daily', 'weekly', 'monthly']);
      recurringSoFar++;
    }
    if (dueDate && remindersSoFar < REMINDER_COUNT && chance(0.12)) {
      const d = new Date(`${dueDate}T09:00:00`);
      overrides.reminder_at = d.toISOString();
      remindersSoFar++;
    }

    const forceArchived = archivedSoFar < ARCHIVED_COUNT && (project.archived || chance(0.2));
    const task = await safe(() => createTask(project._id, project.space_id, col.id, pick(TITLES), overrides), `task#${i}`);
    if (!task) continue;
    activeCreated++;

    if (forceArchived) { await safe(() => archiveTask(task._id), 'archiveTask'); archivedSoFar++; }
    else if (pinnedSoFar < PINNED_COUNT && chance(0.06)) { await safe(() => updateTask(task._id, { pinned: true }), 'pin'); pinnedSoFar++; }
  }
  // Top up if randomness left pinned/archived short.
  for (const [countRef, target, action] of [[() => archivedSoFar, ARCHIVED_COUNT, async (id) => { await archiveTask(id); archivedSoFar++; }], [() => pinnedSoFar, PINNED_COUNT, async (id) => { await updateTask(id, { pinned: true }); pinnedSoFar++; }]]) {
    let attempts = 0;
    while (countRef() < target && attempts < target * 3) {
      attempts++;
      const project = pick(projects.filter(p => p.columns?.length));
      if (!project) continue;
      const task = await safe(() => createTask(project._id, project.space_id, pick(project.columns).id, pick(TITLES), { priority: pick([1, 2, 3]), due_date: randDueDate(), tags: randTags() }), 'top-up');
      if (!task) continue;
      activeCreated++;
      await safe(() => action(task._id), 'top-up-action');
    }
  }

  // ── 6 soft-deleted tasks (Trash) ──
  for (let i = 0; i < DELETED_COUNT; i++) {
    const project = pick(projects.filter(p => p.columns?.length));
    if (!project) continue;
    const task = await safe(() => createTask(project._id, project.space_id, pick(project.columns).id, pick(TITLES), { priority: pick([1, 2, 3]) }), `trash#${i}`);
    if (!task) continue;
    await safe(() => deleteTask(task._id), 'deleteTask');
    deletedCreated++;
  }

  console.log(
    `done — ${projects.length} projects (1 archived, 2 deliberately named "Draft" in different spaces), ` +
    `${activeCreated} active tasks (${archivedSoFar} archived, ${pinnedSoFar} pinned, ${remindersSoFar} with reminders, ${recurringSoFar} recurring), ` +
    `${deletedCreated} in Trash, ${fields.length} custom fields, 1 duplicate-title pair, 1 near-duplicate-notes pair, real changelog entries for all of it (Time Travel)` +
    (failures ? `, ${failures} write(s) failed (see warnings above)` : '') +
    '. Reload the page to see it.'
  );
})();
