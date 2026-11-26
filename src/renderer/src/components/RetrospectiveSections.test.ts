import { MantineProvider } from '@mantine/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PersonalRetrospectives } from './PersonalRetrospectives';
import { PublicRetrospectives } from './PublicRetrospectives';

const boards = [
  { league_key: 'older', league_name: 'Older league', cutoff_utc: '2025-01-01', strategy_count: 1 },
  { league_key: 'newer', league_name: 'Newer league', cutoff_utc: '2026-01-01', strategy_count: 2 },
];
vi.mock('react', async (load) => {
  const react = await load<typeof import('react')>();
  return { ...react, useSyncExternalStore: (subscribe: never, get: never, server?: never) =>
    react.useSyncExternalStore(subscribe, get, server ?? get) };
});
vi.mock('../utils/strategyBrowserRequests', () => ({
  FrozenBrowserRequests: class {
    subscribe = () => () => {};
    getSnapshot = () => ({ snapshots: boards, boards: {}, loading: false });
  },
}));
vi.mock('../store/useSessionStore', () => ({
  useSessionKeys: () => ({ repositorySessions: [], retrospectiveCloseouts: Object.fromEntries(
    boards.map(b => [b.league_name.toLowerCase(), { cutoffUtc: b.cutoff_utc, closedAt: b.cutoff_utc }]),
  ) }),
}));
vi.mock('../repository/useRepositorySessions', () => ({
  useRepositorySessions: () => ({ sessions: Object.fromEntries(boards.map(b => [b.league_key, {
    id: b.league_key, name: 'Saved run', createdAt: b.cutoff_utc, maps: [], settings: { leagueName: b.league_name },
  }])) }),
}));
vi.mock('./SessionCompareModal', () => ({ SessionCompareModal: () => null }));
vi.mock('./StrategyCard', () => ({ StrategyCard: () => null }));

it.each([
  ['public', () => createElement(PublicRetrospectives, { onLoadStrategy: () => {} })],
  ['personal', () => createElement(PersonalRetrospectives, { onLoadSession: () => {} })],
] as const)('opens only the newest %s league by cutoff and keeps the older heading available', (_, view) => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, view()));
  const sections = [...html.matchAll(/<details\b([^>]*)>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/g)];
  expect(sections.map(match => [match[2].includes('Newer league'), /\bopen\b/.test(match[1])]))
    .toEqual([[true, true], [false, false]]);
  expect(sections[1][2]).toContain('Older league');
});
