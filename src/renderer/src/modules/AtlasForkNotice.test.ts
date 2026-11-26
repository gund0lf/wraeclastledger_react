import { MantineProvider } from '@mantine/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSessionStore } from '../store/useSessionStore';
import { buildAtlasStatsSyncPatch } from '../utils/atlasStatsSync';
import { AtlasCalcModule } from './AtlasCalcModule';

vi.mock('../store/useSessionStore', async (load) => {
  const store = await load<typeof import('../store/useSessionStore')>();
  return { ...store, useSessionKeys: () => store.useSessionStore.getState() };
});

const url = 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAQzIQBJgJ';
const old = buildAtlasStatsSyncPatch([{ title: 'Map Modifiers',
  stats: ['10% increased effect of Explicit Modifiers on your Maps'] }], url, 'Allflame');
const settings = { ...DEFAULT_SETTINGS, leagueName: 'Covens', atlasTreeUrl: url, ...old };

function render() {
  return renderToStaticMarkup(createElement(MantineProvider, null, createElement(AtlasCalcModule)))
    .replaceAll('&#x27;', "'");
}

afterEach(() => useSessionStore.setState(useSessionStore.getInitialState(), true));

it('names the recorded source league and preserves every saved setting', () => {
  useSessionStore.setState({ settings });
  const before = structuredClone(settings);
  expect(render()).toContain('These Atlas bonuses were last synced for Allflame. Sync your Covens tree to update them.');
  expect(useSessionStore.getState().settings).toEqual(before);
});

it('explains unverified bonuses without guessing a source league', () => {
  useSessionStore.setState({ settings: { ...settings, atlasStatsRead: undefined } });
  expect(render()).toContain("These Atlas bonuses haven't been verified for Covens. Sync your tree to check them.");
});

it('omits the warning for fresh and verified sessions', () => {
  useSessionStore.setState({ settings: { ...DEFAULT_SETTINGS, leagueName: 'Covens' } });
  expect(render()).not.toContain('These Atlas bonuses');
  const covensUrl = url.replace('3.29', '3.30');
  useSessionStore.setState({ settings: { ...settings, atlasTreeUrl: covensUrl, ...buildAtlasStatsSyncPatch([], covensUrl, 'Covens') } });
  expect(render()).not.toContain('These Atlas bonuses');
});
