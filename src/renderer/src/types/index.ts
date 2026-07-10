export interface ScarabSlot { name: string; cost: number; }
export interface ScarabPreset { id: string; name: string; scarabs: ScarabSlot[]; }
/** Named brick-exclusion term list (Regex panel). User-scoped, top-level +
 *  additive store field — persist's shallow merge defaults it to [] for old
 *  stores (no migration needed). */
export interface ExclusionPreset { id: string; name: string; terms: string[]; }

export interface LootItem {
  id: string; name: string; tab: string;
  quantity: string; price: string; total: number; excluded: boolean;
}

export interface MapData {
  id: string; tier: number; name: string;
  quantity: number; rarity: number; packSize: number;
  quality: number; qualityType: string;
  moreCurrency: number; moreMaps: number; moreScarabs: number;
  moreDivCards: number; // "More Divination Cards: +N%" — its own drop pool, NOT currency (added post-1.0.62; old persisted maps lack it, consumers must ?? 0)
  modCount: number;
  /** Epoch ms when the map was parsed from the clipboard (WP9 Tier 0, added post-1.0.62).
   *  Additive — old persisted maps lack it; consumers must treat it as optional. */
  parsedAt?: number;
  // Map subtypes — detected from clipboard tooltip
  isOriginator: boolean;      // Originator's Memories implicit (16.5 maps)
  isEmpoweredMirage: boolean; // Empowered Mirage enchant
  isNightmare: boolean;       // Nightmare Map item type
  isCorrupted: boolean;       // Corrupted
  /** Map was captured unidentified (mods unrevealed — modCount is 0, not "no mods").
   *  Additive post-1.0.62; old persisted maps lack it, consumers must treat as optional. */
  isUnidentified?: boolean;
  rawText?: string;
}

export interface RegexSet {
  id: string;
  label: string;
  type: 'run' | 'slam' | 'other';
  lines: string[];
  isDefault?: boolean; // pinned to top of saved sets, applied when loading strategies
}

export interface SessionSettings {
  divinePrice: number;
  // chiselType: '' = no chisel; any value = that chisel is used
  chiselUsed: boolean; chiselType: string; chiselPrice: number;
  mapType: '6-mod' | '8-mod';
  // isSplitSession is derived from advSplitPrice > 0; kept for compat
  isSplitSession: boolean;
  fragmentsUsed: number; smallNodesAllocated: number; mountingModifiers: boolean;
  // rollingCostPerMap was removed in store v16 — the session total is derived
  // live via computeRollingSessionTotal (the stored value went stale by design).
  baseMapCost: number;
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
  // regexSets and discordTag moved to TOP-LEVEL store state in v16 — they are
  // user-scoped, not session-scoped (loadSession used to revert them).
  atlasTreeUrl: string;
  /** Atlas passive points read live from the pathofpathing webview
   *  (#skillTreeNormalNodeCount / ...Maximum spans). Additive post-1.0.6x —
   *  old persisted sessions lack them; migrateState fills null. null = never
   *  captured (no tree loaded). Shared as author-declared context only —
   *  NEVER load-bearing for any calculation. */
  atlasPoints: number | null;
  atlasPointsMax: number | null;
  leagueName: string;          // Current league, auto-detected from poe.ninja
  atlasDetectedTags: string[]; // Tags inferred from atlas tree node group titles
}

export interface SavedSession {
  id: string; name: string; createdAt: string;
  maps: MapData[]; lootItems: LootItem[];
  baselineItems: LootItem[]; baselineTotal: number;
  settings: SessionSettings;
  notes?: string;
  // Double-count correction the user applied to THIS session (WP11 / C, additive).
  // Persisted so the correction survives save/load and never bleeds across
  // sessions via the top-level store slot. Absent on pre-C saves -> 0 / false.
  investmentNeutralization?: number;
  investmentDismissed?: boolean;
}
