import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_MIGRATION_SCHEMA,
  LEGACY_STORE_STORAGE_KEY,
  SESSION_REPOSITORY_VERSION,
  type LegacyMigrationPlanV1,
  type LegacyMigrationSession,
  type LegacyStorageSnapshot,
  type LegacyStorageValue,
} from '../../../shared/sessionMigration';
import {
  assertJsonValue,
  computeSemanticHash,
  type JsonObject,
  type JsonValue,
  type SessionBodyV1,
} from '../../../shared/sessionRecord';
import { createSessionPayload } from '../../../shared/sessionPayload';
import {
  LEGACY_STORE_VERSION,
  mergePersistedSessionState,
  migrateLegacyStore,
  useSessionStore,
  type SessionStoreState as SessionState,
} from '../store/useSessionStore';
import { normalizeLocalManualStatistics } from '../utils/manualStatistics';
import { normalizeManualRunTimer } from '../utils/manualRunTimer';

export class LegacyMigrationSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyMigrationSourceError';
  }
}

export interface LegacyMigrationIdentity {
  repositoryId: string;
  operationId: string;
  now: Date;
}

interface PersistEnvelope {
  state: Record<string, unknown>;
  version: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LegacyMigrationSourceError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new LegacyMigrationSourceError(`${label} must be a string`);
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireNonEmptyString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp))) {
    throw new LegacyMigrationSourceError(`${label} must be a UTC ISO timestamp`);
  }
  return timestamp;
}

function requireArray(value: unknown, label: string): JsonValue[] {
  if (!Array.isArray(value)) throw new LegacyMigrationSourceError(`${label} must be an array`);
  assertJsonValue(value, label);
  return cloneJson(value) as JsonValue[];
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isPlainObject(value)) throw new LegacyMigrationSourceError(`${label} must be an object`);
  assertJsonValue(value, label);
  return cloneJson(value) as JsonObject;
}

function finiteNumber(value: unknown, fallback: number, label: string): number {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== 'number' || !Number.isFinite(resolved)) {
    throw new LegacyMigrationSourceError(`${label} must be a finite number`);
  }
  return resolved;
}

function booleanValue(value: unknown, fallback: boolean, label: string): boolean {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== 'boolean') {
    throw new LegacyMigrationSourceError(`${label} must be a boolean`);
  }
  return resolved;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new LegacyMigrationSourceError(`${label} must be a string or null`);
}

function nullableBoolean(value: unknown, label: string): boolean | null {
  if (value === null || typeof value === 'boolean') return value;
  throw new LegacyMigrationSourceError(`${label} must be a boolean or null`);
}

function parseEnvelope(rawValue: string | null): PersistEnvelope {
  if (rawValue === null || rawValue.length === 0) {
    throw new LegacyMigrationSourceError('Legacy map-tracker-storage is missing or empty');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new LegacyMigrationSourceError('Legacy map-tracker-storage is not valid JSON');
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.state) ||
      !Number.isSafeInteger(parsed.version) || Number(parsed.version) < 0) {
    throw new LegacyMigrationSourceError('Legacy map-tracker-storage envelope is invalid');
  }
  if (Number(parsed.version) > LEGACY_STORE_VERSION) {
    throw new LegacyMigrationSourceError(
      `Legacy store version ${String(parsed.version)} is newer than supported version ${LEGACY_STORE_VERSION}`,
    );
  }
  return { state: parsed.state, version: Number(parsed.version) };
}

function persistedDefaults(): SessionState {
  return useSessionStore.getState();
}

function normalizedLegacyState(envelope: PersistEnvelope): SessionState {
  const migrated = migrateLegacyStore(cloneJson(envelope.state));
  const merged = mergePersistedSessionState(migrated, persistedDefaults());
  if (!isPlainObject(merged.savedSessions)) {
    throw new LegacyMigrationSourceError('savedSessions must be an object');
  }
  requireArray(merged.maps, 'state.maps');
  requireArray(merged.lootItems, 'state.lootItems');
  requireArray(merged.baselineItems, 'state.baselineItems');
  requireArray(merged.manualLootItems, 'state.manualLootItems');
  requireObject(merged.settings, 'state.settings');
  return merged;
}

function quotedSettings(settings: unknown, quotedAt: number | null, label: string): JsonObject {
  const copy = requireObject(settings, label);
  return {
    ...copy,
    divinePriceQuotedAt: quotedAt !== null && quotedAt > 0
      ? new Date(quotedAt).toISOString()
      : null,
  };
}

function normalizePayload(
  source: Record<string, unknown>,
  options: { quoteTimestamp: number | null; strategySourceContext: unknown },
  label: string,
): JsonObject {
  const manualStatistics = normalizeLocalManualStatistics(source.manualStatistics);
  const strategySourceContext = options.strategySourceContext === undefined
    ? null
    : options.strategySourceContext;
  if (strategySourceContext !== null) requireObject(strategySourceContext, `${label}.strategySourceContext`);
  const payload = createSessionPayload({
    maps: requireArray(source.maps, `${label}.maps`),
    lootItems: requireArray(source.lootItems, `${label}.lootItems`),
    baselineItems: requireArray(source.baselineItems ?? [], `${label}.baselineItems`),
    baselineTotal: finiteNumber(source.baselineTotal, 0, `${label}.baselineTotal`),
    manualLootItems: requireArray(source.manualLootItems ?? [], `${label}.manualLootItems`),
    manualStatistics: requireObject(manualStatistics, `${label}.manualStatistics`),
    manualRunTimer: requireObject(
      normalizeManualRunTimer(source.manualRunTimer),
      `${label}.manualRunTimer`,
    ),
    settings: quotedSettings(source.settings, options.quoteTimestamp, `${label}.settings`),
    sessionNotes: typeof source.sessionNotes === 'string'
      ? source.sessionNotes
      : typeof source.notes === 'string' ? source.notes : '',
    investmentNeutralization: finiteNumber(
      source.investmentNeutralization,
      0,
      `${label}.investmentNeutralization`,
    ),
    investmentDismissed: booleanValue(
      source.investmentDismissed,
      false,
      `${label}.investmentDismissed`,
    ),
    strategySourceContext: strategySourceContext === null
      ? null
      : cloneJson(strategySourceContext) as JsonObject,
  });
  assertJsonValue(payload);
  return payload;
}

function summarizePayload(payload: JsonObject): JsonObject {
  const maps = payload.maps as JsonValue[];
  const loot = payload.lootItems as JsonValue[];
  const baseline = payload.baselineItems as JsonValue[];
  const notes = payload.sessionNotes as string;
  return {
    mapCount: maps.length,
    lootItemCount: loot.length,
    baselineItemCount: baseline.length,
    hasNotes: notes.length > 0,
  };
}

async function sessionBody(
  identity: { kind: 'named'; id: string; name: string } | { kind: 'working' },
  createdAt: string,
  updatedAt: string,
  payload: JsonObject,
): Promise<SessionBodyV1> {
  const body: SessionBodyV1 = {
    kind: identity.kind,
    id: identity.kind === 'named' ? identity.id : null,
    name: identity.kind === 'named' ? identity.name : null,
    createdAt,
    updatedAt,
    generation: 1,
    semanticHash: await computeSemanticHash(payload),
    summary: summarizePayload(payload),
    payload,
  };
  assertJsonValue(body);
  return body;
}

function sourceValues(snapshot: LegacyStorageSnapshot): LegacyStorageValue[] {
  const values = [snapshot.store, snapshot.layout, snapshot.changelog];
  const expected = [
    LEGACY_STORE_STORAGE_KEY,
    LEGACY_LAYOUT_STORAGE_KEY,
    LEGACY_CHANGELOG_STORAGE_KEY,
  ];
  values.forEach((value, index) => {
    if (value.key !== expected[index]) {
      throw new LegacyMigrationSourceError(
        `Legacy storage key ${value.key} does not match expected key ${expected[index]}`,
      );
    }
    if (value.rawValue !== null && typeof value.rawValue !== 'string') {
      throw new LegacyMigrationSourceError(`${value.key} must be a string or null`);
    }
  });
  return values.map((value) => ({ ...value }));
}

function currentSource(state: SessionState): Record<string, unknown> {
  return {
    maps: state.maps,
    lootItems: state.lootItems,
    baselineItems: state.baselineItems,
    baselineTotal: state.baselineTotal,
    manualLootItems: state.manualLootItems,
    manualStatistics: state.manualStatistics,
    manualRunTimer: state.manualRunTimer,
    settings: state.settings,
    sessionNotes: state.sessionNotes,
    investmentNeutralization: state.investmentNeutralization,
    investmentDismissed: state.investmentDismissed,
  };
}

async function migrateSessions(
  state: SessionState,
  identity: LegacyMigrationIdentity,
): Promise<LegacyMigrationSession[]> {
  const now = identity.now.toISOString();
  const sessions: LegacyMigrationSession[] = [];
  const ids = new Set<string>();
  for (const [key, unknownSaved] of Object.entries(state.savedSessions)) {
    if (!isPlainObject(unknownSaved)) {
      throw new LegacyMigrationSourceError(`savedSessions.${key} must be an object`);
    }
    const id = requireNonEmptyString(unknownSaved.id, `savedSessions.${key}.id`);
    if (id !== key) throw new LegacyMigrationSourceError(`savedSessions.${key}.id must match its key`);
    if (ids.has(id)) throw new LegacyMigrationSourceError(`Duplicate session id ${id}`);
    ids.add(id);
    const name = requireNonEmptyString(unknownSaved.name, `savedSessions.${key}.name`);
    const createdAt = requireTimestamp(unknownSaved.createdAt, `savedSessions.${key}.createdAt`);
    const payload = normalizePayload(
      unknownSaved,
      {
        quoteTimestamp: null,
        strategySourceContext: unknownSaved.loadedStrategyInfo ?? null,
      },
      `savedSessions.${key}`,
    );
    sessions.push({
      target: { kind: 'session', sessionId: id },
      current: await sessionBody({ kind: 'named', id, name }, createdAt, createdAt, payload),
    });
  }

  const quoteTimestamp = finiteNumber(
    state.divinePriceFetchedAt,
    0,
    'state.divinePriceFetchedAt',
  );
  if (quoteTimestamp < 0 || (quoteTimestamp > 0 && !Number.isFinite(new Date(quoteTimestamp).getTime()))) {
    throw new LegacyMigrationSourceError('state.divinePriceFetchedAt must be a valid epoch timestamp');
  }
  const activePayload = normalizePayload(
    currentSource(state),
    {
      quoteTimestamp,
      strategySourceContext: state.loadedStrategyInfo,
    },
    'state',
  );

  if (state.activeSessionId === null) {
    sessions.push({
      target: { kind: 'working' },
      current: await sessionBody({ kind: 'working' }, now, now, activePayload),
    });
    return sessions;
  }

  const activeId = requireNonEmptyString(state.activeSessionId, 'state.activeSessionId');
  const existingIndex = sessions.findIndex(
    (session) => session.target.kind === 'session' && session.target.sessionId === activeId,
  );
  const savedBody = existingIndex >= 0 ? sessions[existingIndex].current : null;
  const activeName = typeof state.activeSessionName === 'string' && state.activeSessionName.length > 0
    ? state.activeSessionName
    : savedBody?.name;
  const name = requireNonEmptyString(activeName, 'state.activeSessionName');
  const createdAt = savedBody?.createdAt ??
    (/^\d{4}-\d{2}-\d{2}T/.test(activeId) && Number.isFinite(Date.parse(activeId)) ? activeId : now);
  const activeBody = await sessionBody(
    { kind: 'named', id: activeId, name },
    createdAt,
    now,
    activePayload,
  );
  const differs = savedBody !== null && savedBody.semanticHash !== activeBody.semanticHash;
  if (differs && savedBody) {
    savedBody.checkpoint = {
      id: `legacy-${savedBody.semanticHash.slice(0, 16)}`,
      at: now,
      reason: 'activation',
      activationId: `${identity.operationId}:legacy-active`,
      summary: cloneJson(savedBody.summary),
    };
  }
  const migrated: LegacyMigrationSession = {
    target: { kind: 'session', sessionId: activeId },
    current: activeBody,
    ...(differs && savedBody ? { checkpoint: savedBody } : {}),
  };
  if (existingIndex >= 0) sessions[existingIndex] = migrated;
  else sessions.push(migrated);
  return sessions;
}

export async function migrateSessionEnvelope(
  snapshot: LegacyStorageSnapshot,
  identity: LegacyMigrationIdentity,
): Promise<LegacyMigrationPlanV1> {
  requireNonEmptyString(identity.repositoryId, 'repositoryId');
  requireNonEmptyString(identity.operationId, 'operationId');
  if (!Number.isFinite(identity.now.getTime())) throw new LegacyMigrationSourceError('now is invalid');
  const values = sourceValues(snapshot);
  const envelope = parseEnvelope(snapshot.store.rawValue);
  const state = normalizedLegacyState(envelope);
  const sessions = await migrateSessions(state, identity);
  const expectedSessionIds = sessions
    .flatMap((session) => session.target.kind === 'session' ? [session.target.sessionId] : [])
    .sort();
  if (new Set(expectedSessionIds).size !== expectedSessionIds.length) {
    throw new LegacyMigrationSourceError('Migrated session ids are not unique');
  }
  const activeTarget = state.activeSessionId === null
    ? { kind: 'working' as const }
    : { kind: 'session' as const, sessionId: state.activeSessionId };
  const createdAt = identity.now.toISOString();
  const preferences: JsonObject = {
    generation: 1,
    discordTag: requireString(state.discordTag, 'state.discordTag'),
    regexSets: requireArray(state.regexSets, 'state.regexSets'),
    leagueOverride: nullableString(state.leagueOverride, 'state.leagueOverride'),
    atlasBonusByLeague: requireObject(state.atlasBonusByLeague, 'state.atlasBonusByLeague'),
    retrospectiveCloseouts: requireObject(state.retrospectiveCloseouts, 'state.retrospectiveCloseouts'),
    regexBuilderGroups: requireArray(state.regexBuilderGroups, 'state.regexBuilderGroups'),
    scarabPresets: requireArray(state.scarabPresets, 'state.scarabPresets'),
    onboardingDismissed: booleanValue(state.onboardingDismissed, false, 'state.onboardingDismissed'),
    defaultExclusionPreset: requireArray(state.defaultExclusionPreset, 'state.defaultExclusionPreset'),
    defaultInclusionPreset: Array.isArray(state.defaultInclusionPreset)
      ? state.defaultInclusionPreset
      : [],
    exclusionPresets: requireArray(state.exclusionPresets, 'state.exclusionPresets'),
    lastDivineFetchAt: finiteNumber(state.divinePriceFetchedAt, 0, 'state.divinePriceFetchedAt'),
    lastSeenChangelogVersion: snapshot.changelog.rawValue,
  };
  const layout: JsonObject = { generation: 1, rawValue: snapshot.layout.rawValue };
  const bootstrap: JsonObject = {
    generation: 1,
    activeTarget,
    viewedTarget: activeTarget,
    lifecycle: state.activeSessionId === null ? 'live' : 'historical',
    suspended: false,
    activationId: `${identity.operationId}:legacy-active`,
    pendingSave: false,
    pendingAtlasBonusSeed: booleanValue(
      state.pendingAtlasBonusSeed,
      false,
      'state.pendingAtlasBonusSeed',
    ),
    pendingAtlasBonusValue: nullableBoolean(
      state.pendingAtlasBonusValue,
      'state.pendingAtlasBonusValue',
    ),
    captureEnabled: false,
    sourceStoreVersion: envelope.version,
  };
  const catalogSessions = sessions
    .filter((session) => session.target.kind === 'session')
    .map((session) => ({
      id: session.current.id as string,
      name: session.current.name as string,
      createdAt: session.current.createdAt,
      updatedAt: session.current.updatedAt,
      generation: session.current.generation,
      summary: cloneJson(session.current.summary),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const catalog: JsonObject = { generation: 1, sessions: catalogSessions };
  assertJsonValue(preferences);
  assertJsonValue(layout);
  assertJsonValue(bootstrap);
  assertJsonValue(catalog);
  return {
    schema: LEGACY_MIGRATION_SCHEMA,
    repositoryVersion: SESSION_REPOSITORY_VERSION,
    repositoryId: identity.repositoryId,
    operationId: identity.operationId,
    createdAt,
    sourceStoreVersion: envelope.version,
    sourceHash: await computeSemanticHash(values),
    sourceValues: values,
    sessions,
    preferences,
    layout,
    bootstrap,
    catalog,
    expectedSessionIds,
  };
}
