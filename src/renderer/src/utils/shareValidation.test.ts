import { describe, expect, it } from 'vitest';
import { hasImpossibleAtlasPoints } from './shareValidation';

describe('hasImpossibleAtlasPoints', () => {
  it('blocks an allocation above the captured maximum', () => {
    expect(hasImpossibleAtlasPoints(139, 138)).toBe(true);
  });

  it('allows valid, incomplete, and unavailable captures', () => {
    expect(hasImpossibleAtlasPoints(138, 138)).toBe(false);
    expect(hasImpossibleAtlasPoints(120, 138)).toBe(false);
    expect(hasImpossibleAtlasPoints(null, 138)).toBe(false);
    expect(hasImpossibleAtlasPoints(139, null)).toBe(false);
    expect(hasImpossibleAtlasPoints(1, 0)).toBe(false);
  });
});
