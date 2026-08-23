// Shared between KanbanBoard.svelte (card tag chips) and TagManager.svelte
// (the color picker) so the hash-to-palette fallback and the override lookup
// live in exactly one place. See db.ts's getTagColorOverrides()/setTagColor()
// for how an override is persisted.
//
// Tags are free-text, not a fixed taxonomy (there is no built-in "bug"=red
// mapping), so the fallback is a deterministic hash into a small fixed
// palette: every tag gets its own color, consistent everywhere in the app,
// without inventing a category system the data model doesn't have.
export const TAG_PALETTE = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export function hashTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

export function resolveTagColor(tag: string, overrides: Record<string, string>): string {
  return overrides[tag] ?? hashTagColor(tag);
}
