import type { MapData, SessionSettings } from '../types';

export function isEightModCandidate(map: MapData): boolean {
  if (!map.isCorrupted && !map.isNightmare) return false;
  return map.explicitModCount != null ? map.explicitModCount > 6 : map.modCount > 6;
}

export function inferMapType(
  maps: MapData[],
  current: SessionSettings['mapType'],
): SessionSettings['mapType'] {
  if (maps.length === 0) return current;
  const hasCompleteExactSample = maps.every((map) =>
    !map.isUnidentified && map.explicitModCount != null);
  if (!hasCompleteExactSample && maps.length < 4) return current;
  const ratio = maps.filter(isEightModCandidate).length / maps.length;
  return ratio > 0.6 ? '8-mod' : ratio < 0.4 ? '6-mod' : current;
}
