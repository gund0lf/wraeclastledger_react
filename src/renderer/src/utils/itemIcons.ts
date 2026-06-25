/**
 * Item icon resolver - poe.ninja public API (PoE1 endpoints).
 *
 * Both economy families carry per-item icons, but in different places, so each
 * category is fetched from its own family (verified against live responses):
 *
 *   exchange (https://poe.ninja/poe1/api/economy/exchange/current/overview)
 *     -> TOP-LEVEL items[] { name, image: "/gen/image/..." }  (relative path;
 *        the main process prefixes it with https://web.poecdn.com)
 *        NOTE: core.items[] is only the chaos/divine reference pair - the real
 *        per-item list is the sibling top-level items[] at the end of the payload.
 *
 *   stash    (https://poe.ninja/poe1/api/economy/stash/current/item/overview)
 *     -> lines[] { name, icon }  (icon is already a full web.poecdn.com URL)
 *
 * The fetch + family-specific parsing happens in the main process
 * (window.api.fetchEconomyIcons) so it isn't subject to renderer CORS.
 *
 * Resolution order: exact name -> normalised -> prefix -> containment ->
 * name-keyword fallback -> known-div-card -> blank.
 *
 * Divination cards are a special case: poe.ninja serves NO per-card icons (the
 * exchange items[] only has chaos/divine), and card names have no shared keyword
 * (e.g. "Darker Half"). But the exchange DivinationCard lines[] IS the full card
 * list by slug, and a slug is just the hyphenated normalised name. So we collect
 * those slugs into a Set and map any matching loot name to the one generic
 * div-card icon poe.ninja itself uses. Auto-updates each league; no hardcoded list.
 *
 * We fetch the current challenge league + Standard (Standard has older items).
 */

import { getCurrentLeague } from './league';

// exchange family: names + relative image paths live in the top-level items[]
const EXCHANGE_TYPES = [
  'Currency',
  'Fragment',
  'Omen',
  'Tattoo',
  'Artifact',
  'DeliriumOrb',
  'Scarab',
  'Essence',
  'Oil',
  'DivinationCard',
  'DjinnCoin',
  'AllflameEmber',
  'Runegraft',
  'Resonator',
  'Fossil',
  'Astrolabe',
];

// stash family: names + full icon URLs live in lines[]
const STASH_TYPES = [
  'Incubator',
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueFlask',
  'UniqueJewel',
  'UniqueMap',
  'Map',
  'BlightedMap',
  'SkillGem',
  'Beast',
  'ClusterJewel',
  'Invitation',
  'IncursionTemple',
  'Wombgift',
];

// Generic div-card art (the same asset poe.ninja's card pages use). Used when a
// name matches the known card list; if it ever 404s the <img onError> hides it.
const GENERIC_DIV_CARD = 'https://web.poecdn.com/image/Art/2DItems/Divination/InventoryIcon.png';

// ─── Normalisation ────────────────────────────────────────────────────────────
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritics: Mórrigan → morrigan
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Category fallbacks seeded after main fetch ───────────────────────────────
const GENERIC: Record<string, string> = {};
// Normalised names of every divination card poe.ninja lists (built from slugs).
const divCardSet = new Set<string>();

function pickGeneric(name: string): string | undefined {
  const n = norm(name);

  // Divination cards by common naming ("The X", "A X")
  if (GENERIC.div_card) {
    if (n.startsWith('the ') || n.startsWith('a ') || n.startsWith('an ') ||
        n.includes('card') || n.includes('three voices') || n.includes('seven years'))
      return GENERIC.div_card;
  }
  // Beasts
  if (GENERIC.beast) {
    if (n.includes('chimeral') || n.includes('morrigan') || n.includes('fenumus') ||
        n.includes('farric') || n.includes('farrul') || n.includes('catarina') ||
        n.includes('saqawine'))
      return GENERIC.beast;
  }
  // Temples (all share the same TempleMap icon)
  if (GENERIC.temple && n.endsWith('temple')) return GENERIC.temple;
  // Astrolabes
  if (GENERIC.astrolabe && n.includes('astrolabe')) return GENERIC.astrolabe;
  // Gems
  if (GENERIC.gem) {
    if (n.includes(' support') || n.includes('awakened') || n.includes('empower') ||
        n.includes('enhance') || n.includes('enlighten') || n.includes('vaal ') ||
        n.includes('gem'))
      return GENERIC.gem;
  }
  // Scarabs
  if (GENERIC.scarab && n.includes('scarab')) return GENERIC.scarab;
  // Essences
  if (GENERIC.essence && n.includes('essence')) return GENERIC.essence;
  // Delirium orbs
  if (GENERIC.delirium && n.includes('delirium')) return GENERIC.delirium;
  // Incubators
  if (GENERIC.incubator && n.includes('incubator')) return GENERIC.incubator;
  // Oils ("... Oil"; avoid matching "coiling" etc.)
  if (GENERIC.oil && n.endsWith(' oil')) return GENERIC.oil;
  // Djinn coins (catch "coin of X")
  if (GENERIC.djinn_coin && n.includes('coin')) return GENERIC.djinn_coin;
  // Wombgifts
  if (GENERIC.wombgift && n.includes('wombgift')) return GENERIC.wombgift;
  // Runegrafts
  if (GENERIC.runegraft && n.includes('runegraft')) return GENERIC.runegraft;
  // Allflame embers
  if (GENERIC.allflame && (n.includes('allflame') || n.includes('all-flame'))) return GENERIC.allflame;
  // Omens
  if (GENERIC.omen && n.includes('omen')) return GENERIC.omen;
  // Maps (named maps are gone -> generic tier/nightmare maps share an icon)
  if (GENERIC.map && n.endsWith('map')) return GENERIC.map;
  // Volatile / fog / refracting
  if (GENERIC.misc_orb) {
    if (n.includes('fog') || n.includes('mist') || n.includes('refracting') ||
        n.includes('vapour') || n.includes('volatile') || n.includes('tainted'))
      return GENERIC.misc_orb;
  }
  // Fragments / keys / splinters
  if (GENERIC.fragment) {
    if (n.includes('key') || n.includes('splinter') || n.includes('relic') ||
        n.includes('emblem') || n.includes('fragment') || n.includes('vessel'))
      return GENERIC.fragment;
  }
  // Generic orb fallback (last, broadest)
  if (GENERIC.chaos_orb && n.includes('orb')) return GENERIC.chaos_orb;

  return undefined;
}

// ─── Fetch (via main process; family-specific parse done in main) ─────────────
async function fetchCategory(
  family: 'exchange' | 'stash',
  type: string,
  league: string
): Promise<{ pairs: [string, string][]; slugs: string[] }> {
  try {
    if (typeof window === 'undefined' || !window.api?.fetchEconomyIcons) return { pairs: [], slugs: [] };
    const res = await window.api.fetchEconomyIcons(family, league, type);
    const pairs = (res?.icons ?? []).map((i) => [i.name, i.icon] as [string, string]);
    return { pairs, slugs: res?.slugs ?? [] };
  } catch {
    return { pairs: [], slugs: [] };
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────
let exactMap:  Map<string, string> | null = null;
let normMap:   Map<string, string> | null = null;
let fetchProm: Promise<void>       | null = null;

async function buildCache(): Promise<void> {
  const exact      = new Map<string, string>();
  const normalized = new Map<string, string>();
  divCardSet.clear();

  const add = (name: string, url: string) => {
    exact.set(name, url);
    normalized.set(norm(name), url);
  };

  // Detect current challenge league, then also pull Standard for legacy items
  const challenge = await getCurrentLeague();
  const leagues = challenge === 'Standard'
    ? ['Standard']
    : [challenge, 'Standard'];

  for (const league of leagues) {
    // exchange-family categories (parallel per league)
    const exchRes = await Promise.allSettled(
      EXCHANGE_TYPES.map((t) => fetchCategory('exchange', t, league))
    );
    exchRes.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      r.value.pairs.forEach(([k, v]) => add(k, v));
      // DivinationCard slugs -> the authoritative card-name set (no icons exist)
      if (EXCHANGE_TYPES[i] === 'DivinationCard') {
        for (const slug of r.value.slugs) divCardSet.add(slug.replace(/-/g, ' '));
      }
    });

    // stash-family categories (parallel per league)
    const stashRes = await Promise.allSettled(
      STASH_TYPES.map((t) => fetchCategory('stash', t, league))
    );
    stashRes.forEach((r) => {
      if (r.status === 'fulfilled') r.value.pairs.forEach(([k, v]) => add(k, v));
    });
  }

  // ── Seed category fallbacks ──────────────────────────────────────────────
  // Keyword seeding: the first cached item matching the predicate sets the icon.
  // Robust to league-specific naming since it only needs ONE item of the type.
  const seedBy = (key: string, match: (n: string) => boolean) => {
    if (GENERIC[key]) return;
    for (const [name, url] of exact) {
      if (match(norm(name))) { GENERIC[key] = url; return; }
    }
  };

  seedBy('scarab',    (n) => n.includes('scarab'));
  seedBy('essence',   (n) => n.includes('essence'));
  seedBy('delirium',  (n) => n.includes('delirium'));
  seedBy('incubator', (n) => n.includes('incubator'));
  seedBy('runegraft', (n) => n.includes('runegraft'));
  seedBy('wombgift',  (n) => n.includes('wombgift'));
  seedBy('allflame',  (n) => n.includes('allflame'));
  seedBy('omen',      (n) => n.includes('omen'));
  seedBy('djinn_coin',(n) => n.includes('coin'));
  seedBy('oil',       (n) => n.endsWith(' oil'));
  seedBy('temple',    (n) => n.endsWith('temple'));
  seedBy('map',       (n) => n.endsWith('map'));
  seedBy('astrolabe', (n) => n.includes('astrolabe'));

  // Specific-name seeds where a keyword would be ambiguous
  const seed = (candidates: string[], key: string) => {
    if (GENERIC[key]) return;
    for (const c of candidates) {
      const url = exact.get(c) ?? normalized.get(norm(c));
      if (url) { GENERIC[key] = url; return; }
    }
  };
  seed(['Craicic Chimeral', 'Saqawal, First of the Sky', 'Farrul, First of the Plains'], 'beast');
  seed(['Chaos Orb'], 'chaos_orb');
  seed(['Orb of Alchemy', 'Orb of Annulment', 'Orb of Scouring'], 'misc_orb');
  seed(['Ritual Vessel', 'Sacrifice at Dusk', 'Timeless Karui Splinter'], 'fragment');

  // Gem fallback: any support gem icon
  const gemEntry = [...exact.entries()].find(([k]) =>
    k.toLowerCase().includes('support') || k.toLowerCase().includes('phantasmal')
  );
  if (gemEntry) GENERIC.gem = gemEntry[1];

  // Last-resort defaults so a whole category is never blank
  GENERIC.div_card  = GENERIC_DIV_CARD; // no per-card icons exist on poe.ninja
  if (!GENERIC.astrolabe) GENERIC.astrolabe = GENERIC.misc_orb ?? GENERIC.chaos_orb ?? '';

  exactMap = exact;
  normMap  = normalized;

  console.log(
    `[Icons] Cache built: ${exact.size} items, ${divCardSet.size} div cards, leagues: ${leagues.join(' + ')}`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function getItemIcons(): Promise<{
  resolve: (name: string) => string | undefined;
}> {
  if (!exactMap) {
    if (!fetchProm) fetchProm = buildCache().finally(() => { fetchProm = null; });
    await fetchProm;
  }

  return {
    resolve(name: string): string | undefined {
      if (!exactMap || !normMap) return undefined;

      // 1. Exact name match
      const exact = exactMap.get(name);
      if (exact) return exact;

      // 2. Normalised exact (diacritics, apostrophes stripped)
      const n = norm(name);
      const byNorm = normMap.get(n);
      if (byNorm) return byNorm;

      // 3. Progressive prefix: "Breach Scarab of the Hive" → try "Breach Scarab" etc.
      const words = n.split(' ');
      for (let len = words.length - 1; len >= 2; len--) {
        const prefix = words.slice(0, len).join(' ');
        const url = normMap.get(prefix);
        if (url) return url;
      }

      // 4. Containment sweep (slower, runs last)
      for (const [k, v] of normMap) {
        if (n.startsWith(k) || k.startsWith(n)) return v;
      }

      // 5. Name-keyword fallback
      const byKeyword = pickGeneric(name);
      if (byKeyword) return byKeyword;

      // 6. Known divination card (poe.ninja's own card list) -> generic card icon
      if (divCardSet.has(n)) return GENERIC.div_card;

      return undefined;
    },
  };
}

export function clearIconCache(): void {
  exactMap  = null;
  normMap   = null;
  fetchProm = null;
  divCardSet.clear();
  for (const k in GENERIC) delete GENERIC[k];
}
