// Demo workspace for test builds (`npm run build:demo`, VITE_DEMO_DATA=1):
// the same persona and data as scripts/seed-demo.js — a developer with a
// family, building a new house — written through the app's own db.ts
// functions so it can't drift from their invariants. Runs once per install
// (store.ts guards it with a localStorage flag). A normal build never
// imports this file: the branch in store.ts is compiled out.
import {
  getSpaces, createSpace, createProject, updateProject, archiveProject,
  createTask, updateTask, archiveTask, deleteTask, linkRelatedTask,
  getCustomFieldDefs, addCustomFieldDef,
} from './db';
import type { ProjectDoc, TaskDoc, CustomFieldDef } from './types';
import { localDateStr } from './utils';

type Overrides = Parameters<typeof createTask>[4];

export async function seedDemo(): Promise<void> {
  const dueIn = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return localDateStr(d); };
  const dueAgo = (days: number) => dueIn(-days);
  const today = () => dueIn(0);
  const at9am = (date: string) => new Date(`${date}T09:00:00`).toISOString();
  const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch { return null; } };

  // Spaces (reuses ones the first-run seed already made, e.g. Work).
  const byName = Object.fromEntries((await getSpaces()).map(s => [s.name, s]));
  const space = async (name: string, color: string, icon: string) =>
    byName[name] ?? (byName[name] = await createSpace(name, color, icon));
  const spWork = await space('Work', '#3B82F6', 'briefcase');
  const spHouse = await space('New House', '#F59E0B', 'home');
  const spFamily = await space('Family', '#EC4899', 'heart');
  const spPersonal = await space('Personal', '#8B5CF6', 'code');

  // Every status list's last entry is the positional "done" state.
  const KANBAN = ['Backlog', 'In Progress', 'Review', 'Done'];
  const SIMPLE = ['To Do', 'Doing', 'Done'];
  const BUILD = ['Planning', 'Foundation', 'Framing', 'Finishing', 'Done'];
  const PACK = ['To Pack', 'Packed', 'Unpacked'];
  const project = async (spaceId: string, name: string, cols: string[] | null): Promise<ProjectDoc> => {
    const p = await createProject(spaceId, name);
    if (!cols) return p;
    return updateProject(p._id, { columns: cols.map(n => ({ id: `col:${Math.random().toString(36).slice(2, 10)}`, name: n })) });
  };

  // Custom fields
  let fields = await getCustomFieldDefs();
  const field = async (name: string, type: CustomFieldDef['type'], options?: string[]) => {
    let f = fields.find(x => x.name === name);
    if (!f) { await safe(() => addCustomFieldDef(name, type, options)); fields = await getCustomFieldDefs(); f = fields.find(x => x.name === name); }
    return f;
  };
  const fBudget = await field('Budget', 'number');
  const fVendor = await field('Vendor', 'select', ['ABC Contractors', 'City Electric Co', 'Home Depot', 'IKEA', 'Personal']);
  const fFollowUp = await field('Follow-up by', 'date');
  const values = (pairs: [CustomFieldDef | undefined, string | number][]) => {
    const out: Record<string, string | number> = {};
    for (const [f, v] of pairs) if (f) out[f.id] = v;
    return out;
  };

  const pSprint = await project(spWork._id, 'Q4 Product Sprint', KANBAN);
  const pMigration = await project(spWork._id, 'API Platform Migration', SIMPLE);
  const pOffsite = await project(spWork._id, 'Team Offsite Planning', null);
  const pHouse = await project(spHouse._id, 'New House Build', BUILD);
  const pBackyard = await project(spHouse._id, 'Backyard & Landscaping', SIMPLE);
  const pMoveIn = await project(spHouse._id, 'Move-In Checklist', PACK);
  const pOldApt = await project(spHouse._id, 'Old Apartment Move-Out', SIMPLE);
  const pEmma = await project(spFamily._id, "Emma's School Year", null);
  const pLiam = await project(spFamily._id, "Liam's Soccer Season", SIMPLE);
  const pTrip = await project(spFamily._id, 'Summer Family Trip', null);
  const pMarathon = await project(spPersonal._id, 'Marathon Training', SIMPLE);
  const pWood = await project(spPersonal._id, 'Weekend Woodworking', null);
  const pRecipe = await project(spPersonal._id, 'Recipe App', KANBAN);

  const col = (p: ProjectDoc, name: string) => p.columns.find(c => c.name === name)?.id ?? p.columns[0].id;
  const first = (p: ProjectDoc) => p.columns[0].id;
  const last = (p: ProjectDoc) => p.columns[p.columns.length - 1].id;
  const task = (p: ProjectDoc, colId: string, title: string, o?: Overrides): Promise<TaskDoc | null> =>
    safe(() => createTask(p._id, p.space_id, colId, title, o));

  // Work
  await task(pSprint, first(pSprint), 'Fix login redirect bug', { priority: 3, due_date: today(), tags: ['urgent', 'code-review'] });
  await task(pSprint, first(pSprint), 'Set up CI pipeline', { priority: 2, due_date: dueIn(3), tags: ['code-review'] });
  await task(pSprint, first(pSprint), 'Interview 5 users', { priority: 2, due_date: dueIn(7) });
  await task(pSprint, first(pSprint), 'Write API docs', { priority: 1, tags: ['code-review'], checklist: [{ text: 'Draft outline', done: true }, { text: 'Review with team', done: false }, { text: 'Publish', done: false }] });
  const tAuth = await task(pSprint, col(pSprint, 'In Progress'), 'Refactor auth module', { priority: 3, due_date: dueAgo(2), tags: ['urgent', 'code-review'] });
  await task(pSprint, col(pSprint, 'Review'), 'Review pull request #482', { priority: 2, due_date: dueIn(1), tags: ['code-review'] });
  await task(pMigration, first(pMigration), 'Migrate database schema', { priority: 3, due_date: dueIn(10), tags: ['code-review'] });
  await task(pMigration, first(pMigration), 'Update dependency versions', { priority: 1 });
  await task(pMigration, first(pMigration), 'Plan sprint retro', { priority: 1, due_date: dueIn(2) });
  await task(pMigration, col(pMigration, 'Doing'), 'Draft rollback plan', { priority: 2, due_date: dueIn(5), body: 'Check with DevOps before finalizing.' });
  await task(pOffsite, first(pOffsite), 'Book offsite venue', { priority: 2, due_date: dueIn(14), tags: ['waiting'] });
  await task(pOffsite, first(pOffsite), 'Send travel itinerary', { priority: 1, due_date: dueIn(12) });
  await task(pOffsite, first(pOffsite), 'Order catering', { priority: 1, due_date: dueIn(13) });

  // New House
  const tQuotes = await task(pHouse, first(pHouse), 'Get contractor quotes', {
    priority: 3, due_date: today(), tags: ['contractor', 'urgent'],
    custom_values: values([[fBudget, 8500], [fVendor, 'ABC Contractors']]),
    checklist: [{ text: 'Call 3 contractors', done: true }, { text: 'Compare bids', done: true }, { text: 'Pick one', done: false }],
  });
  await task(pHouse, first(pHouse), 'Pick paint colors', { priority: 2, due_date: dueIn(4), tags: ['shopping'] });
  const tFlooring = await task(pHouse, col(pHouse, 'Foundation'), 'Order new flooring', {
    priority: 3, due_date: dueAgo(1), tags: ['contractor', 'urgent'],
    custom_values: values([[fBudget, 4200], [fVendor, 'Home Depot']]),
    body: 'Contractor said tile delivery pushed back — confirm new date before demo day.',
  });
  await task(pHouse, col(pHouse, 'Framing'), 'Schedule electrical inspection', {
    priority: 3, due_date: dueIn(6), tags: ['appointment', 'contractor'],
    custom_values: values([[fVendor, 'City Electric Co'], [fFollowUp, dueIn(6)]]), reminder_at: at9am(dueIn(6)),
  });
  const tCabinet = await task(pHouse, col(pHouse, 'Finishing'), 'Choose cabinet hardware', { priority: 1, due_date: dueIn(20), tags: ['shopping'] });
  await task(pHouse, col(pHouse, 'Framing'), 'Check on construction progress', { priority: 2, due_date: today(), recurrence: 'weekly' });
  await task(pHouse, col(pHouse, 'Finishing'), 'Pay contractor invoice', { priority: 2, due_date: dueIn(3), tags: ['contractor'], recurrence: 'monthly' });
  const tFloorPlan = await task(pHouse, last(pHouse), 'Approve floor plan', { priority: 2 });
  const tKitchen = await task(pHouse, last(pHouse), 'Finalize kitchen layout', { priority: 2 });
  await task(pBackyard, first(pBackyard), 'Design backyard layout', { priority: 1, due_date: dueIn(25) });
  await task(pBackyard, first(pBackyard), 'Get sod delivery quote', { priority: 2, due_date: dueIn(15), tags: ['contractor', 'shopping'], custom_values: values([[fBudget, 1200], [fVendor, 'Home Depot']]) });
  await task(pBackyard, col(pBackyard, 'Doing'), 'Plant new trees', { priority: 1, recurrence: 'daily', due_date: today(), tags: ['quick-win'] });
  await task(pMoveIn, first(pMoveIn), 'Pack kitchen boxes', { priority: 2, due_date: dueIn(30), checklist: [{ text: 'Label boxes', done: false }, { text: 'Wrap fragile items', done: false }, { text: 'Set aside essentials', done: false }] });
  await task(pMoveIn, first(pMoveIn), 'Forward mail to new address', { priority: 2, due_date: dueIn(28), tags: ['urgent'] });
  await task(pMoveIn, first(pMoveIn), 'Set up internet at new house', { priority: 3, due_date: dueIn(27), tags: ['appointment'] });
  for (const t of ['Return apartment keys', 'Final walkthrough with landlord', 'Cancel apartment insurance']) await task(pOldApt, last(pOldApt), t, { priority: 1 });
  await safe(() => archiveProject(pOldApt._id));

  // Family
  await task(pEmma, first(pEmma), 'Buy school supplies', { priority: 2, due_date: dueIn(3), tags: ['shopping', 'school'], checklist: [{ text: 'Notebooks', done: true }, { text: 'Backpack', done: false }, { text: 'Lunchbox', done: false }] });
  const tSlip = await task(pEmma, first(pEmma), 'Sign permission slip — field trip', { priority: 3, due_date: dueIn(1), tags: ['urgent', 'school'], reminder_at: at9am(dueIn(1)) });
  await task(pEmma, first(pEmma), 'Parent-teacher conference', { priority: 2, due_date: dueIn(9), tags: ['appointment', 'school'] });
  await task(pEmma, first(pEmma), 'Help with science fair project', { priority: 2, due_date: dueIn(14), tags: ['school'] });
  const tSoccer = await task(pLiam, first(pLiam), 'Register for spring league', { priority: 3, due_date: dueIn(2), tags: ['urgent', 'family'], reminder_at: at9am(dueIn(2)) });
  await task(pLiam, first(pLiam), 'Buy new cleats', { priority: 1, due_date: dueIn(6), tags: ['shopping'] });
  await task(pLiam, first(pLiam), 'Team snack schedule — sign up', { priority: 1, due_date: dueIn(4), tags: ['family'] });
  await task(pLiam, col(pLiam, 'Doing'), 'Pick up Liam from practice', { priority: 2, due_date: today(), recurrence: 'weekly' });
  const tFlights = await task(pTrip, first(pTrip), 'Book flights', { priority: 3, due_date: dueIn(20), tags: ['urgent'] });
  const tPassports = await task(pTrip, first(pTrip), 'Renew passports', { priority: 3, due_date: dueAgo(3), tags: ['urgent'], body: "Kids' passports expire before the trip — need to expedite." });
  await task(pTrip, first(pTrip), 'Research kid-friendly hotels', { priority: 1, due_date: dueIn(18) });

  // Personal
  await task(pMarathon, first(pMarathon), 'Long run — 12 miles', { priority: 2, due_date: today(), tags: ['quick-win'], recurrence: 'weekly' });
  await task(pMarathon, first(pMarathon), 'Buy new running shoes', { priority: 1, due_date: dueIn(5), tags: ['shopping'], body: 'Old ones have 400+ miles on them.' });
  await task(pMarathon, first(pMarathon), 'Sign up for half marathon', { priority: 2, due_date: dueIn(10) });
  await task(pWood, first(pWood), "Build kids' bookshelf", { priority: 1, due_date: dueIn(12), checklist: [{ text: 'Cut wood', done: true }, { text: 'Sand edges', done: false }, { text: 'Stain', done: false }, { text: 'Assemble', done: false }] });
  await task(pWood, first(pWood), 'Buy wood stain', { priority: 1, due_date: dueIn(6), tags: ['shopping'] });
  await task(pRecipe, first(pRecipe), 'Write recipe parser', { priority: 2, due_date: dueIn(8), tags: ['code-review', 'quick-win'] });
  await task(pRecipe, first(pRecipe), 'Design app icon', { priority: 1 });
  await task(pRecipe, first(pRecipe), 'Set up ingredient database', { priority: 2, due_date: dueIn(11), tags: ['code-review'] });

  for (const t of [tQuotes, tAuth, tSlip, tSoccer]) if (t) await safe(() => updateTask(t._id, { pinned: true }));
  for (const [a, b] of [[tQuotes, tFlooring], [tCabinet, tFlooring], [tFlights, tPassports]] as const) if (a && b) await safe(() => linkRelatedTask(a._id, b._id));
  for (const t of [tFloorPlan, tKitchen]) if (t) await safe(() => archiveTask(t._id));
  for (const [p, title] of [[pHouse, 'Consider open floor plan'], [pHouse, 'Look into pool installation'], [pWood, 'Sign up for pottery class'], [pOffsite, 'Order company swag']] as const) {
    const t = await task(p, first(p), title, { priority: 1 });
    if (t) await safe(() => deleteTask(t._id));
  }
}
