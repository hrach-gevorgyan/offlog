// Spaces originally had no icon field at all — Sidebar.svelte hardcoded a
// glyph per the 3 seeded space ids (+ the no-longer-seeded "family"), and
// any other space fell back to a generic default that visually collided
// with the Dashboard nav button's own icon (owner-reported, 2026-07-15,
// see DEFAULT_ICON below). This adds a real per-space icon choice, kept
// deliberately small ("a basic icon picker," not a full icon library) —
// SpaceManager.svelte renders SPACE_ICONS as the picker grid.
export const SPACE_ICONS: { key: string; svg: string }[] = [
  { key: 'folder', svg: `<path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3l1.8 2h7.2a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"/>` },
  { key: 'briefcase', svg: `<rect x="2" y="7" width="16" height="11" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>` },
  { key: 'home', svg: `<path d="M3 10L10 3l7 7"/><path d="M5 8v9h4v-5h2v5h4V8"/>` },
  { key: 'person', svg: `<circle cx="10" cy="7" r="4"/><path d="M2 18c0-4 3.6-7 8-7s8 3 8 7"/>` },
  { key: 'star', svg: `<path d="M10 2.5l2.3 4.9 5.2.6-3.9 3.7 1 5.3-4.6-2.6-4.6 2.6 1-5.3-3.9-3.7 5.2-.6z"/>` },
  { key: 'heart', svg: `<path d="M10 17S2.5 12.4 2.5 7.4a3.9 3.9 0 0 1 7-2.4 3.9 3.9 0 0 1 7 2.4C17.5 12.4 10 17 10 17z"/>` },
  { key: 'book', svg: `<path d="M3 4a1 1 0 0 1 1-1h5v14H4a1 1 0 0 1-1-1z"/><path d="M17 4a1 1 0 0 0-1-1h-5v14h5a1 1 0 0 0 1-1z"/>` },
  { key: 'rocket', svg: `<path d="M10 2c2.5 1.5 4 4.5 4 8 0 2-1 4-1 4H7s-1-2-1-4c0-3.5 1.5-6.5 4-8z"/><circle cx="10" cy="8" r="1.4"/><path d="M7 14l-2 4M13 14l2 4"/>` },
  { key: 'tag', svg: `<path d="M9 2H4a2 2 0 0 0-2 2v5l8.5 8.5a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8L9 2z"/><circle cx="6.5" cy="6.5" r="1"/>` },
  { key: 'calendar', svg: `<rect x="2" y="4" width="16" height="14" rx="2"/><path d="M2 8h16M6 2v4M14 2v4"/>` },
  { key: 'cart', svg: `<circle cx="7" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/><path d="M2 3h2l2.2 10.4a2 2 0 0 0 2 1.6h7a2 2 0 0 0 2-1.6L18 6H5"/>` },
  { key: 'dollar', svg: `<path d="M10 2v16M13.5 5.5c0-1.4-1.6-2.5-3.5-2.5S6.5 4 6.5 5.5 8 8 10 8s3.5 1 3.5 2.5-1.6 2.5-3.5 2.5-3.5-1-3.5-2.5"/>` },
  { key: 'graduation', svg: `<path d="M2 7l8-4 8 4-8 4-8-4z"/><path d="M5 9v4c0 1.5 2.2 2.5 5 2.5s5-1 5-2.5V9"/><path d="M18 7v5"/>` },
  { key: 'code', svg: `<polyline points="7,5 2,10 7,15"/><polyline points="13,5 18,10 13,15"/>` },
  { key: 'plane', svg: `<path d="M2 10l16-7-6 16-3-6z"/><path d="M12 12L18 3"/>` },
  { key: 'music', svg: `<path d="M8 16a2 2 0 1 1-2-2 2 2 0 0 1 2 2z"/><path d="M16 14a2 2 0 1 1-2-2 2 2 0 0 1 2 2z"/><path d="M8 16V5l8-2v11"/>` },
  { key: 'camera', svg: `<rect x="2" y="6" width="16" height="11" rx="2"/><circle cx="10" cy="11.5" r="3.2"/><path d="M7 6l1.2-2h3.6L13 6"/>` },
  { key: 'gift', svg: `<rect x="3" y="8" width="14" height="9" rx="1"/><path d="M3 8h14M10 8v9"/><path d="M10 8C8 4 4 5 4 7s3 1 6 1zM10 8c2-4 6-3 6-1s-3 1-6 1z"/>` },
  { key: 'wrench', svg: `<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l-1-1 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6 1 1z"/>` },
  { key: 'globe', svg: `<circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2a13 13 0 0 1 0 16M10 2a13 13 0 0 0 0 16"/>` },
  { key: 'lightbulb', svg: `<path d="M7 15h6M8 18h4"/><path d="M10 2a6 6 0 0 0-3 11.2c.6.4 1 1 1 1.8h4c0-.8.4-1.4 1-1.8A6 6 0 0 0 10 2z"/>` },
  { key: 'flag', svg: `<path d="M4 2v16"/><path d="M4 3h9l-2 3 2 3H4"/>` },
  { key: 'clock', svg: `<circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 2"/>` },
  { key: 'gamepad', svg: `<rect x="2" y="6" width="16" height="9" rx="3"/><path d="M6 8.5v4M4 10.5h4"/><circle cx="14" cy="9" r="1"/><circle cx="16" cy="11" r="1"/>` },
  { key: 'paw', svg: `<circle cx="6" cy="6" r="1.6"/><circle cx="10" cy="4.5" r="1.6"/><circle cx="14" cy="6" r="1.6"/><path d="M10 9c-3 0-5 2-5 4.5S7 17 10 17s5-1 5-3.5S13 9 10 9z"/>` },
];

export const DEFAULT_SPACE_ICON_KEY = 'folder';

// Legacy hardcoded glyphs for the 3 seeded space ids (+ no-longer-seeded
// "family") — kept as-is for any database created before the icon field
// existed, so an old install's spaces don't all suddenly show "folder".
const LEGACY_ID_ICON: Record<string, string> = {
  'space:unsorted': `<rect x="2" y="3" width="16" height="14" rx="2"/><polyline points="2,9 20,9"/><polyline points="6,13 10,13 10,16 14,16"/>`,
  'space:personal': SPACE_ICONS.find(i => i.key === 'person')!.svg,
  'space:family': `<path d="M3 10L10 3l7 7"/><path d="M5 8v9h4v-5h2v5h4V8"/>`,
  'space:work': SPACE_ICONS.find(i => i.key === 'briefcase')!.svg,
};

function wrap(inner: string): string {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export function getSpaceIconSvg(space: { _id: string; icon?: string }): string {
  if (space.icon) {
    const found = SPACE_ICONS.find(i => i.key === space.icon);
    if (found) return wrap(found.svg);
  }
  const legacy = LEGACY_ID_ICON[space._id];
  if (legacy) return wrap(legacy);
  return wrap(SPACE_ICONS.find(i => i.key === DEFAULT_SPACE_ICON_KEY)!.svg);
}
