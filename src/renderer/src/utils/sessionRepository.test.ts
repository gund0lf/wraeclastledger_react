import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
import { decodeRecordV1, encodeRecordV1, type JsonObject } from '../../../shared/sessionRecord';
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

describe('WP14 concrete file repository', () => {
  it('opens the recovery folder even when bootstrap has not completed', async () => {
    const profile = await tempProfile();
    const openPath = vi.fn().mockResolvedValue('');
    const repository = new FileSessionRepository({ userDataPath: profile, openPath });

    await expect(repository.openDataFolder({ operation: 'open-data-folder' }))
      .resolves.toEqual({ opened: true });
    expect(openPath).toHaveBeenCalledWith(join(profile, 'ledger-data'));
  });

  it('implements the complete fifteen-operation contract over authoritative files', async () => {
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

  it('keeps one activation baseline and restores the exact pre-edit payload non-destructively', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const originalPayload: JsonObject = {
      maps: [],
      lootItems: [],
      baselineItems: [],
      baselineTotal: 0,
      settings: { scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 100 }] },
      sessionNotes: 'Activation baseline acceptance case',
    };
    const created = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Historical 3333' },
      expectedGeneration: null, payload: originalPayload,
    });
    expect(created.target.kind).toBe('session');
    const sessionId = created.target.kind === 'session' ? created.target.sessionId : '';
    const working = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [] }, activationId: 'activation:working',
    });
    expect(working.generation).toBe(1);
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    const viewed = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId }, mode: 'view',
    });

    const changedOnce = await repository.save({
      operation: 'save', target: { kind: 'session', sessionId }, expectedGeneration: viewed.generation,
      activationId: viewed.workflow.activationId,
      payload: {
        ...originalPayload,
        settings: { scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 1111 }] },
      },
    });
    expect(changedOnce.checkpoint).toMatchObject({ reason: 'activation', isActivationBaseline: true });
    const afterFirstEdit = await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    });
    expect(afterFirstEdit.checkpoints).toHaveLength(1);
    expect(afterFirstEdit.checkpoints[0]).toMatchObject({
      changeCount: 1,
      changes: [{
        label: 'Horned Scarab of Bloodlines price',
        before: '100c',
        after: '1111c',
      }],
    });

    const changedTwice = await repository.save({
      operation: 'save', target: { kind: 'session', sessionId }, expectedGeneration: changedOnce.generation,
      activationId: viewed.workflow.activationId,
      payload: {
        ...originalPayload,
        settings: { scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 1222 }] },
      },
    });
    expect(changedTwice.checkpoint).toBeNull();
    expect((await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    })).checkpoints).toHaveLength(1);

    const restored = await repository.historyRestore({
      operation: 'history-restore', target: { kind: 'session', sessionId },
      checkpointId: afterFirstEdit.checkpoints[0].id, expectedGeneration: changedTwice.generation,
    });
    const restoredPayload = (await repository.load({
      operation: 'load', target: { kind: 'session', sessionId }, mode: 'inspect',
    })).payload;
    expect(restoredPayload).toEqual(originalPayload);

    const afterRestore = await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    });
    const preRestore = afterRestore.checkpoints.find(({ reason }) => reason === 'pre-restore');
    expect(preRestore).toBeDefined();
    expect(preRestore).toMatchObject({
      changes: [{
        label: 'Horned Scarab of Bloodlines price',
        before: '1222c',
        after: '100c',
      }],
    });
    await repository.historyRestore({
      operation: 'history-restore', target: { kind: 'session', sessionId },
      checkpointId: preRestore!.id, expectedGeneration: restored.generation,
    });
    const recoveredEditedPayload = (await repository.load({
      operation: 'load', target: { kind: 'session', sessionId }, mode: 'inspect',
    })).payload;
    expect(recoveredEditedPayload).toMatchObject({
      settings: { scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 1222 }] },
    });
    await repository.releaseLock();
  });

  it('keeps change details specific when the same baseline starts a later activation', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const originalPayload: JsonObject = {
      maps: [],
      settings: { scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 100 }] },
    };
    const created = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Repeated baseline details' },
      expectedGeneration: null, payload: originalPayload,
    });
    const sessionId = created.target.kind === 'session' ? created.target.sessionId : '';
    const firstView = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId }, mode: 'view',
    });
    const firstEdit = await repository.save({
      operation: 'save', target: { kind: 'session', sessionId }, expectedGeneration: firstView.generation,
      activationId: firstView.workflow.activationId,
      payload: {
        ...originalPayload,
        settings: { scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 1111 }] },
      },
    });
    const firstBaseline = (await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    })).checkpoints.find(({ reason }) => reason === 'activation')!;
    await repository.historyRestore({
      operation: 'history-restore', target: { kind: 'session', sessionId },
      checkpointId: firstBaseline.id, expectedGeneration: firstEdit.generation,
    });

    const secondView = await repository.load({
      operation: 'load', target: { kind: 'session', sessionId }, mode: 'view',
    });
    await repository.save({
      operation: 'save', target: { kind: 'session', sessionId }, expectedGeneration: firstEdit.generation + 1,
      activationId: secondView.workflow.activationId,
      payload: {
        ...originalPayload,
        settings: { scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 1222 }] },
      },
    });

    const activationCheckpoints = (await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    })).checkpoints.filter(({ reason }) => reason === 'activation');
    expect(activationCheckpoints).toHaveLength(2);
    const laterBaseline = activationCheckpoints.find(({ id }) => id !== firstBaseline.id)!;
    expect(laterBaseline).toMatchObject({
      changes: [{
        label: 'Horned Scarab of Bloodlines price',
        before: '100c',
        after: '1222c',
      }],
    });
    expect(firstBaseline).toMatchObject({
      changes: [{
        label: 'Horned Scarab of Bloodlines price',
        before: '100c',
        after: '1111c',
      }],
    });
    await repository.releaseLock();
  });

  it('resumes the same activation across restart without creating another baseline', async () => {
    const profile = await tempProfile();
    const first = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await first.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const created = await first.save({
      operation: 'save', target: { kind: 'new', name: 'Restart activation' },
      expectedGeneration: null, payload: { maps: [{ id: 'before' }] },
    });
    const sessionId = created.target.kind === 'session' ? created.target.sessionId : '';
    const activated = await first.load({
      operation: 'load', target: { kind: 'session', sessionId }, mode: 'resume',
    });
    const edited = await first.save({
      operation: 'save', target: { kind: 'session', sessionId }, expectedGeneration: activated.generation,
      activationId: activated.workflow.activationId, payload: { maps: [{ id: 'first-edit' }] },
    });
    expect((await first.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    })).checkpoints).toHaveLength(1);
    await first.releaseLock();

    const restarted = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    const bootstrap = await restarted.bootstrap({ operation: 'bootstrap' });
    expect(bootstrap.workflow.activationId).toBe(activated.workflow.activationId);
    await restarted.save({
      operation: 'save', target: { kind: 'session', sessionId }, expectedGeneration: edited.generation,
      activationId: bootstrap.workflow.activationId, payload: { maps: [{ id: 'second-edit' }] },
    });
    expect((await restarted.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    })).checkpoints).toHaveLength(1);
    await restarted.releaseLock();
  });

  it('propagates unexpected target read failures without rewriting workflow to a fallback', async () => {
    const profile = await tempProfile();
    const first = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await first.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const created = await first.save({
      operation: 'save', target: { kind: 'new', name: 'Permission read target' },
      expectedGeneration: null, payload: { maps: [{ id: 'must-remain-selected' }] },
    });
    const sessionId = created.target.kind === 'session' ? created.target.sessionId : '';
    await first.releaseLock();

    const denied = Object.assign(new Error('Session read denied'), { code: 'EACCES' });
    const blocked = new FileSessionRepository({
      userDataPath: profile,
      openPath: async () => '',
      onSessionRead: (target) => {
        if (target.kind === 'session' && target.sessionId === sessionId) throw denied;
      },
    });
    await expect(blocked.bootstrap({ operation: 'bootstrap' })).rejects.toBe(denied);
    await blocked.releaseLock();

    const recovered = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    const bootstrap = await recovered.bootstrap({ operation: 'bootstrap' });
    expect(bootstrap.workflow.activeTarget).toEqual({ kind: 'session', sessionId });
    expect(bootstrap.workflow.viewedTarget).toEqual({ kind: 'session', sessionId });
    await recovered.releaseLock();
  });

  it('creates coarse periodic recovery without checkpointing a fresh empty draft', async () => {
    const profile = await tempProfile();
    let clock = new Date('2026-08-23T10:00:00.000Z');
    const repository = new FileSessionRepository({
      userDataPath: profile,
      openPath: async () => '',
      now: () => clock,
    });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const fresh = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [] }, activationId: 'activation:fresh', freshEmptyWorking: true,
    });
    clock = new Date('2026-08-23T10:31:00.000Z');
    const firstMeaningful = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: fresh.generation,
      payload: { maps: [{ id: 'first' }] }, activationId: 'activation:fresh',
    });
    expect((await repository.historyList({
      operation: 'history-list', target: { kind: 'working' },
    })).checkpoints).toEqual([]);

    clock = new Date('2026-08-23T11:02:00.000Z');
    const periodic = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: firstMeaningful.generation,
      payload: { maps: [{ id: 'first' }, { id: 'second' }] }, activationId: 'activation:fresh',
    });
    expect(periodic.checkpoint).toMatchObject({ reason: 'periodic', isActivationBaseline: false });
    expect((await repository.historyList({
      operation: 'history-list', target: { kind: 'working' },
    })).checkpoints).toHaveLength(1);
    await repository.releaseLock();
  });

  it('applies the 24-version bound on disk while pinning the current activation baseline', async () => {
    const profile = await tempProfile();
    let clock = new Date('2026-08-23T08:00:00.000Z');
    const repository = new FileSessionRepository({
      userDataPath: profile,
      openPath: async () => '',
      now: () => clock,
    });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const created = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Bounded history' },
      expectedGeneration: null, payload: { maps: [{ id: 'initial' }] },
    });
    const sessionId = created.target.kind === 'session' ? created.target.sessionId : '';
    let generation = created.generation;
    for (let index = 0; index < 30; index += 1) {
      clock = new Date(clock.getTime() + 60_000);
      const viewed = await repository.load({
        operation: 'load', target: { kind: 'session', sessionId }, mode: 'view',
      });
      const saved = await repository.save({
        operation: 'save', target: { kind: 'session', sessionId }, expectedGeneration: generation,
        activationId: viewed.workflow.activationId, payload: { maps: [{ id: `edit-${index}` }] },
      });
      generation = saved.generation;
    }
    const history = await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId },
    });
    expect(history.checkpoints).toHaveLength(24);
    expect(history.checkpoints.filter(({ isActivationBaseline }) => isActivationBaseline)).toHaveLength(1);
    const versions = join(deriveSessionDirectory(deriveRepositoryPaths(profile).root, sessionId), 'versions');
    expect((await readdir(versions)).filter((name) => name.endsWith('.wlrec.gz'))).toHaveLength(24);
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

  it('preserves a pre-journal abandoned import path without renaming it on every bootstrap', async () => {
    const profile = await tempProfile();
    const first = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await first.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    await first.releaseLock();

    const transactions = join(profile, 'ledger-data', 'transactions');
    await mkdir(join(transactions, 'import-pre-journal-evidence'), { recursive: true });
    const second = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await second.bootstrap({ operation: 'bootstrap' });
    await second.releaseLock();
    const afterFirstRecovery = await readdir(transactions);
    expect(afterFirstRecovery).toHaveLength(1);
    expect(afterFirstRecovery[0]).toMatch(/^abandoned-import-pre-journal-evidence-/);

    const third = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await third.bootstrap({ operation: 'bootstrap' });
    await third.releaseLock();
    expect(await readdir(transactions)).toEqual(afterFirstRecovery);
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

  it('does not create unnamed trash after a hidden working draft is named before replacement', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    const bootstrap = await repository.bootstrap({
      operation: 'bootstrap', migrationPlan: await migrationPlan(),
    });
    const historicalTarget = {
      kind: 'session' as const,
      sessionId: bootstrap.sessions[0].id,
    };
    const workingPayload = {
      maps: [],
      sessionNotes: '',
      strategySourceContext: { authorName: 'Traceur', runRegex: 'keep-me' },
    };
    const working = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: workingPayload, activationId: 'activation:hidden-working',
    });
    await repository.load({
      operation: 'load', target: { kind: 'working' }, mode: 'resume',
    });
    const historical = await repository.load({
      operation: 'load', target: historicalTarget, mode: 'view',
    });
    expect(historical.workflow).toMatchObject({
      activeTarget: { kind: 'working' },
      viewedTarget: historicalTarget,
      lifecycle: 'historical',
    });

    const named = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Protected strategy draft' },
      expectedGeneration: null, payload: workingPayload,
    });
    expect(named.target.kind).toBe('session');
    const namedTarget = named.target.kind === 'session' ? named.target : historicalTarget;
    const protectedWorkflow = {
      ...historical.workflow,
      activeTarget: namedTarget,
      viewedTarget: historicalTarget,
    };
    await repository.save({
      operation: 'save', target: { kind: 'bootstrap' },
      expectedGeneration: named.workflowGeneration,
      payload: protectedWorkflow,
    });

    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: working.generation,
      payload: { maps: [], sessionNotes: '', strategySourceContext: null },
      replacement: true, activationId: 'activation:new-strategy', freshEmptyWorking: true,
    });

    expect((await repository.trashList({ operation: 'trash-list' })).entries).toEqual([]);
    expect((await repository.load({
      operation: 'load', target: namedTarget, mode: 'inspect',
    })).payload).toEqual(workingPayload);
    await repository.releaseLock();
  });

  it('replaces a fresh empty working slot without manufacturing recovery trash or history', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const fresh = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [], settings: { leagueName: 'Mirage', divinePrice: 200 } },
      activationId: 'activation:fresh-before-delete', freshEmptyWorking: true,
    });
    const autoManaged = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: fresh.generation,
      payload: {
        maps: [],
        settings: {
          leagueName: 'Mirage',
          divinePrice: 208,
          divinePriceQuotedAt: '2026-08-23T12:00:00.000Z',
        },
      },
      activationId: 'activation:fresh-before-delete', freshEmptyWorking: true,
    });
    const replaced = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: autoManaged.generation,
      payload: { maps: [], settings: { leagueName: 'Mirage', divinePrice: 201 } },
      replacement: true, activationId: 'activation:fresh-after-delete', freshEmptyWorking: true,
    });

    expect(replaced.generation).toBe(autoManaged.generation + 1);
    expect((await repository.trashList({ operation: 'trash-list' })).entries).toEqual([]);
    expect((await repository.historyList({
      operation: 'history-list', target: { kind: 'working' },
    })).checkpoints).toEqual([]);
    await repository.releaseLock();
  });

  it('adopts an older unmarked empty working slot before replacing it', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const legacyPayload = {
      maps: [],
      settings: {
        leagueName: 'Allflame',
        divinePrice: 208,
        divinePriceQuotedAt: '2026-08-23T13:16:00.000Z',
      },
    };
    const legacy = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: legacyPayload, activationId: 'activation:old-empty-without-marker',
    });
    const adopted = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: legacy.generation,
      payload: legacyPayload, freshEmptyWorking: true,
    });
    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: adopted.generation,
      payload: { maps: [], settings: { leagueName: 'Allflame', divinePrice: 0 } },
      replacement: true, activationId: 'activation:replacement', freshEmptyWorking: true,
    });

    expect((await repository.trashList({ operation: 'trash-list' })).entries).toEqual([]);
    expect((await repository.historyList({
      operation: 'history-list', target: { kind: 'working' },
    })).checkpoints).toEqual([]);
    await repository.releaseLock();
  });

  it('lists, restores and permanently deletes Recently Deleted entries', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const named = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Recover me' }, expectedGeneration: null,
      payload: { maps: [{ id: 'recover-map' }], sessionNotes: 'recoverable' },
    });
    const namedId = named.target.kind === 'session' ? named.target.sessionId : '';
    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [] }, activationId: 'activation:trash-test', freshEmptyWorking: true,
    });
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    const deleted = await repository.delete({
      operation: 'delete', sessionId: namedId, expectedGeneration: named.generation,
    });
    const listed = await repository.trashList({ operation: 'trash-list' });
    expect(listed.entries).toEqual([
      expect.objectContaining({
        recoveryId: deleted.recoveryId,
        displayName: 'Recover me',
        sourceKind: 'named',
        sessionId: namedId,
        status: 'ready',
      }),
    ]);

    const restored = await repository.trashRestore({
      operation: 'trash-restore', recoveryId: deleted.recoveryId,
    });
    expect(restored.restoredSessionId).toBe(namedId);
    expect((await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: namedId }, mode: 'inspect',
    })).payload).toMatchObject({ maps: [{ id: 'recover-map' }], sessionNotes: 'recoverable' });
    expect((await repository.historyList({
      operation: 'history-list', target: { kind: 'session', sessionId: namedId },
    })).checkpoints).toEqual([
      expect.objectContaining({ reason: 'destructive' }),
    ]);
    expect((await repository.trashList({ operation: 'trash-list' })).entries).toEqual([]);

    const restoredSummary = restored.sessions.find(({ id }) => id === namedId)!;
    const deletedAgain = await repository.delete({
      operation: 'delete', sessionId: namedId, expectedGeneration: restoredSummary.generation,
    });
    const permanentlyDeleted = await repository.trashDelete({
      operation: 'trash-delete', recoveryId: deletedAgain.recoveryId,
    });
    expect(permanentlyDeleted.entries).toEqual([]);
    await repository.releaseLock();
  });

  it('restores a replaced unnamed draft as an independent named session', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const first = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [{ id: 'draft-map' }], sessionNotes: 'draft' }, activationId: 'activation:draft',
    });
    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: first.generation,
      payload: { maps: [], sessionNotes: '' }, replacement: true,
      activationId: 'activation:fresh-replacement', freshEmptyWorking: true,
    });
    const trash = await repository.trashList({ operation: 'trash-list' });
    expect(trash.entries).toHaveLength(1);
    const restored = await repository.trashRestore({
      operation: 'trash-restore', recoveryId: trash.entries[0].recoveryId,
    });
    expect(restored.restoredSessionId).not.toBe('');
    expect((await repository.load({
      operation: 'load',
      target: { kind: 'session', sessionId: restored.restoredSessionId },
      mode: 'inspect',
    })).payload).toMatchObject({ maps: [{ id: 'draft-map' }], sessionNotes: 'draft' });
    await repository.releaseLock();
  });

  it('restores a deleted named session under a new identity when its old id was re-imported', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const named = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Original recoverable' }, expectedGeneration: null,
      payload: { maps: [{ id: 'original-map' }], sessionNotes: 'original recoverable payload' },
    });
    const namedId = named.target.kind === 'session' ? named.target.sessionId : '';
    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [] }, activationId: 'activation:trash-conflict', freshEmptyWorking: true,
    });
    await repository.load({ operation: 'load', target: { kind: 'working' }, mode: 'resume' });
    const deleted = await repository.delete({
      operation: 'delete', sessionId: namedId, expectedGeneration: named.generation,
    });
    await repository.importDocument({
      operation: 'import',
      document: JSON.stringify({
        version: '1.0',
        sessions: [portableSession(namedId, 'Re-imported replacement', 'replacement')],
      }),
      conflictMode: 'skip',
    });

    const restored = await repository.trashRestore({
      operation: 'trash-restore', recoveryId: deleted.recoveryId,
    });
    expect(restored.restoredSessionId).not.toBe(namedId);
    expect(restored.sessions.some(({ id }) => id === namedId)).toBe(true);
    expect(restored.sessions.some(({ id }) => id === restored.restoredSessionId)).toBe(true);
    expect((await repository.load({
      operation: 'load', target: { kind: 'session', sessionId: namedId }, mode: 'inspect',
    })).payload).toMatchObject({ maps: [{ id: 'map-replacement' }], sessionNotes: 'replacement' });
    expect((await repository.load({
      operation: 'load',
      target: { kind: 'session', sessionId: restored.restoredSessionId },
      mode: 'inspect',
    })).payload).toMatchObject({ maps: [{ id: 'original-map' }], sessionNotes: 'original recoverable payload' });
    await repository.releaseLock();
  });

  it('checkpoints the state before an explicit destructive payload replacement', async () => {
    const profile = await tempProfile();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const original = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [{ id: 'keep-before-clear' }] }, activationId: 'activation:clear',
    });
    const cleared = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: original.generation,
      payload: { maps: [] }, activationId: 'activation:clear', checkpointReason: 'destructive',
    });
    expect(cleared.checkpoint).toMatchObject({ reason: 'destructive' });
    const history = await repository.historyList({ operation: 'history-list', target: { kind: 'working' } });
    await repository.historyRestore({
      operation: 'history-restore', target: { kind: 'working' },
      checkpointId: history.checkpoints[0].id, expectedGeneration: cleared.generation,
    });
    expect((await repository.load({
      operation: 'load', target: { kind: 'working' }, mode: 'inspect',
    })).payload).toMatchObject({ maps: [{ id: 'keep-before-clear' }] });
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

  it('keeps working recovery metadata when both replacement and rollback fail', async () => {
    const profile = await tempProfile();
    let failCommit = false;
    const repository = new FileSessionRepository({
      userDataPath: profile,
      openPath: async () => '',
      onSessionCommit: () => {
        if (failCommit) throw new Error('injected session commit failure');
      },
      onRecoveryRollback: () => {
        throw new Error('injected recovery rollback failure');
      },
    });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    const working = await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null,
      payload: { maps: [{ id: 'recoverable-working' }] },
    });
    failCommit = true;
    await expect(repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: working.generation,
      payload: { maps: [], sessionNotes: 'replacement' }, replacement: true,
    })).rejects.toThrow('Working replacement and its recovery rollback both failed');
    const trash = await repository.trashList({ operation: 'trash-list' });
    expect(trash.entries).toHaveLength(1);
    expect(trash.entries[0]).toMatchObject({ sourceKind: 'working', status: 'ready' });
    await repository.releaseLock();
  });

  it('keeps named recovery metadata when workflow and rollback both fail', async () => {
    const profile = await tempProfile();
    let failWorkflow = false;
    let failRollback = false;
    const repository = new FileSessionRepository({
      userDataPath: profile,
      openPath: async () => '',
      onWorkflowWrite: () => {
        if (failWorkflow) throw new Error('injected workflow failure');
      },
      onRecoveryRollback: () => {
        if (failRollback) throw new Error('injected recovery rollback failure');
      },
    });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan() });
    await repository.save({
      operation: 'save', target: { kind: 'working' }, expectedGeneration: null, payload: { maps: [] },
    });
    const named = await repository.save({
      operation: 'save', target: { kind: 'new', name: 'Rollback evidence' },
      expectedGeneration: null, payload: { maps: [{ id: 'recoverable-named' }] },
    });
    const sessionId = named.target.kind === 'session' ? named.target.sessionId : '';
    failWorkflow = true;
    failRollback = true;
    await expect(repository.delete({
      operation: 'delete', sessionId, expectedGeneration: named.generation,
    })).rejects.toThrow('Session moved to recovery but its workflow update and rollback both failed');
    const trash = await repository.trashList({ operation: 'trash-list' });
    expect(trash.entries).toHaveLength(1);
    expect(trash.entries[0]).toMatchObject({ sourceKind: 'named', sessionId, status: 'ready' });
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

  it('allows rebuildable catalog metadata to advance before legacy cleanup', async () => {
    const profile = await tempProfile();
    const plan = await migrationPlan();
    const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '' });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan });
    const paths = deriveRepositoryPaths(profile);
    const catalog = await decodeRecordV1(new Uint8Array(await readFile(paths.catalog)));
    const body = catalog.body as JsonObject;
    await writeFile(paths.catalog, await encodeRecordV1('catalog', 1, {
      ...body,
      generation: Number(body.generation) + 1,
    }));

    await expect(repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan }))
      .resolves.toMatchObject({ sessions: [{ status: 'ready' }] });
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
