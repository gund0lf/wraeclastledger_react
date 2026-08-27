import { describe, expect, it } from 'vitest';
import {
  buildDeliriumRewardTradeStatFilter,
  buildDeliriumTradeStatFilter,
  ORDINARY_MAP_EXCLUDED_SPECIAL_STATS,
  SPECIAL_MAP_STAT_TEXT,
  resolveOrdinaryMapSpecialStatIds,
  resolveSpecialMapTradeStats,
  tradeItemTypeForMapType,
  usesOrdinaryMapSpecialExclusions,
} from '../../../shared/tradeMapFilters';

describe('ordinary-map special-map exclusions', () => {
  it('pins influence and Valdo conversion stats as the ordinary-map exclusion policy', () => {
    expect(ORDINARY_MAP_EXCLUDED_SPECIAL_STATS).toEqual([
      'originator',
      'shaperInfluence',
      'elderInfluence',
      'shaperConversion',
      'elderConversion',
      'conquerorConversion',
      'uniqueConversion',
      'scarabConversion',
      'mavenInvitationConversion',
      'atlasMemoryConversion',
    ]);
    expect(SPECIAL_MAP_STAT_TEXT).toEqual({
      originator: "Area is Influenced by the Originator's Memories",
      shaperInfluence: 'Area is influenced by The Shaper',
      elderInfluence: 'Area is influenced by The Elder',
      shaperConversion: '#% chance for dropped Maps to convert to Shaper Maps',
      elderConversion: '#% chance for dropped Maps to convert to Elder Maps',
      conquerorConversion: '#% chance for dropped Maps to convert to Conqueror Maps',
      uniqueConversion: '#% chance for dropped Maps to convert to Unique Maps',
      scarabConversion: '#% chance for dropped Maps to convert to Scarabs',
      mavenInvitationConversion: '#% chance for dropped Maps to convert to Maven Invitations',
      atlasMemoryConversion: '#% chance for dropped Maps to convert to Atlas Memories',
    });
  });

  it('returns every resolved stat id in policy order', () => {
    expect(resolveOrdinaryMapSpecialStatIds(new Map([
      ['originator', 'implicit.originator'],
      ['shaperInfluence', 'implicit.influence|1'],
      ['elderInfluence', 'implicit.influence|2'],
      ['shaperConversion', 'pseudo.convert-shaper'],
      ['elderConversion', 'pseudo.convert-elder'],
      ['conquerorConversion', 'pseudo.convert-conqueror'],
      ['uniqueConversion', 'pseudo.convert-unique'],
      ['scarabConversion', 'pseudo.convert-scarab'],
      ['mavenInvitationConversion', 'pseudo.convert-maven'],
      ['atlasMemoryConversion', 'pseudo.convert-memory'],
    ]))).toEqual({
      ids: [
        'implicit.originator',
        'implicit.influence|1',
        'implicit.influence|2',
        'pseudo.convert-shaper',
        'pseudo.convert-elder',
        'pseudo.convert-conqueror',
        'pseudo.convert-unique',
        'pseudo.convert-scarab',
        'pseudo.convert-maven',
        'pseudo.convert-memory',
      ],
      missing: [],
    });
  });

  it('resolves exact normalized Trade text and rejects substring decoys', () => {
    const result = resolveSpecialMapTradeStats([
      {
        id: 'implicit.originator',
        text: "Area is Influenced by the Originator's Memories",
      },
      {
        id: 'implicit.shaper',
        text: 'Area is influenced by The Shaper',
      },
      {
        id: 'implicit.shaper-decoy',
        text: 'Area is influenced by The Shaper while occupied by another boss',
      },
      {
        id: 'implicit.elder',
        text: 'Area is influenced by The Elder',
      },
      ...Object.entries(SPECIAL_MAP_STAT_TEXT)
        .filter(([key]) => key.endsWith('Conversion'))
        .map(([key, text]) => ({ id: `pseudo.${key}`, text })),
    ]);

    expect([...result.resolved]).toEqual([
      ['originator', 'implicit.originator'],
      ['shaperInfluence', 'implicit.shaper'],
      ['elderInfluence', 'implicit.elder'],
      ['shaperConversion', 'pseudo.shaperConversion'],
      ['elderConversion', 'pseudo.elderConversion'],
      ['conquerorConversion', 'pseudo.conquerorConversion'],
      ['uniqueConversion', 'pseudo.uniqueConversion'],
      ['scarabConversion', 'pseudo.scarabConversion'],
      ['mavenInvitationConversion', 'pseudo.mavenInvitationConversion'],
      ['atlasMemoryConversion', 'pseudo.atlasMemoryConversion'],
    ]);
    expect(result.unavailable).toEqual([]);
  });

  it('rejects ambiguous exact special-map definitions', () => {
    const result = resolveSpecialMapTradeStats([
      { id: 'implicit.originator', text: SPECIAL_MAP_STAT_TEXT.originator },
      { id: 'implicit.shaper-a', text: SPECIAL_MAP_STAT_TEXT.shaperInfluence },
      { id: 'implicit.shaper-b', text: SPECIAL_MAP_STAT_TEXT.shaperInfluence },
      { id: 'implicit.elder', text: SPECIAL_MAP_STAT_TEXT.elderInfluence },
      ...Object.entries(SPECIAL_MAP_STAT_TEXT)
        .filter(([key]) => key.endsWith('Conversion'))
        .map(([key, text]) => ({ id: `pseudo.${key}`, text })),
    ]);

    expect(result.resolved.has('shaperInfluence')).toBe(false);
    expect(result.unavailable).toContainEqual({
      key: 'shaperInfluence',
      actualCount: 2,
    });
  });

  it('reports missing stats so ordinary-map searches can fail closed', () => {
    expect(resolveOrdinaryMapSpecialStatIds(new Map([
      ['originator', 'implicit.originator'],
    ]))).toEqual({
      ids: ['implicit.originator'],
      missing: ORDINARY_MAP_EXCLUDED_SPECIAL_STATS.slice(1),
    });
  });

  it('applies the policy to Regular and 8-mod searches only', () => {
    expect(usesOrdinaryMapSpecialExclusions('regular')).toBe(true);
    expect(usesOrdinaryMapSpecialExclusions('8mod')).toBe(true);
    expect(usesOrdinaryMapSpecialExclusions('any')).toBe(false);
    expect(usesOrdinaryMapSpecialExclusions('nightmare')).toBe(false);
    expect(usesOrdinaryMapSpecialExclusions('originator')).toBe(false);
  });
});

describe('Trade item type filtering', () => {
  it('uses the exact Nightmare Map item type for Nightmare searches', () => {
    expect(tradeItemTypeForMapType('nightmare')).toBe('Nightmare Map');
  });

  it.each(['any', 'regular', '8mod', 'originator'])(
    'does not force an item type for %s searches',
    (mapType) => {
      expect(tradeItemTypeForMapType(mapType)).toBeUndefined();
    },
  );
});

describe('Delirium Trade filtering', () => {
  it('omits the filter for Any', () => {
    expect(buildDeliriumTradeStatFilter('enchant.delirious', -1)).toBeNull();
  });

  it('uses NOT for None', () => {
    expect(buildDeliriumTradeStatFilter('enchant.delirious', 0)).toEqual({
      type: 'not',
      filters: [{ id: 'enchant.delirious' }],
    });
  });

  it('pins a selected tier as an exact range', () => {
    expect(buildDeliriumTradeStatFilter('enchant.delirious', 20)).toEqual({
      type: 'and',
      filters: [{ id: 'enchant.delirious', value: { min: 20, max: 20 } }],
    });
  });

  it('fails loudly when a requested Delirium stat is unavailable', () => {
    expect(() => buildDeliriumTradeStatFilter(undefined, 20))
      .toThrow('Delirium Trade stat is unavailable');
  });

  it('uses Count 1 when one or more reward types are selected', () => {
    expect(buildDeliriumRewardTradeStatFilter([
      'enchant.reward-currency',
      'enchant.reward-jewellery',
    ])).toEqual({
      type: 'count',
      value: { min: 1 },
      filters: [
        { id: 'enchant.reward-currency' },
        { id: 'enchant.reward-jewellery' },
      ],
    });
  });

  it('omits an empty reward-type group and de-duplicates resolved stats', () => {
    expect(buildDeliriumRewardTradeStatFilter([])).toBeNull();
    expect(buildDeliriumRewardTradeStatFilter([
      'enchant.reward-currency',
      undefined,
      'enchant.reward-currency',
    ])).toEqual({
      type: 'count',
      value: { min: 1 },
      filters: [{ id: 'enchant.reward-currency' }],
    });
  });
});
