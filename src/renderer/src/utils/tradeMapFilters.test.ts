import { describe, expect, it } from 'vitest';
import {
  buildDeliriumTradeStatFilter,
  EIGHT_MOD_EXCLUDED_SPECIAL_STATS,
  SPECIAL_MAP_STAT_TEXT,
  resolveEightModSpecialStatIds,
  resolveSpecialMapTradeStats,
  tradeItemTypeForMapType,
} from '../../../shared/tradeMapFilters';

describe('8-mod special-map exclusions', () => {
  it('pins Originator, Shaper, and Elder as the ordinary-map exclusion policy', () => {
    expect(EIGHT_MOD_EXCLUDED_SPECIAL_STATS).toEqual([
      'originator',
      'shaperInfluence',
      'elderInfluence',
    ]);
    expect(SPECIAL_MAP_STAT_TEXT).toEqual({
      originator: "Area is Influenced by the Originator's Memories",
      shaperInfluence: 'Area is influenced by The Shaper',
      elderInfluence: 'Area is influenced by The Elder',
    });
  });

  it('returns every resolved stat id in policy order', () => {
    expect(resolveEightModSpecialStatIds(new Map([
      ['originator', 'implicit.originator'],
      ['shaperInfluence', 'implicit.influence|1'],
      ['elderInfluence', 'implicit.influence|2'],
    ]))).toEqual({
      ids: ['implicit.originator', 'implicit.influence|1', 'implicit.influence|2'],
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
    ]);

    expect([...result.resolved]).toEqual([
      ['originator', 'implicit.originator'],
      ['shaperInfluence', 'implicit.shaper'],
      ['elderInfluence', 'implicit.elder'],
    ]);
    expect(result.unavailable).toEqual([]);
  });

  it('rejects ambiguous exact special-map definitions', () => {
    const result = resolveSpecialMapTradeStats([
      { id: 'implicit.originator', text: SPECIAL_MAP_STAT_TEXT.originator },
      { id: 'implicit.shaper-a', text: SPECIAL_MAP_STAT_TEXT.shaperInfluence },
      { id: 'implicit.shaper-b', text: SPECIAL_MAP_STAT_TEXT.shaperInfluence },
      { id: 'implicit.elder', text: SPECIAL_MAP_STAT_TEXT.elderInfluence },
    ]);

    expect(result.resolved.has('shaperInfluence')).toBe(false);
    expect(result.unavailable).toContainEqual({
      key: 'shaperInfluence',
      actualCount: 2,
    });
  });

  it('reports missing implicits so 8-mod search can fail closed', () => {
    expect(resolveEightModSpecialStatIds(new Map([
      ['originator', 'implicit.originator'],
    ]))).toEqual({
      ids: ['implicit.originator'],
      missing: ['shaperInfluence', 'elderInfluence'],
    });
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
});
