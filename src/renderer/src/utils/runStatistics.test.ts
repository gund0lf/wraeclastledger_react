import { describe, expect, it } from 'vitest';
import type { LootItem } from '../types';
import {
  VALUABLE_BEAST_NAMES,
  buildBestiaryRateModel,
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
