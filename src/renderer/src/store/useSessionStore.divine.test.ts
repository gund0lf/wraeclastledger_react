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

const fetchMock = vi.fn<[], Promise<number | null>>();

vi.mock('../utils/priceUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/priceUtils')>();
  return {
    ...actual,
    // The store calls tryFetchDivinePrice; the real one has its own 60s
    // cooldown which would interfere with these tests, so replace it.
    tryFetchDivinePrice: (..._args: unknown[]) => fetchMock(),
  };
});
vi.mock('../utils/league', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/league')>();
  return { ...actual, getCurrentLeague: async () => 'Ancestors' };
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
});
