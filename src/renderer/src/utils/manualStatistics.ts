import type {
  ManualAtlasAnomalyCount,
  ManualMercenaryCount,
  ManualSessionStatistics,
} from '../types';

export const MANUAL_STATISTIC_FIELDS = [
  'starfallCraters',
  'svalinnDrops',
  'wildwoodEncounters',
] as const;

export type ManualStatisticField = typeof MANUAL_STATISTIC_FIELDS[number];

/** Current PoEDB 3.29 catalogue. Regular/Infamous duplicates are collapsed,
 * the unused Bladereach placeholder is omitted, and the real special Ruckus
 * archetype remains distinct. Unknown future names can still be retained by
 * the sanitizer so old sessions never lose authored data at a rollover. */
export const MERCENARY_ARCHETYPES = [
  'Bastion',
  'Blade Ambusher',
  'Bladebitter',
  'Bladecaster',
  'Bloodletter',
  'Cardinal',
  'Combatant',
  'Cruel Mistress',
  'Earthshaker',
  'Eruptor',
  'Fallen Reverend',
  'Flamehand',
  'Flamequiver',
  'Flaming Charlatan',
  'Frost Ambusher',
  'Frosthand',
  'Kineticist',
  'Manyshot',
  'Mysterious Diver',
  'Reanimator',
  'Ripper',
  'Sanguimancer',
  'Shattersword',
  'Shock Ambusher',
  'Smoulderstrike',
  'Sniper',
  'Stormhand',
  'Storming Zealot',
  'Striker',
  'Swiftblade',
  'Thunderquiver',
  'Toxicologist',
  'Warpriest',
  'Warpriest of the Ruckus',
  'Winter Deacon',
  'Withertouch',
] as const;

export const TRARTHAN_HOUSES = [
  'Keita',
  'Cyaxan',
  'Bardiya',
  'Azadi',
] as const;

/** Current 3.29 Atlas anomaly catalogue, grouped together in the UI but kept
 * separate from older random Atlas encounters such as Starfall/Wildwood. */
export const ATLAS_ANOMALIES = [
  "River's End",
  'Syndicate Hideout',
  'Untainted Paradise',
  'Lake Islet',
  'Overgrown Grove',
  'Forgotten Shrine',
  'Uncharted Expedition',
  'The Court of Chaos',
  'Planned Heist',
  'The Manor Foyer',
  'Gambling District',
] as const;

export type MercenaryAttribute = 'Strength' | 'Dexterity' | 'Intelligence';
export type MercenaryHouse = typeof TRARTHAN_HOUSES[number];
export type MercenaryArchetype = typeof MERCENARY_ARCHETYPES[number];

export interface MercenaryProfile {
  attributes: readonly MercenaryAttribute[];
  /** PoEDB tribe. Bardiya has no corresponding Supremacy node on the 3.29
   * Atlas tree, which is significant for Kineticist/Sanguimancer targeting. */
  house: MercenaryHouse;
}

const STR = ['Strength'] as const;
const DEX = ['Dexterity'] as const;
const INT = ['Intelligence'] as const;
const STR_DEX = ['Strength', 'Dexterity'] as const;
const STR_INT = ['Strength', 'Intelligence'] as const;
const DEX_INT = ['Dexterity', 'Intelligence'] as const;
const ALL_ATTRIBUTES = ['Strength', 'Dexterity', 'Intelligence'] as const;

/** Current 3.29 PoEDB class/tribe catalogue. This is targeting metadata only;
 * it does not claim equal archetype weights or derive absolute probabilities. */
export const MERCENARY_PROFILES: Record<MercenaryArchetype, MercenaryProfile> = {
  'Bastion': { attributes: STR_DEX, house: 'Azadi' },
  'Blade Ambusher': { attributes: DEX_INT, house: 'Azadi' },
  'Bladebitter': { attributes: DEX_INT, house: 'Azadi' },
  'Bladecaster': { attributes: DEX_INT, house: 'Azadi' },
  'Bloodletter': { attributes: STR_DEX, house: 'Azadi' },
  'Cardinal': { attributes: STR_INT, house: 'Keita' },
  'Combatant': { attributes: STR_DEX, house: 'Azadi' },
  'Cruel Mistress': { attributes: INT, house: 'Cyaxan' },
  'Earthshaker': { attributes: STR, house: 'Keita' },
  'Eruptor': { attributes: STR, house: 'Keita' },
  'Fallen Reverend': { attributes: STR_INT, house: 'Keita' },
  'Flamehand': { attributes: INT, house: 'Cyaxan' },
  'Flamequiver': { attributes: DEX, house: 'Cyaxan' },
  'Flaming Charlatan': { attributes: STR_INT, house: 'Keita' },
  'Frost Ambusher': { attributes: DEX_INT, house: 'Azadi' },
  'Frosthand': { attributes: INT, house: 'Cyaxan' },
  'Kineticist': { attributes: ALL_ATTRIBUTES, house: 'Bardiya' },
  'Manyshot': { attributes: DEX, house: 'Cyaxan' },
  'Mysterious Diver': { attributes: STR_DEX, house: 'Azadi' },
  'Reanimator': { attributes: INT, house: 'Cyaxan' },
  'Ripper': { attributes: STR, house: 'Keita' },
  'Sanguimancer': { attributes: ALL_ATTRIBUTES, house: 'Bardiya' },
  'Shattersword': { attributes: STR_DEX, house: 'Azadi' },
  'Shock Ambusher': { attributes: DEX_INT, house: 'Azadi' },
  'Smoulderstrike': { attributes: STR, house: 'Keita' },
  'Sniper': { attributes: DEX, house: 'Cyaxan' },
  'Stormhand': { attributes: INT, house: 'Cyaxan' },
  'Storming Zealot': { attributes: STR_INT, house: 'Keita' },
  'Striker': { attributes: STR, house: 'Keita' },
  'Swiftblade': { attributes: STR_DEX, house: 'Azadi' },
  'Thunderquiver': { attributes: DEX, house: 'Cyaxan' },
  'Toxicologist': { attributes: DEX, house: 'Cyaxan' },
  'Warpriest': { attributes: STR_INT, house: 'Keita' },
  'Warpriest of the Ruckus': { attributes: STR_INT, house: 'Keita' },
  'Winter Deacon': { attributes: STR_INT, house: 'Keita' },
  'Withertouch': { attributes: INT, house: 'Cyaxan' },
};

export function mercenaryProfile(archetype: string): MercenaryProfile | null {
  return MERCENARY_PROFILES[archetype as MercenaryArchetype] ?? null;
}

const MAX_SAFE_COUNT = Number.MAX_SAFE_INTEGER;
const MERCENARY_ROW_LIMIT = 200;
const ANOMALY_ROW_LIMIT = 50;

const own = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const validCount = (value: unknown, allowZero = true): value is number =>
  typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= (allowZero ? 0 : 1)
  && value <= MAX_SAFE_COUNT;

const validMercenaryTotal = (rows: ManualMercenaryCount[]): boolean =>
  Number.isSafeInteger(rows.reduce((sum, row) => sum + row.count, 0));

const validAnomalyTotal = (rows: ManualAtlasAnomalyCount[]): boolean =>
  Number.isSafeInteger(rows.reduce((sum, row) => sum + row.count, 0));

const inlineText = (value: unknown, maximum: number): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
};

/** Strict saved/imported-data validator. Returns null for malformed or empty input. */
export function sanitizeManualStatistics(value: unknown): ManualSessionStatistics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const result: ManualSessionStatistics = {};

  for (const field of MANUAL_STATISTIC_FIELDS) {
    if (!own(input, field)) continue;
    if (!validCount(input[field])) return null;
    result[field] = input[field];
  }

  if (own(input, 'atlasAnomalies')) {
    if (!Array.isArray(input.atlasAnomalies) || input.atlasAnomalies.length > ANOMALY_ROW_LIMIT) {
      return null;
    }
    const merged = new Map<string, ManualAtlasAnomalyCount>();
    for (const candidate of input.atlasAnomalies) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
      const row = candidate as Record<string, unknown>;
      const name = inlineText(row.name, 100);
      if (!name || !validCount(row.count, false)) return null;
      const previous = merged.get(name)?.count ?? 0;
      if (!Number.isSafeInteger(previous + row.count)) return null;
      merged.set(name, { name, count: previous + row.count });
    }
    const atlasAnomalies = [...merged.values()].sort((left, right) =>
      left.name.localeCompare(right.name));
    if (!validAnomalyTotal(atlasAnomalies)) return null;
    if (atlasAnomalies.length > 0) result.atlasAnomalies = atlasAnomalies;
  }

  if (own(input, 'mercenaries')) {
    if (!Array.isArray(input.mercenaries) || input.mercenaries.length > MERCENARY_ROW_LIMIT) {
      return null;
    }
    const merged = new Map<string, ManualMercenaryCount>();
    for (const candidate of input.mercenaries) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
      const row = candidate as Record<string, unknown>;
      const archetype = inlineText(row.archetype, 80);
      if (!archetype || !validCount(row.count, false)) return null;
      const previous = merged.get(archetype)?.count ?? 0;
      if (!Number.isSafeInteger(previous + row.count)) return null;
      // The first local draft stored an optional user-entered House suffix.
      // House is intrinsic to the archetype, so ignore that obsolete field and
      // merge those rows instead of preserving impossible combinations.
      merged.set(archetype, { archetype, count: previous + row.count });
    }
    const mercenaries = [...merged.values()].sort((left, right) =>
      left.archetype.localeCompare(right.archetype));
    if (!validMercenaryTotal(mercenaries)) return null;
    if (mercenaries.length > 0) result.mercenaries = mercenaries;
  }

  return hasManualStatistics(result) ? result : null;
}

/** Lenient local-state adapter: malformed legacy values become an empty
 * snapshot rather than crashing session load. Imported inputs stay strict. */
export function normalizeLocalManualStatistics(value: unknown): ManualSessionStatistics {
  return sanitizeManualStatistics(value) ?? {};
}

export function hasManualStatistics(value: ManualSessionStatistics | null | undefined): boolean {
  if (!value) return false;
  return MANUAL_STATISTIC_FIELDS.some((field) => own(value, field))
    || (value.atlasAnomalies?.length ?? 0) > 0
    || (value.mercenaries?.length ?? 0) > 0;
}

export function cloneManualStatistics(value: ManualSessionStatistics): ManualSessionStatistics {
  const result: ManualSessionStatistics = {};
  for (const field of MANUAL_STATISTIC_FIELDS) {
    if (own(value, field)) result[field] = value[field];
  }
  if (value.atlasAnomalies) {
    result.atlasAnomalies = value.atlasAnomalies.map((row) => ({ ...row }));
  }
  if (value.mercenaries) {
    result.mercenaries = value.mercenaries.map((row) => ({ ...row }));
  }
  return result;
}

export function setManualStatistic(
  current: ManualSessionStatistics,
  field: ManualStatisticField,
  value: number | null,
): ManualSessionStatistics {
  const next = { ...current };
  if (value === null) {
    delete next[field];
  } else {
    if (!validCount(value)) throw new TypeError(`${field} must be a non-negative safe integer`);
    next[field] = value;
  }
  return next;
}

export function addManualMercenaryCount(
  current: ManualSessionStatistics,
  archetype: string,
  amount: number,
): ManualSessionStatistics {
  const cleanArchetype = inlineText(archetype, 80);
  if (!cleanArchetype || !validCount(amount, false)) {
    throw new TypeError('Mercenary count requires an archetype and positive integer');
  }
  const rows = [...(current.mercenaries ?? [])];
  const index = rows.findIndex((row) => row.archetype === cleanArchetype);
  if (index >= 0) {
    const count = rows[index].count + amount;
    if (!validCount(count, false)) throw new RangeError('Mercenary count exceeds the safe integer range');
    rows[index] = { ...rows[index], count };
  } else {
    if (rows.length >= MERCENARY_ROW_LIMIT) throw new RangeError('Too many Mercenary statistic rows');
    rows.push({ archetype: cleanArchetype, count: amount });
  }
  if (!validMercenaryTotal(rows)) throw new RangeError('Total Mercenary count exceeds the safe integer range');
  return { ...current, mercenaries: rows };
}

export function setManualMercenaryCount(
  current: ManualSessionStatistics,
  archetype: string,
  count: number | null,
): ManualSessionStatistics {
  const cleanArchetype = inlineText(archetype, 80);
  if (!cleanArchetype) throw new TypeError('Mercenary count requires an archetype');
  const rows = (current.mercenaries ?? []).filter((row) => row.archetype !== cleanArchetype);
  if (count !== null) {
    if (!validCount(count, false)) throw new TypeError('Mercenary count must be a positive safe integer');
    if (rows.length >= MERCENARY_ROW_LIMIT) throw new RangeError('Too many Mercenary statistic rows');
    rows.push({ archetype: cleanArchetype, count });
  }
  if (!validMercenaryTotal(rows)) throw new RangeError('Total Mercenary count exceeds the safe integer range');
  const next = { ...current };
  if (rows.length > 0) next.mercenaries = rows;
  else delete next.mercenaries;
  return next;
}

export function totalMercenaryEncounters(value: ManualSessionStatistics): number {
  return (value.mercenaries ?? []).reduce((sum, row) => sum + row.count, 0);
}

export function addManualAtlasAnomalyCount(
  current: ManualSessionStatistics,
  name: string,
  amount: number,
): ManualSessionStatistics {
  const cleanName = inlineText(name, 100);
  if (!cleanName || !validCount(amount, false)) {
    throw new TypeError('Atlas anomaly count requires a name and positive integer');
  }
  const rows = [...(current.atlasAnomalies ?? [])];
  const index = rows.findIndex((row) => row.name === cleanName);
  if (index >= 0) {
    const count = rows[index].count + amount;
    if (!validCount(count, false)) throw new RangeError('Atlas anomaly count exceeds the safe integer range');
    rows[index] = { ...rows[index], count };
  } else {
    if (rows.length >= ANOMALY_ROW_LIMIT) throw new RangeError('Too many Atlas anomaly statistic rows');
    rows.push({ name: cleanName, count: amount });
  }
  if (!validAnomalyTotal(rows)) throw new RangeError('Total Atlas anomaly count exceeds the safe integer range');
  return { ...current, atlasAnomalies: rows };
}

export function setManualAtlasAnomalyCount(
  current: ManualSessionStatistics,
  name: string,
  count: number | null,
): ManualSessionStatistics {
  const cleanName = inlineText(name, 100);
  if (!cleanName) throw new TypeError('Atlas anomaly count requires a name');
  const rows = (current.atlasAnomalies ?? []).filter((row) => row.name !== cleanName);
  if (count !== null) {
    if (!validCount(count, false)) throw new TypeError('Atlas anomaly count must be a positive safe integer');
    if (rows.length >= ANOMALY_ROW_LIMIT) throw new RangeError('Too many Atlas anomaly statistic rows');
    rows.push({ name: cleanName, count });
  }
  if (!validAnomalyTotal(rows)) throw new RangeError('Total Atlas anomaly count exceeds the safe integer range');
  const next = { ...current };
  if (rows.length > 0) next.atlasAnomalies = rows;
  else delete next.atlasAnomalies;
  return next;
}

export function totalAtlasAnomalies(value: ManualSessionStatistics): number {
  return (value.atlasAnomalies ?? []).reduce((sum, row) => sum + row.count, 0);
}
