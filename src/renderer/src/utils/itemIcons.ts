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
 * Resolution order: exact name -> normalised -> WealthyExile decoration
 * strip (gem "- lvl/qual" suffix, "Variant, Item" comma forms; lookup-only)
 * -> word-boundary prefix -> map tier index -> name-keyword fallback ->
 * known-div-card -> blank.
 * (The old bidirectional containment sweep was REMOVED 2026-07-03: its
 * `k.startsWith(n)` arm let any uncached short name match an arbitrary longer
 * cached key — observed: Forbidden Flame/Flesh resolving to the Chaos Orb
 * icon. A wrong icon is worse than a blank; the prefix step and keyword
 * fallback cover the legitimate cases.)
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

import { getCurrentLeague, KNOWN_LEAGUES } from './league';

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
  'ImbuedGem',
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
  // Gems. Short common keywords are whole-worded (like the 'orb' fix below) so
  // a substring never mis-hits: bare 'gem' matched "gemcutters" (Gemcutter's
  // Prism -> gem icon). The '/\bgem\b/' boundary stops at the m|c seam.
  if (GENERIC.gem) {
    if (n.includes(' support') || n.includes('awakened') || n.includes('empower') ||
        n.includes('enhance') || n.includes('enlighten') || n.includes('vaal ') ||
        /\bgem\b/.test(n))
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
  if (GENERIC.djinn_coin && /\bcoin\b/.test(n)) return GENERIC.djinn_coin;
  // Wombgifts
  if (GENERIC.wombgift && n.includes('wombgift')) return GENERIC.wombgift;
  // Runegrafts
  if (GENERIC.runegraft && n.includes('runegraft')) return GENERIC.runegraft;
  // Allflame embers
  if (GENERIC.allflame && (n.includes('allflame') || n.includes('all-flame'))) return GENERIC.allflame;
  // Omens
  if (GENERIC.omen && /\bomen\b/.test(n)) return GENERIC.omen;
  // Maps: tierless "... Map" names that missed the resolve-step tier probes
  // land on the deliberately-seeded generic (highest-tier art); "map tier N"
  // shapes that missed the tier index land here too.
  if (GENERIC.map && (n.endsWith('map') || /(?:^|\s)map tier \d+$/.test(n))) return GENERIC.map;
  // Volatile / fog / refracting
  if (GENERIC.misc_orb) {
    if (/\bfog\b/.test(n) || /\bmist\b/.test(n) || n.includes('refracting') ||
        n.includes('vapour') || n.includes('volatile') || n.includes('tainted'))
      return GENERIC.misc_orb;
  }
  // Fragments / keys / splinters
  if (GENERIC.fragment) {
    if (/\bkey\b/.test(n) || n.includes('splinter') || /\brelic\b/.test(n) ||
        n.includes('emblem') || n.includes('fragment') || n.includes('vessel'))
      return GENERIC.fragment;
  }
  // NOTE (session 17): the old last-resort `/\borb\b/ -> chaos_orb` fallback
  // was REMOVED. Every real currency orb resolves exactly from the Currency
  // category, so the rule only ever fired on orbs poe.ninja does NOT price
  // (confirmed live: "Imprinted Bestiary Orb" rendered as a Chaos Orb) — the
  // wrong-icon-worse-than-blank class again. GENERIC.chaos_orb stays seeded
  // (astrolabe last-resort chains to it) but is no longer a name fallback.

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
// Tier -> MapNumbersN-style icon, built from every cached "... Map (Tier N)"
// key (session 17 map audit). Plain "Map (Tier N)" keys win over prefixed
// ones (Blighted/conqueror), but ANY tier-N map key supplies correct
// tier-band art on a miss.
let mapTierIcons: Map<number, string> = new Map();

async function buildCache(): Promise<void> {
  const exact      = new Map<string, string>();
  const normalized = new Map<string, string>();
  divCardSet.clear();

  const keyLeague = new Map<string, number>(); // norm key -> league fetch index (0 = challenge)
  let leagueIdx = 0;
  const add = (name: string, url: string) => {
    // FIRST-write-wins (session 17): the challenge league is fetched first,
    // so current-league art wins and later leagues only fill gaps. The old
    // last-write behaviour let STANDARD (fetched last) overwrite keys like
    // "Map (Tier 14)" with older-era art (wrong tier colours; live-observed).
    // NOTE: generic Roman-numeral MapNumbersN art is the CURRENT system —
    // per-name map art is the old one. The failure was wrong-COLOUR/era art
    // from Standard, not roman numerals per se.
    if (!exact.has(name)) exact.set(name, url);
    const nn = norm(name);
    if (!normalized.has(nn)) { normalized.set(nn, url); keyLeague.set(nn, leagueIdx); }
  };

  // Detect current challenge league, then also pull every KNOWN_LEAGUES entry
  // BELOW it (during events the parent league — e.g. Mirage under Ancestors —
  // has far better economy coverage than the thin event economy), plus
  // Standard for legacy items. KNOWN_LEAGUES-driven, deduped. `add` is
  // FIRST-write-wins, so this fetch order IS the art-priority order.
  const challenge = await getCurrentLeague();
  const knownIdx = KNOWN_LEAGUES.indexOf(challenge);
  const parents = knownIdx >= 0 ? KNOWN_LEAGUES.slice(knownIdx + 1) : [];
  const leagues = challenge === 'Standard'
    ? ['Standard']
    : Array.from(new Set([challenge, ...parents, 'Standard']));

  for (let li = 0; li < leagues.length; li++) {
    const league = leagues[li];
    leagueIdx = li;
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
  // Map tier art index (session 17 map audit): poe.ninja names maps per-tier
  // ("Baran Map (Tier 16)", "Blighted Map (Tier 14)"), but WealthyExile loot
  // rows can be tierless ("Baran Map") or reference a tier ninja doesn't
  // currently trade — both used to fall to an ORDER-ARBITRARY generic (the
  // API's first "...Map" line; live-observed as Al-Hezmin Vaal Temple art).
  // Index every tiered map key so misses resolve to the right tier band.
  // Source rank per tier (live-verified 2026-07-09), LEAGUE-MAJOR so a
  // current-league source of any type beats a later league's: within a
  // league, conqueror-prefixed art is clean; PLAIN "Map (Tier N)" line art
  // is whatever variant traded (delirium/originator composites observed);
  // blighted carries fungus. rank = leagueIdx*10 + (prefixed 0 | plain 1 |
  // blighted 2) — a challenge-league blighted line (2) must still beat a
  // Standard legacy plain line (21), or Roman-numeral art returns via the index.
  mapTierIcons = new Map();
  const tierRank = new Map<number, number>();
  for (const [key, url] of normalized) {
    const m = /(?:^|\s)map tier (\d+)$/.exec(key);
    if (!m) continue;
    const tier = parseInt(m[1], 10);
    const typeRank = key === `map tier ${tier}` ? 1 : key.startsWith('blighted ') ? 2 : 0;
    const rank = (keyLeague.get(key) ?? 9) * 10 + typeRank;
    if (!mapTierIcons.has(tier) || rank < (tierRank.get(tier) ?? Infinity)) {
      mapTierIcons.set(tier, url);
      tierRank.set(tier, rank);
    }
  }

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
  seedBy('omen',      (n) => /\bomen\b/.test(n));
  seedBy('djinn_coin',(n) => /\bcoin\b/.test(n));
  seedBy('oil',       (n) => n.endsWith(' oil'));
  seedBy('temple',    (n) => n.endsWith('temple'));
  // GENERIC.map: DELIBERATE seed (session 17) — highest indexed tier's art,
  // NOT "first name ending in 'map'" (API-order roulette; live-observed
  // landing on the Al-Hezmin Vaal Temple icon). endsWith seeding is only the
  // last resort if no tiered key exists at all.
  if (!GENERIC.map && mapTierIcons.size > 0) {
    const top = Math.max(...mapTierIcons.keys());
    GENERIC.map = mapTierIcons.get(top)!;
  }
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

      const n = norm(name);

      // 0. Plain "Map (Tier N)" BYPASSES exact-match art (session 17): the
      // ninja line under that exact key carries whatever variant happened to
      // trade (delirium/originator composites and, pre-first-write, legacy
      // Standard art — both live-observed). The ranked tier index is the
      // deliberate source; exact match only serves it if the index can't.
      const plainM = /^map tier (\d+)$/.exec(n);
      if (plainM) {
        const url = mapTierIcons.get(parseInt(plainM[1], 10));
        if (url) return url;
      }

      // 1. Exact name match
      const exact = exactMap.get(name);
      if (exact) return exact;

      // 2. Normalised exact (diacritics, apostrophes stripped)
      const byNorm = normMap.get(n);
      if (byNorm) return byNorm;

      // 2b. WealthyExile decorations (session 17; shapes verified from the
      // fixture CSVs). Lookup-only retries — exact/norm equality on the
      // stripped base, never fuzzy matching, so no wrong-icon risk:
      //  - gems export as "<Gem> - <lvl>/<qual>[ corrupted]" ("Precision -
      //    21/20 corrupted"); retry the base, and since the shape itself is
      //    gem-certain, an unpriced base honestly falls to the generic gem;
      //  - variant-first uniques export as "<Variant>, <Item>" ("Focal
      //    Point, Forbidden Flame"); retry comma segments, item-name-last.
      if (/ - \d+\/\d+/.test(name)) {
        const base = name.split(' - ')[0].trim();
        const hit = exactMap.get(base) ?? normMap.get(norm(base));
        if (hit) return hit;
        if (GENERIC.gem) return GENERIC.gem;
      }
      if (name.includes(',')) {
        for (const seg of name.split(',').reverse()) {
          const s = seg.trim();
          if (s.split(' ').length < 2) continue; // single words are too generic
          const hit = exactMap.get(s) ?? normMap.get(norm(s));
          if (hit) return hit;
        }
      }

      // 3. Progressive prefix: "Breach Scarab of the Hive" → try "Breach Scarab" etc.
      // Word-boundary only — this is the ONLY partial matching we do. The old
      // step-4 containment sweep (n.startsWith(k) || k.startsWith(n) over the
      // whole map) is gone: it assigned WRONG icons to uncached items
      // (Forbidden Flame -> Chaos Orb), and a wrong icon is worse than a blank.
      const words = n.split(' ');
      for (let len = words.length - 1; len >= 2; len--) {
        const prefix = words.slice(0, len).join(' ');
        const url = normMap.get(prefix);
        if (url) return url;
      }

      // 3b. Map names (session 17 audit; WealthyExile name shapes verified
      // from the fixture CSVs, poe.ninja keys via scripts/dump-map-icons.mjs):
      //  - tierless "<Conqueror/Guardian> Map" rows probe the tiered keys
      //    ("baran map" -> "baran map tier 16") — the item's REAL icon;
      //  - "(Blighted) Map (Tier N)" rows ninja doesn't currently trade fall
      //    to the indexed tier art, so a T14 never wears white T4 art again.
      if (n.endsWith(' map')) {
        for (const t of [16, 15, 14]) {
          const url = normMap.get(`${n} tier ${t}`);
          if (url) return url;
        }
      }
      const tierM = /(?:^|\s)map tier (\d+)$/.exec(n);
      if (tierM) {
        const url = mapTierIcons.get(parseInt(tierM[1], 10));
        if (url) return url;
      }

      // 4. Name-keyword fallback
      const byKeyword = pickGeneric(name);
      if (byKeyword) return byKeyword;

      // 5. Known divination card (poe.ninja's own card list) -> generic card icon
      if (divCardSet.has(n)) return GENERIC.div_card;

      return undefined;
    },
  };
}

export function clearIconCache(): void {
  exactMap  = null;
  normMap   = null;
  fetchProm = null;
  mapTierIcons = new Map();
  divCardSet.clear();
  for (const k in GENERIC) delete GENERIC[k];
}

// ── WP6.2: UI-value -> real item name helpers ───────────────────────────────
// The store keeps SHORT values for chisels/deli orbs ("Avarice", "Diviner");
// the resolver needs the actual in-game item names. These mappings are the
// single place that knowledge lives.

/** "Cartographer" -> "Cartographer's Chisel"; others -> "Maven's Chisel of X". */
export function chiselItemName(chiselType: string | null | undefined): string | null {
  if (!chiselType) return null;
  if (chiselType === 'Cartographer') return "Cartographer's Chisel";
  return `Maven's Chisel of ${chiselType}`;
}

/** Store value ("Diviner") -> item name ("Diviner's Delirium Orb").
 *  Possessive forms follow the real item names, which DELIRIUM_ORB_LIST's
 *  labels already encode — but this helper is standalone so it can be used
 *  where only the raw value is available. */
const POSSESSIVE_DELI_ORBS = new Set(['Armoursmith', 'Blacksmith', 'Cartographer', 'Diviner', 'Jeweller', 'Thaumaturge']);
export function deliOrbItemName(orbValue: string | null | undefined): string | null {
  if (!orbValue) return null;
  if (orbValue.endsWith("'s") || / Delirium Orb$/i.test(orbValue)) {
    return / Delirium Orb$/i.test(orbValue) ? orbValue : `${orbValue} Delirium Orb`;
  }
  const base = POSSESSIVE_DELI_ORBS.has(orbValue) ? `${orbValue}'s` : orbValue;
  return `${base} Delirium Orb`;
}
