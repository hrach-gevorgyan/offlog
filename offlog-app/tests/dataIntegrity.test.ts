import { beforeEach, describe, expect, it, vi } from 'vitest';
import db, {
  createProject, createTask, updateTask, deleteTask, deleteProject, removeColumn, reorderColumns,
  addAttachment, getAttachmentBlob, exportProjectDocs, importJSON,
  getConflicts, resolveConflict, addCustomFieldDef, getCustomFieldDefs, checkIntegrity, repairDatabase,
  emptyTrash, deleteForever, pruneOldDeletedTasks, clearLogs, wipeAndReseed, getRecentLogs,
  linkRelatedTask, unlinkRelatedTask, linkBlockedBy, unlinkBlockedBy,
  maybePruneOldLogs, maybePruneOldDeletedTasks, renameTag, deleteTagEverywhere, findSimilarNotes,
  invalidateTaskCache, syncOnResume, syncState, initIndexes,
} from '../src/lib/db';
import { catchUpWeb } from '../src/lib/notifications';
import { isBackupDue } from '../src/lib/autoBackup';
import { setSyncEnabled, setSyncUrl } from '../src/config';
import type { TaskDoc } from '../src/lib/types';

beforeEach(async () => {
  localStorage.clear();
  const all = await db.allDocs({ include_docs: true, conflicts: true });
  const dels = all.rows.filter(r => !r.id.startsWith('_')).map(r => ({ ...(r.doc as any), _deleted: true }));
  if (dels.length) await db.bulkDocs(dels);
  for (const row of all.rows as any[]) {
    for (const rev of row.doc?._conflicts ?? []) {
      try { await db.remove(row.id, rev); } catch { /* already gone */ }
    }
  }
  invalidateTaskCache();
  await db.put({ _id: 'space:unsorted', type: 'space', name: 'Unsorted', color: '#6B7280', position: 0 });
});

async function projectWithTask(title = 'T') {
  const p = await createProject('space:unsorted', 'P');
  const t = await createTask(p._id!, 'space:unsorted', p.columns[0].id, title);
  return { p, t };
}

// The deleted leaf as stored -- what compaction keeps and replication sends.
async function deletedLeaf(id: string): Promise<Record<string, unknown>> {
  const leaves = await db.get(id, { open_revs: 'all' }) as unknown as { ok?: Record<string, unknown> }[];
  const leaf = leaves.map(l => l.ok).find(d => d?._deleted);
  expect(leaf).toBeDefined();
  return leaf!;
}

async function attachmentText(content: Blob | Buffer): Promise<string> {
  if (typeof (content as Blob).text === 'function') return (content as Blob).text();
  return Buffer.from(content as Buffer).toString('utf-8');
}

function expectBareTombstone(leaf: Record<string, unknown>) {
  expect(Object.keys(leaf).filter(k => !['_id', '_rev', '_deleted', '_revisions'].includes(k))).toEqual([]);
}

describe('single-project backup keeps attachments', () => {
  it('a project export carries the attachment bytes and restores them in place', async () => {
    const { p, t } = await projectWithTask('With file');
    await addAttachment(t._id!, { filename: 'a.txt', base64Data: btoa('hello world'), size: 11 });
    const exported = JSON.parse(JSON.stringify(await exportProjectDocs(p._id!)));
    const task = exported.find((d: TaskDoc) => d._id === t._id);
    expect(Object.values<{ data?: string }>(task._attachments)[0].data).toBe(btoa('hello world'));
    expect(await importJSON(exported)).toEqual({ ok: 2, skipped: 0 });
    const after = await db.get<TaskDoc & { _attachments?: object }>(t._id!);
    expect(Object.keys(after._attachments ?? {})).toHaveLength(1);
    expect(after.attachments).toHaveLength(1);
    expect(await attachmentText(await getAttachmentBlob(t._id!, after.attachments![0].key))).toBe('hello world');
  });

  it('restoring a stub-only file onto a doc that still has the attachment keeps it', async () => {
    const { p, t } = await projectWithTask('With file');
    await addAttachment(t._id!, { filename: 'a.txt', base64Data: btoa('hello world'), size: 11 });
    // What older project exports wrote: the task as cached, stubs and all.
    const stubbed = JSON.parse(JSON.stringify([await db.get(p._id!), await db.get(t._id!)]));
    await importJSON(stubbed);
    const after = await db.get<TaskDoc & { _attachments?: object }>(t._id!);
    expect(after.attachments).toHaveLength(1);
    expect(await attachmentText(await getAttachmentBlob(t._id!, after.attachments![0].key))).toBe('hello world');
  });
});

describe('removeColumn never completes or resets a repeating task', () => {
  it('removing the first of two statuses lands the task on a live status with its due date unchanged', async () => {
    const p = await createProject('space:unsorted', 'P');
    await reorderColumns(p._id!, [p.columns[0], p.columns[3]]);
    const t = await createTask(p._id!, 'space:unsorted', p.columns[0].id, 'Weekly review', { due_date: '2026-10-01', recurrence: 'weekly' });
    const proj = await removeColumn(p._id!, p.columns[0].id);
    const after = await db.get<TaskDoc>(t._id!);
    expect(proj.columns.map(c => c.id)).toEqual([p.columns[3].id]);
    expect(after.column_id).toBe(p.columns[3].id);
    expect(after.due_date).toBe('2026-10-01');
  });
});

describe('resolveConflict acts only on the versions the screen showed', () => {
  // A fresh id per test: a tombstone left by beforeEach outranks a new rev-1.
  async function makeConflict(id: string) {
    await db.put({ _id: id, type: 'task', project_id: 'project:x', title: 'base' });
    const base = await db.get<any>(id);
    const h = base._rev.split('-')[1];
    await db.bulkDocs([{ ...base, _rev: '2-aaaa', title: 'A edit', _revisions: { start: 2, ids: ['aaaa', h] } }], { new_edits: false });
    await db.bulkDocs([{ ...base, _rev: '2-bbbb', title: 'B edit', _revisions: { start: 2, ids: ['bbbb', h] } }], { new_edits: false });
    return h;
  }

  it('refuses when sync extended a branch after the screen rendered', async () => {
    const h = await makeConflict('task:c1');
    const shown = (await getConflicts()).find(c => c.docId === 'task:c1')!;
    const loser = shown.versions.find(v => !v.isCurrent)!;
    await db.bulkDocs([{ ...loser.doc, _rev: '3-cccc', title: 'more', _revisions: { start: 3, ids: ['cccc', loser.rev.split('-')[1], h] } }], { new_edits: false });
    await expect(resolveConflict('task:c1', 'current', '', shown.versions.map(v => v.doc._rev)))
      .rejects.toMatchObject({ name: 'ConflictChangedError' });
    const doc = await db.get<any>('task:c1', { conflicts: true });
    expect(doc._conflicts).toHaveLength(1); // nothing discarded
  });

  it('resolves normally when nothing changed', async () => {
    await makeConflict('task:c2');
    const shown = (await getConflicts()).find(c => c.docId === 'task:c2')!;
    const current = shown.versions[0].doc.title;
    await resolveConflict('task:c2', 'current', '', shown.versions.map(v => v.doc._rev));
    const doc = await db.get<any>('task:c2', { conflicts: true });
    expect(doc.title).toBe(current);
    expect(doc._conflicts ?? []).toEqual([]);
  });

  it('getConflicts never loads the log range', async () => {
    await createTask('project:x', 'space:unsorted', 'col:x', 'logged');
    const spy = vi.spyOn(db, 'allDocs');
    try {
      await getConflicts();
      const unranged = spy.mock.calls.filter(([o]) => !o || !('startkey' in o || 'keys' in o));
      expect(unranged).toEqual([]);
    } finally { spy.mockRestore(); }
  });
});

describe('restoring an older backup keeps newer custom fields', () => {
  it('merges field definitions by id, so Repair keeps values of fields made after the backup', async () => {
    const { p } = await projectWithTask();
    await addCustomFieldDef('Old', 'text');
    const backup = JSON.parse(JSON.stringify((await db.allDocs({ include_docs: true })).rows.map(r => r.doc).filter(d => !d!._id.startsWith('_'))));
    const fid = (await addCustomFieldDef('Client', 'text')).at(-1)!.id;
    const t = await createTask(p._id!, 'space:unsorted', p.columns[0].id, 'After backup', { custom_values: { [fid]: 'ACME' } });
    await importJSON(backup);
    expect((await getCustomFieldDefs()).map(f => f.name)).toEqual(['Old', 'Client']);
    const { issues } = await checkIntegrity();
    await repairDatabase(issues);
    expect((await db.get<TaskDoc>(t._id!)).custom_values).toEqual({ [fid]: 'ACME' });
  });

  it('an incoming definition wins over the local one with the same id', async () => {
    const fid = (await addCustomFieldDef('Local name', 'text')).at(-1)!.id;
    await importJSON([{ _id: 'meta:custom_fields', type: 'meta', fields: [{ id: fid, name: 'Backup name', type: 'text' }] }]);
    expect(await getCustomFieldDefs()).toEqual([{ id: fid, name: 'Backup name', type: 'text' }]);
  });
});

describe('purges write bare tombstones', () => {
  it('emptyTrash: no title, no attachments in the deleted revision, and a delete log entry', async () => {
    const { t } = await projectWithTask('Secret');
    await addAttachment(t._id!, { filename: 'a.txt', base64Data: btoa('x'), size: 1 });
    await deleteTask(t._id!);
    expect(await emptyTrash()).toBe(1);
    expectBareTombstone(await deletedLeaf(t._id!));
    const logs = await getRecentLogs(10);
    expect(logs.some(l => l.ref === t._id && l.action === 'delete' && l.field === 'purged' && l.task_title === 'Secret')).toBe(true);
  });

  it('deleteForever logs the purge', async () => {
    const { t } = await projectWithTask('Gone');
    await deleteTask(t._id!);
    await deleteForever(t._id!);
    const logs = await getRecentLogs(10);
    expect(logs.some(l => l.ref === t._id && l.action === 'delete' && l.field === 'purged')).toBe(true);
  });

  it('pruneOldDeletedTasks', async () => {
    const { t } = await projectWithTask('Old');
    const doc = await db.get<TaskDoc>(t._id!);
    await db.put({ ...doc, deleted: true, updated_at: '2020-01-01T00:00:00.000Z' });
    invalidateTaskCache();
    expect(await pruneOldDeletedTasks()).toBe(1);
    expectBareTombstone(await deletedLeaf(t._id!));
  });

  it('deleteProject', async () => {
    const { p, t } = await projectWithTask('In project');
    await deleteProject(p._id!);
    expectBareTombstone(await deletedLeaf(t._id!));
  });

  it('clearLogs', async () => {
    await projectWithTask();
    const logId = (await db.allDocs({ startkey: 'log:', endkey: 'log:￿' })).rows[0].id;
    await clearLogs();
    expectBareTombstone(await deletedLeaf(logId));
  });

  it('wipeAndReseed tombstones bare and leaves _design docs alone', async () => {
    await initIndexes();
    const designBefore = (await db.allDocs({ startkey: '_design/', endkey: '_design/￿' })).rows.map(r => r.id);
    expect(designBefore.length).toBeGreaterThan(0);
    const { t } = await projectWithTask();
    await wipeAndReseed();
    expectBareTombstone(await deletedLeaf(t._id!));
    const designAfter = (await db.allDocs({ startkey: '_design/', endkey: '_design/￿' })).rows.map(r => r.id);
    expect(designAfter).toEqual(designBefore);
  });
});

describe('link writes compute from the fresh doc', () => {
  it('two concurrent related links on the same task both land', async () => {
    const { p, t: a } = await projectWithTask('A');
    const b = await createTask(p._id!, 'space:unsorted', p.columns[0].id, 'B');
    const c = await createTask(p._id!, 'space:unsorted', p.columns[0].id, 'C');
    await Promise.all([linkRelatedTask(a._id!, b._id!), linkRelatedTask(a._id!, c._id!)]);
    expect((await db.get<TaskDoc>(a._id!)).related?.sort()).toEqual([b._id, c._id].sort());
    await Promise.all([unlinkRelatedTask(a._id!, b._id!), linkRelatedTask(b._id!, c._id!)]);
    expect((await db.get<TaskDoc>(a._id!)).related).toEqual([c._id]);
  });

  it('two concurrent blocked-by links on the same task both land, and unlinks do not resurrect', async () => {
    const { p, t: a } = await projectWithTask('A');
    const b = await createTask(p._id!, 'space:unsorted', p.columns[0].id, 'B');
    const c = await createTask(p._id!, 'space:unsorted', p.columns[0].id, 'C');
    await Promise.all([linkBlockedBy(a._id!, b._id!), linkBlockedBy(a._id!, c._id!)]);
    expect((await db.get<TaskDoc>(a._id!)).blocked_by?.sort()).toEqual([b._id, c._id].sort());
    await Promise.all([unlinkBlockedBy(a._id!, b._id!), unlinkBlockedBy(a._id!, c._id!)]);
    expect((await db.get<TaskDoc>(a._id!)).blocked_by).toEqual([]);
  });
});

describe('reminder clears never null a newer reminder', () => {
  it('a stale catch-up snapshot leaves a reminder set since then in place', async () => {
    const { t } = await projectWithTask();
    const old = new Date(Date.now() - 3 * 86400_000).toISOString();
    await updateTask(t._id!, { reminder_at: old });
    const snapshot = await db.get<TaskDoc>(t._id!);
    const fresh = new Date(Date.now() + 86400_000).toISOString();
    await updateTask(t._id!, { reminder_at: fresh });
    await catchUpWeb([snapshot]);
    expect((await db.get<TaskDoc>(t._id!)).reminder_at).toBe(fresh);
  });

  it('still clears the stale reminder when nothing changed', async () => {
    const { t } = await projectWithTask();
    await updateTask(t._id!, { reminder_at: new Date(Date.now() - 3 * 86400_000).toISOString() });
    await catchUpWeb([await db.get<TaskDoc>(t._id!)]);
    expect((await db.get<TaskDoc>(t._id!)).reminder_at).toBeNull();
  });
});

describe('sync restarts on resume', () => {
  it('kicks a sync when enabled and leaves an explicit pause alone', () => {
    setSyncUrl('');
    setSyncEnabled(false);
    syncState.status = 'error';
    syncOnResume();
    expect(syncState.status).toBe('error');
    setSyncEnabled(true);
    syncOnResume(); // no URL: syncNow() settles straight to idle
    expect(syncState.status).toBe('idle');
  });
});

describe('a clock that was set ahead does not stall housekeeping', () => {
  it('isBackupDue treats a future last-run stamp as due', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    expect(isBackupDue('2027-01-01T00:00:00.000Z', now)).toBe(true);
    expect(isBackupDue('2026-10-02T11:00:00.000Z', now)).toBe(false);
  });

  it('maybePrune* run when their stamp is in the future', async () => {
    const future = String(Date.now() + 30 * 86400_000);
    localStorage.setItem('offlog_logs_pruned_at', future);
    localStorage.setItem('offlog_deleted_tasks_pruned_at', future);
    maybePruneOldLogs();
    maybePruneOldDeletedTasks();
    await vi.waitFor(() => {
      expect(Number(localStorage.getItem('offlog_logs_pruned_at'))).toBeLessThanOrEqual(Date.now());
      expect(Number(localStorage.getItem('offlog_deleted_tasks_pruned_at'))).toBeLessThanOrEqual(Date.now());
    });
  });
});

describe('findSimilarNotes tokenizes each unchanged note once', () => {
  it('a repeat call re-tokenizes only the input', async () => {
    const { p } = await projectWithTask();
    for (let i = 0; i < 5; i++) {
      await createTask(p._id!, 'space:unsorted', p.columns[0].id, `N${i}`, { body: `shared words about the quarterly report number ${i}` });
    }
    const input = 'shared words about the quarterly report draft';
    const first = await findSimilarNotes(null, input);
    const spy = vi.spyOn(String.prototype, 'match');
    try {
      const second = await findSimilarNotes(null, input);
      expect(second).toEqual(first);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });
});

describe('tag rename/delete and orphan repair', () => {
  it('rename and delete reach trashed tasks too, and count only live ones', async () => {
    const { p, t } = await projectWithTask();
    const trashed = await createTask(p._id!, 'space:unsorted', p.columns[0].id, 'Trashed', { tags: ['old'] });
    await updateTask(t._id!, { tags: ['old'] });
    await deleteTask(trashed._id!);
    expect(await renameTag('old', 'new')).toBe(1);
    expect((await db.get<TaskDoc>(trashed._id!)).tags).toEqual(['new']);
    expect(await deleteTagEverywhere('new')).toBe(1);
    expect((await db.get<TaskDoc>(trashed._id!)).tags).toEqual([]);
  });

  it('an orphaned task repaired into Unsorted takes that project\'s space', async () => {
    await db.put({ _id: 'space:work', type: 'space', name: 'Work', color: '#000000', position: 1 });
    await createProject('space:unsorted', 'Home');
    await db.put({ _id: 'task:orphan', type: 'task', project_id: 'project:gone', space_id: 'space:work', column_id: 'col:x', title: 'Orphan', tags: [], priority: 1, position: 0 });
    invalidateTaskCache();
    const { issues } = await checkIntegrity();
    await repairDatabase(issues.filter(i => i.type === 'orphaned_task'));
    expect((await db.get<TaskDoc>('task:orphan')).space_id).toBe('space:unsorted');
  });
});
