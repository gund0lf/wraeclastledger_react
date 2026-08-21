import { describe, expect, it } from 'vitest';
import {
  deriveAtlasCalcSettings,
  deriveBestiaryAtlasSetup,
  deriveMercenaryAtlasSetup,
} from '../../../shared/atlasStats';

describe('deriveAtlasCalcSettings', () => {
  it('maps Path of Pathing stats to the three Atlas Calc inputs', () => {
    expect(deriveAtlasCalcSettings([{
      title: 'Map Modifiers',
      stats: [
        '32% increased effect of Explicit Modifiers on your Maps',
        '2% increased effect of Explicit Modifiers on your Maps per Explicit Modifier',
        '3% increased effect of Explicit Modifiers on your Maps per Fragment used with Map',
      ],
    }])).toEqual({
      smallNodesAllocated: 16,
      mountingModifiers: true,
      multiplyingModifiersAllocated: true,
    });
  });

  it('returns only settings supported by the observed stats', () => {
    expect(deriveAtlasCalcSettings([{
      title: 'Map Modifiers',
      stats: ['12% increased effect of Explicit Modifiers on your Maps'],
    }])).toEqual({ smallNodesAllocated: 6 });
  });
});

describe('Run Statistics Atlas setup extraction', () => {
  it('extracts the supplied Bestiary setup without assuming unobserved values', () => {
    expect(deriveBestiaryAtlasSetup([{
      title: 'Bestiary',
      stats: [
        'Your Maps have +104% chance to contain Einhar',
        'Your Maps that contain capturable Beasts have 30% chance to contain an additional Red Beast',
        'Yellow Beasts in your Maps have 15% chance to be replaced with Red Beasts',
        'Your Maps that contain capturable Beasts contain 2 additional Yellow Beast',
        'Red Beasts in your Maps have 8% chance to appear in Pairs',
      ],
    }])).toEqual({
      additionalEinharChancePct: 104,
      additionalRedChancePct: 30,
      additionalYellowBeasts: 2,
      yellowToRedChancePct: 15,
      pairChancePct: 8,
      capturedBeastCopyChancePct: 0,
    });
  });

  it('extracts Mercenary targeting, House, encounter, and relative Infamous modifiers', () => {
    expect(deriveMercenaryAtlasSetup([{
      title: 'Mercenaries',
      stats: [
        'Your Maps have +50% chance to be inhabited by a Mercenary',
        'Mercenaries found in your Maps have 75% less chance to be Strength aligned',
        'Mercenaries found in your Maps have 75% less chance to be Dexterity aligned',
        'Mercenaries found in your Maps have 100% increased chance to be from House Azadi',
        '50% increased chance for Mercenaries found in your Maps to be Infamous',
      ],
    }])).toEqual({
      additionalEncounterChancePct: 50,
      lessStrengthAlignedChancePct: 75,
      lessDexterityAlignedChancePct: 75,
      lessIntelligenceAlignedChancePct: 0,
      increasedAzadiChancePct: 100,
      increasedKeitaChancePct: 0,
      increasedCyaxanChancePct: 0,
      increasedInfamousChancePct: 50,
    });
  });
});
