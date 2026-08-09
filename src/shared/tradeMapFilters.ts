/**
 * Exact live Trade-stat labels for special map implicits.
 *
 * The 8-mod search represents ordinary maps, so it excludes all three. Keep
 * the labels centralized: main resolves the live stat ids, while tests pin the
 * intended policy without hardcoding ids that GGG may change.
 */
export const SPECIAL_MAP_STAT_TEXT = {
  originator: "Area is Influenced by the Originator's Memories",
  shaperInfluence: 'Area is influenced by The Shaper',
  elderInfluence: 'Area is influenced by The Elder',
} as const;

export type SpecialMapStatKey = keyof typeof SPECIAL_MAP_STAT_TEXT;

export interface SpecialMapTradeStatEntry {
  id: string;
  text: string;
}

export const EIGHT_MOD_EXCLUDED_SPECIAL_STATS: readonly SpecialMapStatKey[] = [
  'originator',
  'shaperInfluence',
  'elderInfluence',
];

const normalizeTradeStatText = (text: string): string =>
  text.replace(/\[[^|\]]+\|([^\]]+)\]/g, '$1').toLocaleLowerCase('en-US');

/**
 * Resolve special-map implicits by exact normalized Trade text. Each contract
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

export function resolveEightModSpecialStatIds(
  resolvedStats: ReadonlyMap<string, string>,
): {
  ids: string[];
  missing: SpecialMapStatKey[];
} {
  const ids: string[] = [];
  const missing: SpecialMapStatKey[] = [];
  for (const key of EIGHT_MOD_EXCLUDED_SPECIAL_STATS) {
    const id = resolvedStats.get(key);
    if (id) ids.push(id);
    else missing.push(key);
  }
  return { ids: [...new Set(ids)], missing };
}

export type DeliriumTradeStatFilter = {
  type: 'and' | 'not';
  filters: { id: string; value?: { min: number; max: number } }[];
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
