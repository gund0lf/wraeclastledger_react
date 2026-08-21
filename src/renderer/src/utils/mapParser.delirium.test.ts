import { describe, expect, it } from 'vitest';
import { DELIRIUM_MAP_FIXTURES } from './__fixtures__/deliriumMapFixtures';
import { parseMapClipboard } from './mapParser';

describe('real Allflame Delirium map fixtures', () => {
  for (const fixture of DELIRIUM_MAP_FIXTURES) {
    it(`parses ${fixture.deliriousPct}% ${fixture.name} metadata`, () => {
      const map = parseMapClipboard(fixture.text);
      expect(map).not.toBeNull();
      expect(map!.name).toBe(fixture.name);
      expect(map!.tier).toBe(16);
      expect(map!.deliriousPct).toBe(fixture.deliriousPct);
      expect(map!.deliriumRewardTypes).toEqual([...fixture.rewardTypes]);
      expect(map!.isCorrupted).toBe(true);
    });
  }

  it('preserves the repeated reward tracks on the 100% example', () => {
    const map = parseMapClipboard(DELIRIUM_MAP_FIXTURES[4].text)!;
    expect(map.deliriumRewardTypes).toEqual([
      'Jewellery',
      'Jewellery',
      'Armour',
      'Armour',
      'Currency',
    ]);
  });

  it('does not invent metadata for an ordinary map', () => {
    const map = parseMapClipboard([
      'Item Class: Maps',
      'Rarity: Rare',
      'Ordinary Route',
      'Map (Tier 16)',
      'Item Quantity: +80% (augmented)',
      'Travel to a Map of this tier or lower by using this in a personal Map Device.',
    ].join('\n'))!;
    expect(map.deliriousPct).toBeUndefined();
    expect(map.deliriumRewardTypes).toBeUndefined();
  });

  it('rejects an out-of-range percentage without discarding valid rewards', () => {
    const text = DELIRIUM_MAP_FIXTURES[0].text.replace('20% Delirious', '120% Delirious');
    const map = parseMapClipboard(text)!;
    expect(map.deliriousPct).toBeUndefined();
    expect(map.deliriumRewardTypes).toEqual(['Weapons']);
  });
});
