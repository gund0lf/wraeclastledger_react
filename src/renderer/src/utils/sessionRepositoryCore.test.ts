import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKUP_RECORD_NAME,
  CURRENT_RECORD_NAME,
  EntityOperationQueue,
  GenerationConflictError,
  RecordSizeLimitError,
  RepositoryRecoveryRequiredError,
  UnsupportedContentVersionError,
  assertPathInside,
  commitRecordAtomically,
  createSessionIdentity,
  deriveRepositoryPaths,
  deriveSessionDirectory,
  inspectRecordCandidates,
  recoverRecordDirectory,
  retryTransientFileOperation,
  sessionDirectoryName,
  type AtomicCommitStage,
  type RepositoryReadPolicy,
} from '../../../main/sessionRepositoryCore';
import { encodeRecordV1, type JsonObject } from '../../../shared/sessionRecord';

const roots: string[] = [];
const policy: RepositoryReadPolicy = {
  maxRecordBytes: 1024 * 1024,
  maxContentVersions: {
    session: 1,
    preferences: 1,
    layout: 1,
    bootstrap: 1,
    catalog: 1,
  },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'wl-wp14-core-'));
  roots.push(root);
  return root;
};

const body = (generation: number, marker = `g${generation}`): JsonObject => ({
  kind: 'named',
  id: 'session-id',
  name: 'Session',
  createdAt: '2026-07-22T10:00:00.000Z',
  updatedAt: '2026-07-22T10:01:00.000Z',
  generation,
  semanticHash: '0'.repeat(64),
  summary: { marker },
  payload: { marker },
});

const commit = async (
  root: string,
  directory: string,
  generation: number,
  stageToFail?: AtomicCommitStage,
) => commitRecordAtomically({
  directory,
  entityKey: 'session-id',
  operationId: `operation-${generation}`,
  contentType: 'session',
  contentVersion: 1,
  body: body(generation),
  expectedGeneration: generation === 1 ? null : generation - 1,
}, {
  root,
  readPolicy: policy,
  processId: 123,
  uniqueId: () => `unique-${generation}`,
  retry: { sleep: async () => undefined, random: () => 0.5 },
  hooks: stageToFail ? {
    afterStage: (stage) => {
      if (stage === stageToFail) throw new Error(`crash:${stage}`);
    },
  } : undefined,
});

describe('WP14 repository paths', () => {
  it('derives the complete backup root and hashes untrusted session ids', () => {
    const paths = deriveRepositoryPaths('C:\\Users\\Example\\AppData\\Roaming\\WraeclastLedger');
    expect(paths.root).toMatch(/ledger-data$/);
    expect(paths.working).toMatch(/sessions[\\/]working$/);
    expect(paths.migration).toMatch(/migration$/);
    expect(sessionDirectoryName('legacy:2026/07/22')).toMatch(/^[a-f0-9]{64}$/);
    const sessionPath = deriveSessionDirectory(paths.root, '..\\outside/:session');
    expect(sessionPath).toContain(sessionDirectoryName('..\\outside/:session'));
    expect(() => assertPathInside(paths.root, join(paths.root, '..', 'escape'))).toThrow();
  });

  it('creates UUID identity independently from its timestamp', () => {
    const identity = createSessionIdentity(new Date('2026-07-22T12:34:56.000Z'));
    expect(identity.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity.createdAt).toBe('2026-07-22T12:34:56.000Z');
    expect(identity.id).not.toContain('2026');
  });
});

describe('WP14 atomic repository commit', () => {
  it('writes, fsyncs, verifies, rotates, and increments generations', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await commit(root, directory, 1);
    await commit(root, directory, 2);
    const inspection = await inspectRecordCandidates(directory, policy, 'session');
    expect(inspection.valid.map(({ name, generation }) => [name, generation]))
      .toEqual([[BACKUP_RECORD_NAME, 1], [CURRENT_RECORD_NAME, 2]]);
  });

  it('rejects stale expected generations before writing', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await commit(root, directory, 1);
    await expect(commitRecordAtomically({
      directory,
      entityKey: 'session-id',
      operationId: 'stale',
      contentType: 'session',
      contentVersion: 1,
      body: body(2),
      expectedGeneration: null,
    }, { root, readPolicy: policy })).rejects.toBeInstanceOf(GenerationConflictError);
    expect(await readdir(directory)).toEqual([CURRENT_RECORD_NAME]);
  });

  it('enforces the caller-owned encoded-size bound', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await expect(commitRecordAtomically({
      directory,
      entityKey: 'session-id',
      operationId: 'large',
      contentType: 'session',
      contentVersion: 1,
      body: body(1, 'x'.repeat(2048)),
      expectedGeneration: null,
    }, {
      root,
      readPolicy: { ...policy, maxRecordBytes: 100 },
    })).rejects.toBeInstanceOf(RecordSizeLimitError);
  });

  it.each([
    'temp-written',
    'temp-synced',
    'temp-verified',
    'backup-prepared',
    'current-rotated',
    'temp-promoted',
  ] as AtomicCommitStage[])('recovers a crash after %s', async (failedStage) => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await commit(root, directory, 1);
    await expect(commit(root, directory, 2, failedStage)).rejects.toThrow(`crash:${failedStage}`);
    const recovery = await recoverRecordDirectory(directory, policy, 'session');
    const recoveredBody = recovery.record?.body as JsonObject;
    expect(recoveredBody.generation).toBe(2);
  });
});

describe('WP14 startup recovery', () => {
  it('promotes the highest generation and preserves a corrupt current', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await commit(root, directory, 1);
    const temporary = join(directory, 'candidate.g2.tmp');
    await writeFile(temporary, await encodeRecordV1('session', 1, body(2)));
    await writeFile(join(directory, CURRENT_RECORD_NAME), 'corrupt-current');
    const recovery = await recoverRecordDirectory(directory, policy, 'session');
    expect(recovery.status).toBe('promoted');
    expect((recovery.record?.body as JsonObject).generation).toBe(2);
    expect(recovery.preserved).toHaveLength(1);
    await expect(readFile(recovery.preserved[0], 'utf8')).resolves.toBe('corrupt-current');
  });

  it('reports corrupt and newer-schema candidates without deleting them', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, CURRENT_RECORD_NAME), 'bad');
    await writeFile(join(directory, 'newer.tmp'), await encodeRecordV1('session', 2, body(3)));
    const inspection = await inspectRecordCandidates(directory, policy, 'session');
    expect(inspection.valid).toHaveLength(0);
    expect(inspection.damaged).toHaveLength(2);
    expect(inspection.damaged.some(({ error }) => error instanceof UnsupportedContentVersionError))
      .toBe(true);
    expect(await readdir(directory)).toEqual([CURRENT_RECORD_NAME, 'newer.tmp']);
    const recovery = await recoverRecordDirectory(directory, policy, 'session');
    expect(recovery.status).toBe('unsupported');
    expect(await readdir(directory)).toEqual([CURRENT_RECORD_NAME, 'newer.tmp']);
  });

  it('does not treat damaged-only bytes as an empty writable repository', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, CURRENT_RECORD_NAME), 'bad');
    const recovery = await recoverRecordDirectory(directory, policy, 'session');
    expect(recovery.status).toBe('damaged');
    await expect(commitRecordAtomically({
      directory,
      entityKey: 'session-id',
      operationId: 'must-not-overwrite',
      contentType: 'session',
      contentVersion: 1,
      body: body(1),
      expectedGeneration: null,
    }, { root, readPolicy: policy })).rejects.toBeInstanceOf(RepositoryRecoveryRequiredError);
    await expect(readFile(join(directory, CURRENT_RECORD_NAME), 'utf8')).resolves.toBe('bad');
  });

  it('keeps a torn temporary candidate visible while retaining valid current', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await commit(root, directory, 1);
    await writeFile(join(directory, 'torn.g2.tmp'), '{"incomplete":');
    const recovery = await recoverRecordDirectory(directory, policy, 'session');
    expect(recovery.status).toBe('current');
    expect((recovery.record?.body as JsonObject).generation).toBe(1);
    expect(recovery.damaged.map(({ name }) => name)).toContain('torn.g2.tmp');
    expect(await readdir(directory)).toContain('torn.g2.tmp');
  });

  it('promotes a valid backup when current is corrupt and preserves the corrupt bytes', async () => {
    const root = await tempRoot();
    const directory = deriveSessionDirectory(root, 'session-id');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, CURRENT_RECORD_NAME), 'corrupt-current');
    await writeFile(join(directory, BACKUP_RECORD_NAME), await encodeRecordV1('session', 1, body(1)));
    const recovery = await recoverRecordDirectory(directory, policy, 'session');
    expect(recovery.status).toBe('promoted');
    expect((recovery.record?.body as JsonObject).generation).toBe(1);
    expect(recovery.preserved).toHaveLength(1);
    await expect(readFile(recovery.preserved[0], 'utf8')).resolves.toBe('corrupt-current');
  });
});

describe('WP14 transient file retry', () => {
  it('retries transient Windows file errors with bounded jittered backoff', async () => {
    const delays: number[] = [];
    let attempts = 0;
    const result = await retryTransientFileOperation(async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('busy') as NodeJS.ErrnoException;
        error.code = 'EBUSY';
        throw error;
      }
      return 'ok';
    }, {
      attempts: 5,
      baseDelayMs: 20,
      maxDelayMs: 100,
      random: () => 0.5,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(delays).toEqual([20, 40]);
  });

  it('does not retry non-transient errors', async () => {
    let attempts = 0;
    await expect(retryTransientFileOperation(async () => {
      attempts += 1;
      throw new Error('invalid');
    }, {
      sleep: async () => undefined,
    })).rejects.toThrow('invalid');
    expect(attempts).toBe(1);
  });
});

describe('WP14 per-entity queue', () => {
  it('serializes one entity while allowing another entity to proceed', async () => {
    const queue = new EntityOperationQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = queue.enqueue('a', async () => {
      events.push('a1-start');
      await firstGate;
      events.push('a1-end');
    });
    const second = queue.enqueue('a', async () => { events.push('a2'); });
    const other = queue.enqueue('b', async () => { events.push('b1'); });
    await other;
    expect(events).toEqual(['a1-start', 'b1']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['a1-start', 'b1', 'a1-end', 'a2']);
    await Promise.resolve();
    expect(queue.pendingEntities()).toBe(0);
  });

  it('continues after a failed operation on the same entity', async () => {
    const queue = new EntityOperationQueue();
    await expect(queue.enqueue('a', async () => { throw new Error('failed'); })).rejects.toThrow();
    await expect(queue.enqueue('a', async () => 42)).resolves.toBe(42);
  });
});
