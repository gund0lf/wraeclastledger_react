import { describe, expect, it } from 'vitest';
import {
  ATLAS_ANOMALIES,
  MERCENARY_ARCHETYPES,
  addManualAtlasAnomalyCount,
  addManualMercenaryCount,
  hasManualStatistics,
  mercenaryProfile,
  normalizeLocalManualStatistics,
  sanitizeManualStatistics,
  setBeastStatisticsInfoDismissed,
  setManualAtlasAnomalyCount,
  setManualMercenaryCount,
  setManualStatistic,
  setManualStatisticsInfoDismissed,
  totalMercenaryEncounters,
} from './manualStatistics';

describe('manual session statistics', () => {
  it('keeps unreported separate from an explicit zero', () => {
    expect(hasManualStatistics({})).toBe(false);
    const reported = setManualStatistic({}, 'starfallCraters', 0);
    expect(reported).toEqual({ starfallCraters: 0 });
    expect(hasManualStatistics(reported)).toBe(true);
    expect(setManualStatistic(reported, 'starfallCraters', null)).toEqual({});
  });

  it('keeps the Starfall denominator and Svalinn numerator as separate authored counts', () => {
    expect(sanitizeManualStatistics({ starfallCraters: 25, svalinnDrops: 1 })).toEqual({
      starfallCraters: 25,
      svalinnDrops: 1,
    });
  });

  it('keeps the info dismissal per session without treating it as authored statistics', () => {
    const dismissed = setManualStatisticsInfoDismissed({}, true);
    expect(dismissed).toEqual({ infoDismissed: true });
    expect(hasManualStatistics(dismissed)).toBe(false);
    expect(sanitizeManualStatistics(dismissed)).toEqual(dismissed);
    expect(setManualStatisticsInfoDismissed(dismissed, false)).toEqual({});
    expect(sanitizeManualStatistics({ infoDismissed: 'yes' })).toBeNull();
  });

  it('keeps the beast-model dismissal per session without treating it as authored statistics', () => {
    const dismissed = setBeastStatisticsInfoDismissed({}, true);
    expect(dismissed).toEqual({ beastInfoDismissed: true });
    expect(hasManualStatistics(dismissed)).toBe(false);
    expect(sanitizeManualStatistics(dismissed)).toEqual(dismissed);
    expect(setBeastStatisticsInfoDismissed(dismissed, false)).toEqual({});
    expect(sanitizeManualStatistics({ beastInfoDismissed: 'yes' })).toBeNull();
  });

  it('collapses regular and Infamous catalogue duplicates into 36 real archetypes', () => {
    expect(MERCENARY_ARCHETYPES).toHaveLength(36);
    expect(MERCENARY_ARCHETYPES).toContain('Kineticist');
    expect(MERCENARY_ARCHETYPES).toContain('Warpriest of the Ruckus');
    expect(MERCENARY_ARCHETYPES).not.toContain('Bladereach');
  });

  it('maps all 36 archetypes to current attribute and House targeting profiles', () => {
    expect(MERCENARY_ARCHETYPES.every((name) => mercenaryProfile(name) !== null)).toBe(true);
    expect(mercenaryProfile('Kineticist')).toEqual({
      attributes: ['Strength', 'Dexterity', 'Intelligence'],
      house: 'Bardiya',
    });
    expect(mercenaryProfile('Combatant')).toEqual({
      attributes: ['Strength', 'Dexterity'],
      house: 'Azadi',
    });
  });

  it('stores the current Atlas anomaly catalogue as counted local rows', () => {
    expect(ATLAS_ANOMALIES).toHaveLength(11);
    let stats = addManualAtlasAnomalyCount({}, 'The Manor Foyer', 2);
    stats = addManualAtlasAnomalyCount(stats, 'The Manor Foyer', 1);
    expect(stats.atlasAnomalies).toEqual([{ name: 'The Manor Foyer', count: 3 }]);
    expect(setManualAtlasAnomalyCount(stats, 'The Manor Foyer', null)).toEqual({});
  });

  it('merges counts by archetype because House is inferred reference data', () => {
    let stats = addManualMercenaryCount({}, 'Kineticist', 2);
    stats = addManualMercenaryCount(stats, 'Kineticist', 3);
    expect(stats.mercenaries).toEqual([{ archetype: 'Kineticist', count: 5 }]);
    expect(totalMercenaryEncounters(stats)).toBe(5);
  });

  it('edits and removes a single counted archetype', () => {
    const initial = addManualMercenaryCount({}, 'Sniper', 4);
    const edited = setManualMercenaryCount(initial, 'Sniper', 2);
    expect(edited.mercenaries?.[0].count).toBe(2);
    expect(setManualMercenaryCount(edited, 'Sniper', null)).toEqual({});
  });

  it('strictly rejects malformed public data but preserves unknown future names', () => {
    expect(sanitizeManualStatistics({ starfallCraters: -1 })).toBeNull();
    expect(sanitizeManualStatistics({ mercenaries: [{ archetype: 'Sniper', house: null, count: 0 }] })).toBeNull();
    expect(sanitizeManualStatistics({
      mercenaries: [{ archetype: 'Future Archetype', house: 'Future House', count: 2 }],
    })).toEqual({
      mercenaries: [{ archetype: 'Future Archetype', count: 2 }],
    });
    expect(normalizeLocalManualStatistics({ gold: 10 })).toEqual({});
  });

  it('collapses obsolete locally-authored House suffixes by archetype', () => {
    expect(normalizeLocalManualStatistics({
      mercenaries: [
        { archetype: 'Kineticist', house: null, count: 2 },
        { archetype: 'Kineticist', house: 'Keita', count: 3 },
      ],
    })).toEqual({ mercenaries: [{ archetype: 'Kineticist', count: 5 }] });
  });
});
