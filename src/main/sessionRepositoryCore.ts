import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  type FileHandle,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  RecordValidationError,
  decodeRecordV1,
  encodeRecordV1,
  type DecodedRecordV1,
  type JsonObject,
  type RecordContentType,
} from '../shared/sessionRecord';

export const LEDGER_DATA_DIRECTORY = 'ledger-data';
export const CURRENT_RECORD_NAME = 'current.wlrec';
export const BACKUP_RECORD_NAME = 'current.bak';

export interface NewSessionIdentity {
  id: string;
  createdAt: string;
}

export interface RepositoryPaths {
  root: string;
  storage: string;
  bootstrap: string;
  preferences: string;
  layout: string;
  sessions: string;
  entries: string;
  working: string;
  trash: string;
  catalog: string;
  index: string;
  readme: string;
  migration: string;
}

export function deriveRepositoryPaths(userDataPath: string): RepositoryPaths {
  const root = resolve(userDataPath, LEDGER_DATA_DIRECTORY);
  const sessions = join(root, 'sessions');
  return {
    root,
    storage: join(root, 'storage.json'),
    bootstrap: join(root, 'bootstrap'),
    preferences: join(root, 'preferences'),
    layout: join(root, 'layout'),
    sessions,
    entries: join(sessions, 'entries'),
    working: join(sessions, 'working'),
    trash: join(sessions, 'trash'),
    catalog: join(root, 'catalog.wlrec'),
    index: join(root, 'INDEX.txt'),
    readme: join(root, 'README.txt'),
    migration: join(root, 'migration'),
  };
}

export function assertPathInside(root: string, candidate: string): void {
  const relation = relative(resolve(root), resolve(candidate));
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) return;
  throw new RepositoryPathError(`Path escapes repository root: ${candidate}`);
}

export function sessionDirectoryName(sessionId: string): string {
  if (sessionId.length === 0) throw new RepositoryPathError('Session id must not be empty');
  return createHash('sha256').update(sessionId, 'utf8').digest('hex');
}

export function deriveSessionDirectory(root: string, sessionId: string): string {
  const directory = join(resolve(root), 'sessions', 'entries', sessionDirectoryName(sessionId));
  assertPathInside(root, directory);
  return directory;
}

export function createSessionIdentity(now = new Date()): NewSessionIdentity {
  return { id: randomUUID(), createdAt: now.toISOString() };
}

export class RepositoryPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryPathError';
  }
}

export class GenerationConflictError extends Error {
  constructor(
    public readonly expected: number | null,
    public readonly actual: number | null,
  ) {
    super(`Generation conflict: expected ${expected ?? 'no record'}, found ${actual ?? 'no record'}`);
    this.name = 'GenerationConflictError';
  }
}

export class UnsupportedContentVersionError extends Error {
  constructor(
    public readonly contentType: RecordContentType,
    public readonly version: number,
    public readonly maximum: number,
  ) {
    super(`Unsupported ${contentType} content version ${version}; maximum is ${maximum}`);
    this.name = 'UnsupportedContentVersionError';
  }
}

export class RecordSizeLimitError extends Error {
  constructor(public readonly size: number, public readonly maximum: number) {
    super(`Record size ${size} exceeds the ${maximum}-byte limit`);
    this.name = 'RecordSizeLimitError';
  }
}

export class RepositoryRecoveryRequiredError extends Error {
  constructor(public readonly status: 'damaged' | 'unsupported') {
    super(`Repository record is ${status} and cannot be overwritten`);
    this.name = 'RepositoryRecoveryRequiredError';
  }
}

export interface RepositoryReadPolicy {
  maxRecordBytes: number;
  maxContentVersions: Readonly<Record<RecordContentType, number>>;
}

export type AtomicCommitStage =
  | 'temp-written'
  | 'temp-synced'
  | 'temp-verified'
  | 'backup-prepared'
  | 'current-rotated'
  | 'temp-promoted';

export interface AtomicCommitHooks {
  afterStage?(stage: AtomicCommitStage): void | Promise<void>;
}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  random: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 5,
  baseDelayMs: 15,
  maxDelayMs: 200,
  random: Math.random,
  sleep: (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)),
};

const TRANSIENT_CODES = new Set(['EACCES', 'EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM']);

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isMissing(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

export async function retryTransientFileOperation<T>(
  operation: () => Promise<T>,
  partialPolicy: Partial<RetryPolicy> = {},
): Promise<T> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...partialPolicy };
  let lastError: unknown;
  for (let attempt = 0; attempt < policy.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const transient = isNodeError(error) && TRANSIENT_CODES.has(String(error.code));
      if (!transient || attempt === policy.attempts - 1) throw error;
      const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** attempt));
      const jittered = Math.max(0, Math.round(exponential * (0.75 + policy.random() * 0.5)));
      await policy.sleep(jittered);
    }
  }
  throw lastError;
}

function recordGeneration(record: DecodedRecordV1): number {
  const body = record.body as JsonObject;
  const generation = body.generation;
  if (!Number.isSafeInteger(generation) || Number(generation) < 0) {
    throw new RecordValidationError('invalid-body', 'Repository record requires a generation');
  }
  return Number(generation);
}

async function readBounded(path: string, maximum: number): Promise<Uint8Array> {
  const details = await stat(path);
  if (details.size > maximum) throw new RecordSizeLimitError(details.size, maximum);
  return new Uint8Array(await readFile(path));
}

export async function readRepositoryRecord(
  path: string,
  policy: RepositoryReadPolicy,
  expectedType?: RecordContentType,
): Promise<DecodedRecordV1> {
  const decoded = await decodeRecordV1(await readBounded(path, policy.maxRecordBytes));
  if (expectedType && decoded.header.contentType !== expectedType) {
    throw new RecordValidationError(
      'invalid-header',
      `Expected ${expectedType}, received ${decoded.header.contentType}`,
    );
  }
  const maximum = policy.maxContentVersions[decoded.header.contentType];
  if (decoded.header.contentVersion > maximum) {
    throw new UnsupportedContentVersionError(
      decoded.header.contentType,
      decoded.header.contentVersion,
      maximum,
    );
  }
  recordGeneration(decoded);
  return decoded;
}

interface Candidate {
  path: string;
  name: string;
  role: 'current' | 'temporary' | 'backup';
  record?: DecodedRecordV1;
  generation?: number;
  error?: Error;
}

export interface CandidateInspection {
  valid: ReadonlyArray<Required<Pick<Candidate, 'path' | 'name' | 'role' | 'record' | 'generation'>>>;
  damaged: ReadonlyArray<Required<Pick<Candidate, 'path' | 'name' | 'role' | 'error'>>>;
}

function candidateRole(name: string): Candidate['role'] | null {
  if (name === CURRENT_RECORD_NAME) return 'current';
  if (name === BACKUP_RECORD_NAME) return 'backup';
  if (name.endsWith('.tmp')) return 'temporary';
  return null;
}

export async function inspectRecordCandidates(
  directory: string,
  policy: RepositoryReadPolicy,
  expectedType?: RecordContentType,
): Promise<CandidateInspection> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) return { valid: [], damaged: [] };
    throw error;
  }
  const valid: CandidateInspection['valid'][number][] = [];
  const damaged: CandidateInspection['damaged'][number][] = [];
  for (const name of names.sort()) {
    const role = candidateRole(name);
    if (!role) continue;
    const path = join(directory, name);
    try {
      const record = await readRepositoryRecord(path, policy, expectedType);
      valid.push({ path, name, role, record, generation: recordGeneration(record) });
    } catch (error) {
      damaged.push({
        path,
        name,
        role,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
  return { valid, damaged };
}

const rolePriority: Record<Candidate['role'], number> = {
  current: 3,
  temporary: 2,
  backup: 1,
};

function newestCandidate(inspection: CandidateInspection): CandidateInspection['valid'][number] | null {
  return [...inspection.valid].sort((left, right) => (
    right.generation - left.generation || rolePriority[right.role] - rolePriority[left.role]
  ))[0] ?? null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function quarantine(path: string, label: string, retry: Partial<RetryPolicy>): Promise<string> {
  const destination = `${path}.${label}-${randomUUID()}`;
  await retryTransientFileOperation(() => rename(path, destination), retry);
  return destination;
}

async function prepareBackupDestination(
  backupPath: string,
  policy: RepositoryReadPolicy,
  expectedType: RecordContentType,
  retry: Partial<RetryPolicy>,
): Promise<void> {
  if (!(await pathExists(backupPath))) return;
  try {
    await readRepositoryRecord(backupPath, policy, expectedType);
    await retryTransientFileOperation(() => rm(backupPath), retry);
  } catch (error) {
    if (error instanceof UnsupportedContentVersionError ||
        error instanceof RecordValidationError ||
        error instanceof RecordSizeLimitError) {
      await quarantine(backupPath, 'preserved', retry);
      return;
    }
    throw error;
  }
}

export interface RecoveryResult {
  status: 'empty' | 'damaged' | 'unsupported' | 'current' | 'promoted';
  record: DecodedRecordV1 | null;
  source: string | null;
  damaged: CandidateInspection['damaged'];
  preserved: string[];
}

export async function recoverRecordDirectory(
  directory: string,
  policy: RepositoryReadPolicy,
  expectedType: RecordContentType,
  retry: Partial<RetryPolicy> = {},
): Promise<RecoveryResult> {
  const inspection = await inspectRecordCandidates(directory, policy, expectedType);
  if (inspection.damaged.some(({ error }) => error instanceof UnsupportedContentVersionError)) {
    return {
      status: 'unsupported',
      record: null,
      source: null,
      damaged: inspection.damaged,
      preserved: [],
    };
  }
  const winner = newestCandidate(inspection);
  if (!winner) {
    return {
      status: inspection.damaged.length > 0 ? 'damaged' : 'empty',
      record: null,
      source: null,
      damaged: inspection.damaged,
      preserved: [],
    };
  }
  if (winner.role === 'current') {
    return {
      status: 'current',
      record: winner.record,
      source: winner.path,
      damaged: inspection.damaged,
      preserved: [],
    };
  }

  const currentPath = join(directory, CURRENT_RECORD_NAME);
  const backupPath = join(directory, BACKUP_RECORD_NAME);
  const preserved: string[] = [];
  if (await pathExists(currentPath)) {
    if (winner.role === 'temporary') {
      await prepareBackupDestination(backupPath, policy, expectedType, retry);
      const currentInspection = inspection.valid.find((candidate) => candidate.role === 'current');
      if (currentInspection) {
        await retryTransientFileOperation(() => rename(currentPath, backupPath), retry);
      } else {
        preserved.push(await quarantine(currentPath, 'damaged', retry));
      }
    } else {
      preserved.push(await quarantine(currentPath, 'lower', retry));
    }
  }
  await retryTransientFileOperation(() => rename(winner.path, currentPath), retry);
  return {
    status: 'promoted',
    record: winner.record,
    source: winner.path,
    damaged: inspection.damaged,
    preserved,
  };
}

export interface AtomicCommitRequest {
  directory: string;
  entityKey: string;
  operationId: string;
  contentType: RecordContentType;
  contentVersion: number;
  body: JsonObject;
  expectedGeneration: number | null;
}

export interface AtomicCommitResult {
  generation: number;
  currentPath: string;
  backupPath: string;
  temporaryPath: string;
  record: DecodedRecordV1;
}

export interface AtomicCommitOptions {
  root: string;
  readPolicy: RepositoryReadPolicy;
  retry?: Partial<RetryPolicy>;
  hooks?: AtomicCommitHooks;
  processId?: number;
  uniqueId?: () => string;
}

async function closeHandle(handle: FileHandle | null): Promise<void> {
  if (handle) await handle.close();
}

async function stage(hooks: AtomicCommitHooks | undefined, name: AtomicCommitStage): Promise<void> {
  await hooks?.afterStage?.(name);
}

export async function commitRecordAtomically(
  request: AtomicCommitRequest,
  options: AtomicCommitOptions,
): Promise<AtomicCommitResult> {
  assertPathInside(options.root, request.directory);
  await mkdir(request.directory, { recursive: true });
  const retry = options.retry ?? {};
  const currentPath = join(request.directory, CURRENT_RECORD_NAME);
  const backupPath = join(request.directory, BACKUP_RECORD_NAME);
  const recovered = await recoverRecordDirectory(
    request.directory,
    options.readPolicy,
    request.contentType,
    retry,
  );
  if (recovered.status === 'damaged' || recovered.status === 'unsupported') {
    throw new RepositoryRecoveryRequiredError(recovered.status);
  }
  const current = recovered.record;
  const actualGeneration = current ? recordGeneration(current) : null;
  if (actualGeneration !== request.expectedGeneration) {
    throw new GenerationConflictError(request.expectedGeneration, actualGeneration);
  }
  const bodyGeneration = request.body.generation;
  const requiredGeneration = (actualGeneration ?? 0) + 1;
  if (!Number.isSafeInteger(bodyGeneration) || Number(bodyGeneration) < 0) {
    throw new RecordValidationError('invalid-body', 'Commit body requires a valid generation');
  }
  if (Number(bodyGeneration) !== requiredGeneration) {
    throw new GenerationConflictError(requiredGeneration, Number(bodyGeneration));
  }

  const bytes = await encodeRecordV1(request.contentType, request.contentVersion, request.body);
  if (bytes.byteLength > options.readPolicy.maxRecordBytes) {
    throw new RecordSizeLimitError(bytes.byteLength, options.readPolicy.maxRecordBytes);
  }
  const safeEntity = createHash('sha256').update(request.entityKey, 'utf8').digest('hex').slice(0, 16);
  const safeOperation = createHash('sha256').update(request.operationId, 'utf8').digest('hex').slice(0, 16);
  const rawSuffix = options.uniqueId?.() ?? randomUUID();
  const suffix = createHash('sha256').update(rawSuffix, 'utf8').digest('hex').slice(0, 16);
  const temporaryPath = join(
    request.directory,
    `${safeEntity}.g${requiredGeneration}.${safeOperation}.p${options.processId ?? process.pid}.${suffix}.tmp`,
  );
  assertPathInside(options.root, temporaryPath);

  let handle: FileHandle | null = null;
  try {
    handle = await retryTransientFileOperation(() => open(temporaryPath, 'wx'), retry);
    await handle.writeFile(bytes);
    await stage(options.hooks, 'temp-written');
    await handle.sync();
    await stage(options.hooks, 'temp-synced');
  } finally {
    await closeHandle(handle);
  }

  const verified = await readRepositoryRecord(temporaryPath, options.readPolicy, request.contentType);
  if (recordGeneration(verified) !== requiredGeneration) {
    throw new RecordValidationError('invalid-body', 'Temporary record generation changed after write');
  }
  await stage(options.hooks, 'temp-verified');
  await prepareBackupDestination(backupPath, options.readPolicy, request.contentType, retry);
  await stage(options.hooks, 'backup-prepared');
  if (current) {
    await retryTransientFileOperation(() => rename(currentPath, backupPath), retry);
  }
  await stage(options.hooks, 'current-rotated');
  await retryTransientFileOperation(() => rename(temporaryPath, currentPath), retry);
  await stage(options.hooks, 'temp-promoted');
  return {
    generation: requiredGeneration,
    currentPath,
    backupPath,
    temporaryPath,
    record: verified,
  };
}

export class EntityOperationQueue {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue<T>(entityKey: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.tails.get(entityKey) ?? Promise.resolve();
    const result = prior.catch(() => undefined).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(entityKey, tail);
    void tail.finally(() => {
      if (this.tails.get(entityKey) === tail) this.tails.delete(entityKey);
    });
    return result;
  }

  pendingEntities(): number {
    return this.tails.size;
  }
}
