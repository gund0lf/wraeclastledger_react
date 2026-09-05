import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const league = vi.hoisted(() => ({
  getCurrentLeague: vi.fn<() => Promise<string>>(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const quote = (value: unknown) => ({ lines: [{ id: 'divine', primaryValue: value }] });
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

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

  it.each([false, true])('keeps two leagues independent with reverse completion=%s', async (reverse) => {
    const a = deferred<ReturnType<typeof quote>>();
    const b = deferred<ReturnType<typeof quote>>();
    fetchCurrencyOverview.mockImplementation((name: string) => name === 'Allflame' ? a.promise : b.promise);
    const first = priceUtils.tryFetchDivinePrice();
    await flush();
    league.getCurrentLeague.mockResolvedValue('Mirage');
    const second = priceUtils.tryFetchDivinePrice();
    await flush();
    if (reverse) { b.resolve(quote(251)); await second; a.resolve(quote(346)); }
    else { a.resolve(quote(346)); await first; b.resolve(quote(251)); }
    expect(await first).toBe(346);
    expect(await second).toBe(251);
    expect(await priceUtils.tryFetchDivinePrice()).toBe(251);
    league.getCurrentLeague.mockResolvedValue('Allflame');
    expect(await priceUtils.tryFetchDivinePrice()).toBe(346);
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(2);
  });

  it.each([
    [false, false, false], [false, false, true], [false, true, false], [false, true, true],
    [true, false, false], [true, false, true], [true, true, false], [true, true, true],
  ])('force ownership: reverse=%s oldFailure=%s newFailure=%s', async (reverse, oldFailure, newFailure) => {
    const old = deferred<ReturnType<typeof quote>>();
    const latest = deferred<ReturnType<typeof quote>>();
    fetchCurrencyOverview.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const first = priceUtils.fetchDivinePrice();
    await flush();
    const second = priceUtils.tryFetchDivinePrice(true);
    await flush();
    const joined = priceUtils.tryFetchDivinePrice();
    await flush();
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(2);
    const settleOld = () => oldFailure ? old.reject(new Error('older failure')) : old.resolve(quote(400));
    const settleNew = () => newFailure ? latest.reject(new Error('latest failure')) : latest.resolve(quote(500));
    if (reverse) { settleNew(); await second; settleOld(); }
    else { settleOld(); await first; settleNew(); }
    expect(await first).toBeNull();
    expect(await second).toBe(newFailure ? null : 500);
    expect(await joined).toBe(newFailure ? null : 500);
    expect(await priceUtils.tryFetchDivinePrice()).toBe(newFailure ? null : 500);
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(2);
  });

  it('joins pending work even when its original cooldown expires', async () => {
    const pending = deferred<ReturnType<typeof quote>>();
    fetchCurrencyOverview.mockReturnValueOnce(pending.promise);
    const first = priceUtils.tryFetchDivinePrice();
    await flush();
    vi.advanceTimersByTime(60_001);
    const joined = priceUtils.tryFetchDivinePrice();
    await flush();
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(1);
    pending.resolve(quote(450));
    expect(await first).toBe(450);
    expect(await joined).toBe(450);
  });

  it.each([false, true])('expires the cooldown for a failed result=%s', async (failure) => {
    fetchCurrencyOverview.mockResolvedValueOnce(quote(failure ? 0 : 400)).mockResolvedValueOnce(quote(500));
    expect(await priceUtils.tryFetchDivinePrice()).toBe(failure ? null : 400);
    vi.advanceTimersByTime(59_999);
    expect(await priceUtils.tryFetchDivinePrice()).toBe(failure ? null : 400);
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await priceUtils.tryFetchDivinePrice()).toBe(500);
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, Infinity, NaN, 'invalid', undefined])('rejects invalid quotes: %s', async (value) => {
    fetchCurrencyOverview.mockResolvedValue(quote(value));
    expect(await priceUtils.tryFetchDivinePrice()).toBeNull();
    expect(await priceUtils.tryFetchDivinePrice()).toBeNull();
    expect(fetchCurrencyOverview).toHaveBeenCalledTimes(1);
  });

  it('revokes an already-resolved request when a newer force refresh begins', async () => {
    const first = priceUtils.requestDivinePrice('Allflame');
    expect(await first.result).toBe(346);
    expect(first.isCurrent()).toBe(true);
    const second = priceUtils.requestDivinePrice('Allflame', true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    await second.result;
  });
});
