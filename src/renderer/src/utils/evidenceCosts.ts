import type { PublicEvidenceRun } from './evidenceApi';
import { computePublishedSetupCostBreakdown } from './strategySetupCosts';

export interface WeightedEvidenceSetupItem {
  name: string;
  /** Map-weighted contribution to the pooled per-map cost. */
  perMap: number;
}

export interface PooledEvidenceCostBreakdown {
  runCount: number;
  mapCount: number;
  baseAndRolling: number;
  chisel: number;
  scarabs: number;
  deliriumOrbs: number;
  astrolabe: number;
  allIn: number;
  /** Sum of each run's investment converted with that run's own snapshot. */
  totalInvestDivines: number | null;
  /** Historical investment divines divided by the pooled map count. */
  costPerMapDivines: number | null;
  chiselItems: WeightedEvidenceSetupItem[];
  scarabItems: WeightedEvidenceSetupItem[];
  deliriumItems: WeightedEvidenceSetupItem[];
  astrolabeItems: WeightedEvidenceSetupItem[];
}

const validCost = (value: number | null | undefined): number => (
  value != null && Number.isFinite(value) && value > 0 ? value : 0
);

interface WeightedItemAccumulator {
  name: string;
  weightedTotal: number;
}

const addWeightedItem = (
  totals: Map<string, WeightedItemAccumulator>,
  name: string,
  contributionPerMap: number,
  runMaps: number,
  identity?: string,
): void => {
  const cleanName = name.trim();
  if (!cleanName || contributionPerMap <= 0) return;
  const key = identity ?? cleanName;
  const existing = totals.get(key);
  if (existing) {
    existing.weightedTotal += contributionPerMap * runMaps;
  } else {
    totals.set(key, {
      name: cleanName,
      weightedTotal: contributionPerMap * runMaps,
    });
  }
};

const finishItems = (
  totals: Map<string, WeightedItemAccumulator>,
  totalMaps: number,
): WeightedEvidenceSetupItem[] => (
  [...totals.values()]
    .map(({ name, weightedTotal }) => ({ name, perMap: weightedTotal / totalMaps }))
    .sort((a, b) => b.perMap - a.perMap || a.name.localeCompare(b.name))
);

/**
 * Reconstructs the setup shown on a pooled strategy from immutable evidence.
 * Each run contributes in proportion to its map count. Missing line-item data
 * remains in that run's base/rolling remainder rather than making a known
 * published value disappear.
 */
export function aggregateEvidenceSetupCosts(
  runs: PublicEvidenceRun[],
): PooledEvidenceCostBreakdown | null {
  const usable = runs.flatMap((run) => {
    const mapCount = Math.floor(validCost(run.map_count));
    const allIn = validCost(run.per_map_cost)
      || (mapCount > 0 ? validCost(run.total_invest) / mapCount : 0);
    const totalInvest = validCost(run.total_invest) || allIn * mapCount;
    return mapCount > 0 && allIn > 0 ? [{ run, mapCount, allIn, totalInvest }] : [];
  });
  const totalMaps = usable.reduce((sum, entry) => sum + entry.mapCount, 0);
  if (totalMaps <= 0) return null;

  const chiselItems = new Map<string, WeightedItemAccumulator>();
  const scarabItems = new Map<string, WeightedItemAccumulator>();
  const deliriumItems = new Map<string, WeightedItemAccumulator>();
  const astrolabeItems = new Map<string, WeightedItemAccumulator>();
  let baseAndRollingTotal = 0;
  let chiselTotal = 0;
  let scarabTotal = 0;
  let deliriumTotal = 0;
  let astrolabeTotal = 0;
  let allInTotal = 0;
  let totalInvestDivines = 0;
  let hasCompleteDivineSnapshots = true;

  for (const { run, mapCount, allIn, totalInvest } of usable) {
    const costs = run.cost_breakdown ?? {
      chisel: null,
      scarabs: [],
      delirium: null,
      astrolabe: null,
    };
    const breakdown = computePublishedSetupCostBreakdown({
      costPerMap: allIn,
      mapCount,
      scarabs: (costs.scarabs ?? []).map((scarab) => ({
        name: scarab.name,
        cost: validCost(scarab.priceEach),
      })),
      chiselPrice: validCost(costs.chisel?.priceEach),
      deliOrbQtyPerMap: validCost(costs.delirium?.countPerMap),
      deliOrbPriceEach: validCost(costs.delirium?.priceEach),
      astrolabeCount: validCost(costs.astrolabe?.count),
      astrolabePriceEach: validCost(costs.astrolabe?.priceEach),
    });

    const usesPreservation = (costs.scarabs ?? []).some((scarab) => (
      scarab.name.toLowerCase().includes('preservation')
    ));
    const scarabOccurrences = new Map<string, number>();
    for (const scarab of costs.scarabs ?? []) {
      const cleanName = scarab.name.trim();
      const occurrence = (scarabOccurrences.get(cleanName) ?? 0) + 1;
      scarabOccurrences.set(cleanName, occurrence);
      const price = validCost(scarab.priceEach);
      const contribution = usesPreservation && !scarab.name.toLowerCase().includes('preservation')
        ? price / mapCount
        : price;
      addWeightedItem(
        scarabItems,
        scarab.name,
        contribution,
        mapCount,
        `${cleanName}\0${occurrence}`,
      );
    }
    if (costs.chisel) {
      addWeightedItem(chiselItems, costs.chisel.name, validCost(costs.chisel.priceEach), mapCount);
    }
    if (costs.delirium) {
      addWeightedItem(
        deliriumItems,
        costs.delirium.type,
        validCost(costs.delirium.countPerMap) * validCost(costs.delirium.priceEach),
        mapCount,
      );
    }
    if (costs.astrolabe) {
      addWeightedItem(
        astrolabeItems,
        costs.astrolabe.type,
        validCost(costs.astrolabe.count) * validCost(costs.astrolabe.priceEach) / mapCount,
        mapCount,
      );
    }

    baseAndRollingTotal += breakdown.baseAndRolling * mapCount;
    chiselTotal += breakdown.chisel * mapCount;
    scarabTotal += breakdown.scarabs * mapCount;
    deliriumTotal += breakdown.deliriumOrbs * mapCount;
    astrolabeTotal += breakdown.astrolabe * mapCount;
    allInTotal += allIn * mapCount;
    const divinePrice = validCost(run.divine_price);
    if (divinePrice > 0) {
      totalInvestDivines += totalInvest / divinePrice;
    } else {
      hasCompleteDivineSnapshots = false;
    }
  }

  const historicalInvestDivines = hasCompleteDivineSnapshots
    ? totalInvestDivines
    : null;

  return {
    runCount: usable.length,
    mapCount: totalMaps,
    baseAndRolling: baseAndRollingTotal / totalMaps,
    chisel: chiselTotal / totalMaps,
    scarabs: scarabTotal / totalMaps,
    deliriumOrbs: deliriumTotal / totalMaps,
    astrolabe: astrolabeTotal / totalMaps,
    allIn: allInTotal / totalMaps,
    totalInvestDivines: historicalInvestDivines,
    costPerMapDivines: historicalInvestDivines != null
      ? historicalInvestDivines / totalMaps
      : null,
    chiselItems: finishItems(chiselItems, totalMaps),
    scarabItems: finishItems(scarabItems, totalMaps),
    deliriumItems: finishItems(deliriumItems, totalMaps),
    astrolabeItems: finishItems(astrolabeItems, totalMaps),
  };
}
