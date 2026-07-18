import type { LeagueCloseouts, SavedSession } from '../types';

const ASCII_WHITESPACE = /[ \t\n\f\r]+/g;
const ASCII_UPPERCASE = /[A-Z]/g;

/**
 * Permanent retrospective/snapshot identity rule.
 *
 * 1. Collapse U+0020/U+0009/U+000A/U+000C/U+000D runs to one U+0020.
 * 2. Remove leading/trailing U+0020.
 * 3. Lowercase ASCII A-Z only.
 * 4. Leave every other code point unchanged.
 *
 * Slice B's Node operator script and migration use this exact algorithm.
 */
export function normalizeLeagueKey(leagueName: string): string {
  return leagueName
    .replace(ASCII_WHITESPACE, ' ')
    .replace(/^ | $/g, '')
    .replace(ASCII_UPPERCASE, (letter) => letter.toLowerCase());
}

function normalizeLeagueDisplayName(leagueName: string): string {
  return leagueName.replace(ASCII_WHITESPACE, ' ').replace(/^ | $/g, '');
}

export function isRetrospectiveLeague(leagueName: string): boolean {
  const key = normalizeLeagueKey(leagueName);
  return key.length > 0 && key !== 'standard';
}

/** Strongest available local evidence for when a saved session was active. */
export function sessionActivityAt(session: SavedSession): number | null {
  const parsedTimes = session.maps
    .map((map) => map.parsedAt)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (parsedTimes.length > 0) return Math.max(...parsedTimes);

  const createdAt = Date.parse(session.createdAt);
  return Number.isFinite(createdAt) ? createdAt : null;
}

export interface PersonalLeagueCandidate {
  leagueKey: string;
  leagueName: string;
  sessionCount: number;
  latestActivityAt: number | null;
}

export interface PersonalRetrospectiveGroup {
  leagueKey: string;
  leagueName: string;
  cutoffUtc: string;
  closedAt: string;
  sessions: SavedSession[];
  omittedAfterCutoff: number;
  omittedUndated: number;
}

export function collectPersonalLeagueCandidates(
  savedSessions: Record<string, SavedSession>,
): PersonalLeagueCandidate[] {
  const byKey = new Map<string, PersonalLeagueCandidate>();
  const ordered = Object.values(savedSessions).sort((a, b) => {
    const aTime = sessionActivityAt(a) ?? Number.NEGATIVE_INFINITY;
    const bTime = sessionActivityAt(b) ?? Number.NEGATIVE_INFINITY;
    return bTime - aTime;
  });

  for (const session of ordered) {
    const rawLeagueName = session.settings.leagueName ?? '';
    if (!isRetrospectiveLeague(rawLeagueName)) continue;
    const leagueKey = normalizeLeagueKey(rawLeagueName);
    const leagueName = normalizeLeagueDisplayName(rawLeagueName);
    const activityAt = sessionActivityAt(session);
    const existing = byKey.get(leagueKey);
    if (existing) {
      existing.sessionCount += 1;
      if (activityAt !== null && (
        existing.latestActivityAt === null || activityAt > existing.latestActivityAt
      )) {
        existing.latestActivityAt = activityAt;
      }
      continue;
    }
    byKey.set(leagueKey, {
      leagueKey,
      leagueName,
      sessionCount: 1,
      latestActivityAt: activityAt,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const timeDiff = (b.latestActivityAt ?? Number.NEGATIVE_INFINITY)
      - (a.latestActivityAt ?? Number.NEGATIVE_INFINITY);
    return timeDiff || a.leagueName.localeCompare(b.leagueName);
  });
}

export function buildPersonalRetrospectiveGroups(
  savedSessions: Record<string, SavedSession>,
  closeouts: LeagueCloseouts,
): PersonalRetrospectiveGroup[] {
  const candidates = collectPersonalLeagueCandidates(savedSessions);
  const sessionsByKey = new Map<string, SavedSession[]>();
  for (const session of Object.values(savedSessions)) {
    const leagueKey = normalizeLeagueKey(session.settings.leagueName ?? '');
    if (!leagueKey) continue;
    const group = sessionsByKey.get(leagueKey) ?? [];
    group.push(session);
    sessionsByKey.set(leagueKey, group);
  }

  const groups: PersonalRetrospectiveGroup[] = [];
  for (const candidate of candidates) {
    const closeout = closeouts[candidate.leagueKey];
    if (!closeout) continue;
    const cutoffMs = Date.parse(closeout.cutoffUtc);
    if (!Number.isFinite(cutoffMs)) continue;

    const included: Array<{ session: SavedSession; activityAt: number }> = [];
    let omittedAfterCutoff = 0;
    let omittedUndated = 0;
    for (const session of sessionsByKey.get(candidate.leagueKey) ?? []) {
      const activityAt = sessionActivityAt(session);
      if (activityAt === null) {
        omittedUndated += 1;
      } else if (activityAt > cutoffMs) {
        omittedAfterCutoff += 1;
      } else {
        included.push({ session, activityAt });
      }
    }

    included.sort((a, b) => b.activityAt - a.activityAt);
    groups.push({
      leagueKey: candidate.leagueKey,
      leagueName: candidate.leagueName,
      cutoffUtc: closeout.cutoffUtc,
      closedAt: closeout.closedAt,
      sessions: included.map(({ session }) => session),
      omittedAfterCutoff,
      omittedUndated,
    });
  }

  return groups.sort((a, b) => Date.parse(b.cutoffUtc) - Date.parse(a.cutoffUtc));
}

export function utcIsoToLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function localDateTimeInputToUtcIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
