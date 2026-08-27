/**
 * Exact live Trade-stat labels that distinguish special map families from
 * ordinary maps. The conversion pseudos are the stable visible signature of
 * Valdo maps; their live ids are still resolved by exact text like the three
 * influence implicits so vocabulary drift fails closed instead of silently
 * broadening a search.
 */
export const SPECIAL_MAP_STAT_TEXT = {
  originator: "Area is Influenced by the Originator's Memories",
  shaperInfluence: 'Area is influenced by The Shaper',
  elderInfluence: 'Area is influenced by The Elder',
  shaperConversion: '#% chance for dropped Maps to convert to Shaper Maps',
  elderConversion: '#% chance for dropped Maps to convert to Elder Maps',
  conquerorConversion: '#% chance for dropped Maps to convert to Conqueror Maps',
  uniqueConversion: '#% chance for dropped Maps to convert to Unique Maps',
  scarabConversion: '#% chance for dropped Maps to convert to Scarabs',
  mavenInvitationConversion: '#% chance for dropped Maps to convert to Maven Invitations',
  atlasMemoryConversion: '#% chance for dropped Maps to convert to Atlas Memories',
} as const;

export type SpecialMapStatKey = keyof typeof SPECIAL_MAP_STAT_TEXT;

export interface SpecialMapTradeStatEntry {
  id: string;
  text: string;
}

export const ORDINARY_MAP_EXCLUDED_SPECIAL_STATS: readonly SpecialMapStatKey[] = [
  'originator',
  'shaperInfluence',
  'elderInfluence',
  'shaperConversion',
  'elderConversion',
  'conquerorConversion',
  'uniqueConversion',
  'scarabConversion',
  'mavenInvitationConversion',
  'atlasMemoryConversion',
];

const normalizeTradeStatText = (text: string): string =>
  text.replace(/\[[^|\]]+\|([^\]]+)\]/g, '$1').toLocaleLowerCase('en-US');

/**
 * Resolve special-map stats by exact normalized Trade text. Each contract
 * must match exactly once; missing or ambiguous definitions stay unavailable
 * so callers can fail closed visibly.
 */
export function resolveSpecialMapTradeStats(
  entries: readonly SpecialMapTradeStatEntry[],
): {
  resolved: Map<SpecialMapStatKey, string>;
  unavailable: { key: SpecialMapStatKey; actualCount: number }[];
} {
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    normalizedText: normalizeTradeStatText(entry.text),
  }));
  const resolved = new Map<SpecialMapStatKey, string>();
  const unavailable: { key: SpecialMapStatKey; actualCount: number }[] = [];

  for (const [key, text] of Object.entries(SPECIAL_MAP_STAT_TEXT) as
    [SpecialMapStatKey, string][]) {
    const expectedText = normalizeTradeStatText(text);
    const matches = normalizedEntries.filter((entry) => entry.normalizedText === expectedText);
    if (matches.length === 1) resolved.set(key, matches[0].id);
    else unavailable.push({ key, actualCount: matches.length });
  }

  return { resolved, unavailable };
}

export function resolveOrdinaryMapSpecialStatIds(
  resolvedStats: ReadonlyMap<string, string>,
): {
  ids: string[];
  missing: SpecialMapStatKey[];
} {
  const ids: string[] = [];
  const missing: SpecialMapStatKey[] = [];
  for (const key of ORDINARY_MAP_EXCLUDED_SPECIAL_STATS) {
    const id = resolvedStats.get(key);
    if (id) ids.push(id);
    else missing.push(key);
  }
  return { ids: [...new Set(ids)], missing };
}

export function usesOrdinaryMapSpecialExclusions(mapType: string): boolean {
  return mapType === 'regular' || mapType === '8mod';
}

export type DeliriumTradeStatFilter = {
  type: 'and' | 'not';
  filters: { id: string; value?: { min: number; max: number } }[];
};

export type DeliriumRewardTradeStatFilter = {
  type: 'count';
  value: { min: 1 };
  filters: { id: string }[];
};

/**
 * Delirium is a state selector, not a minimum slider: -1 omits the filter,
 * 0 excludes every delirious map, and a positive supported tier is exact.
 */
export function buildDeliriumTradeStatFilter(
  statId: string | undefined,
  deliriousPercent: number,
): DeliriumTradeStatFilter | null {
  if (deliriousPercent < 0) return null;
  if (!statId) throw new Error('Delirium Trade stat is unavailable');
  if (deliriousPercent === 0) {
    return { type: 'not', filters: [{ id: statId }] };
  }
  return {
    type: 'and',
    filters: [{ id: statId, value: { min: deliriousPercent, max: deliriousPercent } }],
  };
}

/** Match at least one selected Delirium reward type. */
export function buildDeliriumRewardTradeStatFilter(
  statIds: readonly (string | undefined)[],
): DeliriumRewardTradeStatFilter | null {
  const uniqueIds = [...new Set(statIds.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return null;
  return {
    type: 'count',
    value: { min: 1 },
    filters: uniqueIds.map((id) => ({ id })),
  };
}

export function tradeItemTypeForMapType(mapType: string): string | undefined {
  return mapType === 'nightmare' ? 'Nightmare Map' : undefined;
}
