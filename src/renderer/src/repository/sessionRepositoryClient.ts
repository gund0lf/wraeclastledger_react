import {
  SessionRepositoryRequestError,
  assertSessionRepositoryResponse,
  type SessionRepositoryDataMap,
  type SessionRepositoryError,
  type SessionRepositoryOperation,
  type SessionRepositoryRequest,
  type SessionRepositoryResponse,
} from '../../../shared/sessionRepositoryIpc';

export type SessionRepositoryTransport = (
  request: SessionRepositoryRequest,
) => Promise<SessionRepositoryResponse>;

type RequestFor<Operation extends SessionRepositoryOperation> = Extract<
  SessionRepositoryRequest,
  { operation: Operation }
>;

export class SessionRepositoryClientError extends Error {
  constructor(
    public readonly operation: SessionRepositoryOperation,
    public readonly repositoryError: SessionRepositoryError,
  ) {
    super(repositoryError.message);
    this.name = 'SessionRepositoryClientError';
  }
}

export interface SessionRepositoryClient {
  request<Operation extends SessionRepositoryOperation>(
    request: RequestFor<Operation>,
  ): Promise<SessionRepositoryDataMap[Operation]>;
}

/**
 * Renderer-side typed client. It has no window.api dependency, which keeps the
 * Phase 2 implementation dormant and independently testable until cutover.
 */
export function createSessionRepositoryClient(
  transport: SessionRepositoryTransport,
): SessionRepositoryClient {
  return {
    async request<Operation extends SessionRepositoryOperation>(
      request: RequestFor<Operation>,
    ): Promise<SessionRepositoryDataMap[Operation]> {
      const response = await transport(request);
      assertSessionRepositoryResponse(response);
      if (response.operation !== request.operation) {
        throw new SessionRepositoryRequestError(
          `response operation ${response.operation ?? 'null'} does not match ${request.operation}`,
        );
      }
      if (!response.ok) {
        throw new SessionRepositoryClientError(request.operation, response.error);
      }
      return response.data as SessionRepositoryDataMap[Operation];
    },
  };
}
