import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist, type PersistStorage } from 'zustand/middleware';
import { MapData, SessionSettings, LootItem, SavedSession, ScarabSlot, ScarabPreset, RegexSet, ExclusionPreset, LeagueCloseouts } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { tryFetchDivinePrice, sanitizeExclusionTerms } from '../utils/priceUtils';
import { confirmedLeagueSync, getCurrentLeague, normalizeLeagueOverride, setLeagueOverrideValue } from '../utils/league';
import { ModGroupState, cloneDefaultGroups } from '../utils/regexBuilderPresets';
import { isRetrospectiveLeague, normalizeLeagueKey } from '../utils/retrospectives';

const STORE_VERSION = 17;

// WP4.2: divine price older than this is refreshed on the next init.
const DIVINE_PRICE_STALE_MS = 30 * 60_000;

// Exported for useSessionStore.migrate.test.ts — not for component use.
export const DEFAULT_SETTINGS: SessionSettings = {
  divinePrice: 0,
  chiselUsed: false, chiselType: '', chiselPrice: 0,
  mapType: '6-mod', isSplitSession: false,
  fragmentsUsed: 0, smallNodesAllocated: 0, mountingModifiers: false,
  baseMapCost: 0,
  scarabs: Array(5).fill(null).map(() => ({ name: '', cost: 0 })),
  atlasBonus: false,  // Atlas Bonus session snapshot. Seeded per-league from atlasBonusByLeague on a new live session; per-league progress is top-level, not here.
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
  atlasTreeUrl: 'https://pathofpathing.com',
  atlasPoints: null, atlasPointsMax: null, // captured by AtlasTreeModule; null = no tree read yet
  // Versioning client half: null = normal session; uuid = update run (see types/index.ts)
  updateTargetStrategyId: null, updateTargetStrategyName: null,
};

// v16: user-scoped fields lifted OUT of SessionSettings so loadSession can
// never revert them to a saved session's historical values.
const DEFAULT_DISCORD_TAG = '';
const DEFAULT_REGEX_SETS: RegexSet[] = [];

// ── Debounced persist storage (write-amplification interim, pre-WP14) ───────
// Zustand persist calls storage.setItem on EVERY set(). With createJSONStorage
// the full store — including every saved session — was JSON.stringify'd and
// written to localStorage per Notes keystroke / pause toggle (~1MB each).
// This custom PersistStorage defers BOTH the stringify and the write: setItem
// only stashes the latest state reference (immutable snapshot, so it stays
// correct) and serialization happens once per debounce window / on flush.
// WP14 (sessions-as-files) removes the need for this entirely.
const PERSIST_DEBOUNCE_MS = 1000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: { name: string; value: unknown } | null = null;

/** Write any pending debounced persist immediately. Safe to call anytime. */
export function flushPersist(): void {
  if (persistTimer !== null) { clearTimeout(persistTimer); persistTimer = null; }
  if (pendingPersist === null) return;
  const { name, value } = pendingPersist;
  pendingPersist = null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(name, JSON.stringify(value));
  } catch (e) {
    // Surface loudly — a swallowed quota error here would mean silent data loss.
    console.error('[Persist] localStorage write FAILED (quota?):', e);
    throw e;
  }
}

const debouncedStorage: PersistStorage<unknown> = {
  getItem: (name) => {
    if (typeof localStorage === 'undefined') return null;
    const str = localStorage.getItem(name);
    return str ? JSON.parse(str) : null;
  },
  setItem: (name, value) => {
    pendingPersist = { name, value };
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => { persistTimer = null; flushPersist(); }, PERSIST_DEBOUNCE_MS);
  },
  removeItem: (name) => {
    if (persistTimer !== null) { clearTimeout(persistTimer); persistTimer = null; }
    pendingPersist = null;
    if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
  },
};

/** Strip rawText from a MapData before persisting — flags are materialised first so re-detection on load still works. */
function stripRawText(m: MapData): MapData {
  const raw = (m as any).rawText as string | undefined ?? '';
  // Ensure subtype flags are populated before discarding rawText
  const patched: MapData = {
    ...m,
    isOriginator:      m.isOriginator      || raw.includes("Originator's Memories"),
    isEmpoweredMirage: m.isEmpoweredMirage  || raw.includes('Empowered Mirage which covers the entire Map'),
    isNightmare:       m.isNightmare        || raw.includes('Nightmare Map'),
    isCorrupted:       m.isCorrupted        || /\bCorrupted\b/.test(raw),
  };
  delete (patched as any).rawText;
  return patched;
}

function migrateState(persisted: any): any {
  // v14→v15: replace investmentNeutralization === -1 sentinel with explicit investmentDismissed boolean
  if (persisted?.investmentNeutralization === -1) {
    persisted.investmentNeutralization = 0;
    persisted.investmentDismissed = true;
  }
  if (persisted?.investmentDismissed === undefined) {
    persisted.investmentDismissed = false;
  }

  const s = persisted?.settings ?? {};
  const defaults = DEFAULT_SETTINGS as Record<string, any>;
  const merged: Record<string, any> = { ...s };
  // v13→v14: mirageBonus renamed to atlasBonus — carry the old value over if
  // present. MUST run BEFORE the defaults fill: the fill sets atlasBonus to the
  // default (false), which made the old carry-after-fill dead code (bug found
  // by useSessionStore.migrate.test.ts, fixed 2026-07-03).
  if (merged['mirageBonus'] !== undefined && merged['atlasBonus'] === undefined) {
    merged['atlasBonus'] = merged['mirageBonus'];
  }
  delete merged['mirageBonus'];
  for (const key of Object.keys(defaults)) {
    if (merged[key] === undefined) merged[key] = defaults[key];
  }
  delete merged['advAstrolabeTotalCost'];
  delete merged['advAstrolabeTotalCount'];
  // v15→v16: discordTag + regexSets lifted from SessionSettings to TOP-LEVEL
  // store state (loadSession used to revert them to the saved session's
  // historical values). Lift the values, then drop the settings-level keys.
  if (persisted?.discordTag === undefined) {
    persisted.discordTag = typeof merged['discordTag'] === 'string' ? merged['discordTag'] : DEFAULT_DISCORD_TAG;
  }
  if (persisted?.regexSets === undefined) {
    persisted.regexSets = Array.isArray(merged['regexSets']) ? merged['regexSets'] : DEFAULT_REGEX_SETS;
  }
  delete merged['discordTag'];
  delete merged['regexSets'];
  // v15→v16: stored rollingCostPerMap removed — it froze at the map count of
  // the last Advanced Costs edit; the live value comes from computeRollingSessionTotal.
  delete merged['rollingCostPerMap'];

  // v16→v17: Atlas Bonus becomes per-league (top-level atlasBonusByLeague).
  // One-time seed: carry the legacy boolean into the map ONLY from a genuinely
  // LIVE unsaved session (activeSessionId null) and only when it was ON and its
  // league is known — a stale historical session that happened to be open must
  // NOT define the current league's progress, and legacy OFF stays absent so the
  // one-time prompt can still appear. Saved sessions are never rewritten.
  if (persisted?.atlasBonusByLeague === undefined) {
    const seeded: Record<string, boolean> = {};
    const liveUnsaved = persisted?.activeSessionId == null;
    const legacyLeague = typeof merged['leagueName'] === 'string' ? merged['leagueName'] : '';
    if (liveUnsaved && merged['atlasBonus'] === true && legacyLeague) {
      seeded[legacyLeague] = true;
    }
    persisted.atlasBonusByLeague = seeded;
  }

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
    // v13→v14 carry for saved sessions — same before-the-fill ordering as above
    if (mergedSs['mirageBonus'] !== undefined && mergedSs['atlasBonus'] === undefined) {
      mergedSs['atlasBonus'] = mergedSs['mirageBonus'];
    }
    delete mergedSs['mirageBonus'];
    for (const key of Object.keys(defaults)) {
      if (mergedSs[key] === undefined) mergedSs[key] = defaults[key];
    }
    delete mergedSs['advAstrolabeTotalCost'];
    delete mergedSs['advAstrolabeTotalCount'];
    // v15→v16: saved sessions lose the user-scoped keys too — loadSession
    // spreads session.settings, so leftovers would resurrect them as strays.
    delete mergedSs['discordTag'];
    delete mergedSs['regexSets'];
    delete mergedSs['rollingCostPerMap'];
    // Sanitize saved session regexExclusions
    if (Array.isArray(mergedSs['regexExclusions'])) {
      mergedSs['regexExclusions'] = sanitizeExclusionTerms(mergedSs['regexExclusions']);
    }
    savedSessions[id] = { ...savedSessions[id], settings: mergedSs };
  }

  return { ...persisted, settings: merged as SessionSettings, savedSessions };
}

// Exported for useSessionStore.migrate.test.ts.
export { migrateState };

interface SessionState {
  maps: MapData[];
  lootItems: LootItem[];
  baselineItems: LootItem[];
  baselineTotal: number;
  settings: SessionSettings;
  // v16: user-scoped, survive loadSession/newSession untouched
  discordTag: string;   // used to highlight own strategies in the browser
  regexSets: RegexSet[];
  // Manual league override (rollover plan D4/D5): null = auto-detect. User-scoped,
  // top-level + additive (persist shallow-merge defaults it to null — no migration).
  // Mirrored into utils/league.ts module state (seeded below + on every set).
  leagueOverride: string | null;
  // Atlas Bonus per-league progress (user-scoped, top-level so it never rewrites
  // saved-session history). Key = league name. Absent = not handled this league
  // (prompt-eligible); true = enabled; false = deliberately off/dismissed. A new
  // LIVE session seeds settings.atlasBonus from the ACTIVE league's value (?? false);
  // loaded historical sessions keep their own snapshot untouched. Additive
  // top-level; a one-time v17 migration seeds a legacy live-session value.
  atlasBonusByLeague: Record<string, boolean>;
  // Local Personal-retrospective markers. The normalized league key is
  // permanent cross-repo identity; session payloads remain in savedSessions
  // and are never copied into this preference index.
  retrospectiveCloseouts: LeagueCloseouts;
  // Transient: a new live session was created before the active league was known,
  // so its Atlas Bonus still needs seeding once detection resolves — but only if
  // the user hasn't already made a choice (which clears this). Never seeds under
  // an unknown/fallback league.
  pendingAtlasBonusSeed: boolean;
  // Transient: the user set Atlas Bonus BEFORE the active league was confirmed.
  // null = no such pending choice. On confirmation, this value is written to the
  // resolved league's map (so a pre-confirmation choice is retained, not lost to
  // the live session only). Mutually exclusive with pendingAtlasBonusSeed.
  pendingAtlasBonusValue: boolean | null;
  // Set the Atlas Bonus for the CURRENT session; for a live session it also
  // records the choice under the active league (when known) and clears any
  // pending seed. Historical sessions only change their own snapshot.
  setAtlasBonus: (value: boolean) => void;
  setPersonalLeagueCloseout: (leagueName: string, cutoffUtc: string) => void;
  removePersonalLeagueCloseout: (leagueName: string) => void;
  // WP8: Regex Builder workspace — user-scoped preference, survives
  // loadSession/newSession (not in SessionSettings, not a session snapshot).
  // Additive top-level + no partialize => persist's shallow merge defaults it
  // to cloneDefaultGroups() for old stores (no migration needed).
  regexBuilderGroups: ModGroupState[];
  isWatching: boolean;
  savedSessions: Record<string, SavedSession>;
  activeSessionId: string | null;
  activeSessionName: string | null;
  sessionNonce: number; // bumps on every newSession() so the UI can detect a fresh session even when activeSessionId stays null (unsaved -> unsaved)
  scarabPresets: ScarabPreset[];
  sessionNotes: string;
  // Epoch ms of the last SUCCESSFUL divine-price fetch. Top-level (not in
  // settings): staleness is a fact about the fetch, not about the session.
  // Additive — persist's shallow merge fills it with 0 for old stores.
  divinePriceFetchedAt: number;
  investmentNeutralization: number; // amount added back to lootGain from auto-detected investment losses
  investmentDismissed: boolean;      // true when user dismissed the detection banner without neutralising
  // WP7: first-run onboarding card dismissed. Top-level + additive - persist's
  // shallow merge defaults it to false for old stores (no migration needed).
  onboardingDismissed: boolean;
  // Persistent default exclusion preset — survives newSession(), applied on strategy load
  defaultExclusionPreset: string[];
  // Named exclusion presets for rotation (Sad 2026-07-09). User-scoped,
  // top-level + additive — persist's shallow merge defaults [] (no migration).
  exclusionPresets: ExclusionPreset[];
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
  // initDivinePrice: cooldown-gated by default. Pass { force: true } to bypass
  // the 60s cooldown — used by the manual refresh button in InvestmentModule.
  // HISTORICAL-SESSION PROTECTION (rollover plan Phase 1.5, 2026-07-11): a
  // LOADED saved session (activeSessionId set) is historical data and is
  // NEVER auto-repriced — same league or not; prices move within a league
  // too. Only the explicit reprice confirmation flow passes
  // { repriceLoaded: true }, and even then leagueName stays untouched
  // (league is session provenance, never a side effect of a price quote).
  initDivinePrice: (opts?: { force?: boolean; repriceLoaded?: boolean }) => Promise<void>;
  /** Manual divine-price entry — sets the price AND marks it fresh so the
   *  30-min staleness auto-refresh doesn't overwrite a hand-typed value. */
  setDivinePriceManual: (v: number) => void;
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
  setRegexBuilderGroups: (groups: ModGroupState[]) => void;
  setDiscordTag: (tag: string) => void;
  setLeagueOverride: (league: string | null) => void;
  setDefaultPreset: () => void; // saves current regexExclusions as persistent default
  clearDefaultPreset: () => void;
  saveExclusionPreset: (name: string) => void;
  loadExclusionPreset: (id: string) => void;
  deleteExclusionPreset: (id: string) => void;
  setSessionNotes: (notes: string) => void;
  setInvestmentNeutralization: (v: number) => void;
  setInvestmentDismissed: (v: boolean) => void;
  dismissOnboarding: () => void;
  setLoadedStrategyInfo: (info: SessionState['loadedStrategyInfo']) => void;
  importSessions: (sessions: SavedSession[], conflictMode: 'skip' | 'overwrite') => void;
}

/** Capture is a runtime device state, never a restart preference. Persist still
 * stores the unchanged wire object for compatibility, but hydration forcibly
 * resets the watcher before any component can ask the main process to start. */
export function mergePersistedSessionState(
  persistedState: unknown,
  currentState: SessionState,
): SessionState {
  return {
    ...currentState,
    ...((persistedState ?? {}) as Partial<SessionState>),
    isWatching: false,
  };
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
      settings: { ...DEFAULT_SETTINGS },
      discordTag: DEFAULT_DISCORD_TAG, regexSets: [...DEFAULT_REGEX_SETS],
      leagueOverride: null,
      atlasBonusByLeague: {},
      retrospectiveCloseouts: {},
      pendingAtlasBonusSeed: false,
      pendingAtlasBonusValue: null,
      regexBuilderGroups: cloneDefaultGroups(),
      isWatching: false, savedSessions: {},
      activeSessionId: null, activeSessionName: null, scarabPresets: [], sessionNonce: 0,
      divinePriceFetchedAt: 0,
      sessionNotes: '', investmentNeutralization: 0, investmentDismissed: false, onboardingDismissed: false, loadedStrategyInfo: null, defaultExclusionPreset: [], exclusionPresets: [],

      // parsedAt: WP9 Tier 0 — epoch ms timestamp on every parsed map (additive, no migration needed)
      addMap: (m) => set((s) => ({ maps: [...s.maps, { ...m, id: uuidv4(), parsedAt: Date.now() }] })),
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
          // Sync isSplitSession from advSplitPrice. (The old rollingCostPerMap
          // recalc side effect is gone — the session total is derived live in
          // utils/profit.ts computeRollingSessionTotal. updateAdvSetting is kept
          // as the designated setter for adv* fields.)
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

      initDivinePrice: async (opts = {}) => {
        // WP4.2: staleness-based refresh. The old guard only fetched when the
        // price was 0 or the legacy default 200, so an already-set price never
        // auto-refreshed — even days later. Now: fetch when the price is
        // unset/legacy OR the last successful fetch is older than 30 min.
        // `force` (manual refresh button) always fetches.
        const { settings: st, divinePriceFetchedAt, activeSessionId } = get();
        const requestedSessionId = activeSessionId;
        // Historical-session guard (Phase 1.5): a loaded saved session is
        // never auto-mutated — the audit found this exact path repricing AND
        // re-stamping the league of old sessions, with the WP10 auto-save
        // then persisting the corruption. Guarded HERE (store level) so no
        // UI surface can forget. `repriceLoaded` = the explicit, confirmed
        // "reprice this saved session" action, the only sanctioned override.
        const loaded = activeSessionId !== null;
        if (loaded && !opts.repriceLoaded) return;
        // Resolve the league BEFORE applying price freshness. A price fetched
        // moments before a league boundary is fresh in time but stale in
        // context; skipping here used to carry the ended league's value for up
        // to 30 minutes. A context change also bypasses the one-minute retry
        // cooldown because that cooldown belongs to the previous league.
        const league = await getCurrentLeague();
        const leagueChanged = st.leagueName.trim() !== '' && st.leagueName !== league;
        const isUnset = st.divinePrice === 0 || st.divinePrice === 200;
        const isStale = Date.now() - divinePriceFetchedAt > DIVINE_PRICE_STALE_MS;
        if (!opts.force && !leagueChanged && !isUnset && !isStale) return;
        // Price is cooldown-gated unless explicitly forced or the league
        // changed. League detection has its own in-memory cache and falls back
        // to CURRENT_LEAGUE on failure.
        // FETCH-FIRST safety: nothing is mutated unless the fetch succeeded
        // (a failed refresh preserves the old price everywhere).
        const price = await tryFetchDivinePrice(opts.force === true || leagueChanged);
        set((s) => {
          const priceOk = !!(price && price > 0);
          const stillLive = s.activeSessionId === null;
          // Ignore a response that completed after the user changed sessions.
          if (s.activeSessionId !== requestedSessionId) return {};
          const realLeague = confirmedLeagueSync();
          const sameOrUnstamped = !!realLeague && (
            !s.settings.leagueName || s.settings.leagueName === realLeague
          );
          // Automatic price/provenance mutation fails closed: fallback/unknown
          // contexts and cross-league live sessions remain untouched. Explicit
          // loaded-session repricing is separately confirmed and never stamps.
          const canAutoMutate = stillLive && sameOrUnstamped;
          const canExplicitlyReprice = !stillLive && opts.repriceLoaded === true;
          const applyPrice = priceOk && (canAutoMutate || canExplicitlyReprice);
          const stampLeague = canAutoMutate;
          // On confirmation of a live session's league (CONFIRMED only — never the
          // offline fallback, which can be stale at rollover):
          //  - if the user made a choice BEFORE confirmation, persist it to the
          //    resolved league's map (retain the choice);
          //  - else if still awaiting a seed, seed the session's Atlas Bonus from
          //    the resolved league's stored value.
          const canResolve = canAutoMutate;
          const pendingVal = s.pendingAtlasBonusValue;
          const writeChoice = canResolve && pendingVal !== null;
          const doSeed = canResolve && pendingVal === null && s.pendingAtlasBonusSeed;
          return {
            // Timestamp advances only on a successful price fetch, so failures
            // stay "stale" and the next init retries (bounded by the 60s cooldown
            // in tryFetchDivinePrice).
            ...(applyPrice ? { divinePriceFetchedAt: Date.now() } : {}),
            ...(writeChoice || doSeed ? { pendingAtlasBonusSeed: false } : {}),
            ...(writeChoice ? { pendingAtlasBonusValue: null } : {}),
            ...(writeChoice && realLeague && pendingVal !== null
              ? { atlasBonusByLeague: { ...s.atlasBonusByLeague, [realLeague]: pendingVal } }
              : {}),
            settings: {
              ...s.settings,
              ...(applyPrice && price ? { divinePrice: Math.round(price) } : {}),
              // League is session PROVENANCE: only a live (unsaved) session is
              // ever stamped by a fetch. A loaded session keeps its league.
              ...(stampLeague && realLeague ? { leagueName: realLeague } : {}),
              ...(doSeed && realLeague ? { atlasBonus: s.atlasBonusByLeague[realLeague] ?? false } : {}),
            },
          };
        });
      },

      setDivinePriceManual: (v) =>
        set((s) => ({
          divinePriceFetchedAt: Date.now(),
          settings: { ...s.settings, divinePrice: v },
        })),

      saveAsNewSession: (name) => {
        flushActiveSessionAutoSave();
        const { maps, lootItems, baselineItems, baselineTotal, settings, sessionNotes, investmentNeutralization, investmentDismissed } = get();
        const id = new Date().toISOString();
        set((s) => ({
          savedSessions: { ...s.savedSessions, [id]: { id, name, createdAt: id, maps: maps.map(stripRawText), lootItems: [...lootItems], baselineItems: [...baselineItems], baselineTotal, settings: { ...settings }, notes: sessionNotes, investmentNeutralization, investmentDismissed } },
          activeSessionId: id, activeSessionName: name,
        }));
      },
      updateCurrentSession: () => {
        const { maps, lootItems, baselineItems, baselineTotal, settings, sessionNotes, investmentNeutralization, investmentDismissed, activeSessionId, activeSessionName, savedSessions } = get();
        if (!activeSessionId || !savedSessions[activeSessionId]) return;
        set((s) => ({
          savedSessions: { ...s.savedSessions, [activeSessionId]: { ...s.savedSessions[activeSessionId], name: activeSessionName ?? s.savedSessions[activeSessionId].name, maps: maps.map(stripRawText), lootItems: [...lootItems], baselineItems: [...baselineItems], baselineTotal, settings: { ...settings }, notes: sessionNotes, investmentNeutralization, investmentDismissed } },
        }));
      },
      loadSession: (id) => {
        flushActiveSessionAutoSave();
        const session = get().savedSessions[id];
        if (!session) return;
        const maps = session.maps.map((m) => {
          // Re-detect subtype flags from rawText when they weren't set at parse time
          // (sessions saved before 1.0.9 have all flags as false/undefined).
          //
          // The cast to Partial<MapData> reflects the runtime reality: localStorage
          // can contain map objects from older app versions that didn't have these
          // fields. The current MapData type requires them, so without the cast,
          // TS would mark the `false` defaults as dead code (correctly per the type,
          // but wrongly per the runtime).
          const safeM = m as Partial<MapData> & { rawText?: string };
          const raw = safeM.rawText ?? '';
          const needsRedetect = !safeM.isOriginator && !safeM.isEmpoweredMirage && !safeM.isNightmare && raw.length > 0;
          return {
            isOriginator: false, isEmpoweredMirage: false,
            isNightmare: false,  isCorrupted: false,
            ...safeM,
            ...(needsRedetect ? {
              isOriginator:     raw.includes("Originator's Memories"),
              isEmpoweredMirage: raw.includes('Empowered Mirage which covers the entire Map'),
              isNightmare:      raw.includes('Nightmare Map'),
              isCorrupted:      /\bCorrupted\b/.test(raw),
            } : {}),
          } as MapData;
        });
        // A loaded historical session keeps its OWN atlasBonus snapshot; no
        // per-league seeding applies, so clear any pending seed / held choice.
        set({ maps, lootItems: [...session.lootItems], baselineItems: [...(session.baselineItems ?? [])], baselineTotal: session.baselineTotal ?? 0, settings: { ...DEFAULT_SETTINGS, ...session.settings }, sessionNotes: session.notes ?? '', investmentNeutralization: session.investmentNeutralization ?? 0, investmentDismissed: session.investmentDismissed ?? false, activeSessionId: id, activeSessionName: session.name, isWatching: false, pendingAtlasBonusSeed: false, pendingAtlasBonusValue: null, loadedStrategyInfo: null });
      },
      deleteSession: (id) =>
        set((s) => { const { [id]: _, ...rest } = s.savedSessions; return { savedSessions: rest, activeSessionId: s.activeSessionId === id ? null : s.activeSessionId, activeSessionName: s.activeSessionId === id ? null : s.activeSessionName }; }),
      renameSession: (id, newName) =>
        set((s) => ({ savedSessions: { ...s.savedSessions, [id]: { ...s.savedSessions[id], name: newName } }, activeSessionName: s.activeSessionId === id ? newName : s.activeSessionName })),
      newSession: () => {
        flushActiveSessionAutoSave();
        // Atlas Bonus is league-scoped progress (per-league, not per-session).
        // Seed the new live session from the ACTIVE league's stored value — but
        // ONLY if the league is CONFIRMED right now (confirmedLeagueSync() returns
        // override/detected, never the offline fallback; null when unknown). If
        // unknown (detection not yet resolved), start OFF and mark
        // a pending seed so initDivinePrice can seed it once the league resolves.
        // Never seed/prompt under a guessed league (that reintroduces the rollover bug).
        const known = confirmedLeagueSync();
        const seededBonus = known ? (get().atlasBonusByLeague[known] ?? false) : false;
        set((s) => ({ maps: [], lootItems: [], baselineItems: [], baselineTotal: 0, sessionNotes: '', investmentNeutralization: 0, investmentDismissed: false, settings: { ...DEFAULT_SETTINGS, atlasBonus: seededBonus }, pendingAtlasBonusSeed: known === null, pendingAtlasBonusValue: null, activeSessionId: null, activeSessionName: null, isWatching: false, loadedStrategyInfo: null, sessionNonce: s.sessionNonce + 1 }));
      },

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
        set((s) => ({ regexSets: [...s.regexSets, ns] }));
      },
      deleteRegexSet: (id) =>
        set((s) => ({ regexSets: s.regexSets.filter((r) => r.id !== id) })),
      setRegexBuilderGroups: (groups) => set({ regexBuilderGroups: groups }),
      setDiscordTag: (tag) => set({ discordTag: tag }),

      setLeagueOverride: (league) => {
        const v = normalizeLeagueOverride(league);
        setLeagueOverrideValue(v); // clears the detection cache in league.ts
        set((s) => {
          const live = s.activeSessionId === null;
          if (!live) return { leagueOverride: v }; // never mutate a loaded historical session
          if (v) {
            // Explicit override to a known league on a live session: re-seed its
            // Atlas Bonus from that league's stored value (supersedes any held choice).
            return { leagueOverride: v, pendingAtlasBonusSeed: false, pendingAtlasBonusValue: null, settings: { ...s.settings, atlasBonus: s.atlasBonusByLeague[v] ?? false } };
          }
          // Cleared override on a live session: the active league becomes whatever
          // detection resolves — defer the re-seed to initDivinePrice.
          return { leagueOverride: v, pendingAtlasBonusSeed: true, pendingAtlasBonusValue: null };
        });
        // Re-stamp settings.leagueName and refetch the divine price for the
        // new league immediately. force bypasses BOTH the staleness guard and
        // the fetch cooldown — an explicit league change must never be skipped.
        get().initDivinePrice({ force: true });
      },
      setAtlasBonus: (value) =>
        set((s) => {
          const live = s.activeSessionId === null;
          const league = confirmedLeagueSync(); // confirmed active league or null (never the fallback)
          // Loaded historical session: change ONLY its own snapshot, never the map.
          if (!live) return { settings: { ...s.settings, atlasBonus: value } };
          // Live under a KNOWN league: record per-league progress immediately.
          if (league) {
            return {
              settings: { ...s.settings, atlasBonus: value },
              atlasBonusByLeague: { ...s.atlasBonusByLeague, [league]: value },
              pendingAtlasBonusSeed: false,
              pendingAtlasBonusValue: null,
            };
          }
          // Live but league NOT yet confirmed: apply to the session and HOLD the
          // choice so it's written to whichever league confirms (retained, not
          // lost). Cancels the auto-seed — the user has chosen.
          return {
            settings: { ...s.settings, atlasBonus: value },
            pendingAtlasBonusSeed: false,
            pendingAtlasBonusValue: value,
          };
        }),
      setPersonalLeagueCloseout: (leagueName, cutoffUtc) => {
        if (!isRetrospectiveLeague(leagueName)) {
          throw new Error('A supported league name is required.');
        }
        const cutoffMs = Date.parse(cutoffUtc);
        if (!Number.isFinite(cutoffMs)) {
          throw new Error('A valid retrospective cutoff is required.');
        }
        const leagueKey = normalizeLeagueKey(leagueName);
        const normalizedCutoff = new Date(cutoffMs).toISOString();
        set((s) => ({
          retrospectiveCloseouts: {
            ...s.retrospectiveCloseouts,
            [leagueKey]: {
              cutoffUtc: normalizedCutoff,
              closedAt: s.retrospectiveCloseouts[leagueKey]?.closedAt
                ?? new Date().toISOString(),
            },
          },
        }));
      },
      removePersonalLeagueCloseout: (leagueName) => {
        const leagueKey = normalizeLeagueKey(leagueName);
        set((s) => {
          const { [leagueKey]: _removed, ...remaining } = s.retrospectiveCloseouts;
          return { retrospectiveCloseouts: remaining };
        });
      },
      setDefaultPreset: () =>
        // Save current session exclusions as the persistent default
        set((s) => ({ defaultExclusionPreset: [...s.settings.regexExclusions] })),
      clearDefaultPreset: () => set({ defaultExclusionPreset: [] }),
      saveExclusionPreset: (name) => {
        const p: ExclusionPreset = {
          id: uuidv4(), name,
          terms: sanitizeExclusionTerms(get().settings.regexExclusions),
        };
        set((s) => ({ exclusionPresets: [...s.exclusionPresets, p] }));
      },
      loadExclusionPreset: (id) => {
        const p = get().exclusionPresets.find((p) => p.id === id);
        if (!p) return;
        set((s) => ({ settings: { ...s.settings, regexExclusions: [...p.terms] } }));
      },
      deleteExclusionPreset: (id) =>
        set((s) => ({ exclusionPresets: s.exclusionPresets.filter((p) => p.id !== id) })),
      setSessionNotes: (notes) => set({ sessionNotes: notes }),
      setInvestmentNeutralization: (v) => set({ investmentNeutralization: v }),
      setInvestmentDismissed: (v: boolean) => set({ investmentDismissed: v }),
      dismissOnboarding: () => set({ onboardingDismissed: true }),
      importSessions: (sessions, conflictMode) =>
        set((s) => {
          const toAdd: Record<string, SavedSession> = {};
          for (const session of sessions) {
            if (conflictMode === 'skip' && s.savedSessions[session.id]) continue;
            // Old JSON exports (pre-v16) can carry user-scoped keys in the
            // session's settings blob — scrub them so loadSession never
            // resurrects them (same scrub migrateState applies on upgrade).
            const settings: Record<string, any> = { ...(session.settings as any) };
            delete settings['discordTag'];
            delete settings['regexSets'];
            delete settings['rollingCostPerMap'];
            toAdd[session.id] = { ...session, settings: settings as SavedSession['settings'] };
          }
          return { savedSessions: { ...s.savedSessions, ...toAdd } };
        }),
      setLoadedStrategyInfo: (info) =>
        set((s) => ({
          loadedStrategyInfo: info,
          // Apply persistent default exclusions when a strategy is loaded
          settings: info
            ? { ...s.settings, regexExclusions: [...s.defaultExclusionPreset] }
            : s.settings,
        })),
    }),
    {
      name: 'map-tracker-storage', version: STORE_VERSION, migrate: migrateState,
      storage: debouncedStorage as PersistStorage<any>, merge: mergePersistedSessionState,
    }
  )
);

// ── WP10: auto-save the active session ───────────────────────────────────────
// When a saved session is active, any edit to its content persists into
// savedSessions[activeSessionId] automatically (debounced). Unsaved sessions
// (activeSessionId === null) keep the old behavior. Save-as-New remains the
// explicit forking action; the Update button is gone.
const AUTO_SAVE_DEBOUNCE_MS = 800;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Fire a PENDING auto-save immediately (no-op when nothing is dirty).
 * Called before session switches (loadSession/newSession/saveAsNewSession)
 * and on window close, so debounced edits are never dropped.
 */
export function flushActiveSessionAutoSave(): void {
  if (autoSaveTimer === null) return; // pending timer <=> dirty; otherwise skip the write
  clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  const s = useSessionStore.getState();
  if (s.activeSessionId && s.savedSessions[s.activeSessionId]) s.updateCurrentSession();
}

useSessionStore.subscribe((state, prev) => {
  if (!state.activeSessionId) return;
  // A session switch (load / save-as-new) is not an edit: loadSession copies
  // FROM the saved session, so auto-saving here would only echo it back — and
  // in the pathological case clobber it. Never schedule on an id change.
  if (state.activeSessionId !== prev.activeSessionId) return;
  const dirty =
    state.maps !== prev.maps ||
    state.lootItems !== prev.lootItems ||
    state.baselineItems !== prev.baselineItems ||
    state.baselineTotal !== prev.baselineTotal ||
    state.settings !== prev.settings ||
    state.sessionNotes !== prev.sessionNotes ||
    state.investmentNeutralization !== prev.investmentNeutralization ||
    state.investmentDismissed !== prev.investmentDismissed;
  if (!dirty) return;
  if (autoSaveTimer !== null) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    const s = useSessionStore.getState();
    if (s.activeSessionId && s.savedSessions[s.activeSessionId]) s.updateCurrentSession();
  }, AUTO_SAVE_DEBOUNCE_MS);
});

// Flush on app close so the last debounce window is never lost.
// Order matters: the auto-save flush runs FIRST (it set()s, which lands in
// pendingPersist synchronously), then flushPersist writes the final state.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushActiveSessionAutoSave);
  window.addEventListener('beforeunload', flushPersist);
}

// ── Selector subscription helpers (session 17: typing-lag fix) ──────────────
// Subscribing with `useSessionStore()` (no selector) re-renders the component
// on EVERY store change — a Notes keystroke used to re-render the Map Log
// table, the 600-row loot table, and every other mounted panel.
// All components must subscribe via useSessionKeys (or a custom selector for
// nested scalars, e.g. `useSessionStore((s) => s.settings.atlasTreeUrl)`).
// Convention: no bare `useSessionStore()` calls in components.

/** Pure key-pick — exported for tests. */
export function pickKeys<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

/**
 * Subscribe to a shallow-compared slice of the session store.
 * `const { maps, settings } = useSessionKeys('maps', 'settings')` re-renders
 * only when one of the picked values changes (actions are stable references,
 * so listing them is free).
 */
export function useSessionKeys<K extends keyof SessionState>(...keys: K[]): Pick<SessionState, K> {
  return useSessionStore(useShallow((s) => pickKeys(s, keys)));
}

// Seed the persisted league override into the store-agnostic league util.
// persist() hydrates synchronously from localStorage during create(), so the
// value is already in state here. For old stores the additive top-level field
// shallow-merges to null (no migration needed) — seeding null is a no-op.
const hydratedLeagueOverride = normalizeLeagueOverride(useSessionStore.getState().leagueOverride ?? null);
if (hydratedLeagueOverride !== useSessionStore.getState().leagueOverride) {
  useSessionStore.setState({ leagueOverride: hydratedLeagueOverride });
}
setLeagueOverrideValue(hydratedLeagueOverride);
