import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { FileSessionRepository } from '../src/main/sessionRepository';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  type LegacyStorageSnapshot,
} from '../src/shared/sessionMigration';
import { assertJsonValue, type JsonObject } from '../src/shared/sessionRecord';
import {
  WP14_BENCHMARK_COUNTS,
  WP14_BENCHMARK_REPORT_NAME,
  WP14_BENCHMARK_SCHEMA_VERSION,
  WP14_BENCHMARK_TARGETS,
  summarizeTimings,
  utf8Size,
} from '../src/shared/wp14Benchmark';
import { migrateSessionEnvelope } from '../src/renderer/src/repository/legacySessionMigration';

interface FixtureMetadata {
  artifacts: Array<{
    fileName: string;
    rawBytes: number;
    sha256: string;
  }>;
}

const root = resolve(import.meta.dirname, '..');
const fixtureRoot = resolve(root, 'src/renderer/src/utils/__fixtures__/wp14-profile');
const reportPath = resolve(root, '.wp14-bench', WP14_BENCHMARK_REPORT_NAME);
const manyFixtureName = 'many-session-envelope.json';
const tenMiBFixtureName = 'rawtext-heavy-10mib-envelope.json';
const allowDirty = process.argv.includes('--allow-dirty');

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactCommit(): string {
  const dirty = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  if (dirty && !allowDirty) {
    throw new Error('WP14 performance verification requires a clean tracked worktree');
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

async function verifiedFixture(
  metadata: FixtureMetadata,
  fileName: string,
): Promise<{ raw: string; bytes: number; hash: string }> {
  const expected = metadata.artifacts.find((artifact) => artifact.fileName === fileName);
  if (!expected) throw new Error(`Fixture metadata is missing ${fileName}`);
  const bytes = await readFile(resolve(fixtureRoot, fileName));
  const hash = sha256(bytes);
  equal(bytes.length, expected.rawBytes, `${fileName} byte length changed`);
  equal(hash, expected.sha256, `${fileName} hash changed`);
  return { raw: bytes.toString('utf8'), bytes: bytes.length, hash };
}

function snapshot(rawValue: string): LegacyStorageSnapshot {
  return {
    store: { key: LEGACY_STORE_STORAGE_KEY, rawValue },
    layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: '{"benchmark":"layout"}' },
    changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: '1.0.79' },
  };
}

async function migratedProfile(
  prefix: string,
  rawValue: string,
  identity: string,
): Promise<{ profile: string; repository: FileSessionRepository }> {
  const profile = await mkdtemp(resolve(tmpdir(), prefix));
  const repository = new FileSessionRepository({
    userDataPath: profile,
    openPath: async () => '',
    now: () => new Date('2026-08-23T16:00:00.000Z'),
  });
  const plan = await migrateSessionEnvelope(snapshot(rawValue), {
    repositoryId: identity,
    operationId: identity,
    now: new Date('2026-08-23T16:00:00.000Z'),
  });
  await repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan });
  return { profile, repository };
}

async function benchmarkWarmBootstrap(
  rawValue: string,
): Promise<{ timings: ReturnType<typeof summarizeTimings>; repositorySizeBytes: number }> {
  const initial = await migratedProfile('wl-wp14-bootstrap-bench-', rawValue, 'wp14-bench:bootstrap');
  const profile = initial.profile;
  let repository: FileSessionRepository | null = initial.repository;
  try {
    const listed = await repository.list({ operation: 'list' });
    equal(listed.sessions.length, 100, 'Many-session fixture did not migrate 100 named sessions');
    await repository.releaseLock();
    repository = null;

    const timings: number[] = [];
    const total = WP14_BENCHMARK_COUNTS.bootstrapWarmups +
      WP14_BENCHMARK_COUNTS.bootstrapIterations;
    let repositorySizeBytes = 0;
    for (let index = 0; index < total; index += 1) {
      repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
      const startedAt = performance.now();
      const bootstrap = await repository.bootstrap({ operation: 'bootstrap' });
      const elapsed = performance.now() - startedAt;
      equal(bootstrap.sessions.length, 100, 'Warm bootstrap lost a named session');
      repositorySizeBytes = bootstrap.repositorySizeBytes;
      if (index >= WP14_BENCHMARK_COUNTS.bootstrapWarmups) timings.push(elapsed);
      await repository.releaseLock();
      repository = null;
    }
    return { timings: summarizeTimings(timings), repositorySizeBytes };
  } finally {
    await repository?.releaseLock().catch(() => undefined);
    await rm(profile, { recursive: true, force: true });
  }
}

async function benchmarkTenMiBSave(
  rawValue: string,
): Promise<{
  timings: ReturnType<typeof summarizeTimings>;
  payloadBytes: number;
  finalGeneration: number;
}> {
  const migrated = await migratedProfile('wl-wp14-save-bench-', rawValue, 'wp14-bench:save');
  const { profile, repository } = migrated;
  try {
    const loaded = await repository.load({
      operation: 'load', target: { kind: 'working' }, mode: 'inspect',
    });
    const basePayload = loaded.payload;
    const targetBytes = 10 * 1024 * 1024;
    const paddingLength = Math.max(
      0,
      targetBytes - utf8Size(JSON.stringify(basePayload)) + 128,
    );
    const benchmarkPayload = { ...basePayload, sessionNotes: 'x'.repeat(paddingLength) };
    const payloadBytes = utf8Size(JSON.stringify(benchmarkPayload));
    ok(payloadBytes >= 10 * 1024 * 1024, 'RawText-heavy migrated payload is smaller than 10 MiB');
    let generation = loaded.generation;
    const timings: number[] = [];
    const total = WP14_BENCHMARK_COUNTS.saveWarmups + WP14_BENCHMARK_COUNTS.saveIterations;
    let finalPayload: JsonObject = basePayload;
    for (let index = 0; index < total; index += 1) {
      finalPayload = {
        ...benchmarkPayload,
        sessionNotes: `${index}:`.padEnd(paddingLength, 'x'),
      };
      const startedAt = performance.now();
      const saved = await repository.save({
        operation: 'save',
        target: { kind: 'working' },
        expectedGeneration: generation,
        payload: finalPayload,
      });
      const elapsed = performance.now() - startedAt;
      generation = saved.generation;
      if (index >= WP14_BENCHMARK_COUNTS.saveWarmups) timings.push(elapsed);
    }
    const final = await repository.load({
      operation: 'load', target: { kind: 'working' }, mode: 'inspect',
    });
    equal(final.generation, generation);
    deepStrictEqual(final.payload, finalPayload);
    return { timings: summarizeTimings(timings), payloadBytes, finalGeneration: generation };
  } finally {
    await repository.releaseLock().catch(() => undefined);
    await rm(profile, { recursive: true, force: true });
  }
}

function benchmarkRendererValidation(payload: JsonObject): ReturnType<typeof summarizeTimings> {
  for (let index = 0; index < WP14_BENCHMARK_COUNTS.rendererValidationWarmups; index += 1) {
    assertJsonValue(payload, '$.response.data.payload');
  }
  const timings: number[] = [];
  for (let index = 0; index < WP14_BENCHMARK_COUNTS.rendererValidationIterations; index += 1) {
    const startedAt = performance.now();
    assertJsonValue(payload, '$.response.data.payload');
    timings.push(performance.now() - startedAt);
  }
  return summarizeTimings(timings);
}

const commitSha = exactCommit();
const metadata = JSON.parse(
  await readFile(resolve(fixtureRoot, 'fixture-metadata.json'), 'utf8'),
) as FixtureMetadata;
const many = await verifiedFixture(metadata, manyFixtureName);
const tenMiB = await verifiedFixture(metadata, tenMiBFixtureName);
const bootstrap = await benchmarkWarmBootstrap(many.raw);
const save = await benchmarkTenMiBSave(tenMiB.raw);
const tenMiBEnvelope = JSON.parse(tenMiB.raw) as { state: JsonObject };
const rendererValidation = benchmarkRendererValidation(tenMiBEnvelope.state);
const targetEvaluation = {
  warmBootstrap: {
    targetMs: WP14_BENCHMARK_TARGETS.bootstrapP95Ms,
    observedP95Ms: bootstrap.timings.p95Ms,
    status: Number(bootstrap.timings.p95Ms) <= WP14_BENCHMARK_TARGETS.bootstrapP95Ms,
  },
  tenMiBDurableSave: {
    targetMs: WP14_BENCHMARK_TARGETS.tenMiBSaveAckP95Ms,
    observedP95Ms: save.timings.p95Ms,
    status: Number(save.timings.p95Ms) <= WP14_BENCHMARK_TARGETS.tenMiBSaveAckP95Ms,
  },
  rendererValidation: {
    targetMs: WP14_BENCHMARK_TARGETS.rendererValidationMaxMs,
    observedMaxMs: rendererValidation.maxMs,
    status: Number(rendererValidation.maxMs) <= WP14_BENCHMARK_TARGETS.rendererValidationMaxMs,
  },
};
const report = {
  schemaVersion: WP14_BENCHMARK_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  commitSha,
  methodology: {
    fixtures: 'locked Phase 0 fixture bytes and SHA-256 verified before measurement',
    bootstrap: 'fresh FileSessionRepository instance over an already-migrated 100-session profile',
    save: 'actual generation-checked 10 MiB working-session commit through current/temp/bak fsync path',
    rendererValidation:
      'same synchronous recursive response-payload validation used by the renderer typed IPC client, ' +
      'including the unpaired-surrogate scan',
    warmups: {
      bootstrap: WP14_BENCHMARK_COUNTS.bootstrapWarmups,
      save: WP14_BENCHMARK_COUNTS.saveWarmups,
      rendererValidation: WP14_BENCHMARK_COUNTS.rendererValidationWarmups,
    },
    iterations: {
      bootstrap: WP14_BENCHMARK_COUNTS.bootstrapIterations,
      save: WP14_BENCHMARK_COUNTS.saveIterations,
      rendererValidation: WP14_BENCHMARK_COUNTS.rendererValidationIterations,
    },
    thresholdRelaxations: [],
  },
  fixtures: {
    manySession: { bytes: many.bytes, sha256: many.hash },
    tenMiB: { bytes: tenMiB.bytes, sha256: tenMiB.hash },
  },
  results: {
    warmBootstrap: { ...bootstrap, namedSessions: 100 },
    tenMiBDurableSave: save,
    rendererValidation,
  },
  targetEvaluation,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (Object.values(targetEvaluation).some(({ status }) => !status)) {
  throw new Error('WP14 performance target missed; see the generated report');
}
