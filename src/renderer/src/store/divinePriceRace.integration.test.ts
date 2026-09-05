import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const quote = (value: number) => ({ lines: [{ id: 'divine', primaryValue: value }] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe('Divine quote ownership through the real store and cache', () => {
  let store: typeof import('./useSessionStore').useSessionStore;
  let league: typeof import('../utils/league');
  let prices: typeof import('../utils/priceUtils');
  let fetch: ReturnType<typeof vi.fn<(league: string) => Promise<ReturnType<typeof quote>>>>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ now: new Date('2026-09-01T10:00:00Z') });
    fetch = vi.fn().mockResolvedValue(quote(400));
    vi.stubGlobal('window', { api: { fetchCurrencyOverview: fetch }, addEventListener: vi.fn() });
    const module = await import('./useSessionStore');
    store = module.useSessionStore;
    league = await import('../utils/league');
    prices = await import('../utils/priceUtils');
    store.setState({
      settings: { ...module.DEFAULT_SETTINGS, divinePrice: 0, leagueName: '' },
      sessionLifecycle: 'live', sessionNonce: 1, activeSessionId: null,
      leagueOverride: 'Allflame', divinePriceFetchedAt: 0,
      pendingAtlasBonusSeed: true, pendingAtlasBonusValue: null,
      atlasBonusByLeague: { Allflame: true, Mirage: false },
    });
    league.setLeagueOverrideValue('Allflame');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shares a pending automatic seed and resolves it into one complete snapshot', async () => {
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValue(pending.promise);
    const original = store.getState();
    let completed = 0;
    const first = store.getState().initDivinePrice().then(() => { completed += 1; });
    const second = store.getState().initDivinePrice().then(() => { completed += 1; });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(completed).toBe(0);
    expect(store.getState()).toEqual(original);
    pending.resolve(quote(420));
    await Promise.all([first, second]);
    expect(store.getState().settings).toMatchObject({ divinePrice: 420, leagueName: 'Allflame', atlasBonus: true });
    expect(store.getState().pendingAtlasBonusSeed).toBe(false);
  });

  it('resolves the league once for both lookup and snapshot application', async () => {
    const resolveLeague = vi.spyOn(league, 'getCurrentLeague');
    await store.getState().initDivinePrice();
    expect(resolveLeague).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('Allflame');
    expect(store.getState().settings).toMatchObject({ divinePrice: 400, leagueName: 'Allflame' });
  });

  it.each([
    [false, false, false], [false, false, true], [false, true, false], [false, true, true],
    [true, false, false], [true, false, true], [true, true, false], [true, true, true],
  ])('applies only the latest force: reverse=%s oldFailure=%s newFailure=%s', async (reverse, oldFailure, newFailure) => {
    store.setState((s) => ({ settings: { ...s.settings, divinePrice: 300, leagueName: 'Allflame' }, pendingAtlasBonusSeed: false }));
    const original = store.getState();
    const old = deferred<ReturnType<typeof quote>>();
    const latest = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const first = store.getState().initDivinePrice({ force: true });
    await flush();
    const second = store.getState().initDivinePrice({ force: true });
    await flush();
    const settleOld = () => oldFailure ? old.reject(new Error('old failure')) : old.resolve(quote(400));
    const settleNew = () => newFailure ? latest.reject(new Error('new failure')) : latest.resolve(quote(500));
    if (reverse) {
      settleNew(); await second;
      const afterLatest = store.getState();
      settleOld(); await first;
      expect(store.getState()).toEqual(afterLatest);
    } else {
      settleOld(); await first;
      expect(store.getState()).toEqual(original);
      settleNew(); await second;
    }
    expect(store.getState().settings.divinePrice).toBe(newFailure ? 300 : 500);
    expect(store.getState().divinePriceFetchedAt).toBe(newFailure ? 0 : Date.now());
    expect(await prices.tryFetchDivinePrice()).toBe(newFailure ? null : 500);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not let a later automatic no-op cancel an explicit refresh', async () => {
    store.setState((s) => ({ settings: { ...s.settings, divinePrice: 300, leagueName: 'Allflame' } }));
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValue(pending.promise);
    const forced = store.getState().initDivinePrice({ force: true });
    await flush();
    await store.getState().initDivinePrice();
    pending.resolve(quote(450));
    await forced;
    expect(store.getState().settings.divinePrice).toBe(450);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['unnamed', 'named', 'historical'] as const)('rejects a late quote after %s target replacement', async (target) => {
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValue(pending.promise);
    const old = store.getState().initDivinePrice();
    await flush();
    store.setState({
      sessionNonce: target === 'unnamed' ? 2 : 1,
      activeSessionId: target === 'named' ? 'another-session' : null,
      sessionLifecycle: target === 'historical' ? 'historical' : 'live',
    });
    const replacement = store.getState();
    pending.resolve(quote(900));
    await old;
    expect(store.getState()).toEqual(replacement);
  });

  it('lets a fresh unnamed session join a valid pending quote without the old initializer owning it', async () => {
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValue(pending.promise);
    const old = store.getState().initDivinePrice();
    await flush();
    store.setState({ sessionNonce: 2 });
    const current = store.getState().initDivinePrice();
    await flush();
    pending.resolve(quote(410));
    await Promise.all([old, current]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.divinePrice).toBe(410);
    expect(store.getState().sessionNonce).toBe(2);
  });

  it.each([0, 550])('preserves a manual edit to %s while price transport is pending', async (manual) => {
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValue(pending.promise);
    const request = store.getState().initDivinePrice();
    await flush();
    store.getState().setDivinePriceManual(manual);
    const authored = store.getState();
    pending.resolve(quote(900));
    await request;
    expect(store.getState()).toEqual(authored);
  });

  it('rejects a manual edit during league resolution before starting price transport', async () => {
    const pending = deferred<string>();
    vi.spyOn(league, 'getCurrentLeague').mockReturnValueOnce(pending.promise);
    const request = store.getState().initDivinePrice();
    store.getState().setDivinePriceManual(550);
    const authored = store.getState();
    pending.resolve('Allflame');
    await request;
    expect(fetch).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(authored);
  });

  it('rejects unnamed-session replacement during league resolution before transport', async () => {
    const pending = deferred<string>();
    vi.spyOn(league, 'getCurrentLeague').mockReturnValueOnce(pending.promise);
    const old = store.getState().initDivinePrice();
    store.setState({ sessionNonce: 2 });
    const current = store.getState();
    pending.resolve('Allflame');
    await old;
    expect(fetch).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(current);
  });

  it('rejects older same-league resolution after a newer applicable refresh started', async () => {
    const resolving = deferred<string>();
    const fetching = deferred<ReturnType<typeof quote>>();
    vi.spyOn(league, 'getCurrentLeague').mockReturnValueOnce(resolving.promise);
    fetch.mockReturnValue(fetching.promise);
    const old = store.getState().initDivinePrice({ force: true });
    const latest = store.getState().initDivinePrice({ force: true });
    await flush();
    resolving.resolve('Allflame');
    await old;
    expect(fetch).toHaveBeenCalledTimes(1);
    fetching.resolve(quote(500));
    await latest;
    expect(store.getState().settings.divinePrice).toBe(500);
  });

  it('does not discard a slow explicit league resolution after an automatic no-op', async () => {
    store.setState((s) => ({ settings: { ...s.settings, divinePrice: 300, leagueName: 'Allflame' } }));
    const pending = deferred<string>();
    vi.spyOn(league, 'getCurrentLeague').mockReturnValueOnce(pending.promise);
    const forced = store.getState().initDivinePrice({ force: true });
    await store.getState().initDivinePrice();
    pending.resolve('Allflame');
    await forced;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.divinePrice).toBe(400);
  });

  it('rejects a changed confirmed context even without another store initializer', async () => {
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValue(pending.promise);
    const original = store.getState();
    const old = store.getState().initDivinePrice();
    await flush();
    league.setLeagueOverrideValue('Mirage');
    pending.resolve(quote(900));
    await old;
    expect(store.getState()).toEqual(original);
  });

  it.each([false, true])('pins the requested league across transport completion, reverse=%s', async (reverse) => {
    const a = deferred<ReturnType<typeof quote>>();
    const b = deferred<ReturnType<typeof quote>>();
    fetch.mockImplementation((name) => name === 'Allflame' ? a.promise : b.promise);
    const first = store.getState().initDivinePrice();
    await flush();
    store.getState().setLeagueOverride('Mirage');
    await flush();
    expect(fetch.mock.calls.map(([name]) => name)).toEqual(['Allflame', 'Mirage']);
    if (reverse) {
      b.resolve(quote(250)); await flush();
      const current = store.getState();
      a.resolve(quote(900)); await first;
      expect(store.getState()).toEqual(current);
    } else {
      const current = store.getState();
      a.resolve(quote(900)); await first;
      expect(store.getState()).toEqual(current);
      b.resolve(quote(250)); await flush();
    }
    expect(store.getState().settings).toMatchObject({ divinePrice: 250, leagueName: 'Mirage', atlasBonus: false });
    expect(store.getState().sessionLifecycle).toBe('live');
  });

  it('does not start an older price request when league resolution finishes after a newer override', async () => {
    const pending = deferred<string>();
    vi.spyOn(league, 'getCurrentLeague').mockReturnValueOnce(pending.promise);
    const old = store.getState().initDivinePrice();
    store.getState().setLeagueOverride('Mirage');
    await flush();
    const current = store.getState();
    pending.resolve('Allflame');
    await old;
    expect(fetch.mock.calls.map(([name]) => name)).toEqual(['Mirage']);
    expect(store.getState()).toEqual(current);
  });

  it('rejects an override away and back during explicit historical repricing', async () => {
    store.setState((s) => ({ sessionLifecycle: 'historical', settings: { ...s.settings, divinePrice: 180, leagueName: 'Old league' } }));
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValue(pending.promise);
    const request = store.getState().initDivinePrice({ force: true, repriceLoaded: true });
    await flush();
    store.getState().setLeagueOverride('Mirage');
    store.getState().setLeagueOverride('Allflame');
    const current = store.getState();
    pending.resolve(quote(900));
    await request;
    expect(store.getState()).toEqual(current);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects cache supersession even when no newer store initializer was started', async () => {
    const pending = deferred<ReturnType<typeof quote>>();
    fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(quote(500));
    const original = store.getState();
    const old = store.getState().initDivinePrice();
    await flush();
    await prices.requestDivinePrice('Allflame', true).result;
    pending.resolve(quote(900));
    await old;
    expect(store.getState()).toEqual(original);
  });
});
