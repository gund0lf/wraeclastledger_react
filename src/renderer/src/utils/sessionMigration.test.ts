import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LegacyMigrationRepositoryError,
  migrateLegacyProfileClone,
} from '../../../main/sessionMigration';
import { deriveRepositoryPaths } from '../../../main/sessionRepositoryCore';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  type LegacyMigrationPlanV1,
  type LegacyMigrationStage,
  type LegacyStorageSnapshot,
} from '../../../shared/sessionMigration';
import { LEGACY_STORE_VERSION } from '../store/useSessionStore';
import {
  LegacyMigrationSourceError,
  migrateSessionEnvelope,
} from '../repository/legacySessionMigration';
import { WP14_STORE_VERSION } from './__fixtures__/wp14Fixtures';

const roots: string[] = [];
const NOW = new Date('2026-08-22T12:00:00.000Z');

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempProfile(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'wl-wp14-migration-'));
  roots.push(root);
  return root;
}

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./__fixtures__/wp14/${name}`, import.meta.url), 'utf8');
}

async function snapshot(
  fixtureName = 'active-named-dirty-envelope.json',
): Promise<LegacyStorageSnapshot> {
  return {
    store: { key: LEGACY_STORE_STORAGE_KEY, rawValue: await fixture(fixtureName) },
    layout: {
      key: LEGACY_LAYOUT_STORAGE_KEY,
      rawValue: '{"layout":"\u5e03\u5c40","tabs":[1,2]}\r\n',
    },
    changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: '1.0.79' },
  };
}

async function plan(
  fixtureName = 'active-named-dirty-envelope.json',
  suffix = fixtureName,
): Promise<LegacyMigrationPlanV1> {
  return migrateSessionEnvelope(await snapshot(fixtureName), {
    repositoryId: `repository:${suffix}`,
    operationId: `migration:${suffix}`,
    now: NOW,
  });
}

describe('WP14 closed legacy migration adapter', () => {
  it('freezes the legacy Zustand ceiling at the current v18 fixture', () => {
    expect(LEGACY_STORE_VERSION).toBe(18);
    expect(LEGACY_STORE_VERSION).toBe(WP14_STORE_VERSION);
  });

  it.each([
    'legacy-v13-envelope.json',
    'legacy-v17-envelope.json',
    'legacy-v18-envelope.json',
  ])('normalizes %s without changing source bytes', async (fixtureName) => {
    const source = await snapshot(fixtureName);
    const before = JSON.stringify(source);
    const migrated = await migrateSessionEnvelope(source, {
      repositoryId: `repository:${fixtureName}`,
      operationId: `migration:${fixtureName}`,
      now: NOW,
    });
    expect(migrated.sourceStoreVersion).toBe(Number(fixtureName.match(/v(\d+)/)?.[1]));
    expect(migrated.sessions).toHaveLength(1);
    expect(migrated.expectedSessionIds).toHaveLength(1);
    expect(migrated.preferences).toHaveProperty('lastDivineFetchAt');
    expect(migrated.layout.rawValue).toBe(source.layout.rawValue);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('rejects a newer v19 envelope and every tracked corrupt source', async () => {
    for (const fixtureName of [
      'corrupt-empty.json',
      'corrupt-malformed.json',
      'corrupt-truncated.json',
      'corrupt-inconsistent-envelope.json',
      'corrupt-newer-version-envelope.json',
    ]) {
      await expect(plan(fixtureName)).rejects.toBeInstanceOf(LegacyMigrationSourceError);
    }
  });

  it('keeps unnamed current work live and separates session data from preferences', async () => {
    const migrated = await plan('unnamed-working-envelope.json');
    const working = migrated.sessions.find((session) => session.target.kind === 'working');
    expect(working).toBeDefined();
    expect(migrated.expectedSessionIds).toEqual([]);
    expect(migrated.bootstrap).toMatchObject({
      activeTarget: { kind: 'working' },
      viewedTarget: { kind: 'working' },
      lifecycle: 'live',
      captureEnabled: false,
    });
    expect(working?.current.payload).toMatchObject({
      sessionNotes: 'Unnamed fixture work',
      manualStatistics: { starfallCraters: 0, wildwoodEncounters: 1 },
      strategySourceContext: null,
    });
    expect(working?.current.payload).not.toHaveProperty('discordTag');
    expect(working?.current.payload.settings).not.toHaveProperty('discordTag');
    expect(migrated.preferences).toHaveProperty('discordTag');
    expect(migrated.preferences.lastSeenChangelogVersion).toBe('1.0.79');
  });

  it('makes dirty named current state authoritative and preserves the saved copy once', async () => {
    const migrated = await plan('active-named-dirty-envelope.json');
    expect(migrated.sessions).toHaveLength(1);
    const active = migrated.sessions[0];
    expect(active.target.kind).toBe('session');
    expect(active.current.payload.maps).toHaveLength(3);
    expect((active.current.payload.maps as Array<Record<string, unknown>>)
      .some((map) => typeof map.rawText === 'string')).toBe(true);
    expect(active.current.payload).toMatchObject({
      sessionNotes: 'Unsaved fixture edit',
      manualStatistics: { starfallCraters: 4 },
    });
    expect(active.current.payload.settings).toMatchObject({ baseMapCost: 12 });
    expect(active.checkpoint?.payload.maps).toHaveLength(2);
    expect(active.checkpoint?.payload.settings).toMatchObject({ baseMapCost: 7 });
    expect(active.checkpoint?.checkpoint).toMatchObject({
      reason: 'activation',
      activationId: 'migration:active-named-dirty-envelope.json:legacy-active',
    });
    expect(active.current.semanticHash).not.toBe(active.checkpoint?.semanticHash);
    expect(migrated.bootstrap).toMatchObject({
      lifecycle: 'historical',
      activeTarget: active.target,
      viewedTarget: active.target,
    });
  });

  it('splits the global divine fetch clock from session quote provenance and retains active strategy context', async () => {
    const source = await snapshot('active-named-dirty-envelope.json');
    const envelope = JSON.parse(source.store.rawValue as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    envelope.state.divinePriceFetchedAt = Date.parse('2026-08-22T11:30:00.000Z');
    envelope.state.loadedStrategyInfo = {
      authorName: 'Fixture author',
      mapCount: 12,
      avgQuant: 100,
      avgRarity: 80,
      avgPack: 40,
      avgCurr: 20,
      runRegex: 'fixture',
    };
    source.store.rawValue = JSON.stringify(envelope);
    const migrated = await migrateSessionEnvelope(source, {
      repositoryId: 'repository:provenance',
      operationId: 'migration:provenance',
      now: NOW,
    });
    expect(migrated.preferences.lastDivineFetchAt).toBe(Date.parse('2026-08-22T11:30:00.000Z'));
    expect(migrated.sessions[0].current.payload.settings).toMatchObject({
      divinePriceQuotedAt: '2026-08-22T11:30:00.000Z',
    });
    expect(migrated.sessions[0].current.payload.strategySourceContext).toMatchObject({
      authorName: 'Fixture author',
      mapCount: 12,
    });
    expect(migrated.sessions[0].checkpoint?.payload.settings).toMatchObject({
      divinePriceQuotedAt: null,
    });
    expect(migrated.sessions[0].checkpoint?.payload.strategySourceContext).toBeNull();
  });
});

describe('WP14 cloned-profile shadow migration', () => {
  it('writes exact raw backups and a semantically verified complete repository', async () => {
    const profile = await tempProfile();
    const source = await snapshot();
    const migrated = await migrateSessionEnvelope(source, {
      repositoryId: 'repository:exact-backup',
      operationId: 'migration:exact-backup',
      now: NOW,
    });
    const result = await migrateLegacyProfileClone({
      userDataPath: profile,
      plan: migrated,
      completedAt: () => new Date('2026-08-22T12:01:00.000Z'),
    });
    expect(result).toMatchObject({ status: 'complete', resumed: false });
    expect(result.legacyCleanupKeys).toEqual([
      LEGACY_STORE_STORAGE_KEY,
      LEGACY_LAYOUT_STORAGE_KEY,
      LEGACY_CHANGELOG_STORAGE_KEY,
    ]);
    const paths = deriveRepositoryPaths(profile);
    const storage = JSON.parse(await readFile(paths.storage, 'utf8')) as Record<string, unknown>;
    expect(storage).toMatchObject({
      repositoryVersion: 1,
      repositoryId: 'repository:exact-backup',
      migration: {
        operationId: 'migration:exact-backup',
        state: 'complete',
        completedAt: '2026-08-22T12:01:00.000Z',
      },
    });
    const migrationFiles = await readdir(paths.migration);
    const manifestName = migrationFiles.find((name) => name.endsWith('.manifest.json')) as string;
    const manifest = JSON.parse(await readFile(join(paths.migration, manifestName), 'utf8')) as {
      entries: Array<{ key: string; relativePath: string | null; byteLength: number; sha256: string | null }>;
    };
    for (const value of migrated.sourceValues) {
      const entry = manifest.entries.find((candidate) => candidate.key === value.key);
      expect(entry).toBeDefined();
      if (value.rawValue === null || entry?.relativePath === null) continue;
      const bytes = await readFile(join(paths.root, entry.relativePath));
      expect(bytes.equals(Buffer.from(value.rawValue, 'utf8'))).toBe(true);
      expect(entry.byteLength).toBe(Buffer.byteLength(value.rawValue, 'utf8'));
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(source.store.rawValue).toBe(await fixture('active-named-dirty-envelope.json'));
  });

  it.each<LegacyMigrationStage>([
    'owner-written',
    'legacy-backed-up',
    'records-written',
    'records-verified',
    'ready-written',
    'root-promoted',
    'complete-written',
  ])('reruns idempotently after a crash at %s', async (failureStage) => {
    const profile = await tempProfile();
    const migrated = await plan('active-named-dirty-envelope.json', `fault:${failureStage}`);
    let failed = false;
    await expect(migrateLegacyProfileClone({
      userDataPath: profile,
      plan: migrated,
      completedAt: () => NOW,
      hooks: {
        afterStage: (stage) => {
          if (!failed && stage === failureStage) {
            failed = true;
            throw new Error(`crash:${stage}`);
          }
        },
      },
    })).rejects.toThrow(`crash:${failureStage}`);
    const rerun = await migrateLegacyProfileClone({
      userDataPath: profile,
      plan: migrated,
      completedAt: () => NOW,
    });
    expect(rerun.status).toBe('complete');
    const repeat = await migrateLegacyProfileClone({
      userDataPath: profile,
      plan: migrated,
      completedAt: () => NOW,
    });
    expect(repeat).toMatchObject({ status: 'complete', resumed: true });
    const storage = JSON.parse(
      await readFile(deriveRepositoryPaths(profile).storage, 'utf8'),
    ) as { migration: { state: string } };
    expect(storage.migration.state).toBe('complete');
    expect((await readdir(profile)).filter((name) => name.endsWith('.staging'))).toEqual([]);
  });

  it('resumes a ready repository after promotion without creating duplicate sessions', async () => {
    const profile = await tempProfile();
    const migrated = await plan('active-named-dirty-envelope.json', 'ready-resume');
    await expect(migrateLegacyProfileClone({
      userDataPath: profile,
      plan: migrated,
      hooks: {
        afterStage: (stage) => {
          if (stage === 'root-promoted') throw new Error('power-loss');
        },
      },
    })).rejects.toThrow('power-loss');
    const paths = deriveRepositoryPaths(profile);
    expect(JSON.parse(await readFile(paths.storage, 'utf8'))).toMatchObject({
      migration: { state: 'ready' },
    });
    await migrateLegacyProfileClone({ userDataPath: profile, plan: migrated });
    expect(await readdir(paths.entries)).toHaveLength(1);
    expect(JSON.parse(await readFile(paths.storage, 'utf8'))).toMatchObject({
      migration: { state: 'complete' },
    });
  });

  it('treats a populated repository without valid storage metadata as damaged', async () => {
    for (const storageValue of [null, '{not-json}']) {
      const profile = await tempProfile();
      const paths = deriveRepositoryPaths(profile);
      await mkdir(paths.preferences, { recursive: true });
      await writeFile(join(paths.preferences, 'sentinel.txt'), 'keep-me');
      if (storageValue !== null) await writeFile(paths.storage, storageValue);
      const migrated = await plan('unnamed-working-envelope.json', `damaged:${String(storageValue)}`);
      await expect(migrateLegacyProfileClone({ userDataPath: profile, plan: migrated }))
        .rejects.toMatchObject<Partial<LegacyMigrationRepositoryError>>({
          kind: 'damaged-repository',
        });
      expect(await readFile(join(paths.preferences, 'sentinel.txt'), 'utf8')).toBe('keep-me');
    }
  });

  it('never cleans staging that is not proven to belong to the operation', async () => {
    const profile = await tempProfile();
    const migrated = await plan('unnamed-working-envelope.json', 'foreign-owner');
    await expect(migrateLegacyProfileClone({
      userDataPath: profile,
      plan: migrated,
      hooks: {
        afterStage: (stage) => {
          if (stage === 'owner-written') throw new Error('stop-after-owner');
        },
      },
    })).rejects.toThrow('stop-after-owner');
    const stageName = (await readdir(profile)).find((name) => name.endsWith('.staging')) as string;
    const stageRoot = join(profile, stageName);
    await writeFile(join(stageRoot, '.migration-owner.json'), JSON.stringify({
      schema: 1,
      operationId: 'somebody-else',
      sourceHash: 'f'.repeat(64),
      repositoryId: 'somebody-else',
    }));
    await writeFile(join(stageRoot, 'sentinel.txt'), 'keep-me');
    await expect(migrateLegacyProfileClone({ userDataPath: profile, plan: migrated }))
      .rejects.toMatchObject<Partial<LegacyMigrationRepositoryError>>({ kind: 'foreign-staging' });
    expect(await readFile(join(stageRoot, 'sentinel.txt'), 'utf8')).toBe('keep-me');
  });

  it('rejects an untrusted migration identity before deriving backup paths', async () => {
    const profile = await tempProfile();
    const migrated = await plan('unnamed-working-envelope.json', 'invalid-identity');
    migrated.createdAt = '../../escape';
    await expect(migrateLegacyProfileClone({ userDataPath: profile, plan: migrated }))
      .rejects.toMatchObject<Partial<LegacyMigrationRepositoryError>>({
        kind: 'verification-failed',
      });
    expect(await readdir(profile)).toEqual([]);
  });
});
