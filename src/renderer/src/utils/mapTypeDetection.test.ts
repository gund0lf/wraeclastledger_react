import { describe, expect, it } from 'vitest';
import type { MapData } from '../types';
import { inferMapType, isEightModCandidate } from './mapTypeDetection';

const map = (over: Partial<MapData> = {}): MapData => ({
  id: Math.random().toString(), tier: 16, name: 'Test Map',
  quantity: 100, rarity: 60, packSize: 40, quality: 0, qualityType: 'Standard',
  moreCurrency: 0, moreMaps: 0, moreScarabs: 0, moreDivCards: 0, modCount: 10,
  isOriginator: false, isEmpoweredMirage: false, isNightmare: false,
  isCorrupted: true, ...over,
});

describe('isEightModCandidate', () => {
  it('lets an exact advanced count override a misleading description-line count', () => {
    expect(isEightModCandidate(map({ explicitModCount: 6, modCount: 10 }))).toBe(false);
    expect(isEightModCandidate(map({ explicitModCount: 8, modCount: 10 }))).toBe(true);
  });

  it('retains the legacy heuristic for headerless persisted copies', () => {
    expect(isEightModCandidate(map({ explicitModCount: undefined, modCount: 10 }))).toBe(true);
    expect(isEightModCandidate(map({ explicitModCount: undefined, modCount: 6 }))).toBe(false);
  });

  it('never classifies an ordinary uncorrupted map as 8-mod', () => {
    expect(isEightModCandidate(map({ isCorrupted: false, explicitModCount: 8 }))).toBe(false);
  });
});

describe('inferMapType', () => {
  it('uses complete exact evidence immediately with the existing majority thresholds', () => {
    const eight = map({ explicitModCount: 8 });
    const six = map({ explicitModCount: 6 });
    expect(inferMapType([eight], '6-mod')).toBe('8-mod');
    expect(inferMapType([eight, eight, eight], '6-mod')).toBe('8-mod');
    expect(inferMapType([eight, eight, eight, six], '6-mod')).toBe('8-mod');
    expect(inferMapType([eight, eight, six, six], '6-mod')).toBe('6-mod');
  });

  it('retains the four-map gate for incomplete legacy evidence', () => {
    const legacyEight = map({ explicitModCount: undefined, modCount: 10 });
    expect(inferMapType([legacyEight], '6-mod')).toBe('6-mod');
    expect(inferMapType([legacyEight, legacyEight, legacyEight, legacyEight], '6-mod')).toBe('8-mod');
  });
});
