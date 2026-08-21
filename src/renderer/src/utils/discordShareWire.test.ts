import { describe, expect, it } from 'vitest';
import type { DiscordImport } from './parseDiscordExport';
import { parseDiscordExport } from './parseDiscordExport';
import {
  decodeDiscordShareWire,
  DISCORD_SHARE_WIRE_MAX,
  DISCORD_SHARE_WIRE_PREFIX,
  encodeDiscordShareWire,
} from './discordShareWire';
import type { LootSummary } from './lootSummary';
import { strToU8, zlibSync } from 'fflate';

const lootSummary = (): LootSummary => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    name: `Valuable item ${index + 1}`,
    category: 'Currency' as const,
    source: 'wealthyexile' as const,
    quantity: index + 1,
    value: 1000 - index,
    tab: 'currency',
  }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const reportedReturn = 97921.5;
  return {
    version: 1,
    rowLimit: 30,
    rows,
    categories: [{ category: 'Currency', value: total }],
    hasBaseline: true,
    csvPositive: total,
    csvNegative: 0,
    csvNet: reportedReturn,
    csvAdjustment: reportedReturn - total,
    inventoryFlow: total,
    marketRevaluation: 0,
    manualTotal: 0,
    gemCorrection: 0,
    investmentCorrection: 0,
    reportedReturn,
    omittedCsvRows: 0,
    omittedCsvValue: 0,
    omittedManualRows: 0,
    omittedManualValue: 0,
  };
};

const parsed = (over: Partial<DiscordImport> = {}): DiscordImport => ({
  mapCount: 37,
  mapType: '6-mod',
  multiplier: 1.63,
  observedModAverage: 5.8,
  observedModSampleSize: 37,
  observedDelirium: {
    sampleSize: 37,
    levelCounts: [{ percentage: 100, count: 37 }],
    rewardCounts: [
      { name: 'Jewellery', count: 74 },
      { name: 'Armour', count: 37 },
    ],
  },
  avgQuant: 81,
  avgRarity: 62,
  avgPack: 44,
  avgCurr: 112,
  perMapCost: 2289.3,
  totalInvest: 84705,
  totalReturn: 97921.5,
  netProfit: 13216.5,
  divPerMap: 1.661,
  divPrice: 215,
  chisel: 'Avarice',
  chiselPrice: 700,
  runRegex: '"urr.*(1[1-9].|[2-9]..)%" "ack.*([4-9].|\\d..)%"',
  slamRegex: '"(urr.*([8-9].|\\d..)%|ack.*([3-9].|\\d..)%)"',
  scarabs: [
    'Breach Scarab of Instability',
    'Breach Scarab of Instability',
    'Scarab of Wisps',
    'Cartography Scarab of Risk',
    'Horned Scarab of Bloodlines',
  ],
  scarabCosts: [4, 4, 5, 185, 562],
  atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAALy0BABsGhglKDr4SSB_EJ4ovRjpGRj5G20jS',
  strategyName: 'Juiced T16.5 Breach',
  strategyNotes: '',
  typeTags: ['originator', 'breach', 'cartography', 'astrolabe-templar'],
  deliOrbQty: 4,
  deliOrbType: 'Armoursmith',
  deliOrbPrice: 70,
  astroType: 'Templar Astrolabe',
  astroCount: 55,
  astroPrice: 5,
  excludedDrops: [{ name: 'Chaos Orb', value: 55 }],
  gemInfo: { count: 77, buy: 38500, sell: 192500, net: 154000 },
  isGroupPlay: true,
  groupSize: 3,
  sessionMinutes: 245,
  atlasPoints: 138,
  atlasPointsMax: 138,
  league: 'Allflame',
  updateStrategyId: null,
  operation: 'share',
  operationError: null,
  evidenceTargetStrategyId: null,
  evidenceExpectedRevision: null,
  evidenceRunKey: null,
  evidenceRunStartedAt: null,
  evidenceRunEndedAt: null,
  setupFingerprint: null,
  gameDataRevision: 3,
  gameDataPatchVersion: '3.29',
  multiplyingModifiersAllocated: true,
  multiplyingModifiersFragmentCount: 5,
  lootSummary: lootSummary(),
  lootSummaryInvalid: false,
  ...over,
});

describe('compact Discord share wire', () => {
  it('round-trips the full share contract and remains under one Discord message', () => {
    const source = parsed();
    const wire = encodeDiscordShareWire(source);
    const expected = { ...source, slamRegex: '' };
    expect(wire.startsWith(DISCORD_SHARE_WIRE_PREFIX)).toBe(true);
    expect(wire.length).toBeLessThanOrEqual(DISCORD_SHARE_WIRE_MAX);
    expect(decodeDiscordShareWire(wire)).toEqual(expected);
    expect(parseDiscordExport(wire)).toEqual(expected);
  });

  it('keeps a 500-map strategy with bounded top-30 evidence inside one message', () => {
    const wire = encodeDiscordShareWire(parsed({
      mapCount: 500,
      observedModSampleSize: 500,
      sessionMinutes: 900,
    }));
    expect(wire.length).toBeLessThanOrEqual(DISCORD_SHARE_WIRE_MAX);
    expect(decodeDiscordShareWire(wire)).toMatchObject({
      mapCount: 500,
      observedModSampleSize: 500,
      sessionMinutes: 900,
      observedDelirium: {
        sampleSize: 37,
        levelCounts: [{ percentage: 100, count: 37 }],
      },
    });
  });

  it('keeps observed Delirium separate from configured Orb setup', () => {
    const decoded = decodeDiscordShareWire(encodeDiscordShareWire(parsed({
      deliOrbQty: 0,
      deliOrbType: '',
      deliOrbPrice: 0,
      observedDelirium: {
        sampleSize: 37,
        levelCounts: [{ percentage: 100, count: 37 }],
        rewardCounts: [{ name: 'Jewellery', count: 74 }],
      },
    })));
    expect(decoded).toMatchObject({
      deliOrbQty: 0,
      deliOrbType: '',
      deliOrbPrice: 0,
      observedDelirium: {
        sampleSize: 37,
        levelCounts: [{ percentage: 100, count: 37 }],
        rewardCounts: [{ name: 'Jewellery', count: 74 }],
      },
    });
  });

  it('keeps legacy schema-v2 compact submissions readable', () => {
    const legacyPayload = [
      2,
      0,
      [10, 6, 1, null, 80, 60, 40, 0],
      [10, 100, 200, 100, 0.1, 200],
      ['None', 0, [], 0, '', 0, '', 0, 0],
      ['', null, null],
      ['Allflame', null, '', null, null],
      ['Legacy compact strategy', '', []],
      [0, null, [], null],
      [''],
      null,
      null,
    ];
    const encoded = zlibSync(strToU8(JSON.stringify(legacyPayload)), { level: 9 });
    let binary = '';
    for (const byte of encoded) binary += String.fromCharCode(byte);
    const wire = `${DISCORD_SHARE_WIRE_PREFIX}${btoa(binary)
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
    expect(decodeDiscordShareWire(wire)).toMatchObject({
      mapCount: 10,
      strategyName: 'Legacy compact strategy',
      observedDelirium: null,
    });
  });

  it('infers the exact observed sample and omits derived Slam data', () => {
    const decoded = decodeDiscordShareWire(encodeDiscordShareWire(parsed()));
    expect(decoded).toMatchObject({
      observedModAverage: 5.8,
      observedModSampleSize: 37,
      slamRegex: '',
    });

    const partial = decodeDiscordShareWire(encodeDiscordShareWire(parsed({
      observedModSampleSize: 12,
    })));
    expect(partial).toMatchObject({
      observedModAverage: null,
      observedModSampleSize: null,
    });
  });

  it('round-trips update and evidence operation provenance', () => {
    const update = parsed({
      operation: 'update',
      updateStrategyId: '11111111-2222-4333-8444-555555555555',
    });
    expect(decodeDiscordShareWire(encodeDiscordShareWire(update))).toMatchObject({
      operation: 'update',
      updateStrategyId: '11111111-2222-4333-8444-555555555555',
    });

    const evidence = parsed({
      operation: 'evidence',
      evidenceTargetStrategyId: '11111111-2222-4333-8444-555555555555',
      evidenceExpectedRevision: 7,
      evidenceRunKey: `sha256-v1:${'a'.repeat(64)}`,
      evidenceRunStartedAt: '2026-08-15T01:00:00.000Z',
      evidenceRunEndedAt: '2026-08-15T02:00:00.000Z',
      setupFingerprint: `sha256-v1:${'b'.repeat(64)}`,
    });
    expect(decodeDiscordShareWire(encodeDiscordShareWire(evidence))).toMatchObject({
      operation: 'evidence',
      evidenceTargetStrategyId: '11111111-2222-4333-8444-555555555555',
      evidenceExpectedRevision: 7,
      evidenceRunKey: `sha256-v1:${'a'.repeat(64)}`,
      setupFingerprint: `sha256-v1:${'b'.repeat(64)}`,
    });
  });

  it('accepts a fenced token but rejects malformed, oversized, and invalid operations', () => {
    const wire = encodeDiscordShareWire(parsed());
    expect(decodeDiscordShareWire(`\`\`\`\n${wire}\n\`\`\``)).not.toBeNull();
    expect(decodeDiscordShareWire('wl2.not-valid-compressed-data')).toBeNull();
    expect(decodeDiscordShareWire(`wl2.${'a'.repeat(DISCORD_SHARE_WIRE_MAX)}`)).toBeNull();
    expect(() => encodeDiscordShareWire(parsed({ operation: null }))).toThrow(/operation/i);
  });

  it('rejects line injection instead of changing reconstructed field boundaries', () => {
    const injected = encodeDiscordShareWire(parsed({
      strategyNotes: 'safe\nLeague: Standard',
    }));
    expect(decodeDiscordShareWire(injected)).toBeNull();
    expect(parseDiscordExport(injected)).toBeNull();
  });
});
