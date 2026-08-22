import type { LootItem, MapData, SavedSession } from '../../types';
import { useSessionStore } from '../../store/useSessionStore';
import { parseMapClipboard } from '../mapParser';
import { MAP_CLIPBOARDS } from './wp1Fixtures';

export const WP14_FIXTURE_SEED = 0x14072026;
export const WP14_LEGACY_V17_STORE_VERSION = 17;
export const WP14_STORE_VERSION = 18;
export const WP14_NEWER_STORE_VERSION = WP14_STORE_VERSION + 1;
export const WP14_TEN_MIB = 10 * 1024 * 1024;
export const WP14_PROFILE_EXPORT_SHA256 =
  '04fefa316ebf7892e3a589796cb7fcf978eec6a604cb58e04182dfc5126c6744';

export interface PersistEnvelope {
  state: Record<string, unknown>;
  version: number;
}

export interface SessionExportEnvelope {
  version: string;
  exportedAt: string;
  sessions: Array<Record<string, unknown>>;
}

export interface GeneratedFixture {
  fileName: string;
  fixtureClass:
    | 'legacy'
    | 'active-named-dirty'
    | 'unnamed-working'
    | 'large-session'
    | 'corrupt'
    | 'rawText-heavy'
    | 'many-session'
    | 'duplicate/import'
    | 'profile-source';
  content: string;
  tracked: boolean;
}

const FIXED_EPOCH_MS = Date.parse('2026-07-01T00:00:00.000Z');

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const serialize = (value: unknown): string => `${JSON.stringify(value)}\n`;
const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

const stateDefaults = (): Record<string, unknown> => {
  const state = JSON.parse(JSON.stringify(useSessionStore.getState())) as Record<string, unknown>;
  for (const key of [
    'repositoryStatus', 'repositoryError', 'repositorySessions', 'repositorySizeBytes',
    'currentGeneration', 'preferencesGeneration', 'layoutGeneration', 'saveStatus',
    'saveError', 'sessionLifecycle', 'liveSessionId',
  ]) delete state[key];
  return state;
};

const deterministicId = (seed: number, kind: string, index: number): string =>
  `wp14-${seed.toString(16)}-${kind}-${index.toString().padStart(5, '0')}`;

const deterministicTimestamp = (seed: number, index: number): string =>
  new Date(FIXED_EPOCH_MS + (seed % 86_400) * 1000 + index * 60_000).toISOString();

const createRandom = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const mapSeeds = (): string[] => Object.values(MAP_CLIPBOARDS);

const createActiveMap = (seed: number, index: number): MapData => {
  const seeds = mapSeeds();
  const rawText = seeds[index % seeds.length];
  const parsed = parseMapClipboard(rawText);
  if (!parsed) throw new Error(`WP14 fixture map seed ${index} did not parse`);
  return {
    ...parsed,
    id: deterministicId(seed, 'map', index),
    parsedAt: FIXED_EPOCH_MS + index * 1000,
  };
};

const stripRawText = (map: MapData): MapData => {
  const saved = { ...map };
  delete saved.rawText;
  return saved;
};

const createLootItem = (seed: number, index: number, role: 'loot' | 'baseline'): LootItem => ({
  id: deterministicId(seed, role, index),
  name: `Synthetic ${role === 'loot' ? 'Return' : 'Baseline'} Item ${index + 1}`,
  tab: 'WP14 fixture',
  quantity: String((index % 17) + 1),
  price: `${((index % 23) + 1) / 10}`,
  total: Number((((index % 17) + 1) * (((index % 23) + 1) / 10)).toFixed(2)),
  excluded: index % 11 === 0,
});

const createSavedSession = (
  seed: number,
  index: number,
  mapCount = 2,
  lootCount = 3,
): SavedSession => {
  const id = deterministicId(seed, 'session', index);
  const defaults = stateDefaults();
  return {
    id,
    name: `WP14 Session ${index + 1}`,
    createdAt: deterministicTimestamp(seed, index),
    maps: Array.from({ length: mapCount }, (_, mapIndex) =>
      stripRawText(createActiveMap(seed + index, mapIndex))),
    lootItems: Array.from({ length: lootCount }, (_, itemIndex) =>
      createLootItem(seed + index, itemIndex, 'loot')),
    baselineItems: Array.from({ length: lootCount + 1 }, (_, itemIndex) =>
      createLootItem(seed + index, itemIndex, 'baseline')),
    baselineTotal: lootCount * 10,
    manualLootItems: [{
      id: deterministicId(seed, 'manual-loot', index),
      name: 'Fixture manual return',
      quantity: index + 1,
      total: 25 + index,
      category: 'Other',
      note: 'WP14 fixture',
    }],
    manualStatistics: {
      infoDismissed: index % 2 === 0,
      starfallCraters: index,
      wildwoodEncounters: index + 1,
    },
    settings: {
      ...(clone(defaults.settings) as SavedSession['settings']),
      baseMapCost: 7 + index,
      leagueName: 'Fixture League',
    },
    notes: '',
    investmentNeutralization: 0,
    investmentDismissed: false,
  };
};

const createEnvelope = (
  state: Record<string, unknown>,
  version = WP14_STORE_VERSION,
): PersistEnvelope => ({ state, version });

const historicalV17Settings = (value: unknown): Record<string, unknown> => {
  const current = clone(value) as Record<string, unknown>;
  const fragmentsUsed = current.fragmentCountOverride ??
    (current.multiplyingModifiersAllocated === true ? 4 : 0);
  delete current.multiplyingModifiersAllocated;
  delete current.fragmentCountOverride;
  delete current.evidenceTargetStrategyId;
  delete current.evidenceTargetStrategyName;
  delete current.evidenceTargetExpectedRevision;
  delete current.evidenceTargetSetupFingerprint;

  const historical: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(current)) {
    historical[key] = entry;
    if (key === 'isSplitSession') historical.fragmentsUsed = fragmentsUsed;
  }
  return historical;
};

const createCurrentV17Envelope = (seed: number): PersistEnvelope => {
  const state = stateDefaults();
  // Preserve the historical v17 wire shape. Additive fields introduced after
  // v17 are intentionally absent even though the live store defaults contain them.
  delete state.retrospectiveCloseouts;
  delete state.manualLootItems;
  delete state.manualStatistics;
  const saved = createSavedSession(seed, 0);
  delete saved.manualLootItems;
  delete saved.manualStatistics;
  saved.settings = historicalV17Settings(saved.settings) as unknown as SavedSession['settings'];
  state.savedSessions = { [saved.id]: saved };
  state.maps = clone(saved.maps);
  state.lootItems = clone(saved.lootItems);
  state.baselineItems = clone(saved.baselineItems);
  state.baselineTotal = saved.baselineTotal;
  state.settings = historicalV17Settings(saved.settings);
  state.activeSessionId = saved.id;
  state.activeSessionName = saved.name;
  return createEnvelope(state, WP14_LEGACY_V17_STORE_VERSION);
};

const createCurrentV18Envelope = (seed: number): PersistEnvelope => {
  const state = stateDefaults();
  const saved = createSavedSession(seed, 0);
  state.savedSessions = { [saved.id]: saved };
  state.maps = clone(saved.maps);
  state.lootItems = clone(saved.lootItems);
  state.baselineItems = clone(saved.baselineItems);
  state.baselineTotal = saved.baselineTotal;
  state.manualLootItems = clone(saved.manualLootItems);
  state.manualStatistics = clone(saved.manualStatistics);
  state.settings = clone(saved.settings);
  state.activeSessionId = saved.id;
  state.activeSessionName = saved.name;
  return createEnvelope(state);
};

const createLegacyV13Envelope = (seed: number): PersistEnvelope => {
  const current = createCurrentV17Envelope(seed);
  const state = current.state;
  const settings = clone(state.settings) as Record<string, unknown>;
  delete settings.atlasBonus;
  settings.mirageBonus = true;
  settings.discordTag = 'fixture-discord';
  settings.regexSets = [];
  settings.rollingCostPerMap = 2120;
  state.settings = settings;
  state.investmentNeutralization = -1;
  state.savedSessions = Object.fromEntries(
    Object.entries(state.savedSessions as Record<string, SavedSession>).map(([id, session]) => {
      const legacySettings = clone(session.settings) as unknown as Record<string, unknown>;
      delete legacySettings.atlasBonus;
      legacySettings.mirageBonus = false;
      legacySettings.discordTag = 'historical-fixture-discord';
      legacySettings.regexSets = [];
      legacySettings.rollingCostPerMap = 999;
      return [id, { ...session, settings: legacySettings }];
    }),
  );

  for (const key of [
    'discordTag',
    'regexSets',
    'leagueOverride',
    'atlasBonusByLeague',
    'pendingAtlasBonusSeed',
    'pendingAtlasBonusValue',
    'regexBuilderGroups',
    'sessionNonce',
    'divinePriceFetchedAt',
    'investmentDismissed',
    'onboardingDismissed',
    'defaultExclusionPreset',
    'exclusionPresets',
    'loadedStrategyInfo',
  ]) {
    delete state[key];
  }
  return createEnvelope(state, 13);
};

const createActiveNamedDirtyEnvelope = (seed: number): PersistEnvelope => {
  const state = stateDefaults();
  const saved = createSavedSession(seed, 0, 2, 3);
  state.savedSessions = { [saved.id]: saved };
  state.activeSessionId = saved.id;
  state.activeSessionName = saved.name;
  state.maps = [
    ...saved.maps,
    createActiveMap(seed, saved.maps.length),
  ];
  state.lootItems = clone(saved.lootItems);
  state.baselineItems = clone(saved.baselineItems);
  state.baselineTotal = saved.baselineTotal;
  state.manualLootItems = clone(saved.manualLootItems);
  state.manualStatistics = {
    ...clone(saved.manualStatistics),
    starfallCraters: 4,
  };
  state.settings = { ...clone(saved.settings), baseMapCost: saved.settings.baseMapCost + 5 };
  state.sessionNotes = 'Unsaved fixture edit';
  return createEnvelope(state);
};

const createUnnamedWorkingEnvelope = (seed: number): PersistEnvelope => {
  const state = stateDefaults();
  state.maps = [createActiveMap(seed, 0)];
  state.lootItems = [createLootItem(seed, 0, 'loot')];
  state.baselineItems = [createLootItem(seed, 0, 'baseline')];
  state.baselineTotal = 10;
  state.manualLootItems = clone(createSavedSession(seed, 0, 0, 0).manualLootItems);
  state.manualStatistics = { starfallCraters: 0, wildwoodEncounters: 1 };
  state.sessionNotes = 'Unnamed fixture work';
  state.activeSessionId = null;
  state.activeSessionName = null;
  return createEnvelope(state);
};

const createDuplicateImport = (seed: number): SessionExportEnvelope => {
  const existing = createSavedSession(seed, 0, 1, 1);
  const incoming = createSavedSession(seed, 1, 1, 1);
  return {
    version: '1.0',
    exportedAt: deterministicTimestamp(seed, 100),
    sessions: [
      clone(existing) as unknown as Record<string, unknown>,
      clone(incoming) as unknown as Record<string, unknown>,
    ],
  };
};

export const generateSmallWp14Fixtures = (
  seed = WP14_FIXTURE_SEED,
): GeneratedFixture[] => {
  const v17 = createCurrentV17Envelope(seed);
  const serializedV17 = serialize(v17);
  const v18 = createCurrentV18Envelope(seed);
  const serializedV18 = serialize(v18);
  const truncated = serializedV18.slice(0, Math.floor(serializedV18.length / 2)).trimEnd();
  const inconsistent = createEnvelope({
    ...stateDefaults(),
    maps: 'not-an-array',
    settings: null,
    savedSessions: [],
  });

  return [
    {
      fileName: 'legacy-v13-envelope.json',
      fixtureClass: 'legacy',
      content: serialize(createLegacyV13Envelope(seed)),
      tracked: true,
    },
    {
      fileName: 'legacy-v17-envelope.json',
      fixtureClass: 'legacy',
      content: serializedV17,
      tracked: true,
    },
    {
      fileName: 'legacy-v18-envelope.json',
      fixtureClass: 'legacy',
      content: serializedV18,
      tracked: true,
    },
    {
      fileName: 'active-named-dirty-envelope.json',
      fixtureClass: 'active-named-dirty',
      content: serialize(createActiveNamedDirtyEnvelope(seed)),
      tracked: true,
    },
    {
      fileName: 'unnamed-working-envelope.json',
      fixtureClass: 'unnamed-working',
      content: serialize(createUnnamedWorkingEnvelope(seed)),
      tracked: true,
    },
    {
      fileName: 'corrupt-empty.json',
      fixtureClass: 'corrupt',
      content: '',
      tracked: true,
    },
    {
      fileName: 'corrupt-malformed.json',
      fixtureClass: 'corrupt',
      content: '{"state":not-json}\n',
      tracked: true,
    },
    {
      fileName: 'corrupt-truncated.json',
      fixtureClass: 'corrupt',
      content: truncated,
      tracked: true,
    },
    {
      fileName: 'corrupt-inconsistent-envelope.json',
      fixtureClass: 'corrupt',
      content: serialize(inconsistent),
      tracked: true,
    },
    {
      fileName: 'corrupt-newer-version-envelope.json',
      fixtureClass: 'corrupt',
      content: serialize(createEnvelope(stateDefaults(), WP14_NEWER_STORE_VERSION)),
      tracked: true,
    },
    {
      fileName: 'duplicate-import.json',
      fixtureClass: 'duplicate/import',
      content: serialize(createDuplicateImport(seed)),
      tracked: true,
    },
  ];
};

const scrubUtf8Length = (value: string): string => 'x'.repeat(utf8Bytes(value));

export const anonymizeProfileExport = (
  source: SessionExportEnvelope,
): SessionExportEnvelope => ({
  ...clone(source),
  sessions: source.sessions.map((session) => {
    const copy = clone(session);
    if (typeof copy.notes === 'string') copy.notes = scrubUtf8Length(copy.notes);
    for (const key of Object.keys(copy)) {
      if (/discord/i.test(key) && typeof copy[key] === 'string') {
        copy[key] = scrubUtf8Length(copy[key] as string);
      }
    }
    if (copy.settings && typeof copy.settings === 'object') {
      const settings = copy.settings as Record<string, unknown>;
      for (const key of Object.keys(settings)) {
        if (/discord/i.test(key) && typeof settings[key] === 'string') {
          settings[key] = scrubUtf8Length(settings[key] as string);
        }
      }
    }
    return copy;
  }),
});

const readExportSessions = (source: SessionExportEnvelope): Array<Record<string, unknown>> => {
  if (!Array.isArray(source.sessions) || source.sessions.length === 0) {
    throw new Error('WP14 profile export must contain at least one session');
  }
  return source.sessions;
};

const createLargeSessionEnvelope = (
  source: SessionExportEnvelope,
  seed: number,
): PersistEnvelope => {
  const sessions = readExportSessions(source);
  const combined = clone(sessions[0]);
  const combinedMaps = sessions.flatMap((session) =>
    Array.isArray(session.maps) ? clone(session.maps) : []);
  const combinedLoot = sessions.flatMap((session) =>
    Array.isArray(session.lootItems) ? clone(session.lootItems) : []);
  const combinedBaseline = sessions.flatMap((session) =>
    Array.isArray(session.baselineItems) ? clone(session.baselineItems) : []);
  const id = deterministicId(seed, 'large-session', 0);
  Object.assign(combined, {
    id,
    name: 'WP14 Large Session',
    createdAt: deterministicTimestamp(seed, 0),
    maps: combinedMaps,
    lootItems: combinedLoot,
    baselineItems: combinedBaseline,
    notes: '',
  });

  const state = stateDefaults();
  state.savedSessions = { [id]: combined };
  state.activeSessionId = id;
  state.activeSessionName = 'WP14 Large Session';
  state.maps = clone(combinedMaps);
  state.lootItems = clone(combinedLoot);
  state.baselineItems = clone(combinedBaseline);
  state.baselineTotal = combined.baselineTotal ?? 0;
  state.settings = clone(combined.settings ?? state.settings);
  state.sessionNotes = '';
  return createEnvelope(state);
};

const createManySessionEnvelope = (
  source: SessionExportEnvelope,
  seed: number,
): PersistEnvelope => {
  const sourceSessions = readExportSessions(source);
  const random = createRandom(seed);
  const sessions: Record<string, unknown> = {};
  for (let index = 0; index < 100; index++) {
    const base = clone(sourceSessions[index % sourceSessions.length]);
    const id = deterministicId(seed, 'catalogue', index);
    const maps = Array.isArray(base.maps) ? base.maps : [];
    const loot = Array.isArray(base.lootItems) ? base.lootItems : [];
    const baseline = Array.isArray(base.baselineItems) ? base.baselineItems : [];
    Object.assign(base, {
      id,
      name: `WP14 Catalogue ${index + 1}`,
      createdAt: deterministicTimestamp(seed, index),
      maps: clone(maps.slice(0, Math.floor(random() * (maps.length + 1)))),
      lootItems: clone(loot.slice(0, Math.floor(random() * (loot.length + 1)))),
      baselineItems: clone(baseline.slice(0, Math.floor(random() * (baseline.length + 1)))),
      notes: '',
    });
    sessions[id] = base;
  }
  const state = stateDefaults();
  state.savedSessions = sessions;
  state.activeSessionId = null;
  state.activeSessionName = null;
  return createEnvelope(state);
};

const createRawTextHeavyEnvelope = (
  seed: number,
  targetBytes: number,
): PersistEnvelope => {
  const state = stateDefaults();
  const first = createActiveMap(seed, 0);
  const averageMapBytes = Math.max(1, utf8Bytes(JSON.stringify(first)));
  const bytesForCount = (count: number): number => {
    const maps = Array.from({ length: count }, (_, index) => createActiveMap(seed, index));
    return utf8Bytes(serialize(createEnvelope({ ...state, maps })));
  };

  let lower = 1;
  let upper = Math.max(
    1,
    Math.ceil((targetBytes - utf8Bytes(JSON.stringify(state))) / averageMapBytes),
  );
  while (bytesForCount(upper) < targetBytes) {
    lower = upper + 1;
    upper *= 2;
  }
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (bytesForCount(middle) >= targetBytes) upper = middle;
    else lower = middle + 1;
  }
  state.maps = Array.from({ length: lower }, (_, index) => createActiveMap(seed, index));
  return createEnvelope(state);
};

export const generateProfileWp14Fixtures = (
  source: SessionExportEnvelope,
  seed = WP14_FIXTURE_SEED,
  rawTextTargetBytes = WP14_TEN_MIB,
): GeneratedFixture[] => {
  const anonymized = anonymizeProfileExport(source);
  return [
    {
      fileName: 'anonymized-session-export.json',
      fixtureClass: 'profile-source',
      content: `${JSON.stringify(anonymized, null, 2)}\n`,
      tracked: false,
    },
    {
      fileName: 'large-session-envelope.json',
      fixtureClass: 'large-session',
      content: serialize(createLargeSessionEnvelope(anonymized, seed)),
      tracked: false,
    },
    {
      fileName: 'rawtext-heavy-10mib-envelope.json',
      fixtureClass: 'rawText-heavy',
      content: serialize(createRawTextHeavyEnvelope(seed, rawTextTargetBytes)),
      tracked: false,
    },
    {
      fileName: 'many-session-envelope.json',
      fixtureClass: 'many-session',
      content: serialize(createManySessionEnvelope(anonymized, seed)),
      tracked: false,
    },
  ];
};
