import { describe, expect, it } from 'vitest';
import { exactIntegerThresholdPattern } from './regexThreshold';

describe('exactIntegerThresholdPattern', () => {
  it('keeps non-round two-digit floors exact', () => {
    expect(exactIntegerThresholdPattern(64)).toBe('6[4-9]|[7-9].|\\d..');
  });

  it('keeps non-round three-digit floors exact', () => {
    expect(exactIntegerThresholdPattern(115)).toBe('11[5-9]|1[2-9].|[2-9]..');
    expect(exactIntegerThresholdPattern(245)).toBe('24[5-9]|2[5-9].|[3-9]..');
  });

  it('retains compact round-boundary forms', () => {
    expect(exactIntegerThresholdPattern(20)).toBe('[2-9].|\\d..');
    expect(exactIntegerThresholdPattern(100)).toBe('\\d..');
    expect(exactIntegerThresholdPattern(200)).toBe('[2-9]..');
  });
});
