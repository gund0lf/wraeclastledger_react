import {
  GenerationConflictError,
  RecordSizeLimitError,
  RepositoryRecoveryRequiredError,
  UnsupportedContentVersionError,
} from './sessionRepositoryCore';
import { RecordValidationError } from '../shared/sessionRecord';
import {
  SessionRepositoryLockedError,
  SessionRepositoryMigrationRequiredError,
} from './sessionRepository';
import {
  SessionRepositoryRequestError,
  parseSessionRepositoryRequest,
  type SessionRepositoryDataMap,
  type SessionRepositoryError,
  type SessionRepositoryFailure,
  type SessionRepositoryOperation,
  type SessionRepositoryRequest,
  type SessionRepositoryResponse,
  type SessionRepositorySuccess,
} from '../shared/sessionRepositoryIpc';

type RequestFor<Operation extends SessionRepositoryOperation> = Extract<
  SessionRepositoryRequest,
  { operation: Operation }
>;

export interface SessionRepositoryPort {
  bootstrap(request: RequestFor<'bootstrap'>): Promise<SessionRepositoryDataMap['bootstrap']>;
  list(request: RequestFor<'list'>): Promise<SessionRepositoryDataMap['list']>;
  load(request: RequestFor<'load'>): Promise<SessionRepositoryDataMap['load']>;
  save(request: RequestFor<'save'>): Promise<SessionRepositoryDataMap['save']>;
  rename(request: RequestFor<'rename'>): Promise<SessionRepositoryDataMap['rename']>;
  delete(request: RequestFor<'delete'>): Promise<SessionRepositoryDataMap['delete']>;
  historyList(request: RequestFor<'history-list'>): Promise<SessionRepositoryDataMap['history-list']>;
  historyRestore(request: RequestFor<'history-restore'>): Promise<SessionRepositoryDataMap['history-restore']>;
  importDocument(request: RequestFor<'import'>): Promise<SessionRepositoryDataMap['import']>;
  exportDocument(request: RequestFor<'export'>): Promise<SessionRepositoryDataMap['export']>;
  retry(request: RequestFor<'retry'>): Promise<SessionRepositoryDataMap['retry']>;
  openDataFolder(request: RequestFor<'open-data-folder'>): Promise<SessionRepositoryDataMap['open-data-folder']>;
}

export interface SessionRepositoryAdapterPolicy {
  maxExportDocumentBytes: number;
}

export function mapSessionRepositoryError(error: unknown): SessionRepositoryError {
  if (error instanceof SessionRepositoryMigrationRequiredError) {
    return {
      code: 'migration-required',
      message: error.message,
      retryable: true,
      ...(error.identity ? { details: error.identity } : {}),
    };
  }
  if (error instanceof SessionRepositoryLockedError) {
    return {
      code: 'repository-locked',
      message: error.message,
      retryable: false,
      details: error.owner,
    };
  }
  if (error instanceof GenerationConflictError) {
    return {
      code: 'generation-conflict',
      message: error.message,
      retryable: true,
      details: { expected: error.expected, actual: error.actual },
    };
  }
  if (error instanceof RepositoryRecoveryRequiredError) {
    return { code: 'recovery-required', message: error.message, retryable: false, details: { status: error.status } };
  }
  if (error instanceof UnsupportedContentVersionError) {
    return {
      code: 'unsupported-version',
      message: error.message,
      retryable: false,
      details: { contentType: error.contentType, version: error.version, maximum: error.maximum },
    };
  }
  if (error instanceof RecordSizeLimitError) {
    return {
      code: 'size-limit',
      message: error.message,
      retryable: false,
      details: { size: error.size, maximum: error.maximum },
    };
  }
  if (error instanceof RecordValidationError || error instanceof SessionRepositoryRequestError) {
    return { code: error instanceof SessionRepositoryRequestError ? 'invalid-request' : 'validation', message: error.message, retryable: false };
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
  if (code === 'ENOENT') return { code: 'not-found', message, retryable: false };
  if (code) return { code: 'io-failure', message, retryable: true, details: { code } };
  return { code: 'unknown', message, retryable: false };
}

function success<Operation extends SessionRepositoryOperation>(
  operation: Operation,
  data: SessionRepositoryDataMap[Operation],
): SessionRepositorySuccess<Operation> {
  return { ok: true, operation, data } as SessionRepositorySuccess<Operation>;
}

async function execute(
  repository: SessionRepositoryPort,
  policy: SessionRepositoryAdapterPolicy,
  request: SessionRepositoryRequest,
): Promise<SessionRepositorySuccess> {
  switch (request.operation) {
    case 'bootstrap': return success(request.operation, await repository.bootstrap(request));
    case 'list': return success(request.operation, await repository.list(request));
    case 'load': return success(request.operation, await repository.load(request));
    case 'save': return success(request.operation, await repository.save(request));
    case 'rename': return success(request.operation, await repository.rename(request));
    case 'delete': return success(request.operation, await repository.delete(request));
    case 'history-list': return success(request.operation, await repository.historyList(request));
    case 'history-restore': return success(request.operation, await repository.historyRestore(request));
    case 'import': return success(request.operation, await repository.importDocument(request));
    case 'export': {
      const data = await repository.exportDocument(request);
      const size = Buffer.byteLength(data.document, 'utf8');
      if (size > policy.maxExportDocumentBytes) {
        throw new RecordSizeLimitError(size, policy.maxExportDocumentBytes);
      }
      return success(request.operation, data);
    }
    case 'retry': return success(request.operation, await repository.retry(request));
    case 'open-data-folder': return success(request.operation, await repository.openDataFolder(request));
  }
}

export function createSessionRepositoryAdapter(
  repository: SessionRepositoryPort,
  policy: SessionRepositoryAdapterPolicy,
) {
  if (!Number.isSafeInteger(policy.maxExportDocumentBytes) || policy.maxExportDocumentBytes <= 0) {
    throw new RangeError('maxExportDocumentBytes must be a positive safe integer');
  }
  return async (input: unknown): Promise<SessionRepositoryResponse> => {
    let request: SessionRepositoryRequest;
    try {
      request = parseSessionRepositoryRequest(input);
    } catch (error) {
      const failure: SessionRepositoryFailure = {
        ok: false,
        operation: null,
        error: mapSessionRepositoryError(error),
      };
      return failure;
    }
    try {
      return await execute(repository, policy, request);
    } catch (error) {
      return { ok: false, operation: request.operation, error: mapSessionRepositoryError(error) };
    }
  };
}

// The adapter is transport-independent; Phase 4 registers it once in main.
export type SessionRepositoryAdapter = ReturnType<typeof createSessionRepositoryAdapter>;
