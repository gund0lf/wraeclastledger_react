import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { MapData } from '../types';

/**
 * Parse a PoE map item tooltip from clipboard.
 *
 * Handles all Mirage league map variants:
 *   - Regular maps (T15/T16, 6-mod or 8-mod)
 *   - Originator maps  ("Area is Influenced by the Originator's Memories")
 *   - Empowered Mirage ("Area contains an Empowered Mirage which covers the entire Map")
 *   - Nightmare maps   ("Nightmare Map" item type — can be corrupted or not)
 *   - Corrupted maps   (extra "Corrupted" trailing section + <tag>{content} mod format)
 */
export const parseMapClipboard = (text: string): Omit<MapData, 'id'> | null => {
  const isMap =
    text.includes('Item Class: Maps') ||
    text.includes('Map Tier:') ||
    /Map \(Tier \d+\)/.test(text) ||
    /\(Tier \d+\)/.test(text) ||
    text.includes('Nightmare Map');
  if (!isMap) return null;

  // Strip PoE color tags (<tag>{content} → content) before any further parsing
  const clean = text.replace(/<[^>]+>\{([^}]*)\}/g, '$1');

  // ── Basic stats ────────────────────────────────────────────────────────────
  // Tier extraction handles three formats:
  //   1. Rare map name line: "Toxic Sewer Map (Tier 16)" → matches via "Map (Tier"
  //   2. Magic prefix+suffix: "Fecund Map of Exposure (Tier 16)" — the word
  //      between "Map" and "(Tier" is the suffix, so we need a more generic
  //      pattern that catches "(Tier N)" regardless of the preceding word.
  //   3. Old "Map Tier: N" format from earlier game versions.
  let tier = 0;
  const tierMatch =
    clean.match(/\(Tier (\d+)\)/) ||
    clean.match(/Map Tier:\s*(\d+)/);
  if (tierMatch) tier = parseInt(tierMatch[1]);
  // Nightmare maps don't always have a visible tier number; treat as T16
  if (tier === 0 && clean.includes('Nightmare Map')) tier = 16;

  let name = 'Unknown';
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const rarityIdx = lines.findIndex((l) => l.startsWith('Rarity:'));
  const itemRarity = rarityIdx >= 0
    ? lines[rarityIdx].slice('Rarity:'.length).trim()
    : '';
  if (rarityIdx >= 0 && rarityIdx + 1 < lines.length) name = lines[rarityIdx + 1];

  const extractPct = (pattern: RegExp): number => {
    const m = clean.match(pattern);
    return m ? parseInt(m[1]) : 0;
  };

  const atlasDropsLine = clean.match(/^Atlas Drops: \+(\d+)%/m);
  const threadLine = clean.match(/^More Threads: \+(\d+)%/m);
  const quantity     = extractPct(/Item Quantity: \+(\d+)%/);
  const rarity       = extractPct(/Item Rarity: \+(\d+)%/);
  const packSize     = extractPct(/Monster Pack Size: \+(\d+)%/);
  const moreCurrency = extractPct(/More Currency: \+(\d+)%/);
  const moreMaps     = extractPct(/More Maps: \+(\d+)%/);
  const moreScarabs  = extractPct(/More Scarabs: \+(\d+)%/);
  const moreDivCards = extractPct(/More Divination Cards: \+(\d+)%/);

  let quality = 0, qualityType = 'Standard';
  const qualMatch = clean.match(/Quality \(([^)]+)\): \+(\d+)%/);
  if (qualMatch) { qualityType = qualMatch[1]; quality = parseInt(qualMatch[2]); }
  else { const q = clean.match(/Quality: \+(\d+)%/); if (q) quality = parseInt(q[1]); }

  // ── Map subtypes ────────────────────────────────────────────────────────────
  // Note: Nightmare maps are NOT inherently corrupted — they can drop white,
  // be picked up rare, and run uncorrupted. The "Modifiable only with Chaos
  // Orbs, Vaal Orbs, Delirium Orbs and Chisels" footer is restriction text,
  // not a corruption signal. Only the explicit "Corrupted" section indicates
  // a corrupted map.
  const isOriginator    = clean.includes("Originator's Memories");
  const isEmpoweredMirage = clean.includes('Empowered Mirage which covers the entire Map');
  const isNightmare     = clean.includes('Nightmare Map');
  const isCorrupted     = /\bCorrupted\b/.test(clean);
  // Unidentified maps: mods are unrevealed — the "Unidentified" line sits where
  // the mod section would be and must NOT count as a mod.
  const isUnidentified  = lines.includes('Unidentified');

  // Delirium Orb enchants are map metadata, not explicit modifiers. Keep the
  // reward lines in clipboard order and retain duplicates: repeated reward
  // types represent separate reward tracks rather than redundant text.
  const deliriousMatch = clean.match(/Players in Area are (\d+)% Delirious(?: \(enchant\))?/);
  const parsedDeliriousPct = deliriousMatch ? parseInt(deliriousMatch[1]) : undefined;
  const deliriousPct = parsedDeliriousPct !== undefined
    && parsedDeliriousPct >= 0
    && parsedDeliriousPct <= 100
    ? parsedDeliriousPct
    : undefined;
  const deliriumRewardTypes = lines.flatMap((line) => {
    const match = line.match(/^Delirium Reward Type:\s*(.+?)(?:\s+\(enchant\)|\s+— Unscalable Value)?$/);
    return match ? [match[1].trim()] : [];
  });

  // Since 3.29, regular Ctrl+C uses the advanced format and includes exactly
  // one header per real affix, even when that affix has several description
  // lines. An identified Normal map has an equally exact count of zero without
  // needing headers. Unidentified and headerless Magic/Rare copies stay unknown.
  const explicitHeaders = lines.filter((line) => /^\{ (?:(?:Prefix|Suffix) Modifier\b|Rare-only(?: (?:Prefix|Suffix) Modifier\b| \(| \}))/.test(line));
  const corruptionModifiers: NonNullable<MapData['corruptionModifiers']> = {};
  const rolledAffixes: NonNullable<MapData['rolledAffixes']> = [];
  let section = '';
  for (const line of lines) {
    if (line.startsWith('{') || /^-+$/.test(line)) {
      section = line;
      continue;
    }
    if (/Corruption Implicit Modifier/i.test(section) || /\(implicit\)$/i.test(line)) {
      const normalized = line.replace(/\(\d+[-–]\d+\)/g, '');
      const patterns = {
        explicitMagnitude: /(\d+)% increased Explicit Modifier magnitudes/i,
        atlasPassiveEffect: /Atlas Passives have (\d+)% increased Effect on Area/i,
        rarity: /(\d+)% increased Rarity of Items found/i,
        packSize: /(\d+)% increased (?:Monster )?Pack Size/i,
        randomNotables: /(\d+) (?:additional )?random unallocated notable Atlas Passives/i,
      };
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = normalized.match(pattern);
        if (match) corruptionModifiers[key as keyof typeof corruptionModifiers] = Number(match[1]);
      }
    } else {
      const side = section.match(/^\{ (?:Rare-only )?(Prefix|Suffix) Modifier\b/)?.[1];
      // Only project a single explicitly rolled percentage. Fixed, mixed and
      // unscalable lines have no verified rounding contract from the clipboard.
      const rolled = line.match(/^(\D*)(\d+)\(\d+[-–]\d+\)%(?!.*\d)(.*)$/);
      if ((side === 'Prefix' || side === 'Suffix') && rolled && !/Unscalable Value/i.test(line))
        rolledAffixes.push({ side, line: rolled[1] + '{roll}%' + rolled[3], base: Number(rolled[2]) });
    }
  }
  const explicitModCount = isUnidentified
    ? undefined
    : explicitHeaders.length > 0
      ? explicitHeaders.length
      : itemRarity === 'Normal'
        ? 0
        : undefined;

  // ── Explicit mod count ─────────────────────────────────────────────────────
  // Find the section just BEFORE "Travel to a Map" — this is always the
  // explicit mods section, regardless of trailing Corrupted / Nightmare
  // restriction text that breaks the old sections.length - 2 approach.
  const sections = clean.split('--------');
  const travelIdx = sections.findIndex((s) => s.includes('Travel to a Map'));
  const modSec = travelIdx > 0 ? sections[travelIdx - 1] : (sections[sections.length - 2] ?? '');

  // Count all non-empty lines in the mod section as mods.
  // Skip the implicit line that starts with "Area is Influenced by" since that's
  // only present when the implicit and explicit sections get merged — in practice
  // the travelIdx approach keeps them separate, but just in case.
  const modLines = modSec
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('Area is Influenced') && l !== 'Unidentified');
  let modCount = modLines.length;

  // Fallback: if the section was empty or mis-detected, derive from stat presence
  if (modCount === 0) {
    if (quantity > 0)     modCount++;
    if (rarity > 0)       modCount++;
    if (packSize > 0)     modCount++;
    if (moreCurrency > 0) modCount++;
    if (moreMaps > 0)     modCount++;
    if (moreScarabs > 0)  modCount++;
    if (moreDivCards > 0) modCount++;
  }

  return {
    ...(Object.keys(corruptionModifiers).length ? { corruptionModifiers } : {}),
    ...(atlasDropsLine && rolledAffixes.length ? { rolledAffixes } : {}),
    ...(atlasDropsLine && { itemRarity, atlasDrops: Number(atlasDropsLine[1]) }),
    ...(threadLine && { moreThreads: Number(threadLine[1]) }),
    tier, name, quantity, rarity, packSize, quality, qualityType,
    moreCurrency, moreMaps, moreScarabs, moreDivCards, modCount, explicitModCount,
    isOriginator, isEmpoweredMirage, isNightmare, isCorrupted, isUnidentified,
    ...(deliriousPct !== undefined ? { deliriousPct } : {}),
    ...(deliriumRewardTypes.length > 0 ? { deliriumRewardTypes } : {}),
    rawText: text,
  };
};

/** Recover explicit counts and Covens clipboard observations when the original
 * capture is available. Other saved fields keep their historical values. */
export function recoverExactModifierCount(map: MapData): MapData {
  if (!map.rawText) return map;
  const covensCopy = map.atlasDrops === undefined && map.rawText.includes('Atlas Drops:');
  const needsDetails = (!map.rolledAffixes && map.rawText.includes('Atlas Drops:')) ||
    (!map.corruptionModifiers && /Corruption Implicit Modifier|\(implicit\)/i.test(map.rawText));
  if (!covensCopy && !needsDetails && map.explicitModCount != null) return map;
  const reparsed = parseMapClipboard(map.rawText);
  if ((reparsed?.corruptionModifiers && !map.corruptionModifiers) || (reparsed?.rolledAffixes && !map.rolledAffixes)) map = { ...map,
    ...(reparsed.corruptionModifiers && { corruptionModifiers: reparsed.corruptionModifiers }),
    ...(reparsed.rolledAffixes && { rolledAffixes: reparsed.rolledAffixes }) };
  if (covensCopy && reparsed?.atlasDrops !== undefined) {
    return { ...map, atlasDrops: reparsed.atlasDrops, moreThreads: reparsed.moreThreads,
      explicitModCount: reparsed.explicitModCount, deliriumRewardTypes: reparsed.deliriumRewardTypes };
  }
  return reparsed?.explicitModCount == null || reparsed.explicitModCount === map.explicitModCount
    ? map
    : { ...map, explicitModCount: reparsed.explicitModCount };
}

/** A stripped legacy copy can have zero-filled historical fields and no way
 * to recover the Covens observations. Use session provenance for the headings
 * and preserve positive historical evidence in mixed imports. */
export function mapLogStatColumns(
  leagueName: string, maps: ReadonlyArray<Pick<MapData, 'atlasDrops' | 'moreThreads' | 'quantity' | 'moreScarabs'>>,
  rules = BUNDLED_MANIFEST.leagueRules,
): { covens: boolean; legacy: boolean } {
  const covens = rules?.[leagueName]?.atlasDrops === true || maps.some(map => map.atlasDrops !== undefined || map.moreThreads !== undefined);
  return { covens, legacy: !covens || maps.some(map => map.quantity > 0 || map.moreScarabs > 0) };
}
