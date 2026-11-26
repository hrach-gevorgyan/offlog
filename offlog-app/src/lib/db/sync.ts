// Sync (replication to a CouchDB-protocol remote) and conflict resolution.
/// <reference types="pouchdb" />
/// <reference types="pouchdb-find" />
import { getSyncUrl, getSyncCredentials, isSyncEnabled, getSyncKey, getPairedHostUuid, PLAIN_SERVER_TO_RETIRE_KEY } from '../../config';
import { importSyncKey } from '../syncCrypto';
import { encryptedFetch, EncryptedSyncError } from './encryptedFetch';
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

// One remote instance per server and login, reused across restarts. PouchDB
// holds every instance it creates until close(), so a fresh one per restart
// (every phone resume) piles up for the life of the process. A replaced
// instance is not closed: a replication being cancelled may still be using it.
// With a sync key, everything to and from the server goes through
// encryptedFetch (end-to-end encryption, lib/syncCrypto.ts).
let _remote: { key: string; db: PouchDB.Database } | null = null;
let _credentialsMissing = false;
async function remote() {
  const { user, pass } = await getSyncCredentials();
  const url = getSyncUrl();
  const syncKey = getSyncKey();
  _credentialsMissing = !user && !pass;
  const key = JSON.stringify([url, user, pass, syncKey]);
  if (_remote?.key !== key) {
    // An encrypted database reached without the key (a hand-edited address)
    // would take readable documents and hand back sealed ones as if real.
    if (!syncKey && /\/offlog-e-[0-9a-f]+\/?$/.test(url)) throw new EncryptedSyncError('This server holds encrypted data. Pair with the computer in Settings → Sync instead of entering its address.');
    if (syncKey && !globalThis.crypto?.subtle) throw new EncryptedSyncError('Could not start encrypted sync here. Please use the Offlog app.');
    syncState.rejected = 0;
    const auth = { username: user, password: pass };
    const options = syncKey
      ? { auth, fetch: encryptedFetch(url, await importSyncKey(syncKey), reportRejected) }
      : { auth };
    _remote = { key, db: new PouchDB(url, options as PouchDB.Configuration.RemoteDatabaseConfiguration) };
  }
  return _remote.db;
}

// Items from the server this device refused: not written with its key, or
// altered on the way. Never stored; counted so Settings can say so.
function reportRejected(count: number) {
  syncState.rejected += count;
  notify();
}

// On a PC moving to encrypted sync: anything the readable database holds
// comes into this device first, then that database is deleted from the
// server. Pulled unchecked, so it runs only for that move (config.ts).
// Retried after a settled sync, with a growing wait, until done.
export async function retirePlainServer(): Promise<void> {
  const url = localStorage.getItem(PLAIN_SERVER_TO_RETIRE_KEY);
  if (!url || !getSyncKey()) return;
  const { user, pass } = await getSyncCredentials();
  const plain = new PouchDB(url, { auth: { username: user, password: pass }, skip_setup: true } as PouchDB.Configuration.RemoteDatabaseConfiguration);
  // Closed on every early return: PouchDB keeps each instance until then, and
  // this runs again after every settled sync until it succeeds.
  const giveUp = () => { plain.close().catch(() => {}); };
  try {
    // A pull can resolve with documents it failed to write; deleting the
    // server then would lose them.
    const res = await db.replicate.from(plain);
    invalidateTaskCache();
    if (!res.ok || res.doc_write_failures) return giveUp();
  } catch (e) {
    if ((e as SyncError).status !== 404) return giveUp();
  }
  try { await plain.destroy(); } catch (e) { if ((e as SyncError).status !== 404) return giveUp(); }
  localStorage.removeItem(PLAIN_SERVER_TO_RETIRE_KEY);
}


// ── Sync ──────────────────────────────────────────────────────────────────────

let _syncHandler: PouchDB.Replication.Sync<{}> | null = null;
// Bumped by every start, restart and pause. Reading credentials is async, so
// two starts can overlap; one overtaken while it waited must not start a
// replication of its own, or the first is never cancelled and keeps running
// beside the second, and a Pause in that gap would not hold.
let _syncGen = 0;
function stopReplication(): number {
  if (_syncHandler) { _syncHandler.cancel(); _syncHandler = null; }
  return ++_syncGen;
}

// Exported for tests — pure classification, no I/O, so what a dropped
// connection tells the user is testable without a real db.sync() call.
export function describeSyncError(err?: SyncError | null): string {
  if (!err) return 'Unknown sync error';
  const status = err.status ?? err.statusCode;
  // The PC changes its sync password when it moves to encrypted sync, so a
  // device paired before that lands here until it pairs again; but only
  // when a password was sent: an unreadable stored one also ends in 401,
  // and pairing again would not be the fix.
  if (status === 401 || status === 403) return getPairedHostUuid() && !_credentialsMissing ? 'Your computer no longer accepts this device. Pair it again in Settings → Sync.' : 'Authentication failed — check sync credentials';
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
  rejected: 0,
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
  scheduleConflictScan();
  retireAfterSync();
  notify();
}

// After a sync, not at boot: on the desktop the sync server may still be
// starting then, and a large readable database must not hold up startup.
// A failed attempt waits before the next one, doubling up to six hours: on
// the desktop a sync settles after nearly every edit, and each attempt opens
// a remote instance and pulls the whole readable database.
const RETIRE_RETRY_MS = 60000;
const RETIRE_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
let _retiring = false;
let _retireNextAt = 0;
let _retireDelay = RETIRE_RETRY_MS;
function retireAfterSync() {
  if (_retiring || !localStorage.getItem(PLAIN_SERVER_TO_RETIRE_KEY) || Date.now() < _retireNextAt) return;
  _retiring = true;
  retirePlainServer().catch(() => {}).finally(() => {
    _retiring = false;
    if (localStorage.getItem(PLAIN_SERVER_TO_RETIRE_KEY)) {
      _retireNextAt = Date.now() + _retireDelay;
      _retireDelay = Math.min(_retireDelay * 2, RETIRE_RETRY_MAX_MS);
    } else {
      _retireNextAt = 0;
      _retireDelay = RETIRE_RETRY_MS;
    }
  });
}

// Live sync pauses after every replicated batch, and a scan reads every
// non-log doc, so a burst of pauses collapses into one scan.
let _scanTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleConflictScan() {
  clearTimeout(_scanTimer);
  _scanTimer = setTimeout(() => { cleanPhantomsOnce().finally(() => scanConflicts().catch(() => {})); }, 1000);
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
        // A 409 here means replication wrote this id meanwhile; the next scan retries.
        try {
          const winning = await db.get<PristineDoc>(id, { rev: edited[0] });
          await db.put({ ...winning, _id: id, _rev: doc._rev });
        } catch { continue; }
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
export async function conflictBearingRows(from: PouchDB.Database = db) {
  const [before, after] = await Promise.all([
    from.allDocs({ include_docs: true, conflicts: true, startkey: '', endkey: 'log:', inclusive_end: false }),
    from.allDocs({ include_docs: true, conflicts: true, startkey: 'log:￰', endkey: '￿' }),
  ]);
  return [...before.rows, ...after.rows];
}

// NyxDB before v0.1.7 never sent a doc's revision history, so a pulling
// device stored each incoming edit as a new root beside its copy: a
// "conflict" per edit whose losing leaves are only older steps of the same
// doc. The server kept the true tree, so a losing leaf is removed only when
// the server lists it in the history of the version this device shows. Any
// other loser is a genuine conflict and stays for the user. Resolves true
// only when every conflicting doc was checked: an unreachable server, one
// without history (pre-0.1.7), or a winner not pushed yet leaves it false
// and touches nothing for that doc.
export async function removePhantomConflicts(local: PouchDB.Database, server: PouchDB.Database): Promise<boolean> {
  let complete = true, removed = false;
  for (const row of await conflictBearingRows(local)) {
    const doc = row.doc as { _rev: string; _conflicts?: string[] } | undefined;
    if (!doc?._conflicts?.length) continue;
    let history: { start: number; ids: string[] } | undefined;
    try { history = (await server.get(row.id, { rev: doc._rev, revs: true }) as { _revisions?: { start: number; ids: string[] } })._revisions; }
    catch { complete = false; continue; }
    if (!history) { complete = false; continue; }
    const ancestors = new Set(history.ids.map((hash, i) => `${history.start - i}-${hash}`));
    for (const rev of doc._conflicts) {
      if (!ancestors.has(rev)) continue;
      try { await local.remove(row.id, rev); removed = true; } catch { complete = false; }
    }
  }
  if (removed) invalidateTaskCache();
  return complete;
}

// Once per device, after a sync settles against the fixed server.
const PHANTOM_CLEANUP_KEY = 'offlog_phantom_cleanup_v1';
async function cleanPhantomsOnce(): Promise<void> {
  if (localStorage.getItem(PHANTOM_CLEANUP_KEY) || !getSyncUrl()) return;
  try {
    if (await removePhantomConflicts(db, await remote())) localStorage.setItem(PHANTOM_CLEANUP_KEY, now());
  } catch { /* credentials unreadable: tried again on the next settle */ }
}

export async function scanConflicts(): Promise<number> {
  await autoResolvePristineDefaultConflicts();
  const rows = await conflictBearingRows();
  const count = rows.filter(row => row.doc?._conflicts?.length).length;
  syncState.conflictCount = count;
  notify();
  return count;
}

// Called on the app returning to the foreground (Capacitor's 'resume'). A
// long background drops the live long-poll and PouchDB's retry backoff grows
// to 5-10 minutes; 'online' never fires because the WebView saw no offline
// transition. syncNow() recreates the replication, which resets the backoff.
export function syncOnResume(): void {
  if (!isSyncEnabled()) return;
  syncNow().catch(() => {});
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
  const gen = stopReplication();
  // An explicit pause takes priority over auto-starting on init.
  if (!isSyncEnabled()) { syncState.status = 'idle'; notify(); return; }
  // No server configured yet — don't attempt new PouchDB('', ...), which
  // creates a nonsense local database instead of failing loudly. Stay 'idle';
  // Settings' Sync tab renders "Not connected to another device yet" for this.
  if (!getSyncUrl()) { syncState.status = 'idle'; notify(); return; }
  if (!navigator.onLine) { syncState.status = 'offline'; notify(); }
  const remoteDb = await remoteOrMarkError();
  if (gen !== _syncGen) return;
  _syncHandler = attachSyncHandlers(db.sync(remoteDb, { live: true, retry: true }));
}

// Reading the stored credentials can fail; without this the status would
// stay at whatever it was with no replication running behind it.
async function remoteOrMarkError() {
  try { return await remote(); } catch (e) { markError(e as SyncError); throw e; }
}

// Pause: cancels the live replication without touching the configured URL
// (setSyncUrl('') would drop the server config entirely, which a pause must not do).
export function cancelSync() {
  stopReplication();
  syncState.status = 'idle';
  notify();
}

export async function syncNow(): Promise<void> {
  // Same "nothing configured yet" guard as startSync() — resolve
  // immediately rather than attempting new PouchDB('', ...).
  if (!getSyncUrl()) { syncState.status = 'idle'; notify(); return; }
  syncState.status = 'syncing'; notify();
  const gen = stopReplication();
  const remoteDb = await remoteOrMarkError();
  // Overtaken: the newer start or pause owns the state from here.
  if (gen !== _syncGen) return;
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
  const rows = await conflictBearingRows() as PouchDB.Core.AllDocsResponse<ConflictContent>['rows'];
  const out: ConflictInfo[] = [];
  for (const row of rows) {
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

// `shownRevs` is every version's _rev as the screen displayed them, current
// first (versions.map(v => v.doc._rev)). Live sync can extend a branch or add
// one between rendering and the click, which changes which revision is
// current; acting anyway keeps content the person never chose and discards a
// version they never saw. Any difference throws ConflictChangedError instead.
export async function resolveConflict(docId: string, keep: 'current' | 'other', otherRev?: string, shownRevs?: string[]): Promise<void> {
  const doc = await db.get<ConflictContent>(docId, { conflicts: true });
  const losingRevs: string[] = doc._conflicts ?? [];
  if (shownRevs) {
    const live = [doc._rev, ...losingRevs];
    const same = doc._rev === shownRevs[0] && live.length === shownRevs.length && live.every(r => shownRevs.includes(r));
    if (!same) {
      const err = new Error('This conflict changed while it was open — another device synced a newer version. Review the versions again before choosing.');
      err.name = 'ConflictChangedError';
      throw err;
    }
  }
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

