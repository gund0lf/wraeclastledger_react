export interface ScarabSlot { name: string; cost: number; }
export interface ScarabPreset { id: string; name: string; scarabs: ScarabSlot[]; }

export interface LootItem {
  id: string; name: string; tab: string;
  quantity: string; price: string; total: number; excluded: boolean;
}

export interface MapData {
  id: string; tier: number; name: string;
  quantity: number; rarity: number; packSize: number;
  quality: number; qualityType: string;
  moreCurrency: number; moreMaps: number; moreScarabs: number;
  modCount: number;
  // Map subtypes — detected from clipboard tooltip
  isOriginator: boolean;      // Originator's Memories implicit (16.5 maps)
  isEmpoweredMirage: boolean; // Empowered Mirage enchant
  isNightmare: boolean;       // Nightmare Map item type
  isCorrupted: boolean;       // Corrupted
  rawText?: string;
}

export interface RegexSet {
  id: string;
  label: string;
  type: 'run' | 'slam' | 'sinistral' | 'dextral' | 'other';
  lines: string[];
}

export interface SessionSettings {
  divinePrice: number;
  // chiselType: '' = no chisel; any value = that chisel is used
  chiselUsed: boolean; chiselType: string; chiselPrice: number;
  mapType: '6-mod' | '8-mod';
  // isSplitSession is derived from advSplitPrice > 0; kept for compat
  isSplitSession: boolean;
  fragmentsUsed: number; smallNodesAllocated: number; mountingModifiers: boolean;
  baseMapCost: number; rollingCostPerMap: number;
  scarabs: ScarabSlot[];
  atlasBonus: boolean;   // Atlas Bonus: flat +25% IIQ on all maps (introduced in Mirage League)
  advChaos: number;
  advExalt: number; advExaltPrice: number;
  advScour: number; advScourPrice: number;
  advAlch: number; advAlchPrice: number;
  advDeliOrbType: string; advDeliOrbQtyPerMap: number; advDeliOrbPriceEach: number;
  // Split: price per split op (beast/fossil). If > 0, split session is active.
  advSplitPrice: number;
  // Astrolabe
  advAstrolabeType: string; advAstrolabePrice: number; advAstrolabeCount: number;
  // Gem leveling — tracked separately from map profit
  advGemCount: number;
  advGemBuyPrice: number;  // buy price per gem (level 1)
  advGemSellPrice: number; // expected sell price per gem (leveled)
  advGemName: string;      // optional: used to auto-exclude matching items from loot CSV
  // Regex exclusion terms (editable, used in generated regex)
  regexExclusions: string[];
  regexSets: RegexSet[];
  atlasTreeUrl: string;
  leagueName: string;          // Current league, auto-detected from poe.ninja
  atlasDetectedTags: string[]; // Tags inferred from atlas tree node group titles
}

export interface SavedSession {
  id: string; name: string; createdAt: string;
  maps: MapData[]; lootItems: LootItem[];
  baselineItems: LootItem[]; baselineTotal: number;
  settings: SessionSettings;
  notes?: string;
}
