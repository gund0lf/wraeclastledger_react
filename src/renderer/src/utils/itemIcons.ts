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
 * strip (gem "- lvl/qual", unique "6L", "Variant, Item" comma forms; lookup-only)
 * -> word-boundary prefix -> map tier index -> name-keyword fallback ->
 * blank. Known div-card identity is checked before keyword fallback so a card
 * whose name contains "relic" cannot be painted as a fragment.
 * (The old bidirectional containment sweep was REMOVED 2026-07-03: its
 * `k.startsWith(n)` arm let any uncached short name match an arbitrary longer
 * cached key — observed: Forbidden Flame/Flesh resolving to the Chaos Orb
 * icon. A wrong icon is worse than a blank; the prefix step and keyword
 * fallback cover the legitimate cases.)
 *
 * Divination cards are a special case: poe.ninja serves no per-card inventory
 * icons, and card names have no shared keyword (e.g. "Darker Half"). The
 * exchange DivinationCard items[] still carries the true display names even
 * when image is null, so those names identify cards; lines[] slugs are retained
 * only as a compatibility fallback. Every recognized card maps to the normal
 * shared div-card inventory icon. Auto-updates each league; no hardcoded list.
 *
 * We fetch the current challenge league + Standard (Standard has older items).
 */

import { getCurrentLeague, KNOWN_LEAGUES } from './league';
import type { LootCategory } from '../types';
import { BUNDLED_CHART_NAMES } from '../../../shared/manualLoot';

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
  'Ducat',
  'EnshroudingCrystal',
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
  'BlightRavagedMap',
  'ValdoMap',
  'SkillGem',
  'ImbuedGem',
  'Beast',
  'ClusterJewel',
  'Invitation',
  'BaseType',
  'Flask',
  'Vial',
  'UniqueRelic',
  'UniqueTincture',
  'IncursionTemple',
  'Wombgift',
];

// Exact source-family -> public loot taxonomy. This is the same catalog pass
// used for artwork; the WealthyExile Tab column is never consulted because it
// is only the tracked stash tab name. Families without an honest destination
// in the bounded public taxonomy intentionally remain unclassified.
const ECONOMY_TYPE_CATEGORY: Readonly<Partial<Record<string, LootCategory>>> = {
  Currency: 'Currency',
  Fragment: 'Fragments',
  Omen: 'League',
  Tattoo: 'League',
  Artifact: 'League',
  DeliriumOrb: 'Deliriums',
  Scarab: 'Scarabs',
  Essence: 'Essences',
  Oil: 'Oils',
  DivinationCard: 'Divination Cards',
  DjinnCoin: 'League',
  Ducat: 'League',
  EnshroudingCrystal: 'League',
  AllflameEmber: 'League',
  Runegraft: 'League',
  Resonator: 'League',
  Fossil: 'League',
  Astrolabe: 'League',
  Incubator: 'Incubators',
  UniqueWeapon: 'Unique Weapons',
  UniqueArmour: 'Unique Armours',
  UniqueAccessory: 'Unique Accessories',
  UniqueFlask: 'Unique Flasks',
  UniqueJewel: 'Unique Jewels',
  UniqueMap: 'Maps',
  Map: 'Maps',
  BlightedMap: 'Maps',
  BlightRavagedMap: 'Maps',
  ValdoMap: 'Maps',
  SkillGem: 'Gems',
  ImbuedGem: 'Gems',
  Beast: 'Beasts',
  Invitation: 'Fragments',
  Vial: 'Fragments',
  UniqueRelic: 'Fragments',
  UniqueTincture: 'League',
  IncursionTemple: 'League',
  Wombgift: 'League',
};

// Normal shared divination-card inventory art (all cards use this same icon).
// Used once a name matches the known card list; if it ever 404s the UI falls
// back to its neutral category glyph.
const GENERIC_DIV_CARD = 'https://web.poecdn.com/image/Art/2DItems/Divination/InventoryIcon.png';

// Official PoE CDN art for an unapproved Heist Blueprint. poe.ninja does not
// expose Blueprints in its economy catalogues, so a Blueprint-labelled miss
// uses this one bounded generic identity instead of a Wiki/runtime dependency.
export const GENERIC_BLUEPRINT = 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvSGVpc3QvQmx1ZXByaW50Tm90QXBwcm92ZWQ3IiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/bafd718e24/BlueprintNotApproved7.png';

// Reviewed current Chart inventory art from the official PoE CDN. Special
// location Charts share the bounded generic torn-chart art; the three normal
// bases retain their exact artwork.
export const CHART_ART = Object.freeze({
  generic: 'https://web.poecdn.com/image/Art/2DItems/Currency/Deepwater/DeepwaterTornMap1.png',
  'Sandy Seabed Chart': 'https://web.poecdn.com/image/Art/2DItems/Currency/Deepwater/DeepwaterTornMap1.png',
  'Coral Forest Chart': 'https://web.poecdn.com/image/Art/2DItems/Currency/Deepwater/DeepwaterTornMap2.png',
  'Coral Reef Chart': 'https://web.poecdn.com/image/Art/2DItems/Currency/Deepwater/DeepwaterTornMap3.png',
});

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

export type PoeIconDescriptor = Record<string, unknown> & { f?: string };

/** Decode the JSON descriptor embedded in a web.poecdn /gen/image/ URL. */
export function decodeIconDescriptor(url: string): PoeIconDescriptor | null {
  const encoded = /\/gen\/image\/([^/]+)\//.exec(url)?.[1];
  if (!encoded) return null;
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as unknown;
    if (!Array.isArray(payload) || typeof payload[2] !== 'object' || payload[2] === null) return null;
    return payload[2] as PoeIconDescriptor;
  } catch {
    return null;
  }
}

function isCleanTierMapIcon(url: string, tier: number): boolean {
  const descriptor = decodeIconDescriptor(url);
  if (descriptor?.f !== `2DItems/Maps/Atlas2Maps/New/MapNumbers${tier}`) return false;
  const baseKeys = new Set(['f', 'w', 'h', 'scale', 'mn', 'mt']);
  // Allflame's current generic MapNumbers art carries exactly `mm:true`. It is
  // still the neutral tier identity Sad supplied, unlike mb/mc/me/md variant
  // overlays. Keep the allowance exact so future flags fail closed.
  return Object.keys(descriptor).every((key) => (
    baseKeys.has(key) || (key === 'mm' && descriptor.mm === true)
  ));
}

// ─── Category fallbacks seeded after main fetch ───────────────────────────────
const GENERIC: Record<string, string> = {};
// Normalised names of every divination card poe.ninja lists (display names,
// with reconstructed slugs retained only as a compatibility fallback).
const divCardSet = new Set<string>();

// Deliberate collective labels for manually summed loot. These aliases only
// reuse an already-reviewed category representative; they never choose an
// arbitrary exact item by fuzzy matching. Ambiguous buckets such as Currency,
// Fragments, Scarabs, or Uniques intentionally keep the neutral category glyph.
const GENERIC_COLLECTION_KEYS: Readonly<Record<string, string>> = {
  talisman: 'talisman',
  talismans: 'talisman',
  'divination cards': 'div_card',
  beasts: 'beast',
  maps: 'map',
  gems: 'gem',
  astrolabes: 'astrolabe',
};

function pickGeneric(name: string): string | undefined {
  const n = norm(name);

  // WealthyExile decorates Blueprints as "Blueprint: Bunker - 1/3". The
  // explicit whole-word identity is trustworthy even though the numeric
  // suffix alone is not (it is also used for gems).
  if (/\bblueprints?\b/.test(n)) return GENERIC_BLUEPRINT;

  // Manual authors historically used both "Chart"/"Charts" and labels such
  // as "Charts 44". The leading whole-word class is unambiguous even when the
  // exact Deepwater location was not recorded.
  if (/^charts?\b/.test(n)) return CHART_ART.generic;

  const collectionKey = GENERIC_COLLECTION_KEYS[n];
  if (collectionKey && GENERIC[collectionKey]) return GENERIC[collectionKey];

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
  // Scarabs deliberately have no specific-item fallback. Known scarab slots
  // and loot rows provide the neutral category glyph; substituting whichever
  // scarab happened to seed this cache would still assert the wrong identity.
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
  // Fragment-like names deliberately have no specific-item fallback. An
  // arbitrary Ritual Vessel image is not an honest icon for a missing key,
  // relic, emblem or splinter; category-aware UI supplies a neutral glyph.
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
): Promise<{ pairs: [string, string][]; slugs: string[]; names: string[] }> {
  try {
    if (typeof window === 'undefined' || !window.api?.fetchEconomyIcons) return { pairs: [], slugs: [], names: [] };
    const res = await window.api.fetchEconomyIcons(family, league, type);
    const pairs = (res?.icons ?? []).map((i) => [i.name, i.icon] as [string, string]);
    return { pairs, slugs: res?.slugs ?? [], names: res?.names ?? [] };
  } catch {
    return { pairs: [], slugs: [], names: [] };
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────
let exactMap:  Map<string, string> | null = null;
let normMap:   Map<string, string> | null = null;
let identityMap: Map<string, ItemIdentity> | null = null;
let fetchProm: Promise<void>       | null = null;
let cacheLeague: string | null = null;
// Tier -> signed, fully rendered MapNumbersN art whose descriptor has no
// variant flags. Raw descriptor `f` files contain only the tier numeral, not
// the map frame, so they must never be substituted for a generated image.
let mapTierIcons: Map<number, string> = new Map();

export interface ItemIdentity {
  name: string;
  category: LootCategory;
}

function withinOneEdit(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left === right) return true;
  if (left.length === right.length) {
    let differences = 0;
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i] && ++differences > 1) return false;
    }
    return true;
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex++;
      longIndex++;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex++;
  }
  return true;
}

const MANUAL_TYPE_SUFFIX = /\s+(?:gloves?|mitts?|gauntlets?|boots?|helmet|helm|body armour|armour|weapon|ring|amulet|belt|jewel|flask|map|card)$/;

async function buildCache(challenge: string): Promise<void> {
  const exact      = new Map<string, string>();
  const normalized = new Map<string, string>();
  const identities = new Map<string, ItemIdentity>();
  const identityConflicts = new Set<string>();
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
  const addIdentity = (name: string, category: LootCategory | undefined) => {
    if (!category) return;
    const key = norm(name);
    if (!key || identityConflicts.has(key)) return;
    const existing = identities.get(key);
    if (existing && existing.category !== category) {
      identities.delete(key);
      identityConflicts.add(key);
      return;
    }
    if (!existing) identities.set(key, { name, category });
  };

  // Detect current challenge league, then also pull every KNOWN_LEAGUES entry
  // BELOW it (during events the parent league — e.g. Mirage under Ancestors —
  // has far better economy coverage than the thin event economy), plus
  // Standard for legacy items. KNOWN_LEAGUES-driven, deduped. `add` is
  // FIRST-write-wins, so this fetch order IS the art-priority order.
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
      const type = EXCHANGE_TYPES[i];
      const category = ECONOMY_TYPE_CATEGORY[type];
      r.value.pairs.forEach(([k, v]) => {
        add(k, v);
        addIdentity(k, category);
      });
      for (const name of r.value.names) addIdentity(name, category);
      // Actual items[] display names are authoritative. Slug reconstruction is
      // only a fallback: live example `the-reflection-of-the-heart` has display
      // name `Reflection of the Heart` (the extra article must not be invented).
      if (type === 'DivinationCard') {
        for (const name of r.value.names) divCardSet.add(norm(name));
        for (const slug of r.value.slugs) divCardSet.add(slug.replace(/-/g, ' '));
      }
    });

    // stash-family categories (parallel per league)
    const stashRes = await Promise.allSettled(
      STASH_TYPES.map((t) => fetchCategory('stash', t, league))
    );
    stashRes.forEach((r, i) => {
      if (r.status === 'fulfilled') r.value.pairs.forEach(([k, v]) => {
        add(k, v);
        addIdentity(k, ECONOMY_TYPE_CATEGORY[STASH_TYPES[i]]);
      });
    });
  }

  for (const chart of BUNDLED_CHART_NAMES) {
    const chartUrl = CHART_ART[chart as keyof typeof CHART_ART] ?? CHART_ART.generic;
    add(chart, chartUrl);
    addIdentity(chart, 'League');
  }
  for (const collective of ['Chart', 'Charts']) {
    add(collective, CHART_ART.generic);
    addIdentity(collective, 'League');
  }

  // ── Seed category fallbacks ──────────────────────────────────────────────
  // Keyword seeding: the first cached item matching the predicate sets the icon.
  // Robust to league-specific naming since it only needs ONE item of the type.
  // Map tier art index (session 17 map audit): poe.ninja names maps per-tier
  // ("Baran Map (Tier 16)", "Blighted Map (Tier 14)"), but WealthyExile loot
  // rows can be tierless ("Baran Map") or reference a tier ninja doesn't
  // currently trade — both used to fall to an ORDER-ARBITRARY generic (the
  // API's first "...Map" line; live-observed as Al-Hezmin Vaal Temple art).
  // Generated icon URLs embed a base64 JSON descriptor. Keep only signed
  // MapNumbersN images without identity-changing variant flags for plain tier
  // rows; the current Allflame generic `mm:true` composite is explicitly
  // allowlisted, while mb/mc/me/md entries remain variant overlays. If no signed image is
  // available, the UI's neutral map glyph is more honest than either a false
  // overlay or the raw `f` asset (which is only a naked Roman numeral).
  mapTierIcons = new Map();
  const tierRank = new Map<number, number>();
  for (const [key, url] of normalized) {
    const m = /(?:^|\s)map tier (\d+)$/.exec(key);
    if (!m) continue;
    const tier = parseInt(m[1], 10);
    if (!isCleanTierMapIcon(url, tier)) continue;
    const rank = keyLeague.get(key) ?? 9;
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
  // GENERIC.map: DELIBERATE seed (session 17) — highest clean indexed tier's art,
  // NOT "first name ending in 'map'" (API-order roulette; live-observed
  // landing on the Al-Hezmin Vaal Temple icon). If no clean signed tier exists,
  // leave this unset so category-aware UI shows the neutral map glyph.
  if (!GENERIC.map && mapTierIcons.size > 0) {
    const top = Math.max(...mapTierIcons.keys());
    GENERIC.map = mapTierIcons.get(top)!;
  }
  seedBy('astrolabe', (n) => n.includes('astrolabe'));

  // Specific-name seeds where a keyword would be ambiguous
  const seed = (candidates: string[], key: string) => {
    if (GENERIC[key]) return;
    for (const c of candidates) {
      const url = exact.get(c) ?? normalized.get(norm(c));
      if (url) { GENERIC[key] = url; return; }
    }
  };
  seed([
    'Craicic Croaker', 'Wild Hellion Alpha', 'Craicic Chimeral',
    'Saqawal, First of the Sky', 'Farrul, First of the Plains',
  ], 'beast');
  seed(['Croaker Talisman', 'Great Maw Talisman'], 'talisman');
  seed(['Chaos Orb'], 'chaos_orb');
  seed(['Orb of Alchemy', 'Orb of Annulment', 'Orb of Scouring'], 'misc_orb');

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
  identityMap = identities;

  console.log(
    `[Icons] Cache built: ${exact.size} items, ${identities.size} identities, ${divCardSet.size} div cards, leagues: ${leagues.join(' + ')}`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function getItemIcons(): Promise<{
  resolve: (name: string) => string | undefined;
  resolveIdentity: (name: string) => ItemIdentity | undefined;
  resolveCategory: (name: string) => LootCategory | undefined;
  suggestName: (name: string) => ItemIdentity | undefined;
}> {
  const league = await getCurrentLeague();
  if (!exactMap || cacheLeague !== league) {
    if (!fetchProm) {
      fetchProm = buildCache(league)
        .then(() => { cacheLeague = league; })
        .finally(() => { fetchProm = null; });
    }
    await fetchProm;
    // If the override changed again while a build was in flight, immediately
    // rebuild for the latest context rather than exposing the intermediate one.
    if (cacheLeague !== league) return getItemIcons();
  }

  const resolveIdentity = (name: string): ItemIdentity | undefined => {
    if (!identityMap) return undefined;
    const direct = identityMap.get(norm(name));
    if (direct) return direct;

    if (/ - \d+\/\d+/.test(name)) {
      const base = name.split(' - ')[0].trim();
      const hit = identityMap.get(norm(base));
      if (hit) return hit;
    }
    const linkedBase = name.replace(/\s+\d+L$/i, '').trim();
    if (linkedBase !== name) {
      const hit = identityMap.get(norm(linkedBase));
      if (hit) return hit;
    }
    if (name.includes(',')) {
      for (const segment of name.split(',').reverse()) {
        const candidate = segment.trim();
        if (candidate.split(' ').length < 2) continue;
        const hit = identityMap.get(norm(candidate));
        if (hit) return hit;
      }
    }
    return undefined;
  };

  return {
    resolve(name: string): string | undefined {
      if (!exactMap || !normMap) return undefined;

      const n = norm(name);

      // 0. Plain "Map (Tier N)" bypasses exact art because it may carry
      // identity-changing overlays. Return only a signed tier image accepted
      // by the explicit descriptor allowlist; a miss
      // intentionally reaches the Dashboard's neutral map glyph.
      const plainM = /^map tier (\d+)$/.exec(n);
      if (plainM) {
        return mapTierIcons.get(parseInt(plainM[1], 10));
      }
      const blightedM = /^blighted map tier (\d+)$/.exec(n);

      // 1. Exact name match
      const exact = exactMap.get(name);
      if (exact) return exact;

      // 2. Normalised exact (diacritics, apostrophes stripped)
      const byNorm = normMap.get(n);
      if (byNorm) return byNorm;

      // Do not silently turn an untraded Blighted tier into a normal map. A
      // live exact URL above keeps its fungus marker; otherwise use the glyph.
      if (blightedM) return undefined;

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
        // WealthyExile also uses "- 1/3" for Blueprints. The suffix alone is
        // not gem-certain; require an independently gem-shaped base.
        const bn = norm(base);
        if (GENERIC.gem && (bn.includes(' support') || bn.startsWith('awakened ') ||
            bn.startsWith('vaal ') || /\bgem\b/.test(bn))) return GENERIC.gem;
      }
      const linkedBase = name.replace(/\s+\d+L$/i, '').trim();
      if (linkedBase !== name) {
        const hit = exactMap.get(linkedBase) ?? normMap.get(norm(linkedBase));
        if (hit) return hit;
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
      //  - plain "Map (Tier N)" rows were already handled at step 0; missing
      //    clean or Blighted tier art intentionally stays missing so the UI
      //    can show an honest neutral map glyph.
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

      // 4. Known divination card -> shared card inventory art. This MUST precede the
      // keyword fallback: valid cards such as Time-Lost Relic contain words
      // that otherwise resemble fragment names.
      if (divCardSet.has(n)) return GENERIC.div_card;

      // 5. Name-keyword fallback
      const byKeyword = pickGeneric(name);
      if (byKeyword) return byKeyword;

      return undefined;
    },
    resolveIdentity,
    resolveCategory(name: string): LootCategory | undefined {
      return resolveIdentity(name)?.category;
    },
    suggestName(name: string): ItemIdentity | undefined {
      if (!identityMap) return undefined;
      const raw = norm(name);
      if (raw.length < 4 || identityMap.has(raw)) return undefined;
      const candidateName = raw.replace(MANUAL_TYPE_SUFFIX, '');
      if (candidateName.length < 4) return undefined;

      let match: ItemIdentity | undefined;
      for (const [knownName, identity] of identityMap) {
        if (Math.abs(knownName.length - candidateName.length) > 1) continue;
        if (!withinOneEdit(candidateName, knownName)) continue;
        if (match && norm(match.name) !== knownName) return undefined;
        match = identity;
      }
      return match;
    },
  };
}

export function clearIconCache(): void {
  exactMap  = null;
  normMap   = null;
  identityMap = null;
  fetchProm = null;
  cacheLeague = null;
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
