import { MantineProvider } from '@mantine/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSessionStore } from '../store/useSessionStore';
import { parseMapClipboard } from '../utils/mapParser';
import { bestIndices, buildCompareColumn } from '../utils/sessionCompare';
import { DashboardModule } from './DashboardModule';

vi.mock('../store/useSessionStore', async (load) => {
  const store = await load<typeof import('../store/useSessionStore')>();
  return { ...store, useSessionKeys: () => store.useSessionStore.getState() };
});

const base = { ...parseMapClipboard('Item Class: Maps\nMap Tier: 16')!, id: 'map' };
const historical = { ...base, quantity: 100 };
const modern = { ...base, atlasDrops: 81, moreThreads: 35 };
const session = { id: 'run', name: 'Run', createdAt: '', settings: { ...DEFAULT_SETTINGS, leagueName: 'Covens' },
  lootItems: [], baselineItems: [], baselineTotal: 0 };
afterEach(() => useSessionStore.setState(useSessionStore.getInitialState(), true));

it('compares each observed stat using only maps that recorded it', () => {
  const mixed = buildCompareColumn({ ...session, maps: [historical, modern, base] });
  expect(mixed).toMatchObject({ avgQuant: 100, avgAtlasDrops: 81, avgMoreThreads: 35 });
  const zero = buildCompareColumn({ ...session, maps: [{ ...base, atlasDrops: 0 }] });
  expect(zero).toMatchObject({ avgQuant: null, avgAtlasDrops: 0, avgMoreThreads: null });
  expect([...bestIndices([zero, mixed], col => col.avgAtlasDrops)]).toEqual([1]);
});

it('shows historical Quantity alongside observed Atlas Drops and More Threads on the Dashboard', () => {
  useSessionStore.setState({ settings: session.settings, maps: [historical, modern, base] });
  const text = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DashboardModule)))
    .replace(/<[^>]+>/g, '');
  expect(text).toContain('Quantity100.0%');
  expect(text).toContain('Atlas Drops (observed)81.0%');
  expect(text).toContain('More Threads (observed)35.0%');
});
