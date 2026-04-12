/**
 * Item icon resolver — poe.ninja public API (PoE1 endpoints).
 *
 * Root cause of missing icons:
 *   1. Mirage-specific categories (Djinn Coins, Wombgifts, Runegrafts, Allflame Embers,
 *      Tattoos, Omens) were never in our fetch list.
 *   2. currencyoverview icons live in `currencyDetails[].icon`, NOT in `lines[].icon`.
 *      lines[] only has price data. We were already handling this correctly for the
 *      "Currency" type, but it still needed all the new currency categories added.
 *   3. League name was hardcoded to "Mercenaries" — fixed via getCurrentLeague().
 *
 * poe.ninja endpoint reference (PoE1):
 *   currencyoverview: Currency, Fragment, Omen, Tattoo, DeliriumOrb, Artifact
 *   itemoverview:     Scarab, Essence, Oil, Incubator, UniqueWeapon, UniqueArmour,
 *                     UniqueAccessory, UniqueFlask, UniqueJewel, UniqueMap, Map,
 *                     BlightedMap, SkillGem, DivinationCard, Beast, ClusterJewel,
 *                     Invitation, AllflameEmber, Runegraft, Wombgift, DjinnCoin
 *
 * We fetch challenge league + Standard (Standard has older items like Astrolabes).
 */

import { getCurrentLeague } from './league';

const BASE = 'https://poe.ninja/api/data';

// currencyoverview: icon URLs are in currencyDetails[], not lines[]
const CURRENCY_TYPES = [
  'Currency',
  'Fragment',
  'Omen',        // Mirage/current leagues
  'Tattoo',      // Ancestors league onwards
  'Artifact',    // Scourge league
  'DeliriumOrb',
];

// itemoverview: icon URLs are in lines[].icon directly
const ITEM_TYPES = [
  'Scarab',
  'Essence',
  'Oil',
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
  'DivinationCard',
  'Beast',
  'ClusterJewel',
  'Invitation',
  'AllflameEmber',  // Settlers / Mirage
  'Runegraft',      // Settlers league
  'Wombgift',       // Mirage league
  'DjinnCoin',      // Mirage league — NOT currencyoverview, it's itemoverview
];

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

function pickGeneric(name: string): string | undefined {
  const n = norm(name);

  // Divination cards
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
  // Djinn coins (catch "coin of X" that might not have specific icons)
  if (GENERIC.djinn_coin && n.includes('coin')) return GENERIC.djinn_coin;
  // Wombgifts
  if (GENERIC.wombgift && n.includes('wombgift')) return GENERIC.wombgift;
  // Runegrafts
  if (GENERIC.runegraft && n.includes('runegraft')) return GENERIC.runegraft;
  // Allflame embers
  if (GENERIC.allflame && (n.includes('allflame') || n.includes('all-flame'))) return GENERIC.allflame;
  // Omens
  if (GENERIC.omen && n.includes('omen')) return GENERIC.omen;
  // Volatile / fog / refracting
  if (GENERIC.misc_orb) {
    if (n.includes('fog') || n.includes('mist') || n.includes('refracting') ||
        n.includes('vapour') || n.includes('volatile') || n.includes('tainted'))
      return GENERIC.misc_orb;
  }
  // Generic orb fallback
  if (GENERIC.chaos_orb && n.includes('orb')) return GENERIC.chaos_orb;
  // Fragments / keys / splinters
  if (GENERIC.fragment) {
    if (n.includes('key') || n.includes('splinter') || n.includes('relic') ||
        n.includes('emblem') || n.includes('fragment') || n.includes('vessel'))
      return GENERIC.fragment;
  }

  return undefined;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchCategory(
  endpoint: 'currencyoverview' | 'itemoverview',
  type: string,
  league: string
): Promise<[string, string][]> {
  try {
    const url = `${BASE}/${endpoint}?league=${encodeURIComponent(league)}&type=${type}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const pairs: [string, string][] = [];

    if (endpoint === 'currencyoverview') {
      // Icon URLs are in currencyDetails[], keyed by name
      const details: { name: string; icon: string }[] = data.currencyDetails ?? [];
      for (const d of details) {
        if (d.name && d.icon) pairs.push([d.name, d.icon]);
      }
    } else {
      // Icon URLs are directly in lines[].icon
      const lines: { name?: string; baseType?: string; icon?: string }[] = data.lines ?? [];
      for (const item of lines) {
        const name = item.name || item.baseType;
        if (name && item.icon) pairs.push([name, item.icon]);
      }
    }

    return pairs;
  } catch {
    return [];
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────
let exactMap:  Map<string, string> | null = null;
let normMap:   Map<string, string> | null = null;
let fetchProm: Promise<void>       | null = null;

async function buildCache(): Promise<void> {
  const exact      = new Map<string, string>();
  const normalized = new Map<string, string>();

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
    // Currency overview categories (parallel per league)
    const currRes = await Promise.allSettled(
      CURRENCY_TYPES.map((t) => fetchCategory('currencyoverview', t, league))
    );
    for (const r of currRes) {
      if (r.status === 'fulfilled') r.value.forEach(([k, v]) => add(k, v));
    }

    // Item overview categories (parallel per league)
    const itemRes = await Promise.allSettled(
      ITEM_TYPES.map((t) => fetchCategory('itemoverview', t, league))
    );
    for (const r of itemRes) {
      if (r.status === 'fulfilled') r.value.forEach(([k, v]) => add(k, v));
    }
  }

  // ── Seed category fallbacks ──────────────────────────────────────────────
  const seed = (candidates: string[], key: string) => {
    for (const c of candidates) {
      const url = exact.get(c) ?? normalized.get(norm(c));
      if (url) { GENERIC[key] = url; return; }
    }
  };

  seed(['The Gambler'], 'div_card');
  seed(['Bestiary Orb', 'Craicic Chimeral'], 'beast');
  seed(['Chaos Orb'], 'chaos_orb');
  seed(['Orb of Alchemy', 'Orb of Annulment'], 'misc_orb');
  seed(['Ritual Vessel', 'Voidborn Reliquary Key'], 'fragment');
  seed(['Abyss Scarab'], 'scarab');

  // League-specific fallbacks
  seed(['Coin of Skill', 'Coin of Power', 'Coin of Desecration'], 'djinn_coin');
  seed(['Wombgift of Gluttony', 'Wombgift'], 'wombgift');
  seed(['Runegraft of Enhancement', 'Runegraft'], 'runegraft');
  seed(['Allflame Ember of Gemlings', 'Allflame Ember'], 'allflame');
  seed(['Omen of Blanching', 'Omen of Warding'], 'omen');

  // Astrolabe: Standard has these; if missing, fall back to a map-adjacent icon
  seed(['Nameless Astrolabe', 'Grasping Astrolabe', 'Uncharted Realm Astrolabe'], 'astrolabe');
  if (!GENERIC.astrolabe) {
    GENERIC.astrolabe = GENERIC.misc_orb ?? GENERIC.chaos_orb ?? '';
  }

  // Gem fallback: any support gem icon
  const gemEntry = [...exact.entries()].find(([k]) =>
    k.toLowerCase().includes('support') || k.toLowerCase().includes('phantasmal')
  );
  if (gemEntry) GENERIC.gem = gemEntry[1];

  exactMap = exact;
  normMap  = normalized;

  console.log(
    `[Icons] Cache built: ${exact.size} items, leagues: ${leagues.join(' + ')}`
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
      const byNorm = normMap.get(norm(name));
      if (byNorm) return byNorm;

      // 3. Progressive prefix: "Breach Scarab of the Hive" → try "Breach Scarab" etc.
      const n = norm(name);
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

      // 5. Category keyword fallback
      return pickGeneric(name);
    },
  };
}

export function clearIconCache(): void {
  exactMap  = null;
  normMap   = null;
  fetchProm = null;
  for (const k in GENERIC) delete GENERIC[k];
}
