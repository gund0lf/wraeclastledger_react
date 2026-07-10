/**
 * league.test.ts — active context v1 (rollover Phase 1 step 1).
 *
 * league.ts holds MODULE-LEVEL state (override + detection cache), so the
 * stateful tests import a FRESH module instance per test via vi.resetModules()
 * + dynamic import. The pure filterLeagueIndex tests use a static import.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { filterLeagueIndex, KNOWN_LEAGUES, CURRENT_LEAGUE } from './league';

type LeagueModule = typeof import('./league');

async function freshLeague(): Promise<LeagueModule> {
  vi.resetModules();
  return await import('./league');
}

/** Stub window.api.fetchCurrencyOverview with per-league line counts. */
function stubProbe(linesByLeague: Record<string, number>) {
  const spy = vi.fn(async (league: string) => ({
    lines: Array((linesByLeague[league] ?? 0)).fill({ id: 'x', primaryValue: 1 }),
    error: null,
  }));
  vi.stubGlobal('window', { api: { fetchCurrencyOverview: spy } });
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getActiveContext — detection', () => {
  it('detects the first KNOWN_LEAGUES entry with live data (>5 lines)', async () => {
    const league = await freshLeague();
    const spy = stubProbe({ [KNOWN_LEAGUES[0]]: 10 });
    const ctx = await league.getActiveContext();
    expect(ctx).toEqual({ leagueName: KNOWN_LEAGUES[0], source: 'detected' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('falls through dead leagues (<=5 lines) to the next probe', async () => {
    const league = await freshLeague();
    const spy = stubProbe({ [KNOWN_LEAGUES[0]]: 3, [KNOWN_LEAGUES[1]]: 12 });
    const ctx = await league.getActiveContext();
    expect(ctx).toEqual({ leagueName: KNOWN_LEAGUES[1], source: 'detected' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('falls back to CURRENT_LEAGUE with source "fallback" when every probe fails', async () => {
    const league = await freshLeague();
    stubProbe({}); // every league returns 0 lines
    const ctx = await league.getActiveContext();
    expect(ctx).toEqual({ leagueName: CURRENT_LEAGUE, source: 'fallback' });
  });

  it('caches the detection result (single probe run across calls)', async () => {
    const league = await freshLeague();
    const spy = stubProbe({ [KNOWN_LEAGUES[0]]: 10 });
    await league.getActiveContext();
    await league.getActiveContext();
    expect(await league.getCurrentLeague()).toBe(KNOWN_LEAGUES[0]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('getActiveContext — manual override (D4/D5)', () => {
  it('override bypasses the probe entirely', async () => {
    const league = await freshLeague();
    const spy = stubProbe({ [KNOWN_LEAGUES[0]]: 10 });
    league.setLeagueOverrideValue('Mirage');
    const ctx = await league.getActiveContext();
    expect(ctx).toEqual({ leagueName: 'Mirage', source: 'override' });
    expect(spy).not.toHaveBeenCalled();
    // Back-compat wrapper honors it too
    expect(await league.getCurrentLeague()).toBe('Mirage');
  });

  it('override wins even over a previously cached detection', async () => {
    const league = await freshLeague();
    stubProbe({ [KNOWN_LEAGUES[0]]: 10 });
    expect((await league.getActiveContext()).source).toBe('detected');
    league.setLeagueOverrideValue('Mirage');
    expect(await league.getActiveContext()).toEqual({ leagueName: 'Mirage', source: 'override' });
  });

  it('clearing the override re-probes (cache was invalidated on set)', async () => {
    const league = await freshLeague();
    const spy = stubProbe({ [KNOWN_LEAGUES[0]]: 10 });
    league.setLeagueOverrideValue('Mirage');
    await league.getActiveContext();
    expect(spy).not.toHaveBeenCalled();
    league.setLeagueOverrideValue(null);
    const ctx = await league.getActiveContext();
    expect(ctx).toEqual({ leagueName: KNOWN_LEAGUES[0], source: 'detected' });
    expect(spy).toHaveBeenCalled();
  });

  it('whitespace-only and empty overrides are treated as null (auto-detect)', async () => {
    const league = await freshLeague();
    stubProbe({ [KNOWN_LEAGUES[0]]: 10 });
    league.setLeagueOverrideValue('   ');
    expect((await league.getActiveContext()).source).toBe('detected');
  });
});

describe('filterLeagueIndex (override dropdown data)', () => {
  it('drops Hardcore/SSF/Ruthless variants and Standard', () => {
    const out = filterLeagueIndex([
      'Ancestors', 'Hardcore Ancestors', 'SSF Ancestors', 'Ruthless Ancestors',
      'Standard', 'Hardcore', 'Solo Self-Found', 'Mirage',
    ]);
    expect(out).toContain('Ancestors');
    expect(out).toContain('Mirage');
    expect(out.some((l) => /hardcore|ssf|ruthless|solo self-found/i.test(l))).toBe(false);
    expect(out).not.toContain('Standard');
  });

  it('dedupes and trims', () => {
    const out = filterLeagueIndex([' Ancestors ', 'Ancestors', '', '  ']);
    expect(out.filter((l) => l === 'Ancestors')).toHaveLength(1);
  });

  it('unions in KNOWN_LEAGUES so curated entries are always offerable', () => {
    const out = filterLeagueIndex(['SomeNewLeague']);
    expect(out[0]).toBe('SomeNewLeague');
    for (const k of KNOWN_LEAGUES) expect(out).toContain(k);
  });

  it('empty input still yields KNOWN_LEAGUES', () => {
    expect(filterLeagueIndex([])).toEqual([...KNOWN_LEAGUES]);
  });
});

describe('fetchSelectableLeagues', () => {
  it('filters the index list when the endpoint returns leagues', async () => {
    const league = await freshLeague();
    vi.stubGlobal('window', {
      api: {
        fetchLeagueIndex: vi.fn(async () => ({
          leagues: ['Ancestors', 'Hardcore Ancestors', 'Standard', 'FutureLeague'],
          error: null,
        })),
      },
    });
    const out = await league.fetchSelectableLeagues();
    expect(out).toContain('FutureLeague');
    expect(out).not.toContain('Standard');
    expect(out).not.toContain('Hardcore Ancestors');
  });

  it('falls back to KNOWN_LEAGUES (loudly) when the endpoint errors', async () => {
    const league = await freshLeague();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {
      api: { fetchLeagueIndex: vi.fn(async () => ({ leagues: null, error: 'poe.ninja 500' })) },
    });
    const out = await league.fetchSelectableLeagues();
    expect(out).toEqual([...KNOWN_LEAGUES]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to KNOWN_LEAGUES when window.api is absent (test/node env)', async () => {
    const league = await freshLeague();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {}); // no api bridge
    const out = await league.fetchSelectableLeagues();
    expect(out).toEqual([...KNOWN_LEAGUES]);
    warn.mockRestore();
  });
});
