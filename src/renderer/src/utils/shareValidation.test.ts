import { describe, expect, it } from 'vitest';
import { hasImpossibleAtlasPoints, leagueShareBlock } from './shareValidation';
import { LEAGUE_ENDS_AT } from './league';

describe('hasImpossibleAtlasPoints', () => {
  it('blocks an allocation above the captured maximum', () => {
    expect(hasImpossibleAtlasPoints(139, 138)).toBe(true);
  });

  it('allows valid, incomplete, and unavailable captures', () => {
    expect(hasImpossibleAtlasPoints(138, 138)).toBe(false);
    expect(hasImpossibleAtlasPoints(120, 138)).toBe(false);
    expect(hasImpossibleAtlasPoints(null, 138)).toBe(false);
    expect(hasImpossibleAtlasPoints(139, null)).toBe(false);
    expect(hasImpossibleAtlasPoints(1, 0)).toBe(false);
  });
});

describe('leagueShareBlock', () => {
  const mirageEnd = Date.parse(LEAGUE_ENDS_AT.Mirage);

  it('blocks an unstamped session (server requires a league)', () => {
    expect(leagueShareBlock('')).toBe('missing');
    expect(leagueShareBlock('   ')).toBe('missing');
    expect(leagueShareBlock(null)).toBe('missing');
    expect(leagueShareBlock(undefined)).toBe('missing');
  });

  it('blocks an ended league from its exact end instant onward', () => {
    expect(leagueShareBlock('Mirage', mirageEnd - 1)).toBe(null);
    expect(leagueShareBlock('Mirage', mirageEnd)).toBe('ended');
    expect(leagueShareBlock('Mirage', mirageEnd + 86_400_000)).toBe('ended');
  });

  it('allows leagues without a recorded end (future leagues, older names)', () => {
    expect(leagueShareBlock('SomeFutureLeague', mirageEnd + 1)).toBe(null);
  });
});
