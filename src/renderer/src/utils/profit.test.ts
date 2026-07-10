/**
 * profit.test.ts — WP1 test suite for the extracted profit engine.
 *
 * The "Sad fixture" below is the REAL constructed 38-map session from
 * 2026-07-02 (see __fixtures__/README.md). Expected values were hand-verified
 * by Sad and corrected for the stale-rolling bug:
 *   Advanced Costs: chaos 750 + exalt 700 + scour 100 + alch 100 = 1650c,
 *   astrolabe 7x10 = 70c, deli 4/map x 100c -> live rolling @38 maps = 16920c.
 */
import { describe, it, expect } from 'vitest';
import { SessionSettings, LootItem } from '../types';
import {
  computeCosts, computeProfit, computeMultiplier,
  computeRollingSessionTotal, isPreservationScarab,
} from './profit';

/* ------------------------------------------------------------------ */
/* Fixture builders                                                    */
/* ------------------------------------------------------------------ */

const baseSettings = (over: Partial<SessionSettings> = {}): SessionSettings => ({
  divinePrice: 0,
  chiselUsed: false, chiselType: '', chiselPrice: 0,
  mapType: '6-mod', isSplitSession: false,
  fragmentsUsed: 0, smallNodesAllocated: 0, mountingModifiers: false,
  baseMapCost: 0,
  scarabs: Array(5).fill(null).map(() => ({ name: '', cost: 0 })),
  atlasBonus: false,
  leagueName: '', atlasDetectedTags: [],
  advChaos: 0,
  advExalt: 0, advExaltPrice: 0,
  advScour: 0, advScourPrice: 0,
  advAlch: 0, advAlchPrice: 0,
  advDeliOrbType: '', advDeliOrbQtyPerMap: 0, advDeliOrbPriceEach: 0,
  advSplitPrice: 0,
  advAstrolabeType: '', advAstrolabePrice: 0, advAstrolabeCount: 0,
  advGemCount: 0, advGemBuyPrice: 0, advGemSellPrice: 0, advGemName: '',
  regexExclusions: [],
  atlasTreeUrl: 'https://pathofpathing.com',
  atlasPoints: null, atlasPointsMax: null,
  ...over,
});

const loot = (total: number, excluded = false, name = 'Divine Orb'): LootItem => ({
  id: name + total, name, tab: 'curr', quantity: '1', price: '', total, excluded,
});

/** The Sad fixture — preservation variant. */
const SAD_PRESERVATION = (): SessionSettings => baseSettings({
  divinePrice: 500,
  baseMapCost: 1500,
  chiselUsed: true, chiselType: 'Avarice', chiselPrice: 150,
  mapType: '6-mod',
  fragmentsUsed: 5, smallNodesAllocated: 16, mountingModifiers: true,
  scarabs: [
    { name: 'Horned Scarab of Preservation', cost: 7 },
    { name: 'Horned Scarab of Bloodlines',   cost: 100 },
    { name: 'Breach Scarab of Instability',  cost: 5 },
    { name: 'Cartography Scarab of Risk',    cost: 70 },
    { name: 'Scarab of Wisps',               cost: 20 },
  ],
  advChaos: 750,
  advExalt: 500, advExaltPrice: 700,
  advScour: 500, advScourPrice: 100,
  advAlch: 500, advAlchPrice: 100,
  advDeliOrbType: 'Fine', advDeliOrbQtyPerMap: 4, advDeliOrbPriceEach: 100,
  advAstrolabeType: 'Grasping Astrolabe', advAstrolabePrice: 10, advAstrolabeCount: 7,
  advGemCount: 9, advGemBuyPrice: 5, advGemSellPrice: 385, advGemName: 'Enhance',
  leagueName: 'Ancestors',
});

/** Same session with the Preservation scarab swapped for a second 5c Breach scarab. */
const SAD_NO_PRESERVATION = (): SessionSettings => {
  const s = SAD_PRESERVATION();
  s.scarabs = [
    { name: 'Breach Scarab of Instability',  cost: 5 },
    { name: 'Horned Scarab of Bloodlines',   cost: 100 },
    { name: 'Breach Scarab of Instability',  cost: 5 },
    { name: 'Cartography Scarab of Risk',    cost: 70 },
    { name: 'Scarab of Wisps',               cost: 20 },
  ];
  return s;
};

const N = 38;
// Loot chosen so lootGain lands on the hand-verified 98537.6c:
// rawReturn + gemBuyOffset(45) - baseline(100000) = 98537.6
const BASELINE = 100000;
const RAW_RETURN = 198492.6;
const SAD_LOOT: LootItem[] = [
  loot(RAW_RETURN),
  loot(3600, true, 'Enhance Support - 4/0 corrupted'), // excluded gem sale
];

/* ------------------------------------------------------------------ */
/* Rolling session total (stale-rolling regression)                    */
/* ------------------------------------------------------------------ */

describe('computeRollingSessionTotal', () => {
  it('scales delirium orb cost with map count (regression: stored rollingCostPerMap froze)', () => {
    const s = SAD_PRESERVATION();
    // At mapCount 1 this reproduces the exact stale value the app displayed: 2120c
    expect(computeRollingSessionTotal(s, 1)).toBeCloseTo(2120, 6);
    // At the real map count it must be live: 1650 + 70 + 4*100*38 = 16920c
    expect(computeRollingSessionTotal(s, N)).toBeCloseTo(16920, 6);
  });

  it('clamps map count to 1 so configured costs are visible before the first parse', () => {
    const s = SAD_PRESERVATION();
    expect(computeRollingSessionTotal(s, 0)).toBeCloseTo(2120, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Preservation split                                                  */
/* ------------------------------------------------------------------ */

describe('computeCosts — preservation split', () => {
  it('detects preservation scarabs case-insensitively', () => {
    expect(isPreservationScarab('Horned Scarab of Preservation')).toBe(true);
    expect(isPreservationScarab('Breach Scarab of Instability')).toBe(false);
  });

  it('with preservation: only Preservation scarabs are per-map; the rest are one-time', () => {
    const c = computeCosts(SAD_PRESERVATION(), N);
    expect(c.hasPreservation).toBe(true);
    expect(c.perMapScarabs).toBe(7);
    expect(c.oneTimeScarabs).toBe(195); // 100 + 5 + 70 + 20
    expect(c.perMapBase).toBe(1657);    // 1500 + 150 + 7
  });

  it('without preservation: all scarabs are per-map, nothing is one-time', () => {
    const c = computeCosts(SAD_NO_PRESERVATION(), N);
    expect(c.hasPreservation).toBe(false);
    expect(c.perMapScarabs).toBe(200);
    expect(c.oneTimeScarabs).toBe(0);
    expect(c.perMapBase).toBe(1850);    // 1500 + 150 + 200
  });
});

/* ------------------------------------------------------------------ */
/* PARITY — the hand-verified Sad fixture                              */
/* ------------------------------------------------------------------ */

describe('computeProfit — Sad fixture parity (hand-verified 2026-07-02)', () => {
  it('preservation session: invest 80081c, net +18456.6c, 0.971 d/map', () => {
    const p = computeProfit({
      settings: SAD_PRESERVATION(), mapCount: N,
      lootItems: SAD_LOOT, baselineTotal: BASELINE,
    });
    expect(p.hasBl).toBe(true);
    expect(p.gemBuyOffset).toBe(45);              // 9 x 5c, baseline present
    expect(p.lootGain).toBeCloseTo(98537.6, 4);
    expect(p.rollingSessionTotal).toBeCloseTo(16920, 6);
    expect(p.totalInvest).toBeCloseTo(80081, 4);  // 1657*38 + 16920 + 195
    expect(p.net).toBeCloseTo(18456.6, 4);
    expect(p.cPerMap).toBeCloseTo(485.7, 1);
    expect(p.divPerMap).toBeCloseTo(0.971, 3);
  });

  it('no-preservation session: invest 87220c, net +11317.6c, 0.596 d/map', () => {
    const p = computeProfit({
      settings: SAD_NO_PRESERVATION(), mapCount: N,
      lootItems: SAD_LOOT, baselineTotal: BASELINE,
    });
    expect(p.totalInvest).toBeCloseTo(87220, 4);  // 1850*38 + 16920
    expect(p.net).toBeCloseTo(11317.6, 4);
    expect(p.cPerMap).toBeCloseTo(297.8, 1);
    expect(p.divPerMap).toBeCloseTo(0.596, 3);
  });
});

/* ------------------------------------------------------------------ */
/* Gem buy offset gating (ShareModal bug #2 regression)                */
/* ------------------------------------------------------------------ */

describe('computeProfit — gemBuyOffset gating', () => {
  it('applies the offset only when a baseline exists', () => {
    const s = SAD_PRESERVATION();
    const withBl = computeProfit({ settings: s, mapCount: N, lootItems: SAD_LOOT, baselineTotal: BASELINE });
    expect(withBl.gemBuyOffset).toBe(45);

    const noBl = computeProfit({ settings: s, mapCount: N, lootItems: SAD_LOOT, baselineTotal: 0 });
    expect(noBl.hasBl).toBe(false);
    expect(noBl.gemBuyOffset).toBe(0);
    // Without a baseline the full raw return counts as loot gain (no subtraction, no offset)
    expect(noBl.lootGain).toBeCloseTo(RAW_RETURN, 4);
  });

  it('requires a configured gem name, count, and buy price', () => {
    const s = SAD_PRESERVATION();
    s.advGemName = '';
    const p = computeProfit({ settings: s, mapCount: N, lootItems: SAD_LOOT, baselineTotal: BASELINE });
    expect(p.gemBuyOffset).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Neutralization (ShareModal bug #3 regression)                       */
/* ------------------------------------------------------------------ */

describe('computeProfit — investment neutralization', () => {
  it('adds the neutralized amount to loot gain and net', () => {
    const s = SAD_PRESERVATION();
    const base = computeProfit({ settings: s, mapCount: N, lootItems: SAD_LOOT, baselineTotal: BASELINE });
    const neut = computeProfit({
      settings: s, mapCount: N, lootItems: SAD_LOOT, baselineTotal: BASELINE,
      investmentNeutralization: 6448.1,
    });
    expect(neut.lootGain - base.lootGain).toBeCloseTo(6448.1, 4);
    expect(neut.net - base.net).toBeCloseTo(6448.1, 4);
  });
});

/* ------------------------------------------------------------------ */
/* Split sessions, edge cases                                          */
/* ------------------------------------------------------------------ */

describe('computeCosts — split sessions', () => {
  it('halves map+chisel+split, keeps scarabs per-run, does not halve rolling costs', () => {
    const s = SAD_NO_PRESERVATION();
    s.advSplitPrice = 2;
    const c = computeCosts(s, N);
    expect(c.perMapBase).toBeCloseTo((1500 + 150 + 2) / 2 + 200, 6);
    expect(c.rollingSessionTotal).toBeCloseTo(16920, 6); // unaffected by split
  });
});

describe('computeProfit — edge cases', () => {
  it('zero maps: no NaN/Infinity, per-map figures are 0', () => {
    const p = computeProfit({ settings: SAD_PRESERVATION(), mapCount: 0, lootItems: [], baselineTotal: 0 });
    expect(p.cPerMap).toBe(0);
    expect(p.divPerMap).toBe(0);
    expect(Number.isFinite(p.totalInvest)).toBe(true);
    expect(p.hasReturn).toBe(false);
    expect(p.lootGain).toBe(0);
  });

  it('divine price falls back to 1 for conversions', () => {
    const s = SAD_PRESERVATION();
    s.divinePrice = 0;
    const p = computeProfit({ settings: s, mapCount: N, lootItems: SAD_LOOT, baselineTotal: BASELINE });
    expect(p.div).toBe(1);
    expect(p.divPerMap).toBeCloseTo(p.cPerMap, 6);
  });

  it('excluded loot items do not count toward the return', () => {
    const p = computeProfit({
      settings: SAD_PRESERVATION(), mapCount: N,
      lootItems: [loot(1000), loot(9999, true, 'Excluded Thing')],
      baselineTotal: 0,
    });
    expect(p.rawReturn).toBe(1000);
  });
});

/* ------------------------------------------------------------------ */
/* Multiplier                                                          */
/* ------------------------------------------------------------------ */

describe('computeMultiplier', () => {
  it('reproduces the Sad fixture multiplier: 1.63x (5 frags, 16 nodes, mounting, 1 Risk scarab)', () => {
    const m = computeMultiplier(SAD_PRESERVATION());
    expect(m.fragmentEffect).toBe(15);
    expect(m.nodeEffect).toBe(32);
    expect(m.scarabOfRiskMods).toBe(2);
    expect(m.effectiveMods).toBe(8);   // 6-mod base + 2 from Scarab of Risk
    expect(m.mountBonus).toBe(16);
    expect(m.multiplier).toBeCloseTo(1.63, 6);
  });

  it('8-mod base and no mounting', () => {
    const m = computeMultiplier(baseSettings({
      mapType: '8-mod', fragmentsUsed: 2, smallNodesAllocated: 10, mountingModifiers: false,
    }));
    expect(m.effectiveMods).toBe(8);
    expect(m.mountBonus).toBe(0);
    expect(m.multiplier).toBeCloseTo(1 + (6 + 20) / 100, 6);
  });

  it('mounting scales with effective mods including multiple Risk scarabs', () => {
    const m = computeMultiplier(baseSettings({
      mapType: '8-mod', mountingModifiers: true,
      scarabs: [
        { name: 'Cartography Scarab of Risk', cost: 1 },
        { name: 'Cartography Scarab of Risk', cost: 1 },
        { name: '', cost: 0 }, { name: '', cost: 0 }, { name: '', cost: 0 },
      ],
    }));
    expect(m.effectiveMods).toBe(12);  // 8 + 2 + 2
    expect(m.mountBonus).toBe(24);
  });
});
