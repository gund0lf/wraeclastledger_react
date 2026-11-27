import { MantineProvider } from '@mantine/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { deriveAtlasCalcSettingsSnapshot } from '../../../shared/atlasStats';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { buildAtlasStatsSyncPatch } from '../utils/atlasStatsSync';
import { computeMultiplier } from '../utils/profit';
import { SurpassingChanceSection } from './SurpassingChanceSection';

const url = 'https://atlas.wraeclastledger.com/?v=3.30.0-atlas&choices=12887-20818.61698-60065#AAAABgAAAwIAYfNxdXF1AAA=';
const keyword = '[SurpassChance|Surpassing Chance]';
const box = (n: number) => `Your Maps have +${n}% ${keyword} to contain a Strongbox`;
const derive = (...stats: string[]) => deriveAtlasCalcSettingsSnapshot([{ title: 'Atlas', stats }]);
function render(...stats: string[]) {
  return renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(SurpassingChanceSection, { chances: derive(...stats).surpassingChances })));
}

it.each([
  [99, '99% chance per map'], [100, '1 guaranteed per map'],
  [101, '1 guaranteed per map · 1% chance of one more'],
  [135, '1 guaranteed per map · 35% chance of one more'],
  [199, '1 guaranteed per map · 99% chance of one more'], [200, '2 guaranteed per map'],
  [235, '2 guaranteed per map · 35% chance of one more'],
] as const)('explains a %i percent tree contribution', (n, message) => {
  const html = render(box(n));
  expect(html).toContain(message);
  if (n % 100 === 0) expect(html).not.toContain('chance of one more');
});

it('hides absent, zero, ordinary-chance and historical preview stats', () => {
  const old = 'Remnants in your Maps have 35% chance to have an additional Suffix Modifier';
  const patch = buildAtlasStatsSyncPatch([{ title: 'Expedition', stats: [old] }],
    'https://pathofpathing.com/?v=3.30.0-atlas#AAAABgAAAwIAYfNxdXF1AAA=', 'Covens');
  expect(patch.atlasStatsRead?.calc.surpassingChances).toBeUndefined();
  for (const stats of [[], [box(0)], [old], ['Your Maps have +50% chance to contain a Strongbox']]) {
    expect(render(...stats)).not.toContain('aria-label="Surpassing Chance"');
  }
});

it('preserves existing Calc results and counts the selected effects already in the total once', () => {
  const existing = '12% increased effect of Explicit Modifiers on your Maps';
  const read = (stats: string[]) => buildAtlasStatsSyncPatch([{ title: 'Maps', stats }], url, 'Covens',
    undefined, [12887, 61698], url, { '12887': '20818', '61698': '60065' });
  const before = read([existing]);
  const after = read([existing, box(135), 'Your Maps have +50% Surpassing Chance to contain a Shrine']);
  expect(after.atlasStatsRead?.calc).toEqual({ ...before.atlasStatsRead?.calc,
    surpassingChances: { strongbox: 135, shrine: 50 } });
  const settings = { ...DEFAULT_SETTINGS, atlasTreeUrl: url, leagueName: 'Covens' };
  expect(computeMultiplier({ ...settings, ...after })).toEqual(computeMultiplier({ ...settings, ...before }));
});

it('maps all ten outcomes to their units and leaves lane rarity in game wording', () => {
  const perMap = ['contain a Strongbox', 'contain a Rogue Exile', 'be haunted by a Tormented Spirit',
    'contain an Imprisoned Monster', 'contain a Shrine', 'contain Sacred Flora']
    .map(effect => `Your Maps have +50% Surpassing Chance to ${effect}`);
  const others = [
    `[ContainsAbyss|Abysses] in your Maps have 120% ${keyword} to contain an additional Pit`,
    `Blight Lanes in your Maps have +15% ${keyword} to have\nan additional reward per Lane in Blight encounter`,
    `+35% ${keyword} for Remnants in your Maps to have an additional Suffix Modifier`,
    `+130% ${keyword} that a lane of Blight encounters in your Maps is at least Magic`,
  ];
  expect(derive(...perMap, ...others).surpassingChances).toEqual({ strongbox: 50, exile: 50, spirit: 50,
    essence: 50, shrine: 50, flora: 50, pit: 120, reward: 15, suffix: 35, magicLane: 130 });
  const html = render(...others);
  for (const detail of ['1 guaranteed per Abyss · 20% chance of one more', '15% chance per Blight lane',
    '35% chance per Remnant', 'at least Magic']) expect(html).toContain(detail);
  expect(render(others[3])).not.toContain('guaranteed');
});
