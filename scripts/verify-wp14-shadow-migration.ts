import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { migrateLegacyProfileClone } from '../src/main/sessionMigration';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  type LegacyStorageSnapshot,
} from '../src/shared/sessionMigration';
import { migrateSessionEnvelope } from '../src/renderer/src/repository/legacySessionMigration';

const root = resolve(import.meta.dirname, '..');
const profileFixtureDirectory = resolve(
  root,
  'src/renderer/src/utils/__fixtures__/wp14-profile',
);
const fixtureNames = [
  'large-session-envelope.json',
  'many-session-envelope.json',
  'rawtext-heavy-10mib-envelope.json',
] as const;
const migrationRoot = await mkdtemp(resolve(tmpdir(), 'wl-wp14-shadow-check-'));
const fixedNow = new Date('2026-08-22T12:00:00.000Z');

try {
  const results = [];
  for (const fixtureName of fixtureNames) {
    const rawValue = await readFile(resolve(profileFixtureDirectory, fixtureName), 'utf8');
    const snapshot: LegacyStorageSnapshot = {
      store: { key: LEGACY_STORE_STORAGE_KEY, rawValue },
      layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: '{"shadow":"layout"}' },
      changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: '1.0.79' },
    };
    const fixtureProfile = resolve(migrationRoot, fixtureName.replace('.json', ''));
    await mkdir(fixtureProfile);
    const startedAt = performance.now();
    const plan = await migrateSessionEnvelope(snapshot, {
      repositoryId: `wp14-shadow:${fixtureName}`,
      operationId: `wp14-shadow:${fixtureName}`,
      now: fixedNow,
    });
    const migration = await migrateLegacyProfileClone({
      userDataPath: fixtureProfile,
      plan,
      completedAt: () => fixedNow,
    });
    const repeated = await migrateLegacyProfileClone({
      userDataPath: fixtureProfile,
      plan,
      completedAt: () => fixedNow,
    });
    results.push({
      fixtureName,
      rawUtf8Bytes: Buffer.byteLength(rawValue, 'utf8'),
      namedSessions: plan.expectedSessionIds.length,
      hasWorking: plan.sessions.some((session) => session.target.kind === 'working'),
      checkpoints: plan.sessions.filter((session) => session.checkpoint !== undefined).length,
      migrationStatus: migration.status,
      idempotentRerun: repeated.resumed,
      elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    });
  }
  console.log(JSON.stringify({ schemaVersion: 1, results }, null, 2));
} finally {
  await rm(migrationRoot, { recursive: true, force: true });
}
