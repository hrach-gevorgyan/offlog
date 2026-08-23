// Sync (replication to a CouchDB-protocol remote) and conflict resolution.
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import { getSyncUrl, getSyncCredentials, isSyncEnabled } from '../../config';
import { db, invalidateTaskCache, now, DEFAULT_COLS } from './core';
import type { ProjectDoc, Column, Source } from '../types';

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
    // The sync URL is a self-hosted LAN address, so "cannot reach it" almost
    // always means "not on that network right now". A device that has never
    // synced shows an empty/default-seeded app in this situation, easy to
    // mistake for lost data unless the message says why in plain terms.
    return 'Cannot reach sync server — check you\'re on the same network/WiFi it runs on';
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

// Content shape a still-untouched default doc from seedIfEmpty() has.
// Compared field-by-field (ignoring _id/_rev/updated_at/source, which always
// legitimately differ between two independently-seeded installs) to tell a
// genuinely pristine copy apart from one the user edited.
// One predicate map covers both a space doc and a project doc, so the union of
// the fields either predicate reads is optional here.
interface PristineDoc {
  name?: string;
  color?: string;
  position?: number;
  space_id?: string;
  default_view?: ProjectDoc['default_view'];
  columns?: Column[];
}

const PRISTINE_DEFAULTS: Record<string, (doc: PristineDoc) => boolean> = {
  'space:unsorted': (d) => d.name === 'Unsorted' && d.color === '#6B7280' && d.position === 0,
  'space:personal': (d) => d.name === 'Personal' && d.color === '#10B981' && d.position === 1,
  'space:work':     (d) => d.name === 'Work' && d.color === '#3B82F6' && d.position === 2,
  'project:draft':  (d) => d.name === 'Draft' && d.space_id === 'space:unsorted' && d.position === 0
                         && d.default_view === 'kanban' && JSON.stringify(d.columns) === JSON.stringify(DEFAULT_COLS),
};

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
export async function scanConflicts(): Promise<number> {
  await autoResolvePristineDefaultConflicts();
  // PouchDB only attaches conflict info to the fetched doc's own _conflicts
  // field, never to row.value — so include_docs is required, and
  // row.doc._conflicts (not row.value.conflicts, which does not exist) is the
  // field to read. Reading row.value.conflicts silently yields a zero count.
  const r = await db.allDocs({ include_docs: true, conflicts: true });
  const count = r.rows.filter(row => row.doc?._conflicts?.length).length;
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

// The only fields Settings' conflict UI reads off a conflicted doc, which can
// be of any type -- `title` for tasks, `name` for spaces/projects.
interface ConflictContent {
  type: string;
  title?: string;
  name?: string;
  source?: Source;
  created_at?: string;
  updated_at?: string;
}
type ConflictDoc = PouchDB.Core.ExistingDocument<ConflictContent>;

export interface ConflictInfo {
  docId: string;
  type: string;
  label: string;
  current: ConflictDoc;
  other: { rev: string; doc: ConflictDoc };
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
    // Only the first conflicting revision is shown — multi-way conflicts are
    // rare for a single-user app and repairDatabase() remains available for
    // those as a blunter "keep current, discard the rest" fallback.
    const other = await db.get<ConflictContent>(row.id, { rev: revs[0] });
    out.push({
      docId: row.id,
      type: current.type,
      label: current.title ?? current.name ?? row.id,
      current,
      other: { rev: revs[0], doc: other },
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

