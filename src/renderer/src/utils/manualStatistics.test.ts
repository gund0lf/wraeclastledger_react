import { describe, expect, it } from 'vitest';
import {
  ATLAS_ANOMALIES,
  MERCENARY_ARCHETYPES,
  addManualAtlasAnomalyCount,
  addManualMercenaryCount,
  buildRunStatisticsSetupContext,
  clearRunStatisticsSetupCategory,
  hasManualStatistics,
  mercenaryProfile,
  normalizeLocalManualStatistics,
  recordRunStatisticsSetupContext,
  sanitizeManualStatistics,
  setBeastStatisticsInfoDismissed,
  setManualAtlasAnomalyCount,
  setManualMercenaryCount,
  setManualStatistic,
  setManualStatisticsInfoDismissed,
  totalMercenaryEncounters,
} from './manualStatistics';
import type { SessionSettings } from '../types';

const setupSettings = (scarabNames: string[] = []): SessionSettings => ({
  leagueName: 'Allflame',
  atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAQzIQBJgJ',
  atlasDetectedTags: ['trarthus', 'bestiary', 'trarthus'],
  scarabs: scarabNames.map((name) => ({ name, cost: 99 })),
  bestiaryAtlasSetup: {
    additionalEinharChancePct: 104,
    additionalRedChancePct: 25,
    additionalYellowBeasts: 2,
    yellowToRedChancePct: 15,
    pairChancePct: 8,
    capturedBeastCopyChancePct: 0,
  },
  mercenaryAtlasSetup: {
    additionalEncounterChancePct: 90,
    lessStrengthAlignedChancePct: 75,
    lessDexterityAlignedChancePct: 50,
    lessIntelligenceAlignedChancePct: 25,
    increasedAzadiChancePct: 100,
    increasedKeitaChancePct: 0,
    increasedCyaxanChancePct: 0,
    increasedInfamousChancePct: 50,
  },
} as SessionSettings);

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

  it('captures normalized durable setup/source evidence without prices or slot order', () => {
    const context = buildRunStatisticsSetupContext(setupSettings([
      ' Trarthan Scarab of Infamy ',
      'Bestiary Scarab of the Herd',
      'Bestiary Scarab of the Herd',
    ]), 'manual-entry');
    expect(context).toMatchObject({
      schemaVersion: 1,
      modelRevision: 'allflame-v1',
      captureSource: 'manual-entry',
      leagueName: 'Allflame',
      atlasSource: 'path-of-pathing',
      atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAQzIQBJgJ',
      atlasDetectedTags: ['bestiary', 'trarthus'],
      scarabNames: [
        'Bestiary Scarab of the Herd',
        'Bestiary Scarab of the Herd',
        'Trarthan Scarab of Infamy',
      ],
    });
    expect(JSON.stringify(context)).not.toContain('99');
  });

  it('keeps Atlas setup unavailable when no safe source URL proves the scrape identity', () => {
    const settings = setupSettings(['Bestiary Scarab']);
    settings.atlasTreeUrl = 'https://example.com/not-the-atlas';
    expect(buildRunStatisticsSetupContext(settings, 'manual-entry')).toMatchObject({
      atlasSource: 'unavailable',
      atlasTreeUrl: null,
    });
  });

  it('retains distinct setup contexts and marks older unattributed results honestly', () => {
    const legacy = { mercenaries: [{ archetype: 'Kineticist', count: 1 }] };
    const captured = recordRunStatisticsSetupContext(
      legacy,
      'mercenaries',
      setupSettings(['Trarthan Scarab']),
      'manual-entry',
      true,
    );
    const mixed = recordRunStatisticsSetupContext(
      captured,
      'mercenaries',
      setupSettings(['Trarthan Scarab of Infamy']),
      'manual-entry',
      true,
    );
    expect(mixed.setupProvenance?.mercenaries).toMatchObject({
      legacyUnattributed: true,
    });
    expect(mixed.setupProvenance?.mercenaries?.contexts).toHaveLength(2);
    expect(hasManualStatistics({ setupProvenance: mixed.setupProvenance })).toBe(false);
    expect(sanitizeManualStatistics(mixed)).toEqual(mixed);
  });

  it('clears one provenance category without disturbing another', () => {
    const withManual = recordRunStatisticsSetupContext(
      { starfallCraters: 1 },
      'kalguuran',
      setupSettings(),
      'manual-entry',
      false,
    );
    const withBeasts = recordRunStatisticsSetupContext(
      withManual,
      'beasts',
      setupSettings(['Bestiary Scarab']),
      'loot-snapshots',
      false,
    );
    const cleared = clearRunStatisticsSetupCategory(withBeasts, 'kalguuran');
    expect(cleared.setupProvenance?.kalguuran).toBeUndefined();
    expect(cleared.setupProvenance?.beasts?.contexts).toHaveLength(1);
  });

  it('rejects malformed setup provenance instead of applying it as current truth', () => {
    expect(sanitizeManualStatistics({
      starfallCraters: 1,
      setupProvenance: {
        kalguuran: {
          contexts: [{
            ...buildRunStatisticsSetupContext(setupSettings(), 'manual-entry'),
            atlasSource: 'path-of-pathing',
            bestiaryAtlasSetup: undefined,
          }],
        },
      },
    })).toBeNull();
  });
});
