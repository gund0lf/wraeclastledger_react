import { deepStrictEqual, equal, notEqual, ok } from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { FileSessionRepository } from '../src/main/sessionRepository';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  type LegacyMigrationPlanV1,
  type LegacyStorageSnapshot,
} from '../src/shared/sessionMigration';
import type { JsonObject, JsonValue } from '../src/shared/sessionRecord';
import type { SessionTarget } from '../src/shared/sessionRepositoryIpc';
import { migrateSessionEnvelope } from '../src/renderer/src/repository/legacySessionMigration';
import {
  forkPayloadIntoLeague,
  workflowForHistoricalDuplicate,
} from '../src/renderer/src/repository/sessionRepositoryRuntime';

interface InputExport {
  sourcePath: string;
  fileName: string;
  bytes: number;
  sha256: string;
  raw: string;
  sessions: JsonObject[];
  sessionIds: string[];
  mapCount: number;
  lootRowCount: number;
  baselineRowCount: number;
  manualLootRowCount: number;
}

interface CheckResult {
  name: string;
  elapsedMs: number;
  details?: JsonObject;
}

const sourceArguments = process.argv.slice(2);
if (sourceArguments.length < 1) {
  throw new Error(
    'Usage: npm run wp14:session-export-check -- <session-export.json> [more-exports.json]',
  );
}

const screenshotLayout = JSON.stringify({
  global: {
    tabEnableClose: true,
    tabEnableFloat: false,
    tabEnableRename: false,
    borderEnableAutoHide: true,
    borderAutoSelectTabWhenClosed: false,
  },
  borders: [{
    type: 'border', location: 'left', size: 335, minSize: 300, maxSize: 440,
    selected: 0,
    children: [{
      type: 'tab', name: 'Setup', component: 'setup', enableClose: false, enableDrag: false,
    }],
  }],
  layout: {
    type: 'row', weight: 100,
    children: [
      {
        type: 'tabset', weight: 76, selected: 5,
        children: [
          { type: 'tab', name: 'Map Log', component: 'session-log' },
          { type: 'tab', name: 'Atlas Tree', component: 'atlas-tree' },
          { type: 'tab', name: 'Strategy Browser', component: 'strategy-browser' },
          { type: 'tab', name: 'Regex', component: 'regex' },
          { type: 'tab', name: 'Notes', component: 'notes' },
          { type: 'tab', name: 'Run Statistics', component: 'run-statistics' },
        ],
      },
      {
        type: 'tabset', weight: 24, selected: 0,
        children: [{ type: 'tab', name: 'Dashboard', component: 'dashboard' }],
      },
    ],
  },
});

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonClone<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} must be a non-empty string`);
  return value;
}

function arrayValue(object: JsonObject, key: string): JsonValue[] {
  const value = object[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
}

function optionalArray(object: JsonObject, key: string): JsonValue[] {
  const value = object[key];
  return Array.isArray(value) ? value : [];
}

function portableSession(session: JsonObject): JsonObject {
  const settings = session.settings;
  if (!isObject(settings)) throw new Error('settings must be an object');
  const baselineTotal = session.baselineTotal;
  const investmentNeutralization = session.investmentNeutralization;
  return {
    id: requiredString(session, 'id'),
    name: requiredString(session, 'name'),
    createdAt: requiredString(session, 'createdAt'),
    maps: jsonClone(arrayValue(session, 'maps')),
    lootItems: jsonClone(arrayValue(session, 'lootItems')),
    baselineItems: jsonClone(optionalArray(session, 'baselineItems')),
    baselineTotal: typeof baselineTotal === 'number' && Number.isFinite(baselineTotal)
      ? baselineTotal : 0,
    manualLootItems: jsonClone(optionalArray(session, 'manualLootItems')),
    manualStatistics: isObject(session.manualStatistics)
      ? jsonClone(session.manualStatistics) : {},
    settings: jsonClone(settings),
    notes: typeof session.notes === 'string' ? session.notes : '',
    investmentNeutralization:
      typeof investmentNeutralization === 'number' && Number.isFinite(investmentNeutralization)
        ? investmentNeutralization : 0,
    investmentDismissed: session.investmentDismissed === true,
    strategySourceContext: isObject(session.strategySourceContext)
      ? jsonClone(session.strategySourceContext) : null,
  };
}

function payloadFromPortable(session: JsonObject): JsonObject {
  const normalized = portableSession(session);
  return {
    maps: normalized.maps,
    lootItems: normalized.lootItems,
    baselineItems: normalized.baselineItems,
    baselineTotal: normalized.baselineTotal,
    manualLootItems: normalized.manualLootItems,
    manualStatistics: normalized.manualStatistics,
    settings: normalized.settings,
    sessionNotes: normalized.notes,
    investmentNeutralization: normalized.investmentNeutralization,
    investmentDismissed: normalized.investmentDismissed,
    strategySourceContext: normalized.strategySourceContext,
  };
}

function withBloodlinesCost(payload: JsonObject, cost: number): JsonObject {
  const cloned = jsonClone(payload);
  if (!isObject(cloned.settings) || !Array.isArray(cloned.settings.scarabs)) {
    throw new Error('Phase 5 acceptance source has no scarab configuration');
  }
  const index = cloned.settings.scarabs.findIndex((entry) => (
    isObject(entry) && entry.name === 'Horned Scarab of Bloodlines'
  ));
  if (index < 0 || !isObject(cloned.settings.scarabs[index])) {
    throw new Error('Phase 5 acceptance source has no Horned Scarab of Bloodlines');
  }
  cloned.settings.scarabs[index] = { ...cloned.settings.scarabs[index], cost };
  return cloned;
}

function bloodlinesCost(payload: JsonObject): number {
  if (!isObject(payload.settings) || !Array.isArray(payload.settings.scarabs)) {
    throw new Error('Session payload has no scarab configuration');
  }
  const scarab = payload.settings.scarabs.find((entry) => (
    isObject(entry) && entry.name === 'Horned Scarab of Bloodlines'
  ));
  if (!isObject(scarab) || typeof scarab.cost !== 'number') {
    throw new Error('Session payload has no numeric Horned Scarab of Bloodlines cost');
  }
  return scarab.cost;
}

function sortedPortableSessions(sessions: JsonObject[]): JsonObject[] {
  return sessions.map(portableSession).sort((left, right) => (
    String(left.id).localeCompare(String(right.id))
  ));
}

function parseExport(raw: string, fileName: string): JsonObject[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!isObject(parsed) || parsed.version !== '1.0' || !Array.isArray(parsed.sessions)) {
    throw new Error(`${fileName} is not a v1.0 session export`);
  }
  if (parsed.sessions.length === 0 || !parsed.sessions.every(isObject)) {
    throw new Error(`${fileName} contains no valid sessions`);
  }
  const sessions = parsed.sessions as JsonObject[];
  const ids = sessions.map((session) => requiredString(session, 'id'));
  equal(new Set(ids).size, ids.length, `${fileName} contains duplicate session ids`);
  sessions.forEach(portableSession);
  return sessions;
}

async function readInput(path: string): Promise<InputExport> {
  const absolutePath = resolve(path);
  const raw = await readFile(absolutePath, 'utf8');
  const sessions = parseExport(raw, basename(absolutePath));
  return {
    sourcePath: absolutePath,
    fileName: basename(absolutePath),
    bytes: Buffer.byteLength(raw, 'utf8'),
    sha256: createHash('sha256').update(raw).digest('hex'),
    raw,
    sessions,
    sessionIds: sessions.map((session) => requiredString(session, 'id')),
    mapCount: sessions.reduce((total, session) => total + arrayValue(session, 'maps').length, 0),
    lootRowCount: sessions.reduce((total, session) => total + arrayValue(session, 'lootItems').length, 0),
    baselineRowCount: sessions.reduce(
      (total, session) => total + optionalArray(session, 'baselineItems').length,
      0,
    ),
    manualLootRowCount: sessions.reduce(
      (total, session) => total + optionalArray(session, 'manualLootItems').length,
      0,
    ),
  };
}

async function migrationPlan(suffix: string): Promise<LegacyMigrationPlanV1> {
  const rawValue = await readFile(new URL(
    '../src/renderer/src/utils/__fixtures__/wp14/unnamed-working-envelope.json',
    import.meta.url,
  ), 'utf8');
  const snapshot: LegacyStorageSnapshot = {
    store: { key: LEGACY_STORE_STORAGE_KEY, rawValue },
    layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: screenshotLayout },
    changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: '1.0.79' },
  };
  return migrateSessionEnvelope(snapshot, {
    repositoryId: `wp14-export-acceptance:${suffix}`,
    operationId: `wp14-export-acceptance:${suffix}`,
    now: new Date('2026-08-22T20:00:00.000Z'),
  });
}

async function timed(
  checks: CheckResult[],
  name: string,
  operation: () => Promise<JsonObject | void>,
): Promise<void> {
  const startedAt = performance.now();
  const details = await operation();
  checks.push({
    name,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    ...(details ? { details } : {}),
  });
}

function sameTarget(actual: SessionTarget, expected: SessionTarget): void {
  deepStrictEqual(actual, expected);
}

const inputs = await Promise.all(sourceArguments.map(readInput));
const allSessions = inputs.flatMap(({ sessions }) => sessions);
const allSessionIds = inputs.flatMap(({ sessionIds }) => sessionIds);
equal(new Set(allSessionIds).size, allSessionIds.length, 'Input exports contain overlapping session ids');

const roots: string[] = [];
const repositories: FileSessionRepository[] = [];
const checks: CheckResult[] = [];
let phase5Recovery: JsonObject = {};
let report: JsonObject | null = null;

async function tempProfile(prefix: string): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), prefix));
  roots.push(profile);
  return profile;
}

try {
  const profile = await tempProfile('wl-wp14-export-acceptance-');
  let repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
  repositories.push(repository);
  const bootstrap = await repository.bootstrap({
    operation: 'bootstrap',
    migrationPlan: await migrationPlan('primary'),
  });
  const fixtureSessionIds = new Set(bootstrap.sessions.map(({ id }) => id));
  ok(allSessionIds.every((id) => !fixtureSessionIds.has(id)), 'Fixture and input ids overlap');

  await timed(checks, 'import every supplied export', async () => {
    for (const input of inputs) {
      const imported = await repository.importDocument({
        operation: 'import', document: input.raw, conflictMode: 'skip',
      });
      deepStrictEqual(new Set(imported.importedSessionIds), new Set(input.sessionIds));
    }
    const listed = await repository.list({ operation: 'list' });
    equal(listed.sessions.length, fixtureSessionIds.size + allSessionIds.length);
    return { importedSessions: allSessionIds.length, repositorySizeBytes: listed.repositorySizeBytes };
  });

  await timed(checks, 'skip and overwrite real conflicts', async () => {
    const first = inputs[0];
    const skipped = await repository.importDocument({
      operation: 'import', document: first.raw, conflictMode: 'skip',
    });
    deepStrictEqual(skipped.importedSessionIds, []);
    const overwritten = await repository.importDocument({
      operation: 'import', document: first.raw, conflictMode: 'overwrite',
    });
    deepStrictEqual(new Set(overwritten.importedSessionIds), new Set(first.sessionIds));
    const history = await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId: first.sessionIds[0] },
    });
    ok(history.checkpoints.some(({ reason }) => reason === 'destructive'));
    return { skipped: skipped.importedSessionIds.length, overwritten: overwritten.importedSessionIds.length };
  });

  await timed(checks, 'lazy-load and normalized payload verification', async () => {
    for (const session of allSessions) {
      const id = requiredString(session, 'id');
      const loaded = await repository.load({
        operation: 'load', target: { kind: 'session', sessionId: id }, mode: 'inspect',
      });
      deepStrictEqual(loaded.payload, payloadFromPortable(session));
    }
    return { verifiedPayloads: allSessions.length };
  });

  await timed(checks, 'portable export round-trip', async () => {
    const exported = await repository.exportDocument({ operation: 'export', sessionIds: allSessionIds });
    const roundTrip = parseExport(exported.document, 'round-trip.json');
    deepStrictEqual(sortedPortableSessions(roundTrip), sortedPortableSessions(allSessions));
    return {
      sessions: roundTrip.length,
      exportBytes: Buffer.byteLength(exported.document, 'utf8'),
    };
  });

  const firstSessionId = allSessionIds[0];
  const secondSessionId = allSessionIds[1];
  await timed(checks, 'live and viewed target lifecycle', async () => {
    const historical = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: firstSessionId }, mode: 'view',
    });
    sameTarget(historical.workflow.activeTarget, { kind: 'working' });
    sameTarget(historical.workflow.viewedTarget, { kind: 'session', sessionId: firstSessionId });
    equal(historical.workflow.lifecycle, 'historical');

    const returned = await repository.load({
      operation: 'load', target: { kind: 'working' }, mode: 'resume',
    });
    sameTarget(returned.workflow.activeTarget, { kind: 'working' });
    equal(returned.workflow.lifecycle, 'live');

    const namedLive = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: firstSessionId }, mode: 'resume',
    });
    sameTarget(namedLive.workflow.activeTarget, { kind: 'session', sessionId: firstSessionId });
    const peeked = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: secondSessionId }, mode: 'view',
    });
    sameTarget(peeked.workflow.activeTarget, { kind: 'session', sessionId: firstSessionId });
    sameTarget(peeked.workflow.viewedTarget, { kind: 'session', sessionId: secondSessionId });
    equal(peeked.workflow.lifecycle, 'historical');
    const returnedNamed = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: firstSessionId }, mode: 'resume',
    });
    sameTarget(returnedNamed.workflow.activeTarget, { kind: 'session', sessionId: firstSessionId });
  });

  await timed(checks, 'historical duplicate preserves separate live target', async () => {
    const viewed = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: secondSessionId }, mode: 'view',
    });
    const duplicate = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'WP14 isolated historical duplicate' },
      expectedGeneration: null, payload: viewed.payload,
    });
    ok(duplicate.target.kind === 'session');
    const correctedWorkflow = workflowForHistoricalDuplicate(
      viewed.workflow,
      duplicate.target,
      randomUUID(),
    );
    const workflowSave = await repository.save({
      operation: 'save', target: { kind: 'bootstrap' },
      expectedGeneration: duplicate.workflowGeneration,
      payload: correctedWorkflow,
    });
    sameTarget(workflowSave.workflow.activeTarget, { kind: 'session', sessionId: firstSessionId });
    sameTarget(workflowSave.workflow.viewedTarget, duplicate.target);
    equal(workflowSave.workflow.lifecycle, 'historical');
    await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: firstSessionId }, mode: 'resume',
    });
    const removed = await repository.delete({
      operation: 'delete', sessionId: duplicate.target.sessionId,
      expectedGeneration: duplicate.generation,
    });
    ok(!removed.sessions.some(({ id }) => id === duplicate.target.sessionId));
  });

  await timed(checks, 'cross-league fork leaves source byte-semantics intact', async () => {
    const ancestor = allSessions.find((session) => (
      isObject(session.settings) && session.settings.leagueName === 'Ancestors'
    ));
    ok(ancestor, 'At least one supplied Ancestors session is required for this check');
    const sourceId = requiredString(ancestor, 'id');
    const sourceBefore = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: sourceId }, mode: 'inspect',
    });
    const sourceSnapshot = jsonClone(sourceBefore.payload);
    const forkPayload = forkPayloadIntoLeague(sourceBefore.payload, 'Allflame', false);
    const forked = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'WP14 isolated cross-league fork' },
      expectedGeneration: null, payload: forkPayload,
    });
    ok(forked.target.kind === 'session');
    const sourceAfter = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: sourceId }, mode: 'inspect',
    });
    deepStrictEqual(sourceAfter.payload, sourceSnapshot);
    const forkLoaded = await repository.load({
      operation: 'load', target: forked.target, mode: 'inspect',
    });
    ok(isObject(forkLoaded.payload.settings));
    equal(forkLoaded.payload.settings.leagueName, 'Allflame');
    equal(forkLoaded.payload.settings.divinePrice, 0);
    equal(Object.hasOwn(forkLoaded.payload.settings, 'divinePriceQuotedAt'), false);
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    await repository.delete({
      operation: 'delete', sessionId: forked.target.sessionId,
      expectedGeneration: forked.generation,
    });
  });

  await timed(checks, 'name rename and recoverable delete', async () => {
    const source = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: firstSessionId }, mode: 'inspect',
    });
    const created = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'WP14 isolated CRUD session' },
      expectedGeneration: null, payload: source.payload,
    });
    ok(created.target.kind === 'session');
    notEqual(created.target.sessionId, firstSessionId);
    const renamed = await repository.rename({
      operation: 'rename', sessionId: created.target.sessionId,
      name: 'WP14 isolated renamed session', expectedGeneration: created.generation,
    });
    equal(renamed.name, 'WP14 isolated renamed session');
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    const trashPath = join(profile, 'ledger-data', 'sessions', 'trash');
    const beforeTrash = await readdir(trashPath);
    const deleted = await repository.delete({
      operation: 'delete', sessionId: created.target.sessionId,
      expectedGeneration: renamed.generation,
    });
    const afterTrash = await readdir(trashPath);
    equal(afterTrash.length, beforeTrash.length + 1);
    ok(!deleted.sessions.some(({ id }) => id === created.target.sessionId));
    const listedTrash = await repository.trashList({ operation: 'trash-list' });
    ok(listedTrash.entries.some(({ recoveryId }) => recoveryId === deleted.recoveryId));
    const restored = await repository.trashRestore({
      operation: 'trash-restore', recoveryId: deleted.recoveryId,
    });
    equal(restored.restoredSessionId, created.target.sessionId);
    deepStrictEqual((await repository.load({
      operation: 'load', target: created.target, mode: 'inspect',
    })).payload, source.payload);
    const restoredSummary = restored.sessions.find(({ id }) => id === restored.restoredSessionId);
    ok(restoredSummary);
    const deletedAgain = await repository.delete({
      operation: 'delete', sessionId: restored.restoredSessionId,
      expectedGeneration: restoredSummary.generation,
    });
    await repository.trashDelete({
      operation: 'trash-delete', recoveryId: deletedAgain.recoveryId,
    });
  });

  const bloodlinesSource = allSessions.find((session) => {
    try {
      bloodlinesCost(payloadFromPortable(session));
      return true;
    } catch {
      return false;
    }
  });
  ok(bloodlinesSource, 'At least one supplied session with Horned Scarab of Bloodlines is required');
  const sourceId = requiredString(bloodlinesSource, 'id');
  const source = await repository.load({
    operation: 'load', target: { kind: 'session', sessionId: sourceId }, mode: 'inspect',
  });
  const baselinePayload = withBloodlinesCost(source.payload, 100);
  const acceptance = await repository.save({
    operation: 'save', target: { kind: 'new', name: 'WP14 Phase 5 — Bloodlines 100' },
    expectedGeneration: null, payload: baselinePayload,
  });
  ok(acceptance.target.kind === 'session');
  const editedSessionId = acceptance.target.sessionId;
  let editedGeneration = 0;
  await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
  await timed(checks, 'Phase 5 activation baseline and non-destructive restore', async () => {
    const loaded = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: editedSessionId }, mode: 'view',
    });
    const beforeHistory = await repository.historyList({
      operation: 'history-list', target: loaded.target,
    });
    equal(bloodlinesCost(loaded.payload), 100);
    const saved = await repository.save({
      operation: 'save', target: loaded.target,
      expectedGeneration: loaded.generation,
      activationId: loaded.workflow.activationId,
      payload: withBloodlinesCost(loaded.payload, 1111),
    });
    ok(saved.checkpoint?.isActivationBaseline);
    const changedAgain = await repository.save({
      operation: 'save', target: loaded.target,
      expectedGeneration: saved.generation,
      activationId: loaded.workflow.activationId,
      payload: withBloodlinesCost(loaded.payload, 1222),
    });
    equal(changedAgain.checkpoint, null);
    const afterEdits = await repository.historyList({
      operation: 'history-list', target: loaded.target,
    });
    equal(afterEdits.checkpoints.length, beforeHistory.checkpoints.length + 1);
    const baseline = afterEdits.checkpoints.find(({ id }) => id === saved.checkpoint?.id);
    ok(baseline);
    equal(baseline.changeCount, 1);
    deepStrictEqual(baseline.changes, [{
      label: 'Horned Scarab of Bloodlines price', before: '100c', after: '1111c',
    }]);
    const restored = await repository.historyRestore({
      operation: 'history-restore', target: loaded.target,
      checkpointId: baseline.id, expectedGeneration: changedAgain.generation,
    });
    const restoredPayload = (await repository.load({
      operation: 'load', target: loaded.target, mode: 'inspect',
    })).payload;
    equal(bloodlinesCost(restoredPayload), 100);
    const afterRestore = await repository.historyList({
      operation: 'history-list', target: loaded.target,
    });
    const preRestore = afterRestore.checkpoints.find(({ reason }) => reason === 'pre-restore');
    ok(preRestore);
    deepStrictEqual(preRestore.changes, [{
      label: 'Horned Scarab of Bloodlines price', before: '1222c', after: '100c',
    }]);
    const undoRestore = await repository.historyRestore({
      operation: 'history-restore', target: loaded.target,
      checkpointId: preRestore.id, expectedGeneration: restored.generation,
    });
    const editedPayload = (await repository.load({
      operation: 'load', target: loaded.target, mode: 'inspect',
    })).payload;
    equal(bloodlinesCost(editedPayload), 1222);
    editedGeneration = undoRestore.generation;
    phase5Recovery = {
      status: 'passed',
      startingCost: 100,
      firstEditCost: 1111,
      laterEditCost: 1222,
      restoredCost: 100,
      recoveredEditedCost: 1222,
      checkpointsBeforeEdit: beforeHistory.checkpoints.length,
      checkpointsAfterFirstActivation: afterEdits.checkpoints.length,
    };
    return {
      generationBefore: loaded.generation,
      generationAfterUndoRestore: undoRestore.generation,
    };
  });

  const preferencesPayload: JsonObject = {
    ...bootstrap.preferences,
    wp14AcceptanceMarker: 'isolated-session-export-check',
  };
  const preferences = await repository.save({
    operation: 'save', target: { kind: 'preferences' },
    expectedGeneration: bootstrap.preferencesGeneration, payload: preferencesPayload,
  });
  const layout = await repository.save({
    operation: 'save', target: { kind: 'layout' },
    expectedGeneration: bootstrap.layoutGeneration, payload: { rawValue: screenshotLayout },
  });
  equal(preferences.generation, bootstrap.preferencesGeneration + 1);
  equal(layout.generation, bootstrap.layoutGeneration + 1);

  await repository.releaseLock();
  repositories.splice(repositories.indexOf(repository), 1);
  repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
  repositories.push(repository);

  await timed(checks, 'restart preserves sessions edit preferences layout and workflow', async () => {
    const restarted = await repository.bootstrap({ operation: 'bootstrap' });
    equal(restarted.sessions.length, fixtureSessionIds.size + allSessionIds.length + 1);
    deepStrictEqual(restarted.preferences, preferencesPayload);
    equal(restarted.layout.rawValue, screenshotLayout);
    const loaded = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: editedSessionId }, mode: 'inspect',
    });
    equal(loaded.generation, editedGeneration);
    equal(bloodlinesCost(loaded.payload), 1222);
    return { namedSessions: restarted.sessions.length, repositorySizeBytes: restarted.repositorySizeBytes };
  });

  await timed(checks, 'meaningful working replacement enters recovery trash', async () => {
    const working = await repository.load({
      operation: 'load', target: { kind: 'working' }, mode: 'inspect',
    });
    const meaningful = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: working.generation,
      payload: { maps: [{ id: 'isolated-working-map' }], sessionNotes: 'recover me' },
    });
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    const trashPath = join(profile, 'ledger-data', 'sessions', 'trash');
    const beforeTrash = await readdir(trashPath);
    const replacement = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: meaningful.generation,
      payload: { maps: [], sessionNotes: '' }, replacement: true,
      activationId: 'activation:fresh-working', freshEmptyWorking: true,
    });
    equal(replacement.generation, 1);
    const afterTrash = await readdir(trashPath);
    equal(afterTrash.length, beforeTrash.length + 1);
    const addedRecoveryId = afterTrash.find((entry) => !beforeTrash.includes(entry));
    ok(addedRecoveryId);
    const restored = await repository.trashRestore({
      operation: 'trash-restore', recoveryId: addedRecoveryId,
    });
    const restoredPayload = (await repository.load({
      operation: 'load',
      target: { kind: 'session', sessionId: restored.restoredSessionId },
      mode: 'inspect',
    })).payload;
    deepStrictEqual(restoredPayload, { maps: [{ id: 'isolated-working-map' }], sessionNotes: 'recover me' });

    const freshWorking = await repository.load({
      operation: 'load', target: { kind: 'working' }, mode: 'inspect',
    });
    const beforeFreshReplacement = await repository.trashList({ operation: 'trash-list' });
    const autoManagedFreshWorking = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: freshWorking.generation,
      payload: {
        maps: [],
        sessionNotes: '',
        settings: {
          leagueName: 'Mirage',
          divinePrice: 208,
          divinePriceQuotedAt: '2026-08-23T12:00:00.000Z',
        },
      },
      activationId: 'activation:fresh-working', freshEmptyWorking: true,
    });
    const freshReplacement = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: autoManagedFreshWorking.generation,
      payload: { maps: [], sessionNotes: '', settings: { leagueName: 'Mirage', divinePrice: 201 } },
      replacement: true, activationId: 'activation:fresh-working-2', freshEmptyWorking: true,
    });
    equal(freshReplacement.generation, autoManagedFreshWorking.generation + 1);
    const afterFreshReplacement = await repository.trashList({ operation: 'trash-list' });
    deepStrictEqual(afterFreshReplacement.entries, beforeFreshReplacement.entries);

    const legacyUnmarkedPayload = {
      maps: [],
      sessionNotes: '',
      settings: {
        leagueName: 'Allflame',
        divinePrice: 208,
        divinePriceQuotedAt: '2026-08-23T13:16:00.000Z',
      },
    };
    const legacyUnmarked = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: freshReplacement.generation,
      payload: legacyUnmarkedPayload, activationId: 'activation:legacy-unmarked-empty',
    });
    const adoptedLegacyEmpty = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: legacyUnmarked.generation,
      payload: legacyUnmarkedPayload, freshEmptyWorking: true,
    });
    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: adoptedLegacyEmpty.generation,
      payload: { maps: [], sessionNotes: '', settings: { leagueName: 'Allflame', divinePrice: 0 } },
      replacement: true, activationId: 'activation:legacy-empty-replacement', freshEmptyWorking: true,
    });
    deepStrictEqual(
      (await repository.trashList({ operation: 'trash-list' })).entries,
      beforeFreshReplacement.entries,
    );
  });

  await timed(checks, 'real-data batch import rollback is all-or-nothing', async () => {
    const rollbackProfile = await tempProfile('wl-wp14-export-rollback-');
    let injectFailure = true;
    const rollbackRepository = new FileSessionRepository({
      userDataPath: rollbackProfile,
      openPath: async () => '',
      onImportBoundary: (boundary, index) => {
        if (injectFailure && boundary === 'after-commit' && index === 0) {
          throw new Error('injected real-export rollback check');
        }
      },
    });
    repositories.push(rollbackRepository);
    const rollbackBootstrap = await rollbackRepository.bootstrap({
      operation: 'bootstrap', migrationPlan: await migrationPlan('rollback'),
    });
    const initialIds = new Set(rollbackBootstrap.sessions.map(({ id }) => id));
    let failed = false;
    try {
      await rollbackRepository.importDocument({
        operation: 'import', document: inputs.at(-1)!.raw, conflictMode: 'skip',
      });
    } catch (error) {
      failed = error instanceof Error && error.message === 'injected real-export rollback check';
    }
    equal(failed, true);
    const afterFailure = await rollbackRepository.list({ operation: 'list' });
    deepStrictEqual(new Set(afterFailure.sessions.map(({ id }) => id)), initialIds);
    injectFailure = false;
    const retried = await rollbackRepository.importDocument({
      operation: 'import', document: inputs.at(-1)!.raw, conflictMode: 'skip',
    });
    equal(retried.importedSessionIds.length, inputs.at(-1)!.sessions.length);
    return { rolledBackEntries: inputs.at(-1)!.sessions.length };
  });

  await timed(checks, 'source exports remain byte-identical', async () => {
    for (const input of inputs) {
      const current = await readFile(input.sourcePath, 'utf8');
      equal(Buffer.byteLength(current, 'utf8'), input.bytes);
      equal(createHash('sha256').update(current).digest('hex'), input.sha256);
    }
    return { verifiedFiles: inputs.length };
  });

  report = {
    schemaVersion: 1,
    inputs: inputs.map((input) => ({
      fileName: input.fileName,
      bytes: input.bytes,
      sha256: input.sha256,
      sessions: input.sessions.length,
      maps: input.mapCount,
      lootRows: input.lootRowCount,
      baselineRows: input.baselineRowCount,
      manualLootRows: input.manualLootRowCount,
    })),
    suppliedSessions: allSessionIds.length,
    checks,
    phase5Recovery,
    layoutReference: {
      source: 'user screenshot',
      persistence: 'verified as exact repository raw JSON',
      visualMatch: 'manual or future Electron UI automation required',
    },
    sourceFilesModified: false,
    temporaryRepositoriesRemoved: true,
  } as unknown as JsonObject;
} finally {
  await Promise.all(repositories.map((repository) => repository.releaseLock().catch(() => undefined)));
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}

ok(report);
console.log(JSON.stringify(report, null, 2));
