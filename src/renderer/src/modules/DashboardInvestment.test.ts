import { MantineProvider } from '@mantine/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSessionStore } from '../store/useSessionStore';
import type { LootItem } from '../types';
import { decodeSessionPayload, encodeSessionPayload } from '../repository/sessionPayloadCodec';
import { buildCompareColumn } from '../utils/sessionCompare';
import { buildDiscordExport } from '../utils/discordExport';
import { parseMapClipboard } from '../utils/mapParser';
import { computeProfit } from '../utils/profit';
import { DashboardModule } from './DashboardModule';

// Server rendering normally uses Zustand's initial snapshot. Read the seeded
// in-memory session while rendering the same correction control as the app.
vi.mock('../store/useSessionStore', async (load) => {
  const store = await load<typeof import('../store/useSessionStore')>();
  return { ...store, useSessionKeys: () => store.useSessionStore.getState() };
});

const thread = 'Expedition Thread';
const ember = 'Allflame Ember of Flesh';
function item(name: string, quantity: number, price: number): LootItem {
  return { id: name, name, tab: 'Test', quantity: String(quantity), price: String(price),
    total: quantity * price, excluded: false };
}

function seed(baselineItems: LootItem[], lootItems: LootItem[]) {
  useSessionStore.setState({
    maps: [{ ...parseMapClipboard('Item Class: Maps\nMap Tier: 16')!, id: 'map-1' }],
    settings: { ...DEFAULT_SETTINGS, leagueName: 'Covens', divinePrice: 200,
      threadSlots: [{ name: thread, count: 4, price: 2 }], ember: { name: ember, price: 2 } },
    lootItems, baselineItems, baselineTotal: baselineItems.reduce((sum, row) => sum + row.total, 0),
  });
}

function offeredChaos(): number | null {
  const markup = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DashboardModule)));
  const match = markup.match(/Correct double-count \(\+([\d.]+)c\)/);
  return match ? Number(match[1]) : null;
}

function net() {
  const state = useSessionStore.getState();
  return computeProfit({ ...state, mapCount: state.maps.length }).net;
}

afterEach(() => useSessionStore.setState(useSessionStore.getInitialState(), true));

it('offers the paid Thread and Ember loss once and keeps the correction opt-in', () => {
  const rest = item('Chaos Orb', 90, 1);
  seed([rest, item(thread, 4, 2), item(ember, 1, 2)], [rest]);
  expect(net()).toBe(-20);
  const amount = offeredChaos();
  expect(amount).toBe(10);
  useSessionStore.getState().setInvestmentNeutralization(amount!);
  expect(net()).toBe(-10);
  expect(offeredChaos()).toBeNull();
  const saved = encodeSessionPayload(useSessionStore.getState());
  const reopened = decodeSessionPayload(saved, DEFAULT_SETTINGS);
  useSessionStore.setState(reopened);
  expect(offeredChaos()).toBeNull();
  expect(buildCompareColumn({ ...reopened, id: 'run', name: 'Run', createdAt: '2026-11-24' }))
    .toMatchObject({ neutralization: 10, totalInvest: 10, net: -10 });
  expect(buildDiscordExport(reopened)).toContain('**Net Profit:** -10.0c');
  useSessionStore.getState().setInvestmentNeutralization(0);
  expect(net()).toBe(-20);
  expect(offeredChaos()).toBe(10);
  useSessionStore.getState().setInvestmentDismissed(true);
  expect(offeredChaos()).toBeNull();
  expect(net()).toBe(-20);
});

it('offers nothing when paid supplies were outside the monitored baseline', () => {
  const rest = item('Chaos Orb', 100, 1);
  seed([rest], [rest]);
  expect(offeredChaos()).toBeNull();
  expect(net()).toBe(-10);
});

it('offers one opt-in correction across session orb types and retains it when reopened', () => {
  const rest = item('Chaos Orb', 100, 1);
  seed([rest, item("Armoursmith's Delirium Orb", 23, 4), item('Threaded Delirium Orb', 5, 2)], [rest]);
  useSessionStore.setState({ settings: { ...DEFAULT_SETTINGS, leagueName: 'Covens', divinePrice: 200,
    deliriumOrbSpend: [{ type: 'Armoursmith', count: 23, priceEach: 4 }, { type: 'Threaded', count: 5, priceEach: 2 }] } });
  expect(net()).toBe(-204);
  expect(offeredChaos()).toBe(102);
  useSessionStore.getState().setInvestmentNeutralization(102);
  const reopened = decodeSessionPayload(encodeSessionPayload(useSessionStore.getState()), DEFAULT_SETTINGS);
  useSessionStore.setState(reopened);
  expect(net()).toBe(-102);
  expect(offeredChaos()).toBeNull();
  expect(buildCompareColumn({ ...reopened, id: 'run', name: 'Run', createdAt: '2026-11-25' }))
    .toMatchObject({ totalInvest: 102, neutralization: 102, net: -102 });
  useSessionStore.getState().setInvestmentNeutralization(0);
  expect(offeredChaos()).toBe(102);
});

it('matches partial consumption across tabs and leaves unrelated losses in net profit', () => {
  const rest = item('Chaos Orb', 90, 1);
  seed([rest, item(thread, 3, 2), { ...item(thread, 2, 2), tab: 'Second' }],
    [item('Chaos Orb', 89, 1), item(thread, 3, 2)]);
  expect(offeredChaos()).toBe(4);
  useSessionStore.getState().setInvestmentNeutralization(4);
  expect(net()).toBe(-11);
});

it('caps the offer at the configured quantity and leaves repricing out of the correction', () => {
  const rest = item('Chaos Orb', 90, 1);
  seed([rest, item(thread, 12, 2)], [rest, item(thread, 5, 1)]);
  expect(offeredChaos()).toBe(8);
  seed([rest, item(thread, 4, 2)], [rest, item(thread, 4, 1)]);
  expect(offeredChaos()).toBeNull();
});

it('counts only eligible paid slots with Unwavering Vision and preserves legacy matches', () => {
  const rest = item('Chaos Orb', 90, 1);
  seed([rest, item(thread, 8, 2), item('Breach Thread', 2, 3), item(ember, 1, 2)], [rest]);
  const { settings } = useSessionStore.getState();
  const atlasStatsRead = {
    schemaVersion: 1 as const, readAt: '2026-11-24', sourceUrl: settings.atlasTreeUrl,
    leagueName: 'Covens', calc: { smallNodesAllocated: 0, mountingModifiers: false,
      multiplyingModifiersAllocated: false,
      threadRules: { effectPerType: 0, saveChance: 0, oneType: true, freeThreads: 2 } },
  };
  useSessionStore.setState({ settings: { ...settings, atlasStatsRead, ember: undefined,
    threadSlots: [...settings.threadSlots!, { name: 'Breach Thread', count: 2, price: 3 }] } });
  expect(offeredChaos()).toBe(8);
  useSessionStore.setState({ settings: { ...DEFAULT_SETTINGS, leagueName: 'Allflame',
    scarabs: [{ name: 'Bestiary Scarab', cost: 5 }] },
    baselineItems: [rest, item('Bestiary Scarab', 1, 5)], baselineTotal: 95 });
  expect(offeredChaos()).toBe(5);
});
