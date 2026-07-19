import { isLeagueEnded } from './league';

export function hasImpossibleAtlasPoints(points: number | null, maximum: number | null): boolean {
  return points != null
    && maximum != null
    && Number.isFinite(points)
    && Number.isFinite(maximum)
    && maximum > 0
    && points > maximum;
}

/**
 * Ended-league share gate (decided 2026-07-19). The server rejects new
 * publishes/updates whose league is missing or outside its allowlist, so the
 * client stops the wasted export up front, reusing the pre-share validation
 * pattern (red explanation, withheld preview, disabled copy).
 *
 * Client-side league context only (KNOWN_LEAGUES end timestamps); the server
 * allowlist remains the authoritative backstop for any drift. An unstamped
 * session (empty league) is also blocked: the server requires a league, and
 * gap-period sessions stay pending until the new league is confirmed.
 */
export type LeagueShareBlock = 'ended' | 'missing' | null;

export function leagueShareBlock(
  leagueName: string | undefined | null,
  now: number = Date.now(),
): LeagueShareBlock {
  const name = leagueName?.trim() ?? '';
  if (name === '') return 'missing';
  return isLeagueEnded(name, now) ? 'ended' : null;
}
