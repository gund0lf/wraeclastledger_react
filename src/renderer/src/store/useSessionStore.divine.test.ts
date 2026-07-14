/**
 * useSessionStore.divine.test.ts — WP4.2: divine-price staleness refresh.
 *
 * initDivinePrice fetches when the price is unset (0) or the legacy default
 * (200), OR when the last successful fetch is older than 30 minutes, OR when
 * forced. A manual entry via setDivinePriceManual counts as fresh.
 *
 * Network is mocked at the priceUtils/league module boundary.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fetchMock = vi.fn<[boolean?], Promise<number | null>>();
const leagueState = vi.hoisted(() => ({ current: 'Ancestors' }));

vi.mock('../utils/priceUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/priceUtils')>();
  return {
    ...actual,
    // The store calls tryFetchDivinePrice; the real one has its own 60s
    // cooldown which would interfere with these tests, so replace it.
    tryFetchDivinePrice: (force?: boolean) => fetchMock(force),
  };
});
vi.mock('../utils/league', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/league')>();
  return { ...actual, getCurrentLeague: async () => leagueState.current };
});

import { useSessionStore, DEFAULT_SETTINGS } from './useSessionStore';

const THIRTY_MIN = 30 * 60_000;

const resetStore = (divinePrice: number, fetchedAt: number): void => {
  useSessionStore.setState({
    settings: { ...DEFAULT_SETTINGS, divinePrice },
    divinePriceFetchedAt: fetchedAt,
    activeSessionId: null, activeSessionName: null, savedSessions: {},
  });
};

describe('WP4.2 divine price staleness', () => {
  beforeEach(() => {
    leagueState.current = 'Ancestors';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(250);
  });

  it('fetches when the price is unset (0)', async () => {
    resetStore(0, Date.now());
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().settings.divinePrice).toBe(250);
    expect(useSessionStore.getState().divinePriceFetchedAt).toBeGreaterThan(0);
  });

  it('fetches when the price is the legacy default (200)', async () => {
    resetStore(200, Date.now());
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().settings.divinePrice).toBe(250);
  });

  it('skips when the price is set and fresh', async () => {
    resetStore(300, Date.now());
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().settings.divinePrice).toBe(300);
  });

  it('fetches when the last fetch is older than 30 minutes', async () => {
    resetStore(300, Date.now() - THIRTY_MIN - 1000);
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().settings.divinePrice).toBe(250);
  });

  it('force fetches even when set and fresh', async () => {
    resetStore(300, Date.now());
    await useSessionStore.getState().initDivinePrice({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().settings.divinePrice).toBe(250);
  });

  it('fresh price from a different league refetches and bypasses the cooldown', async () => {
    resetStore(300, Date.now());
    useSessionStore.setState((s) => ({ settings: { ...s.settings, leagueName: 'Ancestors' } }));
    leagueState.current = 'Curse of the Allflame';

    await useSessionStore.getState().initDivinePrice();

    expect(fetchMock).toHaveBeenCalledWith(true);
    expect(useSessionStore.getState().settings.divinePrice).toBe(250);
    expect(useSessionStore.getState().settings.leagueName).toBe('Curse of the Allflame');
  });

  it('setDivinePriceManual marks the price fresh — next init skips', async () => {
    resetStore(0, 0);
    useSessionStore.getState().setDivinePriceManual(275);
    expect(useSessionStore.getState().settings.divinePrice).toBe(275);
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().settings.divinePrice).toBe(275); // not overwritten
  });

  it('failed fetch does not advance the timestamp (stays stale, will retry)', async () => {
    fetchMock.mockResolvedValue(null);
    resetStore(0, 0);
    await useSessionStore.getState().initDivinePrice();
    expect(useSessionStore.getState().divinePriceFetchedAt).toBe(0);
    expect(useSessionStore.getState().settings.divinePrice).toBe(0);
    // leagueName still updated from detection even when the price fetch fails
    expect(useSessionStore.getState().settings.leagueName).toBe('Ancestors');
  });

  it('failed fetch never clears an already-set price (fetch-first safety)', async () => {
    fetchMock.mockResolvedValue(null);
    resetStore(300, Date.now() - THIRTY_MIN - 1000); // stale -> fetch attempted
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().settings.divinePrice).toBe(300); // preserved
  });
});

// ── Phase 1.5: historical-session protection (rollover plan, 2026-07-11) ────
// A LOADED saved session (activeSessionId set) is historical data: never
// auto-repriced (same league or not), never league-re-stamped by a fetch.
// Only the explicit confirmed reprice ({ repriceLoaded: true }) may touch
// its price — and even that leaves leagueName alone.
describe('historical-session protection', () => {
  const loadSessionState = (divinePrice: number, leagueName: string, fetchedAt: number): void => {
    useSessionStore.setState({
      settings: { ...DEFAULT_SETTINGS, divinePrice, leagueName },
      divinePriceFetchedAt: fetchedAt,
      activeSessionId: 'sess-1', activeSessionName: 'Old run', savedSessions: {},
    });
  };

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(250);
  });

  it('loaded session: stale auto-refresh does NOT fetch or mutate anything', async () => {
    loadSessionState(180, 'Mirage', Date.now() - THIRTY_MIN - 1000); // stale on purpose
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().settings.divinePrice).toBe(180);
    expect(useSessionStore.getState().settings.leagueName).toBe('Mirage');
  });

  it('loaded session: force alone (old manual-refresh path) is also blocked', async () => {
    loadSessionState(180, 'Mirage', 0);
    await useSessionStore.getState().initDivinePrice({ force: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().settings.divinePrice).toBe(180);
  });

  it('explicit reprice updates the price but NEVER the league (provenance)', async () => {
    loadSessionState(180, 'Mirage', 0);
    await useSessionStore.getState().initDivinePrice({ force: true, repriceLoaded: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().settings.divinePrice).toBe(250);
    expect(useSessionStore.getState().settings.leagueName).toBe('Mirage'); // untouched
  });

  it('explicit reprice with a failed fetch preserves the old price', async () => {
    fetchMock.mockResolvedValue(null);
    loadSessionState(180, 'Mirage', 0);
    await useSessionStore.getState().initDivinePrice({ force: true, repriceLoaded: true });
    expect(useSessionStore.getState().settings.divinePrice).toBe(180);
    expect(useSessionStore.getState().settings.leagueName).toBe('Mirage');
  });

  it('a live (unsaved) session still auto-refreshes and stamps the league', async () => {
    useSessionStore.setState({
      settings: { ...DEFAULT_SETTINGS, divinePrice: 0, leagueName: '' },
      divinePriceFetchedAt: 0,
      activeSessionId: null, activeSessionName: null, savedSessions: {},
    });
    await useSessionStore.getState().initDivinePrice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().settings.divinePrice).toBe(250);
    expect(useSessionStore.getState().settings.leagueName).toBe('Ancestors');
  });
});
