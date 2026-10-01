// A project screen's filter: the same five inputs the desktop FilterBar
// feeds into utils.filterTasks, so both apps agree on what a filter means.
import { filterTasks, type CustomFieldFilter } from '../../utils';
import type { TaskDoc } from '../../types';
import { computeDropPosition } from '../../db';

export interface Filter { search: string; col: string; prio: number; tag: string; fields: CustomFieldFilter[] }
export const EMPTY: Filter = { search: '', col: '', prio: 0, tag: '', fields: [] };

// How List orders its rows.
export const SORTS = ['Status', 'Due', 'Priority', 'Title'] as const;
export type Sort = typeof SORTS[number];

export function applyFilter(tasks: TaskDoc[], f: Filter): TaskDoc[] {
  return filterTasks(tasks, f.search, f.col, f.prio, f.tag, f.fields);
}

// What the Filter button counts as "on". Search has its own field in List.
export function activeCount(f: Filter): number {
  return (f.col ? 1 : 0) + (f.prio ? 1 : 0) + (f.tag ? 1 : 0) + f.fields.filter(x => x.fieldId && x.value).length;
}

// Saved filters share the desktop's per-project localStorage key and shape,
// so a filter saved on either layout shows up on the other.
interface Saved { name: string; search: string; filterCol: string; filterPrio: number; filterTag: string; customFieldFilters?: CustomFieldFilter[] }
export interface SavedFilter { name: string; filter: Filter }
const key = (projectId: string) => `offlog_saved_filters_${projectId}`;

function readRaw(projectId: string): Saved[] {
  try { return JSON.parse(localStorage.getItem(key(projectId)) ?? '[]') ?? []; } catch { return []; }
}
function writeRaw(projectId: string, list: Saved[]) {
  try { localStorage.setItem(key(projectId), JSON.stringify(list)); } catch { /* storage unavailable: the filter just isn't kept */ }
}

export function loadSaved(projectId: string): SavedFilter[] {
  return readRaw(projectId).map(s => ({
    name: s.name,
    filter: { search: s.search ?? '', col: s.filterCol ?? '', prio: s.filterPrio ?? 0, tag: s.filterTag ?? '', fields: s.customFieldFilters ?? [] },
  }));
}

// Same name replaces, as on the desktop.
export function saveFilter(projectId: string, name: string, f: Filter): SavedFilter[] {
  const entry: Saved = { name, search: f.search, filterCol: f.col, filterPrio: f.prio, filterTag: f.tag, customFieldFilters: f.fields };
  writeRaw(projectId, [...readRaw(projectId).filter(s => s.name !== name), entry]);
  return loadSaved(projectId);
}

export function deleteSaved(projectId: string, name: string): SavedFilter[] {
  writeRaw(projectId, readRaw(projectId).filter(s => s.name !== name));
  return loadSaved(projectId);
}

// A status's cards as the board shows them: pinned first, then by position.
export function columnTasks(tasks: TaskDoc[], colId: string): TaskDoc[] {
  return tasks.filter(t => t.column_id === colId)
    .sort((a, b) => (!!b.pinned !== !!a.pinned ? (b.pinned ? 1 : -1) : a.position - b.position));
}

// The position that moves `task` one place up or down past its visible
// neighbour among the cards sharing its pinned state, or null when it is
// already at that end. `col` is the whole status, filtered-out cards
// included, so the new position never lands on the wrong side of a hidden
// card; `visible` is what the user sees. Pinned and unpinned cards are
// ordered separately, so their positions never neighbour each other.
export function stepPosition(col: TaskDoc[], task: TaskDoc, dir: -1 | 1, visible: TaskDoc[] = col): number | null {
  const same = (t: TaskDoc) => !!t.pinned === !!task.pinned;
  const seen = visible.filter(same);
  const i = seen.findIndex(t => t._id === task._id);
  const next = i < 0 ? undefined : seen[i + dir];
  if (!next) return null;
  const others = col.filter(t => same(t) && t._id !== task._id);
  const k = others.findIndex(t => t._id === next._id);
  if (k < 0) return null;
  return computeDropPosition(others, dir < 0 ? k : k + 1);
}
