import type { SessionSettings } from '../types';

type MapType = SessionSettings['mapType'];

/**
 * Apply only map families that the session multiplier model understands.
 * Parsed imports are deliberately string-shaped for legacy compatibility, so
 * keep this boundary strict instead of coercing an unknown value to 6-mod.
 */
export function applyImportedMapType(
  value: unknown,
  apply: (mapType: MapType) => void,
): boolean {
  if (value !== '6-mod' && value !== '8-mod') return false;
  apply(value);
  return true;
}
