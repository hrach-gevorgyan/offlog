// Shared between KanbanBoard.svelte (card tag chips) and TagManager.svelte
// (the color picker) so the hash-to-palette fallback and the override lookup
// live in exactly one place. See db.ts's getTagColorOverrides()/setTagColor()
// for how an override is persisted.
//
// Tags are free-text, not a fixed taxonomy (there is no built-in "bug"=red
// mapping), so the fallback is a deterministic hash into a small fixed
// palette: every tag gets its own color, consistent everywhere in the app,
// without inventing a category system the data model doesn't have.
//
// 24 hues, ordered around the wheel (each entry commented with its hue in
// degrees). Was 12 -- doubling to 24 means an average 15-degree gap
// between neighbours, tighter than the earlier "densest stretch" (green/
// emerald/teal/cyan at ~16 degrees apart) that got one color removed for
// being too tight. At this count every neighbour pair is that tight or
// tighter -- an honest limit of any hue-only palette this size, not
// something spacing can fix. Verified anyway: at the 32% pastel mix used
// for tag chips, every one of the 24 clears WCAG AA against var(--text)
// with a large margin (worst case blueviolet at 8.5:1). Collisions are
// inevitable past 24 tags by the pigeonhole principle alone;
// ensureFreshTagColor() (db/tags.ts) reduces how often that happens for
// newly-typed tags, it doesn't eliminate it.
export const TAG_PALETTE = [
  '#EF4444', // red         0
  '#E25B36', // vermillion  13
  '#F97316', // orange      25
  '#F59E0B', // amber       38
  '#EAB308', // yellow      45
  '#84CC16', // lime        74
  '#8CE236', // chartreuse  90
  '#53E236', // spring green 110
  '#22C55E', // green       142
  '#36E28F', // mint        151
  '#10B981', // emerald     160
  '#14B8A6', // teal        173
  '#06B6D4', // cyan        189
  '#0EA5E9', // sky         199
  '#3B82F6', // blue        217
  '#3659E2', // cornflower  228
  '#6366F1', // indigo      239
  '#4D36E2', // blue-violet 248
  '#8B5CF6', // violet      258
  '#A855F7', // purple      271
  '#D946EF', // fuchsia     292
  '#E236C6', // magenta     310
  '#EC4899', // pink        330
  '#F43F5E', // rose        351
];

export function hashTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

export function resolveTagColor(tag: string, overrides: Record<string, string>): string {
  return overrides[tag] ?? hashTagColor(tag);
}
