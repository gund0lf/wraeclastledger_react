/**
 * mapParser.fixtures.test.ts — real Ancestors-event clipboards provided by Sad
 * (July 2026, IMPROVEMENT_PLAN.md WP1 fixture 1). Complements the synthetic
 * cases in mapParser.test.ts with verbatim current-league tooltips covering
 * all four subtypes plus blighted / deli / chiseled variants.
 *
 * All expected values below were produced by running these exact strings
 * through parseMapClipboard — they assert VERIFIED current behavior.
 *
 * RESOLVED 2026-07-02 (Sad's call: div cards are their OWN stat/drop pool,
 * exactly like currency/scarabs/maps are distinct pools):
 *   moreDivCards added to MapData + a parser extractor; QUALITY_STAT_EFFECTS
 *   gained the game-accurate "Divination Cards" key; CHISEL_TYPES.Divination
 *   repointed from moreCurrency to moreDivCards. Tests below assert the
 *   FIXED behavior. (Open questions now live in HANDOVER.md, not here.)
 */

import { describe, it, expect } from 'vitest';
import { parseMapClipboard } from './mapParser';
import { MAP_CLIPBOARDS } from './__fixtures__/wp1Fixtures';
import { QUALITY_STAT_EFFECTS } from './constants';

const parse = (key: keyof typeof MAP_CLIPBOARDS) => {
  const r = parseMapClipboard(MAP_CLIPBOARDS[key]);
  expect(r).not.toBeNull();
  return r!;
};

describe('real fixtures — regular maps', () => {
  it('regular alched T16 (Bleak Inscription)', () => {
    const m = parse('regularAlched');
    expect(m.tier).toBe(16);
    expect(m.name).toBe('Bleak Inscription');
    expect(m.quantity).toBe(52);
    expect(m.rarity).toBe(31);
    expect(m.packSize).toBe(20);
    expect(m.quality).toBe(0);
    expect(m.modCount).toBe(4);
    expect(m.isOriginator).toBe(false);
    expect(m.isNightmare).toBe(false);
    expect(m.isCorrupted).toBe(false);
  });

  it('Divination-chiseled T16 (Desolate Compass): div cards tracked as their own stat', () => {
    const m = parse('regularChiseled');
    expect(m.quantity).toBe(55);
    expect(m.quality).toBe(20);
    expect(m.qualityType).toBe('Divination Cards');
    expect(m.moreDivCards).toBe(50);   // own stat — NOT folded into currency
    expect(m.moreCurrency).toBe(0);
    expect(QUALITY_STAT_EFFECTS[m.qualityType]).toEqual({ statKey: 'moreDivCards', multiplier: 2.5 });
    expect(m.modCount).toBe(4);
  });

  it('deli-orbed T16 (Whispering Toil): enchant section is not counted as mods', () => {
    const m = parse('regularDeli');
    expect(m.quantity).toBe(65);
    expect(m.rarity).toBe(40);
    expect(m.packSize).toBe(25);
    expect(m.modCount).toBe(6); // the six explicit mods, NOT the two enchant lines
    expect(m.isCorrupted).toBe(false);
    expect(m.deliriousPct).toBe(20);
    expect(m.deliriumRewardTypes).toEqual(['Map Items']);
  });

  it('blighted T14 (Anguish Artifice): implicit block is not counted as mods', () => {
    const m = parse('blighted');
    expect(m.tier).toBe(14);
    expect(m.name).toBe('Anguish Artifice');
    expect(m.quality).toBe(20);
    expect(m.qualityType).toBe('Divination Cards');
    expect(m.moreDivCards).toBe(50);
    expect(m.modCount).toBe(4); // four explicits; the four implicit lines excluded
  });
});

describe('real 3.29 advanced-copy fixtures', () => {
  it('counts Sad’s split-Thorns Hate Route as exactly four affixes', () => {
    const m = parse('allflameHateRoute');
    expect(m.name).toBe('Hate Route');
    expect(m.tier).toBe(2);
    expect(m.explicitModCount).toBe(4);
    expect(m.rawText).toContain('26(20-30)% increased Magic Monsters');
  });

  it('counts a dual-line Punishing block as one affix and tolerates new riders', () => {
    const m = parse('allflameDualThorns');
    expect(m.explicitModCount).toBe(1);
    expect(m.moreCurrency).toBe(47);
    expect(m.rawText).toContain('47% more Currency found in Area');
  });
});

describe('real fixtures — subtypes', () => {
  it('8-mod corrupted T16 (Rune Crosscut): Corrupted section detected; modCount counts LINES', () => {
    const m = parse('eightModCorrupted');
    expect(m.quantity).toBe(101);
    expect(m.rarity).toBe(61);
    expect(m.packSize).toBe(39);
    expect(m.isCorrupted).toBe(true);
    expect(m.isNightmare).toBe(false);
    // NOTE: modCount is the count of mod LINES (multi-line mods count each
    // line): 11 here for an 8-mod map. Everything downstream only relies on
    // modCount > 6 for 8-mod detection, which this satisfies.
    expect(m.modCount).toBe(11);
    expect(m.modCount).toBeGreaterThan(6);
  });

  it('uncorrupted Nightmare map (Fate Incitement): restriction footer is NOT corruption', () => {
    const m = parse('nightmare');
    expect(m.isNightmare).toBe(true);
    expect(m.isCorrupted).toBe(false); // "Modifiable only with..." must not trip it
    expect(m.tier).toBe(16);           // no tier line -> defaults to 16
    expect(m.quantity).toBe(75);
    expect(m.rarity).toBe(85);
    expect(m.packSize).toBe(29);
    expect(m.moreMaps).toBe(35);
    expect(m.moreScarabs).toBe(60);
    expect(m.modCount).toBe(11);
  });

  it('Originator T16, 80% deli, Currency-chiseled (Ominous Intent)', () => {
    const m = parse('originatorDeli');
    expect(m.isOriginator).toBe(true);
    expect(m.isEmpoweredMirage).toBe(false);
    expect(m.isCorrupted).toBe(false); // trailing "Split" section is not corruption
    expect(m.tier).toBe(16);
    expect(m.quantity).toBe(90);
    expect(m.rarity).toBe(160);
    expect(m.packSize).toBe(59);
    expect(m.moreCurrency).toBe(144);
    expect(m.quality).toBe(20);
    expect(m.qualityType).toBe('Currency');
    expect(QUALITY_STAT_EFFECTS[m.qualityType]).toBeDefined();
    expect(m.modCount).toBe(8); // implicit + enchant sections correctly excluded
    expect(m.deliriousPct).toBe(80);
    expect(m.deliriumRewardTypes).toEqual(['Currency', 'Currency', 'Currency', 'Currency']);
  });
});

describe('real fixtures — chisel quality strings (all five game strings verified 2026-07-02)', () => {
  // [fixture key, exact in-game "Quality (...)" string, statKey it must map to]
  const CASES: [keyof typeof MAP_CLIPBOARDS, string, string][] = [
    ['chiseledCurrency',    'Currency',         'moreCurrency'],
    ['chiseledRarity',      'Rarity',           'rarity'],
    ['chiseledPackSize',    'Pack Size',        'packSize'],
    ['chiseledScarabs',     'Scarabs',          'moreScarabs'],
    ['chiseledDivination2', 'Divination Cards', 'moreDivCards'],
  ];

  for (const [key, qualityType, statKey] of CASES) {
    it(`"Quality (${qualityType})" parses and maps to ${statKey}`, () => {
      const m = parse(key);
      expect(m.quality).toBe(20);
      expect(m.qualityType).toBe(qualityType);
      expect(QUALITY_STAT_EFFECTS[m.qualityType]?.statKey).toBe(statKey);
    });
  }

  it('granted stats extract correctly on the chisel fixtures', () => {
    expect(parse('chiseledPackSize').moreMaps).toBe(35);      // More Maps on a regular map
    expect(parse('chiseledPackSize').moreCurrency).toBe(45);
    expect(parse('chiseledScarabs').moreScarabs).toBe(50);
    expect(parse('chiseledDivination2').moreDivCards).toBe(50);
    expect(parse('chiseledDivination2').moreCurrency).toBe(47); // both stats coexist
    expect(parse('chiseledRarity').moreCurrency).toBe(94);
    expect(parse('chiseledCurrency').moreCurrency).toBe(95);
  });

  it('all five are Originator split maps — subtype detection holds under stat-dense headers', () => {
    for (const [key] of CASES) {
      const m = parse(key);
      expect(m.isOriginator).toBe(true);
      expect(m.isCorrupted).toBe(false); // trailing "Split" is not corruption
      expect(m.tier).toBe(16);
    }
  });
});
