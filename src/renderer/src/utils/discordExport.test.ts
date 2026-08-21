/**
 * discordExport.test.ts — locks the export wire format and proves parity (WP1).
 *
 * Three layers:
 *  1. The generated export's money lines match the hand-verified Sad fixture.
 *  2. Round-trip: buildDiscordExport -> parseDiscordExport recovers every field
 *     (this is the wire-format lock the bot + client import paths depend on).
 *  3. The REAL v1.0.62 export fixture still parses (regression artifact of the
 *     old buggy output — we assert the parser reads it, not that it is correct).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SessionSettings, LootItem } from '../types';
import { buildDiscordExport, ExportMapStats } from './discordExport';
import { parseDiscordExport } from './parseDiscordExport';
import { EXPORT_EMOJI } from './discordEmoji';

/* ------------------------------------------------------------------ */
/* Fixture (mirrors profit.test.ts — the hand-verified Sad session)    */
/* ------------------------------------------------------------------ */

const settings = (over: Partial<SessionSettings> = {}): SessionSettings => ({
  divinePrice: 500,
  chiselUsed: true, chiselType: 'Avarice', chiselPrice: 150,
  mapType: '6-mod', isSplitSession: false,
  multiplyingModifiersAllocated: true, fragmentCountOverride: 5, smallNodesAllocated: 16, mountingModifiers: true,
  baseMapCost: 1500, // (the legacy stored rollingCostPerMap:2120 field was removed in v16 — the builder derives the session total live)
  scarabs: [
    { name: 'Horned Scarab of Preservation', cost: 7 },
    { name: 'Horned Scarab of Bloodlines',   cost: 100 },
    { name: 'Breach Scarab of Instability',  cost: 5 },
    { name: 'Cartography Scarab of Risk',    cost: 70 },
    { name: 'Scarab of Wisps',               cost: 20 },
  ],
  atlasBonus: false,
  leagueName: 'Ancestors', atlasDetectedTags: [],
  advChaos: 750,
  advExalt: 500, advExaltPrice: 700,
  advScour: 500, advScourPrice: 100,
  advAlch: 500, advAlchPrice: 100,
  advDeliOrbType: 'Fine', advDeliOrbQtyPerMap: 4, advDeliOrbPriceEach: 100,
  advSplitPrice: 0,
  advAstrolabeType: 'Grasping Astrolabe', advAstrolabePrice: 10, advAstrolabeCount: 7,
  advGemCount: 9, advGemBuyPrice: 5, advGemSellPrice: 385, advGemName: 'Enhance',
  regexExclusions: [],
  atlasTreeUrl: 'https://pathofpathing.com/?v=3.28.0-atlas-league#AAAABgAADAsAJMFG',
  atlasPoints: null, atlasPointsMax: null,
  updateTargetStrategyId: null, updateTargetStrategyName: null,
  evidenceTargetStrategyId: null, evidenceTargetStrategyName: null,
  evidenceTargetExpectedRevision: null, evidenceTargetSetupFingerprint: null,
  ...over,
});

const N = 38;
const maps: ExportMapStats[] = Array(N).fill(null).map(() => ({
  quantity: 83, rarity: 63, packSize: 45, moreCurrency: 117, moreScarabs: 5,
}));
const lootItems: LootItem[] = [
  { id: 'a', name: 'Divine Orb', tab: 'curr', quantity: '1', price: '', total: 198492.6, excluded: false },
  { id: 'b', name: 'Enhance Support - 4/0 corrupted', tab: 'gemy', quantity: '9', price: '', total: 3600, excluded: true },
];
const baselineTotal = 100000;

const build = () => buildDiscordExport({
  maps, settings: settings(), lootItems, baselineTotal,
  investmentNeutralization: 0,
  shareTags: ['originator', 'breach', 'cartography', 'astrolabe-grasping'],
  isGroupPlay: false,
});

/* ------------------------------------------------------------------ */

describe('buildDiscordExport — corrected money lines (Sad fixture parity)', () => {
  it('keeps multiline notes on one canonical parser-safe field line', () => {
    const out = buildDiscordExport({
      maps, settings: settings(), lootItems, baselineTotal,
      investmentNeutralization: 0,
      stratNotes: 'First point\nSecond point\r\nThird point',
    });
    expect(out).toContain('**Notes:** First point Second point Third point');
    expect(parseDiscordExport(out)!.strategyNotes).toBe('First point Second point Third point');
  });

  it('round-trips optional game-data authoring provenance', () => {
    const out = buildDiscordExport({
      maps, settings: settings(), lootItems, baselineTotal,
      investmentNeutralization: 0,
      gameDataRevision: 2,
      gameDataPatchVersion: '3.29',
    });
    expect(out).toContain('**Data:** r2/3.29');
    expect(parseDiscordExport(out)).toMatchObject({
      gameDataRevision: 2,
      gameDataPatchVersion: '3.29',
    });
  });

  it('emits Dashboard-parity figures, ignoring the stale stored rollingCostPerMap', () => {
    const out = build();
    // Per Map Cost is ALL-IN (totalInvest / maps = 80081 / 38) — one definition everywhere
    expect(out).toContain('**Per Map Cost:** 2107.4c | **Total Invest:** 80081.0c');
    expect(out).toContain('**Total Return:** 98537.6c | **Net Profit:** +18456.6c');
    expect(out).toContain('**Div / Map:** 0.971d | **Divine Price:** 500c');
    expect(out).toContain('**Maps:** 38 | **Type:** 6-mod | **Multiplier:** 1.63×');
  });

  it('includes neutralization in the shared numbers (bug #3 regression)', () => {
    const out = buildDiscordExport({
      maps, settings: settings(), lootItems, baselineTotal,
      investmentNeutralization: 6448.1,
    });
    // 98537.6 + 6448.1 and 18456.6 + 6448.1
    expect(out).toContain('**Total Return:** 104985.7c | **Net Profit:** +24904.7c');
  });

  it('exports observed mixed-map math without changing the 6/8-mod wire field', () => {
    const observedMaps: ExportMapStats[] = [3, 4, 5, 6].map((explicitModCount) => ({
      quantity: 80, rarity: 50, packSize: 40, moreCurrency: 100, moreScarabs: 0,
      explicitModCount,
    }));
    const out = buildDiscordExport({
      maps: observedMaps,
      settings: settings({
        multiplyingModifiersAllocated: false, fragmentCountOverride: null, smallNodesAllocated: 0, mountingModifiers: true,
        scarabs: [],
      }),
      lootItems: [], baselineTotal: 0, investmentNeutralization: 0,
    });
    expect(out).toContain('**Type:** 6-mod | **Multiplier:** 1.09');
    expect(out).toContain('**Observed Mods:** 4.5 avg');
    expect(parseDiscordExport(out)?.mapType).toBe('6-mod');
  });

  it('does not apply the gem offset without a baseline (bug #2 regression)', () => {
    const out = buildDiscordExport({
      maps, settings: settings(), lootItems, baselineTotal: 0,
      investmentNeutralization: 0,
    });
    // lootGain = rawReturn only: 198492.6 (no +45 offset, no baseline subtraction)
    expect(out).toContain('**Total Return:** 198492.6c');
  });
});

describe('buildDiscordExport <-> parseDiscordExport round-trip (wire-format lock)', () => {
  const parsed = parseDiscordExport(build());

  it('parses at all', () => { expect(parsed).not.toBeNull(); });

  it('recovers headline stats', () => {
    expect(parsed!.mapCount).toBe(38);
    expect(parsed!.mapType).toBe('6-mod');
    expect(parsed!.multiplier).toBeCloseTo(1.63, 6);
    expect(parsed!.avgQuant).toBe(83);
    expect(parsed!.avgRarity).toBe(63);
    expect(parsed!.avgPack).toBe(45);
    expect(parsed!.avgCurr).toBe(117);
  });

  it('recovers money figures', () => {
    expect(parsed!.perMapCost).toBeCloseTo(2107.4, 1); // all-in: totalInvest / maps
    expect(parsed!.totalInvest).toBeCloseTo(80081.0, 4);
    expect(parsed!.totalReturn).toBeCloseTo(98537.6, 4);
    expect(parsed!.netProfit).toBeCloseTo(18456.6, 4);
    expect(parsed!.divPerMap).toBeCloseTo(0.971, 4);
    expect(parsed!.divPrice).toBe(500);
  });

  it('recovers chisel, scarabs, deli, astrolabe', () => {
    expect(parsed!.chisel).toBe('Avarice');
    expect(parsed!.chiselPrice).toBe(150);
    expect(parsed!.scarabs).toEqual([
      'Horned Scarab of Preservation',
      'Horned Scarab of Bloodlines',
      'Breach Scarab of Instability',
      'Cartography Scarab of Risk',
      'Scarab of Wisps',
    ]);
    expect(parsed!.scarabCosts).toEqual([7, 100, 5, 70, 20]);
    expect(parsed!.deliOrbQty).toBe(4);
    expect(parsed!.deliOrbType).toBe('Fine');
    expect(parsed!.deliOrbPrice).toBeCloseTo(100, 4);
    expect(parsed!.astroType).toBe('Grasping Astrolabe');
    expect(parsed!.astroCount).toBe(7);
    expect(parsed!.astroPrice).toBeCloseTo(10, 4);
  });

  it('recovers exclusions, gems, tags context, group play, atlas url, regexes', () => {
    expect(parsed!.excludedDrops).toEqual([{ name: 'Enhance Support - 4/0 corrupted', value: 3600 }]);
    expect(parsed!.gemInfo).toEqual({ count: 9, buy: 45, sell: 3465, net: 3420 });
    expect(parsed!.isGroupPlay).toBe(false);
    expect(parsed!.atlasTreeUrl).toContain('pathofpathing.com');
    expect(parsed!.runRegex.length).toBeGreaterThan(0);
    expect(parsed!.slamRegex).toBe('');
  });

  it('emits compact derived setup and regex presentation without losing parsed values', () => {
    const exported = build();
    expect(exported).toContain('**Delirium Orbs:** 4x Fine @ 100c ea');
    expect(exported).toContain('**Astrolabe:** Grasping · 7x @ 10c ea');
    expect(exported).toContain('**Regex**');
    expect(exported).not.toMatch(/^Avg: /m);
    expect(exported).not.toContain('Slam:');
    expect(parsed).toMatchObject({
      deliOrbQty: 4,
      deliOrbType: 'Fine',
      deliOrbPrice: 100,
      astroType: 'Grasping Astrolabe',
      astroCount: 7,
      astroPrice: 10,
    });
  });

  it('flags group play when set', () => {
    const p = parseDiscordExport(buildDiscordExport({
      maps, settings: settings(), lootItems, baselineTotal,
      investmentNeutralization: 0, isGroupPlay: true,
    }));
    expect(p!.isGroupPlay).toBe(true);
  });

  it('absent optional metadata parses as null across the board (legacy exports)', () => {
    expect(parsed!.groupSize).toBeNull();
    expect(parsed!.sessionMinutes).toBeNull();
    expect(parsed!.atlasPoints).toBeNull();
    expect(parsed!.atlasPointsMax).toBeNull();
  });

  it('round-trips the shared-metadata batch: group size, session time, atlas points', () => {
    const out = buildDiscordExport({
      maps, settings: settings({ atlasPoints: 112, atlasPointsMax: 138 }),
      lootItems, baselineTotal, investmentNeutralization: 0,
      isGroupPlay: true, groupSize: 3, sessionMinutes: 245,
    });
    expect(out).toContain('**Party Play:** Yes (3 players)');
    expect(out).toContain('**Session Time:** 245 min');
    expect(out).toContain('**Atlas Points:** 112/138');
    const p = parseDiscordExport(out);
    expect(p!.isGroupPlay).toBe(true);
    expect(p!.groupSize).toBe(3);
    expect(p!.sessionMinutes).toBe(245);
    expect(p!.atlasPoints).toBe(112);
    expect(p!.atlasPointsMax).toBe(138);
  });

  it('group without size emits the LEGACY bare line (old parsers keep working)', () => {
    const out = buildDiscordExport({
      maps, settings: settings(), lootItems, baselineTotal,
      investmentNeutralization: 0, isGroupPlay: true, groupSize: null,
    });
    expect(out).toContain('**Party Play:** Yes');
    expect(out).not.toContain('players');
    const p = parseDiscordExport(out);
    expect(p!.isGroupPlay).toBe(true);
    expect(p!.groupSize).toBeNull();
  });

  it('shares bought pre-delirious maps as observations without claiming Orb costs', () => {
    const observedMaps: ExportMapStats[] = Array.from({ length: 3 }, () => ({
      quantity: 83,
      rarity: 63,
      packSize: 45,
      moreCurrency: 117,
      moreScarabs: 5,
      deliriousPct: 100,
      deliriumRewardTypes: ['Jewellery', 'Jewellery', 'Armour'],
    }));
    const out = buildDiscordExport({
      maps: observedMaps,
      settings: settings({
        baseMapCost: 250,
        advDeliOrbType: '',
        advDeliOrbQtyPerMap: 0,
        advDeliOrbPriceEach: 0,
      }),
      lootItems,
      baselineTotal,
      investmentNeutralization: 0,
    });
    expect(out).not.toContain('Delirium Orbs:');
    expect(out).toContain(
      '**Observed Delirium:** 3/3 maps | Levels: 100%x3 | Rewards: Jewellery x6, Armour x3',
    );
    expect(parseDiscordExport(out)?.observedDelirium).toEqual({
      sampleSize: 3,
      levelCounts: [{ percentage: 100, count: 3 }],
      rewardCounts: [
        { name: 'Jewellery', count: 6 },
        { name: 'Armour', count: 3 },
      ],
    });
  });

  it('no claim = no line: time <= 0 and half-missing points are suppressed', () => {
    const out = buildDiscordExport({
      maps, settings: settings({ atlasPoints: 112, atlasPointsMax: null }),
      lootItems, baselineTotal, investmentNeutralization: 0, sessionMinutes: 0,
    });
    expect(out).not.toContain('Session Time');
    expect(out).not.toContain('Atlas Points');
  });
});

describe('parseDiscordExport — real v1.0.62 fixture files', () => {
  const read = (f: string) =>
    readFileSync(fileURLToPath(new URL(`./__fixtures__/${f}`, import.meta.url)), 'utf-8');

  it('reads the real preservation export (values are the OLD buggy output — parser lock only)', () => {
    const p = parseDiscordExport(read('export_preservation_38maps_BUGGY.txt'));
    expect(p).not.toBeNull();
    expect(p!.mapCount).toBe(38);
    expect(p!.perMapCost).toBeCloseTo(1852.0, 4);
    expect(p!.totalInvest).toBeCloseTo(72496.0, 4);
    expect(p!.netProfit).toBeCloseTo(26041.6, 4);
    expect(p!.scarabs).toContain('Horned Scarab of Preservation');
    expect(p!.gemInfo).toEqual({ count: 9, buy: 45, sell: 3465, net: 3420 });
  });

  it('reads the real no-preservation export', () => {
    const p = parseDiscordExport(read('export_no_preservation_38maps.txt'));
    expect(p).not.toBeNull();
    expect(p!.mapCount).toBe(38);
    expect(p!.perMapCost).toBeCloseTo(1850.0, 4);
    expect(p!.totalInvest).toBeCloseTo(72420.0, 4);
    expect(p!.netProfit).toBeCloseTo(26117.6, 4);
    expect(p!.isGroupPlay).toBe(false);
  });
});

describe('export decoration is swappable without breaking re-import (Parts 1+2)', () => {
  it('parses identically after every unicode marker is swapped for a <:name:id> ref', () => {
    const out = build();
    // Simulate the DEFERRED bot-posted path: each unicode marker replaced by its
    // application-emoji reference. Import must be indifferent to the swap.
    let botStyle = out;
    for (const e of Object.values(EXPORT_EMOJI)) {
      botStyle = botStyle.split(e.uni).join(`<:${e.name}:100000000000000000>`);
    }
    expect(botStyle).not.toBe(out); // the swap actually changed something
    const a = parseDiscordExport(out);
    const b = parseDiscordExport(botStyle);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
  });

  it('registry defines a unicode glyph, plain label, and app-emoji name for every marker', () => {
    for (const e of Object.values(EXPORT_EMOJI)) {
      expect(e.uni.length).toBeGreaterThan(0);
      expect(e.plain.length).toBeGreaterThan(0);
      expect(e.name.length).toBeGreaterThan(0);
    }
  });
});

describe('strategy-versioning update marker (design v3.1 client half)', () => {
  const UUID = 'be00f19f-b74c-4c4f-9a1c-ee54d2ffaabc';

  const buildWith = (updateStrategyId: string | null) => buildDiscordExport({
    maps, settings: settings(), lootItems, baselineTotal,
    investmentNeutralization: 0,
    stratName: 'Testy strategy', stratNotes: 'some notes',
    updateStrategyId,
  });

  it('emits the marker line directly under the header when a target is set', () => {
    const out = buildWith(UUID);
    const lines = out.split('\n');
    expect(lines[0]).toBe('[WraeclastLedger Session]');
    expect(lines[1]).toBe(`Update strategy: ${UUID}`);
  });

  it('emits NO marker without a target (legacy wire format unchanged)', () => {
    const out = buildWith(null);
    expect(out).not.toContain('Update strategy:');
  });

  it('round-trips: parse recovers the uuid AND the strategy name stays correct with the marker ABOVE the Strategy: line', () => {
    const p = parseDiscordExport(buildWith(UUID));
    expect(p).not.toBeNull();
    expect(p!.updateStrategyId).toBe(UUID);
    // The live TEST-bot bug: the unanchored Strategy: matcher must never read
    // the uuid as the name. Marker sits above the name line in our export.
    expect(p!.strategyName).toBe('Testy strategy');
    expect(p!.strategyNotes).toBe('some notes');
  });

  it('marker BELOW the Strategy: line also parses (position-independent strip)', () => {
    const out = buildWith(null) + `\nUpdate strategy: ${UUID}`;
    const p = parseDiscordExport(out);
    expect(p!.updateStrategyId).toBe(UUID);
    expect(p!.strategyName).toBe('Testy strategy');
  });

  it('malformed marker: stripped from the working text, exposed as null', () => {
    const bad = buildWith(null).replace(
      '[WraeclastLedger Session]',
      '[WraeclastLedger Session]\nUpdate strategy: not-a-uuid',
    );
    const p = parseDiscordExport(bad);
    expect(p).not.toBeNull();
    expect(p!.updateStrategyId).toBeNull();
    expect(p!.strategyName).toBe('Testy strategy'); // never polluted by the bad marker
  });

  it('legacy export without a marker exposes null', () => {
    const p = parseDiscordExport(buildWith(null));
    expect(p!.updateStrategyId).toBeNull();
  });

  it('uppercase uuid is normalised to lowercase', () => {
    const p = parseDiscordExport(buildWith(UUID.toUpperCase()));
    expect(p!.updateStrategyId).toBe(UUID);
  });
});

describe('strategy evidence wire markers', () => {
  const UUID = 'be00f19f-b74c-4c4f-9a1c-ee54d2ffaabc';
  const RUN_KEY = `sha256-v1:${'a'.repeat(64)}`;
  const FINGERPRINT = `sha256-v1:${'b'.repeat(64)}`;

  const buildEvidence = () => buildDiscordExport({
    maps, settings: settings(), lootItems, baselineTotal,
    investmentNeutralization: 0,
    evidence: {
      targetStrategyId: UUID,
      expectedRevision: 7,
      runKey: RUN_KEY,
      runStartedAt: '2026-07-29T18:00:00.000Z',
      runEndedAt: '2026-07-29T18:30:00.000Z',
      setupFingerprint: FINGERPRINT,
    },
  });

  it('emits all four evidence markers as one atomic wire operation', () => {
    expect(buildEvidence().split('\n').slice(0, 5)).toEqual([
      '[WraeclastLedger Session]',
      `Add evidence to: ${UUID}@7`,
      `Evidence run: ${RUN_KEY}`,
      'Run window: 2026-07-29T18:00:00.000Z/2026-07-29T18:30:00.000Z',
      `Setup fingerprint: ${FINGERPRINT}`,
    ]);
  });

  it('round-trips every evidence marker by text label', () => {
    const exported = buildEvidence();
    expect(exported).toContain('**Multiplying Modifiers:** 5 fragments');
    expect(parseDiscordExport(exported)).toMatchObject({
      operation: 'evidence',
      operationError: null,
      evidenceTargetStrategyId: UUID,
      evidenceExpectedRevision: 7,
      evidenceRunKey: RUN_KEY,
      evidenceRunStartedAt: '2026-07-29T18:00:00.000Z',
      evidenceRunEndedAt: '2026-07-29T18:30:00.000Z',
      setupFingerprint: FINGERPRINT,
      multiplyingModifiersAllocated: true,
      multiplyingModifiersFragmentCount: 5,
    });
  });

  it('round-trips an allocated Multiplying Modifiers fragment count', () => {
    const exported = buildDiscordExport({
      maps,
      settings: settings({
        multiplyingModifiersAllocated: true,
        fragmentCountOverride: 4,
      }),
      lootItems,
      baselineTotal,
      investmentNeutralization: 0,
    });
    expect(exported).toContain('**Multiplying Modifiers:** 4 fragments');
    expect(parseDiscordExport(exported)).toMatchObject({
      multiplyingModifiersAllocated: true,
      multiplyingModifiersFragmentCount: 4,
    });
  });

  it('rejects mutually exclusive update and evidence operations', () => {
    expect(() => buildDiscordExport({
      maps, settings: settings(), lootItems, baselineTotal,
      investmentNeutralization: 0,
      updateStrategyId: UUID,
      evidence: {
        targetStrategyId: UUID,
        expectedRevision: 7,
        runKey: RUN_KEY,
        runStartedAt: '2026-07-29T18:00:00.000Z',
        runEndedAt: '2026-07-29T18:30:00.000Z',
        setupFingerprint: FINGERPRINT,
      },
    })).toThrow(/both an update and evidence/);
  });

  it('never lets partial or competing marker sets fall through as a share', () => {
    const partial = buildEvidence().replace(`Setup fingerprint: ${FINGERPRINT}\n`, '');
    expect(parseDiscordExport(partial)).toMatchObject({
      operation: null,
      operationError: 'incomplete_evidence_markers',
    });

    const competing = `${buildEvidence()}\nUpdate strategy: ${UUID}`;
    expect(parseDiscordExport(competing)).toMatchObject({
      operation: null,
      operationError: 'multiple_operation_markers',
    });
  });
});

describe('Allflame strategy taxonomy tags', () => {
  it('round-trips Mercenaries and Trarthus through the Discord wire', () => {
    const exported = buildDiscordExport({
      maps: [{ quantity: 80, rarity: 60, packSize: 40, moreCurrency: 100, moreScarabs: 0 }],
      settings: settings({ leagueName: 'Allflame' }),
      lootItems: [], baselineTotal: 0, investmentNeutralization: 0,
      shareTags: ['mercenaries', 'trarthus'],
    });
    expect(exported).toContain('**Tags:** mercenaries, trarthus');
    expect(parseDiscordExport(exported)?.typeTags).toEqual(['mercenaries', 'trarthus']);
  });
});

describe('loot evidence wire', () => {
  it('round-trips item-level CSV gains and visibly sourced manual additions', () => {
    const baselineItems: LootItem[] = [
      { id: 'base-div', name: 'Divine Orb', tab: 'curr', quantity: '1', price: '100', total: 100, excluded: false },
    ];
    const returnItems: LootItem[] = [
      { id: 'return-div', name: 'Divine Orb', tab: 'curr', quantity: '3', price: '100', total: 300, excluded: false },
    ];
    const exported = buildDiscordExport({
      maps: [{ quantity: 80, rarity: 60, packSize: 40, moreCurrency: 100, moreScarabs: 0 }],
      settings: settings({
        advGemCount: 0, advGemBuyPrice: 0, advGemSellPrice: 0, advGemName: '',
        baseMapCost: 0, scarabs: [], advChaos: 0, advExalt: 0, advScour: 0, advAlch: 0,
        advDeliOrbType: '', advDeliOrbQtyPerMap: 0, advAstrolabeType: '',
      }),
      lootItems: returnItems,
      baselineItems,
      baselineTotal: 100,
      manualLootItems: [{
        id: 'manual-blueprint', name: 'Unpriced Blueprint', quantity: 1,
        total: 75, category: 'League', note: 'Missing from WealthyExile',
      }],
      investmentNeutralization: 0,
    });
    expect(exported).toContain('**Total Return:** 275.0c');
    expect(exported).toContain('Loot Evidence: wl1.');
    const parsed = parseDiscordExport(exported);
    expect(parsed?.lootSummaryInvalid).toBe(false);
    expect(parsed?.lootSummary).toMatchObject({
      csvNet: 200,
      manualTotal: 75,
      reportedReturn: 275,
    });
    expect(parsed?.lootSummary?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Divine Orb', source: 'wealthyexile', value: 200 }),
      expect.objectContaining({ name: 'Unpriced Blueprint', source: 'manual', value: 75 }),
    ]));
  });

  it('keeps the strategy parseable while flagging malformed loot evidence', () => {
    const malformed = build().replace(/^Loot Evidence:.*$/m, 'Loot Evidence: wl1.not-valid-compressed-data');
    const parsed = parseDiscordExport(malformed);
    expect(parsed).not.toBeNull();
    expect(parsed?.lootSummary).toBeNull();
    expect(parsed?.lootSummaryInvalid).toBe(true);
  });
});
