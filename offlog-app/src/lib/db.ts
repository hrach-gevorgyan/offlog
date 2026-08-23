// db.ts was one 2,191-line module; it is now a barrel over src/lib/db/*.
// The split is a pure move — every name that was importable from './db'
// before still is, from the same path.
//
// Dependency order is strictly one-way:
//   core <- entities <- { sync, tags, stats, maintenance }
//
// core.ts exports a handful of shared internals (db, SOURCE, now, nanoid,
// getAllTasksRaw, logChange, queueTaskWrite) purely so its siblings can reach
// them. Those are NOT re-exported here — the named list below is exactly the
// set of core members that was public before the split, so './db's surface is
// unchanged.
export { initIndexes, invalidateTaskCache, posBetween, computeDropPosition, getRecentLogs, getDeviceLastSeen, getLogsForTask, subscribe } from './db/core';
export * from './db/entities';
export * from './db/sync';
export * from './db/tags';
export * from './db/stats';
export * from './db/maintenance';

import { db } from './db/core';
export default db;
