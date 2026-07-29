// Shared between KanbanBoard.svelte (card tag chips) and TagManager.svelte
// (the color picker) so the hash-to-palette fallback and the override
// lookup live in exactly one place. See db.ts's getTagColorOverrides()/
// setTagColor() for how an override is persisted (v6.11.0).
//
// redesign/v6, follow-up critique (2026-07-28): tags all rendered as
// identical gray, forcing the user to read each one rather than
// recognize it by color. Offlog tags are free-text, not a fixed
// taxonomy (no built-in "bug"=red mapping) -- a deterministic hash to
// a small fixed palette gives every tag its own consistent color
// across the whole app (same tag always looks the same) without
// inventing a category system that doesn't exist in the data model.
export const TAG_PALETTE = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export function hashTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

export function resolveTagColor(tag: string, overrides: Record<string, string>): string {
  return overrides[tag] ?? hashTagColor(tag);
}
