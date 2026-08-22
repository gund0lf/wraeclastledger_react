import { describe, expect, it, vi } from 'vitest';
import {
  SessionRepositoryRequestError,
  assertSessionRepositoryResponse,
  parseSessionRepositoryRequest,
} from '../../../shared/sessionRepositoryIpc';
import {
  GenerationConflictError,
  RecordSizeLimitError,
  RepositoryRecoveryRequiredError,
  UnsupportedContentVersionError,
} from '../../../main/sessionRepositoryCore';
import { RecordValidationError } from '../../../shared/sessionRecord';
import {
  createSessionRepositoryAdapter,
  mapSessionRepositoryError,
  type SessionRepositoryPort,
} from '../../../main/sessionRepositoryAdapter';

function repositoryPort(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    bootstrap: vi.fn(),
    list: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    historyList: vi.fn(),
    historyRestore: vi.fn(),
    importDocument: vi.fn(),
    exportDocument: vi.fn(),
    retry: vi.fn(),
    openDataFolder: vi.fn(),
    ...overrides,
  };
}

describe('WP14 repository IPC request contract', () => {
  it.each([
    { operation: 'bootstrap' },
    { operation: 'list' },
    { operation: 'load', target: { kind: 'working' } },
    { operation: 'save', target: { kind: 'session', sessionId: 'session-1' }, expectedGeneration: 2, payload: { maps: [] } },
    { operation: 'save', target: { kind: 'new', name: 'New session' }, expectedGeneration: null, payload: { maps: [] } },
    { operation: 'rename', sessionId: 'session-1', name: 'Renamed', expectedGeneration: 2 },
    { operation: 'delete', sessionId: 'session-1', expectedGeneration: 2 },
    { operation: 'history-list', target: { kind: 'session', sessionId: 'session-1' } },
    { operation: 'history-restore', target: { kind: 'working' }, checkpointId: 'checkpoint-1', expectedGeneration: 2 },
    { operation: 'import', document: '{"version":1}' },
    { operation: 'export', sessionIds: ['session-1'] },
    { operation: 'retry', operationId: 'operation-1' },
    { operation: 'open-data-folder' },
  ])('accepts the $operation operation without paths', (request) => {
    expect(parseSessionRepositoryRequest(request)).toEqual(request);
  });

  it('rejects renderer-supplied paths at the top level or nested in payloads', () => {
    expect(() => parseSessionRepositoryRequest({ operation: 'load', target: { kind: 'working' }, path: 'C:\\data' }))
      .toThrow(SessionRepositoryRequestError);
    expect(() => parseSessionRepositoryRequest({
      operation: 'save',
      target: { kind: 'working' },
      expectedGeneration: null,
      payload: { directory: 'C:\\data' },
    })).toThrow('must not supply filesystem paths');
  });

  it('rejects unknown fields and malformed generation tokens', () => {
    expect(() => parseSessionRepositoryRequest({ operation: 'bootstrap', surprise: true }))
      .toThrow('unexpected or missing fields');
    expect(() => parseSessionRepositoryRequest({
      operation: 'delete', sessionId: 'session-1', expectedGeneration: -1,
    })).toThrow('non-negative integer');
  });
});

describe('WP14 repository IPC response and error contract', () => {
  it('validates success and structured failure envelopes', () => {
    expect(() => assertSessionRepositoryResponse({
      ok: true,
      operation: 'open-data-folder',
      data: { opened: true },
    })).not.toThrow();
    expect(() => assertSessionRepositoryResponse({
      ok: true,
      operation: 'list',
      data: {
        sessions: [{
          id: 'session-1',
          name: 'Session One',
          createdAt: '2026-08-22T10:00:00.000Z',
          updatedAt: '2026-08-22T10:01:00.000Z',
          generation: 1,
          summary: {},
        }],
      },
    })).not.toThrow();
    expect(() => assertSessionRepositoryResponse({
      ok: false,
      operation: 'save',
      error: { code: 'generation-conflict', message: 'stale', retryable: true },
    })).not.toThrow();
  });

  it('rejects malformed operation data and unknown error codes', () => {
    expect(() => assertSessionRepositoryResponse({
      ok: true,
      operation: 'open-data-folder',
      data: { opened: false },
    })).toThrow('opened must be true');
    expect(() => assertSessionRepositoryResponse({
      ok: true,
      operation: 'list',
      data: {
        sessions: [{
          id: 'session-1',
          name: 'Session One',
          createdAt: 'not-a-date',
          updatedAt: '2026-08-22T10:01:00.000Z',
          generation: 1,
          summary: {},
        }],
      },
    })).toThrow('UTC ISO timestamp');
    expect(() => assertSessionRepositoryResponse({
      ok: false,
      operation: null,
      error: { code: 'made-up', message: 'bad', retryable: false },
    })).toThrow('error code is invalid');
  });

  it('maps every Phase 1 repository error into the typed taxonomy', () => {
    expect(mapSessionRepositoryError(new GenerationConflictError(1, 2))).toMatchObject({ code: 'generation-conflict', retryable: true });
    expect(mapSessionRepositoryError(new RepositoryRecoveryRequiredError('damaged'))).toMatchObject({ code: 'recovery-required', retryable: false });
    expect(mapSessionRepositoryError(new UnsupportedContentVersionError('session', 2, 1))).toMatchObject({ code: 'unsupported-version' });
    expect(mapSessionRepositoryError(new RecordSizeLimitError(2, 1))).toMatchObject({ code: 'size-limit' });
    expect(mapSessionRepositoryError(new RecordValidationError('invalid-body', 'bad'))).toMatchObject({ code: 'validation' });
  });

  it('enforces the caller-supplied export document ceiling', async () => {
    const adapter = createSessionRepositoryAdapter(repositoryPort({
      exportDocument: vi.fn().mockResolvedValue({ document: 'ééé' }),
    }), { maxExportDocumentBytes: 5 });

    await expect(adapter({ operation: 'export', sessionIds: [] })).resolves.toMatchObject({
      ok: false,
      operation: 'export',
      error: { code: 'size-limit', details: { size: 6, maximum: 5 } },
    });
  });

  it('rejects an invalid export policy when the dead adapter is constructed', () => {
    expect(() => createSessionRepositoryAdapter(repositoryPort(), { maxExportDocumentBytes: 0 }))
      .toThrow('positive safe integer');
  });
});
