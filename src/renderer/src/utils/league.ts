/**
 * PoE1 challenge league / event management — ACTIVE CONTEXT v1.
 *
 * (LEAGUE_ROLLOVER_PLAN Phase 1 step 1.) The old getCurrentLeague() is now a
 * thin wrapper over getActiveContext(). v1 carries only the league name + how
 * it was determined; gameDataRevision / atlasTreeVersion / mechanics arrive
 * with the manifest (Phase 1 step 2).
 *
 * League resolution order:
 *   1. MANUAL OVERRIDE (user-set dropdown; store top-level `leagueOverride`,
 *      seeded into this module by the store on startup + on change). Bypasses
 *      the probe entirely — this is also the escape hatch for the D5
 *      interregnum problem (detection sticking on an ended event league).
 *   2. DETECTION: probe poe.ninja over KNOWN_LEAGUES in order — first entry
 *      with live data wins.
 *   3. FALLBACK: CURRENT_LEAGUE, only when every probe fails (offline etc).
 *
 * To add a new league or event when it launches:
 *   1. Add its EXACT poe.ninja league string to the top of KNOWN_LEAGUES
 *      (newest first). That is usually all that is needed.
 *   2. Only touch CURRENT_LEAGUE if you want to change the total-failure fallback.
 *
 * Standard is NOT a member here (this app does not track Standard); it is also
 * filtered out of the override dropdown (locked decision, LEAGUE_ROLLOVER_PLAN).
 */

// ─── Update this each new league ─────────────────────────────────────────────
// CURRENT_LEAGUE is the last-resort fallback used only when poe.ninja detection
// fails entirely. Keep it on a league that reliably has economy data. Detection
// (below) auto-selects whichever KNOWN_LEAGUES entry has live data first, so adding
// a new event/league does NOT require changing CURRENT_LEAGUE — it only requires
// adding the entry to KNOWN_LEAGUES (newest-first).
export const CURRENT_LEAGUE = 'Allflame';

export const KNOWN_LEAGUES: string[] = [
  // Curse of the Allflame (3.29). Exact poe.ninja string verified against
  // live exchange data on launch day; endsAt intentionally remains unknown.
  'Allflame',
  // Return of the Ancestors event (live Jun 25 2026, ends ~Jul 16). poe.ninja's
  // league string is the plain "Ancestors" (trade: /trade/search/Ancestors).
  'Ancestors',                // event — 3.28-based economy
  'Mirage',                   // 3.28 — parent league, kept as a live-data fallback
  // Standard intentionally removed: never a trackable league for this app.
  // (itemIcons.ts fetches Standard separately for legacy item icons only.)
];

// D5(b) — rollover plan: leagues with a known end date. After endsAt, the
// detection probe and the "current league" defaults SKIP the entry, so users
// are not stuck on a dead event if poe.ninja keeps serving its frozen data
// (the Jul 16-24 interregnum problem). The entry STAYS in KNOWN_LEAGUES:
// icon-cache parent derivation, the Browser filter dropdown and the manual
// override still legitimately reference an ended league. Date is intentionally
// end-of-day-generous: being hours late off a dead event beats being hours
// early off a live one, and the manual override remains the escape hatch.
export const LEAGUE_ENDS_AT: Record<string, string> = {
  Ancestors: '2026-07-17T00:00:00Z',
  Mirage: '2026-07-20T22:00:00Z',
};

/** Has this league's known end date passed? Unknown end = never ended. */
export function isLeagueEnded(name: string, now: number = Date.now()): boolean {
  const ends = LEAGUE_ENDS_AT[name];
  return !!ends && now >= Date.parse(ends);
}

/**
 * KNOWN_LEAGUES minus ended entries — what detection and defaults iterate.
 * FAIL-OPEN: if everything is marked ended (bad data / far future), return the
 * full list rather than an empty one; a wrong league beats no league.
 */
export function activeKnownLeagues(now: number = Date.now()): string[] {
  const alive = KNOWN_LEAGUES.filter((l) => !isLeagueEnded(l, now));
  return alive.length > 0 ? alive : [...KNOWN_LEAGUES];
}
// ─────────────────────────────────────────────────────────────────────────────

export type LeagueSource = 'override' | 'detected' | 'fallback';

/** Active context v1 — grows revision/atlasTreeVersion/mechanics with the manifest. */
export interface ActiveContext {
  leagueName: string;
  source: LeagueSource;
}

// ─── Manual override ─────────────────────────────────────────────────────────
// Module-level so this util stays store-agnostic (main consumers unchanged).
// OWNED by useSessionStore (persisted top-level `leagueOverride`); the store
// seeds this value right after creation and on every setLeagueOverride().
// Do not set it from anywhere else.
let leagueOverride: string | null = null;

export function normalizeLeagueOverride(v: string | null): string | null {
  const candidate = v?.trim() ?? '';
  // Standard is never valid session provenance. The dropdown filters it too,
  // but persisted/hand-edited state must fail closed at this boundary.
  return candidate && !/^standard$/i.test(candidate) ? candidate : null;
}

export function setLeagueOverrideValue(v: string | null): void {
  const next = normalizeLeagueOverride(v);
  if (next === leagueOverride) return;
  leagueOverride = next;
  // Any cached detection result is now the wrong answer (in BOTH directions:
  // setting an override, and clearing one back to auto-detect).
  clearLeagueCache();
}

// ─── Detection ───────────────────────────────────────────────────────────────
let cachedContext: ActiveContext | null = null;
let cachedFetchPromise: Promise<ActiveContext> | null = null;

async function detect(): Promise<ActiveContext> {
  // poe.ninja is fetched via the main process (window.api.fetchCurrencyOverview),
  // not the renderer, to avoid CORS: poe.ninja sends no Access-Control-Allow-Origin
  // header, so a renderer-origin fetch (localhost in dev) is blocked by the browser.
  // The per-request timeout lives in the main-process handler.
  // D5(b): ended leagues are skipped — poe.ninja may keep serving frozen data
  // for a dead event, which would otherwise win the probe forever.
  // Display defaults deliberately fail open, but detection must allow an empty
  // candidate list during the gap between leagues. Probing ended leagues would
  // turn frozen poe.ninja data into a false confirmation.
  const detectable = KNOWN_LEAGUES.filter((name) => !isLeagueEnded(name));
  for (const name of detectable) {
    try {
      const res = await window.api?.fetchCurrencyOverview(name);
      if (res?.lines && res.lines.length > 5) {
        console.log('[League] Detected via probe:', name);
        return { leagueName: name, source: 'detected' };
      }
    } catch { /* network error: fall through to the next league */ }
  }
  // Fallback also respects endsAt: first non-ended entry, else CURRENT_LEAGUE.
  const fallback = detectable[0] ?? CURRENT_LEAGUE;
  console.warn('[League] Could not detect, falling back to:', fallback);
  return { leagueName: fallback, source: 'fallback' };
}

export async function getActiveContext(): Promise<ActiveContext> {
  // Override wins outright — no probe, no cache involvement.
  if (leagueOverride) return { leagueName: leagueOverride, source: 'override' };
  // A process may stay open across an event boundary. Do not let a context
  // detected before `endsAt` live forever in memory; the next consumer after
  // the boundary must re-probe and flow the new league into price/icon caches.
  if (cachedContext && isLeagueEnded(cachedContext.leagueName)) clearLeagueCache();
  if (cachedContext) return cachedContext;
  if (cachedFetchPromise) return cachedFetchPromise;
  cachedFetchPromise = detect().then((ctx) => {
    cachedContext = ctx;
    cachedFetchPromise = null;
    return ctx;
  });
  return cachedFetchPromise;
}

/** Back-compat wrapper — every existing consumer keeps working unchanged. */
export async function getCurrentLeague(): Promise<string> {
  return (await getActiveContext()).leagueName;
}

/**
 * SYNCHRONOUS current-league view: override, else the cached detection
 * result, else null (= unknown; detection not resolved yet). For banner /
 * guard logic that cannot await — callers must treat null as "cannot
 * compare" (fail-open: no flag), NEVER as "no league". (Rollover plan
 * Phase 1.5, historical-session protection.)
 */
export function currentLeagueSync(): string | null {
  return leagueOverride ?? cachedContext?.leagueName ?? null;
}

/**
 * SYNCHRONOUS "confirmed" current league: a user override (always real) or a
 * DETECTED league, else null. Unlike currentLeagueSync(), this returns null when
 * the only thing we have is the offline FALLBACK — because the fallback can be
 * stale around a league rollover, and seeding league-scoped state (e.g. Atlas
 * Bonus) from a guessed league would reintroduce the exact rollover bug. Callers
 * that must not act under a guessed league use this; null = "wait for real
 * detection / an explicit override".
 */
export function confirmedLeagueSync(): string | null {
  if (leagueOverride) return leagueOverride;
  if (cachedContext && cachedContext.source !== 'fallback') return cachedContext.leagueName;
  return null;
}

export function clearLeagueCache(): void {
  cachedContext = null;
  cachedFetchPromise = null;
}

// ─── Override dropdown data ──────────────────────────────────────────────────

/**
 * Pure filter over the poe.ninja index-state league list (exported for tests).
 * Drops Hardcore/SSF/Ruthless variants and Standard (never trackable — locked
 * decision), dedupes, and unions in KNOWN_LEAGUES so the curated entries are
 * always offerable even if the index omits or renames them.
 */
export function filterLeagueIndex(names: string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const n = (raw ?? '').trim();
    if (!n) continue;
    if (/hardcore|ssf|solo self-found|ruthless/i.test(n)) continue;
    if (/^standard$/i.test(n)) continue;
    if (!out.includes(n)) out.push(n);
  }
  for (const k of KNOWN_LEAGUES) {
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Leagues offered in the manual-override dropdown. Sourced from poe.ninja's
 * index-state endpoint (EXTERNAL_APIS.md poe.ninja §C) via the main process;
 * falls back to KNOWN_LEAGUES with a LOUD console.warn if the endpoint is
 * unreachable or its (unverified — see rollover plan) shape yields nothing.
 */
export async function fetchSelectableLeagues(): Promise<string[]> {
  try {
    const res = await window.api?.fetchLeagueIndex?.();
    if (res?.leagues && res.leagues.length > 0) {
      const filtered = filterLeagueIndex(res.leagues);
      if (filtered.length > 0) return filtered;
    }
    console.warn(
      '[League] index-state unavailable or empty (' + (res?.error ?? 'no data') +
      ') — override dropdown falling back to KNOWN_LEAGUES'
    );
  } catch (err) {
    console.warn('[League] index-state fetch failed — override dropdown falling back to KNOWN_LEAGUES', err);
  }
  return [...KNOWN_LEAGUES];
}
