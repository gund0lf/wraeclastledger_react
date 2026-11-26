import { describe, expect, it } from 'vitest';
import { deriveShareTags, shareTagIssue } from './shareTags';
import { deriveAtlasCalcSettingsSnapshot } from '../../../shared/atlasStats';
import { ALL_TYPE_TAGS, MAP_TYPE_LABELS, TAG_OPTIONS, TAG_SHORT } from './strategyConstants';

const normalMap = {
  isOriginator: false,
  isEmpoweredMirage: false,
  isNightmare: false,
};

describe('Covens strategy tags', () => {
  const settings = { leagueName: 'Covens', scarabs: [], atlasDetectedTags: [], advAstrolabeType: '' };
  const explicit = (line: string) => ({ ...normalMap, rawText: '{ Rare-only Suffix Modifier "Encounter" }\n' + line + ' — Unscalable Value' });

  it.each([
    ['a Mirage', 'mirage'], ['the Viridian Wildwood', 'wildwood'], ['a Mirror of Delirium', 'delirium'],
    ...['Apex', 'Stalker', 'Pandemonium'].map(type => ['a buried ' + type + ' Sentinel', 'sentinel']),
    ...['Beidat', 'Ghorr', "K'Tash"].map(name => ['an Evocator of ' + name, 'beyond']),
  ])('tags an explicit encounter once across repeated maps: %s', (encounter, tag) => {
    const map = explicit('Area contains ' + encounter);
    expect(deriveShareTags(settings, [map, map])).toEqual(['regular', tag]);
  });

  it('derives Bestiary from an active granted-only Thread', () => {
    const slot = { name: 'Bestiary Thread', count: 0, granted: 1, price: 0 };
    expect(deriveShareTags({ ...settings, threadSlots: [slot] }, [normalMap])).toContain('bestiary');
    expect(deriveShareTags({ ...settings, threadSlots: [{ ...slot, paused: true }] }, [normalMap])).not.toContain('bestiary');
  });
  it('keeps Mirage encounters separate from enchants, old subtypes and strategy style', () => {
    for (const rawText of [
      '{ Enchantment Modifier }\nArea contains a Mirage', '{ Implicit Modifier }\nArea contains a Mirage',
      'Area contains a Mirage (enchant)', 'Area contains a Mirage (implicit)',
      '{ Rare-only }\nArea contains a Mirror of Delirium\n--------\nArea contains a Mirage',
    ]) expect(deriveShareTags(settings, [{ ...normalMap, rawText }])).not.toContain('mirage');
    const empowered = { ...explicit('Area contains a Mirage'), isEmpoweredMirage: true };
    expect(deriveShareTags(settings, [{ ...empowered, isOriginator: true }])).toEqual(['originator', 'mirage']);
    expect(deriveShareTags(settings, [empowered])).toEqual(['regular', 'mirage']);
    expect(deriveShareTags({ ...settings, leagueName: 'Allflame' }, [empowered])).toEqual(['empowered']);
    expect(deriveShareTags({ ...settings, leagueName: 'Mirage' }, [{ ...empowered, isOriginator: true }])).toEqual(['empowered-originator']);
    expect(TAG_SHORT['mirage-rush']).toBe('Mirage Rush');
  });

  it.each([
    [712, '50999', 'sentinel'], [712, '61631', 'wildwood'], [712, '40579', 'beyond'],
    [712, '17864', 'delirium'], [712, '8618', null],
    [12887, '51599', 'harvest'], [12887, '57448', 'torment'], [12887, '33096', 'essence'], [12887, '20818', 'shrine'],
  ] as const)('uses only the allocated and synced choice %s/%s', (node, answer, tag) => {
    const url = 'https://pathofpathing.com/?v=3.30.0-atlas#AAAABgAABAMAbz1xdfECcXUAAA==';
    const tagged = { ...settings, atlasTreeUrl: url,
      atlasChoiceAnswers: { sourceUrl: url, leagueName: 'Covens', effects: { [node]: answer } },
      atlasStatsRead: { schemaVersion: 1 as const, sourceUrl: url, leagueName: 'Covens', readAt: '',
        choiceNodeIds: [node], calc: deriveAtlasCalcSettingsSnapshot([]) } };
    expect(deriveShareTags(tagged, [])).toEqual(tag ? [tag] : []);
    expect(deriveShareTags({ ...tagged, atlasStatsRead: { ...tagged.atlasStatsRead, choiceNodeIds: [] } }, [])).toEqual([]);
  });

  it.each(['Immortal', 'Feral', 'Royal', 'Cryptic'])('identifies the %s Astrolabe without inferring its outcome', name => {
    expect(deriveShareTags({ ...settings, advAstrolabeType: name + ' Astrolabe' }, [])).toEqual(['astrolabe-' + name.toLowerCase()]);
  });

  it('offers each encounter, Astrolabe and previously missing mechanic once in the browser', () => {
    const expected = ['sentinel', 'mirage', 'mirage-rush', 'shrine', 'wildwood', 'torment', 'harbinger', 'metamorph', 'titanic',
      'astrolabe-immortal', 'astrolabe-feral', 'astrolabe-royal', 'astrolabe-cryptic'];
    for (const tag of expected) expect(ALL_TYPE_TAGS.filter(id => id === tag)).toEqual([tag]);
  });

  it('keeps current, historical and restored tag selections representable on both public share paths', () => {
    expect(shareTagIssue(['mirage', 'originator'], 'Covens', ['mirage'])).toBeNull();
    expect(shareTagIssue(['mirage'], 'Covens', [])).toMatch(/explicit/i);
    expect(shareTagIssue(['empowered-originator'], 'Covens', [])).toMatch(/Empowered Mirage/);
    expect(shareTagIssue(['empowered-originator', 'mirage-rush'], 'Mirage', [])).toBeNull();
    const tags = ALL_TYPE_TAGS.filter(id => !['mirage', 'empowered', 'empowered-originator'].includes(id));
    expect(shareTagIssue(tags.slice(0, 24), 'Covens', [])).toBeNull();
    expect(shareTagIssue(tags.slice(0, 25), 'Covens', [])).toMatch(/24/);
  });
});

describe('deriveShareTags', () => {
  it('offers one Trarthus taxonomy value instead of a duplicate Mercenaries tag', () => {
    expect(ALL_TYPE_TAGS).toContain('bestiary');
    expect(ALL_TYPE_TAGS).toContain('anarchy');
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

  it('infers the selectable Anarchy tag from the Anarchy scarab family', () => {
    const tags = deriveShareTags({
      scarabs: [{ name: 'Anarchy Scarab of the Exceptional', cost: 3 }],
      atlasDetectedTags: [],
      advAstrolabeType: '',
    }, [normalMap]);

    expect(tags).toEqual(['regular', 'anarchy']);
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
