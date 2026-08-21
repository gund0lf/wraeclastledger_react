import { describe, it, expect } from 'vitest';
import { isParseIdentical, markPossibleDuplicates } from './mapDuplicates';
import type { MapData } from '../types';

const base = (over: Partial<MapData> = {}): MapData => ({
  id: 'id-' + Math.random(), tier: 16, name: 'Crimson Temple Map',
  quantity: 92, rarity: 55, packSize: 31,
  quality: 20, qualityType: 'Quality',
  moreCurrency: 0, moreMaps: 0, moreScarabs: 0, moreDivCards: 0,
  modCount: 6,
  isOriginator: false, isEmpoweredMirage: false, isNightmare: false, isCorrupted: false,
  parsedAt: Date.now(),
  rawText: 'Item Class: Maps ...',
  ...over,
} as MapData);

describe('isParseIdentical', () => {
  it('ignores id, parsedAt and rawText', () => {
    const a = base({ id: 'a', parsedAt: 1, rawText: 'x' });
    const b = base({ id: 'b', parsedAt: 2, rawText: 'y' });
    expect(isParseIdentical(a, b)).toBe(true);
  });

  it('any differing parsed field breaks identity', () => {
    const a = base();
    expect(isParseIdentical(a, base({ quantity: 93 }))).toBe(false);
    expect(isParseIdentical(a, base({ name: 'Dune Map' }))).toBe(false);
    expect(isParseIdentical(a, base({ isCorrupted: true }))).toBe(false);
    expect(isParseIdentical(a, base({ modCount: 8 }))).toBe(false);
  });

  it('normalizes optional additive fields (old persisted map vs fresh re-parse)', () => {
    // old maps lack moreDivCards / isUnidentified / Delirium metadata entirely
    const old = base();
    delete (old as any).moreDivCards;
    delete (old as any).isUnidentified;
    delete old.deliriousPct;
    delete old.deliriumRewardTypes;
    expect(isParseIdentical(old, base({
      moreDivCards: 0,
      isUnidentified: false,
      deliriumRewardTypes: [],
    }))).toBe(true);
    expect(isParseIdentical(old, base({ moreDivCards: 5 }))).toBe(false);
  });

  it('includes ordered and repeated Delirium metadata in identity', () => {
    const a = base({ deliriousPct: 100, deliriumRewardTypes: ['Jewellery', 'Jewellery', 'Currency'] });
    expect(isParseIdentical(a, base({
      deliriousPct: 100,
      deliriumRewardTypes: ['Jewellery', 'Jewellery', 'Currency'],
    }))).toBe(true);
    expect(isParseIdentical(a, base({
      deliriousPct: 80,
      deliriumRewardTypes: ['Jewellery', 'Jewellery', 'Currency'],
    }))).toBe(false);
    expect(isParseIdentical(a, base({
      deliriousPct: 100,
      deliriumRewardTypes: ['Jewellery', 'Currency', 'Jewellery'],
    }))).toBe(false);
    expect(isParseIdentical(a, base({
      deliriousPct: 100,
      deliriumRewardTypes: ['Jewellery', 'Currency'],
    }))).toBe(false);
  });
});

describe('markPossibleDuplicates', () => {
  it('marks the LATER map of an identical adjacent pair', () => {
    const a = base({ id: 'a' });
    const b = base({ id: 'b' });
    const dup = markPossibleDuplicates([a, b]);
    expect(dup.has('a')).toBe(false);
    expect(dup.has('b')).toBe(true);
  });

  it('marks the later occurrence of an exact non-adjacent repeat', () => {
    const a = base({ id: 'a' });
    const other = base({ id: 'x', name: 'Dune Map' });
    const c = base({ id: 'c' });
    expect([...markPossibleDuplicates([a, other, c])]).toEqual(['c']);
  });

  it('does not flag maps that differ in any parsed display/stat field', () => {
    const a = base({ id: 'a' });
    const quantityDiff = base({ id: 'b', quantity: 93 });
    const divCardDiff = base({ id: 'c', moreDivCards: 1 });
    expect(markPossibleDuplicates([a, quantityDiff, divCardDiff]).size).toBe(0);
  });

  it('a run of N identical maps marks maps 2..N', () => {
    const maps = [base({ id: 'a' }), base({ id: 'b' }), base({ id: 'c' })];
    const dup = markPossibleDuplicates(maps);
    expect([...dup].sort()).toEqual(['b', 'c']);
  });

  it('empty and single-map logs mark nothing', () => {
    expect(markPossibleDuplicates([]).size).toBe(0);
    expect(markPossibleDuplicates([base()]).size).toBe(0);
  });
});
