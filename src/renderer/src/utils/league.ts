/**
 * PoE1 challenge league / event management.
 *
 * To add a new league or event when it launches:
 *   1. Add its EXACT poe.ninja league string to the top of KNOWN_LEAGUES (newest first).
 *      That is usually all that is needed — detection then auto-selects it.
 *   2. Only touch CURRENT_LEAGUE if you want to change the total-failure fallback.
 *
 * League detection probes poe.ninja in order — first hit with live data wins.
 * Standard is NOT a member here (this app does not track Standard); CURRENT_LEAGUE
 * is the fallback if no known league returns live data.
 */

// ─── Update this each new league ─────────────────────────────────────────────
// CURRENT_LEAGUE is the last-resort fallback used only when poe.ninja detection
// fails entirely. Keep it on a league that reliably has economy data. Detection
// (below) auto-selects whichever KNOWN_LEAGUES entry has live data first, so adding
// a new event/league does NOT require changing CURRENT_LEAGUE — it only requires
// adding the entry to KNOWN_LEAGUES (newest-first).
export const CURRENT_LEAGUE = 'Ancestors';

export const KNOWN_LEAGUES: string[] = [
  // Return of the Ancestors event (live Jun 25 2026, ends ~Jul 16). poe.ninja's
  // league string is the plain "Ancestors" (trade: /trade/search/Ancestors).
  // KNOWN_LEAGUES[0] also drives the Strategy Browser default filter.
  'Ancestors',                // event — 3.28-based economy; MUST stay above Mirage
  'Mirage',                   // 3.28 — parent league, kept as a live-data fallback
  // Standard intentionally removed: never a trackable league for this app.
  // (itemIcons.ts fetches Standard separately for legacy item icons only.)
];
// ─────────────────────────────────────────────────────────────────────────────

let cachedLeague: string | null = null;
let cachedFetchPromise: Promise<string> | null = null;

async function detect(): Promise<string> {
  // poe.ninja is fetched via the main process (window.api.fetchCurrencyOverview),
  // not the renderer, to avoid CORS: poe.ninja sends no Access-Control-Allow-Origin
  // header, so a renderer-origin fetch (localhost in dev) is blocked by the browser.
  // The per-request timeout now lives in the main-process handler.
  for (const name of KNOWN_LEAGUES) {
    try {
      const res = await window.api?.fetchCurrencyOverview(name);
      if (res?.lines && res.lines.length > 5) {
        console.log('[League] Detected via probe:', name);
        return name;
      }
    } catch { /* network error: fall through to the next league */ }
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
