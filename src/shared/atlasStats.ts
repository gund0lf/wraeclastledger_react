export interface AtlasStatGroup {
  title: string;
  stats: string[];
}

export interface AtlasCalcSettingsPatch {
  smallNodesAllocated?: number;
  mountingModifiers?: true;
  multiplyingModifiersAllocated?: true;
}

export interface AtlasStatsReadResult {
  groups: AtlasStatGroup[] | null;
  error: string | null;
}

/** Convert Path of Pathing's displayed stat groups into a positive-only Atlas
 * Calc patch. A detected stat may enable a setting, but an absent stat is not
 * authoritative evidence that it is off: the upstream wording or scrape may
 * have changed. Users disable an existing setting explicitly in Atlas Calc. */
export function deriveAtlasCalcSettings(groups: AtlasStatGroup[]): AtlasCalcSettingsPatch {
  const allStats = groups.flatMap((group) => group.stats);
  const patch: AtlasCalcSettingsPatch = {};
  const flatMod = allStats.find((stat) =>
    /^(\d+)% increased effect of Explicit Modifiers on your Maps$/.test(stat.trim()));
  if (flatMod) {
    const match = flatMod.match(/(\d+)%/);
    if (match) patch.smallNodesAllocated = Math.min(16, Math.round(parseInt(match[1]) / 2));
  }
  if (allStats.some((stat) => stat.includes('per Explicit Modifier'))) {
    patch.mountingModifiers = true;
  }
  if (allStats.some((stat) => stat.includes('per Fragment used with Map'))) {
    patch.multiplyingModifiersAllocated = true;
  }
  return patch;
}
