import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LIVE_BROWSER, FrozenBrowserRequests, LiveBrowserRequests, frozenStrategyKey } from './strategyBrowserRequests';
import type { Strategy } from './strategyConstants';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve(); };
const row = (id = 'one', patch: Partial<Strategy> = {}): Strategy => ({
  id, discord_username: 'author', posted_at: '2026-09-01T00:00:00Z',
  current_revision: 1, evidence_generation: 1, score: 5, ...patch,
});
const page = (strategies = [row()], total = 45) => ({ strategies, total, offset: 0, limit: 20 });
const query = (league = 'Allflame', sort = 'score') => `https://example.invalid/strategies?limit=20&offset=0&sort=${sort}&league=${league}`;

// The transport and JSON boundaries can settle separately. No real network.
function transport() {
  const calls: { url: string; response: ReturnType<typeof deferred<Response>>; body: ReturnType<typeof deferred<unknown>> }[] = [];
  const fetcher = vi.fn<typeof fetch>((input) => {
    const call = { url: String(input), response: deferred<Response>(), body: deferred<unknown>() };
    calls.push(call);
    return call.response.promise;
  });
  const headers = (index: number, status = 200) => calls[index].response.resolve({
    ok: status === 200, status, json: () => calls[index].body.promise,
  } as Response);
  const reply = async (index: number, body: unknown) => {
    headers(index); calls[index].body.resolve(body); await flush();
  };
  const fail = async (index: number) => { calls[index].response.reject(new Error('offline')); await flush(); };
  return { fetcher, calls, headers, reply, fail };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('production live Browser request lifecycle', () => {
  it.each(['default', 'injected'])('calls %s fetch without a controller receiver for pages and detail', async (mode) => {
    const calls: string[] = [];
    // Chromium rejects fetch when an arbitrary object is its receiver. Node's
    // fetch and arrow-function test doubles do not enforce that Window contract.
    const fetcher: typeof fetch = async function (this: unknown, input) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      const url = String(input);
      calls.push(url);
      const body = url.endsWith('/one')
        ? row('one', { raw_export: 'full fixture detail' })
        : page([row(new URL(url).searchParams.get('offset') === '20' ? 'two' : 'one')]);
      return { ok: true, json: async () => body } as Response;
    };
    if (mode === 'default') vi.stubGlobal('fetch', fetcher);
    const browser = mode === 'default' ? new LiveBrowserRequests() : new LiveBrowserRequests(fetcher);
    try {
      browser.activate(query()); await flush();
      expect(browser.getSnapshot().listError).toBeNull();
      expect(browser.getSnapshot().strategies.map(s => s.id)).toEqual(['one']);
      await browser.loadMore();
      expect(browser.getSnapshot().strategies.map(s => s.id)).toEqual(['one', 'two']);
      browser.expand('one'); await flush();
      expect(browser.getSnapshot().detailError).toBeNull();
      expect(browser.getSnapshot().strategies[0].raw_export).toBe('full fixture detail');
      expect(calls).toHaveLength(3);
    } finally {
      browser.deactivate();
      if (mode === 'default') vi.unstubAllGlobals();
    }
  });

  it.each(['http', 'json'])('current %s failure is visible and a retry clears it', async (failure) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query());
    if (failure === 'http') net.headers(0, 503);
    else { net.headers(0); await flush(); net.calls[0].body.reject(new Error('Invalid JSON')); }
    await flush();
    expect(browser.getSnapshot().listError).toBe(failure === 'http' ? 'Server returned 503' : 'Invalid JSON');
    expect(browser.getSnapshot().loading).toBe(false);
    void browser.refresh(); expect(browser.getSnapshot().listError).toBeNull();
    await net.reply(1, page()); expect(browser.getSnapshot().strategies).toEqual([row()]);
  });

  it.each([false, true])('query changes isolate the complete state, older failure=%s', async (failure) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page());
    browser.expand('one'); // old detail also belongs to the old query
    void browser.refresh();
    browser.activate(query('Mirage', 'map_count'));
    expect(browser.getSnapshot()).toEqual({ ...EMPTY_LIVE_BROWSER, query: query('Mirage', 'map_count'), loading: true });
    const pending = browser.getSnapshot();
    if (failure) await net.fail(2); else await net.reply(2, page([row('old')], 999));
    await net.fail(1);
    expect(browser.getSnapshot()).toEqual(pending);
    await net.reply(3, page([row('new')], 1));
    expect(browser.getSnapshot()).toEqual({ ...EMPTY_LIVE_BROWSER, query: query('Mirage', 'map_count'), strategies: [row('new')], total: 1 });
    browser.deactivate();
  });

  it.each([false, true])('ignores old first-page completion after new success, old failure=%s', async (failure) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); browser.activate(query('Mirage'));
    await net.reply(1, page([row('new')], 1));
    const current = browser.getSnapshot();
    if (failure) await net.fail(0); else await net.reply(0, page([row('old')], 999));
    expect(browser.getSnapshot()).toEqual(current);
  });

  it.each([false, true])('same-query refresh owns success/failure and finally, reverse=%s', async (reverse) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page());
    void browser.refresh(); void browser.refresh();
    expect(browser.getSnapshot().strategies).toEqual([row()]);
    if (reverse) {
      await net.fail(2); const current = browser.getSnapshot();
      await net.reply(1, page([row('old')])); expect(browser.getSnapshot()).toEqual(current);
    } else {
      const pending = browser.getSnapshot(); await net.fail(1);
      expect(browser.getSnapshot()).toEqual(pending); await net.reply(2, page([row('new')]));
      expect(browser.getSnapshot().strategies).toEqual([row('new')]);
      expect(browser.getSnapshot().listError).toBeNull();
    }
    expect(browser.getSnapshot().loading).toBe(false);
  });

  it('guards JSON parsing after a response has already arrived', async () => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); net.headers(0); await flush();
    browser.activate(query('Mirage')); await net.reply(1, page([row('new')]));
    const current = browser.getSnapshot(); net.calls[0].body.resolve(page([row('old')])); await flush();
    expect(browser.getSnapshot()).toEqual(current);
  });

  it.each(['refresh', 'filter'])('revokes pending pagination on %s and blocks duplicate Load more', async (change) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page());
    void browser.loadMore(); void browser.loadMore();
    expect(net.calls).toHaveLength(2);
    expect(new URL(net.calls[1].url).searchParams.get('offset')).toBe('20');
    if (change === 'refresh') void browser.refresh(); else browser.activate(query('Mirage'));
    await net.reply(2, page([row('new')], 1)); const current = browser.getSnapshot();
    await net.reply(1, page([row('old-page')], 90)); expect(browser.getSnapshot()).toEqual(current);
    expect(browser.getSnapshot().offset).toBe(0);
  });

  it('appends a current page once, retains details and stops at the last page', async () => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page([row('one', { raw_export: 'full' })], 21));
    void browser.loadMore(); await net.reply(1, page([row(), row('two')], 21));
    expect(browser.getSnapshot().strategies).toEqual([row('one', { raw_export: 'full' }), row('two')]);
    expect(browser.getSnapshot().offset).toBe(20);
    await browser.loadMore(); expect(net.calls).toHaveLength(2);
  });

  it.each([false, true])('collapse/reopen of same ID owns detail/error/spinner, old failure=%s', async (failure) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page());
    browser.expand('one'); browser.expand(null); browser.expand('one');
    const pending = browser.getSnapshot();
    if (failure) await net.fail(1); else await net.reply(1, row('one', { raw_export: 'old' }));
    expect(browser.getSnapshot()).toEqual(pending);
    await net.reply(2, row('one', { raw_export: 'new', score: 2 }));
    expect(browser.getSnapshot().strategies).toEqual([row('one', { raw_export: 'new' })]);
    expect(browser.getSnapshot().detailLoadingId).toBeNull();
  });

  it('switching expanded rows rejects the old detail after the new one succeeds', async () => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page([row('one'), row('two')]));
    browser.expand('one'); browser.expand('two'); await net.reply(2, row('two', { raw_export: 'two' }));
    const current = browser.getSnapshot(); await net.fail(1); expect(browser.getSnapshot()).toEqual(current);
  });

  it.each([{ current_revision: 2 }, { evidence_generation: 2 }])('refresh invalidates old detail for version change %j', async (version) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page()); browser.expand('one');
    void browser.refresh(); await net.reply(2, page([row('one', version)]));
    expect(net.calls).toHaveLength(4);
    const pending = browser.getSnapshot(); await net.reply(1, row('one', { raw_export: 'old' }));
    expect(browser.getSnapshot()).toEqual(pending);
    await net.reply(3, row('one', { ...version, raw_export: 'new' }));
    expect(browser.getSnapshot().strategies[0].raw_export).toBe('new');
  });

  it('refresh reuses exact detail but reloads changed detail without holding list loading open', async () => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page()); browser.expand('one');
    await net.reply(1, row('one', { raw_export: 'full' }));
    void browser.refresh(); await net.reply(2, page([row('one', { score: 9 })]));
    expect(net.calls).toHaveLength(3); expect(browser.getSnapshot().strategies[0]).toEqual(row('one', { score: 9, raw_export: 'full' }));
    void browser.refresh(); await net.reply(3, page([row('one', { current_revision: 2 })]));
    expect(browser.getSnapshot().loading).toBe(false); expect(browser.getSnapshot().detailLoadingId).toBe('one');
    await net.fail(4); expect(browser.getSnapshot().detailError).toContain('offline');
    expect(browser.getSnapshot().strategies[0].raw_export).toBeUndefined();
  });

  it.each(['identity', 'revision'])('does not apply mismatched detail %s', async (mismatch) => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page()); browser.expand('one');
    await net.reply(1, mismatch === 'identity' ? row('other', { raw_export: 'bad' }) : row('one', { current_revision: 2, raw_export: 'bad' }));
    expect(browser.getSnapshot().strategies).toEqual([row()]);
    expect(browser.getSnapshot().detailError).toContain('changed');
    expect(browser.getSnapshot().detailLoadingId).toBeNull();
  });

  it('nested refresh-detail completion cannot overwrite a later refresh or its spinner', async () => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page([row('one', { raw_export: 'v1' })])); browser.expand('one');
    void browser.refresh(); await net.reply(1, page([row('one', { current_revision: 2 })]));
    void browser.refresh(); await net.reply(3, page([row('one', { current_revision: 3 })]));
    const pending = browser.getSnapshot(); await net.fail(2); expect(browser.getSnapshot()).toEqual(pending);
    await net.reply(4, row('one', { current_revision: 3, raw_export: 'v3' }));
    expect(browser.getSnapshot().strategies[0].raw_export).toBe('v3');
  });

  it('unmount/remount revokes old work, including the same query and strategy ID', async () => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await net.reply(0, page()); browser.expand('one'); void browser.refresh();
    browser.deactivate(); const inactive = browser.getSnapshot(); await net.fail(2);
    expect(browser.getSnapshot()).toEqual(inactive);
    browser.activate(query()); await net.reply(3, page()); browser.expand('one');
    const pending = browser.getSnapshot(); await net.reply(1, row('one', { raw_export: 'old' }));
    expect(browser.getSnapshot()).toEqual(pending);
  });

  it('background refresh runs only for an active idle first page and cleans up on remount', async () => {
    const net = transport(); const browser = new LiveBrowserRequests(net.fetcher);
    browser.activate(query()); await vi.advanceTimersByTimeAsync(300_000); expect(net.calls).toHaveLength(1);
    await net.reply(0, page()); await vi.advanceTimersByTimeAsync(300_000); expect(net.calls).toHaveLength(2);
    await net.reply(1, page()); void browser.loadMore(); await net.reply(2, page([row('two')]));
    await vi.advanceTimersByTimeAsync(600_000); expect(net.calls).toHaveLength(3);
    browser.deactivate(); await vi.advanceTimersByTimeAsync(600_000); expect(net.calls).toHaveLength(3);
    browser.activate(query()); await net.reply(3, page()); await vi.advanceTimersByTimeAsync(300_000);
    expect(net.calls).toHaveLength(5);
  });
});

const snapshot = (league = 'Allflame') => ({ league_key: league, league_name: league, cutoff_utc: '2026-09-01', frozen_at: '2026-09-02', strategy_count: 1 });
const board = (league = 'Allflame', sort = 'score') => ({ retrospective: snapshot(league), sort, ...page() });
const frozenDetail = (league = 'Allflame', id = 'one') => ({ retrospective: snapshot(league), strategy: row(id, { raw_export: 'frozen' }) });

describe('production frozen Browser request lifecycle', () => {
  it('ignores stale catalog JSON failure after the replacement snapshot succeeds', async () => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher);
    browser.activate(); net.headers(0); await flush(); void browser.refresh();
    await net.reply(1, { retrospectives: [] }); const current = browser.getSnapshot();
    net.calls[0].body.reject(new Error('old JSON failure')); await flush();
    expect(browser.getSnapshot()).toEqual(current);
  });

  it.each([false, true])('supersedes old catalog without issuing its boards, failure=%s', async (failure) => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher);
    browser.activate(); void browser.refresh(); const pending = browser.getSnapshot();
    if (failure) await net.fail(0); else await net.reply(0, { retrospectives: [snapshot()] });
    expect(browser.getSnapshot()).toEqual(pending); expect(net.calls).toHaveLength(2);
    await net.reply(1, { retrospectives: [] }); expect(browser.getSnapshot().loading).toBe(false);
    expect(browser.getSnapshot().listError).toBeNull();
  });

  it.each([false, true])('catalog/boards commit atomically and reject older boards, failure=%s', async (failure) => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher);
    browser.activate(); await net.reply(0, { retrospectives: [snapshot()] });
    expect(browser.getSnapshot().snapshots).toEqual([]);
    void browser.refresh(); await net.reply(3, { retrospectives: [snapshot('Mirage')] });
    await net.reply(4, board('Mirage')); expect(browser.getSnapshot().snapshots).toEqual([]);
    await net.reply(5, board('Mirage', 'div_per_map')); const current = browser.getSnapshot();
    expect(current.snapshots).toEqual([snapshot('Mirage')]); expect(Object.keys(current.boards)).toEqual(['Mirage']);
    if (failure) await net.fail(1); else await net.reply(1, board());
    await net.reply(2, board('Allflame', 'div_per_map')); expect(browser.getSnapshot()).toEqual(current);
  });

  it('failed refresh retains only the previous complete catalog/board pair', async () => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher);
    browser.activate(); await net.reply(0, { retrospectives: [snapshot()] });
    await net.reply(1, board()); await net.reply(2, board('Allflame', 'div_per_map'));
    const before = browser.getSnapshot(); void browser.refresh(); await net.reply(3, { retrospectives: [snapshot('Mirage')] });
    await net.fail(4); await net.reply(5, board('Mirage'));
    expect(browser.getSnapshot()).toEqual({ ...before, listError: 'offline' });
  });

  it.each([false, true])('new frozen Load owns callback/error/spinner across same IDs in different leagues, failure=%s', async (failure) => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher); const onLoad = vi.fn();
    browser.activate(); await net.reply(0, { retrospectives: [] });
    void browser.load('Allflame', 'one', onLoad); void browser.load('Mirage', 'one', onLoad);
    const pending = browser.getSnapshot(); expect(pending.loadingStrategyKey).toBe(frozenStrategyKey('Mirage', 'one'));
    if (failure) await net.fail(1); else await net.reply(1, frozenDetail());
    expect(browser.getSnapshot()).toEqual(pending); expect(onLoad).not.toHaveBeenCalled();
    await net.reply(2, frozenDetail('Mirage')); expect(onLoad).toHaveBeenCalledExactlyOnceWith(frozenDetail('Mirage').strategy);
    expect(browser.getSnapshot().loadingStrategyKey).toBeNull();
  });

  it('an older Load cannot apply after the latest Load fails', async () => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher); const onLoad = vi.fn();
    browser.activate(); await net.reply(0, { retrospectives: [] });
    void browser.load('Allflame', 'one', onLoad); void browser.load('Allflame', 'two', onLoad);
    await net.fail(2); const failed = browser.getSnapshot(); await net.reply(1, frozenDetail());
    expect(browser.getSnapshot()).toEqual(failed); expect(onLoad).not.toHaveBeenCalled();
  });

  it.each(['refresh', 'unmount', 'remount'])('%s revokes pending frozen Load even after response headers', async (change) => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher); const onLoad = vi.fn();
    browser.activate(); await net.reply(0, { retrospectives: [] }); void browser.load('Allflame', 'one', onLoad);
    net.headers(1); await flush();
    if (change === 'refresh') void browser.refresh();
    else { browser.deactivate(); if (change === 'remount') browser.activate(); }
    const current = browser.getSnapshot(); net.calls[1].body.resolve(frozenDetail()); await flush();
    expect(browser.getSnapshot()).toEqual(current); expect(onLoad).not.toHaveBeenCalled();
  });

  it('refresh completion revokes an action initiated against the retained old boards', async () => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher); const onLoad = vi.fn();
    browser.activate(); await net.reply(0, { retrospectives: [] }); void browser.refresh();
    void browser.load('Allflame', 'one', onLoad); await net.reply(1, { retrospectives: [] });
    const current = browser.getSnapshot(); await net.reply(2, frozenDetail());
    expect(browser.getSnapshot()).toEqual(current); expect(onLoad).not.toHaveBeenCalled();
  });

  it.each(['league', 'id'])('rejects mismatched frozen detail %s', async (mismatch) => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher); const onLoad = vi.fn();
    browser.activate(); await net.reply(0, { retrospectives: [] }); void browser.load('Allflame', 'one', onLoad);
    await net.reply(1, mismatch === 'league' ? frozenDetail('Mirage') : frozenDetail('Allflame', 'two'));
    expect(onLoad).not.toHaveBeenCalled(); expect(browser.getSnapshot().actionError).toContain('did not match');
    expect(browser.getSnapshot().loadingStrategyKey).toBeNull();
  });

  it('unmount rejects pending board completion and stops subsequent catalog fan-out', async () => {
    const net = transport(); const browser = new FrozenBrowserRequests(net.fetcher);
    browser.activate(); await net.reply(0, { retrospectives: [snapshot()] }); browser.deactivate();
    const inactive = browser.getSnapshot(); await net.reply(1, board()); await net.fail(2);
    expect(browser.getSnapshot()).toEqual(inactive);
    browser.activate(); browser.deactivate(); await net.reply(3, { retrospectives: [snapshot()] });
    expect(net.calls).toHaveLength(4); expect(browser.getSnapshot()).toEqual(inactive);
  });
});
