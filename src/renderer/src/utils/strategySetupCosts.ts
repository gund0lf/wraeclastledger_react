export interface PublishedScarabCost {
  name: string;
  cost: number;
}

export interface PublishedSetupCostInput {
  costPerMap: number;
  mapCount: number;
  scarabs: PublishedScarabCost[];
  chiselPrice: number;
  deliOrbQtyPerMap: number;
  deliOrbPriceEach: number;
  astrolabeCount: number;
  astrolabePriceEach: number;
}

export interface PublishedSetupCostBreakdown {
  baseAndRolling: number;
  chisel: number;
  scarabs: number;
  deliriumOrbs: number;
  astrolabe: number;
  allIn: number;
}

const finiteNonNegative = (value: number): number => (
  Number.isFinite(value) && value > 0 ? value : 0
);

/**
 * Reconstruct the per-map setup rows already itemized by the Discord share.
 * The wire intentionally combines base-map and rolling costs, so their exact
 * remainder stays combined instead of inventing a historical split.
 */
export function computePublishedSetupCostBreakdown(
  input: PublishedSetupCostInput,
): PublishedSetupCostBreakdown {
  const mapCount = Math.max(1, Math.floor(finiteNonNegative(input.mapCount)));
  const scarabs = input.scarabs.map((scarab) => ({
    name: scarab.name,
    cost: finiteNonNegative(scarab.cost),
  }));
  const usesPreservation = scarabs.some((scarab) => (
    scarab.name.toLowerCase().includes('preservation')
  ));
  const scarabCost = usesPreservation
    ? scarabs.reduce((total, scarab) => (
        total + (scarab.name.toLowerCase().includes('preservation')
          ? scarab.cost
          : scarab.cost / mapCount)
      ), 0)
    : scarabs.reduce((total, scarab) => total + scarab.cost, 0);
  const chisel = finiteNonNegative(input.chiselPrice);
  const deliriumOrbs = finiteNonNegative(input.deliOrbQtyPerMap)
    * finiteNonNegative(input.deliOrbPriceEach);
  const astrolabe = finiteNonNegative(input.astrolabeCount)
    * finiteNonNegative(input.astrolabePriceEach)
    / mapCount;
  const allIn = finiteNonNegative(input.costPerMap);

  return {
    baseAndRolling: Math.max(0, allIn - chisel - scarabCost - deliriumOrbs - astrolabe),
    chisel,
    scarabs: scarabCost,
    deliriumOrbs,
    astrolabe,
    allIn,
  };
}
