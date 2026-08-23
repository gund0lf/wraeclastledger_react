import { v4 as uuidv4 } from 'uuid';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  LEGACY_STORE_VERSION,
  type LegacyMigrationPlanV1,
  type LegacyStorageSnapshot,
} from '../../../shared/sessionMigration';
import { assertJsonValue, computeSemanticHash, type JsonObject, type JsonValue } from '../../../shared/sessionRecord';
import type {
  RepositorySessionSummary,
  RepositoryWorkflow,
  SessionRepositoryDataMap,
  SessionTarget,
} from '../../../shared/sessionRepositoryIpc';
import type { SavedSession, SessionSettings } from '../types';
import { confirmedLeagueSync, getCurrentLeague, setLeagueOverrideValue } from '../utils/league';
import { normalizeLocalManualStatistics } from '../utils/manualStatistics';
import { isWorkingPayloadMeaningful, isWorkingSessionMeaningful } from '../utils/workingSession';
import {
  DEFAULT_SETTINGS,
  configureSessionRepositoryActions,
  useSessionStore,
  type SessionState,
} from '../store/useSessionStore';
import { migrateSessionEnvelope } from './legacySessionMigration';
import {
  createSessionRepositoryClient,
  SessionRepositoryClientError,
} from './sessionRepositoryClient';

const SESSION_SAVE_DEBOUNCE_MS = 500;
const PREFERENCE_SAVE_DEBOUNCE_MS = 500;

type BootstrapData = SessionRepositoryDataMap['bootstrap'];
type LoadData = SessionRepositoryDataMap['load'];

interface PendingSessionSave {
  target: SessionTarget;
  payload: JsonObject;
  activationId?: string;
  checkpointReason?: 'destructive';
  freshEmptyWorking?: true;
}

interface LayoutSaveWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

export function selectRetrySnapshot<T>(pending: T | null, failed: T | null): T | null {
  return pending ?? failed;
}

export function workflowForHistoricalDuplicate(
  previous: RepositoryWorkflow,
  duplicateTarget: SessionTarget,
  activationId: string,
): RepositoryWorkflow {
  return {
    ...previous,
    viewedTarget: duplicateTarget,
    lifecycle: 'historical',
    suspended: true,
    activationId,
  };
}

let client: ReturnType<typeof createSessionRepositoryClient> | null = null;
let applyingRepositoryState = false;
let pendingSessionSave: PendingSessionSave | null = null;
let pendingExplicitCheckpointReason: 'destructive' | null = null;
let failedSessionSave: PendingSessionSave | null = null;
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
let sessionSaveDrain: Promise<void> | null = null;
let preferenceSaveTimer: ReturnType<typeof setTimeout> | null = null;
let preferenceSaveDrain: Promise<void> | null = null;
let pendingPreferenceSave = false;
let failedPreferenceSave = false;
let pendingLayoutRawValue: string | null = null;
let layoutSaveWaiters: LayoutSaveWaiter[] = [];
let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null;
let layoutSaveDrain: Promise<void> | null = null;
let failedLayoutSave = false;
let pendingRestoreHydration: { target: SessionTarget } | null = null;
let workflowSaveBarrier: Promise<void> = Promise.resolve();
let workflowWritesPending = 0;
let failedWorkflowSave: RepositoryWorkflow | null = null;
let failedWorkflowError: string | null = null;
let metadataRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastSeenChangelogVersion: string | null = null;
let initialLayoutRawValue: string | null = null;
let unsubscribeStore: (() => void) | null = null;
let removeFlushListener: (() => void) | null = null;

function repositoryClient(): ReturnType<typeof createSessionRepositoryClient> {
  if (!client) client = createSessionRepositoryClient(window.api.sessionRepository);
  return client;
}

export async function refreshRepositoryMetadata(): Promise<void> {
  if (useSessionStore.getState().repositoryStatus !== 'ready') return;
  const data = await repositoryClient().request({ operation: 'list' });
  useSessionStore.setState({
    repositorySessions: data.sessions,
    repositorySizeBytes: data.repositorySizeBytes,
  });
}

function queueRepositoryMetadataRefresh(): void {
  if (metadataRefreshTimer) clearTimeout(metadataRefreshTimer);
  metadataRefreshTimer = setTimeout(() => {
    metadataRefreshTimer = null;
    void refreshRepositoryMetadata().catch((error) => {
      console.error('[Session repository] Metadata refresh failed:', error);
    });
  }, 1500);
}

function jsonValue(value: unknown, path = '$'): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((child, index) => {
      if (child === undefined) throw new Error(`${path}[${index}] is undefined`);
      return jsonValue(child, `${path}[${index}]`);
    });
  }
  if (typeof value !== 'object') throw new Error(`${path} contains an unsupported value`);
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child !== undefined) output[key] = jsonValue(child, `${path}.${key}`);
  }
  return output;
}

function jsonObject(value: unknown): JsonObject {
  const normalized = jsonValue(value);
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== 'object') {
    throw new Error('Repository payload must be an object');
  }
  assertJsonValue(normalized);
  return normalized;
}

function legacySnapshot(createSynthetic = false): LegacyStorageSnapshot {
  let storeRaw = localStorage.getItem(LEGACY_STORE_STORAGE_KEY);
  if (storeRaw === null && createSynthetic) {
    const state = useSessionStore.getState();
    const legacyState = Object.fromEntries(
      Object.entries(state).filter(([key, value]) => (
        typeof value !== 'function' && ![
          'repositoryStatus', 'repositoryError', 'repositorySessions', 'repositorySizeBytes',
          'currentGeneration', 'preferencesGeneration', 'layoutGeneration', 'saveStatus',
          'saveError', 'sessionLifecycle', 'liveSessionId', 'activationCheckpointNotice',
          'historyStoragePressure',
        ].includes(key)
      )),
    );
    storeRaw = JSON.stringify({ state: legacyState, version: LEGACY_STORE_VERSION });
  }
  return {
    store: { key: LEGACY_STORE_STORAGE_KEY, rawValue: storeRaw },
    layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY) },
    changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: localStorage.getItem(LEGACY_CHANGELOG_STORAGE_KEY) },
  };
}

async function migrationPlan(
  snapshot: LegacyStorageSnapshot,
  details: JsonObject | undefined,
): Promise<LegacyMigrationPlanV1> {
  const now = typeof details?.createdAt === 'string' ? new Date(details.createdAt) : new Date();
  const plan = await migrateSessionEnvelope(snapshot, {
    repositoryId: typeof details?.repositoryId === 'string' ? details.repositoryId : uuidv4(),
    operationId: typeof details?.operationId === 'string' ? details.operationId : uuidv4(),
    now,
  });
  if (typeof details?.sourceHash === 'string' && details.sourceHash !== plan.sourceHash) {
    throw new Error('Legacy browser data changed after the file migration began');
  }
  return plan;
}

function workflowLiveSessionId(workflow: RepositoryWorkflow): string | null {
  return workflow.activeTarget.kind === 'session' ? workflow.activeTarget.sessionId : null;
}

function summaryName(sessions: RepositorySessionSummary[], target: SessionTarget): string | null {
  return target.kind === 'session'
    ? sessions.find(({ id }) => id === target.sessionId)?.name ?? null
    : null;
}

function applyPreferences(preferences: JsonObject): Partial<SessionState> {
  const leagueOverride = typeof preferences.leagueOverride === 'string' ? preferences.leagueOverride : null;
  setLeagueOverrideValue(leagueOverride);
  lastSeenChangelogVersion = typeof preferences.lastSeenChangelogVersion === 'string'
    ? preferences.lastSeenChangelogVersion : null;
  return {
    discordTag: typeof preferences.discordTag === 'string' ? preferences.discordTag : '',
    regexSets: Array.isArray(preferences.regexSets) ? preferences.regexSets as unknown as SessionState['regexSets'] : [],
    leagueOverride,
    atlasBonusByLeague: typeof preferences.atlasBonusByLeague === 'object' && preferences.atlasBonusByLeague !== null
      ? preferences.atlasBonusByLeague as SessionState['atlasBonusByLeague'] : {},
    retrospectiveCloseouts: typeof preferences.retrospectiveCloseouts === 'object' && preferences.retrospectiveCloseouts !== null
      ? preferences.retrospectiveCloseouts as unknown as SessionState['retrospectiveCloseouts'] : {},
    regexBuilderGroups: Array.isArray(preferences.regexBuilderGroups)
      ? preferences.regexBuilderGroups as unknown as SessionState['regexBuilderGroups'] : [],
    scarabPresets: Array.isArray(preferences.scarabPresets)
      ? preferences.scarabPresets as unknown as SessionState['scarabPresets'] : [],
    onboardingDismissed: preferences.onboardingDismissed === true,
    defaultExclusionPreset: Array.isArray(preferences.defaultExclusionPreset)
      ? preferences.defaultExclusionPreset as string[] : [],
    exclusionPresets: Array.isArray(preferences.exclusionPresets)
      ? preferences.exclusionPresets as unknown as SessionState['exclusionPresets'] : [],
    divinePriceFetchedAt: typeof preferences.lastDivineFetchAt === 'number'
      ? preferences.lastDivineFetchAt : 0,
  };
}

function applyPayload(data: LoadData, sessions: RepositorySessionSummary[]): Partial<SessionState> {
  const payload = data.payload;
  const settings = typeof payload.settings === 'object' && payload.settings !== null && !Array.isArray(payload.settings)
    ? payload.settings as unknown as Partial<SessionSettings> : {};
  return {
    maps: Array.isArray(payload.maps) ? payload.maps as unknown as SessionState['maps'] : [],
    lootItems: Array.isArray(payload.lootItems) ? payload.lootItems as unknown as SessionState['lootItems'] : [],
    baselineItems: Array.isArray(payload.baselineItems) ? payload.baselineItems as unknown as SessionState['baselineItems'] : [],
    baselineTotal: typeof payload.baselineTotal === 'number' ? payload.baselineTotal : 0,
    manualLootItems: Array.isArray(payload.manualLootItems) ? payload.manualLootItems as unknown as SessionState['manualLootItems'] : [],
    manualStatistics: normalizeLocalManualStatistics(payload.manualStatistics),
    settings: { ...DEFAULT_SETTINGS, ...settings },
    sessionNotes: typeof payload.sessionNotes === 'string' ? payload.sessionNotes : '',
    investmentNeutralization: typeof payload.investmentNeutralization === 'number'
      ? payload.investmentNeutralization : 0,
    investmentDismissed: payload.investmentDismissed === true,
    loadedStrategyInfo: payload.strategySourceContext && typeof payload.strategySourceContext === 'object' && !Array.isArray(payload.strategySourceContext)
      ? payload.strategySourceContext as SessionState['loadedStrategyInfo'] : null,
    activeSessionId: data.target.kind === 'session' ? data.target.sessionId : null,
    activeSessionName: summaryName(sessions, data.target),
    currentGeneration: data.generation,
    sessionLifecycle: data.workflow.lifecycle,
    liveSessionId: workflowLiveSessionId(data.workflow),
    pendingAtlasBonusSeed: data.workflow.pendingAtlasBonusSeed,
    pendingAtlasBonusValue: data.workflow.pendingAtlasBonusValue,
    isWatching: false,
    activationCheckpointNotice: null,
    historyStoragePressure: false,
  };
}

function currentTarget(state = useSessionStore.getState()): SessionTarget {
  return state.activeSessionId
    ? { kind: 'session', sessionId: state.activeSessionId }
    : { kind: 'working' };
}

function sessionPayload(state = useSessionStore.getState()): JsonObject {
  return jsonObject({
    maps: state.maps,
    lootItems: state.lootItems,
    baselineItems: state.baselineItems,
    baselineTotal: state.baselineTotal,
    manualLootItems: state.manualLootItems,
    manualStatistics: state.manualStatistics,
    settings: state.settings,
    sessionNotes: state.sessionNotes,
    investmentNeutralization: state.investmentNeutralization,
    investmentDismissed: state.investmentDismissed,
    strategySourceContext: state.loadedStrategyInfo,
  });
}

function preferencePayload(state = useSessionStore.getState()): JsonObject {
  return jsonObject({
    discordTag: state.discordTag,
    regexSets: state.regexSets,
    leagueOverride: state.leagueOverride,
    atlasBonusByLeague: state.atlasBonusByLeague,
    retrospectiveCloseouts: state.retrospectiveCloseouts,
    regexBuilderGroups: state.regexBuilderGroups,
    scarabPresets: state.scarabPresets,
    onboardingDismissed: state.onboardingDismissed,
    defaultExclusionPreset: state.defaultExclusionPreset,
    exclusionPresets: state.exclusionPresets,
    lastDivineFetchAt: state.divinePriceFetchedAt,
    lastSeenChangelogVersion,
  });
}

function updateWorkflowState(workflow: RepositoryWorkflow): void {
  useSessionStore.setState({
    sessionLifecycle: workflow.lifecycle,
    liveSessionId: workflowLiveSessionId(workflow),
    pendingAtlasBonusSeed: workflow.pendingAtlasBonusSeed,
    pendingAtlasBonusValue: workflow.pendingAtlasBonusValue,
    ...(workflow.lifecycle === 'historical' ? { isWatching: false } : {}),
  });
}

function markRepositorySaving(): void {
  useSessionStore.setState({ saveStatus: 'saving', saveError: null });
}

function settleRepositorySaved(): void {
  if (failedSessionSave || failedPreferenceSave || failedLayoutSave || failedWorkflowSave) return;
  if (pendingSessionSave || sessionSaveTimer || pendingPreferenceSave || preferenceSaveTimer ||
      preferenceSaveDrain || pendingLayoutRawValue !== null || layoutSaveTimer || layoutSaveDrain ||
      workflowWritesPending > 0) return;
  useSessionStore.setState({ saveStatus: 'saved', saveError: null });
}

async function drainSessionSaves(): Promise<void> {
  while (pendingSessionSave) {
    const pending = pendingSessionSave;
    pendingSessionSave = null;
    const state = useSessionStore.getState();
    if (state.currentGeneration === null || currentTarget(state).kind !== pending.target.kind ||
        (pending.target.kind === 'session' && state.activeSessionId !== pending.target.sessionId)) {
      throw new Error('Session target changed before its queued save could commit');
    }
    markRepositorySaving();
    try {
      const data = await repositoryClient().request({
        operation: 'save',
        target: pending.target,
        expectedGeneration: useSessionStore.getState().currentGeneration,
        payload: pending.payload,
        ...(pending.activationId ? { activationId: pending.activationId } : {}),
        ...(pending.checkpointReason ? { checkpointReason: pending.checkpointReason } : {}),
        ...(pending.freshEmptyWorking ? { freshEmptyWorking: true as const } : {}),
      });
      failedSessionSave = null;
      const sessions = data.summary
        ? [...useSessionStore.getState().repositorySessions.filter(({ id }) => id !== data.summary!.id), data.summary]
        : useSessionStore.getState().repositorySessions;
      useSessionStore.setState({
        currentGeneration: data.generation,
        repositorySessions: sessions,
        saveStatus: 'saving',
        saveError: null,
        ...(data.checkpoint?.isActivationBaseline
          ? { activationCheckpointNotice: data.checkpoint } : {}),
        historyStoragePressure: data.historyStoragePressure,
      });
      updateWorkflowState(data.workflow);
      queueRepositoryMetadataRefresh();
    } catch (error) {
      failedSessionSave = pending;
      pendingSessionSave = null;
      useSessionStore.setState({
        saveStatus: 'failed',
        saveError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

function ensureSessionDrain(): Promise<void> {
  if (!sessionSaveDrain) {
    sessionSaveDrain = drainSessionSaves().finally(() => {
      sessionSaveDrain = null;
      if (pendingSessionSave) void ensureSessionDrain().catch(() => undefined);
      else settleRepositorySaved();
    });
  }
  return sessionSaveDrain;
}

function queueSessionSave(immediate: boolean): void {
  try {
    if (pendingRestoreHydration) {
      throw new Error('A restored version is waiting to be reloaded. Retry before making more changes.');
    }
    const checkpointReason = pendingSessionSave?.checkpointReason ?? pendingExplicitCheckpointReason;
    pendingExplicitCheckpointReason = null;
    const state = useSessionStore.getState();
    const target = currentTarget(state);
    pendingSessionSave = {
      target,
      payload: sessionPayload(state),
      ...(repositoryWorkflow?.activationId ? { activationId: repositoryWorkflow.activationId } : {}),
      ...(checkpointReason ? { checkpointReason } : {}),
      ...(target.kind === 'working' && !isWorkingSessionMeaningful(state, DEFAULT_SETTINGS)
        ? { freshEmptyWorking: true as const } : {}),
    };
    markRepositorySaving();
    if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
    if (immediate) {
      sessionSaveTimer = null;
      void ensureSessionDrain().catch(() => undefined);
    } else {
      sessionSaveTimer = setTimeout(() => {
        sessionSaveTimer = null;
        void ensureSessionDrain().catch(() => undefined);
      }, SESSION_SAVE_DEBOUNCE_MS);
    }
  } catch (error) {
    useSessionStore.setState({ saveStatus: 'failed', saveError: error instanceof Error ? error.message : String(error) });
  }
}

export function checkpointBeforeDestructive(): void {
  pendingExplicitCheckpointReason = 'destructive';
}

async function savePreferencesNow(): Promise<void> {
  const state = useSessionStore.getState();
  if (state.preferencesGeneration === null) throw new Error('Preferences are not hydrated');
  const data = await repositoryClient().request({
    operation: 'save',
    target: { kind: 'preferences' },
    expectedGeneration: state.preferencesGeneration,
    payload: preferencePayload(state),
  });
  failedPreferenceSave = false;
  useSessionStore.setState({ preferencesGeneration: data.generation });
  queueRepositoryMetadataRefresh();
}

async function drainPreferenceSaves(): Promise<void> {
  while (pendingPreferenceSave) {
    pendingPreferenceSave = false;
    try {
      await savePreferencesNow();
    } catch (error) {
      pendingPreferenceSave = true;
      failedPreferenceSave = true;
      useSessionStore.setState({
        saveStatus: 'failed',
        saveError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

function ensurePreferenceDrain(): Promise<void> {
  if (!preferenceSaveDrain) {
    preferenceSaveDrain = drainPreferenceSaves();
    void preferenceSaveDrain.then(() => {
      preferenceSaveDrain = null;
      if (pendingPreferenceSave && !failedPreferenceSave) void ensurePreferenceDrain().catch(() => undefined);
      else settleRepositorySaved();
    }, () => {
      preferenceSaveDrain = null;
    });
  }
  return preferenceSaveDrain;
}

function queuePreferenceSave(): void {
  pendingPreferenceSave = true;
  markRepositorySaving();
  if (preferenceSaveTimer) clearTimeout(preferenceSaveTimer);
  preferenceSaveTimer = setTimeout(() => {
    preferenceSaveTimer = null;
    void ensurePreferenceDrain().catch(() => undefined);
  }, PREFERENCE_SAVE_DEBOUNCE_MS);
}

export async function flushRepositoryNow(): Promise<void> {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  if (pendingSessionSave) await ensureSessionDrain();
  if (sessionSaveDrain) await sessionSaveDrain;
  if (preferenceSaveTimer) {
    clearTimeout(preferenceSaveTimer);
    preferenceSaveTimer = null;
  }
  if (pendingPreferenceSave) await ensurePreferenceDrain();
  if (preferenceSaveDrain) await preferenceSaveDrain;
  if (layoutSaveTimer) {
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = null;
  }
  if (pendingLayoutRawValue !== null) await ensureLayoutDrain();
  if (layoutSaveDrain) await layoutSaveDrain;
  await workflowSaveBarrier;
  if (useSessionStore.getState().saveStatus === 'failed') {
    throw new Error(useSessionStore.getState().saveError ?? 'Repository save failed');
  }
}

export async function retryRepositorySave(): Promise<void> {
  markRepositorySaving();
  if (pendingRestoreHydration) {
    const pending = pendingRestoreHydration;
    try {
      await hydrateRestoredTarget(pending.target);
      pendingRestoreHydration = null;
    } catch (error) {
      useSessionStore.setState({
        saveStatus: 'failed',
        saveError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  // Edits may continue after a failed write. Never replace a newer queued
  // snapshot with the older snapshot that originally failed.
  pendingSessionSave = selectRetrySnapshot(pendingSessionSave, failedSessionSave);
  failedSessionSave = null;
  if (failedPreferenceSave) {
    failedPreferenceSave = false;
    pendingPreferenceSave = true;
  }
  if (failedLayoutSave) failedLayoutSave = false;
  if (failedWorkflowSave) {
    const workflow = failedWorkflowSave;
    failedWorkflowSave = null;
    failedWorkflowError = null;
    void mutateWorkflow(() => workflow).catch(() => undefined);
  }
  await flushRepositoryNow();
  settleRepositorySaved();
}

let repositoryWorkflow: RepositoryWorkflow | null = null;
let repositoryBootstrapGeneration: number | null = null;

function mutateWorkflow(
  mutate: (current: RepositoryWorkflow) => RepositoryWorkflow,
): Promise<void> {
  workflowWritesPending += 1;
  markRepositorySaving();
  let attemptedWorkflow: RepositoryWorkflow | null = null;
  const task = workflowSaveBarrier.then(async () => {
    if (!repositoryWorkflow || repositoryBootstrapGeneration === null) {
      throw new Error('Repository workflow is not hydrated');
    }
    if (failedWorkflowSave) {
      attemptedWorkflow = mutate(failedWorkflowSave);
      throw new Error(failedWorkflowError ?? 'A previous workflow save failed');
    }
    const workflow = mutate(repositoryWorkflow);
    attemptedWorkflow = workflow;
    const data = await repositoryClient().request({
      operation: 'save',
      target: { kind: 'bootstrap' },
      expectedGeneration: repositoryBootstrapGeneration,
      payload: workflow,
    });
    repositoryWorkflow = data.workflow;
    repositoryBootstrapGeneration = data.workflowGeneration;
    failedWorkflowSave = null;
    failedWorkflowError = null;
    updateWorkflowState(data.workflow);
  });
  workflowSaveBarrier = task.then(() => {
    workflowWritesPending -= 1;
    settleRepositorySaved();
  }, (error) => {
    workflowWritesPending -= 1;
    failedWorkflowSave = attemptedWorkflow;
    failedWorkflowError ??= error instanceof Error ? error.message : String(error);
    useSessionStore.setState({
      saveStatus: 'failed',
      saveError: error instanceof Error ? error.message : String(error),
    });
  });
  return task;
}

export async function nameCurrent(name: string): Promise<void> {
  await flushRepositoryNow();
  const previousWorkflow = repositoryWorkflow;
  const data = await repositoryClient().request({
    operation: 'save',
    target: { kind: 'new', name },
    expectedGeneration: null,
    payload: sessionPayload(),
  });
  if (data.target.kind !== 'session' || !data.summary) throw new Error('Naming the session returned an invalid target');
  const duplicateTarget: SessionTarget = { kind: 'session', sessionId: data.target.sessionId };
  repositoryWorkflow = data.workflow;
  repositoryBootstrapGeneration = data.workflowGeneration;
  applyingRepositoryState = true;
  useSessionStore.setState((state) => ({
    activeSessionId: data.target.kind === 'session' ? data.target.sessionId : state.activeSessionId,
    activeSessionName: name,
    currentGeneration: data.generation,
    repositorySessions: [...state.repositorySessions.filter(({ id }) => id !== data.summary!.id), data.summary!],
    sessionLifecycle: data.workflow.lifecycle,
    liveSessionId: workflowLiveSessionId(data.workflow),
    saveStatus: 'saved',
    saveError: null,
  }));
  applyingRepositoryState = false;
  if (previousWorkflow?.lifecycle === 'historical') {
    await mutateWorkflow(() => workflowForHistoricalDuplicate(
      previousWorkflow,
      duplicateTarget,
      uuidv4(),
    ));
  }
  queueRepositoryMetadataRefresh();
}

function sessionLeague(data: LoadData): string {
  return typeof data.payload.settings === 'object' && data.payload.settings !== null && !Array.isArray(data.payload.settings) &&
    typeof data.payload.settings.leagueName === 'string'
    ? data.payload.settings.leagueName : '';
}

export function shouldSuspendForConfirmedLeague(
  workflow: RepositoryWorkflow,
  payload: JsonObject,
  confirmedLeague: string | null,
): boolean {
  if (workflow.lifecycle !== 'live' || !confirmedLeague) return false;
  const settings = payload.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const league = typeof settings.leagueName === 'string' ? settings.leagueName.trim() : '';
  return league.length > 0 && league !== confirmedLeague;
}

export async function loadNamed(id: string): Promise<void> {
  await flushRepositoryNow();
  const target = { kind: 'session', sessionId: id } as const;
  const inspected = await repositoryClient().request({ operation: 'load', target, mode: 'inspect' });
  const confirmed = confirmedLeagueSync();
  const canResume = repositoryWorkflow?.activeTarget.kind === 'session' &&
    repositoryWorkflow.activeTarget.sessionId === id &&
    (!sessionLeague(inspected) || (!!confirmed && sessionLeague(inspected) === confirmed));
  const data = await repositoryClient().request({ operation: 'load', target, mode: canResume ? 'resume' : 'view' });
  repositoryWorkflow = data.workflow;
  repositoryBootstrapGeneration = data.workflowGeneration;
  applyingRepositoryState = true;
  useSessionStore.setState({
    ...applyPayload(data, useSessionStore.getState().repositorySessions),
    saveStatus: 'saved',
    saveError: null,
    sessionNonce: useSessionStore.getState().sessionNonce + 1,
  });
  applyingRepositoryState = false;
  queueRepositoryMetadataRefresh();
}

export async function resumeCurrent(): Promise<void> {
  await flushRepositoryNow();
  const target = currentTarget();
  const inspected = await repositoryClient().request({ operation: 'load', target, mode: 'inspect' });
  const confirmed = confirmedLeagueSync();
  const league = sessionLeague(inspected);
  if (confirmed && league && league !== confirmed) {
    throw new Error(`This session belongs to ${league}. Start a new ${confirmed} session or fork a copy into it.`);
  }
  const data = await repositoryClient().request({ operation: 'load', target, mode: 'resume' });
  repositoryWorkflow = data.workflow;
  repositoryBootstrapGeneration = data.workflowGeneration;
  applyingRepositoryState = true;
  useSessionStore.setState({
    ...applyPayload(data, useSessionStore.getState().repositorySessions),
    saveStatus: 'saved',
    saveError: null,
    sessionNonce: useSessionStore.getState().sessionNonce + 1,
  });
  applyingRepositoryState = false;
  queueRepositoryMetadataRefresh();
}

export function forkPayloadIntoLeague(
  payload: JsonObject,
  league: string,
  atlasBonus: boolean,
): JsonObject {
  const sourceSettings = payload.settings;
  const forkSettings: Record<string, unknown> = sourceSettings && typeof sourceSettings === 'object' &&
    !Array.isArray(sourceSettings) ? { ...sourceSettings } : {};
  forkSettings.leagueName = league;
  forkSettings.divinePrice = 0;
  forkSettings.atlasBonus = atlasBonus;
  delete forkSettings.divinePriceQuotedAt;
  return { ...payload, settings: jsonObject(forkSettings) };
}

export async function forkCurrentToConfirmedLeague(name: string): Promise<void> {
  await flushRepositoryNow();
  const confirmed = confirmedLeagueSync();
  if (!confirmed) throw new Error('The current league has not been confirmed yet.');
  const state = useSessionStore.getState();
  const payload = forkPayloadIntoLeague(
    sessionPayload(state),
    confirmed,
    state.atlasBonusByLeague[confirmed] ?? false,
  );
  const data = await repositoryClient().request({
    operation: 'save',
    target: { kind: 'new', name },
    expectedGeneration: null,
    payload,
  });
  if (data.target.kind !== 'session' || !data.summary) {
    throw new Error('Forking the session returned an invalid target');
  }
  const forkTarget: SessionTarget = { kind: 'session', sessionId: data.target.sessionId };
  repositoryWorkflow = data.workflow;
  repositoryBootstrapGeneration = data.workflowGeneration;
  const sessions = [
    ...state.repositorySessions.filter(({ id }) => id !== data.summary!.id),
    data.summary,
  ];
  const loaded: LoadData = {
    target: forkTarget,
    generation: data.generation,
    payload,
    workflow: data.workflow,
    workflowGeneration: data.workflowGeneration,
  };
  applyingRepositoryState = true;
  useSessionStore.setState({
    ...applyPayload(loaded, sessions),
    repositorySessions: sessions,
    saveStatus: 'saved',
    saveError: null,
    sessionNonce: state.sessionNonce + 1,
  });
  applyingRepositoryState = false;
  await mutateWorkflow((current) => ({
    ...current,
    activeTarget: forkTarget,
    viewedTarget: forkTarget,
    lifecycle: 'live',
    suspended: false,
    activationId: uuidv4(),
    pendingAtlasBonusSeed: false,
    pendingAtlasBonusValue: null,
  }));
  queueRepositoryMetadataRefresh();
}

function freshWorkingPayload(): JsonObject {
  const state = useSessionStore.getState();
  const known = confirmedLeagueSync();
  return jsonObject({
    maps: [],
    lootItems: [],
    baselineItems: [],
    baselineTotal: 0,
    manualLootItems: [],
    manualStatistics: {},
    settings: {
      ...DEFAULT_SETTINGS,
      leagueName: known ?? '',
      atlasBonus: known ? (state.atlasBonusByLeague[known] ?? false) : false,
      regexExclusions: [...state.defaultExclusionPreset],
    },
    sessionNotes: '',
    investmentNeutralization: 0,
    investmentDismissed: false,
    strategySourceContext: null,
  });
}

export async function startWorking(replaceExisting = false): Promise<void> {
  await flushRepositoryNow();
  const workingTarget = { kind: 'working' } as const;
  if (!replaceExisting && repositoryWorkflow?.activeTarget.kind === 'working' &&
      repositoryWorkflow.viewedTarget.kind !== 'working') {
    const inspected = await repositoryClient().request({ operation: 'load', target: workingTarget, mode: 'inspect' });
    const confirmed = confirmedLeagueSync();
    const league = sessionLeague(inspected);
    const canResume = !league || (!!confirmed && league === confirmed);
    const data = await repositoryClient().request({
      operation: 'load', target: workingTarget, mode: canResume ? 'resume' : 'view',
    });
    repositoryWorkflow = data.workflow;
    repositoryBootstrapGeneration = data.workflowGeneration;
    applyingRepositoryState = true;
    useSessionStore.setState({
      ...applyPayload(data, useSessionStore.getState().repositorySessions),
      saveStatus: 'saved',
      saveError: null,
      sessionNonce: useSessionStore.getState().sessionNonce + 1,
    });
    applyingRepositoryState = false;
    return;
  }
  let expectedGeneration: number | null = null;
  try {
    const working = await repositoryClient().request({ operation: 'load', target: workingTarget, mode: 'inspect' });
    expectedGeneration = working.generation;
    const preferences = useSessionStore.getState();
    if (!isWorkingPayloadMeaningful(
      working.payload,
      DEFAULT_SETTINGS,
      preferences.defaultExclusionPreset,
    )) {
      // Phase 5 introduced the explicit fresh-empty marker. Adopt an older
      // semantically empty working slot before replacement so legacy/autopriced
      // infrastructure cannot become a spurious Unnamed recovery entry.
      const adopted = await repositoryClient().request({
        operation: 'save',
        target: workingTarget,
        expectedGeneration,
        payload: working.payload,
        freshEmptyWorking: true,
      });
      expectedGeneration = adopted.generation;
    }
  } catch (error) {
    if (!(error instanceof SessionRepositoryClientError && error.repositoryError.code === 'not-found')) throw error;
  }
  const payload = freshWorkingPayload();
  const activationId = uuidv4();
  const saved = await repositoryClient().request({
    operation: 'save', target: workingTarget, expectedGeneration, payload, replacement: true, activationId,
    freshEmptyWorking: true,
  });
  // The destination record is already durable. Reflect it before the separate
  // workflow-pointer commit so a failed pointer write can be retried without
  // leaving renderer identity aimed at the previous session.
  const interim: LoadData = {
    target: workingTarget,
    generation: saved.generation,
    payload,
    workflow: saved.workflow,
    workflowGeneration: saved.workflowGeneration,
  };
  applyingRepositoryState = true;
  useSessionStore.setState({
    ...applyPayload(interim, useSessionStore.getState().repositorySessions),
    saveStatus: 'saved',
    saveError: null,
    sessionNonce: useSessionStore.getState().sessionNonce + 1,
  });
  applyingRepositoryState = false;
  await mutateWorkflow((current) => ({
    ...current,
    activeTarget: workingTarget,
    viewedTarget: workingTarget,
    lifecycle: 'live',
    suspended: false,
    activationId,
    pendingAtlasBonusSeed: confirmedLeagueSync() === null,
    pendingAtlasBonusValue: null,
  }));
  queueRepositoryMetadataRefresh();
}

export async function deleteNamed(id: string): Promise<void> {
  await flushRepositoryNow();
  if (useSessionStore.getState().activeSessionId === id) {
    const liveTarget = repositoryWorkflow?.activeTarget;
    if (liveTarget?.kind === 'session' && liveTarget.sessionId !== id) {
      await loadNamed(liveTarget.sessionId);
    } else {
      await startWorking();
    }
  }
  const summary = useSessionStore.getState().repositorySessions.find((entry) => entry.id === id);
  if (!summary) return;
  const data = await repositoryClient().request({
    operation: 'delete', sessionId: id, expectedGeneration: summary.generation,
  });
  repositoryWorkflow = data.workflow;
  repositoryBootstrapGeneration = data.workflowGeneration;
  useSessionStore.setState({ repositorySessions: data.sessions });
  queueRepositoryMetadataRefresh();
}

export async function renameNamed(id: string, name: string): Promise<void> {
  await flushRepositoryNow();
  const summary = useSessionStore.getState().repositorySessions.find((entry) => entry.id === id);
  if (!summary) return;
  const data = await repositoryClient().request({
    operation: 'rename', sessionId: id, name, expectedGeneration: summary.generation,
  });
  useSessionStore.setState({
    repositorySessions: data.sessions,
    ...(useSessionStore.getState().activeSessionId === id
      ? { activeSessionName: name, currentGeneration: data.generation } : {}),
  });
  queueRepositoryMetadataRefresh();
}

async function importNamed(sessions: SavedSession[], conflictMode: 'skip' | 'overwrite'): Promise<void> {
  const document = JSON.stringify({ version: '1.0', exportedAt: new Date().toISOString(), sessions });
  await importRepositoryDocument(document, conflictMode);
}

function installStoreSubscription(): void {
  unsubscribeStore?.();
  unsubscribeStore = useSessionStore.subscribe((state, previous) => {
    if (applyingRepositoryState || state.repositoryStatus !== 'ready') return;
    const sessionChanged =
      state.maps !== previous.maps || state.lootItems !== previous.lootItems ||
      state.baselineItems !== previous.baselineItems || state.baselineTotal !== previous.baselineTotal ||
      state.manualLootItems !== previous.manualLootItems || state.manualStatistics !== previous.manualStatistics ||
      state.settings !== previous.settings || state.sessionNotes !== previous.sessionNotes ||
      state.investmentNeutralization !== previous.investmentNeutralization ||
      state.investmentDismissed !== previous.investmentDismissed ||
      state.loadedStrategyInfo !== previous.loadedStrategyInfo;
    if (sessionChanged) {
      const discrete = state.maps !== previous.maps || state.lootItems !== previous.lootItems ||
        state.baselineItems !== previous.baselineItems || state.baselineTotal !== previous.baselineTotal ||
        state.manualLootItems !== previous.manualLootItems || state.manualStatistics !== previous.manualStatistics;
      queueSessionSave(discrete);
    }
    const preferencesChanged =
      state.discordTag !== previous.discordTag || state.regexSets !== previous.regexSets ||
      state.leagueOverride !== previous.leagueOverride || state.atlasBonusByLeague !== previous.atlasBonusByLeague ||
      state.retrospectiveCloseouts !== previous.retrospectiveCloseouts ||
      state.regexBuilderGroups !== previous.regexBuilderGroups || state.scarabPresets !== previous.scarabPresets ||
      state.onboardingDismissed !== previous.onboardingDismissed ||
      state.defaultExclusionPreset !== previous.defaultExclusionPreset ||
      state.exclusionPresets !== previous.exclusionPresets ||
      state.divinePriceFetchedAt !== previous.divinePriceFetchedAt;
    if (preferencesChanged) queuePreferenceSave();
    const requestedLeagueSuspension = previous.sessionLifecycle === 'live' && state.sessionLifecycle === 'historical';
    if ((state.leagueOverride !== previous.leagueOverride || state.settings !== previous.settings || requestedLeagueSuspension) &&
        repositoryWorkflow &&
        shouldSuspendForConfirmedLeague(repositoryWorkflow, sessionPayload(state), confirmedLeagueSync())) {
      if (state.isWatching) useSessionStore.setState({ isWatching: false });
      void mutateWorkflow((current) => ({
        ...current,
        lifecycle: 'historical',
        suspended: true,
      })).catch(() => undefined);
    }
    if (state.pendingAtlasBonusSeed !== previous.pendingAtlasBonusSeed ||
        state.pendingAtlasBonusValue !== previous.pendingAtlasBonusValue) {
      if (repositoryWorkflow) {
        void mutateWorkflow((current) => ({
          ...current,
          pendingAtlasBonusSeed: state.pendingAtlasBonusSeed,
          pendingAtlasBonusValue: state.pendingAtlasBonusValue,
        })).catch((error) => {
          useSessionStore.setState({ saveStatus: 'failed', saveError: error instanceof Error ? error.message : String(error) });
        });
      }
    }
  });
}

async function cleanupLegacyStorage(snapshot: LegacyStorageSnapshot, data: BootstrapData): Promise<void> {
  if (!data.migrationCleanup || snapshot.store.rawValue === null) return;
  const sourceHash = await computeSemanticHash([snapshot.store, snapshot.layout, snapshot.changelog]);
  if (sourceHash !== data.migrationCleanup.sourceHash) {
    throw new Error('Legacy browser data no longer matches the verified file migration');
  }
  for (const key of data.migrationCleanup.keys) localStorage.removeItem(key);
}

async function performRepositoryBootstrap(): Promise<{ layoutRawValue: string | null }> {
  installFlushBridge();
  applyingRepositoryState = true;
  useSessionStore.setState({ repositoryStatus: 'loading', repositoryError: null, saveStatus: 'idle', saveError: null });
  applyingRepositoryState = false;
  let snapshot = legacySnapshot();
  let data: BootstrapData;
  try {
    data = await repositoryClient().request({ operation: 'bootstrap' });
  } catch (error) {
    if (!(error instanceof SessionRepositoryClientError) || error.repositoryError.code !== 'migration-required') throw error;
    if (snapshot.store.rawValue === null) snapshot = legacySnapshot(true);
    const plan = await migrationPlan(snapshot, error.repositoryError.details);
    data = await repositoryClient().request({ operation: 'bootstrap', migrationPlan: plan });
  }
  if (snapshot.store.rawValue !== null && data.migrationCleanup) {
    const plan = await migrationPlan(snapshot, data.migrationCleanup);
    data = await repositoryClient().request({ operation: 'bootstrap', migrationPlan: plan });
  }
  repositoryWorkflow = data.workflow;
  repositoryBootstrapGeneration = data.workflowGeneration;
  initialLayoutRawValue = typeof data.layout.rawValue === 'string' ? data.layout.rawValue : null;
  let loaded = await repositoryClient().request({
    operation: 'load', target: data.workflow.viewedTarget, mode: 'inspect',
  });
  setLeagueOverrideValue(typeof data.preferences.leagueOverride === 'string'
    ? data.preferences.leagueOverride : null);
  await getCurrentLeague();
  if (shouldSuspendForConfirmedLeague(data.workflow, loaded.payload, confirmedLeagueSync())) {
    const suspended = await repositoryClient().request({
      operation: 'save',
      target: { kind: 'bootstrap' },
      expectedGeneration: data.workflowGeneration,
      payload: { ...data.workflow, lifecycle: 'historical', suspended: true },
    });
    data = {
      ...data,
      workflow: suspended.workflow,
      workflowGeneration: suspended.workflowGeneration,
    };
    repositoryWorkflow = suspended.workflow;
    repositoryBootstrapGeneration = suspended.workflowGeneration;
    loaded = { ...loaded, workflow: suspended.workflow, workflowGeneration: suspended.workflowGeneration };
  }
  applyingRepositoryState = true;
  useSessionStore.setState({
    ...applyPreferences(data.preferences),
    ...applyPayload(loaded, data.sessions),
    repositoryStatus: 'ready',
    repositoryError: null,
    repositorySessions: data.sessions,
    repositorySizeBytes: data.repositorySizeBytes,
    preferencesGeneration: data.preferencesGeneration,
    layoutGeneration: data.layoutGeneration,
    saveStatus: 'saved',
    saveError: null,
    savedSessions: {},
  });
  applyingRepositoryState = false;
  await cleanupLegacyStorage(snapshot, data);
  configureSessionRepositoryActions({
    flush: flushRepositoryNow,
    nameCurrent,
    loadNamed,
    deleteNamed,
    renameNamed,
    startWorking,
    importNamed,
    checkpointBeforeDestructive,
  });
  installStoreSubscription();
  return { layoutRawValue: initialLayoutRawValue };
}

let repositoryBootstrapPromise: Promise<{ layoutRawValue: string | null }> | null = null;

export function bootstrapSessionRepository(): Promise<{ layoutRawValue: string | null }> {
  if (!repositoryBootstrapPromise) {
    repositoryBootstrapPromise = performRepositoryBootstrap().catch((error) => {
      repositoryBootstrapPromise = null;
      useSessionStore.setState({
        repositoryStatus: 'failed',
        repositoryError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }
  return repositoryBootstrapPromise;
}

function recoveryDocument(): string {
  const state = useSessionStore.getState();
  return JSON.stringify({
    format: 'WraeclastLedger pending-state recovery',
    exportedAt: new Date().toISOString(),
    target: currentTarget(state),
    generation: state.currentGeneration,
    session: sessionPayload(state),
    preferences: preferencePayload(state),
    layoutRawValue: pendingLayoutRawValue ?? initialLayoutRawValue,
  }, null, 2);
}

function installFlushBridge(): void {
  removeFlushListener?.();
  removeFlushListener = window.api.onSessionRepositoryFlushRequest((request) => {
    if (request.mode === 'export-recovery') {
      window.api.completeSessionRepositoryFlush({
        requestId: request.requestId,
        ok: true,
        recoveryDocument: recoveryDocument(),
      });
      return;
    }
    const flush = (): Promise<void> => useSessionStore.getState().saveStatus === 'failed'
      ? retryRepositorySave()
      : flushRepositoryNow();
    const pendingBootstrap = repositoryBootstrapPromise;
    void (pendingBootstrap ? pendingBootstrap.then(flush) : flush()).then(() => {
      window.api.completeSessionRepositoryFlush({ requestId: request.requestId, ok: true });
    }).catch((error) => {
      window.api.completeSessionRepositoryFlush({
        requestId: request.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        recoveryDocument: recoveryDocument(),
      });
    });
  });
}

export function repositoryLastSeenVersion(): string | null {
  return lastSeenChangelogVersion;
}

export function setRepositoryLastSeenVersion(version: string): void {
  lastSeenChangelogVersion = version;
  if (useSessionStore.getState().repositoryStatus === 'ready') queuePreferenceSave();
}

async function drainLayoutSaves(): Promise<void> {
  while (pendingLayoutRawValue !== null) {
    const rawValue = pendingLayoutRawValue;
    const waiters = layoutSaveWaiters;
    layoutSaveWaiters = [];
    pendingLayoutRawValue = null;
    try {
      const generation = useSessionStore.getState().layoutGeneration;
      if (generation === null) throw new Error('Layout is not hydrated');
      const data = await repositoryClient().request({
        operation: 'save', target: { kind: 'layout' }, expectedGeneration: generation,
        payload: { rawValue },
      });
      failedLayoutSave = false;
      useSessionStore.setState({ layoutGeneration: data.generation });
      queueRepositoryMetadataRefresh();
      waiters.forEach(({ resolve }) => resolve());
    } catch (error) {
      if (pendingLayoutRawValue === null) pendingLayoutRawValue = rawValue;
      failedLayoutSave = true;
      useSessionStore.setState({
        saveStatus: 'failed',
        saveError: error instanceof Error ? error.message : String(error),
      });
      waiters.forEach(({ reject }) => reject(error));
      throw error;
    }
  }
}

function ensureLayoutDrain(): Promise<void> {
  if (!layoutSaveDrain) {
    layoutSaveDrain = drainLayoutSaves();
    void layoutSaveDrain.then(() => {
      layoutSaveDrain = null;
      if (pendingLayoutRawValue !== null && !failedLayoutSave) void ensureLayoutDrain().catch(() => undefined);
      else settleRepositorySaved();
    }, () => {
      layoutSaveDrain = null;
    });
  }
  return layoutSaveDrain;
}

export function saveRepositoryLayout(rawValue: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pendingLayoutRawValue = rawValue;
    layoutSaveWaiters.push({ resolve, reject });
    markRepositorySaving();
    if (layoutSaveTimer) clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(() => {
      layoutSaveTimer = null;
      void ensureLayoutDrain().catch(() => undefined);
    }, SESSION_SAVE_DEBOUNCE_MS);
  });
}

export async function openRepositoryFolder(): Promise<void> {
  await repositoryClient().request({ operation: 'open-data-folder' });
}

export async function listCurrentVersionHistory(): Promise<SessionRepositoryDataMap['history-list']> {
  await flushRepositoryNow();
  const data = await repositoryClient().request({ operation: 'history-list', target: currentTarget() });
  useSessionStore.setState({ historyStoragePressure: data.historyStoragePressure });
  return data;
}

async function hydrateRestoredTarget(target: SessionTarget): Promise<void> {
  const loaded = await repositoryClient().request({ operation: 'load', target, mode: 'inspect' });
  repositoryWorkflow = loaded.workflow;
  repositoryBootstrapGeneration = loaded.workflowGeneration;
  applyingRepositoryState = true;
  useSessionStore.setState({
    ...applyPayload(loaded, useSessionStore.getState().repositorySessions),
    activationCheckpointNotice: null,
    saveStatus: 'saved',
    saveError: null,
    sessionNonce: useSessionStore.getState().sessionNonce + 1,
  });
  applyingRepositoryState = false;
  queueRepositoryMetadataRefresh();
}

export async function restoreCurrentCheckpoint(checkpointId: string): Promise<void> {
  await flushRepositoryNow();
  const state = useSessionStore.getState();
  const target = currentTarget(state);
  if (state.currentGeneration === null) throw new Error('Session generation is not hydrated');
  markRepositorySaving();
  try {
    const restored = await repositoryClient().request({
      operation: 'history-restore',
      target,
      checkpointId,
      expectedGeneration: state.currentGeneration,
    });
    pendingRestoreHydration = { target };
    // Advance the generation immediately after the durable restore ack. If the
    // follow-up read fails, Retry reloads this target instead of replaying the
    // pre-restore in-memory payload over it.
    useSessionStore.setState({ currentGeneration: restored.generation });
    await hydrateRestoredTarget(target);
    pendingRestoreHydration = null;
  } catch (error) {
    applyingRepositoryState = false;
    if (pendingRestoreHydration) {
      useSessionStore.setState({
        saveStatus: 'failed',
        saveError: 'The version was restored safely, but the refreshed session could not be loaded. Retry to reload it.',
      });
    } else {
      settleRepositorySaved();
    }
    throw error;
  }
}

export async function undoChangesSinceOpening(): Promise<void> {
  const checkpoint = useSessionStore.getState().activationCheckpointNotice;
  if (!checkpoint) return;
  await restoreCurrentCheckpoint(checkpoint.id);
}

export async function listRecentlyDeleted(): Promise<SessionRepositoryDataMap['trash-list']> {
  await flushRepositoryNow();
  return repositoryClient().request({ operation: 'trash-list' });
}

export async function restoreRecentlyDeleted(recoveryId: string): Promise<void> {
  await flushRepositoryNow();
  const data = await repositoryClient().request({ operation: 'trash-restore', recoveryId });
  useSessionStore.setState({ repositorySessions: data.sessions });
  queueRepositoryMetadataRefresh();
}

export async function permanentlyDeleteRecentlyDeleted(
  recoveryId: string,
): Promise<SessionRepositoryDataMap['trash-delete']> {
  await flushRepositoryNow();
  const data = await repositoryClient().request({ operation: 'trash-delete', recoveryId });
  queueRepositoryMetadataRefresh();
  return data;
}

export async function exportRepositorySessions(sessionIds: string[]): Promise<string> {
  await flushRepositoryNow();
  return (await repositoryClient().request({ operation: 'export', sessionIds })).document;
}

export async function importRepositoryDocument(
  document: string,
  conflictMode: 'skip' | 'overwrite',
): Promise<SessionRepositoryDataMap['import']> {
  await flushRepositoryNow();
  const currentId = useSessionStore.getState().activeSessionId;
  const data = await repositoryClient().request({ operation: 'import', document, conflictMode });
  useSessionStore.setState({ repositorySessions: data.sessions });
  if (currentId && data.importedSessionIds.includes(currentId)) await loadNamed(currentId);
  queueRepositoryMetadataRefresh();
  return data;
}

export async function loadRepositorySessionForInspection(id: string): Promise<SavedSession> {
  await flushRepositoryNow();
  const data = await repositoryClient().request({
    operation: 'load', target: { kind: 'session', sessionId: id }, mode: 'inspect',
  });
  const summary = useSessionStore.getState().repositorySessions.find((entry) => entry.id === id);
  if (!summary) throw new Error('Session summary was not found');
  const payload = data.payload;
  return {
    id,
    name: summary.name,
    createdAt: summary.createdAt,
    maps: Array.isArray(payload.maps) ? payload.maps as unknown as SavedSession['maps'] : [],
    lootItems: Array.isArray(payload.lootItems) ? payload.lootItems as unknown as SavedSession['lootItems'] : [],
    baselineItems: Array.isArray(payload.baselineItems) ? payload.baselineItems as unknown as SavedSession['baselineItems'] : [],
    baselineTotal: typeof payload.baselineTotal === 'number' ? payload.baselineTotal : 0,
    manualLootItems: Array.isArray(payload.manualLootItems) ? payload.manualLootItems as unknown as SavedSession['manualLootItems'] : [],
    manualStatistics: normalizeLocalManualStatistics(payload.manualStatistics),
    settings: { ...DEFAULT_SETTINGS, ...(payload.settings as unknown as Partial<SessionSettings>) },
    notes: typeof payload.sessionNotes === 'string' ? payload.sessionNotes : '',
    investmentNeutralization: typeof payload.investmentNeutralization === 'number' ? payload.investmentNeutralization : 0,
    investmentDismissed: payload.investmentDismissed === true,
  };
}

export function exportLegacyStorageBackup(): string {
  const snapshot = legacySnapshot();
  return JSON.stringify({
    format: 'WraeclastLedger legacy browser-storage backup',
    exportedAt: new Date().toISOString(),
    values: [snapshot.store, snapshot.layout, snapshot.changelog],
  }, null, 2);
}
