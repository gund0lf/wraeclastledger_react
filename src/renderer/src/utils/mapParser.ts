import { MapData } from '../types';

const EXPLICIT_MOD_PATTERNS = [
  /Item Quantity: \+\d+%/,
  /Item Rarity: \+\d+%/,
  /Monster Pack Size: \+\d+%/,
  /More Currency: \+\d+%/,
  /More Maps: \+\d+%/,
  /More Scarabs: \+\d+%/,
  /Monsters have \d+% increased/,
  /Monsters reflect/,
  /Area contains/,
  /All Monster Damage/,
  /Players have/,
  /Players are/,
];

export const parseMapClipboard = (text: string): Omit<MapData, 'id'> | null => {
  const isMap =
    text.includes('Item Class: Maps') ||
    text.includes('Map Tier:') ||
    /Map \(Tier \d+\)/.test(text);
  if (!isMap) return null;

  let tier = 0;
  const tierMatch = text.match(/Map \(Tier (\d+)\)/) || text.match(/Map Tier:\s*(\d+)/);
  if (tierMatch) tier = parseInt(tierMatch[1]);

  let name = 'Unknown';
  const lines = text.split('\n').map((l) => l.trim());
  const rarityIdx = lines.findIndex((l) => l.startsWith('Rarity:'));
  if (rarityIdx >= 0 && rarityIdx + 1 < lines.length) name = lines[rarityIdx + 1];

  const extractPct = (pattern: RegExp): number => {
    const m = text.match(pattern);
    return m ? parseInt(m[1]) : 0;
  };

  const quantity     = extractPct(/Item Quantity: \+(\d+)%/);
  const rarity       = extractPct(/Item Rarity: \+(\d+)%/);
  const packSize     = extractPct(/Monster Pack Size: \+(\d+)%/);
  const moreCurrency = extractPct(/More Currency: \+(\d+)%/);
  const moreMaps     = extractPct(/More Maps: \+(\d+)%/);
  const moreScarabs  = extractPct(/More Scarabs: \+(\d+)%/);

  let quality = 0, qualityType = 'Standard';
  const qualMatch = text.match(/Quality \(([^)]+)\): \+(\d+)%/);
  if (qualMatch) { qualityType = qualMatch[1]; quality = parseInt(qualMatch[2]); }
  else { const q = text.match(/Quality: \+(\d+)%/); if (q) quality = parseInt(q[1]); }

  const sections  = text.split('--------');
  const modSec    = sections[sections.length - 2] ?? '';
  let modCount = modSec.split('\n').filter((l) => EXPLICIT_MOD_PATTERNS.some((p) => p.test(l))).length;
  if (modCount === 0) {
    if (quantity > 0) modCount++;
    if (rarity > 0) modCount++;
    if (packSize > 0) modCount++;
    if (moreCurrency > 0) modCount++;
    if (moreMaps > 0) modCount++;
    if (moreScarabs > 0) modCount++;
  }

  return { tier, name, quantity, rarity, packSize, quality, qualityType, moreCurrency, moreMaps, moreScarabs, modCount, rawText: text };
};
