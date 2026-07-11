/**
 * historicalSession.test.ts — Phase 1.5 cross-league guard (rollover plan).
 *
 * isCrossLeagueSession drives the historical banner + the atlas-point
 * capture guard. The stricter price guard (any loaded session) is covered
 * in useSessionStore.divine.test.ts.
 *
 * currentLeagueSync() is module state in league.ts; we drive it through the
 * override setter (the detection cache is never populated in the node env).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isCrossLeagueSession } from './historicalSession';
import { setLeagueOverrideValue } from './league';

afterEach(() => setLeagueOverrideValue(null));

describe('isCrossLeagueSession', () => {
  it('flags a loaded session from another league', () => {
    setLeagueOverrideValue('NewLeague329');
    expect(isCrossLeagueSession('sess-1', 'Mirage')).toBe(true);
  });

  it('does not flag a loaded session from the current league', () => {
    setLeagueOverrideValue('Mirage');
    expect(isCrossLeagueSession('sess-1', 'Mirage')).toBe(false);
  });

  it('never flags a live (unsaved) session', () => {
    setLeagueOverrideValue('NewLeague329');
    expect(isCrossLeagueSession(null, 'Mirage')).toBe(false);
  });

  it('fail-open: unknown current league (no override, no detection) => false', () => {
    setLeagueOverrideValue(null);
    expect(isCrossLeagueSession('sess-1', 'Mirage')).toBe(false);
  });

  it('fail-open: session without a league is never flagged', () => {
    setLeagueOverrideValue('NewLeague329');
    expect(isCrossLeagueSession('sess-1', '')).toBe(false);
    expect(isCrossLeagueSession('sess-1', undefined)).toBe(false);
  });
});
