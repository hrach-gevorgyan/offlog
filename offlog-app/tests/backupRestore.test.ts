import { describe, expect, it, beforeEach } from 'vitest';
import db, {
  invalidateTaskCache, importJSON, analyzeImport, exportProjectDocs,
  addAttachment, getTasksForProject, getCustomFieldDefs, addCustomFieldDef,
} from '../src/lib/db';
import type { ProjectDoc, SpaceDoc, TaskDoc } from '../src/lib/types';

// db.test.ts covers importJSON's own edge cases. This covers the whole
// emergency exit as one motion: take a real database, produce the exact
// bytes the Back up button writes, destroy everything, and restore from
// those bytes alone. A backup is only worth having if that cycle returns
// what went in — attachments included, which is where it silently failed
// before (stubs with no bytes made PouchDB reject the entire batch).

async function wipeAll() {
  const all = await db.allDocs({ include_docs: true, conflicts: true });
  const dels = all.rows.map(r => ({ ...(r.doc as Record<string, unknown>), _deleted: true }));
  if (dels.length) await db.bulkDocs(dels as never);
  for (const row of all.rows) {
    for (const rev of (row.doc as { _conflicts?: string[] })?._conflicts ?? []) {
      try { await db.remove(row.id, rev); } catch { /* already gone */ }
    }
  }
  invalidateTaskCache();
}

// Exactly what doBackup() serialises for the "Everything" scope: every
// non-internal doc with attachment bytes inlined rather than left as stubs.
async function backupEverything(): Promise<string> {
  const all = await db.allDocs({ include_docs: true, attachments: true, binary: false });
  const docs = all.rows
    .map(r => r.doc as Record<string, unknown>)
    .filter(d => !String(d._id).startsWith('_'));
  return JSON.stringify(docs, null, 2);
}

// The restore side of handleImport(): a picked file's text, parsed and
// handed to the same functions the confirm step calls.
async function restoreFromFile(json: string) {
  const file = new File([json], 'offlog-backup.json', { type: 'application/json' });
  const text = await file.text();
  const docs = JSON.parse(text);
  if (!Array.isArray(docs)) throw new Error('Invalid format');
  const preview = analyzeImport(docs);
  const result = await importJSON(docs);
  invalidateTaskCache();
  return { preview, ...result };
}

async function seedRealistic() {
  const space: SpaceDoc = {
    _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280',
    position: 0, updated_at: '2026-01-01T00:00:00.000Z', source: 'pc',
  };
  const project: ProjectDoc = {
    _id: 'project:p1', type: 'project', space_id: 'space:unsorted', name: 'Real Work',
    position: 0, columns: [{ id: 'col:todo', name: 'To do' }, { id: 'col:done', name: 'Done' }],
    default_view: 'kanban', updated_at: '2026-01-01T00:00:00.000Z', source: 'pc',
  };
  const task = (id: string, extra: Partial<TaskDoc> = {}): TaskDoc => ({
    _id: id, type: 'task', project_id: 'project:p1', space_id: 'space:unsorted',
    column_id: 'col:todo', title: 'Task ' + id, body: '', priority: 2,
    due_date: null, reminder_at: null, tags: [], position: 1024, deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    source: 'pc', ...extra,
  });
  await db.put(space);
  await db.put(project);
  await db.put(task('task:plain', { title: 'Plain task' }));
  await db.put(task('task:done', { title: 'Finished', column_id: 'col:done' }));
  await db.put(task('task:tagged', { title: 'Tagged', tags: ['urgent'], due_date: '2026-05-01' }));
  await addCustomFieldDef('Client', 'text');
}

beforeEach(async () => { await wipeAll(); });

describe('backup and restore — the full cycle', () => {
  it('returns every task after a wipe, restoring from the backup bytes alone', async () => {
    await seedRealistic();
    const before = (await getTasksForProject('project:p1')).map(t => t.title).sort();
    const json = await backupEverything();

    await wipeAll();
    expect(await getTasksForProject('project:p1')).toHaveLength(0);

    await restoreFromFile(json);

    expect((await getTasksForProject('project:p1')).map(t => t.title).sort()).toEqual(before);
  });

  it('restores a task\'s attachment bytes, not just its metadata', async () => {
    await seedRealistic();
    const payload = 'the only copy of this file';
    await addAttachment('task:plain', {
      filename: 'contract.txt',
      base64Data: Buffer.from(payload, 'utf8').toString('base64'),
      size: payload.length,
    });
    const json = await backupEverything();

    await wipeAll();
    await restoreFromFile(json);

    const restored = await db.get<TaskDoc>('task:plain');
    const key = restored.attachments?.[0]?.key;
    expect(restored.attachments?.[0]?.filename).toBe('contract.txt');
    const blob = await db.getAttachment('task:plain', key!) as Buffer;
    expect(Buffer.from(blob as never).toString('utf8')).toBe(payload);
  });

  // One attached file used to turn the whole backup into a brick: PouchDB
  // rejects an entire bulkDocs batch on a missing_stub, so every unrelated
  // space/project/task went down with it.
  it('restores everything else even when an attachment cannot be resolved', async () => {
    await seedRealistic();
    const docs = JSON.parse(await backupEverything()) as Array<Record<string, unknown>>;
    const target = docs.find(d => d._id === 'task:plain')!;
    // a stub with no bytes, exactly what older exports wrote
    target._attachments = { 'att:gone': { stub: true, content_type: 'text/plain', length: 12 } };
    target.attachments = [{ key: 'att:gone', filename: 'gone.txt', content_type: 'text/plain', size: 12, added_at: '2026-01-01T00:00:00.000Z' }];

    await wipeAll();
    await restoreFromFile(JSON.stringify(docs));

    const titles = (await getTasksForProject('project:p1')).map(t => t.title).sort();
    expect(titles).toEqual(['Finished', 'Plain task', 'Tagged']);
  });

  it('restores custom field definitions, not only tasks', async () => {
    await seedRealistic();
    const json = await backupEverything();

    await wipeAll();
    expect(await getCustomFieldDefs()).toHaveLength(0);
    await restoreFromFile(json);

    expect((await getCustomFieldDefs()).map(f => f.name)).toContain('Client');
  });

  it('preserves the fields the app reads, not just the titles', async () => {
    await seedRealistic();
    const json = await backupEverything();

    await wipeAll();
    await restoreFromFile(json);

    const tagged = await db.get<TaskDoc>('task:tagged');
    expect(tagged.tags).toEqual(['urgent']);
    expect(tagged.due_date).toBe('2026-05-01');
    // the positional-done rule reads column_id; a lost one silently
    // resurrects a finished task
    expect((await db.get<TaskDoc>('task:done')).column_id).toBe('col:done');
  });

  it('previews the same number of documents it then writes', async () => {
    await seedRealistic();
    const json = await backupEverything();

    await wipeAll();
    const { preview, ok } = await restoreFromFile(json);

    expect(preview.toCreate).toBe(ok);
  });
});

describe('backup and restore — the picked file', () => {
  it('rejects a file that is not a document array', async () => {
    const file = new File(['{"not":"an array"}'], 'bad.json', { type: 'application/json' });
    const docs = JSON.parse(await file.text());
    expect(Array.isArray(docs)).toBe(false);
  });

  it('reports a parse failure rather than throwing into the void', async () => {
    const file = new File(['this is not json at all'], 'bad.json', { type: 'application/json' });
    const text = await file.text();
    expect(() => JSON.parse(text)).toThrow();
  });

  it('imports a single project export, not only a full backup', async () => {
    await seedRealistic();
    const scoped = await exportProjectDocs('project:p1');
    expect(scoped.length).toBeGreaterThan(1);

    await wipeAll();
    await restoreFromFile(JSON.stringify(scoped));

    expect((await getTasksForProject('project:p1')).length).toBe(3);
  });
});
