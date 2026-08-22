import { afterEach, describe, expect, it, vi } from 'vitest';

const lines = (count: number, divinePrice = 0): { id: string; primaryValue: number }[] => {
  const result = Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, primaryValue: 1 }));
  if (divinePrice > 0) result[0] = { id: 'divine', primaryValue: divinePrice };
  return result;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('rollover cache expiry and mutation guard integration', () => {
  it('expiry detects the next league while preserving prior-league live provenance and price', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-16T12:00:00Z') });
    const probe = vi.fn(async (league: string) => ({
      lines: league === 'Allflame'
        ? []
        : league === 'Ancestors'
          ? lines(8, 180)
          : lines(8, 310),
      error: null,
    }));
    vi.stubGlobal('window', {
      api: { fetchCurrencyOverview: probe },
      addEventListener: vi.fn(),
    });

    const league = await import('../utils/league');
    expect(await league.getActiveContext()).toEqual({ leagueName: 'Ancestors', source: 'detected' });

    const { useSessionStore, DEFAULT_SETTINGS } = await import('./useSessionStore');
    useSessionStore.setState({
      settings: { ...DEFAULT_SETTINGS, divinePrice: 180, leagueName: 'Ancestors' },
      divinePriceFetchedAt: 0,
      activeSessionId: null,
      activeSessionName: null,
      savedSessions: {},
      isWatching: true,
      sessionLifecycle: 'live',
    });

    vi.setSystemTime(new Date('2026-07-17T00:01:00Z'));
    await useSessionStore.getState().initDivinePrice({ force: true });

    expect(league.confirmedLeagueSync()).toBe('Mirage');
    expect(useSessionStore.getState().settings.divinePrice).toBe(180);
    expect(useSessionStore.getState().settings.leagueName).toBe('Ancestors');
    expect(useSessionStore.getState().divinePriceFetchedAt).toBe(0);
    expect(useSessionStore.getState().isWatching).toBe(false);
    expect(useSessionStore.getState().sessionLifecycle).toBe('historical');
    expect(probe).toHaveBeenCalledWith('Mirage');
  });

  it('expiry followed by an all-ended fallback leaves a fresh session pending', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-20T21:00:00Z') });
    const probe = vi.fn(async (league: string) => ({
      // One line lets the price lookup succeed but is insufficient to confirm
      // a league during detection (>5 is required).
      lines: league === 'Allflame'
        ? lines(1, 320)
        : league === 'Mirage' && Date.now() < Date.parse('2026-07-20T22:00:00Z')
        ? lines(8, 250)
        : lines(1, 320),
      error: null,
    }));
    vi.stubGlobal('window', {
      api: { fetchCurrencyOverview: probe },
      addEventListener: vi.fn(),
    });

    const league = await import('../utils/league');
    expect(await league.getActiveContext()).toEqual({ leagueName: 'Mirage', source: 'detected' });

    const { useSessionStore, DEFAULT_SETTINGS } = await import('./useSessionStore');
    useSessionStore.setState({
      settings: { ...DEFAULT_SETTINGS, divinePrice: 0, leagueName: '' },
      divinePriceFetchedAt: 0,
      activeSessionId: null,
      activeSessionName: null,
      savedSessions: {},
    });

    vi.setSystemTime(new Date('2026-07-20T22:01:00Z'));
    await useSessionStore.getState().initDivinePrice({ force: true });

    expect(league.confirmedLeagueSync()).toBeNull();
    expect(useSessionStore.getState().settings.divinePrice).toBe(0);
    expect(useSessionStore.getState().settings.leagueName).toBe('');
    expect(useSessionStore.getState().divinePriceFetchedAt).toBe(0);
  });
});
