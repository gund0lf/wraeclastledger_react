export interface AtlasStatGroup {
  title: string;
  stats: string[];
}

export interface AtlasCalcSettingsPatch {
  smallNodesAllocated?: number;
  mountingModifiers?: true;
  fragmentsUsed?: 5;
}

export interface AtlasStatsReadResult {
  groups: AtlasStatGroup[] | null;
  error: string | null;
}

/** Convert Path of Pathing's displayed stat groups into the Atlas Calc inputs. */
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
    patch.fragmentsUsed = 5;
  }
  return patch;
}
