import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const league = vi.hoisted(() => ({
  getCurrentLeague: vi.fn<() => Promise<string>>(),
}));

vi.mock('./league', () => ({ getCurrentLeague: league.getCurrentLeague }));

describe('Divine price fetch cooldown', () => {
  let fetchCurrencyOverview: ReturnType<typeof vi.fn>;
  let priceUtils: typeof import('./priceUtils');

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date('2026-09-01T10:00:00Z') });
    vi.resetModules();
    league.getCurrentLeague.mockReset().mockResolvedValue('Allflame');
    fetchCurrencyOverview = vi.fn().mockResolvedValue({
      lines: [{ id: 'divine', primaryValue: 346 }],
    });
    vi.stubGlobal('window', { api: { fetchCurrencyOverview } });
    priceUtils = await import('./priceUtils');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reuses a recent successful quote when a fresh session initializes', async () => {
    expect(await priceUtils.fetchDivinePrice()).toBe(346);
    expect(await priceUtils.tryFetchDivinePrice()).toBe(346);
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect an older quote after the latest attempt failed', async () => {
    expect(await priceUtils.fetchDivinePrice()).toBe(346);
    fetchCurrencyOverview.mockResolvedValueOnce({ lines: [] });

    expect(await priceUtils.tryFetchDivinePrice(true)).toBeNull();
    expect(await priceUtils.tryFetchDivinePrice()).toBeNull();
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a quote across league contexts', async () => {
    expect(await priceUtils.fetchDivinePrice()).toBe(346);
    league.getCurrentLeague.mockResolvedValue('Mirage');
    fetchCurrencyOverview.mockResolvedValueOnce({
      lines: [{ id: 'divine', primaryValue: 251 }],
    });

    expect(await priceUtils.tryFetchDivinePrice()).toBe(251);
    expect(fetchCurrencyOverview).toHaveBeenNthCalledWith(2, 'Mirage');
  });
});
