import { confirmedLeagueSync, currentLeagueSync } from './league';

/**
 * Historical-session helpers (LEAGUE_ROLLOVER_PLAN Phase 1.5, 2026-07-11).
 *
 * Two tiers of protection, deliberately different:
 *  - PRICE guard (stricter): ANY loaded saved session is never auto-repriced
 *    — same league or not, prices move within a league too. That guard lives
 *    in the store (initDivinePrice), not here.
 *  - CROSS-LEAGUE guard (this file): a loaded session whose league differs
 *    from the current active context. Drives the historical banner and the
 *    atlas-point capture guard (a new patch's tree must not overwrite a
 *    historical session's point counts).
 *
 * Fail-open: when the current league is unknown (detection not resolved,
 * offline), we cannot compare — return false rather than false-flagging.
 */
export function isCrossLeagueSession(
  activeSessionId: string | null,
  leagueName: string | undefined | null
): boolean {
  if (activeSessionId === null) return false;
  const cur = currentLeagueSync();
  return !!leagueName && !!cur && leagueName !== cur;
}

/** A live unnamed session carried across a confirmed supported league boundary. */
export function isLiveSessionLeagueMismatch(
  activeSessionId: string | null,
  leagueName: string | undefined | null,
): boolean {
  if (activeSessionId !== null) return false;
  const confirmed = confirmedLeagueSync();
  return !!leagueName && !!confirmed && leagueName !== confirmed;
}
