import type { ScarabSlot, SessionSettings } from '../types';

type MapType = SessionSettings['mapType'];

export interface ImportedSetupSource {
  mapType?: unknown;
  chisel?: string | null;
  scarabs?: readonly string[];
  deliriumType?: string | null;
  deliriumCountPerMap?: number | null;
  astrolabeType?: string | null;
}

export interface ImportedSetupPlan {
  mapType: MapType | null;
  chiselType: string;
  scarabNames: string[];
  deliriumType: string;
  deliriumCountPerMap: number;
  astrolabeType: string;
}

export function normalizeImportedChiselType(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === 'none') return '';
  if (/^cartographer(?:'s)? chisel$/i.test(trimmed)) return 'Cartographer';
  const maven = trimmed.match(/^maven(?:'s)? chisel of (.+)$/i);
  return maven ? maven[1].trim() : trimmed;
}

/**
 * Clone only reusable setup identity. Authored prices and historical usage
 * totals remain inspection data; the new run supplies its own economics.
 */
export function buildImportedSetupPlan(source: ImportedSetupSource): ImportedSetupPlan {
  const mapType = source.mapType === '6-mod' || source.mapType === '8-mod'
    ? source.mapType
    : null;
  const deliriumCount = Number(source.deliriumCountPerMap);
  return {
    mapType,
    chiselType: normalizeImportedChiselType(source.chisel),
    scarabNames: (source.scarabs ?? []).map((name) => name.trim()).filter(Boolean),
    deliriumType: source.deliriumType?.trim() ?? '',
    deliriumCountPerMap: Number.isFinite(deliriumCount)
      ? Math.min(5, Math.max(0, Math.trunc(deliriumCount)))
      : 0,
    astrolabeType: source.astrolabeType?.trim() ?? '',
  };
}

export function nextChiselSelection(
  current: Pick<SessionSettings, 'chiselType' | 'chiselUsed' | 'chiselPrice'>,
  value: string | null,
): Pick<SessionSettings, 'chiselType' | 'chiselUsed' | 'chiselPrice'> {
  const chiselType = value?.trim() ?? '';
  return {
    chiselType,
    chiselUsed: chiselType.length > 0,
    chiselPrice: chiselType === current.chiselType ? current.chiselPrice : 0,
  };
}

export function nextDeliriumSelection(
  current: Pick<SessionSettings, 'advDeliOrbType' | 'advDeliOrbQtyPerMap' | 'advDeliOrbPriceEach'>,
  value: string | null,
): Pick<SessionSettings, 'advDeliOrbType' | 'advDeliOrbQtyPerMap' | 'advDeliOrbPriceEach'> {
  const advDeliOrbType = value?.trim() ?? '';
  if (!advDeliOrbType) {
    return { advDeliOrbType: '', advDeliOrbQtyPerMap: 0, advDeliOrbPriceEach: 0 };
  }
  return {
    advDeliOrbType,
    advDeliOrbQtyPerMap: current.advDeliOrbQtyPerMap,
    advDeliOrbPriceEach: advDeliOrbType === current.advDeliOrbType
      ? current.advDeliOrbPriceEach
      : 0,
  };
}

export function nextAstrolabeSelection(
  current: Pick<SessionSettings, 'advAstrolabeType' | 'advAstrolabePrice' | 'advAstrolabeCount'>,
  value: string | null,
): Pick<SessionSettings, 'advAstrolabeType' | 'advAstrolabePrice' | 'advAstrolabeCount'> {
  const advAstrolabeType = value?.trim() ?? '';
  if (advAstrolabeType === current.advAstrolabeType) return { ...current };
  return { advAstrolabeType, advAstrolabePrice: 0, advAstrolabeCount: 0 };
}

export function nextScarabSelection(current: ScarabSlot, value: string): ScarabSlot {
  const name = value.trim();
  return { name, cost: name === current.name ? current.cost : 0 };
}
