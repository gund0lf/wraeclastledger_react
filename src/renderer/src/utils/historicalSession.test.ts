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
import { isCrossLeagueSession, isLiveSessionLeagueMismatch } from './historicalSession';
import { setLeagueOverrideValue } from './league';

afterEach(() => setLeagueOverrideValue(null));

describe('isCrossLeagueSession', () => {
  it('flags a loaded session from another league', () => {
    setLeagueOverrideValue('NewLeague329');
    expect(isCrossLeagueSession('historical', 'Mirage')).toBe(true);
  });

  it('does not flag a loaded session from the current league', () => {
    setLeagueOverrideValue('Mirage');
    expect(isCrossLeagueSession('historical', 'Mirage')).toBe(false);
  });

  it('never flags a live (unsaved) session', () => {
    setLeagueOverrideValue('NewLeague329');
    expect(isCrossLeagueSession('live', 'Mirage')).toBe(false);
  });

  it('fail-open: unknown current league (no override, no detection) => false', () => {
    setLeagueOverrideValue(null);
    expect(isCrossLeagueSession('historical', 'Mirage')).toBe(false);
  });

  it('fail-open: session without a league is never flagged', () => {
    setLeagueOverrideValue('NewLeague329');
    expect(isCrossLeagueSession('historical', '')).toBe(false);
    expect(isCrossLeagueSession('historical', undefined)).toBe(false);
  });
});

describe('isLiveSessionLeagueMismatch', () => {
  it('flags an unnamed live session carried from a different confirmed league', () => {
    setLeagueOverrideValue('NewLeague329');
    expect(isLiveSessionLeagueMismatch('live', 'Mirage')).toBe(true);
  });

  it('does not flag a loaded session, matching league, or unknown league', () => {
    setLeagueOverrideValue('Mirage');
    expect(isLiveSessionLeagueMismatch('historical', 'Ancestors')).toBe(false);
    expect(isLiveSessionLeagueMismatch('live', 'Mirage')).toBe(false);
    setLeagueOverrideValue(null);
    expect(isLiveSessionLeagueMismatch('live', 'Mirage')).toBe(false);
  });
});
