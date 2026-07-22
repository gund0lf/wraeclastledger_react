import { describe, expect, it } from 'vitest';
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
import { mapSessionRepositoryError } from '../../../main/sessionRepositoryAdapter';

describe('WP14 repository IPC request contract', () => {
  it.each([
    { operation: 'bootstrap' },
    { operation: 'list' },
    { operation: 'load', target: { kind: 'working' } },
    { operation: 'save', target: { kind: 'session', sessionId: 'session-1' }, expectedGeneration: 2, payload: { maps: [] } },
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
});
