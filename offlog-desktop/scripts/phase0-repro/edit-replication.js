// Edits after the first sync, over HTTP, against a real NyxDB binary.
//
// Two PouchDB replicas sync live through NyxDB the way Offlog's phone and
// desktop do. An edit to an already-synced doc must reach the other replica
// as a child of the copy it has, never as a sibling: a server whose read
// paths drop `_revisions` turns every such edit into a phantom conflict
// (NyxDB before v0.1.7). A first full pull can't show this; every doc is at
// rev 1 there.
//
// Then attachments: bytes and Content-Type must survive the sidecar being
// restarted on the same data folder (NyxDB v0.1.8 keeps attachment bytes as
// files under <data>/att/), read both raw over HTTP and by a fresh replica.
//
// Usage: node edit-replication.js [path\to\nyxdb.exe]
// Starts its own NyxDB on a free port with a temporary data folder, stops
// that process by PID and deletes the folder. Exit code 0 = pass.
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const NM = path.join(__dirname, '..', '..', '..', 'offlog-app', 'node_modules');
const PouchDB = require(path.join(NM, 'pouchdb')).plugin(require(path.join(NM, 'pouchdb-adapter-memory')));

const BIN = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'vendor', 'nyxdb-win', 'nyxdb.exe'));
const USER = 'test', PASS = 'edit-replication-' + process.pid;
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function until(what, check, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    try { if (await check()) return; } catch {}
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}
const fail = msg => { throw new Error(msg); };

async function main() {
  if (!fs.existsSync(BIN)) fail(`no NyxDB binary at ${BIN}`);
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'nyxdb-edit-repl-'));
  const base = `http://127.0.0.1:${port}`;
  const start = () => spawn(BIN, [], {
    cwd: data,
    env: { ...process.env, NYXDB_ADDR: `127.0.0.1:${port}`, NYXDB_DATA: data, NYXDB_USER: USER, NYXDB_PASSWORD: PASS },
    stdio: 'ignore',
  });
  const stop = async c => { c.kill(); await new Promise(r => (c.exitCode !== null ? r() : c.once('exit', r))); };
  let child = start();
  const syncs = [];
  try {
    await until('NyxDB to listen', async () => (await fetch(base + '/')).ok);
    // The desktop sidecar creates the database itself (sync_host.rs ensure_database).
    const put = await fetch(base + '/offlog', { method: 'PUT', headers: { Authorization: AUTH } });
    if (!put.ok && put.status !== 412) fail(`PUT /offlog returned ${put.status}`);

    const remote = () => new PouchDB(base + '/offlog', { auth: { username: USER, password: PASS } });
    const a = new PouchDB('phone' + Date.now(), { adapter: 'memory', auto_compaction: true });
    const b = new PouchDB('desktop' + Date.now(), { adapter: 'memory', auto_compaction: true });
    for (const db of [a, b]) syncs.push(db.sync(remote(), { live: true, retry: true }));

    const id = 'task:edit-replication';
    const has = (db, rev) => async () => (await db.get(id))._rev === rev;
    let r = await a.put({ _id: id, type: 'task', title: 'created on A' });
    await until('B to receive the new task', has(b, r.rev));

    for (const title of ['edit 1 on A', 'edit 2 on A']) {
      const doc = await a.get(id);
      r = await a.put({ ...doc, title });
      await until(`B to receive "${title}"`, has(b, r.rev));
    }
    const onB = await b.get(id, { conflicts: true, revs: true });
    if (onB._conflicts?.length) fail(`B holds phantom conflicts after edits on A: ${onB._conflicts.join(', ')}`);
    const fromA = await a.get(id, { revs: true });
    if (JSON.stringify(onB._revisions) !== JSON.stringify(fromA._revisions)) {
      fail(`B's history ${JSON.stringify(onB._revisions)} differs from A's ${JSON.stringify(fromA._revisions)}`);
    }

    // The other direction: B edits, A must not fork either.
    const docB = await b.get(id);
    r = await b.put({ ...docB, title: 'edit on B' });
    await until('A to receive the edit from B', has(a, r.rev));
    const onA = await a.get(id, { conflicts: true });
    if (onA._conflicts?.length) fail(`A holds phantom conflicts after an edit on B: ${onA._conflicts.join(', ')}`);

    // Deletion: B must end with one leaf, and that leaf deleted.
    const del = await a.remove(await a.get(id));
    await until('B to receive the delete', async () => {
      const leaves = await b.get(id, { open_revs: 'all' });
      return leaves.some(l => l.ok?._rev === del.rev);
    });
    const leaves = await b.get(id, { open_revs: 'all' });
    if (leaves.length !== 1 || !leaves[0].ok?._deleted) {
      fail(`after a delete on A, B has ${leaves.length} leaves: ${JSON.stringify(leaves.map(l => l.ok ? { rev: l.ok._rev, deleted: !!l.ok._deleted } : l))}`);
    }
    console.log('PASS: edits and a delete replicated over HTTP without phantom conflicts');

    // Attachments across a restart of the sidecar.
    const photos = {
      'att:png': { content_type: 'image/png', bytes: Buffer.from(Array.from({ length: 300000 }, (_, i) => (i * 31 + 7) % 256)) },
      'att:svg': { content_type: 'image/svg+xml', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>') },
    };
    const attId = 'task:attachments';
    const att = await a.put({
      _id: attId, type: 'task', title: 'with photos',
      _attachments: Object.fromEntries(Object.entries(photos).map(([n, p]) => [n, { content_type: p.content_type, data: p.bytes.toString('base64') }])),
    });
    await until('B to receive the photos', async () => (await b.get(attId))._rev === att.rev);
    for (const s of syncs.splice(0)) s.cancel();
    // NyxDB publishes a write to _changes before flushing it to disk, so B can
    // see the photos while they're still only in memory and the kill below
    // would lose them. Any later write is flushed before its "ok", and a flush
    // persists everything written before it.
    const barrier = await fetch(base + '/offlog/_local/flush-barrier', {
      method: 'PUT', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!barrier.ok) fail(`PUT _local/flush-barrier returned ${barrier.status}`);

    await stop(child);
    child = start();
    await until('NyxDB to listen again', async () => (await fetch(base + '/')).ok);

    for (const [name, p] of Object.entries(photos)) {
      const res = await fetch(`${base}/offlog/${encodeURIComponent(attId)}/${encodeURIComponent(name)}`, { headers: { Authorization: AUTH } });
      if (!res.ok) fail(`after a restart, GET ${name} returned ${res.status}`);
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (type !== p.content_type) fail(`after a restart, ${name} came back as ${type}, not ${p.content_type}`);
      if (!Buffer.from(await res.arrayBuffer()).equals(p.bytes)) fail(`after a restart, ${name}'s bytes differ`);
    }
    const fresh = new PouchDB('fresh' + Date.now(), { adapter: 'memory' });
    await fresh.replicate.from(remote());
    const pulled = await fresh.get(attId, { attachments: true, binary: true });
    for (const [name, p] of Object.entries(photos)) {
      const got = pulled._attachments[name];
      if (got?.content_type !== p.content_type) fail(`a fresh replica got ${name} as ${got?.content_type}`);
      if (!Buffer.from(got.data).equals(p.bytes)) fail(`a fresh replica got different bytes for ${name}`);
    }
    // An edit after the restart that keeps the photos must not fork either.
    const edited = await b.put({ ...(await b.get(attId)), title: 'with photos, edited' });
    await b.replicate.to(remote());
    await a.replicate.from(remote());
    const onAatt = await a.get(attId, { conflicts: true });
    if (onAatt._rev !== edited.rev || onAatt._conflicts?.length) fail(`after a restart, A has ${onAatt._rev} with conflicts ${JSON.stringify(onAatt._conflicts ?? [])}`);
    console.log('PASS: attachment bytes and Content-Type survived a sidecar restart');
  } finally {
    for (const s of syncs) s.cancel();
    await stop(child);
    fs.rmSync(data, { recursive: true, force: true });
  }
}

// process.exit() while fetch's sockets are still closing aborts Node (exit
// 127 on Windows); a short wait lets a failure exit with 1.
main().then(() => process.exit(0), e => { console.error('FAIL:', e.message); setTimeout(() => process.exit(1), 200); });
