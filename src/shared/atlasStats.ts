// Both Electron readers evaluate this script inside the isolated planner document.
export const READ_ATLAS_STAT_GROUPS = `(function() {
  function statText(el) {
    var copy = el.cloneNode(true);
    copy.querySelectorAll('br').forEach(function(br) { br.replaceWith(' '); });
    return copy.textContent.trim();
  }
  var statEls = Array.from(document.querySelectorAll('#skillTreeStats_Content .stat[data-group-name]'));
  if (statEls.length > 0) {
    var groups = {};
    var order = [];
    statEls.forEach(function(el) {
      var g = el.getAttribute('data-group-name');
      if (!groups[g]) { groups[g] = []; order.push(g); }
      var t = statText(el);
      if (t) groups[g].push(t);
    });
    return order.map(function(g) { return { title: g, stats: groups[g] }; });
  }
  var content = document.getElementById('skillTreeStats_Content');
  if (!content) return null;
  var result = [];
  content.querySelectorAll('.group').forEach(function(g) {
    var titleEl = g.querySelector('span.title') || g.querySelector('.title');
    var title = titleEl ? titleEl.textContent.trim() : 'Other';
    var stats = Array.from(g.querySelectorAll('.stat')).map(statText).filter(Boolean);
    if (stats.length > 0) result.push({ title: title, stats: stats });
  });
  return result.length > 0 ? result : null;
})()`;

// The stock planner's PoE Planner export encodes every active node. Capture the
// synchronous export locally during a read. This does not need clipboard access.
export const READ_ATLAS_ALLOCATION = String.raw`(function() {
  const button = document.getElementById('poePlanner_Button');
  if (!(button instanceof HTMLButtonElement)) return null;
  const open = window.open;
  let code = null;
  const capture = function(url) {
    const match = typeof url === 'string' && /^https:\/\/poeplanner\.com\/atlas-tree\/([A-Za-z0-9_-]{12,4096}={0,2})$/.exec(url);
    if (match) code = match[1];
    return null;
  };
  try {
    window.open = capture;
    if (window.open !== capture) return null;
    button.click();
    const points = document.getElementById('skillTreeNormalNodeCount')?.textContent?.trim();
    return points && /^\d+$/.test(points) ? { code, points: Number(points) } : null;
  } finally {
    window.open = open;
  }
})()`;

export function readAllocatedNodeIds(value: unknown): number[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { code, points } = value as { code?: unknown; points?: unknown };
  if (typeof code !== 'string' || code.length > 4096 || typeof points !== 'number' || !Number.isInteger(points)) return undefined;
  try {
    const bytes = Uint8Array.from(atob(code.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const count = bytes[6];
    // Atlas exports have no cluster extensions or character mastery selections.
    if (view.getUint32(0) !== 6 || count !== points || bytes.length !== 9 + count * 2
      || bytes[bytes.length - 1] || bytes[bytes.length - 2]) return undefined;
    const ids = Array.from({ length: count }, (_, i) => view.getUint16(7 + 2 * i));
    return new Set(ids).size === count ? ids : undefined;
  } catch { return undefined; }
}

export interface AtlasStatGroup {
  title: string;
  stats: string[];
}

export interface AtlasCalcSettingsPatch {
  smallNodesAllocated?: number;
  mountingModifiers?: true;
  multiplyingModifiersAllocated?: true;
}

export interface AtlasCalcSettingsSnapshot {
  areaPackSize?: number;
  areaRarity?: number;
  increasedMapsFound?: number;
  increasedThreadsFound?: number;
  mapsFoundPerExplicit?: number;
  additionalRandomModifier?: true;
  randomNotables?: number;
  rerollsCorruptedRare?: true;
  threadRules?: { effectPerType: number; saveChance: number; oneType: boolean; freeThreads: number };
  smallNodesAllocated: number;
  mountingModifiers: boolean;
  multiplyingModifiersAllocated: boolean;
}

export interface AtlasStatsReadResult {
  choiceEffects?: Record<string, string>;
  allocatedNodeIds?: number[];
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
  const flatEffect = summedStatValue(allStats, /^(\d+)% increased effect of Explicit Modifiers on your Maps$/i);
  if (flatEffect) patch.smallNodesAllocated = Math.min(16, Math.round(flatEffect / 2));
  if (allStats.some((stat) =>
    /^2% increased effect of Explicit Modifiers on your Maps per Explicit Modifier$/i.test(stat.trim().replace(/\s+/g, ' ')))) {
    patch.mountingModifiers = true;
  }
  if (allStats.some((stat) => stat.includes('per Fragment used with Map'))) {
    patch.multiplyingModifiersAllocated = true;
  }
  return patch;
}

/** Complete result of one successful Atlas stats read. Unlike the legacy
 * positive-only patch, absence is meaningful here: a fresh successful sync is
 * the authority for whether each supported node is allocated. */
export function deriveAtlasCalcSettingsSnapshot(
  groups: AtlasStatGroup[],
): AtlasCalcSettingsSnapshot {
  const patch = deriveAtlasCalcSettings(groups);
  const stats = groups.flatMap(group => group.stats.map(stat =>
    stat.replace(/\[([^\]|]+)(?:\|([^\]]+))?\]/g, (_token, name: string, display?: string) => display || name).replace(/\s+/g, ' ').trim()));
  const effectPerType = summedStatValue(stats, /^(\d+)% increased effect of Explicit Modifiers on your Maps per different Thread used with Map$/i);
  const saveChance = summedStatValue(stats, /^Map Device has (\d+)% chance not to consume Threads?$/i);
  const oneType = stats.some(stat => /^You can only apply one type of Thread to your Maps$/i.test(stat));
  const freeThreads = summedStatValue(stats, /^Your Maps with Threads? applied gain (\d+) additional Threads?,?\s*which can bypass the \d+ Thread maximum$/i);
  const areaPackSize = summedStatValue(stats, /^(\d+)% increased Pack Size in your Maps$/i);
  const areaRarity = summedStatValue(stats, /^(\d+)% increased Rarity of Items found in your Maps$/i);
  const increasedMapsFound = summedStatValue(stats, /^(\d+)% increased Maps found in your Maps$/i);
  const mapsFoundPerExplicit = summedStatValue(stats, /^(\d+)% increased Maps found in your Maps for each Explicit Modifier$/i);
  const increasedThreadsFound = summedStatValue(stats, /^(\d+)% increased Threads found in your Maps$/i);
  const randomNotables = summedStatValue(stats, /^Your Maps are opened with (\d+) additional random Unallocated Notable Atlas Passives$/i);
  const rerollsCorruptedRare = stats.some(stat => /^Your Corrupted Rare Maps are modified unpredictably when opened$/i.test(stat));
  return {
    ...(areaPackSize && { areaPackSize }), ...(areaRarity && { areaRarity }),
    ...(increasedMapsFound && { increasedMapsFound }), ...(mapsFoundPerExplicit && { mapsFoundPerExplicit }),
    ...(increasedThreadsFound && { increasedThreadsFound }),
    ...(stats.some(stat => /^Your Maps have an additional random Modifier$/i.test(stat)) && { additionalRandomModifier: true as const }),
    ...(randomNotables && { randomNotables }), ...(rerollsCorruptedRare && { rerollsCorruptedRare: true as const }),
    ...(effectPerType || saveChance || oneType || freeThreads
      ? { threadRules: { effectPerType, saveChance, oneType, freeThreads } } : {}),
    smallNodesAllocated: patch.smallNodesAllocated ?? 0,
    mountingModifiers: patch.mountingModifiers === true,
    multiplyingModifiersAllocated: patch.multiplyingModifiersAllocated === true,
  };
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
