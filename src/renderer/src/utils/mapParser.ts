import { MapData } from '../types';

/**
 * Parse a PoE map item tooltip from clipboard.
 *
 * Handles all Mirage league map variants:
 *   - Regular maps (T15/T16, 6-mod or 8-mod)
 *   - Originator maps  ("Area is Influenced by the Originator's Memories")
 *   - Empowered Mirage ("Area contains an Empowered Mirage which covers the entire Map")
 *   - Nightmare maps   ("Nightmare Map" item type)
 *   - Corrupted maps   (extra "Corrupted" trailing section + <tag>{content} mod format)
 */
export const parseMapClipboard = (text: string): Omit<MapData, 'id'> | null => {
  const isMap =
    text.includes('Item Class: Maps') ||
    text.includes('Map Tier:') ||
    /Map \(Tier \d+\)/.test(text) ||
    text.includes('Nightmare Map');
  if (!isMap) return null;

  // Strip PoE color tags (<tag>{content} → content) before any further parsing
  const clean = text.replace(/<[^>]+>\{([^}]*)\}/g, '$1');

  // ── Basic stats ────────────────────────────────────────────────────────────
  let tier = 0;
  const tierMatch = clean.match(/Map \(Tier (\d+)\)/) || clean.match(/Map Tier:\s*(\d+)/);
  if (tierMatch) tier = parseInt(tierMatch[1]);
  // Nightmare maps don't always have a visible tier number; treat as T16
  if (tier === 0 && clean.includes('Nightmare Map')) tier = 16;

  let name = 'Unknown';
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const rarityIdx = lines.findIndex((l) => l.startsWith('Rarity:'));
  if (rarityIdx >= 0 && rarityIdx + 1 < lines.length) name = lines[rarityIdx + 1];

  const extractPct = (pattern: RegExp): number => {
    const m = clean.match(pattern);
    return m ? parseInt(m[1]) : 0;
  };

  const quantity     = extractPct(/Item Quantity: \+(\d+)%/);
  const rarity       = extractPct(/Item Rarity: \+(\d+)%/);
  const packSize     = extractPct(/Monster Pack Size: \+(\d+)%/);
  const moreCurrency = extractPct(/More Currency: \+(\d+)%/);
  const moreMaps     = extractPct(/More Maps: \+(\d+)%/);
  const moreScarabs  = extractPct(/More Scarabs: \+(\d+)%/);

  let quality = 0, qualityType = 'Standard';
  const qualMatch = clean.match(/Quality \(([^)]+)\): \+(\d+)%/);
  if (qualMatch) { qualityType = qualMatch[1]; quality = parseInt(qualMatch[2]); }
  else { const q = clean.match(/Quality: \+(\d+)%/); if (q) quality = parseInt(q[1]); }

  // ── Map subtypes ────────────────────────────────────────────────────────────
  const isOriginator    = clean.includes("Originator's Memories");
  const isEmpoweredMirage = clean.includes('Empowered Mirage which covers the entire Map');
  const isNightmare     = clean.includes('Nightmare Map');
  const isCorrupted     = /\bCorrupted\b/.test(clean);

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
    .filter((l) => l.length > 0 && !l.startsWith('Area is Influenced'));
  let modCount = modLines.length;

  // Fallback: if the section was empty or mis-detected, derive from stat presence
  if (modCount === 0) {
    if (quantity > 0)     modCount++;
    if (rarity > 0)       modCount++;
    if (packSize > 0)     modCount++;
    if (moreCurrency > 0) modCount++;
    if (moreMaps > 0)     modCount++;
    if (moreScarabs > 0)  modCount++;
  }

  return {
    tier, name, quantity, rarity, packSize, quality, qualityType,
    moreCurrency, moreMaps, moreScarabs, modCount,
    isOriginator, isEmpoweredMirage, isNightmare, isCorrupted,
    rawText: text,
  };
};
