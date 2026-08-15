import { describe, expect, it } from 'vitest';
import { deriveShareTags } from './shareTags';

const normalMap = {
  isOriginator: false,
  isEmpoweredMirage: false,
  isNightmare: false,
};

describe('deriveShareTags', () => {
  it('merges direct setup, Atlas, subtype, and exact Astrolabe evidence', () => {
    expect(deriveShareTags({
      scarabs: [
        { name: 'Breach Scarab of Instability', cost: 5 },
        { name: 'Abyss Scarab', cost: 5 },
        { name: 'Scarab of Monstrous Lineage', cost: 3 },
      ],
      atlasDetectedTags: ['heist', 'exarch'],
      advAstrolabeType: 'Grasping Astrolabe',
    }, [normalMap])).toEqual([
      'regular', 'breach', 'abyss', 'heist', 'exarch', 'astrolabe-grasping',
    ]);
  });

  it('derives a fresh empty result after setup and maps are cleared', () => {
    const previous = deriveShareTags({
      scarabs: [{ name: 'Legion Scarab', cost: 1 }],
      atlasDetectedTags: ['expedition'],
      advAstrolabeType: 'Fruiting Astrolabe',
    }, [normalMap]);
    const next = deriveShareTags({
      scarabs: [],
      atlasDetectedTags: [],
      advAstrolabeType: '',
    }, []);

    expect(previous).toEqual(['regular', 'legion', 'expedition', 'astrolabe-fruiting']);
    expect(next).toEqual([]);
  });

  it('preserves mixed subtype classification from the existing share rules', () => {
    expect(deriveShareTags({
      scarabs: [],
      atlasDetectedTags: [],
      advAstrolabeType: '',
    }, [normalMap, { ...normalMap, isNightmare: true }])).toEqual(['mixed']);
  });
});
