import { describe, expect, it } from 'vitest';
import { buildAtlasStatsSyncPatch, hasCurrentAtlasStatsRead } from './atlasStatsSync';
import { readAllocatedNodeIds } from '../../../shared/atlasStats';
import { allocatedChoiceNodes, currentChoiceEffects } from './atlasChoices';
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

  it('reads a transit choice from a full allocation and retains the answered effect for this tree', () => {
    const url = 'https://pathofpathing.com/?v=3.30.0-atlas#AAAABgAAAwIAYfNxdXF1AAA=';
    const code = btoa(String.fromCharCode(0, 0, 0, 6, 0, 0, 2, 0x61, 0xf3, 0x90, 0x06, 0, 0));
    const ids = readAllocatedNodeIds({ code, points: 2 });
    expect(ids).toEqual([25075, 36870]);
    expect(readAllocatedNodeIds({ code, points: 1 })).toBeUndefined();
    expect(readAllocatedNodeIds({ code: code.slice(0, -4), points: 2 })).toBeUndefined();
    expect(allocatedChoiceNodes(url)).toEqual([]);
    const patch = buildAtlasStatsSyncPatch([], url, 'Covens', undefined, ids);
    expect(patch.atlasStatsRead?.choiceNodeIds).toEqual([36870]);
    const [choice] = allocatedChoiceNodes(url, patch.atlasStatsRead?.choiceNodeIds);
    expect(choice.name).toBe('Controlled Detonation');
    const settings = { ...DEFAULT_SETTINGS, ...patch, leagueName: 'Covens', atlasTreeUrl: url,
      atlasChoiceAnswers: { sourceUrl: url, leagueName: 'Covens', effects: { '36870': choice.options[1].id } } };
    expect(currentChoiceEffects(settings)).toEqual(['Expedition Detonation Chains in your Maps travel 50% faster']);
    expect(currentChoiceEffects({ ...settings, leagueName: 'Allflame' })).toEqual([]);
  });

  it('rejects a stock or incomplete source URL', () => {
    expect(() => buildAtlasStatsSyncPatch([], 'https://pathofpathing.com', 'Allflame'))
      .toThrow('complete Atlas planner tree URL');
  });
});
