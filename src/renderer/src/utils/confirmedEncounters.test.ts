import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { RunStatisticsModule } from '../modules/RunStatisticsModule';
import { DEFAULT_SETTINGS, useSessionStore } from '../store/useSessionStore';
import { decodeSessionPayload, encodeSessionPayload } from '../repository/sessionPayloadCodec';
import { parseMapClipboard } from './mapParser';
import { aggregateRunStatisticsSessions, collectRunStatisticsSessions } from './runStatistics';
import { deriveShareTags } from './shareTags';

const state = () => useSessionStore.getState();
vi.mock('../store/useSessionStore', async (load) => {
  const store = await load<typeof import('../store/useSessionStore')>();
  return { ...store, useSessionKeys: () => store.useSessionStore.getState() };
});
afterEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  vi.useRealTimers();
});
const suffix = (line: string) => '{ Rare-only Suffix Modifier "Encounter" }\n' + line + ' — Unscalable Value';
const ordinary = '{ Prefix Modifier "Fecund" }\n40% more Monster Life';
const map = (body: string) => parseMapClipboard(
  ['Item Class: Maps', 'Rarity: Rare', 'Fixture', 'Map (Tier 16)', '--------',
    'Atlas Drops: +45% (augmented)', '--------', body, '--------',
    'Travel to a Map of this tier or lower by using this in a personal Map Device.'].join('\n'),
)!;

it('retains confirmed families and share tags when a save strips the clipboard', () => {
  state().updateSetting('leagueName', 'Covens');
  for (const body of [suffix('Area contains a Mirage'), suffix('Area contains an Evocator of Ghorr'),
    suffix('Area contains a buried Apex Sentinel'), '{ Enchantment Modifier }\nArea contains a Mirage\n' + ordinary]) {
    state().addMap(map(body));
  }
  const expected = [['mirage'], ['beyond'], ['sentinel'], []];
  const tags = () => state().maps.map(m => deriveShareTags(state().settings, [m]).filter(t => t !== 'regular'));
  expect(tags()).toEqual(expected);
  state().saveAsNewSession('Captured');
  const saved = state().activeSessionId!;
  state().newSession();
  state().loadSession(saved);
  expect(state().maps.every(m => m.rawText === undefined)).toBe(true);
  expect(tags()).toEqual(expected);
  expect(state().maps.map(m => m.confirmedEncounters)).toEqual(expected);
});

it('recovers available raw captures and preserves unknown and known zero across repository decoding', () => {
  const raw = map(suffix('Area contains the Viridian Wildwood'));
  delete raw.confirmedEncounters;
  const stripped = { ...raw, rawText: undefined };
  for (const example of [raw, stripped, map(ordinary), map('Area contains a Mirage'),
    map('Unidentified'), map(suffix('Area contains a Mirror of Delirium'))]) state().addMap(example);
  const decoded = decodeSessionPayload(encodeSessionPayload(state()), DEFAULT_SETTINGS);
  expect(decoded.maps.map(m => m.confirmedEncounters)).toEqual([
    ['wildwood'], undefined, [], undefined, undefined, ['delirium'],
  ]);
});

it('pools readable maps once per family without adding Atlas chances or manual sightings', () => {
  const grouped = map([suffix('Area contains a buried Apex Sentinel'), suffix('Area contains a buried Stalker Sentinel'),
    suffix("Area contains an Evocator of K'Tash")].join('\n'));
  state().addMap(grouped);
  vi.useFakeTimers();
  state().saveAsNewSession('First');
  state().newSession();
  vi.advanceTimersByTime(1000);
  state().addMap(map(ordinary));
  state().addMap(map('Unidentified'));
  state().saveAsNewSession('Second');
  state().setManualStatistic('wildwoodEncounters', 5);
  state().updateSetting('atlasDetectedTags', ['wildwood']);
  state().addMap(map(suffix('Area contains a Mirage')));
  const current = state();
  const sessions = collectRunStatisticsSessions({ ...current, mapCount: current.maps.length },
    current.activeSessionId, current.savedSessions);
  const result = aggregateRunStatisticsSessions(sessions);
  expect(result.mapCount).toBe(4);
  expect(result.confirmedEncounters).toEqual({
    readable: 3, counts: { sentinel: 1, beyond: 1, mirage: 1, wildwood: 0, delirium: 0 },
  });
});

it('shows seven confirmed Mirage maps out of forty readable maps and ten unknowns', () => {
  const captured = Array.from({ length: 50 }, (_, i) => ({
    ...map(i < 7 ? suffix('Area contains a Mirage') : i < 40 ? ordinary : 'Unidentified'),
    id: String(i),
  }));
  useSessionStore.setState({ maps: captured });
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(RunStatisticsModule)));
  const text = html.replace(/<[^>]+>/g, '');
  expect(text).toContain('40 readable · 10 unknown');
  expect(text).toContain('Mirage7 / 40 maps');
});
