import { describe, expect, it } from 'vitest';
import { divineEquivalent } from './currencyDisplay';

describe('divineEquivalent', () => {
  it('converts a valid chaos value using its authored Divine snapshot', () => {
    expect(divineEquivalent(34173, 215)).toBeCloseTo(158.944, 3);
  });

  it('supports a caller-selected display threshold', () => {
    expect(divineEquivalent(214, 215, 1)).toBeNull();
    expect(divineEquivalent(215, 215, 1)).toBe(1);
    expect(divineEquivalent(-430, 215, 1)).toBe(-2);
  });

  it('rejects absent, invalid, and nonpositive Divine prices', () => {
    expect(divineEquivalent(100, null)).toBeNull();
    expect(divineEquivalent(100, 0)).toBeNull();
    expect(divineEquivalent(100, Number.NaN)).toBeNull();
  });
});
