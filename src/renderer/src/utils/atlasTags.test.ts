import { describe, expect, it } from 'vitest';
import { deriveAtlasDetectedTags } from './atlasTags';

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
});
