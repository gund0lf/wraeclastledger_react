/**
 * mapDuplicates.ts — "possible duplicate" detection for the Map Log.
 *
 * The clipboard watcher can't distinguish an accidental double-Paste from a
 * legit identical map (identical text produces no clipboard change to observe
 * — physics, not policy; see the WP13 note in CLAUDE.md). Instead of fighting
 * that, the Map Log marks rows whose PARSE is identical to their immediate
 * predecessor so accidental double-pastes are visible and one-click deletable,
 * while genuinely identical maps just carry a harmless marker.
 *
 * Identity = the parsed fields only. id / parsedAt / rawText are deliberately
 * ignored: a double-paste gets a fresh id and timestamp, and rawText is
 * stripped from saved sessions (the marker must survive save/load).
 * Optional additive fields (moreDivCards, isUnidentified) are normalized so an
 * old persisted map compares sanely against a fresh re-parse.
 */
import { MapData } from '../types';

const NUM_KEYS = [
  'tier', 'quality', 'quantity', 'rarity', 'packSize',
  'moreCurrency', 'moreMaps', 'moreScarabs', 'moreDivCards', 'modCount',
] as const;
const BOOL_KEYS = [
  'isCorrupted', 'isNightmare', 'isOriginator', 'isEmpoweredMirage', 'isUnidentified',
] as const;
const STR_KEYS = ['name', 'qualityType'] as const;

/** True when two maps parse to the same thing (id/parsedAt/rawText ignored). */
export function isParseIdentical(a: MapData, b: MapData): boolean {
  for (const k of NUM_KEYS)  if (((a[k] as number | undefined) ?? 0) !== ((b[k] as number | undefined) ?? 0)) return false;
  for (const k of BOOL_KEYS) if (((a[k] as boolean | undefined) ?? false) !== ((b[k] as boolean | undefined) ?? false)) return false;
  for (const k of STR_KEYS)  if (((a[k] as string | undefined) ?? '') !== ((b[k] as string | undefined) ?? '')) return false;
  return true;
}

/**
 * Ids of maps that are parse-identical to their IMMEDIATE predecessor in log
 * order. Only the later map of a pair is marked (that's the one to delete if
 * the pair was an accidental double-paste); in a run of N identical maps,
 * maps 2..N are all marked.
 */
export function markPossibleDuplicates(maps: MapData[]): Set<string> {
  const dup = new Set<string>();
  for (let i = 1; i < maps.length; i++) {
    if (isParseIdentical(maps[i], maps[i - 1])) dup.add(maps[i].id);
  }
  return dup;
}
