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
  chiselUsed: boolean; chiselType: string; chiselPrice: number;
  mapType: '6-mod' | '8-mod';
  isSplitSession: boolean;
  fragmentsUsed: number; smallNodesAllocated: number; mountingModifiers: boolean;
  baseMapCost: number; rollingCostPerMap: number;
  scarabs: ScarabSlot[];
  advChaos: number;
  advExalt: number; advExaltPrice: number;
  advScour: number; advScourPrice: number;
  advAlch: number; advAlchPrice: number;
  advDeliOrbType: string; advDeliOrbQtyPerMap: number; advDeliOrbPriceEach: number;
  // Astrolabe: price per astrolabe × how many used = total cost
  advAstrolabeType: string;
  advAstrolabePrice: number;  // price per astrolabe
  advAstrolabeCount: number;  // how many you used this session (editable any time)
  regexSets: RegexSet[];
  atlasTreeUrl: string;
}

export interface SavedSession {
  id: string; name: string; createdAt: string;
  maps: MapData[]; lootItems: LootItem[];
  baselineItems: LootItem[]; baselineTotal: number;
  settings: SessionSettings;
}
