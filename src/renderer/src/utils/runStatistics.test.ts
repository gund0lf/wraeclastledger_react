import { describe, expect, it } from 'vitest';
import type { LootItem, SavedSession } from '../types';
import {
  VALUABLE_BEAST_NAMES,
  aggregateRunStatisticsSessions,
  buildBestiaryRateModel,
  collectRunStatisticsSessions,
  deriveMercenaryScarabSetup,
  deriveMercenaryTargetingImpact,
  deriveValuableBeastGains,
  estimateBestiaryEncounter,
  observedRatePercent,
  remainingUntrackedMaps,
  totalValuableBeastGains,
  valuableBeastName,
} from './runStatistics';

const item = (
  name: string,
  quantity: number,
  total = quantity * 10,
  excluded = false,
): LootItem => ({
  id: `${name}-${quantity}-${total}`,
  name,
  tab: '9',
  quantity: String(quantity),
  price: '',
  total,
  excluded,
});

describe('derived run statistics', () => {
  it('uses the 11 identities selected by the supplied 20-chaos Allflame beast export', () => {
    expect(VALUABLE_BEAST_NAMES).toHaveLength(11);
    expect(VALUABLE_BEAST_NAMES).toContain('Black Mórrigan');
    expect(VALUABLE_BEAST_NAMES).toContain('Primal Cystcaller');
    expect(VALUABLE_BEAST_NAMES).not.toContain('Craicic Maw');
  });

  it('matches exact normalized beast identity without fuzzy containment', () => {
    expect(valuableBeastName('Black Morrigan')).toBe('Black Mórrigan');
    expect(valuableBeastName('  FARRUL, FIRST OF THE PLAINS ')).toBe('Farrul, First of the Plains');
    expect(valuableBeastName('Craicic Croaker Replica')).toBeNull();
  });

  it('derives positive quantity gains independently of prices and exclusions', () => {
    const gains = deriveValuableBeastGains(
      [item('Black Mórrigan', 1, 500), item('Craicic Croaker', 4, 400)],
      [item('Black Morrigan', 3, 300, true), item('Craicic Croaker', 4, 900)],
    );
    expect(gains).toEqual([{
      name: 'Black Mórrigan',
      baselineQuantity: 1,
      returnQuantity: 3,
      gainedQuantity: 2,
    }]);
    expect(totalValuableBeastGains(gains)).toBe(2);
  });

  it('requires both snapshots and ignores losses or non-shortlist beasts', () => {
    expect(deriveValuableBeastGains([], [item('Black Mórrigan', 2)])).toEqual([]);
    expect(deriveValuableBeastGains(
      [item('Craicic Croaker', 3), item('Craicic Maw', 1)],
      [item('Craicic Croaker', 1), item('Craicic Maw', 5)],
    )).toEqual([]);
  });

  it('calculates observed map rates and the explicit Other remainder', () => {
    expect(observedRatePercent(3, 9)).toBeCloseTo(33.333);
    expect(observedRatePercent(1, 0)).toBeNull();
    expect(remainingUntrackedMaps(2, 9)).toBe(7);
    expect(remainingUntrackedMaps(12, 9)).toBe(0);
  });

  it('aggregates explicit observations with per-metric denominators', () => {
    const aggregate = aggregateRunStatisticsSessions([
      {
        id: 'a',
        mapCount: 10,
        manualStatistics: {
          starfallCraters: 2,
          svalinnDrops: 1,
          wildwoodEncounters: 0,
          atlasAnomalies: [{ name: 'The Manor Foyer', count: 2 }],
          mercenaries: [{ archetype: 'Kineticist', count: 2 }],
        },
        baselineItems: [item('Black Mórrigan', 1)],
        lootItems: [item('Black Mórrigan', 3)],
      },
      {
        id: 'b',
        mapCount: 20,
        manualStatistics: {
          starfallCraters: 4,
          wildwoodEncounters: 2,
          atlasAnomalies: [
            { name: 'The Manor Foyer', count: 1 },
            { name: 'The Court of Chaos', count: 3 },
          ],
          mercenaries: [
            { archetype: 'Kineticist', count: 1 },
            { archetype: 'Sniper', count: 2 },
          ],
        },
        baselineItems: [item('Chaos Orb', 1)],
        lootItems: [item('Black Mórrigan', 1)],
      },
      {
        id: 'c',
        mapCount: 30,
        manualStatistics: { svalinnDrops: 1 },
        baselineItems: [],
        lootItems: [],
      },
    ]);

    expect(aggregate.sessionCount).toBe(3);
    expect(aggregate.mapCount).toBe(60);
    expect(aggregate.counters.starfallCraters).toEqual({
      count: 6, mapCount: 30, sessionCount: 2,
    });
    expect(aggregate.counters.wildwoodEncounters).toEqual({
      count: 2, mapCount: 30, sessionCount: 2,
    });
    expect(aggregate.counters.svalinnDrops).toEqual({
      count: 2, mapCount: 40, sessionCount: 2,
    });
    expect(aggregate.svalinnCraterCount).toBe(2);
    expect(aggregate.svalinnDenominatorComplete).toBe(false);
    expect(aggregate.atlasAnomalies).toEqual([
      { name: 'The Court of Chaos', count: 3, mapCount: 20, sessionCount: 1 },
      { name: 'The Manor Foyer', count: 3, mapCount: 30, sessionCount: 2 },
    ]);
    expect(aggregate.mercenaryTotal).toBe(5);
    expect(aggregate.mercenaryMapCount).toBe(30);
    expect(aggregate.untrackedMercenaryMaps).toBe(25);
    expect(aggregate.mercenaries).toEqual([
      { archetype: 'Kineticist', count: 3, mapCount: 30, sessionCount: 2 },
      { archetype: 'Sniper', count: 2, mapCount: 20, sessionCount: 1 },
    ]);
    expect(aggregate.beastGains).toEqual([{
      name: 'Black Mórrigan', baselineQuantity: 1, returnQuantity: 4, gainedQuantity: 3,
    }]);
    expect(aggregate.beastMapCount).toBe(30);
    expect(aggregate.beastSessionCount).toBe(2);
  });

  it('replaces the active saved snapshot with live state exactly once', () => {
    const saved = (id: string, mapCount: number): SavedSession => ({
      id,
      name: id,
      createdAt: id,
      maps: Array.from({ length: mapCount }, () => ({})),
      lootItems: [],
      baselineItems: [],
      baselineTotal: 0,
      manualStatistics: { starfallCraters: 1 },
      settings: {},
    } as unknown as SavedSession);
    const savedSessions = { a: saved('a', 3), b: saved('b', 7) };
    const current = {
      mapCount: 5,
      manualStatistics: { starfallCraters: 2 },
      baselineItems: [],
      lootItems: [],
    };

    const active = collectRunStatisticsSessions(current, 'a', savedSessions);
    expect(active).toHaveLength(2);
    expect(active.find((session) => session.id === 'a')?.mapCount).toBe(5);
    expect(active.find((session) => session.id === 'a')?.manualStatistics.starfallCraters).toBe(2);

    const unsaved = collectRunStatisticsSessions(current, null, savedSessions);
    expect(unsaved).toHaveLength(3);
    expect(unsaved.filter((session) => session.id === 'current-working-session')).toHaveLength(1);
  });

  it('normalizes captured beasts using the supplied Atlas and scarab setup', () => {
    const scarabs = [
      { name: 'Bestiary Scarab of the Herd', cost: 10 },
      { name: 'Bestiary Scarab of the Herd', cost: 10 },
      { name: 'Bestiary Scarab of Duplicating', cost: 15 },
    ];
    const model = buildBestiaryRateModel({
      additionalEinharChancePct: 104,
      additionalRedChancePct: 30,
      additionalYellowBeasts: 2,
      yellowToRedChancePct: 15,
      pairChancePct: 8,
      capturedBeastCopyChancePct: 0,
    }, scarabs);
    expect(model).not.toBeNull();
    expect(model?.expectedBaseRedRollsPerMap).toBeCloseTo(12.275);
    expect(model?.capturedQuantityMultiplier).toBeCloseTo(2.16);
    const estimate = estimateBestiaryEncounter(24, 9, model!);
    expect(estimate?.estimatedBaseSightings).toBeCloseTo(11.111);
    expect(estimate?.capturedPerMap).toBeCloseTo(2.667);
    expect(estimate?.estimatedChancePerMapPct).toBeGreaterThan(60);
    expect(estimate?.estimatedChancePerMapPct).toBeLessThan(80);
  });

  it('does not invent an absolute Bestiary rate unless Einhar is guaranteed', () => {
    const atlas = {
      additionalEinharChancePct: 50,
      additionalRedChancePct: 30,
      additionalYellowBeasts: 2,
      yellowToRedChancePct: 15,
      pairChancePct: 8,
      capturedBeastCopyChancePct: 0,
    };
    expect(buildBestiaryRateModel(atlas, [
      { name: 'Bestiary Scarab of the Herd', cost: 10 },
    ])).toBeNull();
    expect(buildBestiaryRateModel(atlas, [
      { name: 'Bestiary Scarab', cost: 2 },
      { name: 'Bestiary Scarab of the Herd', cost: 10 },
    ])?.einharGuaranteedBy).toBe('scarab');
  });

  it('keeps Infamy guarantees and relative Atlas chance conceptually separate', () => {
    expect(deriveMercenaryScarabSetup([
      { name: 'Trarthan Scarab of Infamy', cost: 29 },
    ])).toEqual({ forcesEncounter: false, infamy: true, additionalWildMercenaries: 2 });
    expect(deriveMercenaryScarabSetup([
      { name: 'Trarthan Scarab', cost: 4 },
    ])).toEqual({ forcesEncounter: true, infamy: false, additionalWildMercenaries: 0 });
  });

  it('flags Kineticist attribute penalties without inventing a Bardiya boost', () => {
    const impact = deriveMercenaryTargetingImpact('Kineticist', {
      additionalEncounterChancePct: 50,
      lessStrengthAlignedChancePct: 75,
      lessDexterityAlignedChancePct: 75,
      lessIntelligenceAlignedChancePct: 75,
      increasedAzadiChancePct: 100,
      increasedKeitaChancePct: 100,
      increasedCyaxanChancePct: 100,
      increasedInfamousChancePct: 50,
    });
    expect(impact?.profile).toContain('Bardiya');
    expect(impact?.profile).toContain('House Bardiya');
    expect(impact?.profile).toContain('no Atlas boost exists');
    expect(impact?.penalties).toEqual([
      '75% less Strength',
      '75% less Dexterity',
      '75% less Intelligence',
    ]);
  });
});
