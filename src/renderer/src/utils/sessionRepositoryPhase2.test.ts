import { describe, expect, it, vi } from 'vitest';
import {
  SESSION_REPOSITORY_CHANNEL,
  SessionRepositoryRequestError,
  parseSessionRepositoryRequest,
  type RepositorySessionSummary,
  type RepositoryWorkflow,
  type SessionRepositoryDataMap,
  type SessionRepositoryResponse,
} from '../../../shared/sessionRepositoryIpc';
import { registerSessionRepositoryIpc } from '../../../main/sessionRepositoryIpc';
import type { SessionRepositoryAdapter } from '../../../main/sessionRepositoryAdapter';
import { createSessionRepositoryBridge } from '../../../preload/sessionRepositoryBridge';
import {
  SessionRepositoryClientError,
  createSessionRepositoryClient,
  type SessionRepositoryClient,
} from '../repository/sessionRepositoryClient';
import { createSessionRepositoryStore } from '../repository/sessionRepositoryStore';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const summary = (generation = 3): RepositorySessionSummary => ({
  id: 'session-1',
  name: 'Session One',
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: `2026-08-22T10:0${generation}:00.000Z`,
  generation,
  summary: { mapCount: generation },
  status: 'ready',
});

const workflow = (
  target: RepositoryWorkflow['activeTarget'] = { kind: 'session', sessionId: 'session-1' },
): RepositoryWorkflow => ({
  activeTarget: target,
  viewedTarget: target,
  lifecycle: 'live',
  suspended: false,
  activationId: 'activation-1',
  pendingAtlasBonusSeed: false,
  pendingAtlasBonusValue: null,
});

const bootstrapData: SessionRepositoryDataMap['bootstrap'] = {
  sessions: [summary()],
  workflow: workflow(),
  workflowGeneration: 1,
  preferences: {},
  preferencesGeneration: 1,
  layout: { rawValue: null },
  layoutGeneration: 1,
  repositorySizeBytes: 0,
  migrationCleanup: null,
};

describe('WP14 Phase 2 IPC plumbing', () => {
  it('supports a main-generated named-session identity through save', () => {
    expect(parseSessionRepositoryRequest({
      operation: 'save',
      target: { kind: 'new', name: 'Fresh run' },
      expectedGeneration: null,
      payload: { maps: [] },
    })).toMatchObject({ target: { kind: 'new', name: 'Fresh run' } });
    expect(() => parseSessionRepositoryRequest({
      operation: 'save',
      target: { kind: 'new', name: 'Fresh run' },
      expectedGeneration: 0,
      payload: { maps: [] },
    })).toThrow('null expectedGeneration');
  });

  it('binds and removes exactly one main-process channel', async () => {
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => { handlers.delete(channel); }),
    };
    const adapter = vi.fn().mockResolvedValue({
      ok: true,
      operation: 'open-data-folder',
      data: { opened: true },
    }) as SessionRepositoryAdapter;
    const dispose = registerSessionRepositoryIpc(ipcMain, adapter);

    expect(ipcMain.handle).toHaveBeenCalledOnce();
    await expect(handlers.get(SESSION_REPOSITORY_CHANNEL)?.({}, { operation: 'open-data-folder' }))
      .resolves.toMatchObject({ ok: true, operation: 'open-data-folder' });
    dispose();
    dispose();
    expect(ipcMain.removeHandler).toHaveBeenCalledOnce();
    expect(handlers.has(SESSION_REPOSITORY_CHANNEL)).toBe(false);
  });

  it('validates both preload directions and correlates responses', async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      operation: 'list',
      data: { sessions: [], repositorySizeBytes: 0 },
    });
    const bridge = createSessionRepositoryBridge(invoke);

    await expect(bridge({ operation: 'bootstrap' })).rejects.toThrow('does not match bootstrap');
    expect(invoke).toHaveBeenCalledWith(SESSION_REPOSITORY_CHANNEL, { operation: 'bootstrap' });
    await expect(bridge({ operation: 'bootstrap', path: '/tmp' } as never))
      .rejects.toBeInstanceOf(SessionRepositoryRequestError);
  });

  it('turns structured repository failures into renderer client errors', async () => {
    const response: SessionRepositoryResponse = {
      ok: false,
      operation: 'load',
      error: { code: 'recovery-required', message: 'damaged', retryable: false },
    };
    const client = createSessionRepositoryClient(vi.fn().mockResolvedValue(response));

    await expect(client.request({ operation: 'load', target: { kind: 'working' }, mode: 'inspect' }))
      .rejects.toMatchObject({
        name: 'SessionRepositoryClientError',
        operation: 'load',
        repositoryError: { code: 'recovery-required' },
      } satisfies Partial<SessionRepositoryClientError>);
  });
});

describe('WP14 Phase 2 renderer repository state', () => {
  it('bootstraps summaries without eagerly loading a payload', async () => {
    const request = vi.fn().mockResolvedValue(bootstrapData);
    const store = createSessionRepositoryStore({ request } as unknown as SessionRepositoryClient);

    expect(store.getState().bootstrapStatus).toBe('dormant');
    await store.getState().bootstrap();

    expect(request).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({
      bootstrapStatus: 'ready',
      payloadStatus: 'idle',
      sessions: [summary()],
      loadedPayload: null,
    });
  });

  it('ignores a late lazy-load response after newer navigation', async () => {
    const first = deferred<SessionRepositoryDataMap['load']>();
    const second = deferred<SessionRepositoryDataMap['load']>();
    const request = vi.fn()
      .mockResolvedValueOnce(bootstrapData)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const store = createSessionRepositoryStore({ request } as unknown as SessionRepositoryClient);
    await store.getState().bootstrap();

    const loadFirst = store.getState().load({ kind: 'session', sessionId: 'session-1' });
    const loadSecond = store.getState().load({ kind: 'session', sessionId: 'session-2' });
    second.resolve({
      target: { kind: 'session', sessionId: 'session-2' },
      generation: 7,
      payload: { marker: 'newer' },
      workflow: workflow({ kind: 'session', sessionId: 'session-2' }),
      workflowGeneration: 1,
    });
    await loadSecond;
    first.resolve({
      target: { kind: 'session', sessionId: 'session-1' },
      generation: 3,
      payload: { marker: 'older' },
      workflow: workflow(),
      workflowGeneration: 1,
    });
    await loadFirst;

    expect(store.getState()).toMatchObject({
      payloadStatus: 'ready',
      loadedTarget: { kind: 'session', sessionId: 'session-2' },
      loadedGeneration: 7,
      loadedPayload: { marker: 'newer' },
    });
  });

  it('serializes full snapshots, coalesces queued edits, and advances generations', async () => {
    const firstSave = deferred<SessionRepositoryDataMap['save']>();
    const secondSave = deferred<SessionRepositoryDataMap['save']>();
    const request = vi.fn()
      .mockResolvedValueOnce(bootstrapData)
      .mockResolvedValueOnce({
        target: { kind: 'session', sessionId: 'session-1' },
        generation: 3,
        payload: { revision: 0 },
        workflow: workflow(),
        workflowGeneration: 1,
      })
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const store = createSessionRepositoryStore({ request } as unknown as SessionRepositoryClient);
    await store.getState().bootstrap();
    await store.getState().load({ kind: 'session', sessionId: 'session-1' });

    const saveOne = store.getState().save({ kind: 'session', sessionId: 'session-1' }, { revision: 1 });
    const saveTwo = store.getState().save({ kind: 'session', sessionId: 'session-1' }, { revision: 2 });
    const saveThree = store.getState().save({ kind: 'session', sessionId: 'session-1' }, { revision: 3 });
    await expect(store.getState().save({ kind: 'new', name: 'Other target' }, { revision: 4 }))
      .rejects.toThrow('different session targets');
    await expect(store.getState().bootstrap()).rejects.toThrow('save is pending');
    expect(store.getState().saveStatus).toBe('saving');
    expect(request).toHaveBeenNthCalledWith(3, {
      operation: 'save',
      target: { kind: 'session', sessionId: 'session-1' },
      expectedGeneration: 3,
      payload: { revision: 1 },
    });

    firstSave.resolve({
      target: { kind: 'session', sessionId: 'session-1' },
      generation: 4,
      summary: summary(4),
      workflow: workflow(),
      workflowGeneration: 1,
    });
    await saveOne;
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    expect(request).toHaveBeenNthCalledWith(4, {
      operation: 'save',
      target: { kind: 'session', sessionId: 'session-1' },
      expectedGeneration: 4,
      payload: { revision: 3 },
    });
    expect(store.getState().saveStatus).toBe('saving');

    secondSave.resolve({
      target: { kind: 'session', sessionId: 'session-1' },
      generation: 5,
      summary: summary(5),
      workflow: workflow(),
      workflowGeneration: 1,
    });
    await Promise.all([saveTwo, saveThree]);
    expect(store.getState()).toMatchObject({
      saveStatus: 'saved',
      loadedGeneration: 5,
      loadedPayload: { revision: 3 },
      saveError: null,
    });
  });

  it('retargets queued edits after the main process creates a named session', async () => {
    const firstSave = deferred<SessionRepositoryDataMap['save']>();
    const secondSave = deferred<SessionRepositoryDataMap['save']>();
    const request = vi.fn()
      .mockResolvedValueOnce({
        ...bootstrapData,
        sessions: [],
        workflow: workflow({ kind: 'working' }),
      })
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const store = createSessionRepositoryStore({ request } as unknown as SessionRepositoryClient);
    await store.getState().bootstrap();

    const first = store.getState().save({ kind: 'new', name: 'Fresh run' }, { revision: 1 });
    const queued = store.getState().save({ kind: 'new', name: 'Fresh run' }, { revision: 2 });
    firstSave.resolve({
      target: { kind: 'session', sessionId: 'generated-id' },
      generation: 1,
      summary: { ...summary(1), id: 'generated-id', name: 'Fresh run' },
      workflow: workflow({ kind: 'session', sessionId: 'generated-id' }),
      workflowGeneration: 2,
    });
    await first;
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request).toHaveBeenNthCalledWith(3, {
      operation: 'save',
      target: { kind: 'session', sessionId: 'generated-id' },
      expectedGeneration: 1,
      payload: { revision: 2 },
    });

    secondSave.resolve({
      target: { kind: 'session', sessionId: 'generated-id' },
      generation: 2,
      summary: { ...summary(2), id: 'generated-id', name: 'Fresh run' },
      workflow: workflow({ kind: 'session', sessionId: 'generated-id' }),
      workflowGeneration: 2,
    });
    await queued;
    expect(store.getState()).toMatchObject({
      saveStatus: 'saved',
      viewedTarget: { kind: 'session', sessionId: 'generated-id' },
      loadedTarget: { kind: 'session', sessionId: 'generated-id' },
      loadedGeneration: 2,
      loadedPayload: { revision: 2 },
    });
  });

  it('never reports saved when the repository acknowledgement fails', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(bootstrapData)
      .mockResolvedValueOnce({
        target: { kind: 'session', sessionId: 'session-1' },
        generation: 3,
        payload: { revision: 0 },
        workflow: workflow(),
        workflowGeneration: 1,
      })
      .mockRejectedValueOnce(new Error('disk full'));
    const store = createSessionRepositoryStore({ request } as unknown as SessionRepositoryClient);
    await store.getState().bootstrap();
    await store.getState().load({ kind: 'session', sessionId: 'session-1' });

    await expect(store.getState().save(
      { kind: 'session', sessionId: 'session-1' },
      { revision: 1 },
    )).rejects.toThrow('disk full');
    expect(store.getState()).toMatchObject({ saveStatus: 'failed', saveError: 'disk full' });
  });
});
