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
//                     volume, to exact counts.
//
// Unlike the other two, the totals here are EXACT, not probabilistic: the
// TARGET block below is the contract, and the summary at the end reports
// what was actually written so a mismatch is visible rather than assumed.
// Attributes are assigned from disjoint slices of one deterministically
// shuffled pool, which is what makes the counts land precisely.
//
// Run mechanics are identical to the other two — it calls the app's own
// db.ts functions (not raw PouchDB docs), so every write goes through the
// same validation, cache invalidation and changelog path the UI uses, and
// only works against a Vite dev server:
//
//   1. npm run dev, open http://localhost:5173 in a browser
//   2. Open DevTools → Console
//   3. Paste this entire file's contents, press Enter
//   4. Wait for "done", then reload the page
//
// WIPE_EXISTING defaults to TRUE: the counts are exact, and layering them
// onto an existing workspace makes every total meaningless. This really does
// destroy the local database first.

(async () => {
  // ── Contract ─────────────────────────────────────────────────────────────
  // Always on: the counts below are exact, and layering them onto an
  // existing workspace makes every total meaningless. Turn it off only to
  // deliberately stack this seed on top of data you already have.
  const WIPE_EXISTING = true;

  const TARGET = {
    spaces: 10,
    projects: 30,
    tasks: 500,          // created in total; the counts below are subsets
    checklists: 100,
    customValues: 150,
    recurring: 50,       // of which:
    recurringInterval: 10,
    recurringWeekdays: 10,
    reminders: 40,
    pinned: 35,
    archived: 20,
    trashed: 35,
    attachments: 25,
    relatedLinks: 50,
    blockedBy: 40,
    // Logs are generated as a side effect of every write, so they come out
    // far denser than a real workspace and all stamped "now". The post-pass
    // at the end thins them to this many and spreads them over LOG_DAYS.
    logs: 200,
  };
  const LOG_DAYS = 120;

  const dbmod = await import('/src/lib/db.ts');
  const {
    createSpace, reorderSpaces,
    createProject, createProjectFromTemplate, updateProject, archiveProject,
    addColumn, renameColumn, reorderColumns,
    createTask, updateTask, archiveTask, deleteTask, skipRecurrence,
    linkRelatedTask, linkBlockedBy,
    addCustomFieldDef, updateCustomFieldDef, getCustomFieldDefs,
    setTagColor, renameTag, addAttachment,
    invalidateTaskCache,
  } = dbmod;
  const db = new PouchDB('offlog');

  let failures = 0;
  async function safe(fn, label) {
    try { return await fn(); }
    catch (e) { failures++; console.warn(`seed: ${label} failed —`, e && e.message ? e.message : e); return null; }
  }
  // deleteTask and friends resolve to void, so their result can't be
  // truthiness-tested for success the way a doc-returning call can.
  const ok = (fn, label) => safe(() => Promise.resolve(fn()).then(() => true), label);

  // Fixed-seed PRNG. Math.random() would make two runs incomparable, which
  // defeats the point of a seed you re-run to reproduce a bug.
  let _s = 0x9e3779b9;
  const rnd = () => { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  // db.ts's barrel does not re-export core.ts's nanoid, so the log post-pass
  // mints its own id suffix rather than reaching past the barrel.
  const rid = () => Math.random().toString(36).slice(2, 10);
  const shuffled = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const DAY = 86400000;
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const isoAt = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const shift = n => new Date(today.getTime() + n * DAY);

  const t0 = performance.now();
  const progress = m => console.log(`seed: ${m} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

  if (WIPE_EXISTING) { progress('wiping'); await safe(() => dbmod.wipeAndReseed(), 'wipeAndReseed'); }

  // ── Vocabulary ───────────────────────────────────────────────────────────
  const SPACE_SPECS = [
    ['Engineering', '#6366f1', 'code'],   ['Design', '#ec4899', 'star'],
    ['Home', '#f59e0b', 'home'],          ['Health', '#10b981', 'heart'],
    ['Finance', '#22c55e', 'dollar'],     ['Learning', '#8b5cf6', 'graduation'],
    ['Travel', '#06b6d4', 'plane'],       ['Side Projects', '#ef4444', 'rocket'],
    ['Music', '#a855f7', 'music'],        ['Archive', '#64748b', 'book'],
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
    'Blocked on the vendor reply - chase Thursday if nothing lands.',
    'Two approaches considered; going with the simpler one for now.',
    'See the thread from last week for the original reasoning.',
    'Needs a second pair of eyes before it goes out.',
    'Rough estimate only - revisit once the numbers are in.',
  ];

  // ── Custom fields: all four types ────────────────────────────────────────
  progress('custom fields');
  await safe(() => addCustomFieldDef('Estimate (h)', 'number'), 'field number');
  await safe(() => addCustomFieldDef('Owner', 'text'), 'field text');
  await safe(() => addCustomFieldDef('Kickoff', 'date'), 'field date');
  await safe(() => addCustomFieldDef('Effort', 'select', ['XS', 'S', 'M', 'L', 'XL']), 'field select');
  await safe(() => addCustomFieldDef('Scratch', 'text'), 'field scratch');
  const fields = (await safe(() => getCustomFieldDefs(), 'getCustomFieldDefs')) || [];
  const fieldBy = n => fields.find(f => f.name === n);
  // A field renamed after values exist must keep them — values are keyed by id.
  const scratch = fieldBy('Scratch');
  if (scratch) await safe(() => updateCustomFieldDef(scratch.id, { name: 'Notes Ref' }), 'updateCustomFieldDef');

  for (const [tag, colour] of [['urgent', '#ef4444'], ['blocked', '#f59e0b'], ['quick-win', '#22c55e'],
    ['deep-work', '#6366f1'], ['research', '#a855f7']]) {
    await safe(() => setTagColor(tag, colour), `setTagColor ${tag}`);
  }

  // ── Empty the default "Unsorted" space ───────────────────────────────────
  // It cannot be removed: deleteSpace() rejects it by design, because it is
  // the permanent fallback repairDatabase() reassigns orphaned projects to.
  // Dropping its starter "Draft" project is as close as the data model gets
  // -- the space stays, holding nothing.
  progress('emptying Unsorted');
  await safe(() => dbmod.deleteProject('project:draft'), 'deleteProject draft');

  // ── Spaces ───────────────────────────────────────────────────────────────
  progress('spaces');
  const spaces = [];
  for (const [name, colour, icon] of SPACE_SPECS.slice(0, TARGET.spaces)) {
    const s = await safe(() => createSpace(name, colour, icon), `createSpace ${name}`);
    if (s) spaces.push(s);
  }
  if (spaces.length > 2) {
    const ids = spaces.map(s => s._id);
    await safe(() => reorderSpaces([ids[1], ids[0], ...ids.slice(2)]), 'reorderSpaces');
  }

  // ── Projects: every column shape, and every column gets tasks ────────────
  progress('projects');
  const projects = [];
  const perSpace = Math.ceil(TARGET.projects / spaces.length);
  for (let i = 0; i < TARGET.projects; i++) {
    const space = spaces[Math.floor(i / perSpace)] || spaces[spaces.length - 1];
    const p = await safe(() => createProject(space._id, PROJECT_NAMES[i % PROJECT_NAMES.length]), 'createProject');
    if (!p) continue;
    let proj = p;

    // Three column shapes. "Done" is positional (the last column), so a
    // project with more columns is a genuinely different completion rule.
    const shape = i % 3 === 0 ? 'default' : i % 3 === 1 ? 'lean' : 'long';
    if (shape === 'lean') {
      proj = (await safe(() => renameColumn(proj._id, proj.columns[0].id, 'Inbox'), 'renameColumn')) || proj;
      proj = (await safe(() => dbmod.removeColumn(proj._id, proj.columns[1].id), 'removeColumn')) || proj;
    } else if (shape === 'long') {
      for (const extra of ['Blocked', 'In Review']) {
        proj = (await safe(() => addColumn(proj._id, extra), 'addColumn')) || proj;
      }
      const cols = [...proj.columns]; const last = cols.pop();
      proj = (await safe(() => reorderColumns(proj._id, [...cols, last]), 'reorderColumns')) || proj;
    }
    if (i % 5 === 0) await safe(() => updateProject(proj._id, { default_view: 'list' }), 'updateProject view');
    if (i % 7 === 0) await safe(() => updateProject(proj._id, { pinned: true }), 'updateProject pinned');
    projects.push(proj);
  }

  // ── Tasks: exactly TARGET.tasks, spread so every column is used ──────────
  progress('tasks');
  // Distribute the remainder across the first projects rather than dumping it
  // on one, so no project is an outlier.
  const base = Math.floor(TARGET.tasks / projects.length);
  const extra = TARGET.tasks - base * projects.length;
  const quota = projects.map((_, i) => base + (i < extra ? 1 : 0));

  const allTasks = [];
  for (const [pi, proj] of projects.entries()) {
    for (let j = 0; j < quota[pi]; j++) {
      // Round-robin over columns guarantees every column receives tasks,
      // which a random pick does not at these quotas.
      const col = proj.columns[j % proj.columns.length].id;
      const bucket = rnd();
      let due = null;
      if (bucket < 0.14) due = iso(shift(-(1 + Math.floor(rnd() * 21))));
      else if (bucket < 0.24) due = iso(today);
      else if (bucket < 0.44) due = iso(shift(1 + Math.floor(rnd() * 7)));
      else if (bucket < 0.62) due = iso(shift(8 + Math.floor(rnd() * 82)));

      const t = await safe(() => createTask(proj._id, proj.space_id, col, `${pick(VERBS)} ${pick(NOUNS)}`, {
        priority: pick([1, 1, 2, 2, 3]),
        due_date: due,
        tags: rnd() < 0.65 ? [...new Set([pick(TAG_POOL), ...(rnd() < 0.35 ? [pick(TAG_POOL)] : [])])] : [],
        body: rnd() < 0.35 ? pick(NOTES) : '',
      }), 'createTask');
      if (t) allTasks.push(t);
    }
    if (pi % 10 === 9) progress(`${allTasks.length}/${TARGET.tasks} tasks`);
  }

  // ── Exact attribute counts, from disjoint slices of one shuffled pool ────
  progress('attributes');
  const pool = shuffled(allTasks);
  let cur = 0;
  const take = n => pool.slice(cur, cur += n);

  const checklistT = take(TARGET.checklists);
  const customT    = take(TARGET.customValues);
  const recurT     = take(TARGET.recurring);
  const reminderT  = take(TARGET.reminders);
  const pinnedT    = take(TARGET.pinned);
  const archivedT  = take(TARGET.archived);
  const trashedT   = take(TARGET.trashed);
  const attachT    = take(TARGET.attachments);

  const counts = { checklists: 0, customValues: 0, recurring: 0, recurringInterval: 0,
    recurringWeekdays: 0, reminders: 0, pinned: 0, archived: 0, trashed: 0,
    attachments: 0, relatedLinks: 0, blockedBy: 0 };

  for (const t of checklistT) {
    const n = 2 + Math.floor(rnd() * 5);
    const checklist = Array.from({ length: n }, (_, k) => ({ text: `${pick(VERBS)} step ${k + 1}`, done: rnd() < 0.45 }));
    if (await ok(() => updateTask(t._id, { checklist }), 'checklist')) counts.checklists++;
  }

  const est = fieldBy('Estimate (h)'), own = fieldBy('Owner'), eff = fieldBy('Effort'), kick = fieldBy('Kickoff');
  for (const t of customT) {
    const custom_values = {};
    if (est) custom_values[est.id] = 1 + Math.floor(rnd() * 40);
    if (own && rnd() < 0.7) custom_values[own.id] = pick(['Ana', 'Bo', 'Chris', 'Dee', 'Eli']);
    if (eff && rnd() < 0.7) custom_values[eff.id] = pick(['XS', 'S', 'M', 'L', 'XL']);
    if (kick && rnd() < 0.4) custom_values[kick.id] = iso(shift(-30 + Math.floor(rnd() * 90)));
    if (await ok(() => updateTask(t._id, { custom_values }), 'customValues')) counts.customValues++;
  }

  for (const [i, t] of recurT.entries()) {
    // Recurrence needs a due date to mean anything.
    const changes = { recurrence: pick(['daily', 'weekly', 'monthly']), due_date: t.due_date || iso(shift(1 + Math.floor(rnd() * 14))) };
    if (i < TARGET.recurringInterval) { changes.recurrenceInterval = pick([2, 3, 4]); }
    else if (i < TARGET.recurringInterval + TARGET.recurringWeekdays) { changes.recurrence = 'daily'; changes.recurrenceWeekdaysOnly = true; }
    if (await ok(() => updateTask(t._id, changes), 'recurrence')) {
      counts.recurring++;
      if (changes.recurrenceInterval) counts.recurringInterval++;
      if (changes.recurrenceWeekdaysOnly) counts.recurringWeekdays++;
    }
  }
  // skipRecurrence advances the due date without completing — nothing else
  // in the seeds reaches this path.
  for (const t of recurT.slice(0, 5)) await safe(() => skipRecurrence(t._id), 'skipRecurrence');

  for (const t of reminderT) {
    const dd = t.due_date || iso(shift(1 + Math.floor(rnd() * 10)));
    if (await ok(() => updateTask(t._id, { due_date: dd, reminder_at: isoAt(new Date(dd + 'T00:00:00'), 9) }), 'reminder')) counts.reminders++;
  }

  for (const t of pinnedT) if (await ok(() => updateTask(t._id, { pinned: true }), 'pin')) counts.pinned++;
  for (const t of archivedT) if (await ok(() => archiveTask(t._id), 'archiveTask')) counts.archived++;
  for (const t of trashedT) if (await ok(() => deleteTask(t._id), 'deleteTask')) counts.trashed++;

  // Attachments: both branches of attachments.ts — an image (thumbnailed) and
  // a non-image (icon + filename). btoa() is Latin1-only and throws on
  // anything outside it, which would abort the seed from outside safe().
  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const TXT = btoa('Offlog seed attachment - plain text body.\n');
  for (const [i, t] of attachT.entries()) {
    const r = i % 2 === 0
      ? await safe(() => addAttachment(t._id, { filename: 'screenshot.png', base64Data: PNG_1PX, size: 68 }), 'addAttachment png')
      : await safe(() => addAttachment(t._id, { filename: 'notes.txt', base64Data: TXT, size: 42 }), 'addAttachment txt');
    if (r) counts.attachments++;
  }

  // Links. Both ends must live in the same project to be reachable in the UI,
  // so pair within a project rather than across the whole pool.
  progress('links');
  const byProject = new Map();
  for (const t of allTasks) { if (!byProject.has(t.project_id)) byProject.set(t.project_id, []); byProject.get(t.project_id).push(t); }
  const groups = [...byProject.values()].filter(g => g.length >= 4);
  let gi = 0;
  while (counts.relatedLinks < TARGET.relatedLinks && gi < groups.length * 4) {
    const g = groups[gi % groups.length]; const k = Math.floor(gi / groups.length) * 2; gi++;
    if (k + 1 >= g.length) continue;
    if (await ok(() => linkRelatedTask(g[k]._id, g[k + 1]._id), 'linkRelatedTask')) counts.relatedLinks++;
  }
  gi = 0;
  const doneColOf = pid => { const p = projects.find(x => x._id === pid); return p && p.columns[p.columns.length - 1].id; };
  while (counts.blockedBy < TARGET.blockedBy && gi < groups.length * 4) {
    const g = groups[gi % groups.length]; const k = Math.floor(gi / groups.length) * 2; gi++;
    if (k + 1 >= g.length) continue;
    const blocked = g[k], blocker = g[k + 1];
    // Half the blockers are already done, so isBlockerResolved() has both
    // states to report rather than only "still blocked".
    if (counts.blockedBy % 2 === 1) await safe(() => updateTask(blocker._id, { column_id: doneColOf(blocker.project_id) }), 'resolve blocker');
    if (await ok(() => linkBlockedBy(blocked._id, blocker._id), 'linkBlockedBy')) counts.blockedBy++;
  }

  // ── Templates, archived project, archived space, tag rename ──────────────
  progress('extras');
  if (projects.length) {
    await safe(() => createProjectFromTemplate(projects[0].space_id, `${projects[0].name} (template, no tasks)`, projects[0]._id, false), 'template no tasks');
    await safe(() => createProjectFromTemplate(projects[0].space_id, `${projects[0].name} (template, with tasks)`, projects[0]._id, true), 'template with tasks');
  }
  // NOTE: SpaceDoc has no `archived` flag and there is no archiveSpace() —
  // archiving every project inside one space is the closest real equivalent,
  // and leaves that space showing only archived work.
  const archiveSpace = spaces[spaces.length - 1];
  let archivedProjects = 0;
  for (const p of projects.filter(p => p.space_id === archiveSpace._id)) {
    if (await ok(() => archiveProject(p._id), 'archiveProject')) archivedProjects++;
  }
  await safe(() => renameTag('follow-up', 'followup'), 'renameTag');

  // ── Logs: thin them out and spread them over real dates ──────────────────
  // Every write above emits a log, so they arrive far denser than a real
  // workspace and all stamped "now" — Time Travel shows one solid block.
  // The id encodes the timestamp and range scans depend on that, so a log
  // cannot be re-dated in place: it has to be re-put under a new id.
  progress('logs');
  const logRows = (await db.allDocs({ startkey: 'log:', endkey: 'log:￿', include_docs: true })).rows;
  let logsKept = 0, logsRemoved = 0;
  if (logRows.length) {
    const step = Math.max(1, Math.floor(logRows.length / TARGET.logs));
    const keep = logRows.filter((_, i) => i % step === 0).slice(0, TARGET.logs);
    const reput = keep.map((r, i) => {
      // Newest last: spread evenly back across LOG_DAYS, with the time of day
      // varied so a day's entries don't all share one timestamp.
      const daysAgo = LOG_DAYS - Math.floor((i / keep.length) * LOG_DAYS);
      const d = new Date(today.getTime() - daysAgo * DAY + (8 + Math.floor(rnd() * 10)) * 3600000 + Math.floor(rnd() * 3600000));
      const ts = d.toISOString();
      const { _id, _rev, ...rest } = r.doc;
      return { ...rest, _id: `log:${ts}-${rid()}`, ts };
    });
    const res = await safe(() => db.bulkDocs(reput), 'bulkDocs logs');
    logsKept = (res || []).filter(x => x.ok).length;
    const del = await safe(() => db.bulkDocs(logRows.map(r => ({ _id: r.doc._id, _rev: r.doc._rev, _deleted: true }))), 'bulkDocs delete logs');
    logsRemoved = (del || []).filter(x => x.ok).length;
  }

  await safe(() => invalidateTaskCache(), 'invalidateTaskCache');

  // ── Report what actually landed, not what was asked for ──────────────────
  const got = { spaces: spaces.length, projects: projects.length, tasks: allTasks.length, ...counts, logs: logsKept };
  const mismatches = Object.entries(TARGET)
    .filter(([k]) => k in got)
    .filter(([k, want]) => got[k] !== want)
    .map(([k, want]) => `${k}: wanted ${want}, got ${got[k]}`);

  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `done in ${secs}s — ${got.spaces} spaces (+ an emptied Unsorted, "${archiveSpace.name}" holds ${archivedProjects} archived projects), ` +
    `${got.projects} projects (+2 from template) with every column populated, ${got.tasks} tasks: ` +
    `${got.checklists} checklists, ${got.customValues} custom values, ` +
    `${got.recurring} recurring (${got.recurringInterval} interval, ${got.recurringWeekdays} weekdays-only), ` +
    `${got.reminders} reminders, ${got.pinned} pinned, ${got.archived} archived, ${got.trashed} trashed, ` +
    `${got.attachments} attachments, ${got.relatedLinks} related links, ${got.blockedBy} blocked-by, ` +
    `${logsKept} logs spread over ${LOG_DAYS} days (${logsRemoved} originals removed).`
  );
  if (mismatches.length) console.warn('seed: MISSED TARGETS —\n  ' + mismatches.join('\n  '));
  if (failures) console.warn(`seed: ${failures} write(s) failed, see warnings above`);
  console.log('Reload the page to see it.');
})();
