import type { BestiaryAtlasSetup, MercenaryAtlasSetup } from '../../../shared/atlasStats';

export interface ScarabSlot { name: string; cost: number; }
export interface ScarabPreset { id: string; name: string; scarabs: ScarabSlot[]; }
/** Named brick-exclusion term list (Regex panel). User-scoped, top-level +
 *  additive store field — persist's shallow merge defaults it to [] for old
 *  stores (no migration needed). */
export interface ExclusionPreset {
  id: string;
  name: string;
  terms: string[];
  /** Missing on legacy records, which are structured exclusion lists. */
  kind?: 'structured' | 'literal';
  /** Complete copy-only regex. Never combined with generated thresholds. */
  literalRegex?: string;
}

export interface LootItem {
  id: string; name: string; tab: string;
  quantity: string; price: string; total: number; excluded: boolean;
}

export type LootCategory =
  | 'Currency' | 'Fragments' | 'Scarabs' | 'Divination Cards'
  | 'Essences' | 'Deliriums' | 'Oils' | 'Incubators'
  | 'Unique Weapons' | 'Unique Armours' | 'Unique Accessories'
  | 'Unique Flasks' | 'Unique Jewels' | 'Maps' | 'Gems'
  | 'Beasts' | 'League' | 'Other';

/** Author-supplied correction for valuable loot omitted or left unpriced by
 * WealthyExile. Public summaries retain its manual provenance and note. */
export interface ManualLootItem {
  id: string;
  name: string;
  quantity: number;
  total: number;
  category: LootCategory;
  note: string;
}

/** A counted Mercenary archetype authored by the user. Attribute alignment and
 * Great House are reference data derived from the current game catalogue. */
export interface ManualMercenaryCount {
  archetype: string;
  count: number;
}

export interface ManualAtlasAnomalyCount {
  name: string;
  count: number;
}

export type RunStatisticsSetupCategory =
  | 'kalguuran'
  | 'wildwood'
  | 'anomalies'
  | 'beasts'
  | 'mercenaries';

export type RunStatisticsSetupCaptureSource = 'manual-entry' | 'loot-snapshots';

/** Durable, normalized setup evidence captured when a category first gains an
 * observed result. It intentionally stores only setup identity, not prices or
 * a claimed per-map boundary. */
export interface RunStatisticsSetupContext {
  schemaVersion: 1;
  modelRevision: 'allflame-v1';
  captureSource: RunStatisticsSetupCaptureSource;
  leagueName: string;
  atlasSource: 'path-of-pathing' | 'unavailable';
  /** Exact safe Atlas view associated with the successful Show stats read.
   * Null means no authoritative Atlas evidence was available at capture time. */
  atlasTreeUrl: string | null;
  atlasDetectedTags: string[];
  scarabNames: string[];
  bestiaryAtlasSetup?: BestiaryAtlasSetup;
  mercenaryAtlasSetup?: MercenaryAtlasSetup;
}

export interface RunStatisticsSetupAttribution {
  contexts: RunStatisticsSetupContext[];
  /** The category already contained results before setup capture existed. */
  legacyUnattributed?: true;
  /** More distinct contexts were observed than the bounded local record keeps. */
  overflowed?: true;
}

export type RunStatisticsSetupProvenance = Partial<Record<
  RunStatisticsSetupCategory,
  RunStatisticsSetupAttribution
>>;

/** Optional, explicitly author-entered session outcomes. Missing scalar keys
 * mean "not reported"; an explicit zero is a real authored report. */
export interface ManualSessionStatistics {
  /** Per-session UI preference. It is deliberately ignored when deciding
   * whether the session contains authored statistics. */
  infoDismissed?: boolean;
  /** Per-session dismissal for the Bestiary-model prerequisite notice. */
  beastInfoDismissed?: boolean;
  starfallCraters?: number;
  svalinnDrops?: number;
  wildwoodEncounters?: number;
  atlasAnomalies?: ManualAtlasAnomalyCount[];
  mercenaries?: ManualMercenaryCount[];
  /** Per-category setup/source capture. It is local session evidence and is
   * ignored by hasManualStatistics so provenance alone does not make a fresh
   * working session authored content. */
  setupProvenance?: RunStatisticsSetupProvenance;
}

/** Explicit active-play stopwatch for bulk-import workflows. Display time is
 * derived from Date.now while running; the repository persists transitions and
 * a bounded heartbeat rather than one write per visible second. */
export interface ManualRunTimer {
  accumulatedMs: number;
  runningSince: number | null;
  lastHeartbeatAt: number | null;
  finishedAt: number | null;
}

export interface MapData {
  id: string; tier: number; name: string;
  quantity: number; rarity: number; packSize: number;
  quality: number; qualityType: string;
  moreCurrency: number; moreMaps: number; moreScarabs: number;
  moreDivCards: number; // "More Divination Cards: +N%" — its own drop pool, NOT currency (added post-1.0.62; old persisted maps lack it, consumers must ?? 0)
  modCount: number;
  /** Exact explicit affix count from advanced tooltip headers.
   * Undefined for headerless legacy copies and old maps; never infer it from text-line count. */
  explicitModCount?: number;
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
  /** Delirium Orb metadata read from map enchant lines. Optional/additive so
   * old persisted maps remain valid. Reward order and repeats are meaningful
   * (for example two Jewellery rewards) and must not be deduplicated. */
  deliriousPct?: number;
  deliriumRewardTypes?: string[];
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
  /** Durable provenance for the session's stored divine quote. */
  divinePriceQuotedAt?: string | null;
  // chiselType: '' = no chisel; any value = that chisel is used
  chiselUsed: boolean; chiselType: string; chiselPrice: number;
  mapType: '6-mod' | '8-mod';
  // isSplitSession is derived from advSplitPrice > 0; kept for compat
  isSplitSession: boolean;
  multiplyingModifiersAllocated: boolean;
  /** null = derive from occupied Investment slots, then fully-unlocked default. */
  fragmentCountOverride: number | null;
  smallNodesAllocated: number; mountingModifiers: boolean;
  // rollingCostPerMap was removed in store v16 — the session total is derived
  // live via computeRollingSessionTotal (the stored value went stale by design).
  baseMapCost: number;
  scarabs: ScarabSlot[];
  // Atlas Bonus: flat +25% IIQ on all maps (100 Atlas Objectives complete).
  // This is the SESSION SNAPSHOT value used by the multiplier. Per-league
  // acknowledgement/progress lives at store top-level in `atlasBonusByLeague`
  // (NOT here) so it can't rewrite saved-session history and resets each league.
  atlasBonus: boolean;
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
  /** Strategy-versioning client half (design v3.1 §2): when set, this session
   *  is an UPDATE RUN targeting a published strategy (server uuid). Lives in
   *  SessionSettings deliberately — snapshotted by save, restored by load,
   *  reset to null by newSession, and NEVER written by strategy imports
   *  (the 4-case matrix in useSessionStore.updateTarget.test.ts). Additive —
   *  old sessions lack it, migrateState/loadSession fill null. The NAME is
   *  display sugar only (the uuid is identity; the server/card own the
   *  authoritative revision number). */
  updateTargetStrategyId: string | null;
  updateTargetStrategyName: string | null;
  /** Evidence-pooling target. These four values are one atomic targeting
   *  record: id/name identify the published strategy, expectedRevision pins
   *  the author-approved base, and setupFingerprint pins its canonical setup.
   *  A session may target an update OR evidence, never both. Like the update
   *  target, save/load preserves this record while new/import clears it. */
  evidenceTargetStrategyId: string | null;
  evidenceTargetStrategyName: string | null;
  evidenceTargetExpectedRevision: number | null;
  evidenceTargetSetupFingerprint: string | null;
  leagueName: string;          // Current league, auto-detected from poe.ninja
  atlasDetectedTags: string[]; // Tags inferred from atlas tree node group titles
  /** Local Run Statistics inputs captured from a successful Atlas stats read.
   * Optional/additive: undefined means no authoritative scrape exists for the
   * current tree, so modelled rates must remain unavailable. */
  bestiaryAtlasSetup?: BestiaryAtlasSetup;
  mercenaryAtlasSetup?: MercenaryAtlasSetup;
}

export interface SavedSession {
  id: string; name: string; createdAt: string;
  maps: MapData[]; lootItems: LootItem[];
  baselineItems: LootItem[]; baselineTotal: number;
  manualLootItems?: ManualLootItem[];
  manualStatistics?: ManualSessionStatistics;
  manualRunTimer?: ManualRunTimer;
  settings: SessionSettings;
  notes?: string;
  // Double-count correction the user applied to THIS session (WP11 / C, additive).
  // Persisted so the correction survives save/load and never bleeds across
  // sessions via the top-level store slot. Absent on pre-C saves -> 0 / false.
  investmentNeutralization?: number;
  investmentDismissed?: boolean;
}

/** Local end-of-league marker. Keyed by normalizeLeagueKey(leagueName). */
export interface LeagueCloseout {
  cutoffUtc: string;
  closedAt: string;
}

export type LeagueCloseouts = Record<string, LeagueCloseout>;
