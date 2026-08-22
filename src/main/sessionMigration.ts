import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  CURRENT_RECORD_NAME,
  assertPathInside,
  commitRecordAtomically,
  deriveRepositoryPaths,
  deriveSessionDirectory,
  readRepositoryRecord,
  sessionDirectoryName,
  type RepositoryPaths,
  type RepositoryReadPolicy,
} from './sessionRepositoryCore';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_MIGRATION_SCHEMA,
  LEGACY_STORE_STORAGE_KEY,
  LEGACY_STORE_VERSION,
  SESSION_CONTENT_VERSION,
  SESSION_REPOSITORY_VERSION,
  type LegacyMigrationPlanV1,
  type LegacyMigrationSession,
  type LegacyMigrationStage,
  type LegacyStorageValue,
  type RepositoryStorageV1,
} from '../shared/sessionMigration';
import {
  canonicalizeJson,
  computeSemanticHash,
  encodeRecordV1,
  type JsonObject,
  type RecordContentType,
  type SessionBodyV1,
} from '../shared/sessionRecord';

const STORAGE_FILE = 'storage.json';
const OWNER_FILE = '.migration-owner.json';
const STAGING_SUFFIX = '.staging';
const RECORD_LIMIT = 32 * 1024 * 1024;

export const LEGACY_MIGRATION_READ_POLICY: RepositoryReadPolicy = {
  maxRecordBytes: RECORD_LIMIT,
  maxContentVersions: {
    session: SESSION_CONTENT_VERSION,
    preferences: 1,
    layout: 1,
    bootstrap: 1,
    catalog: 1,
  },
};

export type LegacyMigrationRepositoryErrorKind =
  | 'damaged-repository'
  | 'repository-exists'
  | 'foreign-staging'
  | 'verification-failed';

export class LegacyMigrationRepositoryError extends Error {
  constructor(
    public readonly kind: LegacyMigrationRepositoryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LegacyMigrationRepositoryError';
  }
}

export interface LegacyMigrationHooks {
  afterStage?(stage: LegacyMigrationStage): void | Promise<void>;
}

export interface LegacyMigrationOptions {
  userDataPath: string;
  plan: LegacyMigrationPlanV1;
  readPolicy?: RepositoryReadPolicy;
  hooks?: LegacyMigrationHooks;
  completedAt?: () => Date;
}

export interface LegacyMigrationResult {
  status: 'complete';
  root: string;
  resumed: boolean;
  legacyCleanupKeys: string[];
}

interface BackupManifestEntry {
  key: string;
  present: boolean;
  relativePath: string | null;
  byteLength: number;
  sha256: string | null;
}

interface BackupManifest {
  schema: 1;
  operationId: string;
  sourceHash: string;
  sourceStoreVersion: number;
  entries: BackupManifestEntry[];
}

interface MigrationOwner {
  schema: 1;
  operationId: string;
  sourceHash: string;
  repositoryId: string;
}

interface RootState {
  kind: 'absent' | 'empty' | 'ready' | 'complete';
  storage: RepositoryStorageV1 | null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isMissing(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeToken(value: string, length = 16): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, length);
}

function safeTime(value: string): string {
  return value.replace(/[-:.]/g, '');
}

function migrationStagePath(userDataPath: string, operationId: string): string {
  const absoluteUserData = resolve(userDataPath);
  const rootName = basename(deriveRepositoryPaths(absoluteUserData).root);
  const candidate = join(absoluteUserData, `${rootName}.migration-${safeToken(operationId)}${STAGING_SUFFIX}`);
  assertPathInside(absoluteUserData, candidate);
  return candidate;
}

function pathsAtRoot(root: string): RepositoryPaths {
  const sessions = join(root, 'sessions');
  return {
    root,
    storage: join(root, STORAGE_FILE),
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

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function writeExclusiveSynced(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJsonExclusive(path: string, value: unknown): Promise<void> {
  await writeExclusiveSynced(path, Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'));
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${safeToken(randomUUID())}.tmp`;
  await writeExclusiveSynced(temporaryPath, Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'));
  await rename(temporaryPath, path);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function assertStorage(value: unknown): RepositoryStorageV1 {
  if (!isPlainObject(value) || value.repositoryVersion !== SESSION_REPOSITORY_VERSION ||
      typeof value.repositoryId !== 'string' || value.repositoryId.length === 0 ||
      !isPlainObject(value.migration)) {
    throw new LegacyMigrationRepositoryError('damaged-repository', 'storage.json is invalid');
  }
  const migration = value.migration;
  if (typeof migration.operationId !== 'string' || migration.operationId.length === 0 ||
      typeof migration.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(migration.sourceHash) ||
      !Number.isSafeInteger(migration.sourceStoreVersion) ||
      (migration.state !== 'ready' && migration.state !== 'complete') ||
      !isUtcTimestamp(migration.createdAt) || !isUtcTimestamp(migration.verifiedAt) ||
      (migration.completedAt !== undefined && !isUtcTimestamp(migration.completedAt))) {
    throw new LegacyMigrationRepositoryError('damaged-repository', 'storage.json migration state is invalid');
  }
  return value as unknown as RepositoryStorageV1;
}

async function inspectRoot(root: string): Promise<RootState> {
  if (!(await exists(root))) return { kind: 'absent', storage: null };
  const names = await readdir(root);
  if (names.length === 0) return { kind: 'empty', storage: null };
  const storagePath = join(root, STORAGE_FILE);
  let storage: RepositoryStorageV1;
  try {
    storage = assertStorage(await readJson(storagePath));
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError ||
        (error instanceof LegacyMigrationRepositoryError && error.kind === 'damaged-repository')) {
      throw new LegacyMigrationRepositoryError(
        'damaged-repository',
        'A populated ledger-data directory has missing or corrupt storage.json',
      );
    }
    throw error;
  }
  return { kind: storage.migration.state, storage };
}

function assertSameOperation(storage: RepositoryStorageV1, plan: LegacyMigrationPlanV1): void {
  if (storage.repositoryId !== plan.repositoryId ||
      storage.migration.operationId !== plan.operationId ||
      storage.migration.sourceHash !== plan.sourceHash ||
      storage.migration.sourceStoreVersion !== plan.sourceStoreVersion) {
    throw new LegacyMigrationRepositoryError(
      'repository-exists',
      'ledger-data belongs to a different repository or migration source',
    );
  }
}

async function readOwner(path: string): Promise<MigrationOwner> {
  const value = await readJson(path);
  if (!isPlainObject(value) || value.schema !== LEGACY_MIGRATION_SCHEMA ||
      typeof value.operationId !== 'string' || typeof value.sourceHash !== 'string' ||
      typeof value.repositoryId !== 'string') {
    throw new LegacyMigrationRepositoryError('foreign-staging', 'Migration staging owner is invalid');
  }
  return value as unknown as MigrationOwner;
}

async function prepareStaging(stageRoot: string, plan: LegacyMigrationPlanV1): Promise<void> {
  if (await exists(stageRoot)) {
    let owner: MigrationOwner;
    try {
      owner = await readOwner(join(stageRoot, OWNER_FILE));
    } catch (error) {
      if (isMissing(error)) {
        throw new LegacyMigrationRepositoryError(
          'foreign-staging',
          'Existing migration staging has no ownership marker',
        );
      }
      throw error;
    }
    if (owner.operationId !== plan.operationId || owner.sourceHash !== plan.sourceHash ||
        owner.repositoryId !== plan.repositoryId) {
      throw new LegacyMigrationRepositoryError(
        'foreign-staging',
        'Existing migration staging belongs to a different operation',
      );
    }
    await rm(stageRoot, { recursive: true, force: false });
  }
  await mkdir(stageRoot, { recursive: false });
  const owner: MigrationOwner = {
    schema: LEGACY_MIGRATION_SCHEMA,
    operationId: plan.operationId,
    sourceHash: plan.sourceHash,
    repositoryId: plan.repositoryId,
  };
  await writeJsonExclusive(join(stageRoot, OWNER_FILE), owner);
}

async function afterStage(hooks: LegacyMigrationHooks | undefined, stage: LegacyMigrationStage): Promise<void> {
  await hooks?.afterStage?.(stage);
}

function backupRelativePath(value: LegacyStorageValue, base: string): string {
  if (value.key === LEGACY_STORE_STORAGE_KEY) return `migration/${base}.json`;
  if (value.key === LEGACY_LAYOUT_STORAGE_KEY) return `migration/${base}.layout.json`;
  if (value.key === LEGACY_CHANGELOG_STORAGE_KEY) return `migration/${base}.changelog.txt`;
  throw new LegacyMigrationRepositoryError('verification-failed', `Unexpected legacy key ${value.key}`);
}

async function writeLegacyBackup(paths: RepositoryPaths, plan: LegacyMigrationPlanV1): Promise<BackupManifest> {
  await mkdir(paths.migration, { recursive: true });
  const base = `legacy-${plan.sourceStoreVersion}-${safeTime(plan.createdAt)}`;
  const entries: BackupManifestEntry[] = [];
  for (const value of plan.sourceValues) {
    if (value.rawValue === null) {
      entries.push({ key: value.key, present: false, relativePath: null, byteLength: 0, sha256: null });
      continue;
    }
    const relativePath = backupRelativePath(value, base);
    const bytes = Buffer.from(value.rawValue, 'utf8');
    await writeExclusiveSynced(join(paths.root, relativePath), bytes);
    entries.push({
      key: value.key,
      present: true,
      relativePath,
      byteLength: bytes.byteLength,
      sha256: hashBytes(bytes),
    });
  }
  const manifest: BackupManifest = {
    schema: 1,
    operationId: plan.operationId,
    sourceHash: plan.sourceHash,
    sourceStoreVersion: plan.sourceStoreVersion,
    entries,
  };
  await writeJsonExclusive(join(paths.migration, `${base}.manifest.json`), manifest);
  return manifest;
}

async function writeRecordDirectory(
  root: string,
  directory: string,
  entityKey: string,
  operationId: string,
  contentType: RecordContentType,
  body: JsonObject,
  readPolicy: RepositoryReadPolicy,
): Promise<void> {
  await commitRecordAtomically({
    directory,
    entityKey,
    operationId,
    contentType,
    contentVersion: SESSION_CONTENT_VERSION,
    body,
    expectedGeneration: null,
  }, { root, readPolicy });
}

async function writeDirectRecord(
  path: string,
  contentType: RecordContentType,
  body: JsonObject,
  readPolicy: RepositoryReadPolicy,
): Promise<void> {
  const bytes = await encodeRecordV1(contentType, SESSION_CONTENT_VERSION, body);
  if (bytes.byteLength > readPolicy.maxRecordBytes) {
    throw new LegacyMigrationRepositoryError(
      'verification-failed',
      `Record size ${bytes.byteLength} exceeds ${readPolicy.maxRecordBytes} bytes`,
    );
  }
  await writeExclusiveSynced(path, bytes);
}

function sessionDirectory(paths: RepositoryPaths, session: LegacyMigrationSession): string {
  return session.target.kind === 'working'
    ? paths.working
    : deriveSessionDirectory(paths.root, session.target.sessionId);
}

async function writeRepositoryRecords(
  paths: RepositoryPaths,
  plan: LegacyMigrationPlanV1,
  readPolicy: RepositoryReadPolicy,
): Promise<void> {
  await mkdir(paths.entries, { recursive: true });
  await mkdir(paths.trash, { recursive: true });
  for (const session of plan.sessions) {
    const directory = sessionDirectory(paths, session);
    const entityKey = session.target.kind === 'working'
      ? 'working'
      : session.target.sessionId;
    await writeRecordDirectory(
      paths.root,
      directory,
      entityKey,
      plan.operationId,
      'session',
      session.current,
      readPolicy,
    );
    if (session.checkpoint) {
      const checkpointId = session.checkpoint.checkpoint?.id;
      if (typeof checkpointId !== 'string') {
        throw new LegacyMigrationRepositoryError('verification-failed', 'Migration checkpoint has no id');
      }
      const checkpointPath = join(
        directory,
        'versions',
        `${safeToken(checkpointId, 64)}.wlrec`,
      );
      await writeDirectRecord(checkpointPath, 'session', session.checkpoint, readPolicy);
    }
  }
  await writeRecordDirectory(
    paths.root,
    paths.preferences,
    'preferences',
    plan.operationId,
    'preferences',
    plan.preferences,
    readPolicy,
  );
  await writeRecordDirectory(
    paths.root,
    paths.layout,
    'layout',
    plan.operationId,
    'layout',
    plan.layout,
    readPolicy,
  );
  await writeRecordDirectory(
    paths.root,
    paths.bootstrap,
    'bootstrap',
    plan.operationId,
    'bootstrap',
    plan.bootstrap,
    readPolicy,
  );
  await writeDirectRecord(paths.catalog, 'catalog', plan.catalog, readPolicy);
  const indexLines = plan.sessions
    .flatMap((session) => session.target.kind === 'session'
      ? [`${sessionDirectoryName(session.target.sessionId)}\t${JSON.stringify(session.target.sessionId)}\t${JSON.stringify(session.current.name)}`]
      : [])
    .sort();
  await writeExclusiveSynced(paths.index, Buffer.from(`${indexLines.join('\n')}\n`, 'utf8'));
  await writeExclusiveSynced(paths.readme, Buffer.from(
    [
      'WraeclastLedger data repository',
      '',
      'Copy this complete ledger-data folder to back up all user-authored app state.',
      'Recover through WraeclastLedger; do not hand-edit authoritative .wlrec files.',
      '',
      '.wlrec files are framed text: line 1 is a JSON integrity header and every remaining UTF-8 byte is the exact JSON body.',
      'INDEX.txt maps readable session IDs and names to their hashed directories.',
      'current.bak files are internal crash-recovery candidates, not user-managed version history.',
      '',
    ].join('\n'),
    'utf8',
  ));
}

async function expectedBodyHash(contentType: RecordContentType, body: JsonObject): Promise<string> {
  const bytes = await encodeRecordV1(contentType, SESSION_CONTENT_VERSION, body);
  const newline = bytes.indexOf(0x0a);
  const header = JSON.parse(Buffer.from(bytes.subarray(0, newline)).toString('utf8')) as { bodyHash: string };
  return header.bodyHash;
}

async function verifyRecord(
  path: string,
  contentType: RecordContentType,
  expected: JsonObject,
  readPolicy: RepositoryReadPolicy,
): Promise<void> {
  const decoded = await readRepositoryRecord(path, readPolicy, contentType);
  if (decoded.header.bodyHash !== await expectedBodyHash(contentType, expected) ||
      canonicalizeJson(decoded.body) !== canonicalizeJson(expected)) {
    throw new LegacyMigrationRepositoryError('verification-failed', `Record mismatch at ${path}`);
  }
  if (contentType === 'session') {
    const body = decoded.body as SessionBodyV1;
    if (body.semanticHash !== await computeSemanticHash(body.payload)) {
      throw new LegacyMigrationRepositoryError('verification-failed', `Session semantic hash mismatch at ${path}`);
    }
  }
}

async function verifyBackup(paths: RepositoryPaths, plan: LegacyMigrationPlanV1): Promise<void> {
  const base = `legacy-${plan.sourceStoreVersion}-${safeTime(plan.createdAt)}`;
  const manifestPath = join(paths.migration, `${base}.manifest.json`);
  const value = await readJson(manifestPath);
  if (!isPlainObject(value) || !Array.isArray(value.entries) ||
      value.operationId !== plan.operationId || value.sourceHash !== plan.sourceHash ||
      value.sourceStoreVersion !== plan.sourceStoreVersion) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Legacy backup manifest mismatch');
  }
  const entries = value.entries as unknown[];
  if (entries.length !== plan.sourceValues.length) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Legacy backup source count mismatch');
  }
  for (const source of plan.sourceValues) {
    const entry = entries.find((candidate) => isPlainObject(candidate) && candidate.key === source.key);
    if (!isPlainObject(entry)) {
      throw new LegacyMigrationRepositoryError('verification-failed', `Missing legacy backup for ${source.key}`);
    }
    if (source.rawValue === null) {
      if (entry.present !== false || entry.relativePath !== null || entry.byteLength !== 0 || entry.sha256 !== null) {
        throw new LegacyMigrationRepositoryError('verification-failed', `Absent legacy key ${source.key} changed`);
      }
      continue;
    }
    if (entry.present !== true || typeof entry.relativePath !== 'string') {
      throw new LegacyMigrationRepositoryError('verification-failed', `Legacy key ${source.key} was not backed up`);
    }
    const backupPath = join(paths.root, entry.relativePath);
    assertPathInside(paths.root, backupPath);
    const actual = await readFile(backupPath);
    const expected = Buffer.from(source.rawValue, 'utf8');
    if (!actual.equals(expected) || entry.byteLength !== expected.byteLength || entry.sha256 !== hashBytes(expected)) {
      throw new LegacyMigrationRepositoryError('verification-failed', `Legacy key ${source.key} is not byte-identical`);
    }
  }
}

async function verifyRepository(
  paths: RepositoryPaths,
  plan: LegacyMigrationPlanV1,
  readPolicy: RepositoryReadPolicy,
): Promise<void> {
  if (plan.sourceHash !== await computeSemanticHash(plan.sourceValues)) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migration source hash mismatch');
  }
  await verifyBackup(paths, plan);
  const actualIds: string[] = [];
  let workingCount = 0;
  for (const session of plan.sessions) {
    const directory = sessionDirectory(paths, session);
    await verifyRecord(join(directory, CURRENT_RECORD_NAME), 'session', session.current, readPolicy);
    if (session.target.kind === 'working') workingCount += 1;
    else actualIds.push(session.target.sessionId);
    if (session.checkpoint) {
      const checkpointId = session.checkpoint.checkpoint?.id;
      if (typeof checkpointId !== 'string') {
        throw new LegacyMigrationRepositoryError('verification-failed', 'Migration checkpoint has no id');
      }
      await verifyRecord(
        join(directory, 'versions', `${safeToken(checkpointId, 64)}.wlrec`),
        'session',
        session.checkpoint,
        readPolicy,
      );
    }
  }
  const expectedWorking = plan.sessions.filter((session) => session.target.kind === 'working').length;
  const actualWorking = await exists(join(paths.working, CURRENT_RECORD_NAME)) ? 1 : 0;
  if (workingCount !== expectedWorking || expectedWorking > 1 ||
      actualWorking !== expectedWorking ||
      actualIds.sort().join('\n') !== [...plan.expectedSessionIds].sort().join('\n') ||
      new Set(actualIds).size !== actualIds.length) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migrated session identity/count mismatch');
  }
  const entryNames = await readdir(paths.entries);
  if (entryNames.length !== plan.expectedSessionIds.length) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migrated session directory count mismatch');
  }
  await verifyRecord(join(paths.preferences, CURRENT_RECORD_NAME), 'preferences', plan.preferences, readPolicy);
  await verifyRecord(join(paths.layout, CURRENT_RECORD_NAME), 'layout', plan.layout, readPolicy);
  await verifyRecord(join(paths.bootstrap, CURRENT_RECORD_NAME), 'bootstrap', plan.bootstrap, readPolicy);
  await verifyRecord(paths.catalog, 'catalog', plan.catalog, readPolicy);
}

function readyStorage(plan: LegacyMigrationPlanV1): RepositoryStorageV1 {
  return {
    repositoryVersion: SESSION_REPOSITORY_VERSION,
    repositoryId: plan.repositoryId,
    migration: {
      operationId: plan.operationId,
      sourceHash: plan.sourceHash,
      sourceStoreVersion: plan.sourceStoreVersion,
      state: 'ready',
      createdAt: plan.createdAt,
      verifiedAt: plan.createdAt,
    },
  };
}

async function markComplete(
  root: string,
  storage: RepositoryStorageV1,
  completedAt: Date,
): Promise<RepositoryStorageV1> {
  if (!Number.isFinite(completedAt.getTime())) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migration completion time is invalid');
  }
  const complete: RepositoryStorageV1 = {
    ...storage,
    migration: {
      ...storage.migration,
      state: 'complete',
      completedAt: completedAt.toISOString(),
    },
  };
  await writeJsonAtomically(join(root, STORAGE_FILE), complete);
  const verified = assertStorage(await readJson(join(root, STORAGE_FILE)));
  if (verified.migration.state !== 'complete') {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Complete marker was not persisted');
  }
  return complete;
}

async function validatePlan(plan: LegacyMigrationPlanV1): Promise<void> {
  if (plan.schema !== LEGACY_MIGRATION_SCHEMA ||
      plan.repositoryVersion !== SESSION_REPOSITORY_VERSION) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Unsupported migration plan');
  }
  if (typeof plan.repositoryId !== 'string' || plan.repositoryId.length === 0 ||
      typeof plan.operationId !== 'string' || plan.operationId.length === 0 ||
      !isUtcTimestamp(plan.createdAt) ||
      !Number.isSafeInteger(plan.sourceStoreVersion) || plan.sourceStoreVersion < 0 ||
      plan.sourceStoreVersion > LEGACY_STORE_VERSION ||
      typeof plan.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(plan.sourceHash)) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migration plan identity is invalid');
  }
  const expectedKeys = [
    LEGACY_STORE_STORAGE_KEY,
    LEGACY_LAYOUT_STORAGE_KEY,
    LEGACY_CHANGELOG_STORAGE_KEY,
  ];
  if (!Array.isArray(plan.sourceValues) || plan.sourceValues.length !== expectedKeys.length ||
      plan.sourceValues.some((value, index) =>
        !isPlainObject(value) || value.key !== expectedKeys[index] ||
        (value.rawValue !== null && typeof value.rawValue !== 'string'))) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migration source values are invalid');
  }
  if (plan.sourceHash !== await computeSemanticHash(plan.sourceValues)) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migration source hash mismatch');
  }
  if (!Array.isArray(plan.sessions) || !Array.isArray(plan.expectedSessionIds)) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migration session index is invalid');
  }
  const namedIds: string[] = [];
  let working = 0;
  for (const session of plan.sessions) {
    if (!isPlainObject(session) || !isPlainObject(session.target) || !isPlainObject(session.current)) {
      throw new LegacyMigrationRepositoryError('verification-failed', 'Migration session is invalid');
    }
    if (session.target.kind === 'working') {
      working += 1;
      if (session.current.kind !== 'working' || session.current.id !== null || session.current.name !== null) {
        throw new LegacyMigrationRepositoryError('verification-failed', 'Working session identity is invalid');
      }
    } else if (session.target.kind === 'session' &&
               typeof session.target.sessionId === 'string' && session.target.sessionId.length > 0) {
      namedIds.push(session.target.sessionId);
      if (session.current.kind !== 'named' || session.current.id !== session.target.sessionId) {
        throw new LegacyMigrationRepositoryError('verification-failed', 'Named session identity is invalid');
      }
    } else {
      throw new LegacyMigrationRepositoryError('verification-failed', 'Migration target is invalid');
    }
  }
  const sortedNamed = namedIds.sort();
  const sortedExpected = [...plan.expectedSessionIds].sort();
  if (working > 1 || new Set(sortedNamed).size !== sortedNamed.length ||
      new Set(sortedExpected).size !== sortedExpected.length ||
      sortedNamed.join('\n') !== sortedExpected.join('\n')) {
    throw new LegacyMigrationRepositoryError('verification-failed', 'Migration session identities are inconsistent');
  }
}

function result(root: string, resumed: boolean): LegacyMigrationResult {
  return {
    status: 'complete',
    root,
    resumed,
    // The migrator never removes browser keys. Phase 4's renderer does so only
    // after a second semantic bootstrap verification against this complete
    // repository marker.
    legacyCleanupKeys: [
      LEGACY_STORE_STORAGE_KEY,
      LEGACY_LAYOUT_STORAGE_KEY,
      LEGACY_CHANGELOG_STORAGE_KEY,
    ],
  };
}

/**
 * Build and fully verify a repository inside the caller-supplied profile. The
 * Phase 4 production repository invokes this only with a renderer-authored
 * migration plan; it never mutates browser storage itself.
 */
export async function migrateLegacyProfileClone(
  options: LegacyMigrationOptions,
): Promise<LegacyMigrationResult> {
  const { plan } = options;
  await validatePlan(plan);
  const readPolicy = options.readPolicy ?? LEGACY_MIGRATION_READ_POLICY;
  const finalPaths = deriveRepositoryPaths(resolve(options.userDataPath));
  const initial = await inspectRoot(finalPaths.root);
  if (initial.kind === 'ready' || initial.kind === 'complete') {
    const storage = initial.storage as RepositoryStorageV1;
    assertSameOperation(storage, plan);
    await verifyRepository(finalPaths, plan, readPolicy);
    if (initial.kind === 'ready') {
      await markComplete(
        finalPaths.root,
        storage,
        options.completedAt?.() ?? new Date(plan.createdAt),
      );
      await afterStage(options.hooks, 'complete-written');
    }
    return result(finalPaths.root, true);
  }
  if (initial.kind === 'empty') await rmdir(finalPaths.root);

  const stageRoot = migrationStagePath(options.userDataPath, plan.operationId);
  await prepareStaging(stageRoot, plan);
  await afterStage(options.hooks, 'owner-written');
  const stagePaths = pathsAtRoot(stageRoot);
  await writeLegacyBackup(stagePaths, plan);
  await afterStage(options.hooks, 'legacy-backed-up');
  await writeRepositoryRecords(stagePaths, plan, readPolicy);
  await afterStage(options.hooks, 'records-written');
  await verifyRepository(stagePaths, plan, readPolicy);
  await afterStage(options.hooks, 'records-verified');
  const storage = readyStorage(plan);
  await writeJsonExclusive(stagePaths.storage, storage);
  const stagedStorage = assertStorage(await readJson(stagePaths.storage));
  assertSameOperation(stagedStorage, plan);
  await afterStage(options.hooks, 'ready-written');
  await rename(stageRoot, finalPaths.root);
  await afterStage(options.hooks, 'root-promoted');
  const promotedStorage = assertStorage(await readJson(finalPaths.storage));
  assertSameOperation(promotedStorage, plan);
  await verifyRepository(finalPaths, plan, readPolicy);
  await markComplete(
    finalPaths.root,
    storage,
    options.completedAt?.() ?? new Date(plan.createdAt),
  );
  await afterStage(options.hooks, 'complete-written');
  return result(finalPaths.root, false);
}
