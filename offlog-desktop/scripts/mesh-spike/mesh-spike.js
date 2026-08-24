// Mesh-sync spike — does the topology hold up against real NyxDB?
//
//   node mesh-spike.js
//
// Answers the questions that decide the mesh-sync design, before any app
// code is written. Everything below runs against two REAL NyxDB instances
// over HTTP; nothing here is mocked, because the two NyxDB bugs Offlog has
// already hit (`_bulk_get` on tombstones, `seq=0` on a fresh database) were
// both invisible to in-memory tests and only appeared against a live
// server.
//
// The claims under test:
//
//   S1  Three-way convergence. A writes, B writes, both end up everywhere.
//   S2  A client paired with ONE host sees data written to the OTHER.
//       This is the whole point: if it holds, a phone needs credentials
//       for a single host, not for every PC.
//   S3  Concurrent writers into one NyxDB don't lose or corrupt writes.
//   S4  A conflicting edit made on two peers while apart survives as a
//       real conflict rather than one side being silently dropped.
//
// NyxDB cannot initiate replication today (no `_replicate`, no
// `_replicator` — its routes are the source/target set only), so the
// peer-to-peer link here is driven by a client. That is deliberate: it
// tests the design that needs NO NyxDB change. If these pass, extending
// NyxDB becomes an optimisation rather than a prerequisite.
//
// Self-contained: spawns its own instances on free ports, into temp data
// directories, and cleans both up on every exit path.

const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP = path.resolve(__dirname, '..', '..', '..', 'offlog-app');
const PouchDB = require(path.join(APP, 'node_modules', 'pouchdb'));
PouchDB.plugin(require(path.join(APP, 'node_modules', 'pouchdb-adapter-memory')));

const BINARY = path.resolve(__dirname, '..', '..', 'vendor', 'nyxdb-win', 'nyxdb.exe');
const USER = 'spike';
const PASS = 'spikepass1234';
const DB = 'offlog';

const spawned = [];
const tempDirs = [];

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

// NyxDB doesn't open its socket until it is ready to serve, so a
// successful connect is a sufficient readiness signal (same reasoning as
// sync_host.rs's own port poll).
const waitForPort = async (port, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const up = await new Promise(resolve => {
      const s = net.connect(port, '127.0.0.1');
      // destroy() takes an optional ERROR, not a callback -- passing
      // resolve here connects successfully and then never resolves.
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => { s.destroy(); resolve(false); });
    });
    if (up) return;
    if (Date.now() > deadline) throw new Error(`nyxdb on :${port} never came up`);
    await new Promise(r => setTimeout(r, 150));
  }
};

async function startNyx(label) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `nyx-spike-${label}-`));
  tempDirs.push(dataDir);
  // .current_dir() matters here exactly as it does in sync_host.rs:
  // without it the process binds a different port than NYXDB_ADDR asked for.
  const child = spawn(BINARY, [], {
    cwd: path.dirname(BINARY),
    env: {
      ...process.env,
      NYXDB_ADDR: `127.0.0.1:${port}`,
      NYXDB_DATA: dataDir,
      NYXDB_USER: USER,
      NYXDB_PASSWORD: PASS,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  spawned.push(child);
  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });
  child.on('exit', code => { if (code !== 0 && code !== null) console.error(`nyx${label} exited ${code}: ${stderr}`); });
  await waitForPort(port).catch(err => { throw new Error(`${err.message}
${stderr}`); });
  const url = `http://127.0.0.1:${port}/${DB}`;
  const remote = new PouchDB(url, { auth: { username: USER, password: PASS } });
  await remote.info(); // creates the database
  return { label, port, url, remote };
}

function cleanup() {
  for (const c of spawned) { try { c.kill(); } catch { /* already gone */ } }
  for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

const mem = name => new PouchDB(name, { adapter: 'memory' });
const once = (src, dst) => new Promise((resolve, reject) =>
  src.replicate.to(dst).on('complete', resolve).on('error', reject));
const both = async (a, b) => { await once(a, b); await once(b, a); };

const ids = async db => (await db.allDocs()).rows.map(r => r.id).sort();

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  if (!fs.existsSync(BINARY)) {
    console.error(`nyxdb.exe not found at ${BINARY}\nRun offlog-desktop/scripts/fetch-nyxdb-win.ps1 first.`);
    process.exit(2);
  }

  console.log('starting two NyxDB instances...');
  const nyx1 = await startNyx('1');
  const nyx2 = await startNyx('2');
  console.log(`  nyx1 :${nyx1.port}\n  nyx2 :${nyx2.port}\n`);

  // Two PCs, each with its own local database and its own sidecar, plus a
  // phone that only ever talks to nyx1.
  const pcA = mem('pcA');
  const pcB = mem('pcB');
  const phone = mem('phone');

  console.log('S1  three-way convergence');
  await pcA.put({ _id: 'task:from-a', title: 'written on A' });
  await pcB.put({ _id: 'task:from-b', title: 'written on B' });
  await both(pcA, nyx1.remote);
  await both(pcB, nyx2.remote);
  await both(nyx1.remote, nyx2.remote);   // the peer link, client-driven
  await both(pcA, nyx1.remote);
  await both(pcB, nyx2.remote);
  const a = await ids(pcA), b = await ids(pcB);
  check('A has both docs', a.includes('task:from-a') && a.includes('task:from-b'), a.join(','));
  check('B has both docs', b.includes('task:from-a') && b.includes('task:from-b'), b.join(','));

  console.log('\nS2  a client paired with ONE host sees the other host\'s data');
  await both(phone, nyx1.remote);
  const p = await ids(phone);
  check('phone (nyx1 only) has B\'s doc', p.includes('task:from-b'), p.join(','));

  console.log('\nS3  concurrent writers into one NyxDB');
  const w1 = mem('w1'), w2 = mem('w2');
  await Promise.all(Array.from({ length: 25 }, (_, i) => w1.put({ _id: `task:w1-${i}`, n: i })));
  await Promise.all(Array.from({ length: 25 }, (_, i) => w2.put({ _id: `task:w2-${i}`, n: i })));
  const errs = [];
  await Promise.all([
    once(w1, nyx1.remote).catch(e => errs.push(`w1: ${e.message}`)),
    once(w2, nyx1.remote).catch(e => errs.push(`w2: ${e.message}`)),
  ]);
  check('both concurrent replications completed', errs.length === 0, errs.join(' | '));
  // NyxDB implements no _all_docs -- replication drives off _changes, so it
  // never needs one, and Offlog only ever calls allDocs on its LOCAL
  // database. Verify server contents by pulling into a fresh reader.
  const reader = mem('reader');
  await once(nyx1.remote, reader);
  const server = await ids(reader);
  const w1n = server.filter(id => id.startsWith('task:w1-')).length;
  const w2n = server.filter(id => id.startsWith('task:w2-')).length;
  check('no writes lost', w1n === 25 && w2n === 25, `w1=${w1n}/25 w2=${w2n}/25`);

  console.log('\nS4  a conflict made on two peers while apart survives');
  const shared = 'task:contested';
  await pcA.put({ _id: shared, title: 'seed' });
  await both(pcA, nyx1.remote);
  await both(nyx1.remote, nyx2.remote);
  await both(pcB, nyx2.remote);
  // partitioned: each edits its own copy
  const ra = await pcA.get(shared); await pcA.put({ ...ra, title: 'edited on A' });
  const rb = await pcB.get(shared); await pcB.put({ ...rb, title: 'edited on B' });
  await both(pcA, nyx1.remote);
  await both(pcB, nyx2.remote);
  await both(nyx1.remote, nyx2.remote);
  // BOTH peers must pull back after the link syncs. Re-pulling only into A
  // leaves B holding just its own revision, and "do they agree" then asks a
  // question neither side can answer yet.
  await both(pcA, nyx1.remote);
  await both(pcB, nyx2.remote);
  const doc = await pcA.get(shared, { conflicts: true });
  check('conflict preserved, not silently dropped', Array.isArray(doc._conflicts) && doc._conflicts.length === 1,
    `_conflicts=${JSON.stringify(doc._conflicts)}`);
  check('both peers agree on the winner',
    (await pcB.get(shared)).title === doc.title, `A=${doc.title} B=${(await pcB.get(shared)).title}`);

  console.log(`\n${failures === 0 ? 'all scenarios passed' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error('\nspike crashed:', err); process.exit(1); });
