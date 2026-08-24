// What is actually in a real Offlog database?
//
//   node db-metrics.js                 measure this PC's own sync host
//   node db-metrics.js --url http://192.168.1.50:5984/offlog --user u --pass p
//   node db-metrics.js --json          machine-readable, for tracking over time
//
// roadmap.md's "real-scale metrics" item: it was never settled whether one
// person's task manager accumulates enough data for scale to matter. This
// answers that with numbers instead of an assumption, and gives the
// benchmarks a real shape to be sized against.
//
// Prints AGGREGATES ONLY -- counts, byte sizes, percentiles. No task titles,
// no note text, no tags, no credentials. Safe to paste into an issue.
//
// Reads the host's port and credentials from the desktop app's own
// sync-host.json, the same file sync_host.rs writes, so there is nothing to
// configure on the machine running the app.

const fs = require('node:fs');
const path = require('node:path');

const APP = path.resolve(__dirname, '..', '..', '..', 'offlog-app');
const PouchDB = require(path.join(APP, 'node_modules', 'pouchdb'));
PouchDB.plugin(require(path.join(APP, 'node_modules', 'pouchdb-adapter-memory')));

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
const asJson = argv.includes('--json');

function localHost() {
  const cfg = path.join(process.env.APPDATA ?? '', 'com.offlog.app', 'sync-host.json');
  if (!fs.existsSync(cfg)) return null;
  const { port, user, password } = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  return { url: `http://127.0.0.1:${port}/offlog`, user, password };
}

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
const kb = n => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const target = arg('--url')
    ? { url: arg('--url'), user: arg('--user'), password: arg('--pass') }
    : localHost();

  if (!target) {
    console.error('No sync-host.json found. Pass --url/--user/--pass, or run this on a PC with the desktop app installed.');
    process.exit(2);
  }

  const remote = new PouchDB(target.url, { auth: { username: target.user, password: target.password } });
  // Pull into memory and measure locally: NyxDB implements no _all_docs
  // (replication drives off _changes and never needs one), so a direct
  // query is not available -- the same reason mesh-spike.js verifies
  // through a reader instead of asking the server.
  const local = new PouchDB('metrics-scratch', { adapter: 'memory' });
  await new Promise((resolve, reject) =>
    remote.replicate.to(local).on('complete', resolve).on('error', reject));

  const all = await local.allDocs({ include_docs: true });

  const byType = {};
  const sizes = [];
  let activeTasks = 0, archivedTasks = 0, deletedTasks = 0;
  let attachmentCount = 0, attachmentBytes = 0;
  let noteChars = 0, tasksWithNotes = 0, checklistItems = 0, tasksWithChecklists = 0;
  let maxRevGen = 0, conflicted = 0;
  const tagSet = new Set();
  let totalBytes = 0;

  for (const row of all.rows) {
    const d = row.doc;
    if (!d) continue;
    const prefix = String(d._id).split(':')[0];
    byType[prefix] = (byType[prefix] ?? 0) + 1;

    const bytes = Buffer.byteLength(JSON.stringify(d));
    totalBytes += bytes;
    sizes.push(bytes);

    const gen = Number(String(d._rev).split('-')[0]);
    if (gen > maxRevGen) maxRevGen = gen;
    if (d._conflicts?.length) conflicted++;

    if (prefix === 'task') {
      if (d.deleted) deletedTasks++;
      else if (d.archived) archivedTasks++;
      else activeTasks++;
      for (const a of d.attachments ?? []) { attachmentCount++; attachmentBytes += a.size ?? 0; }
      if (d.notes) { tasksWithNotes++; noteChars += String(d.notes).length; }
      if (d.checklist?.length) { tasksWithChecklists++; checklistItems += d.checklist.length; }
      for (const t of d.tags ?? []) tagSet.add(t);
    }
  }

  sizes.sort((a, b) => a - b);
  const out = {
    docs: all.rows.length,
    byType,
    tasks: { active: activeTasks, archived: archivedTasks, deleted: deletedTasks },
    logs: byType.log ?? 0,
    attachments: { count: attachmentCount, bytes: attachmentBytes },
    tags: tagSet.size,
    notes: { tasksWith: tasksWithNotes, avgChars: tasksWithNotes ? Math.round(noteChars / tasksWithNotes) : 0 },
    checklists: { tasksWith: tasksWithChecklists, items: checklistItems },
    docBytes: { total: totalBytes, median: pct(sizes, 0.5), p95: pct(sizes, 0.95), max: sizes.at(-1) ?? 0 },
    revisions: { deepest: maxRevGen },
    conflicts: conflicted,
  };

  if (asJson) { console.log(JSON.stringify(out, null, 2)); return; }

  console.log(`\ndocuments        ${out.docs}`);
  for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${k + ':'}`.padEnd(17) + v);
  console.log(`\ntasks            ${activeTasks} active / ${archivedTasks} archived / ${deletedTasks} in trash`);
  console.log(`attachments      ${attachmentCount} files, ${kb(attachmentBytes)}`);
  console.log(`tags             ${tagSet.size} distinct`);
  console.log(`notes            ${tasksWithNotes} tasks, avg ${out.notes.avgChars} chars`);
  console.log(`checklists       ${tasksWithChecklists} tasks, ${checklistItems} items`);
  console.log(`\ndocument size    median ${kb(out.docBytes.median)} · p95 ${kb(out.docBytes.p95)} · max ${kb(out.docBytes.max)}`);
  console.log(`total JSON       ${kb(totalBytes)}`);
  console.log(`deepest revision gen ${maxRevGen}`);
  console.log(`open conflicts   ${conflicted}\n`);

  const benchTasks = Math.max(400, activeTasks + archivedTasks + deletedTasks);
  console.log(`perfGuard/perf.bench currently size to 400 tasks.`);
  console.log(`This database would need ${benchTasks} to be represented.\n`);
}

main().catch(err => { console.error('failed:', err.message ?? err); process.exit(1); });
