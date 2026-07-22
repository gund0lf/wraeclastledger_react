import { assertJsonValue, type JsonObject } from './sessionRecord';

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

export interface RepositorySessionSummary {
  id: string;
  name: string;
  updatedAt: string;
  generation: number;
  summary: JsonObject;
}

export interface RepositoryCheckpointSummary {
  id: string;
  createdAt: string;
  reason: 'activation' | 'destructive' | 'pre-restore' | 'periodic';
  summary: JsonObject;
}

export type SessionRepositoryRequest =
  | { operation: 'bootstrap' }
  | { operation: 'list' }
  | { operation: 'load'; target: SessionTarget }
  | { operation: 'save'; target: SessionTarget; expectedGeneration: number | null; payload: JsonObject }
  | { operation: 'rename'; sessionId: string; name: string; expectedGeneration: number }
  | { operation: 'delete'; sessionId: string; expectedGeneration: number }
  | { operation: 'history-list'; target: SessionTarget }
  | { operation: 'history-restore'; target: SessionTarget; checkpointId: string; expectedGeneration: number }
  | { operation: 'import'; document: string }
  | { operation: 'export'; sessionIds: string[] }
  | { operation: 'retry'; operationId: string }
  | { operation: 'open-data-folder' };

export interface SessionRepositoryDataMap {
  bootstrap: {
    sessions: RepositorySessionSummary[];
    activeTarget: SessionTarget;
    viewedTarget: SessionTarget;
  };
  list: { sessions: RepositorySessionSummary[] };
  load: { target: SessionTarget; generation: number; payload: JsonObject };
  save: { target: SessionTarget; generation: number; summary: RepositorySessionSummary | null };
  rename: { sessionId: string; generation: number; name: string };
  delete: { sessionId: string; recoveryId: string };
  'history-list': { target: SessionTarget; checkpoints: RepositoryCheckpointSummary[] };
  'history-restore': { target: SessionTarget; generation: number; checkpointId: string };
  import: { importedSessionIds: string[] };
  export: { document: string };
  retry: { operationId: string; status: 'pending' | 'completed' };
  'open-data-folder': { opened: true };
}

export type SessionRepositoryErrorCode =
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

function assertInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new SessionRepositoryRequestError(`${label} must be a non-negative integer`);
  }
}

function assertSummary(value: unknown): asserts value is RepositorySessionSummary {
  if (!isPlainObject(value)) throw new SessionRepositoryRequestError('session summary must be an object');
  assertExactKeys(value, ['id', 'name', 'updatedAt', 'generation', 'summary'], 'session summary');
  assertString(value.id, 'summary id');
  assertString(value.name, 'summary name');
  assertString(value.updatedAt, 'summary updatedAt');
  assertInteger(value.generation, 'summary generation');
  if (!isPlainObject(value.summary)) throw new SessionRepositoryRequestError('summary payload must be an object');
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new SessionRepositoryRequestError(`${label} must be an array`);
  value.forEach((item) => assertString(item, `${label} item`));
}

function assertSuccessData(operation: SessionRepositoryOperation, value: unknown): void {
  if (!isPlainObject(value)) throw new SessionRepositoryRequestError('response data must be an object');
  if (operation === 'bootstrap') {
    assertExactKeys(value, ['sessions', 'activeTarget', 'viewedTarget'], 'bootstrap data');
    if (!Array.isArray(value.sessions)) throw new SessionRepositoryRequestError('sessions must be an array');
    value.sessions.forEach(assertSummary);
    assertTarget(value.activeTarget);
    assertTarget(value.viewedTarget);
  } else if (operation === 'list') {
    assertExactKeys(value, ['sessions'], 'list data');
    if (!Array.isArray(value.sessions)) throw new SessionRepositoryRequestError('sessions must be an array');
    value.sessions.forEach(assertSummary);
  } else if (operation === 'load') {
    assertExactKeys(value, ['target', 'generation', 'payload'], 'load data');
    assertTarget(value.target);
    assertInteger(value.generation, 'generation');
    if (!isPlainObject(value.payload)) throw new SessionRepositoryRequestError('payload must be an object');
  } else if (operation === 'save') {
    assertExactKeys(value, ['target', 'generation', 'summary'], 'save data');
    assertTarget(value.target);
    assertInteger(value.generation, 'generation');
    if (value.summary !== null) assertSummary(value.summary);
  } else if (operation === 'rename') {
    assertExactKeys(value, ['sessionId', 'generation', 'name'], 'rename data');
    assertString(value.sessionId, 'sessionId');
    assertInteger(value.generation, 'generation');
    assertString(value.name, 'name');
  } else if (operation === 'delete') {
    assertExactKeys(value, ['sessionId', 'recoveryId'], 'delete data');
    assertString(value.sessionId, 'sessionId');
    assertString(value.recoveryId, 'recoveryId');
  } else if (operation === 'history-list') {
    assertExactKeys(value, ['target', 'checkpoints'], 'history-list data');
    assertTarget(value.target);
    if (!Array.isArray(value.checkpoints)) throw new SessionRepositoryRequestError('checkpoints must be an array');
    value.checkpoints.forEach((checkpoint) => {
      if (!isPlainObject(checkpoint)) throw new SessionRepositoryRequestError('checkpoint must be an object');
      assertExactKeys(checkpoint, ['id', 'createdAt', 'reason', 'summary'], 'checkpoint');
      assertString(checkpoint.id, 'checkpoint id');
      assertString(checkpoint.createdAt, 'checkpoint createdAt');
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
    assertExactKeys(value, ['importedSessionIds'], 'import data');
    assertStringArray(value.importedSessionIds, 'importedSessionIds');
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
  if (operation === 'bootstrap' || operation === 'list' || operation === 'open-data-folder') {
    assertExactKeys(value, ['operation'], `${operation} request`);
  } else if (operation === 'load' || operation === 'history-list') {
    assertExactKeys(value, ['operation', 'target'], `${operation} request`);
    assertTarget(value.target);
  } else if (operation === 'save') {
    assertExactKeys(value, ['operation', 'target', 'expectedGeneration', 'payload'], 'save request');
    assertTarget(value.target);
    assertGeneration(value.expectedGeneration, true);
    assertJsonValue(value.payload, '$.payload');
    if (!isPlainObject(value.payload)) throw new SessionRepositoryRequestError('payload must be an object');
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
    assertExactKeys(value, ['operation', 'document'], 'import request');
    assertString(value.document, 'document');
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
