import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { FileSessionRepository } from '../src/main/sessionRepository';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_MIGRATION_SCHEMA,
  LEGACY_STORE_STORAGE_KEY,
  LEGACY_STORE_VERSION,
  type LegacyStorageSnapshot,
  type LegacyStorageValue,
} from '../src/shared/sessionMigration';
import type { JsonObject } from '../src/shared/sessionRecord';
import { migrateSessionEnvelope } from '../src/renderer/src/repository/legacySessionMigration';

interface BackupManifestEntry {
  key: string;
  present: boolean;
  relativePath: string | null;
  byteLength: number;
  sha256: string | null;
}

interface BackupManifest {
  schema: number;
  operationId: string;
  sourceHash: string;
  sourceStoreVersion: number;
  entries: BackupManifestEntry[];
}

interface ImmutableSource {
  path: string;
  byteLength: number;
  sha256: string;
}

const manifestArgument = process.argv[2];
if (!manifestArgument) {
  throw new Error('Usage: npm run wp14:profile-backup-check -- <legacy-manifest.json>');
}

const expectedKeys = [
  LEGACY_STORE_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_CHANGELOG_STORAGE_KEY,
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertManifest(value: unknown): BackupManifest {
  if (!isPlainObject(value) || value.schema !== LEGACY_MIGRATION_SCHEMA ||
      typeof value.operationId !== 'string' || value.operationId.length === 0 ||
      typeof value.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceHash) ||
      value.sourceStoreVersion !== LEGACY_STORE_VERSION || !Array.isArray(value.entries)) {
    throw new Error('Legacy backup manifest is invalid or unsupported');
  }
  const entries = value.entries;
  if (entries.length !== expectedKeys.length || entries.some((entry) => !isPlainObject(entry))) {
    throw new Error('Legacy backup manifest has an invalid entry set');
  }
  for (const key of expectedKeys) {
    const matches = entries.filter((entry) => entry.key === key);
    if (matches.length !== 1) throw new Error(`Legacy backup manifest must contain one ${key} entry`);
    const entry = matches[0];
    if (typeof entry.present !== 'boolean' || !Number.isSafeInteger(entry.byteLength) ||
        entry.byteLength < 0) {
      throw new Error(`Legacy backup manifest entry ${key} is invalid`);
    }
    if (entry.present) {
      if (typeof entry.relativePath !== 'string' || entry.relativePath.length === 0 ||
          typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        throw new Error(`Legacy backup manifest entry ${key} has invalid file metadata`);
      }
    } else if (entry.relativePath !== null || entry.sha256 !== null || entry.byteLength !== 0) {
      throw new Error(`Absent legacy backup manifest entry ${key} has file metadata`);
    }
  }
  return value as unknown as BackupManifest;
}

function containedPath(root: string, candidate: string): string {
  if (isAbsolute(candidate)) throw new Error('Legacy backup path must be relative');
  const absolute = resolve(root, candidate);
  const fromRoot = relative(root, absolute);
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
      isAbsolute(fromRoot)) {
    throw new Error('Legacy backup path escapes its ledger-data root');
  }
  return absolute;
}

function withoutGeneration(value: JsonObject): JsonObject {
  const copy = { ...value };
  delete copy.generation;
  return copy;
}

function workflowFromPlan(value: JsonObject): JsonObject {
  return {
    activeTarget: value.activeTarget,
    viewedTarget: value.viewedTarget,
    lifecycle: value.lifecycle,
    suspended: value.suspended,
    activationId: value.activationId,
    pendingAtlasBonusSeed: value.pendingAtlasBonusSeed,
    pendingAtlasBonusValue: value.pendingAtlasBonusValue,
  };
}

async function sourceState(path: string): Promise<ImmutableSource> {
  const bytes = await readFile(path);
  return { path, byteLength: bytes.length, sha256: sha256(bytes) };
}

async function assertSourcesUnchanged(sources: ImmutableSource[]): Promise<void> {
  for (const source of sources) {
    const current = await sourceState(source.path);
    deepStrictEqual(current, source, `Source backup changed: ${basename(source.path)}`);
  }
}

const manifestPath = resolve(manifestArgument);
const ledgerDataRoot = dirname(dirname(manifestPath));
const manifestBytes = await readFile(manifestPath);
const manifest = assertManifest(JSON.parse(manifestBytes.toString('utf8')) as unknown);
const immutableSources: ImmutableSource[] = [{
  path: manifestPath,
  byteLength: manifestBytes.length,
  sha256: sha256(manifestBytes),
}];
const values = new Map<string, LegacyStorageValue>();

for (const entry of manifest.entries) {
  if (!entry.present) {
    values.set(entry.key, { key: entry.key, rawValue: null });
    continue;
  }
  const sourcePath = containedPath(ledgerDataRoot, entry.relativePath as string);
  const bytes = await readFile(sourcePath);
  equal(bytes.length, entry.byteLength, `Legacy backup byte length mismatch for ${entry.key}`);
  equal(sha256(bytes), entry.sha256, `Legacy backup hash mismatch for ${entry.key}`);
  immutableSources.push({ path: sourcePath, byteLength: bytes.length, sha256: sha256(bytes) });
  values.set(entry.key, { key: entry.key, rawValue: bytes.toString('utf8') });
}

const valueFor = (key: string): LegacyStorageValue => {
  const value = values.get(key);
  if (!value) throw new Error(`Legacy backup value ${key} is missing`);
  return value;
};
const snapshot: LegacyStorageSnapshot = {
  store: valueFor(LEGACY_STORE_STORAGE_KEY),
  layout: valueFor(LEGACY_LAYOUT_STORAGE_KEY),
  changelog: valueFor(LEGACY_CHANGELOG_STORAGE_KEY),
};
const identity = `wp14-phase6-profile:${manifest.sourceHash.slice(0, 16)}`;
const plan = await migrateSessionEnvelope(snapshot, {
  repositoryId: identity,
  operationId: identity,
  now: new Date('2026-08-23T15:30:00.000Z'),
});
equal(plan.sourceHash, manifest.sourceHash, 'Rebuilt migration source hash differs from manifest');
equal(plan.sourceStoreVersion, manifest.sourceStoreVersion, 'Rebuilt migration source version differs');

const profile = await mkdtemp(resolve(tmpdir(), 'wl-wp14-profile-backup-'));
let repository: FileSessionRepository | null = null;

async function verifyRepository(
  current: FileSessionRepository,
  bootstrap: Awaited<ReturnType<FileSessionRepository['bootstrap']>>,
): Promise<void> {
  deepStrictEqual(
    bootstrap.sessions.map(({ id }) => id).sort(),
    [...plan.expectedSessionIds].sort(),
    'Migrated session ids differ from the replay plan',
  );
  deepStrictEqual(bootstrap.workflow, workflowFromPlan(plan.bootstrap));
  equal(bootstrap.workflowGeneration, plan.bootstrap.generation);
  deepStrictEqual(bootstrap.preferences, withoutGeneration(plan.preferences));
  equal(bootstrap.preferencesGeneration, plan.preferences.generation);
  deepStrictEqual(bootstrap.layout, withoutGeneration(plan.layout));
  equal(bootstrap.layoutGeneration, plan.layout.generation);
  equal(bootstrap.migrationCleanup?.sourceHash, manifest.sourceHash);
  equal(bootstrap.migrationCleanup?.sourceStoreVersion, LEGACY_STORE_VERSION);

  for (const migrated of plan.sessions) {
    const loaded = await current.load({ operation: 'load', target: migrated.target, mode: 'inspect' });
    equal(loaded.generation, migrated.current.generation);
    deepStrictEqual(loaded.payload, migrated.current.payload);
  }
}

try {
  repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
  const first = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan });
  await verifyRepository(repository, first);
  await repository.releaseLock();
  repository = null;

  repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
  const restarted = await repository.bootstrap({ operation: 'bootstrap' });
  await verifyRepository(repository, restarted);
  equal(restarted.sessions.length, plan.expectedSessionIds.length, 'Restart created duplicate sessions');
  ok(restarted.repositorySizeBytes > 0, 'Restarted repository is unexpectedly empty');

  await assertSourcesUnchanged(immutableSources);
  console.log(JSON.stringify({
    schemaVersion: 1,
    sourceStoreVersion: manifest.sourceStoreVersion,
    sourceHash: manifest.sourceHash,
    namedSessions: plan.expectedSessionIds.length,
    includesWorkingSession: plan.sessions.some(({ target }) => target.kind === 'working'),
    verifiedPayloadsPerBoot: plan.sessions.length,
    restartVerified: true,
    immutableSourceFiles: immutableSources.length,
  }, null, 2));
} finally {
  await repository?.releaseLock().catch(() => undefined);
  await assertSourcesUnchanged(immutableSources);
  await rm(profile, { recursive: true, force: true });
}
