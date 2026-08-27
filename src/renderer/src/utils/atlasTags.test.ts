import { describe, expect, it } from 'vitest';
import {
  deriveAtlasDetectedTags,
  MIN_ATLAS_ENCOUNTER_CHANCE_FOR_TAG,
} from './atlasTags';

describe('deriveAtlasDetectedTags', () => {
  it('excludes mechanics disabled by Atlas block nodes', () => {
    expect(deriveAtlasDetectedTags([
      {
        title: 'Legion',
        stats: ['Your Maps have no chance to contain Legion Encounters'],
      },
      {
        title: 'Expedition',
        stats: ['Your Maps have no chance to contain Expedition Encounters'],
      },
      {
        title: 'Heist',
        stats: ["Your Maps have +90% chance to contain a Smuggler's Cache"],
      },
    ])).toEqual(['heist']);
  });

  it('deduplicates recognized positive headings and ignores unknown groups', () => {
    expect(deriveAtlasDetectedTags([
      { title: 'The Searing Exarch', stats: ['Maps have increased influence'] },
      { title: 'searing exarch', stats: ['Maps have another positive stat'] },
      { title: 'Atlas Memories', stats: ['Maps have Memory Influence'] },
    ])).toEqual(['exarch']);
  });

  it('returns an empty array so callers can clear stale tree tags', () => {
    expect(deriveAtlasDetectedTags([
      { title: 'Legion', stats: ['YOUR MAPS HAVE NO CHANCE TO CONTAIN LEGION ENCOUNTERS'] },
    ])).toEqual([]);
  });

  it('recognizes current-league headings and maps Mercenaries to Trarthus', () => {
    expect(deriveAtlasDetectedTags([
      { title: 'Bestiary', stats: ['Your Maps have +100% chance to contain Einhar'] },
      { title: 'Mercenaries', stats: ['Your Maps contain an additional Mercenary'] },
      { title: 'Settlers of Kalguur', stats: ['Your Maps have +102% chance to contain Ore Deposits'] },
    ])).toEqual(['bestiary', 'trarthus', 'kalguur']);
  });

  it('maps the Rogue Exiles Atlas heading to the Anarchy strategy tag', () => {
    expect(deriveAtlasDetectedTags([
      {
        title: 'Rogue Exiles',
        stats: [
          'Your Maps have a 100% chance to contain an additional Rogue Exile',
          'Your Maps have a 8% chance to contain 20 additional Rogue Exiles',
          '30% chance for Wild Rogue Exiles in your Maps to appear in Pairs',
          'Rogue Exiles in your Maps have 35% chance to drop an additional Currency Item',
          'Map Bosses have 20% chance to be accompanied by two Rogue Exile Bodyguards',
          'Wild Rogue Exiles in your Maps are Possessed by a Tormented Spirit',
          'Wild Rogue Exiles in your Maps have 50% chance to have additional Rewards',
          'Rogue Exiles in your Maps have 100% more Life',
          'Your Maps are inhabited by an additional Rogue Exile',
        ],
      },
    ])).toEqual(['anarchy']);
  });

  it('does not infer Bestiary from a disabled Atlas group', () => {
    expect(deriveAtlasDetectedTags([
      { title: 'Bestiary', stats: ['Your Maps have no chance to contain Einhar'] },
    ])).toEqual([]);
  });

  it('does not infer Kalguur from a disabled Atlas group', () => {
    expect(deriveAtlasDetectedTags([
      { title: 'Settlers of Kalguur', stats: ['Your Maps have no chance to contain Ore Deposits'] },
    ])).toEqual([]);
  });

  it('discards low encounter-chance-only pathing but retains meaningful investment', () => {
    expect(deriveAtlasDetectedTags([
      {
        title: 'Betrayal',
        stats: [
          'Your Maps have +8% chance to contain Jun',
          'Scarabs dropped in your Maps have 8% increased chance to be Betrayal Scarabs',
        ],
      },
      {
        title: 'Legion',
        stats: [
          `Your Maps have +${MIN_ATLAS_ENCOUNTER_CHANCE_FOR_TAG - 1}% chance to contain a Legion Encounter`,
          `Scarabs dropped in your Maps have ${MIN_ATLAS_ENCOUNTER_CHANCE_FOR_TAG - 1}% increased chance to be Legion Scarabs`,
        ],
      },
      {
        title: 'Harvest',
        stats: [
          'Your Maps have +8% chance to contain The Sacred Grove',
          'Scarabs dropped in your Maps have 8% increased chance to be Harvest Scarabs',
          'Harvest Crops in your Maps have 10% increased chance to contain a Tier 4 Plant',
        ],
      },
      {
        title: 'Heist',
        stats: [
          `Your Maps have +${MIN_ATLAS_ENCOUNTER_CHANCE_FOR_TAG}% chance to contain a Smuggler's Cache`,
          `Scarabs dropped in your Maps have ${MIN_ATLAS_ENCOUNTER_CHANCE_FOR_TAG}% increased chance to be Heist Scarabs`,
        ],
      },
    ])).toEqual(['harvest', 'heist']);
  });
});
