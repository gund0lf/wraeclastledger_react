import type { BestiaryAtlasSetup, MercenaryAtlasSetup } from '../../../shared/atlasStats';
import type { LootItem, ScarabSlot } from '../types';
import { mercenaryProfile, type MercenaryAttribute } from './manualStatistics';

/** Current Allflame valuable-beast shortlist from Sad's poe.re Bestiary export
 * at a 20-chaos floor (2026-08-21). Prices are deliberately not persisted;
 * review the identities at league rollover instead of claiming stale values. */
export const VALUABLE_BEAST_NAMES = [
  'Black Mórrigan',
  'Craicic Croaker',
  'Fenumal Plagued Arachnid',
  'Wild Bristle Matron',
  'Farrul, First of the Plains',
  'Wild Brambleback',
  'Wild Hellion Alpha',
  'Fenumus, First of the Night',
  'Primal Crushclaw',
  'Primal Cystcaller',
  'Saqawal, First of the Sky',
] as const;

export interface ValuableBeastGain {
  name: string;
  baselineQuantity: number;
  returnQuantity: number;
  gainedQuantity: number;
}

const normalizeIdentity = (value: string): string => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/['’`]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const valuableBeastsByIdentity = new Map(
  VALUABLE_BEAST_NAMES.map((name) => [normalizeIdentity(name), name]),
);

export function valuableBeastName(value: string): string | null {
  return valuableBeastsByIdentity.get(normalizeIdentity(value)) ?? null;
}

const quantity = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

const collectQuantities = (items: LootItem[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const item of items) {
    const name = valuableBeastName(item.name);
    if (!name) continue;
    totals.set(name, (totals.get(name) ?? 0) + quantity(item.quantity));
  }
  return totals;
};

/** Derives net captured-beast quantity gains from two real loot snapshots.
 * Exclusion toggles and price movement do not affect encounter provenance. */
export function deriveValuableBeastGains(
  baselineItems: LootItem[],
  returnItems: LootItem[],
): ValuableBeastGain[] {
  if (baselineItems.length === 0 || returnItems.length === 0) return [];
  const baseline = collectQuantities(baselineItems);
  const returned = collectQuantities(returnItems);

  return VALUABLE_BEAST_NAMES.flatMap((name) => {
    const baselineQuantity = baseline.get(name) ?? 0;
    const returnQuantity = returned.get(name) ?? 0;
    const gainedQuantity = returnQuantity - baselineQuantity;
    return gainedQuantity > 0
      ? [{ name, baselineQuantity, returnQuantity, gainedQuantity }]
      : [];
  }).sort((left, right) => (
    right.gainedQuantity - left.gainedQuantity
    || left.name.localeCompare(right.name)
  ));
}

export function totalValuableBeastGains(gains: ValuableBeastGain[]): number {
  return gains.reduce((sum, gain) => sum + gain.gainedQuantity, 0);
}

export function observedRatePercent(count: number, denominator: number): number | null {
  return denominator > 0 ? (count / denominator) * 100 : null;
}

export function remainingUntrackedMaps(trackedCount: number, mapCount: number): number {
  return Math.max(0, mapCount - trackedCount);
}

const normalizedScarabName = (value: string): string => value.trim().toLowerCase();

export interface BestiaryScarabSetup {
  herdCount: number;
  duplicatesCapturedBeasts: boolean;
  forcesEinhar: boolean;
}

export interface BestiaryRateModel {
  herdCount: number;
  duplicatesCapturedBeasts: boolean;
  expectedBaseRedRollsPerMap: number;
  capturedQuantityMultiplier: number;
  einharGuaranteedBy: 'atlas' | 'scarab';
}

export interface BestiaryEncounterEstimate {
  capturedPerMap: number;
  estimatedBaseSightings: number;
  estimatedBaseSightingsPerMap: number;
  estimatedChancePerMapPct: number;
  saturated: boolean;
}

export interface MercenaryScarabSetup {
  forcesEncounter: boolean;
  infamy: boolean;
  additionalWildMercenaries: number;
}

export interface MercenaryTargetingImpact {
  profile: string;
  penalties: string[];
  houseEffect: string;
}

const BESTIARY_HERD = 'bestiary scarab of the herd';
const BESTIARY_DUPLICATING = 'bestiary scarab of duplicating';
const BESTIARY_BASE = 'bestiary scarab';
const TRARTHAN_BASE = 'trarthan scarab';
const TRARTHAN_INFAMY = 'trarthan scarab of infamy';
const BASE_RED_BEASTS_PER_MAP = 1;
const BASE_YELLOW_BEASTS_PER_MAP = 4.5;
const RED_BEASTS_PER_HERD_SCARAB = 5;

export function deriveBestiaryScarabSetup(scarabs: readonly ScarabSlot[]): BestiaryScarabSetup {
  const names = scarabs.map((scarab) => normalizedScarabName(scarab.name));
  return {
    herdCount: names.filter((name) => name === BESTIARY_HERD).length,
    duplicatesCapturedBeasts: names.includes(BESTIARY_DUPLICATING),
    forcesEinhar: names.includes(BESTIARY_BASE),
  };
}

export function deriveMercenaryScarabSetup(scarabs: readonly ScarabSlot[]): MercenaryScarabSetup {
  const names = scarabs.map((scarab) => normalizedScarabName(scarab.name));
  const infamy = names.includes(TRARTHAN_INFAMY);
  return {
    forcesEncounter: names.includes(TRARTHAN_BASE),
    infamy,
    additionalWildMercenaries: infamy ? 2 : 0,
  };
}

const validAtlasValue = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 10_000;

/** Allflame model used by the linked Beast Farming Calculator: one base red
 * beast and 4.5 base yellow beasts, plus Atlas conversion and Herd scarabs.
 * Pair/copy effects change captured quantity, not the underlying base rolls. */
export function buildBestiaryRateModel(
  atlas: BestiaryAtlasSetup,
  scarabs: readonly ScarabSlot[],
): BestiaryRateModel | null {
  const values = Object.values(atlas);
  if (!values.every(validAtlasValue)) return null;
  const scarabSetup = deriveBestiaryScarabSetup(scarabs);
  const einharGuaranteedBy = scarabSetup.forcesEinhar
    ? 'scarab'
    : atlas.additionalEinharChancePct >= 100
      ? 'atlas'
      : null;
  if (!einharGuaranteedBy) return null;
  const expectedBaseRedRollsPerMap = BASE_RED_BEASTS_PER_MAP
    + (atlas.additionalRedChancePct / 100)
    + ((BASE_YELLOW_BEASTS_PER_MAP + atlas.additionalYellowBeasts)
      * (atlas.yellowToRedChancePct / 100))
    + (scarabSetup.herdCount * RED_BEASTS_PER_HERD_SCARAB);
  const copyChancePct = atlas.capturedBeastCopyChancePct
    + (scarabSetup.duplicatesCapturedBeasts ? 100 : 0);
  const capturedQuantityMultiplier = (1 + (atlas.pairChancePct / 100))
    * (1 + (copyChancePct / 100));
  if (expectedBaseRedRollsPerMap <= 0 || capturedQuantityMultiplier <= 0) return null;
  return {
    ...scarabSetup,
    expectedBaseRedRollsPerMap,
    capturedQuantityMultiplier,
    einharGuaranteedBy,
  };
}

/** Estimate at-least-one chance under an explicit independent-roll model.
 * This is not a measured map outcome: aggregate stash snapshots cannot reveal
 * whether multiple captures came from the same map. */
export function estimateBestiaryEncounter(
  gainedQuantity: number,
  mapCount: number,
  model: BestiaryRateModel,
): BestiaryEncounterEstimate | null {
  if (!Number.isSafeInteger(gainedQuantity) || gainedQuantity < 0 || mapCount <= 0) return null;
  const estimatedBaseSightings = gainedQuantity / model.capturedQuantityMultiplier;
  const expectedRolls = mapCount * model.expectedBaseRedRollsPerMap;
  const rawRollShare = expectedRolls > 0 ? estimatedBaseSightings / expectedRolls : 0;
  const rollShare = Math.min(1, Math.max(0, rawRollShare));
  return {
    capturedPerMap: gainedQuantity / mapCount,
    estimatedBaseSightings,
    estimatedBaseSightingsPerMap: estimatedBaseSightings / mapCount,
    estimatedChancePerMapPct: (1 - ((1 - rollShare) ** model.expectedBaseRedRollsPerMap)) * 100,
    saturated: rawRollShare > 1,
  };
}

const lessChanceForAttribute = (
  attribute: MercenaryAttribute,
  setup: MercenaryAtlasSetup,
): number => ({
  Strength: setup.lessStrengthAlignedChancePct,
  Dexterity: setup.lessDexterityAlignedChancePct,
  Intelligence: setup.lessIntelligenceAlignedChancePct,
})[attribute];

/** Explain which observed Atlas targeting modifiers touch an archetype. It is
 * deliberately descriptive: exact Mercenary spawn weights/roll order are not
 * verified, so these modifiers must not be converted into an absolute chance. */
export function deriveMercenaryTargetingImpact(
  archetype: string,
  setup: MercenaryAtlasSetup,
): MercenaryTargetingImpact | null {
  const target = mercenaryProfile(archetype);
  if (!target) return null;
  const penalties = target.attributes.flatMap((attribute) => {
    const value = lessChanceForAttribute(attribute, setup);
    return value > 0 ? [`${value}% less ${attribute}`] : [];
  });
  const houseBoost = ({
    Azadi: setup.increasedAzadiChancePct,
    Keita: setup.increasedKeitaChancePct,
    Cyaxan: setup.increasedCyaxanChancePct,
    Bardiya: 0,
  } as const)[target.house];
  const houseEffect = target.house === 'Bardiya'
    ? 'House Bardiya · no Atlas boost exists'
    : `House ${target.house}${houseBoost > 0 ? ` · +${houseBoost}% increased` : ' · no boost allocated'}`;
  return {
    profile: `${target.attributes.join(' / ')} · ${houseEffect}`,
    penalties,
    houseEffect,
  };
}
