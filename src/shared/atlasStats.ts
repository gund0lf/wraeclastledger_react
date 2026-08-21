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

/** Bounded Bestiary inputs captured from Path of Pathing's displayed stats.
 * Missing matching lines on a successful scrape mean zero allocated effect;
 * an absent object means the tree has not been read successfully yet. */
export interface BestiaryAtlasSetup {
  additionalEinharChancePct: number;
  additionalRedChancePct: number;
  additionalYellowBeasts: number;
  yellowToRedChancePct: number;
  pairChancePct: number;
  capturedBeastCopyChancePct: number;
}

export interface MercenaryAtlasSetup {
  additionalEncounterChancePct: number;
  lessStrengthAlignedChancePct: number;
  lessDexterityAlignedChancePct: number;
  lessIntelligenceAlignedChancePct: number;
  increasedAzadiChancePct: number;
  increasedKeitaChancePct: number;
  increasedCyaxanChancePct: number;
  increasedInfamousChancePct: number;
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

const summedStatValue = (stats: readonly string[], pattern: RegExp): number =>
  stats.reduce((sum, stat) => {
    const match = stat.trim().match(pattern);
    return sum + (match ? Number.parseInt(match[1], 10) : 0);
  }, 0);

/** Extract only the Bestiary values used by local Run Statistics. The regexes
 * intentionally match complete current stat wording so upstream changes fail
 * visibly through tests/UI instead of being guessed with loose substrings. */
export function deriveBestiaryAtlasSetup(groups: AtlasStatGroup[]): BestiaryAtlasSetup {
  const stats = groups.flatMap((group) => group.stats);
  return {
    additionalEinharChancePct: summedStatValue(
      stats,
      /^Your Maps have \+(\d+)% chance to contain Einhar$/,
    ),
    additionalRedChancePct: summedStatValue(
      stats,
      /^Your Maps that contain capturable Beasts have (\d+)% chance to contain an additional Red Beast$/,
    ),
    additionalYellowBeasts: summedStatValue(
      stats,
      /^Your Maps that contain capturable Beasts contain (\d+) additional Yellow Beasts?$/,
    ),
    yellowToRedChancePct: summedStatValue(
      stats,
      /^Yellow Beasts in your Maps have (\d+)% chance to be replaced with Red Beasts$/,
    ),
    pairChancePct: summedStatValue(
      stats,
      /^Red Beasts in your Maps have (\d+)% chance to appear in Pairs$/,
    ),
    capturedBeastCopyChancePct: summedStatValue(
      stats,
      /^(?:Your Maps have )?(\d+)% chance to create a copy of Beasts Captured in your Maps$/,
    ),
  };
}

/** Capture only Mercenary spawn/targeting modifiers relevant to interpreting
 * manually counted archetypes. These are context, not enough information to
 * reconstruct an absolute archetype probability from game spawn weights. */
export function deriveMercenaryAtlasSetup(groups: AtlasStatGroup[]): MercenaryAtlasSetup {
  const stats = groups.flatMap((group) => group.stats);
  return {
    additionalEncounterChancePct: summedStatValue(
      stats,
      /^Your Maps have \+(\d+)% chance to be inhabited by a Mercenary$/,
    ),
    lessStrengthAlignedChancePct: summedStatValue(
      stats,
      /^Mercenaries found in your Maps have (\d+)% less chance to be Strength aligned$/,
    ),
    lessDexterityAlignedChancePct: summedStatValue(
      stats,
      /^Mercenaries found in your Maps have (\d+)% less chance to be Dexterity aligned$/,
    ),
    lessIntelligenceAlignedChancePct: summedStatValue(
      stats,
      /^Mercenaries found in your Maps have (\d+)% less chance to be Intelligence aligned$/,
    ),
    increasedAzadiChancePct: summedStatValue(
      stats,
      /^Mercenaries found in your Maps have (\d+)% increased chance to be from House Azadi$/,
    ),
    increasedKeitaChancePct: summedStatValue(
      stats,
      /^Mercenaries found in your Maps have (\d+)% increased chance to be from House Keita$/,
    ),
    increasedCyaxanChancePct: summedStatValue(
      stats,
      /^Mercenaries found in your Maps have (\d+)% increased chance to be from House Cyaxan$/,
    ),
    increasedInfamousChancePct: summedStatValue(
      stats,
      /^(\d+)% increased chance for Mercenaries found in your Maps to be Infamous$/,
    ),
  };
}
