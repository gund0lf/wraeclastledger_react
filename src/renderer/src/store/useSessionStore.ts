import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MapData, SessionSettings, LootItem, SavedSession, ScarabSlot, ScarabPreset, RegexSet } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { fetchDivinePrice, sanitizeExclusionTerms } from '../utils/priceUtils';
import { getCurrentLeague } from '../utils/league';

const STORE_VERSION = 14;

const DEFAULT_SETTINGS: SessionSettings = {
  divinePrice: 0,
  chiselUsed: false, chiselType: '', chiselPrice: 0,
  mapType: '6-mod', isSplitSession: false,
  fragmentsUsed: 0, smallNodesAllocated: 0, mountingModifiers: false,
  baseMapCost: 0, rollingCostPerMap: 0,
  scarabs: Array(5).fill(null).map(() => ({ name: '', cost: 0 })),
  atlasBonus: true,   // Atlas Bonus: +25% flat IIQ on all maps
  leagueName: '',      // auto-populated on startup via poe.ninja
  atlasDetectedTags: [],
  advChaos: 0,
  advExalt: 0, advExaltPrice: 0,
  advScour: 0, advScourPrice: 0,
  advAlch: 0, advAlchPrice: 0,
  advDeliOrbType: '', advDeliOrbQtyPerMap: 0, advDeliOrbPriceEach: 0,
  advSplitPrice: 0,
  advAstrolabeType: '', advAstrolabePrice: 0, advAstrolabeCount: 0,
  advGemCount: 0, advGemBuyPrice: 0, advGemSellPrice: 0, advGemName: '',
  regexExclusions: [],
  regexSets: [],
  atlasTreeUrl: 'https://pathofpathing.com',
};

function calcAdvTotal(s: SessionSettings, mapCount: number): number {
  const n              = mapCount || 1;
  const deliTotal      = s.advDeliOrbQtyPerMap * s.advDeliOrbPriceEach * n;
  const astrolabeTotal = s.advAstrolabePrice * s.advAstrolabeCount;
  // NOTE: gems are intentionally excluded — gem leveling is side income, not map investment
  return s.advChaos
    + s.advExaltPrice
    + s.advScourPrice
    + s.advAlchPrice
    + deliTotal
    + astrolabeTotal;
}

function migrateState(persisted: any): any {
  const s = persisted?.settings ?? {};
  const defaults = DEFAULT_SETTINGS as Record<string, any>;
  const merged: Record<string, any> = { ...s };
  for (const key of Object.keys(defaults)) {
    if (merged[key] === undefined) merged[key] = defaults[key];
  }
  delete merged['advAstrolabeTotalCost'];
  delete merged['advAstrolabeTotalCount'];
  // v13→v14: mirageBonus renamed to atlasBonus — carry the old value over if present
  if (merged['mirageBonus'] !== undefined && merged['atlasBonus'] === undefined) {
    merged['atlasBonus'] = merged['mirageBonus'];
  }
  delete merged['mirageBonus'];

  // Sanitize regexExclusions — remove any corrupted entries that contain full regex fragments
  if (Array.isArray(merged['regexExclusions'])) {
    merged['regexExclusions'] = sanitizeExclusionTerms(merged['regexExclusions']);
  }

  // Sanitize defaultExclusionPreset too
  if (Array.isArray(persisted?.defaultExclusionPreset)) {
    persisted.defaultExclusionPreset = sanitizeExclusionTerms(persisted.defaultExclusionPreset);
  }

  const savedSessions: Record<string, any> = persisted?.savedSessions ?? {};
  for (const id of Object.keys(savedSessions)) {
    const ss = savedSessions[id].settings ?? {};
    const mergedSs: Record<string, any> = { ...ss };
    for (const key of Object.keys(defaults)) {
      if (mergedSs[key] === undefined) mergedSs[key] = defaults[key];
    }
    delete mergedSs['advAstrolabeTotalCost'];
    delete mergedSs['advAstrolabeTotalCount'];
    // v13→v14: carry mirageBonus → atlasBonus for saved sessions too
    if (mergedSs['mirageBonus'] !== undefined && mergedSs['atlasBonus'] === undefined) {
      mergedSs['atlasBonus'] = mergedSs['mirageBonus'];
    }
    delete mergedSs['mirageBonus'];
    // Sanitize saved session regexExclusions
    if (Array.isArray(mergedSs['regexExclusions'])) {
      mergedSs['regexExclusions'] = sanitizeExclusionTerms(mergedSs['regexExclusions']);
    }
    savedSessions[id] = { ...savedSessions[id], settings: mergedSs };
  }

  return { ...persisted, settings: merged as SessionSettings, savedSessions };
}

interface SessionState {
  maps: MapData[];
  lootItems: LootItem[];
  baselineItems: LootItem[];
  baselineTotal: number;
  settings: SessionSettings;
  isWatching: boolean;
  savedSessions: Record<string, SavedSession>;
  activeSessionId: string | null;
  activeSessionName: string | null;
  scarabPresets: ScarabPreset[];
  sessionNotes: string;
  // Persistent default exclusion preset — survives newSession(), applied on strategy load
  defaultExclusionPreset: string[];
  // Loaded strategy preview
  loadedStrategyInfo: {
    authorName: string; mapCount: number;
    avgQuant: number; avgRarity: number; avgPack: number; avgCurr: number;
    runRegex: string; slamRegex?: string;
    mapType?: string;
  } | null;

  addMap: (map: Omit<MapData, 'id'>) => void;
  removeMap: (id: string) => void;
  undoLastMap: () => void;
  clearMaps: () => void;
  clearSession: () => void;
  toggleWatch: () => void;
  updateSetting: <K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) => void;
  updateAdvSetting: <K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) => void;
  updateScarab: (index: number, field: keyof ScarabSlot, value: string | number) => void;
  clearScarab: (index: number) => void;
  setLootItems: (items: LootItem[]) => void;
  setBaselineItems: (items: LootItem[]) => void;
  setBaselineTotal: (total: number) => void;
  toggleLootItemExcluded: (id: string) => void;
  clearLoot: () => void;
  initDivinePrice: () => Promise<void>;
  saveAsNewSession: (name: string) => void;
  updateCurrentSession: () => void;
  loadSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, newName: string) => void;
  newSession: () => void;
  saveScarabPreset: (name: string) => void;
  loadScarabPreset: (id: string) => void;
  deleteScarabPreset: (id: string) => void;
  saveRegexSet: (set: Omit<RegexSet, 'id'>) => void;
  deleteRegexSet: (id: string) => void;
  setDefaultPreset: () => void; // saves current regexExclusions as persistent default
  setSessionNotes: (notes: string) => void;
  setLoadedStrategyInfo: (info: SessionState['loadedStrategyInfo']) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
      settings: { ...DEFAULT_SETTINGS },
      isWatching: false, savedSessions: {},
      activeSessionId: null, activeSessionName: null, scarabPresets: [],
      sessionNotes: '', loadedStrategyInfo: null, defaultExclusionPreset: [],

      addMap: (m) => set((s) => ({ maps: [...s.maps, { ...m, id: uuidv4() }] })),
      removeMap: (id) => set((s) => ({ maps: s.maps.filter((m) => m.id !== id) })),
      undoLastMap: () => set((s) => ({ maps: s.maps.slice(0, -1) })),
      clearMaps: () => set({ maps: [] }),
      clearSession: () => set({ maps: [], lootItems: [], baselineItems: [], baselineTotal: 0 }),
      toggleWatch: () => set((s) => ({ isWatching: !s.isWatching })),

      updateSetting: (key, value) =>
        set((s) => ({ settings: { ...s.settings, [key]: value } })),

      updateAdvSetting: (key, value) =>
        set((s) => {
          const ns = { ...s.settings, [key]: value };
          const mapCount = s.maps.length || 1;
          ns.rollingCostPerMap = parseFloat(calcAdvTotal(ns, mapCount).toFixed(2));
          // Sync isSplitSession from advSplitPrice
          ns.isSplitSession = ns.advSplitPrice > 0;
          return { settings: ns };
        }),

      updateScarab: (index, field, value) =>
        set((s) => {
          const sc = [...s.settings.scarabs];
          sc[index] = { ...sc[index], [field]: value };
          return { settings: { ...s.settings, scarabs: sc } };
        }),
      clearScarab: (index) =>
        set((s) => {
          const sc = [...s.settings.scarabs];
          sc[index] = { name: '', cost: 0 };
          return { settings: { ...s.settings, scarabs: sc } };
        }),

      setLootItems: (items) => {
        // Auto-exclude gems if a gem name is configured
        const gemName = get().settings.advGemName?.trim().toLowerCase();
        const processed = gemName
          ? items.map((i) => ({ ...i, excluded: i.excluded || i.name.toLowerCase().includes(gemName) }))
          : items;
        set({ lootItems: processed });
      },
      setBaselineItems: (items) => set({
        baselineItems: items,
        baselineTotal: items.reduce((a, b) => a + b.total, 0),
      }),
      setBaselineTotal: (total) => set({ baselineTotal: total }),
      toggleLootItemExcluded: (id) =>
        set((s) => ({ lootItems: s.lootItems.map((i) => i.id === id ? { ...i, excluded: !i.excluded } : i) })),
      clearLoot: () => set({ lootItems: [], baselineItems: [], baselineTotal: 0 }),

      initDivinePrice: async () => {
        const current = get().settings.divinePrice;
        if (current !== 0 && current !== 200) return;
        // Fetch league and price in parallel — both use poe.ninja
        const [league, price] = await Promise.all([getCurrentLeague(), fetchDivinePrice()]);
        set((s) => ({
          settings: {
            ...s.settings,
            ...(price && price > 0 ? { divinePrice: Math.round(price) } : {}),
            ...(league ? { leagueName: league } : {}),
          },
        }));
      },

      saveAsNewSession: (name) => {
        const { maps, lootItems, baselineItems, baselineTotal, settings, sessionNotes } = get();
        const id = new Date().toISOString();
        set((s) => ({
          savedSessions: { ...s.savedSessions, [id]: { id, name, createdAt: id, maps: [...maps], lootItems: [...lootItems], baselineItems: [...baselineItems], baselineTotal, settings: { ...settings }, notes: sessionNotes } },
          activeSessionId: id, activeSessionName: name,
        }));
      },
      updateCurrentSession: () => {
        const { maps, lootItems, baselineItems, baselineTotal, settings, sessionNotes, activeSessionId, activeSessionName, savedSessions } = get();
        if (!activeSessionId || !savedSessions[activeSessionId]) return;
        set((s) => ({
          savedSessions: { ...s.savedSessions, [activeSessionId]: { ...s.savedSessions[activeSessionId], name: activeSessionName ?? s.savedSessions[activeSessionId].name, maps: [...maps], lootItems: [...lootItems], baselineItems: [...baselineItems], baselineTotal, settings: { ...settings }, notes: sessionNotes } },
        }));
      },
      loadSession: (id) => {
        const session = get().savedSessions[id];
        if (!session) return;
        const maps = session.maps.map((m) => {
          // Re-detect subtype flags from rawText when they weren't set at parse time
          // (sessions saved before 1.0.9 have all flags as false/undefined)
          const raw = m.rawText ?? '';
          const needsRedetect = !m.isOriginator && !m.isEmpoweredMirage && !m.isNightmare && raw.length > 0;
          return {
            isOriginator: false, isEmpoweredMirage: false,
            isNightmare: false,  isCorrupted: false,
            ...m,
            ...(needsRedetect ? {
              isOriginator:     raw.includes("Originator's Memories"),
              isEmpoweredMirage: raw.includes('Empowered Mirage which covers the entire Map'),
              isNightmare:      raw.includes('Nightmare Map'),
              isCorrupted:      /\bCorrupted\b/.test(raw),
            } : {}),
          };
        });
        set({ maps, lootItems: [...session.lootItems], baselineItems: [...(session.baselineItems ?? [])], baselineTotal: session.baselineTotal ?? 0, settings: { ...DEFAULT_SETTINGS, ...session.settings }, sessionNotes: session.notes ?? '', activeSessionId: id, activeSessionName: session.name, isWatching: false });
      },
      deleteSession: (id) =>
        set((s) => { const { [id]: _, ...rest } = s.savedSessions; return { savedSessions: rest, activeSessionId: s.activeSessionId === id ? null : s.activeSessionId, activeSessionName: s.activeSessionId === id ? null : s.activeSessionName }; }),
      renameSession: (id, newName) =>
        set((s) => ({ savedSessions: { ...s.savedSessions, [id]: { ...s.savedSessions[id], name: newName } }, activeSessionName: s.activeSessionId === id ? newName : s.activeSessionName })),
      newSession: () =>
        set({ maps: [], lootItems: [], baselineItems: [], baselineTotal: 0, sessionNotes: '', settings: { ...DEFAULT_SETTINGS }, activeSessionId: null, activeSessionName: null, isWatching: false, loadedStrategyInfo: null }),

      saveScarabPreset: (name) => {
        const p: ScarabPreset = { id: uuidv4(), name, scarabs: get().settings.scarabs.map((s) => ({ ...s })) };
        set((s) => ({ scarabPresets: [...s.scarabPresets, p] }));
      },
      loadScarabPreset: (id) => {
        const p = get().scarabPresets.find((p) => p.id === id);
        if (!p) return;
        set((s) => ({ settings: { ...s.settings, scarabs: p.scarabs.map((sc) => ({ ...sc })) } }));
      },
      deleteScarabPreset: (id) =>
        set((s) => ({ scarabPresets: s.scarabPresets.filter((p) => p.id !== id) })),
      saveRegexSet: (regexSet) => {
        const ns: RegexSet = { ...regexSet, id: uuidv4() };
        set((s) => ({ settings: { ...s.settings, regexSets: [...(s.settings.regexSets ?? []), ns] } }));
      },
      deleteRegexSet: (id) =>
        set((s) => ({ settings: { ...s.settings, regexSets: (s.settings.regexSets ?? []).filter((r) => r.id !== id) } })),
      setDefaultPreset: () =>
        // Save current session exclusions as the persistent default
        set((s) => ({ defaultExclusionPreset: [...s.settings.regexExclusions] })),
      setSessionNotes: (notes) => set({ sessionNotes: notes }),
      setLoadedStrategyInfo: (info) =>
        set((s) => ({
          loadedStrategyInfo: info,
          // Apply persistent default exclusions when a strategy is loaded
          settings: info
            ? { ...s.settings, regexExclusions: [...s.defaultExclusionPreset] }
            : s.settings,
        })),
    }),
    { name: 'map-tracker-storage', version: STORE_VERSION, migrate: migrateState, storage: createJSONStorage(() => localStorage) }
  )
);
