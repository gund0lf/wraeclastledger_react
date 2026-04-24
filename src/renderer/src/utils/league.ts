/**
 * PoE1 challenge league management.
 *
 * To add a new league when it launches:
 *   1. Add it to the top of KNOWN_LEAGUES (most recent first)
 *   2. Update CURRENT_LEAGUE to the new league name
 *
 * League detection probes poe.ninja in order — first hit with live data wins.
 * Standard is intentionally last as a fallback only.
 */

// ─── Update this each new league ─────────────────────────────────────────────
export const CURRENT_LEAGUE = 'Mirage';

export const KNOWN_LEAGUES: string[] = [
  'Mirage',       // 3.28 — current
  // 'NextLeague', // add here when it launches
  'Standard',     // fallback only
];
// ─────────────────────────────────────────────────────────────────────────────

let cachedLeague: string | null = null;
let cachedFetchPromise: Promise<string> | null = null;

async function detect(): Promise<string> {
  for (const name of KNOWN_LEAGUES) {
    try {
      const r = await fetch(
        `https://poe.ninja/api/data/currencyoverview?league=${encodeURIComponent(name)}&type=Currency`
      );
      if (!r.ok) continue;
      const d = await r.json();
      if ((d.lines ?? []).length > 5) {
        console.log('[League] Detected via probe:', name);
        return name;
      }
    } catch { /* continue */ }
  }
  console.warn('[League] Could not detect, falling back to:', CURRENT_LEAGUE);
  return CURRENT_LEAGUE;
}

export async function getCurrentLeague(): Promise<string> {
  if (cachedLeague) return cachedLeague;
  if (cachedFetchPromise) return cachedFetchPromise;
  cachedFetchPromise = detect().then((league) => {
    cachedLeague = league;
    cachedFetchPromise = null;
    return league;
  });
  return cachedFetchPromise;
}

export function clearLeagueCache(): void {
  cachedLeague = null;
  cachedFetchPromise = null;
}
