// Tags: free-form strings on each task, plus the per-tag colour overrides.
import type { TagColorDoc } from '../types';
import { db, SOURCE, getAllTasksRaw, invalidateTaskCache, now } from './core';

// ── Tags ──────────────────────────────────────────────────────────────────────


// Optional projectId narrows to just that project's tags — used to rank
// tag-input suggestions "used in this project" first.
export async function getAllTags(projectId?: string): Promise<string[]> {
  const all = await getAllTasksRaw();
  const scoped = projectId ? all.filter(d => d.project_id === projectId) : all;
  const set = new Set<string>();
  scoped.forEach(d => d.tags?.forEach(t => set.add(t)));
  return [...set].sort();
}

// ── Tag management ───────────────────────────────────────────────────────
// Tags are free-form strings on each task with no central record — these
// operate directly across every task's tags array via bulkDocs rather than
// one updateTask() per task, and (like the retention-pruning functions
// above) deliberately skip logChange() per affected task: a rename/delete
// can touch hundreds of tasks at once, and one changelog entry per task
// would drown out everything else in the activity log for what's really a
// single admin action.

// Per-tag color override: one small doc per overridden tag (`tag:<name>`),
// point-lookup only, and unlogged like the bulk tag operations above.
// ExistingDocument, not the bare TagColorDoc: `_rev` is optional on the
// interface (a doc being *created* doesn't have one yet) but db.get() only
// ever returns a doc that already exists, so it's always present here.
// Saying so is what lets callers pass the result straight to db.remove(),
// which requires a real _rev.
async function getTagColorDoc(tag: string): Promise<PouchDB.Core.ExistingDocument<TagColorDoc> | undefined> {
  try { return await db.get<TagColorDoc>(`tag:${tag}`); } catch { return undefined; }
}

export async function getTagColorOverrides(): Promise<Record<string, string>> {
  const r = await db.allDocs<TagColorDoc>({ startkey: 'tag:', endkey: 'tag:￰', include_docs: true });
  const out: Record<string, string> = {};
  for (const row of r.rows) if (row.doc) out[row.doc.tag] = row.doc.color;
  return out;
}

// color === null clears the override, reverting that tag back to its
// deterministic hash color (tagColors.ts).
export async function setTagColor(tag: string, color: string | null): Promise<void> {
  const existing = await getTagColorDoc(tag);
  if (color === null) {
    if (existing) await db.remove(existing);
    return;
  }
  await db.put<TagColorDoc>({
    _id: `tag:${tag}`,
    _rev: existing?._rev,
    type: 'tag_color',
    tag,
    color,
    updated_at: now(),
    source: SOURCE,
  });
}

export async function getTagCounts(): Promise<{ tag: string; count: number }[]> {
  const all = await getAllTasksRaw();
  const counts = new Map<string, number>();
  for (const t of all) {
    if (t.deleted) continue;
    for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// Renaming to a tag that already exists elsewhere acts as a merge — each
// affected task's tags are deduped via Set rather than ending up with the
// same tag listed twice.
export async function renameTag(oldTag: string, newTag: string): Promise<number> {
  const trimmed = newTag.trim();
  if (!trimmed || trimmed === oldTag) return 0;
  const all = await getAllTasksRaw();
  const affected = all.filter(t => !t.deleted && t.tags?.includes(oldTag));
  if (!affected.length) return 0;
  const updates = affected.map(t => ({
    ...t,
    tags: [...new Set(t.tags.map(tag => (tag === oldTag ? trimmed : tag)))],
    updated_at: now(), source: SOURCE,
  }));
  await db.bulkDocs(updates);
  invalidateTaskCache();
  // Carry the old tag's color override to the new name -- but only if the
  // new name doesn't already have its own override, since merging into an
  // existing tag should keep that tag's color, not the one being merged away.
  const oldColorDoc = await getTagColorDoc(oldTag);
  if (oldColorDoc) {
    const newHasOverride = await getTagColorDoc(trimmed);
    if (!newHasOverride) await setTagColor(trimmed, oldColorDoc.color);
    await db.remove(oldColorDoc);
  }
  return updates.length;
}

export async function deleteTagEverywhere(tag: string): Promise<number> {
  const all = await getAllTasksRaw();
  const affected = all.filter(t => !t.deleted && t.tags?.includes(tag));
  const updates = affected.map(t => ({
    ...t,
    tags: t.tags.filter(x => x !== tag),
    updated_at: now(), source: SOURCE,
  }));
  if (updates.length) {
    await db.bulkDocs(updates);
    invalidateTaskCache();
  }
  const colorDoc = await getTagColorDoc(tag);
  if (colorDoc) await db.remove(colorDoc);
  return updates.length;
}
