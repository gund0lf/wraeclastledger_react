/**
 * Detects the current PoE1 challenge league from poe.ninja.
 *
 * poe.ninja API notes:
 *   - The economy endpoints live under /api/data/ (PoE1)
 *   - The index state endpoint returns leagues keyed by game
 *   - We probe to find which challenge league has live data
 */

let cachedLeague: string | null = null;
let cachedFetchPromise: Promise<string> | null = null;

async function detect(): Promise<string> {
  // Strategy 1: poe.ninja index state — try several known response shapes
  try {
    const res = await fetch('https://poe.ninja/api/data/getindexstate');
    if (res.ok) {
      const data = await res.json();

      // Shape A: { economyLeagues: [{name, url, display}] }
      const fromEconomy: string[] = (data.economyLeagues ?? []).map((l: any) => l.name);
      // Shape B: { leagues: [{name}] }
      const fromLeagues: string[] = (data.leagues ?? []).map((l: any) => l.name);

      const all = [...fromEconomy, ...fromLeagues];
      const challenge = all.find(
        (n) =>
          n &&
          !n.toLowerCase().includes('standard') &&
          !n.toLowerCase().includes('hardcore') &&
          !n.toLowerCase().includes('solo') &&
          !n.toLowerCase().includes('ruthless') &&
          !n.toLowerCase().includes('poe2') &&
          !n.toLowerCase().includes('dawn')
      );
      if (challenge) return challenge;
    }
  } catch { /* fall through */ }

  // Strategy 2: probe known recent league names by hitting the API directly
  // If poe.ninja returns lines[] with data, that league is active.
  // Order = most recent first — update this list each patch.
  const probes = [
    'Mirage', 'Dawn of the Hunt', 'Mercenaries', 'Settlers',
    'Affliction', 'Necropolis', 'Standard',
  ];

  for (const name of probes) {
    try {
      const r = await fetch(
        `https://poe.ninja/api/data/currencyoverview?league=${encodeURIComponent(name)}&type=Currency`
      );
      if (!r.ok) continue;
      const d = await r.json();
      if ((d.lines ?? []).length > 5) {
        // Found a live league
        console.log('[League] Detected via probe:', name);
        return name;
      }
    } catch { /* continue */ }
  }

  console.warn('[League] Could not detect, falling back to Standard');
  return 'Standard';
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
