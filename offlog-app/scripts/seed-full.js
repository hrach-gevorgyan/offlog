// Offlog — full-coverage seed
//
// The third and largest of the three seeds. The other two are deliberately
// narrow; this one is not:
//
//   seed-demo.js      hand-authored, deterministic, one polished persona.
//                     The canonical dataset behind marketing screenshots.
//   seed-scenario.js  generic dev/QA data with messy edge cases
//                     (duplicate titles, near-duplicate notes).
//   seed-full.js      THIS FILE — every writable feature exercised, at
//                     volume, for testing the app under a realistic load.
//
// Written to answer "does anything break when the workspace is actually
// full?" — every list is long enough to scroll, every counter is a real
// number, and every feature that can be reached from a script is used at
// least once. Deterministic: a fixed PRNG seed means two runs at the same
// SCALE produce the same workspace, so a regression is a real difference
// rather than reshuffled data.
//
// Run mechanics are identical to the other two — it calls the app's own
// db.ts functions (not raw PouchDB docs), so every write goes through the
// same validation, cache invalidation and changelog path the UI uses, and
// only works against a Vite dev server:
//
//   1. npm run dev, open http://localhost:5173 in a browser
//   2. Open DevTools → Console
//   3. Paste this entire file's contents, press Enter
//   4. Wait for "done" — big/stress take a while — then reload the page
//
// Set WIPE_EXISTING to true to reset the database first (really destructive;
// only on a database you mean to lose).

(async () => {
  // ── Knobs ────────────────────────────────────────────────────────────────
  const WIPE_EXISTING = false;

  // 'demo'   ~150 tasks — quick smoke run
  // 'big'    ~900 tasks — the default; enough to scroll every list
  // 'stress' ~5000 tasks — paging, virtualisation and query cost
  const SCALE = 'big';

  const PLAN = {
    demo:   { spaces: 4,  projectsPerSpace: [2, 3], tasksPerProject: [8, 16] },
    big:    { spaces: 8,  projectsPerSpace: [3, 5], tasksPerProject: [18, 34] },
    stress: { spaces: 12, projectsPerSpace: [5, 9], tasksPerProject: [60, 110] },
  }[SCALE];

  const dbmod = await import('/src/lib/db.ts');
  const {
    createSpace, updateSpace, reorderSpaces,
    createProject, createProjectFromTemplate, updateProject, archiveProject,
    addColumn, renameColumn, reorderColumns, archiveColumnTasks,
    createTask, updateTask, duplicateTask, archiveTask, unarchiveTask,
    deleteTask, skipRecurrence,
    linkRelatedTask, linkBlockedBy,
    addCustomFieldDef, updateCustomFieldDef, getCustomFieldDefs,
    setTagColor, renameTag,
    addAttachment,
    invalidateTaskCache,
  } = dbmod;
  const db = new PouchDB('offlog');

  let failures = 0;
  async function safe(fn, label) {
    try { return await fn(); }
    catch (e) { failures++; console.warn(`seed: ${label} failed —`, e && e.message ? e.message : e); return null; }
  }

  // Fixed-seed PRNG. Math.random() would make two runs incomparable, which
  // defeats the point of a seed you re-run to reproduce a bug.
  let _s = 0x9e3779b9;
  const rnd = () => { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const between = ([lo, hi]) => lo + Math.floor(rnd() * (hi - lo + 1));
  const chance = p => rnd() < p;

  const DAY = 86400000;
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const isoAt = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const shift = n => new Date(today.getTime() + n * DAY);

  const t0 = performance.now();
  const progress = (msg) => console.log(`seed: ${msg} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  if (WIPE_EXISTING) {
    progress('wiping');
    await safe(() => dbmod.wipeAndReseed(), 'wipeAndReseed');
  }

  // ── Vocabulary ───────────────────────────────────────────────────────────
  // Every space icon in spaceIcons.ts appears at least once, so the picker
  // and the collapsed rail are both exercised with real variety.
  const SPACE_SPECS = [
    ['Engineering', '#6366f1', 'code'],      ['Design', '#ec4899', 'star'],
    ['Home', '#f59e0b', 'home'],             ['Health', '#10b981', 'heart'],
    ['Finance', '#22c55e', 'dollar'],        ['Learning', '#8b5cf6', 'graduation'],
    ['Travel', '#06b6d4', 'plane'],          ['Side Projects', '#ef4444', 'rocket'],
    ['Music', '#a855f7', 'music'],           ['Reading', '#14b8a6', 'book'],
    ['Errands', '#f97316', 'cart'],          ['Photography', '#0ea5e9', 'camera'],
  ];

  const PROJECT_NAMES = [
    'Platform Migration', 'Q3 Roadmap', 'Bug Triage', 'Design System', 'Onboarding Revamp',
    'Kitchen Renovation', 'Garden Plan', 'Marathon Training', 'Meal Prep', 'Budget 2026',
    'Tax Return', 'Rust Course', 'Spanish Practice', 'Japan Trip', 'Iceland Trip',
    'Offlog Rewrite', 'Home Server', 'Album Recording', 'Guitar Practice', 'Reading List',
    'Weekly Shop', 'Car Service', 'Portfolio Shoot', 'Lens Research', 'API Cleanup',
    'Mobile Release', 'Docs Sprint', 'Analytics Setup', 'Hiring Loop', 'Retro Actions',
  ];

  const VERBS = ['Fix', 'Review', 'Ship', 'Draft', 'Refactor', 'Investigate', 'Plan', 'Migrate',
    'Test', 'Document', 'Call', 'Book', 'Buy', 'Renew', 'Compare', 'Measure', 'Sketch', 'Email'];
  const NOUNS = ['the login flow', 'the release notes', 'the API contract', 'the invoice',
    'the deployment script', 'the onboarding copy', 'the backup job', 'the colour tokens',
    'the flight options', 'the insurance quote', 'the pull request', 'the migration plan',
    'the test harness', 'the changelog', 'the dashboard query', 'the error budget',
    'the contractor quote', 'the sync conflict', 'the icon set', 'the retro notes'];

  const TAG_POOL = ['urgent', 'blocked', 'waiting', 'quick-win', 'research', 'code-review',
    'design', 'finance', 'travel', 'health', 'admin', 'follow-up', 'someday', 'deep-work'];

  const NOTES = [
    'Blocked on the vendor reply — chase Thursday if nothing lands.',
    'Two approaches considered; going with the simpler one for now.',
    'See the thread from last week for the original reasoning.',
    'Needs a second pair of eyes before it goes out.',
    'Rough estimate only — revisit once the numbers are in.',
    '',
  ];

  // ── Custom fields: all four types, including a select with options ───────
  progress('custom fields');
  await safe(() => addCustomFieldDef('Estimate (h)', 'number'), 'addCustomFieldDef number');
  await safe(() => addCustomFieldDef('Owner', 'text'), 'addCustomFieldDef text');
  await safe(() => addCustomFieldDef('Kickoff', 'date'), 'addCustomFieldDef date');
  await safe(() => addCustomFieldDef('Effort', 'select', ['XS', 'S', 'M', 'L', 'XL']), 'addCustomFieldDef select');
  await safe(() => addCustomFieldDef('Scratch', 'text'), 'addCustomFieldDef scratch');
  const fields = (await safe(() => getCustomFieldDefs(), 'getCustomFieldDefs')) || [];
  const fieldBy = n => fields.find(f => f.name === n);
  // Exercise the rename/retype path — a field renamed after values exist must
  // keep them, since values are keyed by id.
  const scratch = fieldBy('Scratch');
  if (scratch) await safe(() => updateCustomFieldDef(scratch.id, { name: 'Notes Ref' }), 'updateCustomFieldDef');

  // ── Tag colours ──────────────────────────────────────────────────────────
  progress('tag colours');
  for (const [tag, colour] of [['urgent', '#ef4444'], ['blocked', '#f59e0b'], ['quick-win', '#22c55e'],
    ['deep-work', '#6366f1'], ['research', '#a855f7']]) {
    await safe(() => setTagColor(tag, colour), `setTagColor ${tag}`);
  }

  // ── Spaces ───────────────────────────────────────────────────────────────
  progress('spaces');
  const spaces = [];
  for (const [name, colour, icon] of SPACE_SPECS.slice(0, PLAN.spaces)) {
    const s = await safe(() => createSpace(name, colour, icon), `createSpace ${name}`);
    if (s) spaces.push(s);
  }
  // updateSpace + reorderSpaces: both write paths, not just creation.
  if (spaces[0]) await safe(() => updateSpace(spaces[0]._id, { name: spaces[0].name + ' ⌁' }), 'updateSpace');
  if (spaces.length > 2) {
    const ids = spaces.map(s => s._id);
    await safe(() => reorderSpaces([ids[1], ids[0], ...ids.slice(2)]), 'reorderSpaces');
  }

  // ── Projects, columns, tasks ─────────────────────────────────────────────
  const projects = [];
  const allTasks = [];
  let nameIdx = 0;
  let created = 0, pinned = 0, recurring = 0, withReminder = 0, withChecklist = 0, withNotes = 0;

  for (const space of spaces) {
    const count = between(PLAN.projectsPerSpace);
    for (let i = 0; i < count; i++) {
      const pname = PROJECT_NAMES[nameIdx++ % PROJECT_NAMES.length] + (nameIdx > PROJECT_NAMES.length ? ` ${Math.ceil(nameIdx / PROJECT_NAMES.length)}` : '');
      const p = await safe(() => createProject(space._id, pname), `createProject ${pname}`);
      if (!p) continue;

      // Vary the column shape per project: default four, a lean three, or a
      // long six. "Done" is positional (last column), so a project with more
      // columns is a genuinely different completion rule, not decoration.
      let proj = p;
      const shape = pick(['default', 'lean', 'long']);
      if (shape === 'lean') {
        proj = (await safe(() => renameColumn(proj._id, proj.columns[0].id, 'Inbox'), 'renameColumn')) || proj;
        proj = (await safe(() => dbmod.removeColumn(proj._id, proj.columns[1].id), 'removeColumn')) || proj;
      } else if (shape === 'long') {
        for (const extra of ['Blocked', 'In Review']) {
          proj = (await safe(() => addColumn(proj._id, extra), `addColumn ${extra}`)) || proj;
        }
        // Move the new columns ahead of the final one so "done" stays last.
        const cols = [...proj.columns];
        const last = cols.pop();
        proj = (await safe(() => reorderColumns(proj._id, [...cols, last]), 'reorderColumns')) || proj;
      }

      // Half the projects open as a list rather than a board.
      if (chance(0.4)) await safe(() => updateProject(proj._id, { default_view: 'list' }), 'updateProject view');
      if (chance(0.15)) await safe(() => updateProject(proj._id, { pinned: true }), 'updateProject pinned');

      const doneCol = proj.columns[proj.columns.length - 1].id;
      const nTasks = between(PLAN.tasksPerProject);
      const mine = [];

      for (let t = 0; t < nTasks; t++) {
        const col = pick(proj.columns).id;
        const title = `${pick(VERBS)} ${pick(NOUNS)}`;

        // Due dates spread across every bucket the UI groups by, plus a
        // healthy share of none — Agenda's empty-state and the "no due date"
        // sort path both need real coverage.
        let due = null;
        const bucket = rnd();
        if (bucket < 0.12) due = iso(shift(-between([1, 21])));      // overdue
        else if (bucket < 0.22) due = iso(today);                     // today
        else if (bucket < 0.40) due = iso(shift(between([1, 7])));    // this week
        else if (bucket < 0.55) due = iso(shift(between([8, 90])));   // later
        // else: no due date

        const overrides = {
          priority: pick([1, 1, 2, 2, 3]),
          due_date: due,
          tags: chance(0.65) ? [...new Set([pick(TAG_POOL), ...(chance(0.35) ? [pick(TAG_POOL)] : [])])] : [],
          body: chance(0.35) ? pick(NOTES) : '',
        };
        if (overrides.body) withNotes++;

        // A reminder only means something with a due date.
        if (due && chance(0.18)) { overrides.reminder_at = isoAt(new Date(due + 'T00:00:00'), 9); withReminder++; }

        // All three cadences, plus the interval and weekdays-only variants
        // that plain "daily/weekly/monthly" seeds never reach.
        if (due && chance(0.12)) {
          overrides.recurrence = pick(['daily', 'weekly', 'monthly']);
          if (chance(0.4)) overrides.recurrenceInterval = pick([2, 3, 4]);
          if (overrides.recurrence === 'daily' && chance(0.5)) overrides.recurrenceWeekdaysOnly = true;
          recurring++;
        }

        if (chance(0.22)) {
          const n = between([2, 6]);
          overrides.checklist = Array.from({ length: n }, (_, k) => ({
            text: `${pick(VERBS)} step ${k + 1}`, done: chance(0.45),
          }));
          withChecklist++;
        }

        if (chance(0.3)) {
          overrides.custom_values = {};
          const est = fieldBy('Estimate (h)'), own = fieldBy('Owner'), eff = fieldBy('Effort'), kick = fieldBy('Kickoff');
          if (est) overrides.custom_values[est.id] = between([1, 40]);
          if (own && chance(0.6)) overrides.custom_values[own.id] = pick(['Ana', 'Bo', 'Chris', 'Dee', 'Eli']);
          if (eff && chance(0.6)) overrides.custom_values[eff.id] = pick(['XS', 'S', 'M', 'L', 'XL']);
          if (kick && chance(0.3)) overrides.custom_values[kick.id] = iso(shift(between([-30, 60])));
        }

        const task = await safe(() => createTask(proj._id, space._id, col, title, overrides), 'createTask');
        if (!task) continue;
        mine.push(task); allTasks.push(task); created++;

        if (chance(0.06)) { await safe(() => updateTask(task._id, { pinned: true }), 'pin'); pinned++; }

        // A second write on some tasks so Time Travel has real 'update' and
        // 'move' entries, not just a wall of 'create'.
        if (chance(0.18)) await safe(() => updateTask(task._id, { column_id: pick(proj.columns).id }), 'move');
      }

      // Per-project extras, only where there's something to work with.
      if (mine.length >= 6) {
        // related links are non-directional; blocked_by is a real dependency.
        await safe(() => linkRelatedTask(mine[0]._id, mine[1]._id), 'linkRelatedTask');
        await safe(() => linkRelatedTask(mine[2]._id, mine[3]._id), 'linkRelatedTask');
        // One blocker still open, one already in the done column — the
        // resolved/unresolved split is what isBlockerResolved() reads.
        await safe(() => linkBlockedBy(mine[4]._id, mine[5]._id), 'linkBlockedBy open');
        const resolved = mine[Math.min(6, mine.length - 1)];
        await safe(() => updateTask(resolved._id, { column_id: doneCol }), 'resolve blocker');
        await safe(() => linkBlockedBy(mine[0]._id, resolved._id), 'linkBlockedBy resolved');

        await safe(() => duplicateTask(mine[1]._id), 'duplicateTask');
        await safe(() => archiveTask(mine[2]._id), 'archiveTask');
        if (chance(0.3)) await safe(() => unarchiveTask(mine[2]._id), 'unarchiveTask');
        await safe(() => deleteTask(mine[3]._id), 'deleteTask');
      }

      projects.push(proj);
    }
    progress(`${space.name}: ${created} tasks so far`);
  }

  // ── Recurrence skip ──────────────────────────────────────────────────────
  // skipRecurrence advances the due date without completing — a path nothing
  // else in the seeds exercises.
  const recurringTasks = allTasks.filter(t => t.recurrence);
  for (const t of recurringTasks.slice(0, 5)) await safe(() => skipRecurrence(t._id), 'skipRecurrence');

  // ── Attachments ──────────────────────────────────────────────────────────
  // Both branches of attachments.ts: an image (thumbnailed) and a non-image
  // (icon + filename). 1x1 PNG and a few bytes of text — enough to prove the
  // path, small enough not to bloat the database.
  progress('attachments');
  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // btoa() is Latin1-only and throws on anything outside it -- an em dash
  // here aborts the whole seed, since this line sits outside safe().
  const TXT = btoa('Offlog seed attachment - plain text body.\n');
  for (const t of allTasks.slice(0, 12)) {
    if (chance(0.5)) await safe(() => addAttachment(t._id, { filename: 'screenshot.png', base64Data: PNG_1PX, size: 68 }), 'addAttachment png');
    else await safe(() => addAttachment(t._id, { filename: 'notes.txt', base64Data: TXT, size: 42 }), 'addAttachment txt');
  }

  // ── Template project ─────────────────────────────────────────────────────
  // createProjectFromTemplate with copyOpenTasks both ways.
  progress('templates');
  if (projects.length) {
    const src = projects[0];
    await safe(() => createProjectFromTemplate(src.space_id, `${src.name} (copy, structure only)`, src._id, false), 'template no tasks');
    await safe(() => createProjectFromTemplate(src.space_id, `${src.name} (copy, with tasks)`, src._id, true), 'template with tasks');
  }

  // ── Bulk column archive ──────────────────────────────────────────────────
  if (projects.length > 3) {
    const p = projects[3];
    await safe(() => archiveColumnTasks(p._id, p.columns[0].id), 'archiveColumnTasks');
  }

  // ── Archived project ─────────────────────────────────────────────────────
  if (projects.length > 1) {
    await safe(() => archiveProject(projects[projects.length - 1]._id), 'archiveProject');
  }

  // ── Tag rename ───────────────────────────────────────────────────────────
  // renameTag rewrites every task carrying it — worth having in the history.
  await safe(() => renameTag('follow-up', 'followup'), 'renameTag');

  // ── Trash, at a depth worth paging ───────────────────────────────────────
  progress('trash');
  const trashPool = allTasks.slice(-Math.min(24, Math.floor(allTasks.length * 0.05)));
  // deleteTask resolves to void, so the result can't be truthiness-tested for
  // success the way a doc-returning call can -- map it to a flag first.
  let trashed = 0;
  for (const t of trashPool) {
    if (await safe(() => deleteTask(t._id).then(() => true), 'deleteTask')) trashed++;
  }

  await safe(() => invalidateTaskCache(), 'invalidateTaskCache');

  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `done in ${secs}s — SCALE=${SCALE}: ${spaces.length} spaces, ${projects.length} projects ` +
    `(+2 from template, 1 archived), ${created} tasks created ` +
    `(${pinned} pinned, ${recurring} recurring incl. interval + weekdays-only, ` +
    `${withReminder} with reminders, ${withChecklist} with checklists, ${withNotes} with notes), ` +
    `${trashed} sent to Trash, ${fields.length} custom fields (all 4 types, 1 renamed), ` +
    `5 tag colours, 1 tag renamed, related + blocked-by links (resolved and unresolved), ` +
    `attachments (image and non-image), duplicated/archived/unarchived tasks, ` +
    `bulk column archive, skipped recurrences, and a real changelog for all of it (Time Travel)` +
    (failures ? ` — ${failures} write(s) failed, see warnings above` : '') +
    '. Reload the page to see it.'
  );
})();
