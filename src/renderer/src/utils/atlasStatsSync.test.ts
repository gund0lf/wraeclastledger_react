import { describe, expect, it } from 'vitest';
import { buildAtlasStatsSyncPatch, hasCurrentAtlasStatsRead } from './atlasStatsSync';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';

const url = 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAQzIQBJgJ';

describe('Atlas setup sync', () => {
  it('builds Calc, Run Statistics, tags, and durable identity from one read', () => {
    const patch = buildAtlasStatsSyncPatch([{
      title: 'Map Modifiers',
      stats: [
        '12% increased effect of Explicit Modifiers on your Maps',
        '2% increased effect of Explicit Modifiers on your Maps per Explicit Modifier',
      ],
    }, {
      title: 'Bestiary',
      stats: ['Your Maps have +100% chance to contain Einhar'],
    }], url, 'Allflame', '2026-08-27T12:00:00.000Z');

    expect(patch).toMatchObject({
      smallNodesAllocated: 6,
      mountingModifiers: true,
      multiplyingModifiersAllocated: false,
      bestiaryAtlasSetup: { additionalEinharChancePct: 100 },
      atlasStatsRead: {
        schemaVersion: 1,
        sourceUrl: url,
        leagueName: 'Allflame',
        readAt: '2026-08-27T12:00:00.000Z',
        calc: {
          smallNodesAllocated: 6,
          mountingModifiers: true,
          multiplyingModifiersAllocated: false,
        },
      },
    });
  });

  it('requires the current URL and league to match the successful read', () => {
    const patch = buildAtlasStatsSyncPatch([], url, 'Allflame', '2026-08-27T12:00:00.000Z');
    const settings = { ...DEFAULT_SETTINGS, leagueName: 'Allflame', atlasTreeUrl: url, ...patch };
    expect(hasCurrentAtlasStatsRead(settings)).toBe(true);
    expect(hasCurrentAtlasStatsRead({ ...settings, atlasTreeUrl: `${url}x` })).toBe(false);
    expect(hasCurrentAtlasStatsRead({ ...settings, leagueName: 'Mirage' })).toBe(false);
  });

  it('rejects a stock or incomplete source URL', () => {
    expect(() => buildAtlasStatsSyncPatch([], 'https://pathofpathing.com', 'Allflame'))
      .toThrow('complete Path of Pathing tree URL');
  });
});
