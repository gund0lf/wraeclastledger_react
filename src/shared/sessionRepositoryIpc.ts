import { assertJsonValue, type JsonObject } from './sessionRecord';
import type { LegacyMigrationPlanV1 } from './sessionMigration';

export const SESSION_REPOSITORY_CHANNEL = 'session-repository:request';
export const SESSION_REPOSITORY_MAX_IMPORT_BYTES = 32 * 1024 * 1024;

export const SESSION_REPOSITORY_OPERATIONS = [
  'bootstrap',
  'list',
  'load',
  'save',
  'rename',
  'delete',
  'history-list',
  'history-restore',
  'import',
  'export',
  'retry',
  'open-data-folder',
] as const;

export type SessionRepositoryOperation = (typeof SESSION_REPOSITORY_OPERATIONS)[number];

export type SessionTarget =
  | { kind: 'working' }
  | { kind: 'session'; sessionId: string };

export type SessionSaveTarget =
  | SessionTarget
  | { kind: 'new'; name: string }
  | { kind: 'preferences' }
  | { kind: 'layout' }
  | { kind: 'bootstrap' };

export type SessionEntitySaveTarget = Exclude<
  SessionSaveTarget,
  { kind: 'preferences' | 'layout' | 'bootstrap' }
>;

export type SessionLoadMode = 'inspect' | 'view' | 'resume';
export type SessionLifecycle = 'live' | 'historical';

export interface RepositoryWorkflow extends JsonObject {
  activeTarget: SessionTarget;
  viewedTarget: SessionTarget;
  lifecycle: SessionLifecycle;
  suspended: boolean;
  activationId: string;
  pendingAtlasBonusSeed: boolean;
  pendingAtlasBonusValue: boolean | null;
}

export interface RepositoryMigrationCleanup extends JsonObject {
  sourceHash: string;
  keys: string[];
  repositoryId: string;
  operationId: string;
  createdAt: string;
  sourceStoreVersion: number;
}

export interface RepositorySessionSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  generation: number;
  summary: JsonObject;
  status: 'ready' | 'damaged' | 'unsupported';
}

export interface RepositoryCheckpointSummary {
  id: string;
  createdAt: string;
  reason: 'activation' | 'destructive' | 'pre-restore' | 'periodic';
  summary: JsonObject;
}

export type SessionRepositoryRequest =
  | { operation: 'bootstrap'; migrationPlan?: LegacyMigrationPlanV1 }
  | { operation: 'list' }
  | { operation: 'load'; target: SessionTarget; mode: SessionLoadMode }
  | {
      operation: 'save';
      target: SessionSaveTarget;
      expectedGeneration: number | null;
      payload: JsonObject;
      replacement?: true;
    }
  | { operation: 'rename'; sessionId: string; name: string; expectedGeneration: number }
  | { operation: 'delete'; sessionId: string; expectedGeneration: number }
  | { operation: 'history-list'; target: SessionTarget }
  | { operation: 'history-restore'; target: SessionTarget; checkpointId: string; expectedGeneration: number }
  | { operation: 'import'; document: string; conflictMode: 'skip' | 'overwrite' }
  | { operation: 'export'; sessionIds: string[] }
  | { operation: 'retry'; operationId: string }
  | { operation: 'open-data-folder' };

export interface SessionRepositoryDataMap {
  bootstrap: {
    sessions: RepositorySessionSummary[];
    workflow: RepositoryWorkflow;
    workflowGeneration: number;
    preferences: JsonObject;
    preferencesGeneration: number;
    layout: JsonObject;
    layoutGeneration: number;
    repositorySizeBytes: number;
    migrationCleanup: RepositoryMigrationCleanup | null;
  };
  list: { sessions: RepositorySessionSummary[]; repositorySizeBytes: number };
  load: {
    target: SessionTarget;
    generation: number;
    payload: JsonObject;
    workflow: RepositoryWorkflow;
    workflowGeneration: number;
  };
  save: {
    target: SessionTarget | { kind: 'preferences' | 'layout' | 'bootstrap' };
    generation: number;
    summary: RepositorySessionSummary | null;
    workflow: RepositoryWorkflow;
    workflowGeneration: number;
  };
  rename: { sessionId: string; generation: number; name: string; sessions: RepositorySessionSummary[] };
  delete: {
    sessionId: string;
    recoveryId: string;
    sessions: RepositorySessionSummary[];
    workflow: RepositoryWorkflow;
    workflowGeneration: number;
  };
  'history-list': { target: SessionTarget; checkpoints: RepositoryCheckpointSummary[] };
  'history-restore': { target: SessionTarget; generation: number; checkpointId: string };
  import: { importedSessionIds: string[]; sessions: RepositorySessionSummary[] };
  export: { document: string };
  retry: { operationId: string; status: 'pending' | 'completed' };
  'open-data-folder': { opened: true };
}

export type SessionRepositoryErrorCode =
  | 'migration-required'
  | 'repository-locked'
  | 'generation-conflict'
  | 'recovery-required'
  | 'unsupported-version'
  | 'size-limit'
  | 'validation'
  | 'invalid-request'
  | 'not-found'
  | 'io-failure'
  | 'unknown';

export interface SessionRepositoryError {
  code: SessionRepositoryErrorCode;
  message: string;
  retryable: boolean;
  details?: JsonObject;
}

export type SessionRepositorySuccess<Operation extends SessionRepositoryOperation = SessionRepositoryOperation> = {
  [Key in Operation]: {
    ok: true;
    operation: Key;
    data: SessionRepositoryDataMap[Key];
  }
}[Operation];

export interface SessionRepositoryFailure {
  ok: false;
  operation: SessionRepositoryOperation | null;
  error: SessionRepositoryError;
}

export type SessionRepositoryResponse = SessionRepositorySuccess | SessionRepositoryFailure;

export class SessionRepositoryRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionRepositoryRequestError';
  }
}

const operationSet = new Set<string>(SESSION_REPOSITORY_OPERATIONS);
const errorCodeSet = new Set<SessionRepositoryErrorCode>([
  'migration-required', 'repository-locked',
  'generation-conflict', 'recovery-required', 'unsupported-version', 'size-limit',
  'validation', 'invalid-request', 'not-found', 'io-failure', 'unknown',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new SessionRepositoryRequestError(`${label} has unexpected or missing fields`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SessionRepositoryRequestError(`${label} must be a non-empty string`);
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new SessionRepositoryRequestError(`${label} must be a UTC ISO timestamp`);
  }
}

function assertGeneration(value: unknown, nullable: boolean): asserts value is number | null {
  if (nullable && value === null) return;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new SessionRepositoryRequestError('expectedGeneration must be a non-negative integer');
  }
}

function assertNoPathKeys(value: unknown, label = 'request'): void {
  // This is a diagnostic tripwire, not the security boundary. Exact-key
  // request shapes and an ID-only port keep renderer-supplied paths out even
  // when a path-like key is not covered by this deliberately small denylist.
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPathKeys(item, `${label}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:path|directory|filePath|folderPath)$/i.test(key)) {
      throw new SessionRepositoryRequestError(`${label} must not supply filesystem paths`);
    }
    assertNoPathKeys(child, `${label}.${key}`);
  }
}

function assertTarget(value: unknown): asserts value is SessionTarget {
  if (!isPlainObject(value)) throw new SessionRepositoryRequestError('target must be an object');
  if (value.kind === 'working') {
    assertExactKeys(value, ['kind'], 'working target');
    return;
  }
  if (value.kind === 'session') {
    assertExactKeys(value, ['kind', 'sessionId'], 'session target');
    assertString(value.sessionId, 'sessionId');
    return;
  }
  throw new SessionRepositoryRequestError('target kind is invalid');
}

function assertSaveTarget(value: unknown): asserts value is SessionSaveTarget {
  if (isPlainObject(value)) {
    if (value.kind === 'new') {
      assertExactKeys(value, ['kind', 'name'], 'new session target');
      assertString(value.name, 'session name');
      return;
    }
    if (value.kind === 'preferences' || value.kind === 'layout' || value.kind === 'bootstrap') {
      assertExactKeys(value, ['kind'], `${value.kind} target`);
      return;
    }
  }
  assertTarget(value);
}

function assertResponseTarget(
  value: unknown,
): asserts value is SessionTarget | { kind: 'preferences' | 'layout' | 'bootstrap' } {
  if (isPlainObject(value) &&
      (value.kind === 'preferences' || value.kind === 'layout' || value.kind === 'bootstrap')) {
    assertExactKeys(value, ['kind'], `${value.kind} target`);
    return;
  }
  assertTarget(value);
}

function assertInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new SessionRepositoryRequestError(`${label} must be a non-negative integer`);
  }
}

function assertSummary(value: unknown): asserts value is RepositorySessionSummary {
  if (!isPlainObject(value)) throw new SessionRepositoryRequestError('session summary must be an object');
  assertExactKeys(value, ['id', 'name', 'createdAt', 'updatedAt', 'generation', 'summary', 'status'], 'session summary');
  assertString(value.id, 'summary id');
  assertString(value.name, 'summary name');
  assertTimestamp(value.createdAt, 'summary createdAt');
  assertTimestamp(value.updatedAt, 'summary updatedAt');
  assertInteger(value.generation, 'summary generation');
  if (!isPlainObject(value.summary)) throw new SessionRepositoryRequestError('summary payload must be an object');
  if (value.status !== 'ready' && value.status !== 'damaged' && value.status !== 'unsupported') {
    throw new SessionRepositoryRequestError('summary status is invalid');
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new SessionRepositoryRequestError(`${label} must be an array`);
  value.forEach((item) => assertString(item, `${label} item`));
}

function assertWorkflow(value: unknown): asserts value is RepositoryWorkflow {
  if (!isPlainObject(value)) throw new SessionRepositoryRequestError('workflow must be an object');
  assertExactKeys(value, [
    'activeTarget', 'viewedTarget', 'lifecycle', 'suspended', 'activationId',
    'pendingAtlasBonusSeed', 'pendingAtlasBonusValue',
  ], 'workflow');
  assertTarget(value.activeTarget);
  assertTarget(value.viewedTarget);
  if (value.lifecycle !== 'live' && value.lifecycle !== 'historical') {
    throw new SessionRepositoryRequestError('workflow lifecycle is invalid');
  }
  if (typeof value.suspended !== 'boolean' || typeof value.pendingAtlasBonusSeed !== 'boolean') {
    throw new SessionRepositoryRequestError('workflow booleans are invalid');
  }
  assertString(value.activationId, 'activationId');
  if (value.pendingAtlasBonusValue !== null && typeof value.pendingAtlasBonusValue !== 'boolean') {
    throw new SessionRepositoryRequestError('pendingAtlasBonusValue must be boolean or null');
  }
}

function assertSummaries(value: unknown): asserts value is RepositorySessionSummary[] {
  if (!Array.isArray(value)) throw new SessionRepositoryRequestError('sessions must be an array');
  value.forEach(assertSummary);
}

function assertSuccessData(operation: SessionRepositoryOperation, value: unknown): void {
  if (!isPlainObject(value)) throw new SessionRepositoryRequestError('response data must be an object');
  if (operation === 'bootstrap') {
    assertExactKeys(value, [
      'sessions', 'workflow', 'workflowGeneration', 'preferences', 'preferencesGeneration', 'layout',
      'layoutGeneration', 'repositorySizeBytes', 'migrationCleanup',
    ], 'bootstrap data');
    assertSummaries(value.sessions);
    assertWorkflow(value.workflow);
    assertInteger(value.workflowGeneration, 'workflowGeneration');
    if (!isPlainObject(value.preferences) || !isPlainObject(value.layout)) {
      throw new SessionRepositoryRequestError('bootstrap preferences and layout must be objects');
    }
    assertInteger(value.preferencesGeneration, 'preferencesGeneration');
    assertInteger(value.layoutGeneration, 'layoutGeneration');
    assertInteger(value.repositorySizeBytes, 'repositorySizeBytes');
    if (value.migrationCleanup !== null) {
      if (!isPlainObject(value.migrationCleanup)) {
        throw new SessionRepositoryRequestError('migrationCleanup must be an object or null');
      }
      assertExactKeys(value.migrationCleanup, [
        'sourceHash', 'keys', 'repositoryId', 'operationId', 'createdAt', 'sourceStoreVersion',
      ], 'migrationCleanup');
      assertString(value.migrationCleanup.sourceHash, 'migrationCleanup sourceHash');
      assertStringArray(value.migrationCleanup.keys, 'migrationCleanup keys');
      assertString(value.migrationCleanup.repositoryId, 'migrationCleanup repositoryId');
      assertString(value.migrationCleanup.operationId, 'migrationCleanup operationId');
      assertTimestamp(value.migrationCleanup.createdAt, 'migrationCleanup createdAt');
      assertInteger(value.migrationCleanup.sourceStoreVersion, 'migrationCleanup sourceStoreVersion');
    }
  } else if (operation === 'list') {
    assertExactKeys(value, ['sessions', 'repositorySizeBytes'], 'list data');
    assertSummaries(value.sessions);
    assertInteger(value.repositorySizeBytes, 'repositorySizeBytes');
  } else if (operation === 'load') {
    assertExactKeys(value, ['target', 'generation', 'payload', 'workflow', 'workflowGeneration'], 'load data');
    assertTarget(value.target);
    assertInteger(value.generation, 'generation');
    if (!isPlainObject(value.payload)) throw new SessionRepositoryRequestError('payload must be an object');
    assertWorkflow(value.workflow);
    assertInteger(value.workflowGeneration, 'workflowGeneration');
  } else if (operation === 'save') {
    assertExactKeys(value, ['target', 'generation', 'summary', 'workflow', 'workflowGeneration'], 'save data');
    assertResponseTarget(value.target);
    assertInteger(value.generation, 'generation');
    if (value.summary !== null) assertSummary(value.summary);
    assertWorkflow(value.workflow);
    assertInteger(value.workflowGeneration, 'workflowGeneration');
  } else if (operation === 'rename') {
    assertExactKeys(value, ['sessionId', 'generation', 'name', 'sessions'], 'rename data');
    assertString(value.sessionId, 'sessionId');
    assertInteger(value.generation, 'generation');
    assertString(value.name, 'name');
    assertSummaries(value.sessions);
  } else if (operation === 'delete') {
    assertExactKeys(value, ['sessionId', 'recoveryId', 'sessions', 'workflow', 'workflowGeneration'], 'delete data');
    assertString(value.sessionId, 'sessionId');
    assertString(value.recoveryId, 'recoveryId');
    assertSummaries(value.sessions);
    assertWorkflow(value.workflow);
    assertInteger(value.workflowGeneration, 'workflowGeneration');
  } else if (operation === 'history-list') {
    assertExactKeys(value, ['target', 'checkpoints'], 'history-list data');
    assertTarget(value.target);
    if (!Array.isArray(value.checkpoints)) throw new SessionRepositoryRequestError('checkpoints must be an array');
    value.checkpoints.forEach((checkpoint) => {
      if (!isPlainObject(checkpoint)) throw new SessionRepositoryRequestError('checkpoint must be an object');
      assertExactKeys(checkpoint, ['id', 'createdAt', 'reason', 'summary'], 'checkpoint');
      assertString(checkpoint.id, 'checkpoint id');
      assertTimestamp(checkpoint.createdAt, 'checkpoint createdAt');
      if (!['activation', 'destructive', 'pre-restore', 'periodic'].includes(String(checkpoint.reason))) {
        throw new SessionRepositoryRequestError('checkpoint reason is invalid');
      }
      if (!isPlainObject(checkpoint.summary)) throw new SessionRepositoryRequestError('checkpoint summary must be an object');
    });
  } else if (operation === 'history-restore') {
    assertExactKeys(value, ['target', 'generation', 'checkpointId'], 'history-restore data');
    assertTarget(value.target);
    assertInteger(value.generation, 'generation');
    assertString(value.checkpointId, 'checkpointId');
  } else if (operation === 'import') {
    assertExactKeys(value, ['importedSessionIds', 'sessions'], 'import data');
    assertStringArray(value.importedSessionIds, 'importedSessionIds');
    assertSummaries(value.sessions);
  } else if (operation === 'export') {
    assertExactKeys(value, ['document'], 'export data');
    assertString(value.document, 'document');
  } else if (operation === 'retry') {
    assertExactKeys(value, ['operationId', 'status'], 'retry data');
    assertString(value.operationId, 'operationId');
    if (value.status !== 'pending' && value.status !== 'completed') {
      throw new SessionRepositoryRequestError('retry status is invalid');
    }
  } else {
    assertExactKeys(value, ['opened'], 'open-data-folder data');
    if (value.opened !== true) throw new SessionRepositoryRequestError('opened must be true');
  }
}

export function parseSessionRepositoryRequest(value: unknown): SessionRepositoryRequest {
  if (!isPlainObject(value)) throw new SessionRepositoryRequestError('request must be an object');
  assertNoPathKeys(value);
  if (typeof value.operation !== 'string' || !operationSet.has(value.operation)) {
    throw new SessionRepositoryRequestError('operation is invalid');
  }
  const operation = value.operation as SessionRepositoryOperation;
  if (operation === 'bootstrap') {
    const keys = value.migrationPlan === undefined ? ['operation'] : ['operation', 'migrationPlan'];
    assertExactKeys(value, keys, 'bootstrap request');
    if (value.migrationPlan !== undefined) {
      assertJsonValue(value.migrationPlan, '$.migrationPlan');
      if (!isPlainObject(value.migrationPlan)) {
        throw new SessionRepositoryRequestError('migrationPlan must be an object');
      }
    }
  } else if (operation === 'list' || operation === 'open-data-folder') {
    assertExactKeys(value, ['operation'], `${operation} request`);
  } else if (operation === 'load') {
    assertExactKeys(value, ['operation', 'target', 'mode'], 'load request');
    assertTarget(value.target);
    if (value.mode !== 'inspect' && value.mode !== 'view' && value.mode !== 'resume') {
      throw new SessionRepositoryRequestError('load mode is invalid');
    }
  } else if (operation === 'history-list') {
    assertExactKeys(value, ['operation', 'target'], `${operation} request`);
    assertTarget(value.target);
  } else if (operation === 'save') {
    const keys = value.replacement === undefined
      ? ['operation', 'target', 'expectedGeneration', 'payload']
      : ['operation', 'target', 'expectedGeneration', 'payload', 'replacement'];
    assertExactKeys(value, keys, 'save request');
    assertSaveTarget(value.target);
    assertGeneration(value.expectedGeneration, true);
    if (value.target.kind === 'new' && value.expectedGeneration !== null) {
      throw new SessionRepositoryRequestError('new session saves require a null expectedGeneration');
    }
    assertJsonValue(value.payload, '$.payload');
    if (!isPlainObject(value.payload)) throw new SessionRepositoryRequestError('payload must be an object');
    if (value.replacement !== undefined && (value.replacement !== true || value.target.kind !== 'working')) {
      throw new SessionRepositoryRequestError('replacement is valid only for a working-session save');
    }
  } else if (operation === 'rename') {
    assertExactKeys(value, ['operation', 'sessionId', 'name', 'expectedGeneration'], 'rename request');
    assertString(value.sessionId, 'sessionId');
    assertString(value.name, 'name');
    assertGeneration(value.expectedGeneration, false);
  } else if (operation === 'delete') {
    assertExactKeys(value, ['operation', 'sessionId', 'expectedGeneration'], 'delete request');
    assertString(value.sessionId, 'sessionId');
    assertGeneration(value.expectedGeneration, false);
  } else if (operation === 'history-restore') {
    assertExactKeys(value, ['operation', 'target', 'checkpointId', 'expectedGeneration'], 'history-restore request');
    assertTarget(value.target);
    assertString(value.checkpointId, 'checkpointId');
    assertGeneration(value.expectedGeneration, false);
  } else if (operation === 'import') {
    assertExactKeys(value, ['operation', 'document', 'conflictMode'], 'import request');
    assertString(value.document, 'document');
    if (value.conflictMode !== 'skip' && value.conflictMode !== 'overwrite') {
      throw new SessionRepositoryRequestError('import conflictMode is invalid');
    }
  } else if (operation === 'export') {
    assertExactKeys(value, ['operation', 'sessionIds'], 'export request');
    if (!Array.isArray(value.sessionIds)) throw new SessionRepositoryRequestError('sessionIds must be an array');
    value.sessionIds.forEach((sessionId) => assertString(sessionId, 'sessionId'));
  } else {
    assertExactKeys(value, ['operation', 'operationId'], 'retry request');
    assertString(value.operationId, 'operationId');
  }
  return value as SessionRepositoryRequest;
}

export function assertSessionRepositoryResponse(value: unknown): asserts value is SessionRepositoryResponse {
  if (!isPlainObject(value) || typeof value.ok !== 'boolean') {
    throw new SessionRepositoryRequestError('response must be a result object');
  }
  // Retain deep validation on both sides of the boundary. A 2026-07-22
  // Windows measurement over the 10 MiB Phase 0 fixture recorded P95 17.477ms
  // and max 18.904ms, below the locked 50ms renderer long-task budget.
  assertJsonValue(value, '$.response');
  if (value.ok) {
    if (typeof value.operation !== 'string' || !operationSet.has(value.operation)) {
      throw new SessionRepositoryRequestError('response operation is invalid');
    }
    assertExactKeys(value, ['ok', 'operation', 'data'], 'success response');
    assertSuccessData(value.operation as SessionRepositoryOperation, value.data);
  } else {
    assertExactKeys(value, ['ok', 'operation', 'error'], 'failure response');
    if (value.operation !== null && (typeof value.operation !== 'string' || !operationSet.has(value.operation))) {
      throw new SessionRepositoryRequestError('failure operation is invalid');
    }
    if (!isPlainObject(value.error)) throw new SessionRepositoryRequestError('response error must be an object');
    const allowedKeys = value.error.details === undefined
      ? ['code', 'message', 'retryable']
      : ['code', 'message', 'retryable', 'details'];
    assertExactKeys(value.error, allowedKeys, 'response error');
    if (typeof value.error.code !== 'string' || !errorCodeSet.has(value.error.code as SessionRepositoryErrorCode)) {
      throw new SessionRepositoryRequestError('response error code is invalid');
    }
    assertString(value.error.message, 'response error message');
    if (typeof value.error.retryable !== 'boolean') throw new SessionRepositoryRequestError('retryable must be boolean');
    if (value.error.details !== undefined && !isPlainObject(value.error.details)) {
      throw new SessionRepositoryRequestError('response error details must be an object');
    }
  }
}
