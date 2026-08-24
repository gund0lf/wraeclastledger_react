import type { OverlayCounterSnapshot } from '../../../shared/overlay';
import type { ManualSessionStatistics } from '../types';
import { ATLAS_ANOMALIES, MERCENARY_ARCHETYPES, type ManualStatisticField } from './manualStatistics';

const SCALAR_COUNTERS: ReadonlyArray<{ field: ManualStatisticField; label: string }> = [
  { field: 'starfallCraters', label: 'Starfall Craters' },
  { field: 'svalinnDrops', label: 'Svalinn drops' },
  { field: 'wildwoodEncounters', label: 'Wildwood encounters' },
];

export const OVERLAY_COUNTER_OPTIONS = [
  {
    group: 'Run Statistics',
    items: SCALAR_COUNTERS.map(({ field, label }) => ({ value: `stat:${field}`, label })),
  },
  {
    group: 'Atlas anomalies',
    items: ATLAS_ANOMALIES.map((name) => ({ value: `anomaly:${name}`, label: name })),
  },
  {
    group: 'Mercenaries',
    items: MERCENARY_ARCHETYPES.map((name) => ({ value: `mercenary:${name}`, label: name })),
  },
];

export type ParsedOverlayCounter =
  | { kind: 'stat'; name: ManualStatisticField }
  | { kind: 'anomaly'; name: string }
  | { kind: 'mercenary'; name: string };

export function parseOverlayCounterId(id: string): ParsedOverlayCounter | null {
  if (id.startsWith('stat:')) {
    const name = id.slice('stat:'.length) as ManualStatisticField;
    return SCALAR_COUNTERS.some(({ field }) => field === name) ? { kind: 'stat', name } : null;
  }
  if (id.startsWith('anomaly:')) {
    const name = id.slice('anomaly:'.length);
    return ATLAS_ANOMALIES.includes(name as typeof ATLAS_ANOMALIES[number])
      ? { kind: 'anomaly', name } : null;
  }
  if (id.startsWith('mercenary:')) {
    const name = id.slice('mercenary:'.length);
    return MERCENARY_ARCHETYPES.includes(name as typeof MERCENARY_ARCHETYPES[number])
      ? { kind: 'mercenary', name } : null;
  }
  return null;
}

export function overlayCounterSnapshot(
  id: string,
  statistics: ManualSessionStatistics,
): OverlayCounterSnapshot | null {
  const parsed = parseOverlayCounterId(id);
  if (!parsed) return null;
  if (parsed.kind === 'stat') {
    const label = SCALAR_COUNTERS.find(({ field }) => field === parsed.name)?.label ?? parsed.name;
    return { id, label, value: statistics[parsed.name] ?? 0 };
  }
  if (parsed.kind === 'anomaly') {
    const value = statistics.atlasAnomalies?.find(({ name }) => name === parsed.name)?.count ?? 0;
    return { id, label: parsed.name, value };
  }
  const value = statistics.mercenaries?.find(({ archetype }) => archetype === parsed.name)?.count ?? 0;
  return { id, label: parsed.name, value };
}
