/**
 * sessionTime.test.ts — locks the time-input grammar (WP9 Tier 2).
 * Derivation and display formatting are covered in timeEstimate.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { parseTimeInput } from './sessionTime';

describe('parseTimeInput', () => {
  it('plain numbers are minutes', () => {
    expect(parseTimeInput('245')).toBe(245);
    expect(parseTimeInput(' 90 ')).toBe(90);
    expect(parseTimeInput('90.6')).toBe(91); // rounded
  });
  it('h suffix is hours (dot and comma decimals)', () => {
    expect(parseTimeInput('4h')).toBe(240);
    expect(parseTimeInput('4.5h')).toBe(270);
    expect(parseTimeInput('4,5h')).toBe(270);
    expect(parseTimeInput('0.5 h')).toBe(30);
    expect(parseTimeInput('4H')).toBe(240);
  });
  it('explicit minute suffixes tolerated', () => {
    expect(parseTimeInput('90m')).toBe(90);
    expect(parseTimeInput('90 min')).toBe(90);
    expect(parseTimeInput('90 minutes')).toBe(90);
  });
  it('empty / invalid / non-positive -> null (no claim)', () => {
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('   ')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('4h30m')).toBeNull(); // compound not in grammar
    expect(parseTimeInput('0')).toBeNull();
    expect(parseTimeInput('0h')).toBeNull();
    expect(parseTimeInput('-30')).toBeNull();
  });
});
