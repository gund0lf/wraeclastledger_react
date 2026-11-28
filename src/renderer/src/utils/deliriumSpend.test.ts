import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { computeCosts, deviceInvestment } from './profit';
import { buildDiscordExport } from './discordExport';
import { parseDiscordExport } from './parseDiscordExport';
import { deviceInvestmentLosses } from './deviceInvestmentLosses';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { paidDeliriumOrbLimit, fixedDeliriumPercentage } from '../../../shared/deliriumOrbs';
import { decodeStrategySetupCode, encodeStrategySetupCode, type StrategySetupCode } from '../../../shared/strategySetupCode';
import { buildSetupOnlyImportPlan } from './setupOnlyImport';
import { investmentCompleteness } from './investmentCompleteness';
import { buildCovensShare } from './covensShare';
import { useSessionStore } from '../store/useSessionStore';
import { encodeSessionPayload, decodeSessionPayload } from '../repository/sessionPayloadCodec';
import { parseMapClipboard } from './mapParser';
import { deriveAtlasCalcSettingsSnapshot } from '../../../shared/atlasStats';

it('charges only the supplied quantity and exports the Unwavering Vision bonus on its active type', () => {
  const sourceUrl = 'https://atlas.wraeclastledger.com/?v=3.30.0-atlas#AAAABgAAAwIAYfNxdXF1AAA=';
  const calc = deriveAtlasCalcSettingsSnapshot([{ title: 'Atlas', stats: [
    'You can only apply one type of Thread to your Maps',
    'Your Maps with Threads applied gain 2 additional Threads, which can bypass the 8 Thread maximum',
  ] }]);
  const setup = { ...settings, atlasTreeUrl: sourceUrl, threadSlots: [{ name: 'Abyss Thread', count: 8, granted: 0, price: 3 }],
    atlasStatsRead: { schemaVersion: 1 as const, readAt: '', sourceUrl, leagueName: 'Covens', calc } };
  expect(deviceInvestment(setup)).toMatchObject({ paid: 8, effective: 10, threadCost: 24 });
  expect(buildCovensShare(setup, [])?.threads?.[0]).toMatchObject({ paid: 8, granted: 2 });
  expect(deviceInvestment({ ...setup, threadSlots: [] }).effective).toBe(0);
});

it('requires a player to identify Atlas-granted Threads before assigning a type on a public share', () => {
  const calc = deriveAtlasCalcSettingsSnapshot([{ title: 'Map modifiers', stats: [
    'Your Maps with [Thread|Threads] applied gain 2 additional Threads, which can bypass the 8 Thread maximum',
  ] }]);
  const sourceUrl = 'https://pathofpathing.com/?v=3.30.0-atlas#AAAAAAAAAAAAAAAA';
  const slots = [{ name: 'Bestiary Thread', count: 1, price: 3 }];
  const setup = { ...settings, atlasTreeUrl: sourceUrl, threadSlots: slots,
    atlasStatsRead: { schemaVersion: 1 as const, readAt: '', sourceUrl, leagueName: 'Covens', calc } };
  expect(() => buildCovensShare(setup, [])).toThrow('granted Threads by type');
  expect(buildCovensShare({ ...setup, threadSlots: [...slots,
    { name: 'Breach Thread', count: 0, granted: 2, price: 0 }] }, [])?.threads?.[1])
    .toMatchObject({ paid: 0, granted: 2, price_each: null });
});

it('preserves paid, granted-only and paused Thread rows through the repository', () => {
  const threadSlots = [
    { name: 'Bestiary Thread', count: 0, granted: 2, price: 0 },
    { name: 'Legion Thread', count: 1, granted: 0, paused: true, price: 3 },
  ];
  const state = useSessionStore.getInitialState();
  const saved = encodeSessionPayload({ ...state, settings: { ...state.settings, threadSlots } });
  expect(decodeSessionPayload(saved, DEFAULT_SETTINGS).settings.threadSlots).toEqual(threadSlots);
});

it('projects measured maps and mixed orb spend with independent coverage and unknown prices', () => {
  const map = parseMapClipboard(['Item Class: Maps', 'Rarity: Rare', 'Fixture', 'Map (Tier 16)', '--------',
    'Atlas Drops: +45% (augmented)', '--------', '{ Rare-only Suffix Modifier "Encounter" }',
    'Area contains a Mirage', '--------', 'Travel to a Map of this tier or lower by using this in a personal Map Device.'].join('\n'))!;
  const unknown = { ...map, rawText: undefined, confirmedEncounters: undefined, atlasDrops: undefined };
  const rows = [map, map, map, { ...map, moreThreads: 0 }, unknown, unknown];
  const wire = buildCovensShare({ ...settings, threadSlots: [{ name: 'Bestiary Thread', count: 1, price: 0 }] }, rows)!;
  expect(wire.encounters).toMatchObject({ readable: 4, unknown: 2, confirmed: { mirage: 4 } });
  expect(wire.atlas_drops).toEqual({ sum: 180, count: 4 });
  expect(wire.more_threads).toEqual({ sum: 0, count: 1 });
  expect(wire.orbs!.reduce((sum, row) => sum + row.used * row.price_each!.amount, 0) / rows.length).toBe(17);
  expect(wire.threads![0].price_each).toBeNull();
});

const settings = { ...DEFAULT_SETTINGS, leagueName: 'Covens', divinePrice: 200, deliriumOrbSpend: [
  { type: 'Armoursmith', count: 23, priceEach: 4 }, { type: 'Threaded', count: 5, priceEach: 2 },
] };

it('spreads actual session orb expenditure across played maps', () => {
  expect(computeCosts(settings, 6).totalInvest / 6).toBe(17);
  expect(computeCosts(settings, 7).totalInvest).toBe(102);
});

it('records expenditure on rerolls even before a map is played', () => {
  expect(computeCosts(settings, 0).totalInvest).toBe(102);
});

it('keeps the recorded per-map method on an existing Covens session', () => {
  const legacy = { ...DEFAULT_SETTINGS, leagueName: 'Covens', advDeliOrbType: 'Fine',
    advDeliOrbPriceEach: 4, advDeliOrbQtyPerMap: 3 };
  expect(computeCosts(legacy, 6).totalInvest).toBe(72);
  expect(computeCosts({ ...legacy, deliriumOrbSpend: [] }, 6).totalInvest).toBe(0);
});

it('shares the observed Armour reward of a purchased 100% map with zero orb spend', () => {
  const empty = { ...settings, deliriumOrbSpend: [] };
  const map = { quantity: 0, rarity: 10, packSize: 10, moreCurrency: 0, moreScarabs: 0,
    deliriousPct: 100, deliriumRewardTypes: ['Armour'] };
  expect(computeCosts(empty, 1).totalInvest).toBe(0);
  const exported = buildDiscordExport({ settings: empty, maps: [map], baselineTotal: 0, lootItems: [], investmentNeutralization: 0 });
  expect(parseDiscordExport(exported)?.observedDelirium).toMatchObject({ sampleSize: 1,
    levelCounts: [{ percentage: 100, count: 1 }], rewardCounts: [{ name: 'Armour', count: 1 }] });
});

it('matches each paid type once and caps it at units spent, including before the first run', () => {
  const item = (name: string, count: number, price: number) => ({ id: name, name, tab: 'test',
    quantity: String(count), price: String(price), total: count * price, excluded: false });
  const before = [item("Armoursmith's Delirium Orb", 30, 4), item('Threaded Delirium Orb', 2, 2)];
  const after = [item('Chaos Orb', 1, 1)];
  for (const n of [0, 6]) {
    expect(deviceInvestmentLosses(settings, n, before, after)).toEqual([
      { name: "Armoursmith's Delirium Orb", value: 92 }, { name: 'Threaded Delirium Orb', value: 4 },
    ]);
  }
});

it('keeps observations outside author notes in a mixed share', () => {
  const base = { quantity: 0, rarity: 10, packSize: 10, moreCurrency: 0, moreScarabs: 0 };
  const maps = [{ ...base, deliriousPct: 10, deliriumRewardTypes: ['Threads'] },
    { ...base, deliriousPct: 20, deliriumRewardTypes: ['Divination Cards'] },
    { ...base, deliriousPct: 28, deliriumRewardTypes: ['Armour'] }, base];
  const result = buildDiscordExport({ settings, maps, baselineTotal: 0, lootItems: [], investmentNeutralization: 0 });
  const parsed = parseDiscordExport(result)!;
  expect(parsed.strategyNotes).toBe('');
  expect(parsed.observedDelirium?.rewardCounts).toHaveLength(3);
  expect(parsed.observedDelirium?.sampleSize).toBe(3);
});

it('uses versioned game data for a new league with reforge rules', () => {
  const rules = { ...BUNDLED_MANIFEST, leagueRules: { Successor: BUNDLED_MANIFEST.leagueRules!.Covens } };
  expect(paidDeliriumOrbLimit('Successor', rules)).toBeGreaterThan(5);
  expect(fixedDeliriumPercentage('Successor', 2, rules)).toBeNull();
  expect(fixedDeliriumPercentage('Allflame', 2)).toBe(40);
  expect(fixedDeliriumPercentage('Unidentified league', 2)).toBeNull();
});

it('loads reusable orb types without carrying over historical quantities or prices', () => {
  const setup: StrategySetupCode = { version: 1, kind: 'setup', title: '', notes: '', league: 'Covens',
    mapType: '6-mod', chisel: null, scarabs: [], delirium: null, deliriumOrbTypes: ['Armoursmith', 'Threaded'],
    astrolabe: null, atlasTreeUrl: null, runRegex: '' };
  const decoded = decodeStrategySetupCode(encodeStrategySetupCode(setup))!;
  expect(buildSetupOnlyImportPlan(decoded).investment).toMatchObject({
    deliriumOrbTypes: ['Armoursmith', 'Threaded'], deliriumType: '', deliriumCountPerMap: 0 });
});

it('distinguishes free orbs from missing prices', () => {
  const row = { type: 'Fine', count: 4, priceEach: 0 };
  expect(investmentCompleteness({ ...settings, deliriumOrbSpend: [row] }).sections.delirium).toBe('filled');
  expect(investmentCompleteness({ ...settings, deliriumOrbSpend: [{ ...row, priceEach: null }] }).sections.delirium).toBe('incomplete');
});

it('explains how to keep the legacy estimate before converting a copy', () => {
  const settings = { ...DEFAULT_SETTINGS, leagueName: 'Covens', advDeliOrbType: 'Fine', advDeliOrbQtyPerMap: 3, deliriumOrbSpend: undefined };
  expect(() => buildCovensShare(settings, [])).toThrow(/Duplicate as new.*Investment.*Advanced Costs.*Delirium Orbs.*original keeps/i);
});
