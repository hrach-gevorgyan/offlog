import { describe, expect, it } from 'vitest';
import { heroShift, applyHeroShift } from '../src/lib/phone/livingHero';

describe('living hero', () => {
  it('drifts by season and deepens in the evening', () => {
    expect(heroShift(new Date(2026, 6, 1, 12))).toEqual({ dh: 0, dl: 0 });
    expect(heroShift(new Date(2026, 9, 1, 12)).dh).toBeGreaterThan(0);
    expect(heroShift(new Date(2026, 0, 1, 12)).dh).toBeLessThan(0);
    expect(heroShift(new Date(2026, 3, 1, 12)).dl).toBeGreaterThan(0);
    expect(heroShift(new Date(2026, 6, 1, 21)).dl).toBeLessThan(0);
    expect(heroShift(new Date(2026, 6, 1, 4)).dl).toBeLessThan(0);
  });
  it('stays small: never more than 10 degrees or 7% lightness', () => {
    for (let m = 0; m < 12; m++) for (const h of [3, 12, 22]) {
      const s = heroShift(new Date(2026, m, 1, h));
      expect(Math.abs(s.dh)).toBeLessThanOrEqual(10);
      expect(Math.abs(s.dl)).toBeLessThanOrEqual(0.07);
    }
  });
  it('sets the shift on <html>, where app.css derives --hero from it', () => {
    applyHeroShift(new Date(2026, 9, 1, 21));
    expect(document.documentElement.style.getPropertyValue('--hero-dh')).toBe('10');
    expect(document.documentElement.style.getPropertyValue('--hero-dl')).toBe('-0.06');
  });
});
