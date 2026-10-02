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
