/**
 * sessionCompare.test.ts — WP11 session-comparison derivation.
 *
 * The heavy profit/multiplier math is already covered by profit.test.ts. This
 * suite locks the NEW logic sessionCompare.ts adds on top of it:
 *   - per-column parity with computeProfit/computeMultiplier,
 *   - the averaging + all-in cost/map,
 *   - the empty-session (0 maps) divide-by-zero guards,
 *   - bestIndex winner selection (tie -> -1, null eligibility skipped).
 */
import { describe, it, expect } from 'vitest';
import { SessionSettings, LootItem, MapData, SavedSession } from '../types';
import { computeProfit, computeMultiplier } from './profit';
import { buildCompareColumn, bestIndices, CompareColumn } from './sessionCompare';

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
  updateTargetStrategyId: null, updateTargetStrategyName: null,
  ...over,
});

let mapSeq = 0;
const mkMap = (over: Partial<MapData> = {}): MapData => ({
  id: `m${mapSeq++}`,
  tier: 16, name: 'Some Map', quantity: 100, rarity: 50, packSize: 30,
  quality: 0, qualityType: '',
  moreCurrency: 40, moreMaps: 0, moreScarabs: 0, moreDivCards: 0, modCount: 8,
  isOriginator: false, isEmpoweredMirage: false, isNightmare: false, isCorrupted: false,
  ...over,
});

const loot = (total: number, name = 'Divine Orb'): LootItem => ({
  id: name + total, name, tab: 'curr', quantity: '1', price: '', total, excluded: false,
});

let sessSeq = 0;
const mkSession = (over: Partial<SavedSession> = {}): SavedSession => ({
  id: `s${sessSeq++}`, name: 'Session', createdAt: '2026-07-01T00:00:00.000Z',
  maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
  settings: baseSettings(),
  ...over,
});

/* ------------------------------------------------------------------ */
/* buildCompareColumn                                                  */
/* ------------------------------------------------------------------ */

describe('buildCompareColumn', () => {
  it('matches the profit engine for a session with maps + return CSV', () => {
    const settings = baseSettings({
      divinePrice: 200, baseMapCost: 100,
      fragmentsUsed: 5, smallNodesAllocated: 16,
    });
    const session = mkSession({
      settings,
      maps: [mkMap(), mkMap(), mkMap()],
      lootItems: [loot(5000)],
      baselineItems: [loot(1000)], baselineTotal: 1000,
    });

    const col = buildCompareColumn(session);
    const p = computeProfit({ settings, mapCount: 3, lootItems: session.lootItems, baselineTotal: 1000 });
    const m = computeMultiplier(settings);

    expect(col.n).toBe(3);
    expect(col.multiplier).toBeCloseTo(m.multiplier);
    expect(col.totalInvest).toBeCloseTo(p.totalInvest);
    expect(col.lootGain).toBeCloseTo(p.lootGain);
    expect(col.net).toBeCloseTo(p.net);
    expect(col.cPerMap).toBeCloseTo(p.cPerMap);
    expect(col.divPerMap).toBeCloseTo(p.divPerMap);
    expect(col.hasReturn).toBe(true);
    expect(col.divPrice).toBe(200);
    // all-in cost per map is totalInvest / maps
    expect(col.costPerMap).toBeCloseTo(p.totalInvest / 3);
  });

  it('averages the map mod stats', () => {
    const session = mkSession({
      maps: [
        mkMap({ quantity: 90,  rarity: 40, packSize: 20, moreCurrency: 30 }),
        mkMap({ quantity: 100, rarity: 50, packSize: 30, moreCurrency: 40 }),
        mkMap({ quantity: 110, rarity: 60, packSize: 40, moreCurrency: 50 }),
      ],
    });
    const col = buildCompareColumn(session);
    expect(col.avgQuant).toBeCloseTo(100);
    expect(col.avgRarity).toBeCloseTo(50);
    expect(col.avgPack).toBeCloseTo(30);
    expect(col.avgCurr).toBeCloseTo(40);
  });

  it('handles an empty session without NaN/Infinity (0-map guard)', () => {
    const col = buildCompareColumn(mkSession({ maps: [], lootItems: [] }));
    expect(col.n).toBe(0);
    for (const v of [col.avgQuant, col.avgRarity, col.avgPack, col.avgCurr,
                     col.costPerMap, col.cPerMap, col.divPerMap]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
    expect(col.hasReturn).toBe(false);
  });

  it('reports hasReturn=false when there is no loot CSV', () => {
    const withMapsNoLoot = buildCompareColumn(mkSession({ maps: [mkMap()], lootItems: [] }));
    expect(withMapsNoLoot.hasReturn).toBe(false);
    expect(withMapsNoLoot.lootGain).toBe(0);
  });

  it('applies and exposes a persisted double-count correction', () => {
    const settings = baseSettings({ divinePrice: 200, baseMapCost: 100 });
    const base = {
      settings, maps: [mkMap(), mkMap()],
      lootItems: [loot(5000)], baselineItems: [loot(1000)], baselineTotal: 1000,
    };
    const without = buildCompareColumn(mkSession(base));
    const withFix = buildCompareColumn(mkSession({ ...base, investmentNeutralization: 500 }));

    expect(without.neutralization).toBe(0);
    expect(withFix.neutralization).toBe(500);
    // the correction adds straight into loot gain -> net
    expect(withFix.net).toBeCloseTo(without.net + 500);
    // and matches the engine when the same correction is passed
    const p = computeProfit({ settings, mapCount: 2, lootItems: base.lootItems, baselineTotal: 1000, investmentNeutralization: 500 });
    expect(withFix.net).toBeCloseTo(p.net);
  });
});

/* ------------------------------------------------------------------ */
/* bestIndices                                                         */
/* ------------------------------------------------------------------ */

describe('bestIndices', () => {
  const threeCols = (): CompareColumn[] =>
    [mkSession(), mkSession(), mkSession()].map(buildCompareColumn);

  const byPosition = (cols: CompareColumn[], vals: (number | null)[]) =>
    (c: CompareColumn): number | null => vals[cols.indexOf(c)] ?? null;

  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

  it('returns the single highest value', () => {
    const cols = threeCols();
    expect(sorted(bestIndices(cols, byPosition(cols, [1, 3, 2])))).toEqual([1]);
  });

  it('highlights BOTH when two tie for best above a worse third', () => {
    const cols = threeCols();
    expect(sorted(bestIndices(cols, byPosition(cols, [5, 5, 1])))).toEqual([0, 1]);
  });

  it('returns empty when all columns tie (no signal)', () => {
    const cols = threeCols();
    expect(bestIndices(cols, byPosition(cols, [3, 3, 3])).size).toBe(0);
  });

  it('skips null (ineligible) columns but still ranks the rest', () => {
    const cols = threeCols();
    expect(sorted(bestIndices(cols, byPosition(cols, [null, 5, 1])))).toEqual([1]);
  });

  it('returns empty when fewer than two columns are eligible', () => {
    const cols = threeCols();
    expect(bestIndices(cols, byPosition(cols, [null, 5, null])).size).toBe(0);
  });

  it('returns empty when no column is eligible', () => {
    const cols = threeCols();
    expect(bestIndices(cols, byPosition(cols, [null, null, null])).size).toBe(0);
  });

  it('returns empty on a tie among only the eligible columns', () => {
    const cols = threeCols();
    expect(bestIndices(cols, byPosition(cols, [null, 4, 4])).size).toBe(0);
  });
});
