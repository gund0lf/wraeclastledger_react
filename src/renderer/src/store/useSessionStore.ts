import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MapData, SessionSettings, LootItem, SavedSession, ScarabSlot, ScarabPreset, RegexSet } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { fetchDivinePrice } from '../utils/priceUtils';

const STORE_VERSION = 12;

const DEFAULT_SETTINGS: SessionSettings = {
  divinePrice: 0,
  chiselUsed: false, chiselType: 'Avarice', chiselPrice: 0,
  mapType: '6-mod', isSplitSession: false,
  fragmentsUsed: 0, smallNodesAllocated: 0, mountingModifiers: false,
  baseMapCost: 0, rollingCostPerMap: 0,
  scarabs: Array(5).fill(null).map(() => ({ name: '', cost: 0 })),
  advChaos: 0,
  advExalt: 0, advExaltPrice: 0,
  advScour: 0, advScourPrice: 0,
  advAlch: 0, advAlchPrice: 0,
  advDeliOrbType: '', advDeliOrbQtyPerMap: 0, advDeliOrbPriceEach: 0,
  advAstrolabeType: '', advAstrolabePrice: 0, advAstrolabeCount: 0,
  regexSets: [],
  atlasTreeUrl: 'https://pathofpathing.com',
};

/**
 * Rolling cost = all orb totals + per-map costs × mapCount.
 * Astrolabe: price × count = total session cost. Per-map = (price × count) / mapCount.
 * Deli orbs: qty per map × price each × mapCount.
 * Other orbs: just their total purchase cost (already a session total).
 */
function calcAdvTotal(s: SessionSettings, mapCount: number): number {
  const n              = mapCount || 1;
  const deliTotal      = s.advDeliOrbQtyPerMap * s.advDeliOrbPriceEach * n;
  const astrolabeTotal = s.advAstrolabePrice * s.advAstrolabeCount;
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
  // Remove deprecated fields from older versions
  delete merged['advAstrolabeTotalCost'];
  delete merged['advAstrolabeTotalCount'];

  const savedSessions: Record<string, any> = persisted?.savedSessions ?? {};
  for (const id of Object.keys(savedSessions)) {
    const ss = savedSessions[id].settings ?? {};
    const mergedSs: Record<string, any> = { ...ss };
    for (const key of Object.keys(defaults)) {
      if (mergedSs[key] === undefined) mergedSs[key] = defaults[key];
    }
    delete mergedSs['advAstrolabeTotalCost'];
    delete mergedSs['advAstrolabeTotalCount'];
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
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
      settings: { ...DEFAULT_SETTINGS },
      isWatching: false, savedSessions: {},
      activeSessionId: null, activeSessionName: null, scarabPresets: [],

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

      setLootItems: (items) => set({ lootItems: items }),
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
        const price = await fetchDivinePrice();
        if (price && price > 0)
          set((s) => ({ settings: { ...s.settings, divinePrice: Math.round(price) } }));
      },

      saveAsNewSession: (name) => {
        const { maps, lootItems, baselineItems, baselineTotal, settings } = get();
        const id = new Date().toISOString();
        set((s) => ({
          savedSessions: {
            ...s.savedSessions,
            [id]: { id, name, createdAt: id, maps: [...maps], lootItems: [...lootItems], baselineItems: [...baselineItems], baselineTotal, settings: { ...settings } },
          },
          activeSessionId: id, activeSessionName: name,
        }));
      },
      updateCurrentSession: () => {
        const { maps, lootItems, baselineItems, baselineTotal, settings, activeSessionId, activeSessionName, savedSessions } = get();
        if (!activeSessionId || !savedSessions[activeSessionId]) return;
        set((s) => ({
          savedSessions: {
            ...s.savedSessions,
            [activeSessionId]: { ...s.savedSessions[activeSessionId], name: activeSessionName ?? s.savedSessions[activeSessionId].name, maps: [...maps], lootItems: [...lootItems], baselineItems: [...baselineItems], baselineTotal, settings: { ...settings } },
          },
        }));
      },
      loadSession: (id) => {
        const session = get().savedSessions[id];
        if (!session) return;
        set({
          maps: [...session.maps], lootItems: [...session.lootItems],
          baselineItems: [...(session.baselineItems ?? [])], baselineTotal: session.baselineTotal ?? 0,
          settings: { ...DEFAULT_SETTINGS, ...session.settings },
          activeSessionId: id, activeSessionName: session.name, isWatching: false,
        });
      },
      deleteSession: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.savedSessions;
          return { savedSessions: rest, activeSessionId: s.activeSessionId === id ? null : s.activeSessionId, activeSessionName: s.activeSessionId === id ? null : s.activeSessionName };
        }),
      renameSession: (id, newName) =>
        set((s) => ({
          savedSessions: { ...s.savedSessions, [id]: { ...s.savedSessions[id], name: newName } },
          activeSessionName: s.activeSessionId === id ? newName : s.activeSessionName,
        })),
      newSession: () =>
        set({ maps: [], lootItems: [], baselineItems: [], baselineTotal: 0, settings: { ...DEFAULT_SETTINGS }, activeSessionId: null, activeSessionName: null, isWatching: false }),

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
    }),
    {
      name: 'map-tracker-storage',
      version: STORE_VERSION,
      migrate: migrateState,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
