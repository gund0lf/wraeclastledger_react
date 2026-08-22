import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileSessionRepository,
  SessionRepositoryLockedError,
} from '../../../main/sessionRepository';
import {
  CURRENT_RECORD_NAME,
  deriveRepositoryPaths,
  deriveSessionDirectory,
} from '../../../main/sessionRepositoryCore';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  type LegacyStorageSnapshot,
} from '../../../shared/sessionMigration';
import { migrateSessionEnvelope } from '../repository/legacySessionMigration';

const roots: string[] = [];
const NOW = new Date('2026-08-22T16:00:00.000Z');

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempProfile(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'wl-wp14-repository-'));
  roots.push(root);
  return root;
}

async function migrationPlan() {
  const snapshot: LegacyStorageSnapshot = {
    store: {
      key: LEGACY_STORE_STORAGE_KEY,
      rawValue: await readFile(
        new URL('./__fixtures__/wp14/active-named-dirty-envelope.json', import.meta.url),
        'utf8',
      ),
    },
    layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: '{"fixture":"layout"}' },
    changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: '1.0.79' },
  };
  return migrateSessionEnvelope(snapshot, {
    repositoryId: 'repository:phase-4-test',
    operationId: 'migration:phase-4-test',
    now: NOW,
  });
}

function portableSession(id: string, name: string, marker: string) {
  return {
    id,
    name,
    createdAt: '2026-08-22T15:00:00.000Z',
    maps: [{ id: `map-${marker}`, name: marker }],
    lootItems: [],
    baselineItems: [],
    baselineTotal: 0,
    manualLootItems: [],
    manualStatistics: {},
    settings: { leagueName: 'Mirage' },
    notes: marker,
    investmentNeutralization: 0,
    investmentDismissed: false,
    strategySourceContext: null,
  };
}

describe('WP14 Phase 4 concrete file repository', () => {
  it('opens the recovery folder even when bootstrap has not completed', async () => {
    const profile = await tempProfile();
    const openPath = vi.fn().mockResolvedValue('');
    const repository = new FileSessionRepository({ userDataPath: profile, openPath });

    await expect(repository.openDataFolder({ operation: 'open-data-folder' }))
      .resolves.toEqual({ opened: true });
    expect(openPath).toHaveBeenCalledWith(join(profile, 'ledger-data'));
  });

  it('implements the complete twelve-operation contract over authoritative files', async () => {
    const profile = await tempProfile();
    const openPath = vi.fn().mockResolvedValue('');
    const repository = new FileSessionRepository({ userDataPath: profile, openPath });
    const bootstrap = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const originalId = bootstrap.sessions[0].id;
    expect(bootstrap.repositorySizeBytes).toBeGreaterThan(0);
    await expect(readFile(join(profile, 'ledger-data', 'README.txt'), 'utf8'))
      .resolves.toContain('line 1 is a JSON integrity header');
    expect((await repository.list({ operation: 'list' })).sessions).toHaveLength(1);

    const loaded = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: originalId }, mode: 'inspect',
    });
    expect(loaded.workflowGeneration).toBe(bootstrap.workflowGeneration);

    const preferences = await repository.save({
      operation: 'save', target: { kind: 'preferences' },
      expectedGeneration: bootstrap.preferencesGeneration, payload: { marker: 'preferences' },
    });
    const layout = await repository.save({
      operation: 'save', target: { kind: 'layout' },
      expectedGeneration: bootstrap.layoutGeneration, payload: { rawValue: '{"layout":2}' },
    });
    expect(preferences.generation).toBe(bootstrap.preferencesGeneration + 1);
    expect(layout.generation).toBe(bootstrap.layoutGeneration + 1);

    const workflowSave = await repository.save({
      operation: 'save', target: { kind: 'bootstrap' },
      expectedGeneration: bootstrap.workflowGeneration, payload: bootstrap.workflow,
    });
    expect(workflowSave.workflowGeneration).toBe(bootstrap.workflowGeneration + 1);

    const named = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Filesystem copy' },
      expectedGeneration: null, payload: loaded.payload,
    });
    expect(named.target.kind).toBe('session');
    const namedId = named.target.kind === 'session' ? named.target.sessionId : '';
    const renamed = await repository.rename({
      operation: 'rename', sessionId: namedId, name: 'Renamed copy', expectedGeneration: named.generation,
    });
    expect(renamed.name).toBe('Renamed copy');

    const history = await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId: originalId },
    });
    expect(history.checkpoints.length).toBeGreaterThan(0);
    const restored = await repository.historyRestore({
      operation: 'history-restore', target: { kind: 'session', sessionId: originalId },
      checkpointId: history.checkpoints[0].id, expectedGeneration: loaded.generation,
    });
    expect(restored.generation).toBe(loaded.generation + 1);

    const exported = await repository.exportDocument({ operation: 'export', sessionIds: [originalId] });
    expect(JSON.parse(exported.document)).toMatchObject({ version: '1.0' });
    const imported = await repository.importDocument({
      operation: 'import', document: exported.document, conflictMode: 'skip',
    });
    expect(imported.importedSessionIds).toEqual([]);

    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null, payload: { maps: [] },
    });
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    const deleted = await repository.delete({
      operation: 'delete', sessionId: namedId, expectedGeneration: renamed.generation,
    });
    expect(deleted.sessions.some(({ id }) => id === namedId)).toBe(false);
    await expect(repository.retry({ operation: 'retry', operationId: 'already-finished' }))
      .resolves.toEqual({ operationId: 'already-finished', status: 'completed' });
    await expect(repository.openDataFolder({ operation: 'open-data-folder' }))
      .resolves.toEqual({ opened: true });
    expect(openPath).toHaveBeenCalledOnce();
    await repository.releaseLock();
  });

  it('rolls back every entry when a staged batch import fails after its first commit', async () => {
    const profile = await tempProfile();
    let fail = true;
    const repository = new FileSessionRepository({
      userDataPath: profile,
      openPath: async () => '',
      onImportBoundary: (boundary, index) => {
        if (fail && boundary === 'after-commit' && index === 0) throw new Error('injected import failure');
      },
    });
    const bootstrap = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const existingId = bootstrap.sessions[0].id;
    const before = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: existingId }, mode: 'inspect',
    });
    const document = JSON.stringify({
      version: '1.0',
      sessions: [
        portableSession(existingId, 'Overwritten', 'changed'),
        portableSession('new-import-id', 'New import', 'new'),
      ],
    });
    await expect(repository.importDocument({ operation: 'import', document, conflictMode: 'overwrite' }))
      .rejects.toThrow('injected import failure');
    const after = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: existingId }, mode: 'inspect',
    });
    expect(after.payload).toEqual(before.payload);
    expect((await repository.list({ operation: 'list' })).sessions.map(({ id }) => id))
      .not.toContain('new-import-id');

    fail = false;
    const result = await repository.importDocument({ operation: 'import', document, conflictMode: 'overwrite' });
    expect(result.importedSessionIds).toEqual([existingId, 'new-import-id']);
    await repository.releaseLock();
  });

  it('moves a meaningful replaced working draft to recoverable trash', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const first = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [{ id: 'draft-map' }], sessionNotes: 'draft' },
    });
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    const replacement = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: first.generation,
      payload: { maps: [], sessionNotes: '' }, replacement: true,
    });
    expect(replacement.generation).toBe(1);
    const trash = join(profile, 'ledger-data', 'sessions', 'trash');
    const recoveryEntries = await readdir(trash);
    expect(recoveryEntries).toHaveLength(1);
    const metadata = JSON.parse(await readFile(join(trash, recoveryEntries[0], 'recovery.json'), 'utf8'));
    expect(metadata).toMatchObject({ sourceKind: 'working', originalGeneration: first.generation });
    await repository.releaseLock();
  });

  it('rolls back unacknowledged create and delete identity transitions when the workflow pointer fails', async () => {
    const profile = await tempProfile();
    let failWorkflow = false;
    const repository = new FileSessionRepository({
      userDataPath: profile,
      openPath: async () => '',
      onWorkflowWrite: () => {
        if (failWorkflow) throw new Error('injected workflow failure');
      },
    });
    const bootstrap = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const originalIds = bootstrap.sessions.map(({ id }) => id);

    failWorkflow = true;
    await expect(repository.save({
      operation: 'save', target: { kind: 'new', name: 'Unacknowledged copy' },
      expectedGeneration: null, payload: { maps: [] },
    })).rejects.toThrow('injected workflow failure');
    expect((await repository.list({ operation: 'list' })).sessions.map(({ id }) => id)).toEqual(originalIds);

    failWorkflow = false;
    const working = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null, payload: { maps: [] },
    });
    const named = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Delete rollback' },
      expectedGeneration: null, payload: { maps: [{ id: 'kept' }] },
    });
    expect(named.target.kind).toBe('session');
    const namedId = named.target.kind === 'session' ? named.target.sessionId : '';
    expect(working.generation).toBe(1);

    failWorkflow = true;
    await expect(repository.delete({
      operation: 'delete', sessionId: namedId, expectedGeneration: named.generation,
    })).rejects.toThrow('injected workflow failure');
    expect((await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: namedId }, mode: 'inspect',
    })).payload).toMatchObject({ maps: [{ id: 'kept' }] });
    await repository.releaseLock();
  });

  it('keeps an inactive unrecoverable session visible and falls back to a valid live target', async () => {
    const profile = await tempProfile();
    const first = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    const bootstrap = await first.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const damagedId = bootstrap.sessions[0].id;
    await first.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null, payload: { maps: [] },
    });
    await first.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    await first.releaseLock();

    const paths = deriveRepositoryPaths(profile);
    const directory = deriveSessionDirectory(paths.root, damagedId);
    await writeFile(join(directory, CURRENT_RECORD_NAME), 'corrupt-current');
    await writeFile(join(directory, 'current.bak'), 'corrupt-backup');

    const second = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    const recovered = await second.bootstrap({ operation: 'bootstrap' });
    expect(recovered.sessions.find(({ id }) => id === damagedId)?.status).toBe('damaged');
    expect(recovered.workflow).toMatchObject({
      activeTarget: { kind: 'working' }, viewedTarget: { kind: 'working' }, lifecycle: 'live',
    });
    await expect(second.load({
      operation: 'load', target: { kind: 'session', sessionId: damagedId }, mode: 'inspect',
    })).rejects.toThrow('damaged');
    await second.releaseLock();
  });

  it('performs the required second semantic verification before legacy cleanup', async () => {
    const profile = await tempProfile();
    const plan = await migrationPlan();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    const bootstrap = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan });
    const id = bootstrap.sessions[0].id;
    const paths = deriveRepositoryPaths(profile);
    const directory = deriveSessionDirectory(paths.root, id);
    await writeFile(join(directory, CURRENT_RECORD_NAME), 'corrupt-after-first-verification');
    await expect(repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan }))
      .rejects.toThrow('header');
    await repository.releaseLock();
  });

  it('refuses a live repository owner and explicitly preserves a stale lock', async () => {
    const profile = await tempProfile();
    const first = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await first.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const second = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await expect(second.bootstrap({ operation: 'bootstrap' })).rejects.toBeInstanceOf(SessionRepositoryLockedError);
    await first.releaseLock();

    await writeFile(join(profile, 'ledger-data.lock'), JSON.stringify({
      token: 'stale', pid: 2_147_483_647, startedAt: '2026-08-21T00:00:00.000Z',
    }));
    await second.bootstrap({ operation: 'bootstrap' });
    expect((await readdir(profile)).some((name) => name.startsWith('ledger-data.lock.stale-'))).toBe(true);
    await second.releaseLock();
  });
});
