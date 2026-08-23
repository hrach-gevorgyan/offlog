import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import db, {
  invalidateTaskCache, getConflicts, resolveConflict,
  getTasksForProject, deleteTask, addAttachment,
} from '../src/lib/db';
import type { ProjectDoc, SpaceDoc, TaskDoc } from '../src/lib/types';

// Everything else about sync is tested through mocks: sync.test.ts covers
// error classification and handler wiring, never a real replication. These
// tests run PouchDB's actual replicator between two independent databases —
// the app's own `db` standing in for this device, a second in-memory one for
// the other — so revision handling, conflicts, deletions and attachments are
// exercised for real rather than asserted about.
const PouchDB = (globalThis as { PouchDB?: PouchDB.Static }).PouchDB!;

let peer: PouchDB.Database;
let peerName = 0;

// A conflict-manufacturing run leaves losing leaves that allDocs' winner-only
// view never returns, so every revision is removed explicitly — the same gap
// db.test.ts documents for its own conflict test.
async function wipe(target: PouchDB.Database) {
  const all = await target.allDocs({ include_docs: true, conflicts: true });
  const dels = all.rows.map(r => ({ ...(r.doc as Record<string, unknown>), _deleted: true }));
  if (dels.length) await target.bulkDocs(dels as never);
  for (const row of all.rows) {
    for (const rev of (row.doc as { _conflicts?: string[] })?._conflicts ?? []) {
      try { await target.remove(row.id, rev); } catch { /* already gone */ }
    }
  }
}

beforeEach(async () => {
  await wipe(db);
  invalidateTaskCache();
  peer = new PouchDB(`peer-${peerName++}`, { adapter: 'memory' });
});

afterEach(async () => { await peer.destroy(); });

const push = () => PouchDB.replicate(db, peer);
const pull = () => PouchDB.replicate(peer, db);
const both = async () => { await push(); await pull(); };

function mkSpace(): SpaceDoc {
  return {
    _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280',
    position: 0, updated_at: '2026-01-01T00:00:00.000Z', source: 'pc',
  };
}
function mkProject(): ProjectDoc {
  return {
    _id: 'project:p1', type: 'project', space_id: 'space:unsorted', name: 'Shared',
    position: 0, columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }],
    default_view: 'kanban', updated_at: '2026-01-01T00:00:00.000Z', source: 'pc',
  };
}
function mkTask(id = 'task:t1', extra: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: id, type: 'task', project_id: 'project:p1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Shared task', body: '', priority: 2,
    due_date: null, reminder_at: null, tags: [], position: 1024, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'pc', ...extra,
  };
}

describe('replication — convergence', () => {
  it('carries a task to the other device intact', async () => {
    await db.put(mkSpace()); await db.put(mkProject()); await db.put(mkTask());

    await push();

    const there = await peer.get<TaskDoc>('task:t1');
    expect(there.title).toBe('Shared task');
    // the positional-done rule reads column_id, so it has to survive the trip
    expect(there.column_id).toBe('col:todo');
  });

  it('converges when each device edits a different task', async () => {
    await db.put(mkSpace()); await db.put(mkProject());
    await db.put(mkTask('task:mine', { title: 'Mine' }));
    await both();
    await peer.put(mkTask('task:theirs', { title: 'Theirs' }));

    await both();

    const here = await getTasksForProject('project:p1');
    const titles = here.map(t => t.title).sort();
    expect(titles).toEqual(['Mine', 'Theirs']);
    expect((await peer.allDocs({ startkey: 'task:', endkey: 'task:￰' })).rows).toHaveLength(2);
  });

  it('replicates an attachment with its bytes, not just the metadata', async () => {
    await db.put(mkSpace()); await db.put(mkProject()); await db.put(mkTask());
    const payload = 'attachment payload';
    const base64Data = Buffer.from(payload, 'utf8').toString('base64');
    await addAttachment('task:t1', { filename: 'note.txt', base64Data, size: payload.length });

    await push();

    const there = await peer.get<TaskDoc>('task:t1', { attachments: true }) as TaskDoc & {
      _attachments?: Record<string, { data: string }>;
    };
    const key = there.attachments?.[0]?.key;
    expect(key).toBeTruthy();
    // bytes present, not a {stub:true} placeholder — a stub-only copy is what
    // made backups unrestorable before
    expect(there._attachments?.[key!]?.data).toBeTruthy();
  });
});

describe('replication — deletions', () => {
  // Tasks are soft-deleted so the tombstone still syncs as a normal document;
  // a hard remove would replicate as an absence and lose the changelog trail.
  it('propagates a soft delete as a document, not a removal', async () => {
    await db.put(mkSpace()); await db.put(mkProject()); await db.put(mkTask());
    await push();

    await deleteTask('task:t1');
    await push();

    const there = await peer.get<TaskDoc>('task:t1');
    expect(there.deleted).toBe(true);
    expect(there.title).toBe('Shared task');
  });
});

describe('replication — conflicts', () => {
  // Both devices edit the same task while apart. On reconnect PouchDB keeps
  // both revisions and picks a deterministic winner; the loser stays as a
  // live branch until something resolves it.
  async function diverge() {
    await db.put(mkSpace()); await db.put(mkProject()); await db.put(mkTask());
    await both();

    const mine = await db.get<TaskDoc>('task:t1');
    await db.put({ ...mine, title: 'Renamed here' });
    const theirs = await peer.get<TaskDoc>('task:t1');
    await peer.put({ ...theirs, title: 'Renamed there' });

    await pull();          // bring their branch in alongside ours
    invalidateTaskCache();
  }

  it('surfaces a real divergence as a conflict', async () => {
    await diverge();

    const conflicts = await getConflicts();
    expect(conflicts.map(c => c.docId)).toContain('task:t1');
  });

  it('leaves no live conflict branch after resolving', async () => {
    await diverge();

    await resolveConflict('task:t1', 'current');

    const doc = await db.get<TaskDoc>('task:t1', { conflicts: true }) as TaskDoc & { _conflicts?: string[] };
    expect(doc._conflicts ?? []).toHaveLength(0);
    expect(await getConflicts()).toHaveLength(0);
  });

  it('adopts the other device\'s revision when asked to', async () => {
    await diverge();
    const before = await db.get<TaskDoc>('task:t1', { conflicts: true }) as TaskDoc & { _conflicts?: string[] };
    const otherRev = before._conflicts![0];
    const otherTitle = (await db.get<TaskDoc>('task:t1', { rev: otherRev })).title;

    await resolveConflict('task:t1', 'other', otherRev);

    const after = await db.get<TaskDoc>('task:t1', { conflicts: true }) as TaskDoc & { _conflicts?: string[] };
    expect(after.title).toBe(otherTitle);
    expect(after._conflicts ?? []).toHaveLength(0);
  });

  it('keeps the resolution after replicating again', async () => {
    await diverge();
    await resolveConflict('task:t1', 'current');
    const resolved = (await db.get<TaskDoc>('task:t1')).title;

    await both();
    invalidateTaskCache();

    const here = await db.get<TaskDoc>('task:t1', { conflicts: true }) as TaskDoc & { _conflicts?: string[] };
    expect(here.title).toBe(resolved);
    expect(here._conflicts ?? []).toHaveLength(0);
    expect((await peer.get<TaskDoc>('task:t1')).title).toBe(resolved);
  });
});

let seedN = 0;
const seedId = () => `space:seed${seedN++}`;

describe('replication — first pair with a pristine seed', () => {
  // A freshly installed device seeds space:unsorted / project:draft with the
  // same fixed ids the host already has, so a first sync collides on every
  // seeded document rather than adopting the host's copies.
  it('collides when both devices carry their own default seed', async () => {
    const id = seedId();
    await db.put({ ...mkSpace(), _id: id });
    await peer.put({ ...mkSpace(), _id: id, name: 'Unsorted (theirs)', source: 'phone' });

    await pull();
    invalidateTaskCache();

    const doc = await db.get<SpaceDoc>(id, { conflicts: true }) as SpaceDoc & { _conflicts?: string[] };
    expect(doc._conflicts ?? []).toHaveLength(1);
  });

  it('adopts the host copy cleanly when the local seed is cleared first', async () => {
    const id = seedId();
    await peer.put({ ...mkSpace(), _id: id, name: 'Unsorted (theirs)', source: 'phone' });

    // nothing local to collide with — the pristine seed was removed first
    await pull();
    invalidateTaskCache();

    const doc = await db.get<SpaceDoc>(id, { conflicts: true }) as SpaceDoc & { _conflicts?: string[] };
    expect(doc.name).toBe('Unsorted (theirs)');
    expect(doc._conflicts ?? []).toHaveLength(0);
  });
});
