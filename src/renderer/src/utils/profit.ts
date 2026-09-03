/**
 * profit.ts — single source of truth for ALL profit / cost / multiplier math (WP1).
 *
 * Pure functions, no React or store dependencies — fully unit-testable.
 * Consumers: DashboardModule, InvestmentModule, ShareModal (via discordExport.ts),
 * and later the session comparison view (WP11).
 *
 * LOCKED SEMANTICS (July 2026 audit, Dashboard behavior is authoritative):
 *  1. Preservation split: when any "...of Preservation" scarab is slotted, ONLY
 *     Preservation scarabs cost per-map; all other scarabs are a ONE-TIME cost
 *     added once to total investment.
 *  2. gemBuyOffset applies ONLY when a baseline exists (it corrects the gem buy
 *     cost showing up as a baseline-diff loss; without a baseline there is no
 *     diff to neutralise).
 *  3. investmentNeutralization is part of loot gain (and therefore of shared
 *     exports).
 *  4. The rolling session total is DERIVED LIVE from settings + map count.
 *     The stored settings.rollingCostPerMap is legacy (it froze at the map
 *     count of the last Advanced Costs edit) and must not be read anywhere.
 *     It is removed entirely in store migration v16 (WP2).
 */
import { SessionSettings, LootItem, ManualLootItem, ScarabSlot, MapData } from '../types';
import { MAP_DEVICE_SLOT_COUNT, MULTIPLYING_EFFECT_PER_FRAGMENT } from '../../../shared/mapDevice';

/* ------------------------------------------------------------------ */
/* Scarabs                                                             */
/* ------------------------------------------------------------------ */

export const isPreservationScarab = (name: string): boolean =>
  name.toLowerCase().includes('preservation');

const sumScarabs = (arr: ScarabSlot[]): number =>
  arr.reduce((a, s) => a + (s.cost || 0), 0);

/* ------------------------------------------------------------------ */
/* Costs                                                               */
/* ------------------------------------------------------------------ */

export interface CostBreakdown {
  /** Chisel cost per map (0 when no chisel type or no price). */
  chiselCost: number;
  /** True when any Preservation scarab is slotted. */
  hasPreservation: boolean;
  /** Scarab cost applied on every map. */
  perMapScarabs: number;
  /** Scarab cost applied once per session (non-Preservation scarabs while preservation is active). */
  oneTimeScarabs: number;
  /** Full per-map cost: base map (+ split halving) + chisel + per-map scarabs. */
  perMapBase: number;
  /** LIVE session total of Advanced Costs: chaos + exalt + scour + alch + deli(qty x price x maps) + astrolabe. */
  rollingSessionTotal: number;
  /** perMapBase x mapCount + rollingSessionTotal + oneTimeScarabs. */
  totalInvest: number;
}

/**
 * Live derivation of the Advanced Costs session total.
 * Replaces the stored settings.rollingCostPerMap (stale-by-design bug).
 * NOTE: mapCount is clamped to a minimum of 1 so a configured session shows a
 * meaningful total before the first map is parsed (parity with the old
 * calcAdvTotal behavior).
 */
export function computeRollingSessionTotal(settings: SessionSettings, mapCount: number): number {
  const n = mapCount || 1;
  const deliTotal      = settings.advDeliOrbQtyPerMap * settings.advDeliOrbPriceEach * n;
  const astrolabeTotal = settings.advAstrolabePrice * settings.advAstrolabeCount;
  // Gems are intentionally excluded — gem leveling is side income, not map investment.
  return settings.advChaos
    + settings.advExaltPrice
    + settings.advScourPrice
    + settings.advAlchPrice
    + deliTotal
    + astrolabeTotal;
}

export function computeCosts(settings: SessionSettings, mapCount: number): CostBreakdown {
  const chiselCost = settings.chiselType && settings.chiselPrice > 0 ? settings.chiselPrice : 0;
  const hasPreservation = settings.scarabs.some((s) => isPreservationScarab(s.name));
  const perMapScarabs = hasPreservation
    ? sumScarabs(settings.scarabs.filter((s) => isPreservationScarab(s.name)))
    : sumScarabs(settings.scarabs);
  const oneTimeScarabs = hasPreservation
    ? sumScarabs(settings.scarabs.filter((s) => !isPreservationScarab(s.name)))
    : 0;
  const isSplit = settings.advSplitPrice > 0;
  // Split sessions: each run consumes half a (map + chisel + split op); scarabs are per-run.
  const perMapBase = isSplit
    ? (settings.baseMapCost + chiselCost + settings.advSplitPrice) / 2 + perMapScarabs
    : settings.baseMapCost + chiselCost + perMapScarabs;
  const rollingSessionTotal = computeRollingSessionTotal(settings, mapCount);
  const totalInvest = perMapBase * mapCount + rollingSessionTotal + oneTimeScarabs;
  return { chiselCost, hasPreservation, perMapScarabs, oneTimeScarabs, perMapBase, rollingSessionTotal, totalInvest };
}

/** True when any configured investment contributes to the session total. */
export function hasInvestmentCosts(settings: SessionSettings, mapCount: number): boolean {
  return computeCosts(settings, mapCount).totalInvest > 0;
}

/* ------------------------------------------------------------------ */
/* Profit                                                              */
/* ------------------------------------------------------------------ */

export interface ProfitInputs {
  settings: SessionSettings;
  mapCount: number;
  lootItems: LootItem[];
  manualLootItems?: ManualLootItem[];
  baselineTotal: number;
  investmentNeutralization?: number;
}

export interface ProfitResult extends CostBreakdown {
  /** Sum of non-excluded loot items. */
  rawReturn: number;
  /** Explicit author-valued loot omitted or unpriced by the CSV. */
  manualReturn: number;
  /** Gem buy cost added back to the return — ONLY when a baseline exists. */
  gemBuyOffset: number;
  /** rawReturn + gemBuyOffset + neutralization, minus baseline when present. 0 when no return CSV. */
  lootGain: number;
  net: number;
  cPerMap: number;
  divPerMap: number;
  /** Divine price used for conversions (falls back to 1 to avoid division by zero). */
  div: number;
  hasReturn: boolean;
  hasBl: boolean;
}

export function computeProfit(input: ProfitInputs): ProfitResult {
  const { settings, mapCount, lootItems, baselineTotal } = input;
  const neutralization = input.investmentNeutralization ?? 0;
  const costs = computeCosts(settings, mapCount);

  const rawReturn = lootItems.filter((l) => !l.excluded).reduce((a, b) => a + b.total, 0);
  const hasReturn = lootItems.length > 0;
  // Manual entries supplement an imported return snapshot; they never turn a
  // baseline-only session into a return on their own.
  const manualReturn = hasReturn
    ? (input.manualLootItems ?? []).reduce((sum, item) => sum + Math.max(0, item.total || 0), 0)
    : 0;
  const hasBl     = baselineTotal > 0 && hasReturn;
  const gemBuyOffset =
    hasBl && settings.advGemName?.trim() && settings.advGemCount > 0 && settings.advGemBuyPrice > 0
      ? settings.advGemCount * settings.advGemBuyPrice
      : 0;
  const adjReturn = rawReturn + manualReturn + gemBuyOffset + neutralization;
  const lootGain  = hasReturn ? (hasBl ? adjReturn - baselineTotal : adjReturn) : 0;
  const net       = lootGain - costs.totalInvest;
  const div       = settings.divinePrice || 1;

  return {
    ...costs,
    rawReturn, manualReturn, gemBuyOffset, lootGain, net, div, hasReturn, hasBl,
    cPerMap:   mapCount > 0 ? net / mapCount : 0,
    divPerMap: mapCount > 0 ? (net / div) / mapCount : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Atlas multiplier                                                    */
/* ------------------------------------------------------------------ */

export interface MultiplierResult {
  multiplier: number;
  fragmentCount: number;
  fragmentCountSource: FragmentCountSource;
  fragmentEffect: number;
  nodeEffect: number;       // smallNodesAllocated x 2
  scarabOfRiskMods: number; // +2 mods per "...of Risk" scarab
  effectiveMods: number;    // selected/observed base mods + scarabOfRiskMods
  mountBonus: number;       // effectiveMods x 2 when Mounting Modifiers is allocated
  observedModAverage: number | null;
  observedSampleSize: number;
  usesObservedMods: boolean;
}

export const MIN_OBSERVED_MOD_SAMPLE = 1;

export interface ObservedModSample {
  average: number;
  sampleSize: number;
}

export type FragmentCountSource = 'off' | 'override' | 'observed' | 'default';

export interface FragmentCountResolution {
  count: number;
  source: FragmentCountSource;
  effect: number;
}

type FragmentSettings = Pick<
  SessionSettings,
  'multiplyingModifiersAllocated' | 'fragmentCountOverride' | 'scarabs'
>;

/** Resolve Multiplying Modifiers from one source of truth. A retained authored
 * override is protocol evidence for legacy/imported sessions and therefore wins.
 * Ordinary source-derived sessions have no override, so populated Investment
 * slots are authoritative there; device capacity is the final fallback. */
export function resolveFragmentCount(settings: FragmentSettings): FragmentCountResolution {
  if (!settings.multiplyingModifiersAllocated) return { count: 0, source: 'off', effect: 0 };

  if (settings.fragmentCountOverride !== null) {
    const count = Math.min(
      MAP_DEVICE_SLOT_COUNT,
      Math.max(0, Math.round(settings.fragmentCountOverride)),
    );
    return { count, source: 'override', effect: count * MULTIPLYING_EFFECT_PER_FRAGMENT };
  }

  const occupied = settings.scarabs
    .slice(0, MAP_DEVICE_SLOT_COUNT)
    .filter((slot) => slot.name.trim().length > 0)
    .length;
  if (occupied > 0) {
    return { count: occupied, source: 'observed', effect: occupied * MULTIPLYING_EFFECT_PER_FRAGMENT };
  }

  return {
    count: MAP_DEVICE_SLOT_COUNT,
    source: 'default',
    effect: MAP_DEVICE_SLOT_COUNT * MULTIPLYING_EFFECT_PER_FRAGMENT,
  };
}

/** Exact observed mode is deliberately all-or-nothing: a partial exact-copy
 * sample could be biased toward whichever maps the user happened to copy that
 * way. A complete sample is truthful even when the session currently has only
 * one map. Unidentified maps also make the session incomplete. */
type ObservedModMap = Pick<MapData, 'explicitModCount' | 'isUnidentified'>;

export function computeObservedModSample(maps: readonly ObservedModMap[]): ObservedModSample | null {
  if (maps.length < MIN_OBSERVED_MOD_SAMPLE) return null;
  if (maps.some((map) => map.isUnidentified || map.explicitModCount == null)) return null;
  const total = maps.reduce((sum, map) => sum + map.explicitModCount!, 0);
  return { average: total / maps.length, sampleSize: maps.length };
}

export function computeMultiplier(
  settings: Pick<SessionSettings, 'multiplyingModifiersAllocated' | 'fragmentCountOverride' | 'smallNodesAllocated' | 'mountingModifiers' | 'mapType' | 'scarabs'>,
  maps: readonly ObservedModMap[] = [],
): MultiplierResult {
  const fragments        = resolveFragmentCount(settings);
  const fragmentEffect   = fragments.effect;
  const nodeEffect       = settings.smallNodesAllocated * 2;
  const scarabOfRiskMods = settings.scarabs.filter((s) => s.name.toLowerCase().includes('of risk')).length * 2;
  const observed         = computeObservedModSample(maps);
  const usesObservedMods = observed !== null;
  const baseMods         = usesObservedMods ? observed.average : settings.mapType === '8-mod' ? 8 : 6;
  const effectiveMods    = baseMods + scarabOfRiskMods;
  const mountBonus       = settings.mountingModifiers ? effectiveMods * 2 : 0;
  const multiplier       = 1 + (fragmentEffect + nodeEffect + mountBonus) / 100;
  return {
    multiplier, fragmentCount: fragments.count, fragmentCountSource: fragments.source,
    fragmentEffect, nodeEffect, scarabOfRiskMods, effectiveMods, mountBonus,
    observedModAverage: observed?.average ?? null,
    observedSampleSize: observed?.sampleSize ?? 0,
    usesObservedMods,
  };
}
