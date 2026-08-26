// Sync (replication to a CouchDB-protocol remote) and conflict resolution.
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import { getSyncUrl, getSyncCredentials, isSyncEnabled } from '../../config';
import { db, invalidateTaskCache, now } from './core';
import { PRISTINE_DEFAULTS, type PristineDoc } from './entities';
import type { Source } from '../types';

// PouchDB.Core.Error minus the fields this file never reads, plus statusCode:
// the HTTP adapter sets `status`, while a fetch-layer failure surfaces
// `statusCode` instead, and neither is guaranteed present.
export interface SyncError extends PouchDB.Core.Error {
  statusCode?: number;
}

// @types/pouchdb-replication's Sync declares no `push`/`pull`, though the real
// Sync object exposes both sub-replications (see attachSyncHandlers below for
// why they're load-bearing). Structural rather than PouchDB.Replication.Sync
// so the tests' hand-rolled chainable-`.on` double satisfies it too.
interface SyncEmitter {
  on(event: string, listener: (err?: SyncError) => void): SyncEmitter;
  push?: SyncEmitter;
  pull?: SyncEmitter;
}

async function remote() {
  const { user, pass } = await getSyncCredentials();
  return new PouchDB(getSyncUrl(), { auth: { username: user, password: pass } });
}


// ── Sync ──────────────────────────────────────────────────────────────────────

let _syncHandler: PouchDB.Replication.Sync<{}> | null = null;

// Exported for tests — pure classification, no I/O, so what a dropped
// connection tells the user is testable without a real db.sync() call.
export function describeSyncError(err?: SyncError | null): string {
  if (!err) return 'Unknown sync error';
  const status = err.status ?? err.statusCode;
  if (status === 401 || status === 403) return 'Authentication failed — check sync credentials';
  if (status === 404) return 'Sync database not found on server';
  if (status === 0 || err.name === 'TypeError' || /network|failed to fetch/i.test(err.message ?? '')) {
    // The sync URL is a self-hosted LAN address, so "cannot reach it" has two
    // equally common causes: the wrong network, or the host simply being
    // switched off. markError()'s offline branch only fires when
    // navigator.onLine is false, which it is NOT when you are sitting on the
    // right WiFi with the PC powered down — so this string must not assert
    // the network is wrong. A device that has never synced shows an
    // empty/default-seeded app here, easy to mistake for lost data unless
    // the message says why in plain terms.
    return 'Cannot reach sync server — it may be switched off, or you may not be on its network';
  }
  return err.message ?? err.reason ?? String(err);
}

const LAST_SYNC_KEY = 'offlog_last_synced';

export const syncState = {
  status: 'idle' as 'idle' | 'syncing' | 'error' | 'offline',
  lastSynced: localStorage.getItem(LAST_SYNC_KEY),
  error: null as string | null,
  lastErrorAt: null as string | null,
  retryCount: 0,
  conflictCount: 0,
  listeners: new Set<() => void>(),
};

function notify() { syncState.listeners.forEach(fn => fn()); }

function markSynced() {
  const ts = now();
  syncState.status = 'idle';
  syncState.lastSynced = ts;
  syncState.error = null;
  syncState.retryCount = 0;
  localStorage.setItem(LAST_SYNC_KEY, ts);
  scanConflicts();
  notify();
}

function markError(err?: SyncError) {
  // A genuine offline state takes priority over whatever sync error
  // surfaced — it's almost certainly just the network being down.
  if (!navigator.onLine) { syncState.status = 'offline'; syncState.error = null; notify(); return; }
  syncState.status = 'error';
  syncState.error = describeSyncError(err);
  syncState.retryCount += 1;
  syncState.lastErrorAt = now();
  notify();
}

// clearLocalSeedBeforeFirstPair() only helps when THIS device's copy of a
// fixed default id is still pristine; it can't fix the *other* side's copy.
// A device with real history pairing against one whose defaults were never
// touched still forks un-mergeable revision trees on those fixed ids, and
// the protocol's deterministic winner isn't guaranteed to prefer the real
// content over the pristine throwaway. So this cleans up after the fact,
// symmetrically: a revision on one of these known ids that still exactly
// matches seedIfEmpty()'s pristine shape is provably worthless and is
// discarded with no user interaction. A genuinely customized revision is
// never guessed at — this only recognizes "nobody ever touched this one",
// and never merges two real edits.
async function autoResolvePristineDefaultConflicts(): Promise<void> {
  for (const id of Object.keys(PRISTINE_DEFAULTS)) {
    let doc: PouchDB.Core.Document<PristineDoc> & PouchDB.Core.GetMeta;
    try { doc = await db.get<PristineDoc>(id, { conflicts: true }); } catch { continue; }
    const losingRevs: string[] = doc._conflicts ?? [];
    if (!losingRevs.length) continue;
    const isPristine = PRISTINE_DEFAULTS[id];

    if (isPristine(doc)) {
      // The kept revision is the untouched default — if exactly one losing
      // revision is a real edit, adopt it rather than keeping the throwaway
      // just because PouchDB's deterministic pick favored it. More than one
      // real edit is left alone: never guess between two real edits.
      const edited: string[] = [];
      for (const rev of losingRevs) {
        try {
          const losing = await db.get<PristineDoc>(id, { rev });
          if (!isPristine(losing)) edited.push(rev);
        } catch { /* already gone — ignore */ }
      }
      if (edited.length === 1) {
        const winning = await db.get<PristineDoc>(id, { rev: edited[0] });
        await db.put({ ...winning, _id: id, _rev: doc._rev });
        for (const rev of losingRevs) { try { await db.remove(id, rev); } catch {} }
      } else if (edited.length === 0) {
        // every side is still pristine — doesn't matter which one "wins"
        for (const rev of losingRevs) { try { await db.remove(id, rev); } catch {} }
      }
    } else {
      // The kept revision already has real content — just discard
      // whichever losing revisions are still provably untouched.
      for (const rev of losingRevs) {
        try {
          const losing = await db.get<PristineDoc>(id, { rev });
          if (isPristine(losing)) await db.remove(id, rev);
        } catch { /* already gone — ignore */ }
      }
    }
  }
}

// Exported for store.ts's init() — conflict state must be visible from a
// cold start, not only after the next sync settles.
// Every conflict-bearing doc, with log: excluded.
//
// PouchDB only attaches conflict info to the fetched doc's own _conflicts
// field, never to row.value — so include_docs is required, and
// row.doc._conflicts (not row.value.conflicts, which does not exist) is the
// field to read. Reading row.value.conflicts silently yields a zero count.
//
// log: docs are `log:${ts}-${nanoid(8)}`, written once and never updated, so
// they cannot conflict — but a plain allDocs loads all six months of them
// (LOG_RETENTION_MONTHS) on every sync settle, since markSynced() calls this.
// Two ranges around the log: block rather than an allowlist of known
// prefixes, so a doc type added later is still scanned.
// Exported so checkIntegrity() reports conflicts over exactly the range the
// Resolve-conflicts screen can act on. Two allowlists drifted apart once
// already: maintenance listed the entity prefixes and silently stopped
// reporting a conflict on meta:custom_fields that the sync badge still
// counted.
export async function conflictBearingRows() {
  const [before, after] = await Promise.all([
    db.allDocs({ include_docs: true, conflicts: true, startkey: '', endkey: 'log:', inclusive_end: false }),
    db.allDocs({ include_docs: true, conflicts: true, startkey: 'log:￰', endkey: '￿' }),
  ]);
  return [...before.rows, ...after.rows];
}

export async function scanConflicts(): Promise<number> {
  await autoResolvePristineDefaultConflicts();
  const rows = await conflictBearingRows();
  const count = rows.filter(row => row.doc?._conflicts?.length).length;
  syncState.conflictCount = count;
  notify();
  return count;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!isSyncEnabled()) return; // an explicit pause must not auto-resume on reconnect
    if (syncState.status === 'offline') { syncState.status = 'syncing'; notify(); }
    syncNow().catch(() => {});
  });
  window.addEventListener('offline', () => {
    syncState.status = 'offline'; syncState.error = null; notify();
  });
}

// Both startSync() and syncNow() attach these handlers to a *single* live
// replication (_syncHandler). Never run a second concurrent db.sync() against
// the same remote: two replications race to write the same docs and duplicate
// the traffic.
//
// The push/pull sub-replication listeners are load-bearing, not redundant:
// db.sync()'s combined Sync object emits a bare 'paused' (no error) whenever
// either direction pauses, discarding the argument the underlying
// sub-replication's own 'paused' carried. Under `retry: true` a connection
// failure emits 'paused' *with* the error on the sub-replication only, and
// the combined object's 'error' never fires because the replication promise
// never rejects — PouchDB retries forever. Listening only to the combined
// object therefore reports any retryable connectivity failure as a successful
// "synced". handler.push/handler.pull are public properties of PouchDB's Sync
// class; reading the error from them keeps `retry: true`'s auto-reconnect.
//
// Exported for tests — accepts any object with a chainable `.on(event, cb)`
// and optional `.push`/`.pull` sub-objects of the same shape, so a dropped
// connection can be exercised without a real replication.
export function attachSyncHandlers<H extends SyncEmitter>(handler: H, onSettle?: (err?: SyncError) => void): H {
  let settled = false;
  const settle = (err?: SyncError) => { if (!settled) { settled = true; onSettle?.(err); } };

  let pushErr: SyncError | undefined = undefined, pullErr: SyncError | undefined = undefined;
  if (handler.push && typeof handler.push.on === 'function') {
    handler.push.on('paused', (err) => { pushErr = err ?? undefined; });
    handler.push.on('active', () => { pushErr = undefined; });
  }
  if (handler.pull && typeof handler.pull.on === 'function') {
    handler.pull.on('paused', (err) => { pullErr = err ?? undefined; });
    handler.pull.on('active', () => { pullErr = undefined; });
  }

  handler
    .on('change', () => { syncState.status = 'syncing'; notify(); })
    .on('active', () => { syncState.status = 'syncing'; notify(); })
    .on('paused', (err) => {
      const real = err ?? pushErr ?? pullErr;
      if (real) markError(real); else markSynced();
      settle(real);
    })
    .on('error', (err) => { markError(err); settle(err); });
  return handler;
}

export async function startSync(): Promise<void> {
  if (_syncHandler) { _syncHandler.cancel(); _syncHandler = null; }
  // An explicit pause takes priority over auto-starting on init.
  if (!isSyncEnabled()) { syncState.status = 'idle'; notify(); return; }
  // No server configured yet — don't attempt new PouchDB('', ...), which
  // creates a nonsense local database instead of failing loudly. Stay 'idle';
  // Settings' Sync tab renders "Not connected to another device yet" for this.
  if (!getSyncUrl()) { syncState.status = 'idle'; notify(); return; }
  if (!navigator.onLine) { syncState.status = 'offline'; notify(); }
  _syncHandler = attachSyncHandlers(db.sync(await remote(), { live: true, retry: true }));
}

// Pause: cancels the live replication without touching the configured URL
// (setSyncUrl('') would drop the server config entirely, which a pause must not do).
export function cancelSync() {
  if (_syncHandler) { _syncHandler.cancel(); _syncHandler = null; }
  syncState.status = 'idle';
  notify();
}

export async function syncNow(): Promise<void> {
  // Same "nothing configured yet" guard as startSync() — resolve
  // immediately rather than attempting new PouchDB('', ...).
  if (!getSyncUrl()) { syncState.status = 'idle'; notify(); return; }
  syncState.status = 'syncing'; notify();
  if (_syncHandler) _syncHandler.cancel();
  const remoteDb = await remote();
  return new Promise((resolve, reject) => {
    _syncHandler = attachSyncHandlers(db.sync(remoteDb, { live: true, retry: true }), (err) => {
      if (err) reject(err); else resolve();
    });
  });
}


// ── Conflict resolution ─────────────────────────────────────────────────────
// repairDatabase() above always keeps the current winning revision and
// discards the rest — a reasonable default, but it means the user never
// gets to choose if PouchDB's deterministic pick happened to keep the wrong
// side of a genuine edit conflict. These two functions let Settings show
// both versions of a conflicted doc and let the user decide.

// A conflicted doc can be of any type -- `title` for tasks, `name` for
// spaces/projects -- and the UI also diffs whatever other fields it carries,
// so the index signature is deliberate.
interface ConflictContent {
  type: string;
  title?: string;
  name?: string;
  source?: Source;
  created_at?: string;
  updated_at?: string;
  [field: string]: unknown;
}
type ConflictDoc = PouchDB.Core.ExistingDocument<ConflictContent>;

// Bookkeeping, not content: identical values here mean nothing to a person
// choosing between two versions, and differing ones are guaranteed (every
// revision has its own _rev and updated_at), so diffing them is pure noise.
const DIFF_IGNORED = new Set([
  '_id', '_rev', '_conflicts', '_revisions', '_attachments',
  'type', 'source', 'source_id', 'created_at', 'updated_at',
]);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Absent and empty are the same thing to a reader -- a task that never had
  // a body and one whose body was cleared are not a difference worth showing.
  const empty = (v: unknown) => v === undefined || v === null || v === '' ||
    (Array.isArray(v) && v.length === 0);
  if (empty(a) && empty(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

// Which fields actually differ across every competing version. This is the
// whole point of the conflict screen: without it a person is choosing between
// two device names and two timestamps, with no idea what changes either way.
function differingFields(versions: ConflictVersion[]): string[] {
  const keys = new Set<string>();
  for (const v of versions) for (const k of Object.keys(v.doc)) if (!DIFF_IGNORED.has(k)) keys.add(k);
  const first = versions[0].doc;
  return [...keys]
    .filter(k => versions.some(v => !sameValue(v.doc[k], first[k])))
    .sort();
}

// One competing version of a document. `rev` is empty for the one PouchDB
// currently serves -- that pick is deterministic but arbitrary, so nothing
// here treats it as authoritative beyond labelling it.
export interface ConflictVersion {
  rev: string;
  isCurrent: boolean;
  isNewest: boolean;
  doc: ConflictDoc;
}

export interface ConflictInfo {
  docId: string;
  type: string;
  label: string;
  // Every competing version, current first -- not just the first losing one.
  // resolveConflict() removes them all, so showing a subset meant a single
  // click could discard a version the screen never displayed.
  versions: ConflictVersion[];
  // Field names that differ across versions, for the UI to render per side.
  differing: string[];
}

export async function getConflicts(): Promise<ConflictInfo[]> {
  const r = await db.allDocs<ConflictContent>({ include_docs: true, conflicts: true });
  const out: ConflictInfo[] = [];
  for (const row of r.rows) {
    // See scanConflicts()'s comment — conflicts live on row.doc._conflicts,
    // never on row.value.
    const revs: string[] = row.doc?._conflicts ?? [];
    if (!revs.length) continue;
    const current = row.doc!;

    const versions: ConflictVersion[] = [
      { rev: '', isCurrent: true, isNewest: false, doc: current },
    ];
    for (const rev of revs) {
      try {
        versions.push({ rev, isCurrent: false, isNewest: false, doc: await db.get<ConflictContent>(row.id, { rev }) });
      } catch { /* already gone — nothing to choose between */ }
    }

    // Which one a person would call "the latest". PouchDB's own winner is
    // decided by revision hash, not time, so the served version is regularly
    // the older edit -- saying so is the difference between an informed
    // choice and a coin toss.
    //
    // Timezones are not a problem here: now() writes toISOString(), so every
    // updated_at is UTC and string order is chronological order wherever the
    // devices are. Device CLOCKS are: this is each device's own idea of the
    // time, and one running fast will claim an edit it made earlier. Treat
    // the flag as the best available hint, never as proof -- which is why the
    // UI still shows every version's content rather than leaning on it.
    let newest = 0;
    for (let i = 1; i < versions.length; i++) {
      const a = String(versions[i].doc.updated_at ?? versions[i].doc.created_at ?? '');
      const b = String(versions[newest].doc.updated_at ?? versions[newest].doc.created_at ?? '');
      if (a > b) newest = i;
    }
    if (versions.length > 1) versions[newest].isNewest = true;

    out.push({
      docId: row.id,
      type: current.type,
      label: current.title ?? current.name ?? row.id,
      versions,
      differing: differingFields(versions),
    });
  }
  return out;
}

export async function resolveConflict(docId: string, keep: 'current' | 'other', otherRev?: string): Promise<void> {
  const doc = await db.get<ConflictContent>(docId, { conflicts: true });
  const losingRevs: string[] = doc._conflicts ?? [];
  if (keep === 'other' && otherRev) {
    const winning = await db.get<ConflictContent>(docId, { rev: otherRev });
    await db.put({ ...winning, _id: docId, _rev: doc._rev });
  }
  // Every conflicting revision needs explicit removal — PouchDB and the sync
  // server don't auto-prune losing branches when a new revision is written.
  // That includes the adopted "other" revision: its content was copied into a
  // fresh revision above, but its old leaf is still a separate branch and
  // stays a live conflict unless removed too.
  for (const rev of losingRevs) {
    try { await db.remove(docId, rev); } catch {}
  }
  invalidateTaskCache();
  await scanConflicts();
}

