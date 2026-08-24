import { describe, expect, it } from 'vitest';
import { deriveShareTags } from './shareTags';
import { ALL_TYPE_TAGS, MAP_TYPE_LABELS, TAG_OPTIONS, TAG_SHORT } from './strategyConstants';

const normalMap = {
  isOriginator: false,
  isEmpoweredMirage: false,
  isNightmare: false,
};

describe('deriveShareTags', () => {
  it('offers one Trarthus taxonomy value instead of a duplicate Mercenaries tag', () => {
    expect(ALL_TYPE_TAGS).toContain('bestiary');
    expect(ALL_TYPE_TAGS).toContain('trarthus');
    expect(ALL_TYPE_TAGS).not.toContain('mercenaries');
  });

  it('explains that the Regular map-family tag includes corrupted 8-mod maps', () => {
    expect(TAG_OPTIONS.find((option) => option.value === 'regular')?.label).toBe('Regular');
    expect(TAG_SHORT.regular).toBeUndefined();
    expect(MAP_TYPE_LABELS.regular).toContain('including corrupted 8-mod');
  });

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

  it('tags bought pre-delirious maps from observed map metadata without orb setup', () => {
    expect(deriveShareTags({
      scarabs: [],
      atlasDetectedTags: [],
      advAstrolabeType: '',
    }, [{ ...normalMap, deliriousPct: 100 }])).toEqual(['regular', 'delirium']);
  });

  it('infers the selectable Bestiary tag from exact Bestiary scarabs', () => {
    const tags = deriveShareTags({
      scarabs: [{ name: 'Bestiary Scarab of the Herd', cost: 2 }],
      atlasDetectedTags: [],
      advAstrolabeType: '',
    }, [normalMap]);

    expect(tags).toEqual(['regular', 'bestiary']);
    expect(tags.every((tag) => ALL_TYPE_TAGS.includes(tag))).toBe(true);
  });

  it('uses one Trarthus taxonomy tag for Trarthan scarabs', () => {
    const tags = deriveShareTags({
      scarabs: [{ name: 'Trarthan Scarab of Infamy', cost: 18 }],
      atlasDetectedTags: [],
      advAstrolabeType: '',
    }, [normalMap]);

    expect(tags).toEqual(['regular', 'trarthus']);
    expect(tags.every((tag) => ALL_TYPE_TAGS.includes(tag))).toBe(true);
  });

  it('keeps a direct mechanic scarab authoritative when Atlas pathing is below threshold', () => {
    expect(deriveShareTags({
      scarabs: [{ name: 'Betrayal Scarab', cost: 1 }],
      atlasDetectedTags: [],
      advAstrolabeType: '',
    }, [normalMap])).toEqual(['regular', 'betrayal']);
  });
});
