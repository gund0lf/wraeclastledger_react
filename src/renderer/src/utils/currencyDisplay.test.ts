import { describe, expect, it } from 'vitest';
import {
  divineEquivalent,
  formatChaosValue,
  formatDivineValue,
  lootCurrencyPresentation,
  normalizeLootCurrencyMode,
} from './currencyDisplay';

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

describe('loot currency presentation', () => {
  it('keeps chaos as the safe default for missing and invalid preferences', () => {
    expect(normalizeLootCurrencyMode(undefined)).toBe('chaos');
    expect(normalizeLootCurrencyMode('both')).toBe('chaos');
    expect(normalizeLootCurrencyMode('divine')).toBe('divine');
  });

  it('formats signed chaos and magnitude-aware Divine amounts consistently', () => {
    expect(formatChaosValue(1234.56, true, 1)).toBe('+1,234.6c');
    expect(formatDivineValue(158.944)).toBe('158.9d');
    expect(formatDivineValue(12.345)).toBe('12.35d');
    expect(formatDivineValue(0.12345, true)).toBe('+0.123d');
  });

  it('shows one requested primary unit while retaining the alternate total', () => {
    expect(lootCurrencyPresentation(34173, 215, 'chaos')).toEqual({
      effectiveMode: 'chaos',
      primary: '34,173c',
      secondary: '158.9d',
      chaos: '34,173c',
      divine: '158.9d',
    });
    expect(lootCurrencyPresentation(34173, 215, 'divine')).toEqual({
      effectiveMode: 'divine',
      primary: '158.9d',
      secondary: '34,173c',
      chaos: '34,173c',
      divine: '158.9d',
    });
  });

  it('falls back to chaos when pooled evidence has no single Divine snapshot', () => {
    expect(lootCurrencyPresentation(34173, null, 'divine')).toEqual({
      effectiveMode: 'chaos',
      primary: '34,173c',
      secondary: null,
      chaos: '34,173c',
      divine: null,
    });
  });
});
