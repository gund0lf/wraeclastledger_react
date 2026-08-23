import { describe, expect, it, vi } from 'vitest';
import {
  SESSION_REPOSITORY_CHANNEL,
  SessionRepositoryRequestError,
  parseSessionRepositoryRequest,
  type SessionRepositoryResponse,
} from '../../../shared/sessionRepositoryIpc';
import { registerSessionRepositoryIpc } from '../../../main/sessionRepositoryIpc';
import type { SessionRepositoryAdapter } from '../../../main/sessionRepositoryAdapter';
import { createSessionRepositoryBridge } from '../../../preload/sessionRepositoryBridge';
import {
  SessionRepositoryClientError,
  createSessionRepositoryClient,
} from '../repository/sessionRepositoryClient';

describe('WP14 repository IPC plumbing', () => {
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
