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
// degrees), an average 15-degree gap between neighbours. Every neighbour
// pair is that tight or tighter -- an honest limit of any hue-only palette this size, not
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

// Stored space and tag colours stay as picked; they are drawn about 20% less
// saturated (same hue and lightness) so the app's colours read calm rather
// than loud. Applied at render time so stored data, seed detection and
// tag-colour balancing all keep working on the original hex values.
// Uses CSS relative colour syntax (Chromium 119+). An older Android WebView
// would drop the whole declaration and the dot or tint would vanish, so there
// the stored colour is used as is.
const RELATIVE = typeof CSS !== 'undefined' && !!CSS.supports?.('color', 'oklch(from red l c h)');
export function soften(color: string): string {
  return RELATIVE ? `oklch(from ${color} l calc(c * 0.8) h)` : color;
}

// Whether white text reads better than the page's dark ink (--text, #1f2937,
// relative luminance about 0.019) on a solid fill of this colour. White wins
// exactly when (L + .05)² < 1.05 × 0.069, i.e. L < 0.22. Not a hex: white.
export function wantsLightInk(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L < 0.22;
}

// ── A solid colour band with text on it (the phone's project header) ─────
// soften() in plain maths, so the band can be checked and adjusted before it
// is drawn: OKLCH with chroma × 0.8, lightness lowered by `drop`.
// Accepts #rgb too: the CSS minifier shortens tokens like --on-hero to #fff.
const hexRgb = (hex: string): number[] | null => {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const toLin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
function softened(rgb: number[], drop: number): number[] {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s - drop;
  const A = 0.8 * (1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s);
  const B = 0.8 * (0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
  const l3 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m3 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s3 = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
  ].map(fromLin);
}
const lum = (rgb: number[]) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const toHex = (rgb: number[]) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');

// The band's fill and ink, so its small text clears WCAG AA (4.5:1) on any
// colour. `light`/`dark` are the two inks on offer (dark omitted: light ink
// only); `mix` is the page background a dark-mode band is blended into, 62%
// band, the same color-mix the CSS applies, which is where contrast is
// measured. A colour that falls short is darkened just enough for the light
// ink. Tokens that aren't hex fall back to soften()/wantsLightInk().
export function bandColours(hex: string, ink: { light: string; dark?: string; mix?: string }): { fill: string; lightInk: boolean } {
  const twoInks = ink.dark !== undefined, blended = ink.mix !== undefined;
  const base = hexRgb(hex), li = hexRgb(ink.light), di = twoInks ? hexRgb(ink.dark!) : null, mix = blended ? hexRgb(ink.mix!) : null;
  if (!base || !li || (twoInks && !di) || (blended && !mix)) return { fill: soften(hex), lightInk: twoInks ? wantsLightInk(hex) : true };
  const seen = (rgb: number[]) => mix ? rgb.map((v, i) => Math.round(0.62 * v + 0.38 * mix[i])) : rgb;
  const first = seen(softened(base, 0));
  if (di && contrast(first, di) >= 4.5 && contrast(first, di) > contrast(first, li)) return { fill: soften(hex), lightInk: false };
  if (contrast(first, li) >= 4.5) return { fill: soften(hex), lightInk: true };
  for (let drop = 0.005; drop <= 0.6; drop += 0.005) {
    const rgb = softened(base, drop);
    if (contrast(seen(rgb), li) >= 4.5) return { fill: toHex(rgb), lightInk: true };
  }
  return { fill: '#000000', lightInk: true };
}

// Spoken names for TAG_PALETTE, same order (colour pickers read these,
// not hex codes).
const PALETTE_NAMES = ['Red', 'Vermilion', 'Orange', 'Amber', 'Yellow', 'Lime', 'Chartreuse', 'Spring green', 'Green', 'Mint', 'Emerald', 'Teal', 'Cyan', 'Sky', 'Blue', 'Cornflower', 'Indigo', 'Blue-violet', 'Violet', 'Purple', 'Fuchsia', 'Magenta', 'Pink', 'Rose'];
export function colourName(hex: string): string {
  const i = TAG_PALETTE.findIndex(c => c.toLowerCase() === hex.trim().toLowerCase());
  return i >= 0 ? PALETTE_NAMES[i] : 'Custom colour';
}
