import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  SESSION_CONTENT_VERSION,
  SESSION_REPOSITORY_VERSION,
  type LegacyMigrationPlanV1,
  type RepositoryStorageV1,
} from '../shared/sessionMigration';
import {
  assertJsonValue,
  assertSessionBodyV1,
  computeSemanticHash,
  decodeRecordV1,
  encodeRecordV1,
  MAX_CHECKPOINT_CHANGE_DETAILS,
  MAX_CHECKPOINT_CHANGE_TEXT_LENGTH,
  type JsonObject,
  type CheckpointReason,
  type RecordContentType,
  type SessionBodyV1,
} from '../shared/sessionRecord';
import {
  portableFieldsFromSessionPayload,
  sessionPayloadFromPortableFields,
  type PortableSessionPayloadFields,
} from '../shared/sessionPayload';
import {
  SESSION_REPOSITORY_MAX_IMPORT_BYTES,
  type RepositoryCheckpointSummary,
  type RepositorySessionSummary,
  type RepositoryTrashSummary,
  type RepositoryWorkflow,
  type SessionRepositoryDataMap,
  type SessionRepositoryRequest,
  type SessionSaveTarget,
  type SessionTarget,
} from '../shared/sessionRepositoryIpc';
import {
  CURRENT_RECORD_NAME,
  EntityOperationQueue,
  GenerationConflictError,
  RepositoryRecoveryRequiredError,
  assertPathInside,
  commitRecordAtomically,
  deriveRepositoryPaths,
  deriveSessionDirectory,
  readRepositoryRecord,
  recoverRecordDirectory,
  retryTransientFileOperation,
  sessionDirectoryName,
  type RepositoryPaths,
  type RepositoryReadPolicy,
} from './sessionRepositoryCore';
import type { SessionRepositoryPort } from './sessionRepositoryAdapter';
import {
  PERIODIC_CHECKPOINT_INTERVAL_MS,
  TRASH_RETENTION_DAYS,
  applyGlobalRecoveryRetention,
  applyTrashRetention,
  applyVersionRetention,
  type GlobalRecoveryClass,
  type GlobalRetentionResult,
  type VersionRetentionResult,
} from './sessionRetention';
import {
  LEGACY_MIGRATION_READ_POLICY,
  migrateLegacyProfileClone,
} from './sessionMigration';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const LOCK_FILE = 'ledger-data.lock';
const CATALOG_BACKUP_FILE = 'catalog.bak';
const IMPORT_SCHEMA_VERSION = '1.0';

type RequestFor<Operation extends SessionRepositoryRequest['operation']> = Extract<
  SessionRepositoryRequest,
  { operation: Operation }
>;

interface CatalogEntry extends RepositorySessionSummary {
  recordBytes: number;
  modifiedAtMs: number;
  directoryName: string;
}

interface RepositoryLockBody {
  token: string;
  pid: number;
  startedAt: string;
}

type PortableSession = JsonObject & PortableSessionPayloadFields & {
  id: string;
  name: string;
  createdAt: string;
};

interface ImportTransactionAction {
  sessionId: string;
  hadExisting: boolean;
}

interface ImportTransactionJournal {
  schema: 1;
  operationId: string;
  conflictMode: 'skip' | 'overwrite';
  actions: ImportTransactionAction[];
  createdAt: string;
}

interface StoredVersionRecord {
  path: string;
  body: SessionBodyV1;
  contentVersion: number;
  compressedBytes: number;
}

interface CheckpointWriteResult {
  checkpoint: RepositoryCheckpointSummary | null;
  checkpointAt: string | null;
  historyStoragePressure: boolean;
}

interface RecoveryMetadata {
  schema: 1;
  recoveryId: string;
  deletedAt: string;
  sourceKind: 'named' | 'working' | 'failed-new';
  displayName: string;
  sessionId?: string;
  originalGeneration: number;
}

interface StoredTrashEntry {
  directory: string;
  metadata: RecoveryMetadata | null;
  summary: RepositoryTrashSummary;
}

export class SessionRepositoryMigrationRequiredError extends Error {
  constructor(public readonly identity: JsonObject | null = null) {
    super('The file repository requires a verified legacy migration plan');
    this.name = 'SessionRepositoryMigrationRequiredError';
  }
}

export class SessionRepositoryLockedError extends Error {
  constructor(public readonly owner: JsonObject) {
    super('The WraeclastLedger data repository is already open by another process');
    this.name = 'SessionRepositoryLockedError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isRecoverableTargetReadFailure(error: unknown): boolean {
  return isMissing(error) || error instanceof RepositoryRecoveryRequiredError;
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

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} must be a timestamp`);
  return result;
}

function requireGeneration(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
  return Number(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withoutGeneration(body: JsonObject): JsonObject {
  const { generation: _generation, ...payload } = body;
  return cloneJson(payload) as JsonObject;
}

function sameTarget(left: SessionTarget, right: SessionTarget): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === 'working' || left.sessionId === (right as Extract<SessionTarget, { kind: 'session' }>).sessionId;
}

function parseTarget(value: unknown, label: string): SessionTarget {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  if (value.kind === 'working') return { kind: 'working' };
  if (value.kind === 'session') return { kind: 'session', sessionId: requireString(value.sessionId, `${label}.sessionId`) };
  throw new Error(`${label} has an invalid kind`);
}

function parseWorkflow(body: JsonObject): RepositoryWorkflow {
  const lifecycle = body.lifecycle;
  if (lifecycle !== 'live' && lifecycle !== 'historical') throw new Error('bootstrap lifecycle is invalid');
  if (typeof body.suspended !== 'boolean' || typeof body.pendingAtlasBonusSeed !== 'boolean') {
    throw new Error('bootstrap workflow booleans are invalid');
  }
  if (body.pendingAtlasBonusValue !== null && typeof body.pendingAtlasBonusValue !== 'boolean') {
    throw new Error('bootstrap pending Atlas value is invalid');
  }
  const workflow: RepositoryWorkflow = {
    activeTarget: parseTarget(body.activeTarget, 'activeTarget'),
    viewedTarget: parseTarget(body.viewedTarget, 'viewedTarget'),
    lifecycle,
    suspended: body.suspended,
    activationId: requireString(body.activationId, 'activationId'),
    pendingAtlasBonusSeed: body.pendingAtlasBonusSeed,
    pendingAtlasBonusValue: body.pendingAtlasBonusValue,
  };
  assertJsonValue(workflow);
  return workflow;
}

function sessionSummary(body: SessionBodyV1): RepositorySessionSummary {
  if (body.kind !== 'named' || body.id === null || body.name === null) throw new Error('Named session body expected');
  return {
    id: body.id,
    name: body.name,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
    generation: body.generation,
    summary: cloneJson(body.summary),
    status: 'ready',
  };
}

const COST_SUMMARY_SETTING_KEYS = [
  'divinePrice',
  'chiselUsed',
  'chiselType',
  'chiselPrice',
  'baseMapCost',
  'scarabs',
  'advChaos',
  'advExalt',
  'advExaltPrice',
  'advScour',
  'advScourPrice',
  'advAlch',
  'advAlchPrice',
  'advDeliOrbType',
  'advDeliOrbQtyPerMap',
  'advDeliOrbPriceEach',
  'advSplitPrice',
  'advAstrolabeType',
  'advAstrolabePrice',
  'advAstrolabeCount',
  'advGemCount',
  'advGemBuyPrice',
  'advGemSellPrice',
  'advGemName',
] as const;

function compactSummaryHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function summarizePayload(payload: JsonObject): JsonObject {
  const maps = Array.isArray(payload.maps) ? payload.maps : [];
  const lootItems = Array.isArray(payload.lootItems) ? payload.lootItems : [];
  const baselineItems = Array.isArray(payload.baselineItems) ? payload.baselineItems : [];
  const settings = isPlainObject(payload.settings) ? payload.settings : {};
  const costs = Object.fromEntries(COST_SUMMARY_SETTING_KEYS.map((key) => [key, settings[key]]));
  const notes = typeof payload.sessionNotes === 'string' ? payload.sessionNotes : '';
  return {
    mapCount: maps.length,
    lootItemCount: lootItems.length,
    baselineItemCount: baselineItems.length,
    hasNotes: notes.length > 0,
    notesHash: compactSummaryHash(notes),
    settingsHash: compactSummaryHash(settings),
    costsHash: compactSummaryHash({
      settings: costs,
      investmentNeutralization: payload.investmentNeutralization ?? 0,
    }),
  };
}

const COST_CHANGE_FIELDS: ReadonlyArray<readonly [string, string, string]> = [
  ['divinePrice', 'Divine price', 'c'],
  ['chiselUsed', 'Chisel use', ''],
  ['chiselType', 'Chisel type', ''],
  ['chiselPrice', 'Chisel price', 'c'],
  ['baseMapCost', 'Base map price', 'c'],
  ['advChaos', 'Added Chaos Orbs', ''],
  ['advExalt', 'Added Exalted Orbs', ''],
  ['advExaltPrice', 'Exalted Orb price', 'c'],
  ['advScour', 'Added Orbs of Scouring', ''],
  ['advScourPrice', 'Orb of Scouring price', 'c'],
  ['advAlch', 'Added Orbs of Alchemy', ''],
  ['advAlchPrice', 'Orb of Alchemy price', 'c'],
  ['advDeliOrbType', 'Delirium Orb type', ''],
  ['advDeliOrbQtyPerMap', 'Delirium Orbs per map', ''],
  ['advDeliOrbPriceEach', 'Delirium Orb price', 'c'],
  ['advSplitPrice', 'Split price', 'c'],
  ['advAstrolabeType', 'Astrolabe type', ''],
  ['advAstrolabePrice', 'Astrolabe price', 'c'],
  ['advAstrolabeCount', 'Astrolabe count', ''],
  ['advGemCount', 'Gem count', ''],
  ['advGemBuyPrice', 'Gem buy price', 'c'],
  ['advGemSellPrice', 'Gem sell price', 'c'],
  ['advGemName', 'Gem name', ''],
] as const;

function valuesEqual(left: unknown, right: unknown): boolean {
  return compactSummaryHash(left) === compactSummaryHash(right);
}

function boundedChangeText(value: unknown, unit = ''): string {
  let text: string;
  if (value === undefined || value === null || value === '') text = 'Not set';
  else if (typeof value === 'boolean') text = value ? 'Yes' : 'No';
  else if (typeof value === 'number') text = `${value}${unit}`;
  else if (typeof value === 'string') text = value;
  else if (Array.isArray(value) && value.every((item) => (
    item === null || ['string', 'number', 'boolean'].includes(typeof item)
  ))) text = value.length === 0 ? 'None' : value.join(', ');
  else if (Array.isArray(value)) text = `${value.length} entries`;
  else text = 'Configured';
  return text.length <= MAX_CHECKPOINT_CHANGE_TEXT_LENGTH
    ? text : `${text.slice(0, MAX_CHECKPOINT_CHANGE_TEXT_LENGTH - 3)}...`;
}

function humanizeSettingKey(key: string): string {
  const text = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^adv /, '');
  return text.length === 0 ? 'Session setting' : `${text[0].toUpperCase()}${text.slice(1)}`;
}

function checkpointChangeDetails(
  beforePayload: JsonObject,
  afterPayload: JsonObject,
): { changes: JsonObject[]; changeCount: number } {
  const details: JsonObject[] = [];
  const add = (label: string, before: string, after: string): void => {
    details.push({
      label: boundedChangeText(label),
      before: boundedChangeText(before),
      after: boundedChangeText(after),
    });
  };
  const beforeSettings = isPlainObject(beforePayload.settings) ? beforePayload.settings : {};
  const afterSettings = isPlainObject(afterPayload.settings) ? afterPayload.settings : {};

  const beforeScarabs = Array.isArray(beforeSettings.scarabs) ? beforeSettings.scarabs : [];
  const afterScarabs = Array.isArray(afterSettings.scarabs) ? afterSettings.scarabs : [];
  for (let index = 0; index < Math.max(beforeScarabs.length, afterScarabs.length); index += 1) {
    const beforeValue = beforeScarabs[index];
    const afterValue = afterScarabs[index];
    const before: JsonObject = isPlainObject(beforeValue) ? beforeValue : {};
    const after: JsonObject = isPlainObject(afterValue) ? afterValue : {};
    if (valuesEqual(before, after)) continue;
    const beforeName = typeof before.name === 'string' ? before.name : '';
    const afterName = typeof after.name === 'string' ? after.name : '';
    if (beforeName && beforeName === afterName && before.cost !== after.cost) {
      add(`${beforeName} price`, boundedChangeText(before.cost, 'c'), boundedChangeText(after.cost, 'c'));
    } else {
      const scarabText = (entry: JsonObject): string => {
        const name = typeof entry.name === 'string' && entry.name ? entry.name : 'Empty';
        return name === 'Empty' ? name : `${name} — ${boundedChangeText(entry.cost, 'c')}`;
      };
      add(`Scarab slot ${index + 1}`, scarabText(before), scarabText(after));
    }
  }

  const handledSettings = new Set<string>(['scarabs', 'divinePriceQuotedAt']);
  for (const [key, label, unit] of COST_CHANGE_FIELDS) {
    handledSettings.add(key);
    if (!valuesEqual(beforeSettings[key], afterSettings[key])) {
      add(label, boundedChangeText(beforeSettings[key], unit), boundedChangeText(afterSettings[key], unit));
    }
  }
  if (!valuesEqual(beforePayload.investmentNeutralization, afterPayload.investmentNeutralization)) {
    add(
      'Investment correction',
      boundedChangeText(beforePayload.investmentNeutralization ?? 0, 'c'),
      boundedChangeText(afterPayload.investmentNeutralization ?? 0, 'c'),
    );
  }

  const addCollectionChange = (key: string, label: string): void => {
    const before = Array.isArray(beforePayload[key]) ? beforePayload[key] : [];
    const after = Array.isArray(afterPayload[key]) ? afterPayload[key] : [];
    if (valuesEqual(before, after)) return;
    add(label, `${before.length} entries`, `${after.length} entries`);
  };
  addCollectionChange('maps', 'Map log');
  addCollectionChange('lootItems', 'Return snapshot');
  addCollectionChange('baselineItems', 'Baseline snapshot');
  addCollectionChange('manualLootItems', 'Manual loot additions');

  const beforeNotes = typeof beforePayload.sessionNotes === 'string' ? beforePayload.sessionNotes : '';
  const afterNotes = typeof afterPayload.sessionNotes === 'string' ? afterPayload.sessionNotes : '';
  if (beforeNotes !== afterNotes) {
    add('Notes', beforeNotes ? `${beforeNotes.length} characters` : 'Empty',
      afterNotes ? `${afterNotes.length} characters` : 'Empty');
  }
  if (!valuesEqual(beforePayload.manualStatistics, afterPayload.manualStatistics)) {
    add('Run statistics', 'Previous values', 'Updated values');
  }
  if (!valuesEqual(beforePayload.manualRunTimer, afterPayload.manualRunTimer)) {
    add('Manual run timer', 'Previous time', 'Updated time');
  }

  const remainingSettings = new Set([...Object.keys(beforeSettings), ...Object.keys(afterSettings)]);
  for (const key of [...remainingSettings].sort()) {
    if (handledSettings.has(key) || valuesEqual(beforeSettings[key], afterSettings[key])) continue;
    let before = boundedChangeText(beforeSettings[key]);
    let after = boundedChangeText(afterSettings[key]);
    if (before === after) {
      before = 'Previous value';
      after = 'Updated value';
    }
    add(humanizeSettingKey(key), before, after);
  }

  return {
    changes: details.slice(0, MAX_CHECKPOINT_CHANGE_DETAILS),
    changeCount: details.length,
  };
}

function parseStorage(value: unknown): RepositoryStorageV1 {
  if (!isPlainObject(value) || value.repositoryVersion !== SESSION_REPOSITORY_VERSION ||
      typeof value.repositoryId !== 'string' || !isPlainObject(value.migration)) {
    throw new RepositoryRecoveryRequiredError('damaged');
  }
  const migration = value.migration;
  if (migration.state !== 'ready' && migration.state !== 'complete') {
    throw new RepositoryRecoveryRequiredError('damaged');
  }
  requireString(migration.operationId, 'migration operationId');
  requireString(migration.sourceHash, 'migration sourceHash');
  requireGeneration(migration.sourceStoreVersion, 'migration sourceStoreVersion');
  requireTimestamp(migration.createdAt, 'migration createdAt');
  requireTimestamp(migration.verifiedAt, 'migration verifiedAt');
  return value as unknown as RepositoryStorageV1;
}

async function readStorage(paths: RepositoryPaths): Promise<RepositoryStorageV1> {
  try {
    return parseStorage(JSON.parse(await readFile(paths.storage, 'utf8')));
  } catch (error) {
    if (error instanceof RepositoryRecoveryRequiredError) throw error;
    if (isMissing(error)) throw error;
    throw new RepositoryRecoveryRequiredError('damaged');
  }
}

function currentPath(directory: string): string {
  return join(directory, CURRENT_RECORD_NAME);
}

function importTransactionDirectory(root: string, operationId: string): string {
  return join(root, 'transactions', `import-${operationId}`);
}

function importTransactionEntry(directory: string, bucket: 'staged' | 'backups' | 'discarded', sessionId: string): string {
  return join(directory, bucket, sessionDirectoryName(sessionId));
}

async function syncWriteExclusive(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDirectRecordAtomically(
  root: string,
  path: string,
  backupPath: string,
  contentType: RecordContentType,
  body: JsonObject,
  policy: RepositoryReadPolicy,
): Promise<void> {
  assertPathInside(root, path);
  const bytes = await encodeRecordV1(contentType, SESSION_CONTENT_VERSION, body);
  if (bytes.byteLength > policy.maxRecordBytes) throw new Error(`${contentType} record exceeds the size limit`);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await syncWriteExclusive(temporaryPath, bytes);
  await readRepositoryRecord(temporaryPath, policy, contentType);
  if (await exists(path)) {
    if (await exists(backupPath)) await rm(backupPath, { force: true });
    await retryTransientFileOperation(() => rename(path, backupPath));
  }
  await retryTransientFileOperation(() => rename(temporaryPath, path));
}

async function directoryBytes(root: string): Promise<number> {
  let total = 0;
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) total += (await stat(path)).size;
    }
  };
  await walk(root);
  return total;
}

async function processIsAlive(pid: number): Promise<boolean> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
    return code === 'EPERM';
  }
}

export interface FileSessionRepositoryOptions {
  userDataPath: string;
  openPath: (path: string) => Promise<string>;
  readPolicy?: RepositoryReadPolicy;
  now?: () => Date;
  onImportBoundary?: (
    boundary: 'after-journal' | 'after-backup' | 'after-commit' | 'before-complete',
    index: number,
  ) => void | Promise<void>;
  onWorkflowWrite?: (workflow: RepositoryWorkflow) => void | Promise<void>;
  onSessionRead?: (target: SessionTarget) => void | Promise<void>;
  onSessionCommit?: (target: SessionTarget) => void | Promise<void>;
  onRecoveryRollback?: (recoveryDirectory: string, sourceDirectory: string) => void | Promise<void>;
}

export class FileSessionRepository implements SessionRepositoryPort {
  private readonly paths: RepositoryPaths;
  private readonly readPolicy: RepositoryReadPolicy;
  private readonly queue = new EntityOperationQueue();
  private readonly now: () => Date;
  private readonly lockPath: string;
  private readonly lockToken = randomUUID();
  private locked = false;
  private ready = false;
  private sessions = new Map<string, CatalogEntry>();
  private workflow: RepositoryWorkflow | null = null;
  private workflowGeneration: number | null = null;
  private preferencesGeneration: number | null = null;
  private layoutGeneration: number | null = null;
  private metadataWriteScheduled = false;
  private indexWritePending = false;
  private metadataWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private metadataWriteDrain: Promise<void> | null = null;

  constructor(private readonly options: FileSessionRepositoryOptions) {
    this.paths = deriveRepositoryPaths(options.userDataPath);
    this.readPolicy = options.readPolicy ?? LEGACY_MIGRATION_READ_POLICY;
    this.now = options.now ?? (() => new Date());
    this.lockPath = join(options.userDataPath, LOCK_FILE);
  }

  async acquireLock(): Promise<void> {
    if (this.locked) return;
    await mkdir(this.options.userDataPath, { recursive: true });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const body: RepositoryLockBody = {
        token: this.lockToken,
        pid: process.pid,
        startedAt: this.now().toISOString(),
      };
      try {
        await syncWriteExclusive(this.lockPath, Buffer.from(JSON.stringify(body), 'utf8'));
        this.locked = true;
        return;
      } catch (error) {
        const code = error instanceof Error && 'code' in error
          ? String((error as NodeJS.ErrnoException).code) : '';
        if (code !== 'EEXIST') throw error;
      }
      let owner: JsonObject = {};
      try {
        const parsed = JSON.parse(await readFile(this.lockPath, 'utf8')) as unknown;
        if (isPlainObject(parsed)) owner = parsed as JsonObject;
      } catch {
        owner = { invalid: true };
      }
      const ownerPid = typeof owner.pid === 'number' ? owner.pid : 0;
      if (await processIsAlive(ownerPid)) throw new SessionRepositoryLockedError(owner);
      try {
        await rename(this.lockPath, `${this.lockPath}.stale-${this.now().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    throw new SessionRepositoryLockedError({ contention: true });
  }

  async releaseLock(): Promise<void> {
    if (!this.locked) return;
    try {
      if (this.metadataWriteTimer) {
        clearTimeout(this.metadataWriteTimer);
        this.metadataWriteTimer = null;
      }
      if (this.metadataWriteScheduled) await this.ensureMetadataWrite();
      else if (this.metadataWriteDrain) await this.metadataWriteDrain;
      const current = JSON.parse(await readFile(this.lockPath, 'utf8')) as unknown;
      if (isPlainObject(current) && current.token === this.lockToken) await rm(this.lockPath);
    } catch (error) {
      if (!isMissing(error)) throw error;
    } finally {
      this.locked = false;
    }
  }

  private async requireReady(): Promise<void> {
    if (!this.ready || !this.workflow) throw new Error('Session repository bootstrap has not completed');
  }

  private parseImportJournal(value: unknown): ImportTransactionJournal {
    if (!isPlainObject(value) || value.schema !== 1 || !Array.isArray(value.actions)) {
      throw new RepositoryRecoveryRequiredError('damaged');
    }
    const operationId = requireString(value.operationId, 'import operationId');
    const conflictMode = value.conflictMode;
    if (conflictMode !== 'skip' && conflictMode !== 'overwrite') {
      throw new RepositoryRecoveryRequiredError('damaged');
    }
    const ids = new Set<string>();
    const actions = value.actions.map((raw, index) => {
      if (!isPlainObject(raw) || typeof raw.hadExisting !== 'boolean') {
        throw new RepositoryRecoveryRequiredError('damaged');
      }
      const sessionId = requireString(raw.sessionId, `import action ${index} sessionId`);
      if (ids.has(sessionId)) throw new RepositoryRecoveryRequiredError('damaged');
      ids.add(sessionId);
      return { sessionId, hadExisting: raw.hadExisting };
    });
    return {
      schema: 1,
      operationId,
      conflictMode,
      actions,
      createdAt: requireTimestamp(value.createdAt, 'import createdAt'),
    };
  }

  private async rollbackImportTransaction(
    transactionDirectory: string,
    journal: ImportTransactionJournal,
  ): Promise<void> {
    for (const action of [...journal.actions].reverse()) {
      const destination = deriveSessionDirectory(this.paths.root, action.sessionId);
      const staged = importTransactionEntry(transactionDirectory, 'staged', action.sessionId);
      const backup = importTransactionEntry(transactionDirectory, 'backups', action.sessionId);
      const discarded = importTransactionEntry(transactionDirectory, 'discarded', action.sessionId);
      const backupExists = await exists(backup);
      const stagedExists = await exists(staged);
      const destinationExists = await exists(destination);
      if (backupExists) {
        if (destinationExists) {
          await mkdir(dirname(discarded), { recursive: true });
          await retryTransientFileOperation(() => rename(destination, discarded));
        }
        await mkdir(dirname(destination), { recursive: true });
        await retryTransientFileOperation(() => rename(backup, destination));
      } else if (!action.hadExisting && !stagedExists && destinationExists) {
        await mkdir(dirname(discarded), { recursive: true });
        await retryTransientFileOperation(() => rename(destination, discarded));
      }
    }
    await rm(transactionDirectory, { recursive: true, force: true });
  }

  private async recoverImportTransactions(): Promise<void> {
    const transactions = join(this.paths.root, 'transactions');
    let entries;
    try {
      entries = await readdir(transactions, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('import-')) continue;
      const directory = join(transactions, entry.name);
      const journalPath = join(directory, 'journal.json');
      if (!(await exists(journalPath))) {
        const abandonedDirectory = join(
          transactions,
          `abandoned-${entry.name}-${this.now().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`,
        );
        await retryTransientFileOperation(() => rename(
          directory,
          abandonedDirectory,
        ));
        continue;
      }
      let journal: ImportTransactionJournal;
      try {
        journal = this.parseImportJournal(JSON.parse(await readFile(journalPath, 'utf8')));
      } catch (error) {
        if (error instanceof RepositoryRecoveryRequiredError) throw error;
        throw new RepositoryRecoveryRequiredError('damaged');
      }
      if (entry.name !== `import-${journal.operationId}`) {
        throw new RepositoryRecoveryRequiredError('damaged');
      }
      if (await exists(join(directory, 'complete.json'))) {
        await rm(directory, { recursive: true, force: true });
      } else {
        await this.rollbackImportTransaction(directory, journal);
      }
    }
  }

  private targetDirectory(target: SessionTarget): string {
    return target.kind === 'working'
      ? this.paths.working
      : this.sessions.has(target.sessionId)
        ? join(this.paths.entries, this.sessions.get(target.sessionId)!.directoryName)
        : deriveSessionDirectory(this.paths.root, target.sessionId);
  }

  private async rollbackRecoveryDirectory(
    recoveryDirectory: string,
    sourceDirectory: string,
  ): Promise<void> {
    await this.options.onRecoveryRollback?.(recoveryDirectory, sourceDirectory);
    await retryTransientFileOperation(() => rename(recoveryDirectory, sourceDirectory));
    // Recovery metadata is authoritative while the directory remains in trash.
    // Once the reverse rename succeeds it is ignored, so cleanup is best effort
    // and can never make a successful rollback ambiguous.
    try {
      await rm(join(sourceDirectory, 'recovery.json'), { force: true });
    } catch {
      // The restored source payload remains authoritative.
    }
  }

  private async moveDirectoryToTrash(
    source: string,
    metadata: JsonObject,
  ): Promise<{ recoveryId: string; destination: string }> {
    const recoveryId = randomUUID();
    const destination = join(this.paths.trash, recoveryId);
    assertPathInside(this.paths.root, source);
    assertPathInside(this.paths.root, destination);
    await mkdir(this.paths.trash, { recursive: true });
    await retryTransientFileOperation(() => rename(source, destination));
    try {
      await syncWriteExclusive(join(destination, 'recovery.json'), Buffer.from(JSON.stringify({
        schema: 1,
        recoveryId,
        deletedAt: this.now().toISOString(),
        ...metadata,
      }), 'utf8'));
    } catch (error) {
      try {
        await this.rollbackRecoveryDirectory(destination, source);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Recovery metadata write and directory rollback both failed',
        );
      }
      throw error;
    }
    return { recoveryId, destination };
  }

  private parseRecoveryMetadata(value: unknown, recoveryId: string): RecoveryMetadata {
    if (!isPlainObject(value) || value.schema !== 1 || value.recoveryId !== recoveryId) {
      throw new Error('Recovery metadata is invalid');
    }
    const sourceKind = value.sourceKind;
    if (sourceKind !== 'named' && sourceKind !== 'working' && sourceKind !== 'failed-new') {
      throw new Error('Recovery source kind is invalid');
    }
    const metadata: RecoveryMetadata = {
      schema: 1,
      recoveryId,
      deletedAt: requireTimestamp(value.deletedAt, 'recovery deletedAt'),
      sourceKind,
      displayName: requireString(value.displayName, 'recovery displayName'),
      originalGeneration: requireGeneration(value.originalGeneration, 'recovery originalGeneration'),
    };
    if (value.sessionId !== undefined) metadata.sessionId = requireString(value.sessionId, 'recovery sessionId');
    if (sourceKind !== 'working' && !metadata.sessionId) {
      throw new Error('Named recovery metadata requires a session id');
    }
    return metadata;
  }

  private async storedTrashEntries(): Promise<StoredTrashEntry[]> {
    let entries;
    try {
      entries = await readdir(this.paths.trash, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const stored: StoredTrashEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = join(this.paths.trash, entry.name);
      assertPathInside(this.paths.root, directory);
      const details = await stat(directory);
      const fallbackDeletedAt = details.mtime.toISOString();
      let metadata: RecoveryMetadata | null = null;
      try {
        metadata = this.parseRecoveryMetadata(
          JSON.parse(await readFile(join(directory, 'recovery.json'), 'utf8')),
          entry.name,
        );
      } catch {
        metadata = null;
      }
      const deletedAt = metadata?.deletedAt ?? fallbackDeletedAt;
      stored.push({
        directory,
        metadata,
        summary: {
          recoveryId: entry.name,
          deletedAt,
          expiresAt: new Date(Date.parse(deletedAt) + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          displayName: metadata?.displayName ?? 'Damaged recovery entry',
          sourceKind: metadata?.sourceKind ?? 'working',
          sessionId: metadata?.sessionId ?? null,
          bytes: await directoryBytes(directory),
          status: metadata ? 'ready' : 'damaged',
        },
      });
    }
    return stored.sort((left, right) => Date.parse(right.summary.deletedAt) - Date.parse(left.summary.deletedAt) ||
      left.summary.recoveryId.localeCompare(right.summary.recoveryId));
  }

  private async enforceTrashRetention(): Promise<StoredTrashEntry[]> {
    const entries = await this.storedTrashEntries();
    const ready = entries.filter(({ summary }) => summary.status === 'ready');
    const retention = applyTrashRetention(ready.map(({ summary }) => ({
      id: summary.recoveryId,
      deletedAt: summary.deletedAt,
      bytes: summary.bytes,
    })), this.now());
    const prunedIds = new Set(retention.pruned.map(({ entry }) => entry.id));
    for (const entry of ready) {
      if (!prunedIds.has(entry.summary.recoveryId)) continue;
      assertPathInside(this.paths.root, entry.directory);
      await rm(entry.directory, { recursive: true, force: true });
    }
    return entries.filter(({ summary }) => !prunedIds.has(summary.recoveryId));
  }

  private async readBody(target: SessionTarget): Promise<SessionBodyV1> {
    await this.options.onSessionRead?.(target);
    const recovered = await recoverRecordDirectory(this.targetDirectory(target), this.readPolicy, 'session');
    if (recovered.status === 'damaged' || recovered.status === 'unsupported') {
      throw new RepositoryRecoveryRequiredError(recovered.status);
    }
    if (!recovered.record) throw Object.assign(new Error('Session record was not found'), { code: 'ENOENT' });
    // decodeRecordV1 already validated the session body according to the
    // framed content type. Avoid rescanning large payload strings here.
    const body = recovered.record.body as SessionBodyV1;
    if (target.kind === 'working' && body.kind !== 'working') throw new Error('Working target contains a named session');
    if (target.kind === 'session' && (body.kind !== 'named' || body.id !== target.sessionId)) {
      throw new Error('Named session identity does not match its repository target');
    }
    return body;
  }

  private async readGeneric(directory: string, type: 'preferences' | 'layout' | 'bootstrap'): Promise<JsonObject> {
    const recovered = await recoverRecordDirectory(directory, this.readPolicy, type);
    if (recovered.status === 'damaged' || recovered.status === 'unsupported') {
      throw new RepositoryRecoveryRequiredError(recovered.status);
    }
    if (!recovered.record || !isPlainObject(recovered.record.body)) {
      throw new RepositoryRecoveryRequiredError('damaged');
    }
    return recovered.record.body as JsonObject;
  }

  private async catalogEntry(body: SessionBodyV1): Promise<CatalogEntry> {
    const directoryName = sessionDirectoryName(body.id as string);
    const path = currentPath(join(this.paths.entries, directoryName));
    const details = await stat(path);
    return {
      ...sessionSummary(body),
      recordBytes: details.size,
      modifiedAtMs: details.mtimeMs,
      directoryName,
    };
  }

  private sortedSessions(): RepositorySessionSummary[] {
    return [...this.sessions.values()]
      .map(({
        recordBytes: _recordBytes,
        modifiedAtMs: _modifiedAtMs,
        directoryName: _directoryName,
        ...summary
      }) => summary)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id));
  }

  private async rebuildCatalog(): Promise<void> {
    const rebuilt = new Map<string, CatalogEntry>();
    const hints = new Map<string, CatalogEntry>();
    for (const entry of this.sessions.values()) hints.set(entry.directoryName, entry);
    try {
      const index = await readFile(this.paths.index, 'utf8');
      for (const line of index.split(/\r?\n/)) {
        if (!line) continue;
        const [directoryName, rawId, rawName] = line.split('\t');
        if (!/^[a-f0-9]{64}$/.test(directoryName) || !rawId || !rawName || hints.has(directoryName)) continue;
        const id = JSON.parse(rawId) as unknown;
        const name = JSON.parse(rawName) as unknown;
        if (typeof id !== 'string' || typeof name !== 'string' || !id || !name) continue;
        hints.set(directoryName, {
          id, name,
          createdAt: this.now().toISOString(), updatedAt: this.now().toISOString(),
          generation: 0, summary: {}, status: 'damaged',
          recordBytes: 0, modifiedAtMs: 0, directoryName,
        });
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await mkdir(this.paths.entries, { recursive: true });
    const directoryEntries = await readdir(this.paths.entries, { withFileTypes: true });
    for (const directoryEntry of directoryEntries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!directoryEntry.isDirectory() || directoryEntry.isSymbolicLink()) continue;
      const name = directoryEntry.name;
      const directory = join(this.paths.entries, name);
      const recovered = await recoverRecordDirectory(directory, this.readPolicy, 'session');
      if (recovered.record) {
        try {
          assertSessionBodyV1(recovered.record.body);
          const body = recovered.record.body;
          if (body.kind !== 'named' || body.id === null || sessionDirectoryName(body.id) !== name) {
            throw new Error('identity mismatch');
          }
          rebuilt.set(body.id, await this.catalogEntry(body));
          continue;
        } catch {
          // Keep the directory visible below as a damaged recovery entry.
        }
      }
      const hint = hints.get(name);
      const fingerprintPath = await exists(currentPath(directory)) ? currentPath(directory) : directory;
      const details = await stat(fingerprintPath);
      const id = hint?.id ?? `damaged:${name}`;
      rebuilt.set(id, {
        id,
        name: hint?.name ?? `Damaged session ${name.slice(0, 8)}`,
        createdAt: hint?.createdAt ?? new Date(details.mtimeMs).toISOString(),
        updatedAt: hint?.updatedAt ?? new Date(details.mtimeMs).toISOString(),
        generation: hint?.generation ?? 0,
        summary: hint?.summary ?? {},
        status: recovered.status === 'unsupported' ? 'unsupported' : 'damaged',
        recordBytes: details.size,
        modifiedAtMs: details.mtimeMs,
        directoryName: name,
      });
    }
    this.sessions = rebuilt;
    await this.writeCatalog();
    await this.writeIndex();
  }

  private async readCatalog(): Promise<boolean> {
    if (!(await exists(this.paths.catalog))) return false;
    let decoded;
    try {
      decoded = await readRepositoryRecord(this.paths.catalog, this.readPolicy, 'catalog');
    } catch {
      return false;
    }
    if (!isPlainObject(decoded.body) || !Array.isArray(decoded.body.sessions)) return false;
    const parsed = new Map<string, CatalogEntry>();
    try {
      for (const raw of decoded.body.sessions) {
        if (!isPlainObject(raw)) return false;
        const id = requireString(raw.id, 'catalog id');
        const entry: CatalogEntry = {
          id,
          name: requireString(raw.name, 'catalog name'),
          createdAt: requireTimestamp(raw.createdAt, 'catalog createdAt'),
          updatedAt: requireTimestamp(raw.updatedAt, 'catalog updatedAt'),
          generation: requireGeneration(raw.generation, 'catalog generation'),
          summary: isPlainObject(raw.summary) ? cloneJson(raw.summary) as JsonObject : (() => { throw new Error('summary'); })(),
          status: raw.status === 'damaged' || raw.status === 'unsupported' ? raw.status : 'ready',
          recordBytes: requireGeneration(raw.recordBytes, 'catalog recordBytes'),
          modifiedAtMs: typeof raw.modifiedAtMs === 'number' && Number.isFinite(raw.modifiedAtMs)
            ? raw.modifiedAtMs : (() => { throw new Error('mtime'); })(),
          directoryName: typeof raw.directoryName === 'string' && /^[a-f0-9]{64}$/.test(raw.directoryName)
            ? raw.directoryName : sessionDirectoryName(id),
        };
        if (parsed.has(id)) return false;
        parsed.set(id, entry);
      }
      this.sessions = parsed;
      for (const entry of parsed.values()) {
        const directory = join(this.paths.entries, entry.directoryName);
        const directoryDetails = await lstat(directory);
        if (!directoryDetails.isDirectory() || directoryDetails.isSymbolicLink()) return false;
        const fingerprintPath = await exists(currentPath(directory)) ? currentPath(directory) : directory;
        const details = await stat(fingerprintPath);
        if (details.size !== entry.recordBytes || details.mtimeMs !== entry.modifiedAtMs) return false;
      }
      const directoryCount = (await readdir(this.paths.entries, { withFileTypes: true })).filter((entry) => entry.isDirectory()).length;
      if (directoryCount !== parsed.size) return false;
    } catch {
      return false;
    }
    this.sessions = parsed;
    return true;
  }

  private async writeCatalog(): Promise<void> {
    let generation = 1;
    if (await exists(this.paths.catalog)) {
      try {
        const prior = await readRepositoryRecord(this.paths.catalog, this.readPolicy, 'catalog');
        if (isPlainObject(prior.body)) generation = requireGeneration(prior.body.generation, 'catalog generation') + 1;
      } catch {
        generation = 1;
      }
    }
    const body: JsonObject = {
      generation,
      sessions: [...this.sessions.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((entry) => ({ ...entry })),
    };
    await writeDirectRecordAtomically(
      this.paths.root,
      this.paths.catalog,
      join(this.paths.root, CATALOG_BACKUP_FILE),
      'catalog',
      body,
      this.readPolicy,
    );
  }

  private async writeIndex(): Promise<void> {
    const lines = [...this.sessions.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => `${entry.directoryName}\t${JSON.stringify(entry.id)}\t${JSON.stringify(entry.name)}`);
    const temporary = `${this.paths.index}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${lines.join('\n')}\n`, 'utf8');
    await retryTransientFileOperation(async () => {
      if (await exists(this.paths.index)) await rm(this.paths.index);
      await rename(temporary, this.paths.index);
    });
  }

  /**
   * Catalog and INDEX are rebuildable metadata, not part of an entity's
   * durability acknowledgement. Queue one trailing write so a successful
   * current.wlrec commit cannot be reported as failed merely because this
   * cache update was interrupted.
   */
  private scheduleMetadataWrite(includeIndex = false): void {
    this.indexWritePending ||= includeIndex;
    if (this.metadataWriteScheduled) return;
    this.metadataWriteScheduled = true;
    this.metadataWriteTimer = setTimeout(() => {
      this.metadataWriteTimer = null;
      void this.ensureMetadataWrite();
    }, 0);
  }

  private ensureMetadataWrite(): Promise<void> {
    if (!this.metadataWriteDrain) {
      const task = this.queue.enqueue('repository', async () => {
        const writeIndex = this.indexWritePending;
        this.indexWritePending = false;
        try {
          await this.writeCatalog();
          if (writeIndex) await this.writeIndex();
        } catch (error) {
          // The authoritative record already committed. Bootstrap can rebuild
          // stale metadata; retain the INDEX request for the next mutation.
          this.indexWritePending ||= writeIndex;
          console.error('[Session repository] Metadata refresh failed:', error);
        }
      });
      this.metadataWriteDrain = task.finally(() => {
        this.metadataWriteDrain = null;
        this.metadataWriteScheduled = false;
      });
    }
    return this.metadataWriteDrain;
  }

  private async writeWorkflow(workflow: RepositoryWorkflow, expectedGeneration: number): Promise<number> {
    await this.options.onWorkflowWrite?.(workflow);
    const current = await this.readGeneric(this.paths.bootstrap, 'bootstrap');
    const body: JsonObject = {
      ...current,
      ...cloneJson(workflow),
      generation: expectedGeneration + 1,
      pendingSave: false,
      captureEnabled: false,
    };
    const result = await commitRecordAtomically({
      directory: this.paths.bootstrap,
      entityKey: 'bootstrap',
      operationId: randomUUID(),
      contentType: 'bootstrap',
      contentVersion: SESSION_CONTENT_VERSION,
      body,
      expectedGeneration,
    }, { root: this.paths.root, readPolicy: this.readPolicy });
    this.workflow = workflow;
    this.workflowGeneration = result.generation;
    return result.generation;
  }

  private async ensureRepository(plan?: LegacyMigrationPlanV1): Promise<RepositoryStorageV1> {
    const rootExists = await exists(this.paths.root);
    const storageExists = await exists(this.paths.storage);
    if (!storageExists) {
      if (rootExists && (await readdir(this.paths.root)).length > 0) {
        throw new RepositoryRecoveryRequiredError('damaged');
      }
      if (!plan) throw new SessionRepositoryMigrationRequiredError();
      await migrateLegacyProfileClone({ userDataPath: this.options.userDataPath, plan, readPolicy: this.readPolicy });
    }
    let storage = await readStorage(this.paths);
    if (storage.migration.state === 'ready') {
      if (!plan) {
        throw new SessionRepositoryMigrationRequiredError({
          repositoryId: storage.repositoryId,
          operationId: storage.migration.operationId,
          createdAt: storage.migration.createdAt,
          sourceHash: storage.migration.sourceHash,
        });
      }
      await migrateLegacyProfileClone({ userDataPath: this.options.userDataPath, plan, readPolicy: this.readPolicy });
      storage = await readStorage(this.paths);
    }
    if (storage.migration.state === 'complete' && plan) {
      await migrateLegacyProfileClone({ userDataPath: this.options.userDataPath, plan, readPolicy: this.readPolicy });
      storage = await readStorage(this.paths);
    }
    if (storage.migration.state !== 'complete') throw new RepositoryRecoveryRequiredError('damaged');
    return storage;
  }

  async bootstrap(request: RequestFor<'bootstrap'>): Promise<SessionRepositoryDataMap['bootstrap']> {
    await this.acquireLock();
    const storage = await this.ensureRepository(request.migrationPlan);
    await this.recoverImportTransactions();
    const preferencesBody = await this.readGeneric(this.paths.preferences, 'preferences');
    const layoutBody = await this.readGeneric(this.paths.layout, 'layout');
    const bootstrapBody = await this.readGeneric(this.paths.bootstrap, 'bootstrap');
    this.preferencesGeneration = requireGeneration(preferencesBody.generation, 'preferences generation');
    this.layoutGeneration = requireGeneration(layoutBody.generation, 'layout generation');
    this.workflowGeneration = requireGeneration(bootstrapBody.generation, 'bootstrap generation');
    this.workflow = parseWorkflow(bootstrapBody);
    if (!(await this.readCatalog())) await this.rebuildCatalog();

    // Validate the viewed target before exposing editable state. A missing or
    // damaged viewed target falls back without deleting either persisted ID.
    try {
      await this.readBody(this.workflow.viewedTarget);
    } catch (viewedError) {
      if (!isRecoverableTargetReadFailure(viewedError)) throw viewedError;
      try {
        await this.readBody(this.workflow.activeTarget);
        this.workflow = { ...this.workflow, viewedTarget: this.workflow.activeTarget, suspended: false };
      } catch (activeError) {
        if (!isRecoverableTargetReadFailure(activeError)) throw activeError;
        await this.readBody({ kind: 'working' });
        this.workflow = {
          ...this.workflow,
          activeTarget: { kind: 'working' },
          viewedTarget: { kind: 'working' },
          lifecycle: 'live',
          suspended: false,
        };
      }
      await this.writeWorkflow(this.workflow, this.workflowGeneration);
    }
    this.ready = true;
    return {
      sessions: this.sortedSessions(),
      workflow: this.workflow,
      workflowGeneration: this.workflowGeneration,
      preferences: withoutGeneration(preferencesBody),
      preferencesGeneration: this.preferencesGeneration,
      layout: withoutGeneration(layoutBody),
      layoutGeneration: this.layoutGeneration,
      repositorySizeBytes: await directoryBytes(this.paths.root),
      migrationCleanup: {
        sourceHash: storage.migration.sourceHash,
        keys: [LEGACY_STORE_STORAGE_KEY, LEGACY_LAYOUT_STORAGE_KEY, LEGACY_CHANGELOG_STORAGE_KEY],
        repositoryId: storage.repositoryId,
        operationId: storage.migration.operationId,
        createdAt: storage.migration.createdAt,
        sourceStoreVersion: storage.migration.sourceStoreVersion,
      },
    };
  }

  async list(_request: RequestFor<'list'>): Promise<SessionRepositoryDataMap['list']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => ({
      sessions: this.sortedSessions(),
      repositorySizeBytes: await directoryBytes(this.paths.root),
    }));
  }

  async load(request: RequestFor<'load'>): Promise<SessionRepositoryDataMap['load']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const body = await this.readBody(request.target);
      if (request.mode !== 'inspect') {
        const activeTarget = request.mode === 'resume' ? request.target : this.workflow!.activeTarget;
        const workflow: RepositoryWorkflow = {
          ...this.workflow!,
          activeTarget,
          viewedTarget: request.target,
          lifecycle: request.mode === 'resume' ? 'live' : 'historical',
          suspended: request.mode === 'view',
          activationId: randomUUID(),
        };
        await this.writeWorkflow(workflow, this.workflowGeneration!);
      }
      return {
        target: request.target,
        generation: body.generation,
        payload: cloneJson(body.payload),
        workflow: this.workflow!,
        workflowGeneration: this.workflowGeneration!,
      };
    });
  }

  private async saveGeneric(
    target: Extract<SessionSaveTarget, { kind: 'preferences' | 'layout' | 'bootstrap' }>,
    expectedGeneration: number | null,
    payload: JsonObject,
  ): Promise<SessionRepositoryDataMap['save']> {
    if (expectedGeneration === null) throw new GenerationConflictError(null, 0);
    if (target.kind === 'bootstrap') {
      const workflow = parseWorkflow(payload);
      const generation = await this.writeWorkflow(workflow, expectedGeneration);
      return {
        target,
        generation,
        summary: null,
        workflow: this.workflow!,
        workflowGeneration: this.workflowGeneration!,
        checkpoint: null,
        historyStoragePressure: false,
      };
    }
    const directory = target.kind === 'preferences' ? this.paths.preferences : this.paths.layout;
    const body: JsonObject = { ...cloneJson(payload), generation: expectedGeneration + 1 };
    const result = await commitRecordAtomically({
      directory,
      entityKey: target.kind,
      operationId: randomUUID(),
      contentType: target.kind,
      contentVersion: SESSION_CONTENT_VERSION,
      body,
      expectedGeneration,
    }, { root: this.paths.root, readPolicy: this.readPolicy });
    if (target.kind === 'preferences') this.preferencesGeneration = result.generation;
    else this.layoutGeneration = result.generation;
    return {
      target,
      generation: result.generation,
      summary: null,
      workflow: this.workflow!,
      workflowGeneration: this.workflowGeneration!,
      checkpoint: null,
      historyStoragePressure: false,
    };
  }

  async save(request: RequestFor<'save'>): Promise<SessionRepositoryDataMap['save']> {
    await this.requireReady();
    if (request.target.kind === 'preferences' || request.target.kind === 'layout' || request.target.kind === 'bootstrap') {
      return this.queue.enqueue('repository', () => this.saveGeneric(
        request.target as Extract<SessionSaveTarget, { kind: 'preferences' | 'layout' | 'bootstrap' }>,
        request.expectedGeneration,
        request.payload,
      ));
    }
    return this.queue.enqueue('repository', async () => {
      const now = this.now().toISOString();
      let target: SessionTarget;
      let prior: SessionBodyV1 | null = null;
      let id: string | null = null;
      let name: string | null = null;
      let createdAt = now;
      if (request.target.kind === 'new') {
        target = { kind: 'session', sessionId: randomUUID() };
        id = target.sessionId;
        name = requireString(request.target.name, 'session name');
      } else {
        target = request.target as SessionTarget;
        try {
          prior = await this.readBody(target);
        } catch (error) {
          if (!(request.target.kind === 'working' && request.expectedGeneration === null && isMissing(error))) throw error;
        }
        if (target.kind === 'session') {
          id = target.sessionId;
          name = prior?.name ?? this.sessions.get(id)?.name ?? null;
        }
        createdAt = prior?.createdAt ?? now;
      }
      const actualGeneration = prior?.generation ?? null;
      if (actualGeneration !== request.expectedGeneration) {
        throw new GenerationConflictError(request.expectedGeneration, actualGeneration);
      }
      const semanticHash = await computeSemanticHash(request.payload);
      let replacementRecovery: { recoveryId: string; destination: string } | null = null;
      if (target.kind === 'working' && request.replacement === true && prior &&
          !prior.freshEmptyWorking && prior.semanticHash !== semanticHash) {
        let preservedAsNamed = false;
        if (this.workflow!.activeTarget.kind === 'session') {
          try {
            const activeNamed = await this.readBody(this.workflow!.activeTarget);
            preservedAsNamed = activeNamed.semanticHash === prior.semanticHash;
          } catch (error) {
            if (!isRecoverableTargetReadFailure(error)) throw error;
            preservedAsNamed = false;
          }
        }
        if (!preservedAsNamed) {
          await this.writeCheckpoint(target, prior, 'destructive', {
            activationId: prior.activationId,
            afterSummary: summarizePayload(request.payload),
            afterPayload: request.payload,
            activationBaselineCheckpointId: prior.activationBaselineCheckpointId,
          });
          replacementRecovery = await this.moveDirectoryToTrash(this.paths.working, {
            sourceKind: 'working',
            displayName: `Unnamed session — ${now.slice(0, 16).replace('T', ' ')}`,
            originalGeneration: prior.generation,
          });
          prior = null;
          createdAt = now;
        }
      }
      const commitExpectedGeneration = prior?.generation ?? null;
      const generation = (commitExpectedGeneration ?? 0) + 1;
      const nextSummary = summarizePayload(request.payload);
      const semanticChanged = prior !== null && prior.semanticHash !== semanticHash;
      let activationId = prior?.activationId;
      let activationBaselineCheckpointId = prior?.activationBaselineCheckpointId;
      let lastCheckpointAt = prior?.lastCheckpointAt;
      let historyStoragePressure = prior?.historyStoragePressure ?? false;
      let checkpoint: RepositoryCheckpointSummary | null = null;
      if (!prior && request.activationId) {
        activationId = request.activationId;
        lastCheckpointAt = now;
      } else if (prior && semanticChanged) {
        if (prior.freshEmptyWorking) {
          // A fresh empty working slot is infrastructure, not authored work.
          // Replacing or making its first meaningful edit must not manufacture
          // a recovery promise for the empty placeholder.
          activationId = request.activationId ?? prior.activationId;
          activationBaselineCheckpointId = undefined;
          lastCheckpointAt = now;
        } else {
          const startsActivation = !!request.activationId && prior.activationId !== request.activationId;
          const periodicDue = !!request.activationId && prior.activationId === request.activationId &&
            !!prior.lastCheckpointAt && Date.parse(now) - Date.parse(prior.lastCheckpointAt) >=
              PERIODIC_CHECKPOINT_INTERVAL_MS;
          const checkpointReason = request.checkpointReason ??
            (startsActivation ? 'activation' : periodicDue ? 'periodic' : null);
          if (checkpointReason) {
            const checkpointResult = await this.writeCheckpoint(target, prior, checkpointReason, {
              ...(request.activationId ? { activationId: request.activationId } : {}),
              afterSummary: nextSummary,
              afterPayload: request.payload,
              activationBaselineCheckpointId,
              pinAsActivationBaseline: startsActivation,
              optional: checkpointReason === 'periodic',
            });
            checkpoint = checkpointResult.checkpoint;
            historyStoragePressure = checkpointResult.historyStoragePressure;
            if (checkpointResult.checkpointAt) lastCheckpointAt = checkpointResult.checkpointAt;
            if (startsActivation) {
              if (!checkpoint) throw new Error('Activation baseline was not retained');
              activationId = request.activationId;
              activationBaselineCheckpointId = checkpoint.id;
            }
          }
        }
      }
      const body: SessionBodyV1 = {
        kind: target.kind === 'working' ? 'working' : 'named',
        id,
        name,
        createdAt,
        updatedAt: now,
        generation,
        semanticHash,
        summary: nextSummary,
        payload: cloneJson(request.payload),
        ...(activationId ? { activationId } : {}),
        ...(activationBaselineCheckpointId ? { activationBaselineCheckpointId } : {}),
        ...(lastCheckpointAt ? { lastCheckpointAt } : {}),
        historyStoragePressure,
        ...((request.freshEmptyWorking === true || (prior?.freshEmptyWorking === true && !semanticChanged))
          ? { freshEmptyWorking: true as const } : {}),
      };
      let result: Awaited<ReturnType<typeof commitRecordAtomically>>;
      try {
        await this.options.onSessionCommit?.(target);
        result = await commitRecordAtomically({
          directory: this.targetDirectory(target),
          entityKey: target.kind === 'working' ? 'working' : target.sessionId,
          operationId: randomUUID(),
          contentType: 'session',
          contentVersion: SESSION_CONTENT_VERSION,
          body,
          expectedGeneration: commitExpectedGeneration,
        }, {
          root: this.paths.root,
          readPolicy: this.readPolicy,
          // readBody recovered and validated this target in the same exclusive
          // queue. New UUID targets still take the full defensive scan.
          ...(request.target.kind !== 'new'
            ? { prevalidatedGeneration: commitExpectedGeneration }
            : {}),
        });
      } catch (error) {
        if (replacementRecovery && !(await exists(this.paths.working))) {
          try {
            await this.rollbackRecoveryDirectory(replacementRecovery.destination, this.paths.working);
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              'Working replacement and its recovery rollback both failed',
            );
          }
        }
        throw error;
      }

      let summary: RepositorySessionSummary | null = null;
      if (target.kind === 'session') {
        const committed = result.record.body as SessionBodyV1;
        const entry = await this.catalogEntry(committed);
        this.sessions.set(target.sessionId, entry);
        summary = sessionSummary(committed);
      }
      if (request.target.kind === 'new') {
        if (target.kind !== 'session') throw new Error('New session target was not generated');
        const workflow: RepositoryWorkflow = {
          ...this.workflow!,
          activeTarget: target,
          viewedTarget: target,
          suspended: false,
        };
        try {
          await this.writeWorkflow(workflow, this.workflowGeneration!);
        } catch (error) {
          // The destination committed first by design. If the pointer cannot
          // follow it, move that unacknowledged copy into recovery so Retry
          // cannot create an invisible duplicate live entry.
          try {
            await this.moveDirectoryToTrash(this.targetDirectory(target), {
              sourceKind: 'failed-new',
              sessionId: target.sessionId,
              displayName: name ?? target.sessionId,
              originalGeneration: result.generation,
            });
            this.sessions.delete(target.sessionId);
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'New session committed but its workflow pointer and recovery rollback both failed');
          }
          throw error;
        }
      }
      if (target.kind === 'session') this.scheduleMetadataWrite(request.target.kind === 'new');
      return {
        target,
        generation: result.generation,
        summary,
        workflow: this.workflow!,
        workflowGeneration: this.workflowGeneration!,
        checkpoint,
        historyStoragePressure,
      };
    });
  }

  async rename(request: RequestFor<'rename'>): Promise<SessionRepositoryDataMap['rename']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const target = { kind: 'session', sessionId: request.sessionId } as const;
      const prior = await this.readBody(target);
      if (prior.generation !== request.expectedGeneration) {
        throw new GenerationConflictError(request.expectedGeneration, prior.generation);
      }
      const name = requireString(request.name, 'session name');
      const body: SessionBodyV1 = { ...prior, name, updatedAt: this.now().toISOString(), generation: prior.generation + 1 };
      const result = await commitRecordAtomically({
        directory: this.targetDirectory(target),
        entityKey: request.sessionId,
        operationId: randomUUID(),
        contentType: 'session',
        contentVersion: SESSION_CONTENT_VERSION,
        body,
        expectedGeneration: prior.generation,
      }, { root: this.paths.root, readPolicy: this.readPolicy });
      this.sessions.set(request.sessionId, await this.catalogEntry(result.record.body as SessionBodyV1));
      this.scheduleMetadataWrite(true);
      return { sessionId: request.sessionId, generation: result.generation, name, sessions: this.sortedSessions() };
    });
  }

  async delete(request: RequestFor<'delete'>): Promise<SessionRepositoryDataMap['delete']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const target = { kind: 'session', sessionId: request.sessionId } as const;
      const body = await this.readBody(target);
      if (body.generation !== request.expectedGeneration) {
        throw new GenerationConflictError(request.expectedGeneration, body.generation);
      }
      if (sameTarget(this.workflow!.activeTarget, target) || sameTarget(this.workflow!.viewedTarget, target)) {
        try {
          await this.readBody({ kind: 'working' });
        } catch (error) {
          if (!isRecoverableTargetReadFailure(error)) throw error;
          throw new Error('Create a valid working session before removing the currently open named session');
        }
      }
      const sourceDirectory = this.targetDirectory(target);
      await this.writeCheckpoint(target, body, 'destructive', {
        activationId: body.activationId,
        activationBaselineCheckpointId: body.activationBaselineCheckpointId,
      });
      const recovery = await this.moveDirectoryToTrash(sourceDirectory, {
        sourceKind: 'named',
        sessionId: request.sessionId,
        displayName: body.name ?? request.sessionId,
        originalGeneration: body.generation,
      });
      const { recoveryId } = recovery;
      this.sessions.delete(request.sessionId);
      if (sameTarget(this.workflow!.activeTarget, target) || sameTarget(this.workflow!.viewedTarget, target)) {
        const workflow: RepositoryWorkflow = {
          ...this.workflow!,
          activeTarget: { kind: 'working' },
          viewedTarget: { kind: 'working' },
          lifecycle: 'live',
          suspended: false,
          activationId: randomUUID(),
        };
        try {
          await this.writeWorkflow(workflow, this.workflowGeneration!);
        } catch (error) {
          try {
            await this.rollbackRecoveryDirectory(recovery.destination, sourceDirectory);
            this.sessions.set(request.sessionId, await this.catalogEntry(body));
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Session moved to recovery but its workflow update and rollback both failed');
          }
          throw error;
        }
      }
      this.scheduleMetadataWrite(true);
      return {
        sessionId: request.sessionId,
        recoveryId,
        sessions: this.sortedSessions(),
        workflow: this.workflow!,
        workflowGeneration: this.workflowGeneration!,
      };
    });
  }

  async trashList(_request: RequestFor<'trash-list'>): Promise<SessionRepositoryDataMap['trash-list']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      await this.enforceTrashRetention();
      await this.enforceGlobalRecoveryRetention();
      return { entries: (await this.storedTrashEntries()).map(({ summary }) => summary) };
    });
  }

  async trashRestore(request: RequestFor<'trash-restore'>): Promise<SessionRepositoryDataMap['trash-restore']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const entry = (await this.storedTrashEntries())
        .find(({ summary }) => summary.recoveryId === request.recoveryId);
      if (!entry) throw Object.assign(new Error('Recently Deleted entry was not found'), { code: 'ENOENT' });
      if (!entry.metadata) throw new RepositoryRecoveryRequiredError('damaged');
      const recovered = await recoverRecordDirectory(entry.directory, this.readPolicy, 'session');
      if (!recovered.record || recovered.status === 'damaged' || recovered.status === 'unsupported') {
        throw new RepositoryRecoveryRequiredError(recovered.status === 'unsupported' ? 'unsupported' : 'damaged');
      }
      assertSessionBodyV1(recovered.record.body);
      let body = recovered.record.body;
      let restoredSessionId = body.kind === 'working' ? randomUUID() : body.id as string;
      let destination = deriveSessionDirectory(this.paths.root, restoredSessionId);
      while (this.sessions.has(restoredSessionId) || await exists(destination)) {
        restoredSessionId = randomUUID();
        destination = deriveSessionDirectory(this.paths.root, restoredSessionId);
      }
      if (body.kind === 'working' || body.id !== restoredSessionId) {
        const namedBody: SessionBodyV1 = {
          ...body,
          kind: 'named',
          id: restoredSessionId,
          name: body.kind === 'working' ? entry.metadata.displayName : body.name,
          updatedAt: this.now().toISOString(),
          generation: body.generation + 1,
        };
        const converted = await commitRecordAtomically({
          directory: entry.directory,
          entityKey: restoredSessionId,
          operationId: randomUUID(),
          contentType: 'session',
          contentVersion: SESSION_CONTENT_VERSION,
          body: namedBody,
          expectedGeneration: body.generation,
        }, { root: this.paths.root, readPolicy: this.readPolicy });
        body = converted.record.body as SessionBodyV1;
      }
      const currentDetails = await stat(currentPath(entry.directory));
      const restoredCatalogEntry: CatalogEntry = {
        ...sessionSummary(body),
        recordBytes: currentDetails.size,
        modifiedAtMs: currentDetails.mtimeMs,
        directoryName: sessionDirectoryName(restoredSessionId),
      };
      await retryTransientFileOperation(() => rename(entry.directory, destination));
      // The directory move is the durable restore boundary. Recovery metadata
      // is ignored outside trash, so a cleanup failure must not turn a
      // successful restore into an ambiguous error for the renderer.
      try {
        await rm(join(destination, 'recovery.json'), { force: true });
      } catch {
        // Best-effort cleanup only; the restored session remains authoritative.
      }
      this.sessions.set(restoredSessionId, restoredCatalogEntry);
      this.scheduleMetadataWrite(true);
      return {
        recoveryId: request.recoveryId,
        restoredSessionId,
        sessions: this.sortedSessions(),
      };
    });
  }

  async trashDelete(request: RequestFor<'trash-delete'>): Promise<SessionRepositoryDataMap['trash-delete']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const directory = join(this.paths.trash, request.recoveryId);
      assertPathInside(this.paths.trash, directory);
      if (!(await exists(directory))) {
        throw Object.assign(new Error('Recently Deleted entry was not found'), { code: 'ENOENT' });
      }
      await rm(directory, { recursive: true, force: false });
      await this.enforceTrashRetention();
      await this.enforceGlobalRecoveryRetention();
      return {
        recoveryId: request.recoveryId,
        entries: (await this.storedTrashEntries()).map(({ summary }) => summary),
      };
    });
  }

  private async versionRecordsInDirectory(targetDirectory: string): Promise<StoredVersionRecord[]> {
    const directory = join(targetDirectory, 'versions');
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const records: StoredVersionRecord[] = [];
    for (const name of names.sort()) {
      if (!name.endsWith('.wlrec') && !name.endsWith('.wlrec.gz')) continue;
      const path = join(directory, name);
      const bytes = new Uint8Array(await readFile(path));
      const decoded = await decodeRecordV1(name.endsWith('.gz') ? new Uint8Array(await gunzipAsync(bytes)) : bytes);
      if (decoded.header.contentType !== 'session') continue;
      assertSessionBodyV1(decoded.body);
      records.push({
        path,
        body: decoded.body,
        contentVersion: decoded.header.contentVersion,
        compressedBytes: name.endsWith('.gz') ? bytes.byteLength : (await gzipAsync(bytes)).byteLength,
      });
    }
    return records;
  }

  private versionRecords(target: SessionTarget): Promise<StoredVersionRecord[]> {
    return this.versionRecordsInDirectory(this.targetDirectory(target));
  }

  private checkpointSummary(
    body: SessionBodyV1,
    activationBaselineCheckpointId: string | undefined,
  ): RepositoryCheckpointSummary {
    if (!body.checkpoint) throw new Error('Checkpoint metadata is missing');
    return {
      id: body.checkpoint.id,
      createdAt: body.checkpoint.at,
      reason: body.checkpoint.reason,
      summary: cloneJson(body.checkpoint.summary),
      afterSummary: body.checkpoint.afterSummary ? cloneJson(body.checkpoint.afterSummary) : null,
      changes: (body.checkpoint.changes ?? []).map((change) => ({
        label: String(change.label),
        before: String(change.before),
        after: String(change.after),
      })),
      changeCount: body.checkpoint.changeCount ?? body.checkpoint.changes?.length ?? 0,
      isActivationBaseline: body.checkpoint.id === activationBaselineCheckpointId,
    };
  }

  private retentionForVersions(
    records: readonly StoredVersionRecord[],
    activationBaselineCheckpointId: string | undefined,
  ): VersionRetentionResult {
    return applyVersionRetention(records.flatMap((record) => record.body.checkpoint ? [{
      id: record.body.checkpoint.id,
      createdAt: record.body.checkpoint.at,
      compressedBytes: record.compressedBytes,
      reason: record.body.checkpoint.reason,
      isCurrentActivationBaseline: record.body.checkpoint.id === activationBaselineCheckpointId,
    }] : []));
  }

  private async pruneVersions(
    records: readonly StoredVersionRecord[],
    activationBaselineCheckpointId: string | undefined,
  ): Promise<VersionRetentionResult> {
    const retention = this.retentionForVersions(records, activationBaselineCheckpointId);
    const pathsById = new Map(records.flatMap((record) => record.body.checkpoint
      ? [[record.body.checkpoint.id, record.path] as const] : []));
    for (const { entry } of retention.pruned) {
      const path = pathsById.get(entry.id);
      if (!path) continue;
      assertPathInside(this.paths.root, path);
      await rm(path, { force: true });
    }
    return retention;
  }

  private activeBaselineFor(target: SessionTarget, body: SessionBodyV1): string | undefined {
    return sameTarget(this.workflow!.viewedTarget, target) && body.activationId === this.workflow!.activationId
      ? body.activationBaselineCheckpointId : undefined;
  }

  private globalVersionClass(
    entry: VersionRetentionResult['kept'][number],
  ): GlobalRecoveryClass {
    if (entry.reason === 'current-activation-baseline' || entry.reason === 'protected-destructive' ||
        entry.reason === 'recovery-promise-over-budget') return 'promised-recovery';
    if (entry.entry.reason === 'periodic') return 'periodic';
    if (entry.entry.reason === 'activation') return 'ordinary-activation';
    return 'excess-protected';
  }

  private async enforceGlobalRecoveryRetention(
    promisedCheckpointId?: string,
  ): Promise<GlobalRetentionResult> {
    const candidates: Parameters<typeof applyGlobalRecoveryRetention>[0][number][] = [];
    const paths = new Map<string, { path: string; directory: boolean }>();
    const targets: SessionTarget[] = [{ kind: 'working' }];
    for (const session of this.sessions.values()) {
      if (session.status === 'ready') targets.push({ kind: 'session', sessionId: session.id });
    }
    for (const target of targets) {
      try {
        const body = await this.readBody(target);
        const records = await this.versionRecords(target);
        const retention = this.retentionForVersions(records, this.activeBaselineFor(target, body));
        const recordsById = new Map(records.flatMap((record) => record.body.checkpoint
          ? [[record.body.checkpoint.id, record] as const] : []));
        for (const kept of retention.kept) {
          const record = recordsById.get(kept.entry.id);
          if (!record) continue;
          const id = `version:${kept.entry.id}`;
          candidates.push({
            id,
            createdAt: kept.entry.createdAt,
            bytes: kept.entry.compressedBytes,
            classification: kept.entry.id === promisedCheckpointId
              ? 'promised-recovery' : this.globalVersionClass(kept),
          });
          paths.set(id, { path: record.path, directory: false });
        }
      } catch {
        // Damaged entries remain visible and untouched; retention must not turn
        // a diagnosable recovery problem into silent deletion.
      }
    }
    const expiryBoundary = this.now().getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const entry of await this.storedTrashEntries()) {
      if (entry.summary.status !== 'ready') continue;
      const id = `trash:${entry.summary.recoveryId}`;
      candidates.push({
        id,
        createdAt: entry.summary.deletedAt,
        bytes: entry.summary.bytes,
        classification: Date.parse(entry.summary.deletedAt) <= expiryBoundary ? 'expired-trash' : 'trash',
      });
      paths.set(id, { path: entry.directory, directory: true });
    }
    const retention = applyGlobalRecoveryRetention(candidates);
    for (const { entry } of retention.pruned) {
      const stored = paths.get(entry.id);
      if (!stored) continue;
      assertPathInside(this.paths.root, stored.path);
      await rm(stored.path, stored.directory
        ? { recursive: true, force: true }
        : { force: true });
    }
    return retention;
  }

  async historyList(request: RequestFor<'history-list'>): Promise<SessionRepositoryDataMap['history-list']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const current = await this.readBody(request.target);
      const currentActivationBaseline = this.activeBaselineFor(request.target, current);
      const localRetention = await this.pruneVersions(
        await this.versionRecords(request.target),
        currentActivationBaseline,
      );
      const globalRetention = await this.enforceGlobalRecoveryRetention();
      // Global retention can remove checkpoints from this target, so build the
      // response from a fresh directory read instead of the pre-prune snapshot.
      const records = await this.versionRecords(request.target);
      const checkpoints: RepositoryCheckpointSummary[] = records
        .flatMap(({ body }) => body.checkpoint ? [{
          ...this.checkpointSummary(body, currentActivationBaseline),
        }] : [])
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      return {
        target: request.target,
        checkpoints,
        historyStoragePressure: localRetention.storagePressure || globalRetention.storagePressure,
      };
    });
  }

  private async writeCheckpointInDirectory(
    directory: string,
    body: SessionBodyV1,
    reason: CheckpointReason,
    options: {
      activationId?: string;
      afterSummary?: JsonObject;
      afterPayload?: JsonObject;
      activationBaselineCheckpointId?: string;
      pinAsActivationBaseline?: boolean;
      optional?: boolean;
    } = {},
  ): Promise<CheckpointWriteResult> {
    const checkpointAt = this.now().toISOString();
    const afterSemanticHash = options.afterPayload
      ? await computeSemanticHash(options.afterPayload)
      : undefined;
    const records = await this.versionRecordsInDirectory(directory);
    let selected = records.find((record) => (
      record.contentVersion === SESSION_CONTENT_VERSION &&
      record.body.semanticHash === body.semanticHash &&
      record.body.checkpoint?.reason === reason &&
      record.body.checkpoint.activationId === options.activationId &&
      record.body.checkpoint.afterSemanticHash === afterSemanticHash
    ));
    const existingRetention = this.retentionForVersions(records, options.activationBaselineCheckpointId);
    if (!selected && options.optional && existingRetention.refuseOptionalCheckpoints) {
      return { checkpoint: null, checkpointAt: null, historyStoragePressure: true };
    }
    if (!selected) {
      const checkpointId = randomUUID();
      const detail = options.afterPayload
        ? checkpointChangeDetails(body.payload, options.afterPayload)
        : { changes: [], changeCount: 0 };
      const checkpoint: SessionBodyV1 = {
        ...body,
        checkpoint: {
          id: checkpointId,
          at: checkpointAt,
          reason,
          ...(options.activationId ? { activationId: options.activationId } : {}),
          ...(afterSemanticHash ? { afterSemanticHash } : {}),
          summary: cloneJson(body.summary),
          ...(options.afterSummary ? { afterSummary: cloneJson(options.afterSummary) } : {}),
          ...(detail.changeCount > 0 ? {
            changes: detail.changes.map((change) => cloneJson(change)),
            changeCount: detail.changeCount,
          } : {}),
        },
      };
      const bytes = await encodeRecordV1('session', SESSION_CONTENT_VERSION, checkpoint);
      const compressed = await gzipAsync(bytes);
      const versions = join(directory, 'versions');
      await mkdir(versions, { recursive: true });
      const path = join(versions, `${createHash('sha256').update(checkpointId).digest('hex')}.wlrec.gz`);
      await syncWriteExclusive(path, compressed);
      selected = {
        path,
        body: checkpoint,
        contentVersion: SESSION_CONTENT_VERSION,
        compressedBytes: compressed.byteLength,
      };
      records.push(selected);
    }
    const selectedId = selected.body.checkpoint?.id;
    if (!selectedId) throw new Error('Stored checkpoint is missing its identity');
    const activationBaselineCheckpointId = options.pinAsActivationBaseline
      ? selectedId : options.activationBaselineCheckpointId;
    const retention = await this.pruneVersions(records, activationBaselineCheckpointId);
    const keptIds = new Set(retention.kept.map(({ entry }) => entry.id));
    return {
      checkpoint: keptIds.has(selectedId)
        ? this.checkpointSummary(selected.body, activationBaselineCheckpointId) : null,
      checkpointAt,
      historyStoragePressure: retention.storagePressure,
    };
  }

  private async writeCheckpoint(
    target: SessionTarget,
    body: SessionBodyV1,
    reason: CheckpointReason,
    options?: Parameters<FileSessionRepository['writeCheckpointInDirectory']>[3],
  ): Promise<CheckpointWriteResult> {
    const result = await this.writeCheckpointInDirectory(this.targetDirectory(target), body, reason, options);
    const globalRetention = await this.enforceGlobalRecoveryRetention(
      options?.pinAsActivationBaseline ? result.checkpoint?.id : undefined,
    );
    let checkpoint = result.checkpoint;
    if (checkpoint) {
      const stillStored = (await this.versionRecords(target))
        .some(({ body: stored }) => stored.checkpoint?.id === checkpoint?.id);
      if (!stillStored) checkpoint = null;
    }
    return {
      ...result,
      checkpoint,
      historyStoragePressure: result.historyStoragePressure || globalRetention.storagePressure,
    };
  }

  async historyRestore(request: RequestFor<'history-restore'>): Promise<SessionRepositoryDataMap['history-restore']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const current = await this.readBody(request.target);
      if (current.generation !== request.expectedGeneration) {
        throw new GenerationConflictError(request.expectedGeneration, current.generation);
      }
      const selected = (await this.versionRecords(request.target))
        .find(({ body }) => body.checkpoint?.id === request.checkpointId)?.body;
      if (!selected) throw Object.assign(new Error('Checkpoint was not found'), { code: 'ENOENT' });
      const checkpointResult = await this.writeCheckpoint(request.target, current, 'pre-restore', {
        activationId: current.activationId,
        afterSummary: selected.summary,
        afterPayload: selected.payload,
        activationBaselineCheckpointId: current.activationBaselineCheckpointId,
      });
      const restored: SessionBodyV1 = {
        ...current,
        payload: cloneJson(selected.payload),
        semanticHash: selected.semanticHash,
        summary: cloneJson(selected.summary),
        updatedAt: this.now().toISOString(),
        generation: current.generation + 1,
        ...(checkpointResult.checkpointAt ? { lastCheckpointAt: checkpointResult.checkpointAt } : {}),
        historyStoragePressure: checkpointResult.historyStoragePressure,
      };
      delete restored.checkpoint;
      const result = await commitRecordAtomically({
        directory: this.targetDirectory(request.target),
        entityKey: request.target.kind === 'working' ? 'working' : request.target.sessionId,
        operationId: randomUUID(),
        contentType: 'session',
        contentVersion: SESSION_CONTENT_VERSION,
        body: restored,
        expectedGeneration: current.generation,
      }, { root: this.paths.root, readPolicy: this.readPolicy });
      if (request.target.kind === 'session') {
        this.sessions.set(request.target.sessionId, await this.catalogEntry(result.record.body as SessionBodyV1));
        this.scheduleMetadataWrite();
      }
      return { target: request.target, generation: result.generation, checkpointId: request.checkpointId };
    });
  }

  private parsePortableDocument(document: string): PortableSession[] {
    const size = Buffer.byteLength(document, 'utf8');
    if (size > SESSION_REPOSITORY_MAX_IMPORT_BYTES) {
      throw new Error(`Import exceeds the ${SESSION_REPOSITORY_MAX_IMPORT_BYTES}-byte limit`);
    }
    const parsed = JSON.parse(document) as unknown;
    if (isPlainObject(parsed) && parsed.version !== IMPORT_SCHEMA_VERSION) {
      throw new Error(`Unsupported session export version ${String(parsed.version)}`);
    }
    const rawSessions = Array.isArray(parsed)
      ? parsed
      : isPlainObject(parsed) && Array.isArray(parsed.sessions) ? parsed.sessions : null;
    if (!rawSessions || rawSessions.length === 0) throw new Error('Import contains no sessions');
    if (rawSessions.length > 10_000) throw new Error('Import contains too many sessions');
    const ids = new Set<string>();
    return rawSessions.map((raw, index) => {
      if (!isPlainObject(raw)) throw new Error(`Imported session ${index + 1} is invalid`);
      const portablePayload: PortableSessionPayloadFields = {
        maps: Array.isArray(raw.maps) ? cloneJson(raw.maps) : (() => { throw new Error('maps must be an array'); })(),
        lootItems: Array.isArray(raw.lootItems) ? cloneJson(raw.lootItems) : (() => { throw new Error('lootItems must be an array'); })(),
        baselineItems: Array.isArray(raw.baselineItems) ? cloneJson(raw.baselineItems) : [],
        baselineTotal: typeof raw.baselineTotal === 'number' && Number.isFinite(raw.baselineTotal) ? raw.baselineTotal : 0,
        manualLootItems: Array.isArray(raw.manualLootItems) ? cloneJson(raw.manualLootItems) : [],
        manualStatistics: isPlainObject(raw.manualStatistics) ? cloneJson(raw.manualStatistics) as JsonObject : {},
        manualRunTimer: isPlainObject(raw.manualRunTimer) ? cloneJson(raw.manualRunTimer) as JsonObject : {},
        settings: isPlainObject(raw.settings) ? cloneJson(raw.settings) as JsonObject : (() => { throw new Error('settings must be an object'); })(),
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        investmentNeutralization: typeof raw.investmentNeutralization === 'number' && Number.isFinite(raw.investmentNeutralization)
          ? raw.investmentNeutralization : 0,
        investmentDismissed: raw.investmentDismissed === true,
        strategySourceContext: isPlainObject(raw.strategySourceContext)
          ? cloneJson(raw.strategySourceContext) as JsonObject : null,
      };
      const session: PortableSession = {
        id: requireString(raw.id, `sessions[${index}].id`),
        name: requireString(raw.name, `sessions[${index}].name`),
        createdAt: requireTimestamp(raw.createdAt, `sessions[${index}].createdAt`),
        ...portablePayload,
      };
      if (ids.has(session.id)) throw new Error(`Duplicate imported session id ${session.id}`);
      ids.add(session.id);
      assertJsonValue(session);
      return session;
    });
  }

  private portablePayload(session: PortableSession): JsonObject {
    return cloneJson(sessionPayloadFromPortableFields(session));
  }

  async importDocument(request: RequestFor<'import'>): Promise<SessionRepositoryDataMap['import']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const imported = this.parsePortableDocument(request.document);
      const effective = imported.filter(({ id }) => (
        request.conflictMode === 'overwrite' || !this.sessions.has(id)
      ));
      if (effective.length === 0) return { importedSessionIds: [], sessions: this.sortedSessions() };

      const operationId = randomUUID();
      const transactionDirectory = importTransactionDirectory(this.paths.root, operationId);
      assertPathInside(this.paths.root, transactionDirectory);
      const journal: ImportTransactionJournal = {
        schema: 1,
        operationId,
        conflictMode: request.conflictMode,
        actions: effective.map(({ id }) => ({ sessionId: id, hadExisting: this.sessions.has(id) })),
        createdAt: this.now().toISOString(),
      };
      await mkdir(transactionDirectory, { recursive: true });

      try {
        for (const session of effective) {
          const target = { kind: 'session', sessionId: session.id } as const;
          const prior = this.sessions.has(session.id) ? await this.readBody(target) : null;
          const staged = importTransactionEntry(transactionDirectory, 'staged', session.id);
          const payload = this.portablePayload(session);
          if (prior) {
            await mkdir(dirname(staged), { recursive: true });
            await cp(this.targetDirectory(target), staged, { recursive: true, errorOnExist: true, force: false });
            await this.writeCheckpointInDirectory(staged, prior, 'destructive', {
              afterSummary: summarizePayload(payload),
              afterPayload: payload,
              activationBaselineCheckpointId: prior.activationBaselineCheckpointId,
            });
          } else {
            await mkdir(staged, { recursive: true });
          }
          const body: SessionBodyV1 = {
            kind: 'named',
            id: session.id,
            name: session.name,
            createdAt: session.createdAt,
            updatedAt: this.now().toISOString(),
            generation: (prior?.generation ?? 0) + 1,
            semanticHash: await computeSemanticHash(payload),
            summary: summarizePayload(payload),
            payload,
          };
          await commitRecordAtomically({
            directory: staged,
            entityKey: session.id,
            operationId,
            contentType: 'session',
            contentVersion: SESSION_CONTENT_VERSION,
            body,
            expectedGeneration: prior?.generation ?? null,
          }, { root: this.paths.root, readPolicy: this.readPolicy });
          const verified = await recoverRecordDirectory(staged, this.readPolicy, 'session');
          if (!verified.record) {
            throw new RepositoryRecoveryRequiredError(
              verified.status === 'unsupported' ? 'unsupported' : 'damaged',
            );
          }
          assertSessionBodyV1(verified.record.body);
        }

        await syncWriteExclusive(
          join(transactionDirectory, 'journal.json'),
          Buffer.from(JSON.stringify(journal), 'utf8'),
        );
        await this.options.onImportBoundary?.('after-journal', -1);

        for (const [index, action] of journal.actions.entries()) {
          const destination = deriveSessionDirectory(this.paths.root, action.sessionId);
          const staged = importTransactionEntry(transactionDirectory, 'staged', action.sessionId);
          const backup = importTransactionEntry(transactionDirectory, 'backups', action.sessionId);
          if (action.hadExisting) {
            await mkdir(dirname(backup), { recursive: true });
            await retryTransientFileOperation(() => rename(destination, backup));
            await this.options.onImportBoundary?.('after-backup', index);
          }
          await mkdir(dirname(destination), { recursive: true });
          await retryTransientFileOperation(() => rename(staged, destination));
          await this.options.onImportBoundary?.('after-commit', index);
        }

        await this.rebuildCatalog();
        await this.enforceGlobalRecoveryRetention();
        await this.options.onImportBoundary?.('before-complete', journal.actions.length);
        await syncWriteExclusive(
          join(transactionDirectory, 'complete.json'),
          Buffer.from(JSON.stringify({ completedAt: this.now().toISOString() }), 'utf8'),
        );
        await rm(transactionDirectory, { recursive: true, force: true });
        return { importedSessionIds: effective.map(({ id }) => id), sessions: this.sortedSessions() };
      } catch (error) {
        if (await exists(join(transactionDirectory, 'journal.json'))) {
          await this.rollbackImportTransaction(transactionDirectory, journal);
          await this.rebuildCatalog();
        } else {
          await rm(transactionDirectory, { recursive: true, force: true });
        }
        throw error;
      }
    });
  }

  async exportDocument(request: RequestFor<'export'>): Promise<SessionRepositoryDataMap['export']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const sessions: PortableSession[] = [];
      for (const id of request.sessionIds) {
        const body = await this.readBody({ kind: 'session', sessionId: id });
        const payload = body.payload;
        const portable = {
          id,
          name: body.name as string,
          createdAt: body.createdAt,
          ...cloneJson(portableFieldsFromSessionPayload(payload)),
        };
        assertJsonValue(portable);
        sessions.push(portable as PortableSession);
      }
      return {
        document: JSON.stringify({ version: IMPORT_SCHEMA_VERSION, exportedAt: this.now().toISOString(), sessions }, null, 2),
      };
    });
  }

  async retry(request: RequestFor<'retry'>): Promise<SessionRepositoryDataMap['retry']> {
    await this.requireReady();
    return this.queue.enqueue('repository', async () => {
      const directory = importTransactionDirectory(this.paths.root, request.operationId);
      if (!(await exists(directory))) return { operationId: request.operationId, status: 'completed' };
      await this.recoverImportTransactions();
      await this.rebuildCatalog();
      return {
        operationId: request.operationId,
        status: await exists(directory) ? 'pending' : 'completed',
      };
    });
  }

  async openDataFolder(_request: RequestFor<'open-data-folder'>): Promise<SessionRepositoryDataMap['open-data-folder']> {
    await mkdir(this.paths.root, { recursive: true });
    const error = await this.options.openPath(this.paths.root);
    if (error) throw new Error(error);
    return { opened: true };
  }
}
