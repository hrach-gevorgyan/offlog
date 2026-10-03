import { describe, expect, it } from 'vitest';
import { wantsLightInk } from '../src/lib/tagColors';
describe('wantsLightInk', () => {
  it('picks the ink with more contrast: white on dark and mid-dark fills, dark ink on light ones', () => {
    expect(wantsLightInk('#1f2937')).toBe(true);
    expect(wantsLightInk('#575fca')).toBe(true);
    expect(wantsLightInk('#3b82f6')).toBe(false); // white 3.7:1, dark ink 4.1:1
    expect(wantsLightInk('#f59e0b')).toBe(false);
    expect(wantsLightInk('#06b6d4')).toBe(false);
    expect(wantsLightInk('not a colour')).toBe(true);
  });
});

import { colourName } from '../src/lib/tagColors';
describe('colourName', () => {
  it('names palette colours for screen readers; anything else is a custom colour', () => {
    expect(colourName('#3b82f6')).toBe('Blue');
    expect(colourName('#EF4444')).toBe('Red');
    expect(colourName('#123456')).toBe('Custom colour');
  });
});

import { bandColours, soften, TAG_PALETTE } from '../src/lib/tagColors';
describe('bandColours', () => {
  const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (h: number[]) => 0.2126 * lin(h[0]) + 0.7152 * lin(h[1]) + 0.0722 * lin(h[2]);
  const cr = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const near = (a: string, b: string) => rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= 3);
  const LIGHT = { light: '#ffffff', dark: '#1f2937' }, DARK = { light: '#eff0fc', mix: '#181a20' };
  const mixed = (h: string) => rgb(h).map((v, i) => Math.round(0.62 * v + 0.38 * rgb('#181a20')[i]));

  it('keeps a colour that already reads, with the ink that reads better', () => {
    expect(bandColours('#F59E0B', LIGHT)).toEqual({ fill: soften('#F59E0B'), lightInk: false });
    expect(bandColours('#4D36E2', LIGHT)).toEqual({ fill: soften('#4D36E2'), lightInk: true });
    expect(bandColours('#3B82F6', DARK)).toEqual({ fill: soften('#3B82F6'), lightInk: true });
  });

  it('darkens a mid colour just enough for white text (matches the browser’s own oklch maths)', () => {
    const red = bandColours('#EF4444', LIGHT), blue = bandColours('#3B82F6', LIGHT);
    expect(red.lightInk).toBe(true); expect(near(red.fill, '#cc4a46')).toBe(true);
    expect(blue.lightInk).toBe(true); expect(near(blue.fill, '#3e74ce')).toBe(true);
    const hex = (a: number[]) => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
    expect(near(hex(mixed(bandColours('#EAB308', DARK).fill)), '#846b2b')).toBe(true);
  });

  it('darkens exactly the palette colours that fall short, each to 4.5:1 or more', () => {
    const light = TAG_PALETTE.filter(h => bandColours(h, LIGHT).fill !== soften(h));
    const dark = TAG_PALETTE.filter(h => bandColours(h, DARK).fill !== soften(h));
    expect(light).toEqual(['#EF4444', '#E25B36', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#E236C6', '#EC4899', '#F43F5E']);
    expect(dark).toEqual(['#F59E0B', '#EAB308', '#84CC16', '#8CE236', '#53E236', '#22C55E', '#36E28F', '#14B8A6', '#06B6D4']);
    for (const h of light) expect(cr(rgb(bandColours(h, LIGHT).fill), rgb('#ffffff'))).toBeGreaterThanOrEqual(4.5);
    for (const h of dark) expect(cr(mixed(bandColours(h, DARK).fill), rgb('#eff0fc'))).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back when a token is not a hex colour', () => {
    expect(bandColours('#EF4444', { light: '', dark: '#1f2937' })).toEqual({ fill: soften('#EF4444'), lightInk: false });
  });
});

describe('bandColours fallback', () => {
  it('an unreadable dark ink still offers both inks', () => {
    expect(bandColours('#3B82F6', { light: '#ffffff', dark: '' }).lightInk).toBe(false);
    expect(bandColours('#3B82F6', { light: '#eff0fc', mix: '' }).lightInk).toBe(true);
  });
  it('reads short hex tokens, as the built CSS has them', () => {
    expect(bandColours('#EF4444', { light: '#fff', dark: '#1f2937' })).toEqual(bandColours('#EF4444', { light: '#ffffff', dark: '#1f2937' }));
    expect(bandColours('#EF4444', { light: '#fff', dark: '#1f2937' }).lightInk).toBe(true);
  });
});
