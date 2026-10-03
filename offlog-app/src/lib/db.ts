// db.ts is a barrel over src/lib/db/*. Always import from './db', never a
// db/ module directly.
//
// Dependency order is strictly one-way:
//   core <- entities <- { sync, tags, stats, maintenance }
//
// core.ts exports a handful of shared internals (db, SOURCE, now, nanoid,
// getAllTasksRaw, logChange, queueTaskWrite) purely so its siblings can reach
// them. Those are NOT re-exported here — the named list below is exactly the
// set of core members that are part of './db's public surface.
export type { LogDoc } from './db/core';
export { initIndexes, invalidateTaskCache, posBetween, computeDropPosition, computeGroupDropPosition, getRecentLogs, getDeviceLastSeen, getLogsForTask, subscribe } from './db/core';
export * from './db/entities';
export * from './db/sync';
export * from './db/tags';
export * from './db/stats';
export * from './db/maintenance';

import { db } from './db/core';
export default db;
